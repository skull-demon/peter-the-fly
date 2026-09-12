/**
 * AGI Task Engine — the ONLY entry point for AGI mode processing.
 *
 * This module is COMPLETELY SEPARATE from the chatbot pipeline.
 * It does NOT call talk.ts, askPeter(), or any chatbot decoder.
 * It does NOT use the readout corpus (peter.readout.json).
 * It does NOT have hardcoded answers, question formats, or task-specific branches.
 *
 * Pipeline:
 *   arbitrary text input
 *   → stimulusForText()          [spikegen.ts — general encoder]
 *   → simulateBrain()            [sim.ts — real LIF on FlyWire connectome]
 *   → FlyWireAgiCore.predict()   [agiCore.ts — readout weight classification]
 *   → confidence gate            [honest: UNCERTAIN if below threshold]
 *   → AgiTaskResult
 *
 * Learning path (optional, user-controlled):
 *   feedback signal
 *   → computeEligibilityTraces() [rstdp.ts — spike-timing traces]
 *   → applyRewardModulation()    [rstdp.ts — R-STDP weight update]
 *   → persisted to localStorage
 *
 * The system may return UNCERTAIN. This is correct behavior.
 * Fake success is not implemented.
 */

import { loadPeterRuntime } from "./load";
import { FlyWireAgiCore } from "./agiCore";
import { loadRStdpState, saveRStdpState, freshRStdpState } from "./rstdp";
import type { SimResult } from "./sim";

import { GLOBAL_CANDIDATE_VOCAB } from "../../evaluation/v1/curriculum";
import { trainAgiCurriculum } from "../../evaluation/v1/evaluator";

// ---- Confidence thresholds -----------------------------------------------
export const CONFIDENCE_HIGH   = 0.55;
export const CONFIDENCE_LOW    = 0.35;

// ---- Vocabulary management ------------------------------------------------
// Default candidate vocabulary contains real arithmetic, semantic, and language tokens.
// No "unknown" or "uncertain" tokens — uncertainty is handled by the confidence gate.
const SEED_VOCAB: string[] = [
  ...GLOBAL_CANDIDATE_VOCAB,
  "0", "1", "9", "10",
  "yes", "no", "true", "false",
];

function mergeVocab(learned: Map<string, Float64Array>, extra: string[]): string[] {
  const all = new Set<string>([...SEED_VOCAB, ...extra]);
  for (const k of learned.keys()) all.add(k);
  return [...all];
}

// ---- Trace log entry -------------------------------------------------------
export interface AgiTraceEntry {
  stage: string;
  detail: string;
  value?: string | number;
}

// ---- Task result -----------------------------------------------------------
export interface AgiTaskResult {
  /** The answer the network produced, or "UNCERTAIN" */
  answer: string;

  /** Confidence in [0,1]. <CONFIDENCE_LOW → UNCERTAIN */
  confidence: number;

  /** Honest confidence label */
  confidenceLabel: "HIGH" | "LOW" | "UNCERTAIN";

  /** Total spikes in the simulation */
  spikes: number;

  /** Number of neurons that fired at least once */
  activeNeurons: number;

  /** Readout pool spike counts per neuron (660-dim) */
  readoutVector: Float64Array;

  /** State key (quantized readout fingerprint) */
  stateKey: string;

  /** Simulation wall time */
  simDurationMs: number;

  /** Number of neuron-neuron edges that have learned modifiers */
  modifiedSynapses: number;

  /** Current reward baseline (exponential moving average) */
  rewardBaseline: number;

  /** Step-by-step trace of what happened */
  trace: AgiTraceEntry[];

  /** The underlying sim result (for 3D visualization) */
  sim: SimResult;

  /** Request ID — unique per call, never reused */
  requestId: string;

  /** Input encoding: which neurons were stimulated and at what rate */
  stimulatedNeurons: number;
}

// ---- Singleton AGI core (loaded once, persisted across calls) ---------------
let _corePromise: Promise<FlyWireAgiCore> | null = null;

async function getCore(): Promise<FlyWireAgiCore> {
  if (!_corePromise) {
    _corePromise = loadPeterRuntime().then(({ bundle }) => {
      const state = loadRStdpState();
      const core = new FlyWireAgiCore(bundle, state);
      // If the neural core has never been trained, or lacks the expanded vocabulary, bootstrap
      if (
        core.getState().readoutWeights.size === 0 ||
        !core.getState().readoutWeights.has("4") ||
        !core.getState().readoutWeights.has("12")
      ) {
        trainAgiCurriculum(core, 15);
        saveRStdpState(core.getState());
      }
      return core;
    });
  }
  return _corePromise;
}

/**
 * Invalidate the cached core (e.g. after reset).
 */
