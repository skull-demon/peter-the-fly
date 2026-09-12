/**
 * TS runtime tests (run with: npm run test:web / node --test tests/brain.test.mjs)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const esbuildShims = [
  path.join(ROOT, "node_modules", "esbuild", "bin", "esbuild"),
  path.join(ROOT, "node_modules", ".bin", "esbuild"),
];
const esbuildBin = esbuildShims.find(existsSync);

const OUTFILE = path.join(HERE, ".brain.build.mjs");

test("brain runtime module compiles", () => {
  assert.ok(esbuildBin, "esbuild not installed");
  execFileSync(process.execPath, [
    esbuildBin,
    path.join(ROOT, "src", "brain", "index.ts"),
    "--bundle", "--format=esm", "--platform=neutral",
    `--outfile=${OUTFILE}`,
  ]);
  assert.ok(existsSync(OUTFILE));
});

const mod = await import(pathToFileURL(OUTFILE).href);

test("fnv1a32 known vectors", () => {
  assert.equal(mod.fnv1a32(""), 0x811c9dc5);
  assert.equal(mod.fnv1a32("a"), 0xe40c292c);
  assert.equal(mod.fnv1a32("foobar"), 0xbf9cf968);
});

test("bundle parser rejects bad magic", () => {
  const fake = new ArrayBuffer(64);
  new Uint8Array(fake).set([0x4e, 0x4f, 0x54, 0x41, 0x42, 0x52, 0x41, 0x49]); // "NOTABRAIN"
  assert.throws(() => mod.parseBrainBundle(fake), /bad magic/);
});
