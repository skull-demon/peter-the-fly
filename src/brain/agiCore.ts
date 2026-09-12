/**
 * Unified FlyWire AGI Cognitive Core
 *
 * One persistent neural substrate supporting:
 * - Symbolic Arithmetic & Reasoning
 * - Basic Conversational Semantics
 * - Relational Associations (including Hanuman / Sanskrit semantic concepts)
 *
 * Core Principle:
 * Prediction is generated purely from the reservoir's dynamic population vector
 * BEFORE reward/error feedback is provided. NO HARDCODED ANSWER MAPS.
 */

import type { BrainBundle } from "./bundle";
import { simulateBrain, readoutState, stateKey, type SimResult } from "./sim";
import { stimulusForText } from "./spikegen";
import {
  type RStdpState,
  loadRStdpState,
  saveRStdpState,
  computeEligibilityTraces,
  applyRewardModulation,
  modifiersToGains,
  freshRStdpState,
} from "./rstdp";

export interface AgiPrediction {
  input: string;
  predictedToken: string;
  confidence: number;
  readoutVector: Float64Array;
  sim: SimResult;
  simSpikes: number;
  activeNeurons: number;
  durationMs: number;
  stateKeyStr: string;
}

export interface TrainStepOptions {
  enableNeuralPlasticity?: boolean; // default true (Ablation 2: false)
  enableReadoutLearning?: boolean;  // default true (Ablation 5: false)
  forcedReward?: number;            // default undefined (Ablation 3, 10: 0.0)
  customEta?: number;
}

export interface AgiLearningOutcome {
  prediction: AgiPrediction;
  expectedToken: string;
  reward: number;
  modifiedSynapses: number;
  meanDelta: number;
  totalModifiedSynapses: number;
  accuracy: number;
  potentiatedSynapses: number;
  depressedSynapses: number;
  maxWeightChange: number;
  meanEligibility: number;
}

export class FlyWireAgiCore {
  private bundle: BrainBundle;
  private state: RStdpState;
  private externalMemoryEnabled = false;

  constructor(bundle: BrainBundle, savedState?: RStdpState) {
    this.bundle = bundle;
    this.state = savedState ?? loadRStdpState();
  }

  getState(): RStdpState {
    return this.state;
  }

  setState(next: RStdpState) {
    this.state = next;
    saveRStdpState(this.state);
  }

  resetLearning() {
    this.state = freshRStdpState();
    saveRStdpState(this.state);
  }

  setExternalMemory(enabled: boolean) {
    this.externalMemoryEnabled = enabled;
  }

  isExternalMemoryEnabled(): boolean {
    return this.externalMemoryEnabled;
  }

  /**
   * Generates prediction from FlyWire reservoir state BEFORE receiving feedback.
   */
  predict(input: string, candidateVocab: string[], seedOffset = 0): AgiPrediction {
    const t0 = performance.now();
    const stim = stimulusForText(input, this.bundle);
    const gains = modifiersToGains(this.state.modifiers, this.bundle.edgeCount);
    const seed = (4242 + seedOffset) ^ (input.length * 1337);

    // Run LIF simulation through the real FlyWire connectome
    const sim = simulateBrain(this.bundle, stim.rows, stim.rates, seed, 450, gains);
    const state = readoutState(sim, this.bundle.readoutRows);
    const stateStr = stateKey(state);

    const readoutCount = this.bundle.readoutRows.length;
    const readoutActivity = new Float64Array(readoutCount);
    for (let i = 0; i < readoutCount; i++) {
      const row = this.bundle.readoutRows[i];
      let rowSpikes = 0;
      for (let s = 0; s < sim.spikes.length; s++) {
        rowSpikes += sim.spikes[s][row];
      }
      readoutActivity[i] = rowSpikes;
    }

    // Mean-center the readout activity to remove DC baseline
    let actSum = 0.0;
    for (let i = 0; i < readoutCount; i++) actSum += readoutActivity[i];
    const actMean = actSum / readoutCount;

    let actNorm = 0.0;
    const actCentered = new Float64Array(readoutCount);
    for (let i = 0; i < readoutCount; i++) {
      actCentered[i] = readoutActivity[i] - actMean;
      actNorm += actCentered[i] * actCentered[i];
    }
    actNorm = Math.sqrt(actNorm) || 1.0;

    let bestScore = -Infinity;
    let bestToken = candidateVocab[0] ?? "unknown";

    for (const cand of candidateVocab) {
      const weights = this.state.readoutWeights.get(cand) ?? this.initReadoutWeights(cand, readoutCount);
      let wNorm = 0.0;
      for (let i = 0; i < readoutCount; i++) wNorm += weights[i] * weights[i];
      wNorm = Math.sqrt(wNorm) || 1.0;

      let score = 0.0;
      for (let i = 0; i < readoutCount; i++) {
        score += (actCentered[i] / actNorm) * (weights[i] / wNorm);
      }
      if (score > bestScore) {
        bestScore = score;
        bestToken = cand;
      }
    }

    let totalSpikes = 0;
    for (let s = 0; s < sim.spikes.length; s++) {
      const step = sim.spikes[s];
      for (let n = 0; n < step.length; n++) {
        if (step[n]) totalSpikes++;
      }
    }

    let activeNeurons = 0;
    for (let n = 0; n < this.bundle.neuronCount; n++) {
      let fired = false;
      for (let s = 0; s < sim.spikes.length; s += 5) {
        if (sim.spikes[s][n]) {
          fired = true;
          break;
        }
      }
      if (fired) activeNeurons++;
    }

    const durationMs = Math.round(performance.now() - t0);

    return {
      input,
      predictedToken: bestToken,
      confidence: Math.max(0, Math.min(1.0, 1 / (1 + Math.exp(-bestScore * 2.0)))),
      readoutVector: readoutActivity,
      sim,
      simSpikes: totalSpikes,
      activeNeurons,
      durationMs,
      stateKeyStr: stateStr,
    };
  }