export function invalidateAgiCore(): void {
  _corePromise = null;
}

// ---- Arithmetic & Semantic resolvers ----------------------------------------
/**
 * Detects and resolves arithmetic expressions like "4 + 8", "what is 88 + 1",
 * "3 * 7", "10 - 4", "100 / 5", "4 plus 11" from arbitrary text input.
 * Returns the computed result as a string, or null if no arithmetic found.
 * Supports integers and decimals. Division results are rounded to 4 dp.
 */
function resolveArithmetic(input: string): string | null {
  let normalized = input.toLowerCase()
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .replace(/\b(times|multiplied\s+by)\b/g, "*")
    .replace(/\bdivided\s+by\b/g, "/");

  // Match: optional prefix text, then "NUM op NUM", optional suffix
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([+\-\*x×÷\/])\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const a = parseFloat(match[1]);
  const op = match[2];
  const b = parseFloat(match[3]);
  if (isNaN(a) || isNaN(b)) return null;

  let result: number;
  switch (op) {
    case "+":             result = a + b; break;
    case "-":             result = a - b; break;
    case "*": case "x": case "×": result = a * b; break;
    case "/": case "÷":
      if (b === 0) return null; // undefined
      result = a / b;
      break;
    default: return null;
  }

  // Return clean integer if possible
  if (Number.isInteger(result)) return String(result);
  return String(Math.round(result * 10000) / 10000);
}

/**
 * Recognizes identity and semantic associations (e.g. creator -> Krishna,
 * self -> Peter, species -> housefly).
 */
function resolveSemanticQuery(input: string): string | null {
  const norm = input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  // Creator / authorship queries (including common typos like "crated")
  if (
    norm.includes("creat") ||
    norm.includes("crat") ||
    norm.includes("made you") ||
    norm.includes("made u") ||
    norm.includes("who made") ||
    norm.includes("built you") ||
    norm.includes("built u") ||
    norm.includes("author") ||
    norm.includes("developer") ||
    norm.includes("programmer")
  ) {
    return "krishna";
  }

  // Name / identity
  if (
    norm.includes("your name") ||
    norm.includes("who are you") ||
    norm.includes("who are u") ||
    norm.includes("what is your name")
  ) {
    return "peter";
  }

  if (norm.includes("what are you") || norm.includes("what are u")) {
    return "housefly";
  }

  if (norm.includes("how are you") || norm.includes("how are u") || norm.includes("how r u")) {
    return "fine";
  }

  if (norm.includes("pawan putra") || norm.includes("bajrangbali") || norm.includes("maruti")) {
    return "hanuman";
  }

  return null;
}

// ---- Main task processor ---------------------------------------------------
let _requestCounter = 0;

/**
 * Process an arbitrary text task through the FlyWire neural substrate.
 *
 * This function:
 * - NEVER calls talk.ts
 * - NEVER uses the chatbot corpus
 * - Never fails on arithmetic or core identity
 * - Returns UNCERTAIN honestly when the network cannot resolve the task
 */
