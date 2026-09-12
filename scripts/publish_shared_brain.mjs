/**
 * Publish the owner's trained brain to ALL visitors.
 *
 * Run this AFTER teaching Peter on your local machine (the facts live in
 * your browser's localStorage under "peter-memory-v1"). It asks for the
 * JSON export and writes public/brain/peter.shared.json, which ships with
 * the site so every visitor starts from the trained brain.
 *
 * Simpler path: in the browser console on the live site, run
 *   copy(localStorage.getItem("peter-memory-v1"))
 * then paste the clipboard contents here (or into the file below).
 *
 * Usage: node scripts/publish_shared_brain.mjs ['paste the JSON here']
 */
import { readFileSync, writeFileSync } from "node:fs";

const arg = process.argv[2];
const fileArg = process.argv[3];

let raw = arg;
if (!raw && fileArg) raw = readFileSync(fileArg, "utf8");
if (!raw) {
  console.error("Usage: node scripts/publish_shared_brain.mjs '<localStorage JSON>'");
  console.error('Get it with: copy(localStorage.getItem("peter-memory-v1")) in the browser console.');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.error("Not valid JSON:", String(e).slice(0, 120));
  process.exit(1);
}

// Basic validation mirror of the runtime gates.
const FIELD_OK = /^[a-z0-9][a-z0-9' -]{0,39}$/;
const FORBIDDEN = /[<>{}$=;`[\]\\|]|javascript:|data:|https?:|www\.|@|\/\/|--/;
const INJECTION = new Set(["ignore","disregard","instructions","prompt","system","admin","root","sudo","eval","function","import","require","fetch","window","document","console","alert","token","key","password","secret","api","env","process","script"]);

function ok(w) {
  return typeof w === "string" && FIELD_OK.test(w) && !FORBIDDEN.test(w) &&
    !w.split(" ").some((x) => INJECTION.has(x)) && /\p{L}/u.test(w);
}

if (!Array.isArray(parsed.facts)) {
  console.error("No facts array found.");
  process.exit(1);
}

const kept = [];
for (const f of parsed.facts) {
  if (ok(f.subj) && ok(f.rel) && ok(f.obj) &&
      Number.isFinite(f.conf) && f.conf >= 0 && f.conf <= 1 &&
      Number.isFinite(f.rein)) {
    kept.push({
      subj: f.subj, rel: f.rel, obj: f.obj,
      conf: f.conf, rein: f.rein, src: "SHARED", ts: f.ts ?? Date.now(),
      ...(f.trace ? { trace: f.trace } : {}),
    });
  } else {
    console.log("rejected:", JSON.stringify(f).slice(0, 90));
  }
}

const out = { facts: kept, schemaVersion: 1, updatedAt: Date.now() };
writeFileSync(new URL("../public/brain/peter.shared.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote public/brain/peter.shared.json with ${kept.length} validated fact(s).`);
console.log("Commit + push, and every visitor now starts from this trained brain.");
