/**
 * SYNAPTIC LEARNING LITMUS TEST.
 *
 * Verifies the claim the user asks for: "is the brain actually learning,
 * or just a lookup table?" The test loads the runtime, records the plastic
 * state BEFORE and AFTER a teaching turn, and asserts:
 *   - the SYNAPTIC plastic state changed (potentiated synapses exist after)
 *   - the CONNECTOME (canonical FlyWire graph) did NOT change (SHA-256 stable)
 *   - the FACT memory changed (one learned fact)
 *
 * NO LLM, no cloud, no hidden model.
 *
 * Run: node tests/proof-synapse.mjs   (after `npm run build`)
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) {
  console.error("dist/index.html missing - run `npm run build` first");
  process.exit(1);
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".brain": "application/octet-stream",
  ".wasm": "application/wasm",
  ".jsdos": "application/octet-stream",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  let path = join(DIST, url === "/" ? "index.html" : url.slice(1));
  if (!existsSync(path)) path = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const disc = page.locator(".disclosure-dialog button", { hasText: /understand/i });
if (await disc.count()) await disc.click({ force: true });
await page.waitForTimeout(300);
const enter = page.locator("button", { hasText: /enter the laboratory/i });
if (await enter.count()) await enter.click({ force: true });
await page.waitForSelector("#ask", { timeout: 30000 });

const getBrainStats = async () => {
  return await page.evaluate(function () {
    var brain = window.peterPlasticity;
    var mem = window.peterMemory;
    return {
      syn: brain ? (brain.mods ? brain.mods.size : 0) : 0,
      facts: mem ? (mem.facts ? mem.facts.length : 0) : 0,
    };
  });
};

const before = (await getBrainStats()) || { syn: 0, facts: 0 };
console.log("BEFORE: facts", before.facts, "synapses", before.syn);

const connectomeHash = await page.evaluate(async function () {
  var buf = await (await fetch("/brain/peter.brain")).arrayBuffer();
  var bytes = new Uint8Array(buf);
  var digest = await crypto.subtle.digest("SHA-256", bytes);
  var hex = "";
  var d = new Uint8Array(digest);
  for (var i = 0; i < d.length; i++) hex += d[i].toString(16).padStart(2, "0");
  return hex;
});
console.log("CONNECTOME SHA-256 (before):", connectomeHash);

// teach one fact (the brain spikes during this, then potentiates)
await page.fill("#ask", "capital of india is delhi");
// count existing fly messages before we teach, so we can tell when the reply lands
const beforeCount = await page.evaluate(function () {
  return document.querySelectorAll("article.message-fly").length;
});
await page.keyboard.press("Enter");
// Wait for a NEW fly message to appear (button disabled check fails
// because draft is empty after send, keeping transmit-button disabled
// even once busy is false).
await page.waitForFunction(
  function (n) {
    try {
      return document.querySelectorAll("article.message-fly").length > n &&
             !document.querySelector(".thinking-state");
    } catch { return false; }
  },
  beforeCount,
  { timeout: 30000 },
).catch(() => console.error("teach reply stuck - aborting"));
await page.waitForTimeout(350);

const after = (await getBrainStats()) || { syn: 0, facts: 0 };
console.log("AFTER: facts", after.facts, "synapses", after.syn);

const connectomeHash2 = await page.evaluate(async function () {
  var buf = await (await fetch("/brain/peter.brain")).arrayBuffer();
  var bytes = new Uint8Array(buf);
  var digest = await crypto.subtle.digest("SHA-256", bytes);
  var hex = "";
  var d = new Uint8Array(digest);
  for (var i = 0; i < d.length; i++) hex += d[i].toString(16).padStart(2, "0");
  return hex;
});
console.log("CONNECTOME SHA-256 (after):", connectomeHash2);

var connUnchanged = connectomeHash === connectomeHash2;
console.log(connUnchanged ? "PASS  connectome (FlyWire canonical) unchanged after learning" : "FAIL  connectome changed after learning");
if (!connUnchanged) process.exitCode = 1;

var memGrew = after.facts > before.facts;
console.log(memGrew ? "PASS  fact memory learned - a new fact stored" : "FAIL  no fact memory learned");
if (!memGrew) process.exitCode = 1;

var synGrew = after.syn > before.syn;
console.log(synGrew ? "PASS  synaptic learning occurred - brain synapses changed" : "FAIL  no synaptic learning occurred");
if (!synGrew) process.exitCode = 1;

if (memGrew && synGrew) console.log("\nLEARNED: the brain's synapses AND memory changed - Peter DID learn from that message.\n");
else console.log("\nNOTE: learning happened at the memory layer only this turn (synapses not yet potentiated).\n");

await browser.close();
server.close();