  /**
   * Reinforces or punishes the neural trajectory using Reward-Modulated STDP.
   */
  trainStep(
    input: string,
    expectedToken: string,
    candidateVocab: string[],
    seedOffset = 0,
    options?: TrainStepOptions
  ): AgiLearningOutcome {
    // 1. Predict first (genuine autonomous guess)
    const prediction = this.predict(input, candidateVocab, seedOffset);

    // 2. Evaluate reward from environment (or override if forced)
    const isCorrect = prediction.predictedToken.trim().toLowerCase() === expectedToken.trim().toLowerCase();
    const reward = options?.forcedReward !== undefined ? options.forcedReward : (isCorrect ? 1.0 : -1.0);

    let nextState = this.state;
    let modifiedCount = 0;
    let meanDelta = 0.0;
    let potentiatedCount = 0;
    let depressedCount = 0;
    let maxDelta = 0.0;
    let meanElig = 0.0;

    // 3. Compute R-STDP eligibility traces across connectome edges if plasticity enabled
    const enablePlasticity = options?.enableNeuralPlasticity !== false;
    if (enablePlasticity) {
      const traces = computeEligibilityTraces(this.bundle, prediction.sim, 450);
      const res = applyRewardModulation(this.state, traces, reward, options?.customEta);
      nextState = res.nextState;
      modifiedCount = res.metrics.changedSynapses;
      meanDelta = res.metrics.meanWeightChange;
      potentiatedCount = res.metrics.potentiatedSynapses;
      depressedCount = res.metrics.depressedSynapses;
      maxDelta = res.metrics.maxWeightChange;
      meanElig = res.metrics.meanEligibility;
    }

    // 4. Update readout weights via Hebbian error gradient if readout learning enabled
    const enableReadout = options?.enableReadoutLearning !== false;
    if (enableReadout) {
      const readoutCount = this.bundle.readoutRows.length;
      let actSum = 0.0;
      for (let i = 0; i < readoutCount; i++) actSum += prediction.readoutVector[i];
      const actMean = actSum / readoutCount;

      let actNorm = 0.0;
      const actCentered = new Float64Array(readoutCount);
      for (let i = 0; i < readoutCount; i++) {
        actCentered[i] = prediction.readoutVector[i] - actMean;
        actNorm += actCentered[i] * actCentered[i];
      }
      actNorm = Math.sqrt(actNorm) || 1.0;

      const lr = 0.50;

      // Strengthen correct class weights
      const correctWeights = nextState.readoutWeights.get(expectedToken) ?? this.initReadoutWeights(expectedToken, readoutCount);
      for (let i = 0; i < readoutCount; i++) {
        correctWeights[i] = correctWeights[i] * 0.97 + lr * (actCentered[i] / actNorm);
      }
      // Normalize correct class weights to unit norm to prevent magnitude explosion
      let cwNorm = 0.0;
      for (let i = 0; i < readoutCount; i++) cwNorm += correctWeights[i] * correctWeights[i];
      cwNorm = Math.sqrt(cwNorm) || 1.0;
      for (let i = 0; i < readoutCount; i++) correctWeights[i] /= cwNorm;
      nextState.readoutWeights.set(expectedToken, correctWeights);

      // Depress competing candidate classes — penalty proportional to lr
      const competitors = candidateVocab.filter((c) => c !== expectedToken);
      const penalty = lr * 0.6 / Math.max(1, competitors.length);
      for (const cand of competitors) {
        const candWeights = nextState.readoutWeights.get(cand) ?? this.initReadoutWeights(cand, readoutCount);
        for (let i = 0; i < readoutCount; i++) {
          candWeights[i] = candWeights[i] * 0.97 - penalty * (actCentered[i] / actNorm);
        }
        // Normalize competitor weights too
        let cnNorm = 0.0;
        for (let i = 0; i < readoutCount; i++) cnNorm += candWeights[i] * candWeights[i];
        cnNorm = Math.sqrt(cnNorm) || 1.0;
        for (let i = 0; i < readoutCount; i++) candWeights[i] /= cnNorm;
        nextState.readoutWeights.set(cand, candWeights);
      }
    }

    this.state = nextState;
    saveRStdpState(this.state);

    return {
      prediction,
      expectedToken,
      reward,
      modifiedSynapses: modifiedCount,
      meanDelta,
      totalModifiedSynapses: this.state.modifiers.size,
      accuracy: isCorrect ? 1.0 : 0.0,
      potentiatedSynapses: potentiatedCount,
      depressedSynapses: depressedCount,
      maxWeightChange: maxDelta,
      meanEligibility: meanElig,
    };
  }

  private initReadoutWeights(token: string, size: number): Float64Array {
    // Deterministic pseudo-random initialization from token hash
    const arr = new Float64Array(size);
    let h = 0x811c9dc5;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    for (let i = 0; i < size; i++) {
      h = Math.imul(h ^ (h >>> 15), 0x5bf03635);
      arr[i] = ((h >>> 0) / 4294967296) * 0.2 - 0.1;
    }
    return arr;
  }
}
