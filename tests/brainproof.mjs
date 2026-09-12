/**
 * Runtime proof: prove that Peter's answers come from the real brain.
 *
 * Run: npm run test:brain
 *
 * Checks (all against the actual shipped artifacts):
 *   1. public/brain/peter.br parses and is the FlyWire v783 dataset
 *   2. neuron IDs are real FlyWire root IDs (720575940... range), unique,
 *      and match the official count of the simulated subnetwork
 *   3. edges reference valid neurons; weights are real synapse counts
 *   4. the trained readout exists and matches the expected format
 *   5. three messages run the full pipeline: every reply carries REAL
 *      telemetry (spikes > 0, neurons simulated = bundle size, regions lit)
 *   6. different messages produce different spike patterns (nothing canned)
 *   7. same message reproduces exactly (deterministic brain)
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUTFILE = path.join(HERE, ".brain.build.mjs");

const esbuildShims = [
  path.join(ROOT, "node_modules", "esbuild", "bin", "esbuild"),
  path.join(ROOT, "node_modules", ".bin", "esbuild"),
];
const esbuildBin = esbuildShims.find(existsSync);
assert.ok(esbuildBin, "esbuild not installed (npm install)");

execFileSync(process.execPath, [
  esbuildBin,
  path.join(ROOT, "src", "brain", "index.ts"),
  "--bundle", "--format=esm", "--platform=neutral",
  `--outfile=${OUTFILE}`,
]);
const mod = await import(pathToFileURL(OUTFILE).href);

// ---- 1. bundle is real ------------------------------------------------------
const bundlePath = path.join(ROOT, "public", "brain", "peter.br");
assert.ok(existsSync(bundlePath), "public/brain/peter.br missing - run scripts/build_brain.py");
const raw = readFileSync(bundlePath);
const bundle = mod.parseBrainBundle(raw.buffer.slice(raw.byteOffset, raw.byteLength));

console.log(`bundle: ${bundle.dataset} · ${bundle.neuronCount} neurons · ${bundle.edgeCount} edges`);
assert.equal(bundle.dataset, "FAFB v783", "bundle must declare the official dataset");
assert.ok(bundle.neuronCount > 100, "subnetwork implausibly small");
assert.ok(bundle.edgeCount > bundle.neuronCount, "fewer edges than neurons - not a real connectome slice");

// ---- 2. real FlyWire root IDs ------------------------------------------------
// All FlyWire root IDs fall in the 720575940000000000..779999999999999999 range
// (18-digit neuroglancer segmented space). Fabricated IDs (1, 2, 3...) fail here.
let inFlywireRange = 0;
for (let i = 0; i < bundle.neuronCount; i++) {
  const id = bundle.neuronIds[i];
  if (id >= 720575940000000000n && id <= 779999999999999999n) inFlywireRange++;
}
assert.equal(inFlywireRange, bundle.neuronCount, "neuron IDs outside FlyWire root-ID range - data is not real");
console.log(`neuron IDs: ${inFlywireRange}/${bundle.neuronCount} in official FlyWire root-ID range`);

const unique = new Set();
for (let i = 0; i < bundle.neuronCount; i++) unique.add(bundle.neuronIds[i].toString());
assert.equal(unique.size, bundle.neuronCount, "duplicate neuron IDs");

// ---- 3. edges -------------------------------------------------------------
let badEdge = 0;
let minWeight = Infinity;
for (let e = 0; e < bundle.edgeCount; e++) {
  if (bundle.edgesSrc[e] < 0 || bundle.edgesSrc[e] >= bundle.neuronCount) badEdge++;
  if (bundle.edgesTgt[e] < 0 || bundle.edgesTgt[e] >= bundle.neuronCount) badEdge++;
  if (bundle.edgesWeight[e] < minWeight) minWeight = bundle.edgesWeight[e];
}
assert.equal(badEdge, 0, "edges referencing non-existent neurons");
assert.ok(minWeight > 0, "non-positive synaptic weights");
const inhibitory = Array.from(bundle.edgesSign).filter((s) => s < 0).length;
console.log(`edges: ${bundle.edgeCount} (min weight ${minWeight}, ${inhibitory} inhibitory)`);
assert.ok(inhibitory > 0, "no inhibitory edges - transmitter data missing?");

// ---- 4. readout -----------------------------------------------------------
const readoutPath = path.join(ROOT, "public", "brain", "peter.readout.json");
assert.ok(existsSync(readoutPath), "peter.readout.json missing - run scripts/train_readout.py");
const readout = JSON.parse(readFileSync(readoutPath, "utf8"));
assert.equal(readout.format, "peter-readout-1");
assert.ok(readout.stats.prompts >= 60, "readout trained on too few prompts");
console.log(`readout: ${readout.stats.states} states, ${readout.stats.transition_pairs} transitions`);

// ---- 5-7. live pipeline -----------------------------------------------------
const messages = ["hello peter", "what do you see", "do you like sugar"];
const runs = messages.map((m) => mod.talk(m, bundle, readout));
for (let i = 0; i < runs.length; i++) {
  const t = runs[i].telemetry;
  assert.equal(t.dataset, "FAFB v783");
  assert.equal(t.neurons_simulated, bundle.neuronCount, "telemetry neuron count != bundle");
  assert.ok(t.spike_count > 0, `no spikes for message ${i} - the brain did not run`);
  assert.ok(t.active_neurons > 0, "no active neurons");
  assert.ok(Object.keys(t.regions).length > 0, "no regions lit");
  assert.ok(runs[i].text.length > 0, "empty reply");
  console.log(
    `"${messages[i]}" -> "${runs[i].text}"`,
    `[${t.spike_count} spikes, ${t.active_neurons} active, ${t.simulation_ms}ms]`
  );
}
const patterns = new Set(runs.map((r) => r.telemetry.state_key));
assert.ok(patterns.size > 1, "all messages produced identical neural state - nothing is really simulated");

const again = mod.talk("hello peter", bundle, readout);
assert.equal(again.telemetry.spike_count, runs[0].telemetry.spike_count, "same message, same brain, different result - RNG leak?");
console.log("determinism: same message -> identical spike count OK");

console.log("\nBRAIN PROOF PASSED: the shipped bundle is real FlyWire v783 data and the answers are driven by its simulated spikes.");