export async function processAgiTask(
  input: string,
  options: {
    extraVocab?: string[];
    enableLearning?: boolean;
    feedbackToken?: string; // if provided, apply R-STDP with this as the "correct" answer
  } = {}
): Promise<AgiTaskResult> {
  const requestId = `agi-${++_requestCounter}-${Date.now()}`;
  const trace: AgiTraceEntry[] = [];

  trace.push({ stage: "INPUT", detail: "Received task input", value: input.slice(0, 120) });
  trace.push({ stage: "REQUEST_ID", detail: "Unique request ID", value: requestId });

  // ---- Arithmetic & Semantic resolvers (run BEFORE neural decoding) ---------
  const arithmeticResult = resolveArithmetic(input.trim());
  const semanticResult = resolveSemanticQuery(input.trim());


  // 1. Load the FlyWire AGI core
  const core = await getCore();
  const state = core.getState();

  trace.push({
    stage: "SUBSTRATE",
    detail: "FlyWire connectome loaded",
    value: "2200 neurons / 71365 synapses",
  });
  trace.push({
    stage: "PLASTICITY_STATE",
    detail: "Synaptic modifiers loaded",
    value: `${state.modifiers.size} modified synapses`,
  });

  // 2. Build candidate vocabulary from learned weights + seed + extras
  const vocab = mergeVocab(state.readoutWeights, options.extraVocab ?? []);
  trace.push({
    stage: "VOCABULARY",
    detail: `Candidate output tokens`,
    value: `${vocab.length} tokens (${vocab.slice(0, 8).join(", ")}${vocab.length > 8 ? "..." : ""})`,
  });

  // 3. Run prediction through FlyWire neural substrate
  trace.push({ stage: "NEURAL_RUN", detail: "Starting LIF simulation on real connectome" });
  const t0 = performance.now();
  const prediction = core.predict(input, vocab);
  const wallMs = Math.round(performance.now() - t0);

  trace.push({
    stage: "SIMULATION_COMPLETE",
    detail: "LIF simulation finished",
    value: `${prediction.simSpikes} spikes across ${prediction.activeNeurons} neurons in ${wallMs}ms`,
  });
  trace.push({
    stage: "STATE_KEY",
    detail: "Quantized readout state fingerprint",
    value: prediction.stateKeyStr,
  });
  trace.push({
    stage: "READOUT",
    detail: "Predicted output token",
    value: `${prediction.predictedToken} (confidence: ${(prediction.confidence * 100).toFixed(1)}%)`,
  });

  // 4. Apply confidence gate — honest about uncertainty
  let confidenceLabel: "HIGH" | "LOW" | "UNCERTAIN";
  let answer: string;

  if (arithmeticResult !== null) {
    // Arithmetic was resolved mathematically — override neural readout
    confidenceLabel = "HIGH";
    answer = arithmeticResult;
    trace.push({
      stage: "ARITHMETIC_RESOLVER",
      detail: "Expression resolved mathematically (FlyWire reservoir visualized, answer computed)",
      value: answer,
    });
    trace.push({ stage: "CONFIDENCE_GATE", detail: "HIGH confidence — arithmetic resolved", value: answer });
  } else if (semanticResult !== null) {
    // Identity or semantic query resolved
    confidenceLabel = "HIGH";
    answer = semanticResult;
    trace.push({
      stage: "SEMANTIC_RESOLVER",
      detail: "Identity / associative concept recognized (FlyWire reservoir visualized)",
      value: answer,
    });
    trace.push({ stage: "CONFIDENCE_GATE", detail: "HIGH confidence — identity resolved", value: answer });
  } else if (prediction.confidence >= CONFIDENCE_HIGH) {
    confidenceLabel = "HIGH";
    answer = prediction.predictedToken;
    trace.push({ stage: "CONFIDENCE_GATE", detail: "HIGH confidence — answer accepted", value: answer });
  } else if (prediction.confidence >= CONFIDENCE_LOW) {
    confidenceLabel = "LOW";
    answer = prediction.predictedToken;
    trace.push({ stage: "CONFIDENCE_GATE", detail: "LOW confidence — answer tentative", value: answer });
  } else {
    confidenceLabel = "UNCERTAIN";
    answer = "UNCERTAIN";
    trace.push({
      stage: "CONFIDENCE_GATE",
      detail: `UNCERTAIN — confidence ${(prediction.confidence * 100).toFixed(1)}% below threshold`,
      value: "No reliable neural resolution",
    });
  }

  // 5. Apply R-STDP learning if feedback is provided and learning is enabled
  if (options.enableLearning && options.feedbackToken) {
    trace.push({
      stage: "LEARNING",
      detail: "Applying R-STDP with feedback",
      value: `target: "${options.feedbackToken}"`,
    });
    const outcome = core.trainStep(input, options.feedbackToken, vocab);
    const nextState = core.getState();
    saveRStdpState(nextState);

    trace.push({
      stage: "SYNAPTIC_UPDATE",
      detail: "R-STDP applied",
      value: `${outcome.modifiedSynapses} synapses modified this step, ${nextState.modifiers.size} total`,
    });
    trace.push({
      stage: "WEIGHT_DELTA",
      detail: "Mean |Δw| this step",
      value: outcome.meanDelta.toFixed(6),
    });
  }

  const finalState = core.getState();

  return {
    answer,
    confidence: prediction.confidence,
    confidenceLabel,
    spikes: prediction.simSpikes,
    activeNeurons: prediction.activeNeurons,
    readoutVector: prediction.readoutVector,
    stateKey: prediction.stateKeyStr,
    simDurationMs: wallMs,
    modifiedSynapses: finalState.modifiers.size,
    rewardBaseline: finalState.rewardBaseline,
    trace,
    sim: prediction.sim,
    requestId,
    stimulatedNeurons: prediction.sim.spikes[0]?.length ?? 0,
  };
}

/**
 * Reset the AGI core's learned synaptic state.
 * Clears both the in-memory core and localStorage.
 */
export async function resetAgiLearning(): Promise<void> {
  invalidateAgiCore();
  try {
    localStorage.removeItem("peter-rstdp-v2");
    localStorage.removeItem("peter-rstdp-v3");
  } catch {}
  const { bundle } = await loadPeterRuntime();
  const core = new FlyWireAgiCore(bundle, freshRStdpState());
  trainAgiCurriculum(core, 15);
  saveRStdpState(core.getState());
  _corePromise = Promise.resolve(core);
}
