/**
 * DOOM 5-VARIANT CONTROLLED BENCHMARK
 * =====================================
 * Empirically compares:
 *   A. FlyWire Frozen + Bandit             (baseline bandit over fixed connectome)
 *   B. FlyWire Plastic (R-STDP) + No Bandit (pure neural readout, plastic weights)
 *   C. FlyWire Plastic (R-STDP) + Bandit   (plastic connectome + bandit)
 *   D. Random Reservoir + Bandit           (control: shuffled edges, bandit only)
 *   E. Random Reservoir + No Learning      (null: shuffled edges, random actions)
 *
 * KEY ABLATION:
 *   If (C > A) → bandit over FlyWire benefits from plasticity
 *   If (A > D) → FlyWire topology matters (even frozen)
 *   If (B > E) → R-STDP alone (without bandit) confers advantage
 *   If (C > B) → bandit complements neural plasticity
 *
 * Run: node tests/proof-doom-benchmark.mjs
 * (does NOT require a browser or built dist)
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---- Load compiled brain bundle ----
const { parseBrainBundle, freshRStdpState, simulateBrain } = await import("./.agi.bundle.mjs");

// ---- Load real FlyWire brain file ----
const brainPath = join(ROOT, "public", "brain", "peter.brain");
if (!existsSync(brainPath)) {
  console.error("peter.brain not found at:", brainPath);
  process.exit(1);
}
const brainBuffer = readFileSync(brainPath).buffer.slice(
  readFileSync(brainPath).byteOffset,
  readFileSync(brainPath).byteOffset + readFileSync(brainPath).byteLength
);
const bundle = parseBrainBundle(brainBuffer);
console.log(`Brain loaded: ${bundle.neuronCount} neurons, ${bundle.edgeCount} edges`);
console.log(`  Input pool: ${bundle.inputRows.length} neurons`);
console.log(`  Readout pool: ${bundle.readoutRows.length} neurons`);
console.log();

// ===========================================================================
// DOOM CONSTANTS (parity with src/brain/doom.ts)
// ===========================================================================
const SECTORS = [[13, 19], [7, 13], [19, 25], [0, 8], [24, 32]];
const HORIZON_Y0 = 70;
const HORIZON_Y1 = 190;
const NUM_SECTORS = 5;
const SECTOR_BASE_HZ = 3.0;
const SECTOR_BRIGHT_HZ = 30.0;
const MAX_RATE_HZ = 80.0;
const DOOM_SIM_MS = 600;
const ARM_BINS = [2, 3, 4, 5];
const ARM_THRESHOLD = 1.0;
const ALPHA = 0.2;
const EPS_START = 0.3;
const EPS_DECAY = 0.995;
const EPS_MIN = 0.05;
const ACTIONS = ["TURN_LEFT", "TURN_RIGHT", "FORWARD", "SHOOT"];

// R-STDP constants (parity with src/brain/rstdp.ts)
const TAU_PLUS_MS = 20.0;
const TAU_MINUS_MS = 25.0;
const A_PLUS = 1.0;
const A_MINUS = 0.85;
const TAU_ELIGIBILITY_MS = 200.0;
const ETA_LEARNING = 0.045;
const MIN_MODIFIER = 0.25;
const MAX_MODIFIER = 2.50;
const MAX_STORED_SYNAPSES = 50_000;

// ===========================================================================
// DOOM HELPERS
// ===========================================================================

function sectorRows(bundle, sector) {
  const rows = [];
  for (let i = sector; i < bundle.inputRows.length; i += NUM_SECTORS) {
    rows.push(bundle.inputRows[i]);
  }
  return rows;
}

function stimulusForFrame(bright, bundle) {
  const rows = [];
  const rates = [];
  for (let s = 0; s < NUM_SECTORS; s++) {
    const rate = Math.min(MAX_RATE_HZ, SECTOR_BASE_HZ + SECTOR_BRIGHT_HZ * bright[s]);
    for (const row of sectorRows(bundle, s)) {
      rows.push(row);
      rates.push(rate);
    }
  }
  return {
    rows: Uint32Array.from(rows),
    rates: Float64Array.from(rates),
  };
}

function modifiersToGains(modifiers, edgeCount) {
  const gains = new Float64Array(edgeCount).fill(1.0);
  modifiers.forEach((mod, edgeIdx) => {
    if (edgeIdx < edgeCount) gains[edgeIdx] = mod;
  });
  return gains;
}

function doomArms(bright, useBundle, seed, edgeGains) {
  const stim = stimulusForFrame(bright, useBundle);
  const sim = simulateBrain(useBundle, stim.rows, stim.rates, seed, DOOM_SIM_MS, edgeGains ?? undefined);
  const perBin = Math.floor(sim.steps / sim.binCounts.length);
  const counts = new Float64Array(ARM_BINS.length);
  for (let a = 0; a < ARM_BINS.length; a++) {
    const bin = ARM_BINS[a];
    let sum = 0;
    for (let sIdx = bin * perBin; sIdx < (bin + 1) * perBin; sIdx++) {
      const step = sim.spikes[sIdx];
      for (const r of bundle.readoutRows) sum += step[r];
    }
    counts[a] = sum;
  }
  const fire = Array.from(counts, (c) => c > ARM_THRESHOLD);
  return { counts, fire, sim };
}

// ===========================================================================
// R-STDP HELPERS
// ===========================================================================

function stdpKernel(dtMs) {
  if (dtMs > 0 && dtMs < 60) return A_PLUS * Math.exp(-dtMs / TAU_PLUS_MS);
  if (dtMs < 0 && dtMs > -60) return -A_MINUS * Math.exp(dtMs / TAU_MINUS_MS);
  return 0.0;
}

function computeEligibilityTraces(useBundle, sim, simDurationMs) {
  const traces = new Map();
  const stepCount = sim.spikes.length;
  if (stepCount === 0) return traces;

  // Build spike time map
  const spikeTimes = new Map();
  for (let s = 0; s < stepCount; s++) {
    const step = sim.spikes[s];
    for (let n = 0; n < step.length; n++) {
      if (step[n] === 1) {
        const times = spikeTimes.get(n) ?? [];
        times.push(s);
        spikeTimes.set(n, times);
      }
    }
  }

  const edgeCount = useBundle.edgeCount;
  const srcArr = useBundle.edgesSrc;
  const tgtArr = useBundle.edgesTgt;

  for (let e = 0; e < edgeCount; e++) {
    const src = srcArr[e];
    const tgt = tgtArr[e];
    const preTimes = spikeTimes.get(src);
    const postTimes = spikeTimes.get(tgt);
    if (!preTimes || !postTimes) continue;

    let traceVal = 0.0;
    for (let i = 0; i < preTimes.length; i++) {
      const tPre = preTimes[i] * 0.5; // DT = 0.5ms
      for (let j = 0; j < postTimes.length; j++) {
        const tPost = postTimes[j] * 0.5;
        const dt = tPost - tPre;
        const k = stdpKernel(dt);
        if (Math.abs(k) > 0.01) {
          const tPair = Math.max(tPre, tPost);
          const timeToReward = Math.max(0, simDurationMs - tPair);
          const decay = Math.exp(-timeToReward / TAU_ELIGIBILITY_MS);
          traceVal += k * decay;
        }
      }
    }
    if (Math.abs(traceVal) > 0.005) {
      traces.set(e, Math.max(-2.0, Math.min(2.0, traceVal)));
    }
  }
  return traces;
}

function applyRewardModulation(state, traces, reward) {
  const nextMods = new Map(state.modifiers);
  const pe = reward - state.rewardBaseline;
  let potentiatedCount = 0;
  let depressedCount = 0;
  let totalDelta = 0.0;

  traces.forEach((eligibility, edgeIdx) => {
    const delta = ETA_LEARNING * pe * eligibility;
    const absDelta = Math.abs(delta);
    if (absDelta > 0.0001) {
      const current = nextMods.get(edgeIdx) ?? 1.0;
      const updated = Math.max(MIN_MODIFIER, Math.min(MAX_MODIFIER, current + delta));
      nextMods.set(edgeIdx, updated);
      if (delta > 0) potentiatedCount++;
      else depressedCount++;
      totalDelta += absDelta;
    }
  });

  if (nextMods.size > MAX_STORED_SYNAPSES) {
    const sorted = Array.from(nextMods.entries()).sort(
      (a, b) => Math.abs(b[1] - 1.0) - Math.abs(a[1] - 1.0)
    );
    nextMods.clear();
    for (let i = 0; i < MAX_STORED_SYNAPSES; i++) {
      nextMods.set(sorted[i][0], sorted[i][1]);
    }
  }

  const modifiedCount = potentiatedCount + depressedCount;
  const newBaseline = state.rewardBaseline * 0.9 + reward * 0.1;
  const meanDelta = modifiedCount > 0 ? totalDelta / modifiedCount : 0.0;

  const nextState = {
    modifiers: nextMods,
    readoutWeights: state.readoutWeights,
    eligibilityBuffer: traces,
    rewardBaseline: newBaseline,
    episodesCount: state.episodesCount + 1,
    schemaVersion: state.schemaVersion,
  };

  return { nextState, modifiedCount, meanDelta, potentiatedCount, depressedCount };
}

// ===========================================================================
// BANDIT
// ===========================================================================

function freshPolicy() {
  return { q: [0, 0, 0, 0], n: [0, 0, 0, 0], updates: 0, decisions: 0 };
}

function policyRand(a, b) {
  let v = (Math.imul(a >>> 0, 7919) + (b >>> 0)) >>> 0;
  let w = 0x9e3779b9 >>> 0;
  v = (Math.imul(v, 1664525) + 1013904223) >>> 0;
  w = (Math.imul(w, 1664525) + 1013904223) >>> 0;
  let x = (v ^ w) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x2c1b3c6d);
  x = (x ^ (x >>> 12)) >>> 0;
  x = Math.imul(x, 0x297a2d39);
  x = (x ^ (x >>> 15)) >>> 0;
  return x >>> 0;
}

function epsilonOf(policy) {
  return Math.max(EPS_MIN, EPS_START * Math.pow(EPS_DECAY, policy.updates));
}

function chooseAction(arms, policy) {
  const eps = epsilonOf(policy);
  const r = (policyRand(policy.decisions, policy.updates) % 100000) / 100000;
  if (r < eps) {
    return policyRand(policy.decisions + 1, policy.updates) % ACTIONS.length;
  }
  let best = 0;
  let bestScore = -Infinity;
  for (let a = 0; a < ACTIONS.length; a++) {
    const score = arms.fire[a] ? policy.q[a] : policy.q[a] - 0.5;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}

function chooseNeuralAction(arms) {
  let best = 0;
  let maxCount = -1;
  for (let a = 0; a < arms.counts.length; a++) {
    if (arms.counts[a] > maxCount) { maxCount = arms.counts[a]; best = a; }
  }
  return best;
}

function learnBandit(policy, action, reward) {
  const next = { ...policy, q: [...policy.q], n: [...policy.n] };
  next.n[action] += 1;
  next.q[action] += ALPHA * (reward - next.q[action]);
  next.updates += 1;
  next.decisions += 1;
  return next;
}

// ===========================================================================
// ENVIRONMENT MODEL (deterministic synthetic DOOM-like)
// ===========================================================================

function getEnvironmentReward(bright, action) {
  if (bright[0] > 0.6) {
    // Hazard dead ahead
    if (action === 2) return -1.0;          // FORWARD into hazard → damage
    if (action === 0 || action === 1) return 0.5; // Turn away → avoid
    return 0.0;
  } else if (bright[1] > 0.5 || bright[2] > 0.5) {
    // Item in peripheral view
    if (action === 2) return 1.0;           // FORWARD → pickup
    return 0.0;
  } else {
    return action === 2 ? 0.2 : -0.1;      // Free field
  }
}

// ===========================================================================
// BENCHMARK RUNNER
// ===========================================================================

const STEPS_COUNT = 60;  // steps per variant

// Build deterministic frame sequence
const frames = [];
let frameRng = 421337;
for (let s = 0; s < STEPS_COUNT; s++) {
  const b = new Float64Array(NUM_SECTORS);
  for (let sec = 0; sec < NUM_SECTORS; sec++) {
    frameRng = (Math.imul(frameRng, 1664525) + 1013904223) >>> 0;
    b[sec] = (frameRng % 1000) / 1000;
  }
  frames.push(b);
}

// Build random reservoir (Erdos-Renyi rewiring of FlyWire topology)
const randBundle = {
  ...bundle,
  edgesSrc: new Int32Array(bundle.edgeCount),
  edgesTgt: new Int32Array(bundle.edgeCount),
};
let rSeed = 7777;
for (let i = 0; i < bundle.edgeCount; i++) {
  rSeed = (Math.imul(rSeed, 1664525) + 1013904223) >>> 0;
  randBundle.edgesSrc[i] = rSeed % bundle.neuronCount;
  rSeed = (Math.imul(rSeed, 1664525) + 1013904223) >>> 0;
  randBundle.edgesTgt[i] = rSeed % bundle.neuronCount;
}

function runVariant(variantName, label, useBundle, plasticity, bandit, nullPolicy) {
  let rstdp = freshRStdpState();
  let pol = freshPolicy();
  let totalReward = 0;
  let damageEvents = 0;
  let pickupEvents = 0;
  let avoidEvents = 0;
  const actionCounts = [0, 0, 0, 0];
  let totalSynPotentiated = 0;
  let totalSynDepressed = 0;
  let totalModifiedCount = 0;
  let totalMeanDelta = 0;
  let totalTraceSynapses = 0;

  const stepLog = [];

  for (let step = 0; step < STEPS_COUNT; step++) {
    const bright = frames[step];
    const gains = plasticity ? modifiersToGains(rstdp.modifiers, useBundle.edgeCount) : null;
    const arms = doomArms(bright, useBundle, 1000 + step, gains);

    let action;
    if (nullPolicy) {
      action = step % ACTIONS.length;
    } else if (!bandit) {
      action = chooseNeuralAction(arms);
    } else {
      action = chooseAction(arms, pol);
    }
    actionCounts[action]++;

    const reward = getEnvironmentReward(bright, action);
    if (reward === -1.0) damageEvents++;
    if (reward === 1.0) pickupEvents++;
    if (reward === 0.5) avoidEvents++;
    totalReward += reward;

    // Update plasticity
    let synMod = 0;
    let meanD = 0;
    let potCount = 0;
    let depCount = 0;
    let traceCount = 0;
    if (plasticity) {
      const traces = computeEligibilityTraces(useBundle, arms.sim, DOOM_SIM_MS);
      traceCount = traces.size;
      const result = applyRewardModulation(rstdp, traces, reward);
      rstdp = result.nextState;
      synMod = result.modifiedCount;
      meanD = result.meanDelta;
      potCount = result.potentiatedCount;
      depCount = result.depressedCount;
      totalSynPotentiated += potCount;
      totalSynDepressed += depCount;
      totalModifiedCount += synMod;
      totalMeanDelta += meanD * synMod;
    }
    totalTraceSynapses += traceCount;

    if (bandit) {
      pol = learnBandit(pol, action, reward);
    }

    stepLog.push({
      step,
      action: ACTIONS[action],
      reward,
      armFire: arms.fire,
      synMod,
      traceCount,
    });
  }

  return {
    variant: variantName,
    name: label,
    totalReward: Math.round(totalReward * 100) / 100,
    damageEvents,
    pickupEvents,
    avoidEvents,
    actionCounts,
    finalBanditQ: bandit ? pol.q.map((q) => Math.round(q * 1000) / 1000) : null,
    modifiedSynapses: rstdp.modifiers.size,
    totalModifiedPerStep: totalModifiedCount / STEPS_COUNT,
    meanWeightDelta: totalModifiedCount > 0 ? totalMeanDelta / totalModifiedCount : 0,
    potentiatedTotal: totalSynPotentiated,
    depressedTotal: totalSynDepressed,
    meanTraceSynapsesPerStep: totalTraceSynapses / STEPS_COUNT,
    stepLog,
  };
}

// ===========================================================================
// RUN ALL VARIANTS
// ===========================================================================

console.log(`Running 5-variant controlled DOOM benchmark (${STEPS_COUNT} steps each)...\n`);

const t0 = Date.now();
const results = {
  A: runVariant("A", "FlyWire Frozen + Bandit", bundle, false, true, false),
  B: runVariant("B", "FlyWire Plastic (R-STDP) + No Bandit", bundle, true, false, false),
  C: runVariant("C", "FlyWire Plastic (R-STDP) + Bandit", bundle, true, true, false),
  D: runVariant("D", "Random Reservoir + Bandit", randBundle, false, true, false),
  E: runVariant("E", "Random Reservoir + No Learning (null)", randBundle, false, false, true),
};
const elapsed = Date.now() - t0;

// ===========================================================================
// REPORT
// ===========================================================================

console.log("═".repeat(72));
console.log("PETER THE FLY — DOOM CONTROLLED BENCHMARK REPORT");
console.log("═".repeat(72));
console.log(`Brain: ${bundle.neuronCount} neurons, ${bundle.edgeCount} edges`);
console.log(`Steps per variant: ${STEPS_COUNT}`);
console.log(`Elapsed: ${elapsed}ms`);
console.log();

console.log("─".repeat(72));
console.log("VARIANT RESULTS TABLE");
console.log("─".repeat(72));
console.log(
  "Var  | Name                                  | Reward | Pickup | Damage | Avoid"
);
console.log(
  "─────|───────────────────────────────────────|────────|────────|────────|───────"
);
for (const [k, r] of Object.entries(results)) {
  const row = `  ${k}  | ${r.name.padEnd(37)} | ${String(r.totalReward).padStart(6)} | ${String(r.pickupEvents).padStart(6)} | ${String(r.damageEvents).padStart(6)} | ${String(r.avoidEvents).padStart(5)}`;
  console.log(row);
}
console.log();

console.log("─".repeat(72));
console.log("SYNAPTIC PLASTICITY METRICS (plastic variants only)");
console.log("─".repeat(72));
for (const [k, r] of Object.entries(results)) {
  if (r.modifiedSynapses > 0 || r.potentiatedTotal > 0) {
    console.log(`Variant ${k}: ${r.name}`);
    console.log(`  Synapses modified (total stored): ${r.modifiedSynapses}`);
    console.log(`  Potentiated (total): ${r.potentiatedTotal}`);
    console.log(`  Depressed (total):   ${r.depressedTotal}`);
    console.log(`  Mean |Δw| per modified synapse: ${r.meanWeightDelta.toFixed(6)}`);
    console.log(`  Mean modifications/step: ${r.totalModifiedPerStep.toFixed(1)}`);
    console.log(`  Mean eligible synapses/step: ${r.meanTraceSynapsesPerStep.toFixed(1)}`);
    console.log();
  }
}

console.log("─".repeat(72));
console.log("ACTION DISTRIBUTIONS");
console.log("─".repeat(72));
for (const [k, r] of Object.entries(results)) {
  const actionStr = ACTIONS.map((a, i) => `${a}=${r.actionCounts[i]}`).join(" ");
  console.log(`Variant ${k}: ${actionStr}`);
  if (r.finalBanditQ) {
    const qStr = ACTIONS.map((a, i) => `${a}=${r.finalBanditQ[i].toFixed(3)}`).join(" ");
    console.log(`  Bandit Q: ${qStr}`);
  }
}
console.log();

// ===========================================================================
// ABLATION ANALYSIS
// ===========================================================================

console.log("═".repeat(72));
console.log("ABLATION ANALYSIS");
console.log("═".repeat(72));

const ra = results.A.totalReward;
const rb = results.B.totalReward;
const rc = results.C.totalReward;
const rd = results.D.totalReward;
const re = results.E.totalReward;

const nullPerf = re; // baseline for everything

function pctAbove(val, base) {
  if (base === 0) return val > 0 ? "+∞%" : "0%";
  return ((val - base) / Math.abs(base) * 100).toFixed(1) + "%";
}

console.log(`Null baseline (E): ${re}`);
console.log();
console.log(`A (FlyWire Frozen + Bandit)        vs E: ${pctAbove(ra, re)} | reward ${ra}`);
console.log(`B (FlyWire Plastic + No Bandit)    vs E: ${pctAbove(rb, re)} | reward ${rb}`);
console.log(`C (FlyWire Plastic + Bandit)       vs E: ${pctAbove(rc, re)} | reward ${rc}`);
console.log(`D (Random Reservoir + Bandit)      vs E: ${pctAbove(rd, re)} | reward ${rd}`);
console.log();
console.log(`Plasticity effect (C vs A):        ${pctAbove(rc, ra)}  (R-STDP added to bandit)`);
console.log(`FlyWire topology effect (A vs D):  ${pctAbove(ra, rd)}  (FlyWire vs random, bandit-only)`);
console.log(`R-STDP alone effect (B vs E):      ${pctAbove(rb, re)}  (plastic neural vs null)`);
console.log(`Bandit over FlyWire (A vs B):      ${pctAbove(ra, rb)}  (bandit vs pure neural readout)`);
console.log();

// ===========================================================================
// SCIENTIFIC CONCLUSION
// ===========================================================================

console.log("═".repeat(72));
console.log("SCIENTIFIC CONCLUSION");
console.log("═".repeat(72));

const flywireTopologyEffect = ra - rd;      // A > D: FlyWire topology matters
const plasticityEffect = rc - ra;           // C > A: R-STDP adds over bandit
const rstdpAloneEffect = rb - re;           // B > E: R-STDP alone beats null
const banditHelps = ra - rb;               // A > B: bandit over pure neural

const THRESH = 0.5; // minimum reward delta to claim effect

let conclusion;
const evidence = [];

if (rstdpAloneEffect > THRESH) {
  evidence.push(`R-STDP alone (B vs E): +${rstdpAloneEffect.toFixed(2)} reward → PLASTIC NEURONS OUTPERFORM NULL`);
}
if (flywireTopologyEffect > THRESH) {
  evidence.push(`FlyWire topology (A vs D): +${flywireTopologyEffect.toFixed(2)} → CONNECTOME STRUCTURE MATTERS`);
}
if (plasticityEffect > THRESH) {
  evidence.push(`Plasticity + Bandit (C vs A): +${plasticityEffect.toFixed(2)} → R-STDP ENHANCES BANDIT`);
}
if (rstdpAloneEffect < -THRESH) {
  evidence.push(`R-STDP alone (B vs E): ${rstdpAloneEffect.toFixed(2)} reward → PLASTIC NEURONS UNDERPERFORM NULL`);
}

// Determine conclusion
const positiveEvidence = rstdpAloneEffect > THRESH || plasticityEffect > THRESH;
const negativeEvidence = rstdpAloneEffect < -THRESH && plasticityEffect < -THRESH;
const topologyDemonstrated = flywireTopologyEffect > THRESH;

if (positiveEvidence && topologyDemonstrated) {
  conclusion = "FLYWIRE LEARNING DEMONSTRATED";
} else if (negativeEvidence) {
  conclusion = "FLYWIRE LEARNING NOT DEMONSTRATED";
} else {
  conclusion = "INCONCLUSIVE";
}

console.log();
console.log(`CONCLUSION: ${conclusion}`);
console.log();
if (evidence.length > 0) {
  console.log("Evidence:");
  for (const e of evidence) console.log(`  • ${e}`);
} else {
  console.log("Evidence: No effect above threshold (±0.5 reward units).");
}
console.log();

console.log("MECHANISTIC VERIFICATION:");
const bHasPlasticity = results.B.modifiedSynapses > 0;
const bHasTraces = results.B.meanTraceSynapsesPerStep > 0;
const cHasPlasticity = results.C.modifiedSynapses > 0;

if (bHasTraces && bHasPlasticity) {
  console.log(`  ✓ R-STDP spike traces COMPUTED (mean ${results.B.meanTraceSynapsesPerStep.toFixed(0)} eligible synapses/step)`);
  console.log(`  ✓ Synaptic modifiers UPDATED (${results.B.modifiedSynapses} synapses modified after ${STEPS_COUNT} steps)`);
  console.log(`  ✓ Potentiation vs Depression: ${results.B.potentiatedTotal} vs ${results.B.depressedTotal}`);
  console.log(`  ✓ Mean |Δw|: ${results.B.meanWeightDelta.toFixed(6)}`);
  console.log("  → The R-STDP mechanism IS MECHANISTICALLY FUNCTIONAL (traces computed, weights changed).");
} else {
  console.log("  ✗ R-STDP traces were NOT computed or synapses not modified.");
  console.log("  → Plasticity mechanism may not be engaging the network spiking.");
}

if (results.A.modifiedSynapses === 0 && results.D.modifiedSynapses === 0) {
  console.log("  ✓ Frozen/Random variants correctly show 0 modified synapses.");
}
console.log();

console.log("ABLATION LOGIC:");
if (flywireTopologyEffect === 0) {
  console.log("  FlyWire topology shows NO advantage over random. The connectome structure");
  console.log("  does not provide a measurable signal for this task.");
} else if (flywireTopologyEffect > 0) {
  console.log(`  FlyWire topology provides +${flywireTopologyEffect.toFixed(2)} reward over random reservoir.`);
} else {
  console.log(`  Random reservoir OUTPERFORMED FlyWire by ${Math.abs(flywireTopologyEffect).toFixed(2)} reward. Unexpected.`);
}

console.log("═".repeat(72));
console.log();

process.exit(0);
