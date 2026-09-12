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
import { stimulusForText, tokenize } from "./spikegen";
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

export interface AgiLearningOutcome {
  prediction: AgiPrediction;
  expectedToken: string;
  reward: number;
  modifiedSynapses: number;
  meanDelta: number;
  totalModifiedSynapses: number;
  accuracy: number;
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

    // Decode prediction over candidate vocab using normalized population activity
    let actNorm = 0.0;
    for (let i = 0; i < readoutCount; i++) {
      actNorm += readoutActivity[i] * readoutActivity[i];
    }
    actNorm = Math.sqrt(actNorm) || 1.0;

    let bestScore = -Infinity;
    let bestToken = candidateVocab[0] ?? "unknown";

    for (const cand of candidateVocab) {
      const weights = this.state.readoutWeights.get(cand) ?? this.initReadoutWeights(cand, readoutCount);
      let score = 0.0;
      for (let i = 0; i < readoutCount; i++) {
        score += (readoutActivity[i] / actNorm) * weights[i];
      }
      if (score > bestScore) {
        bestScore = score;
        bestToken = cand;
      }
    }

    const totalSpikes = sim.totalSpikes;
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
  trainStep(input: string, expectedToken: string, candidateVocab: string[], seedOffset = 0): AgiLearningOutcome {
    // 1. Predict first (genuine autonomous guess)
    const prediction = this.predict(input, candidateVocab, seedOffset);

    // 2. Evaluate reward from environment
    const isCorrect = prediction.predictedToken.trim().toLowerCase() === expectedToken.trim().toLowerCase();
    const reward = isCorrect ? 1.0 : -1.0;

    // 3. Compute R-STDP eligibility traces across the 71,365 connectome edges
    const traces = computeEligibilityTraces(this.bundle, prediction.sim);

    // 4. Modulate internal synapses
    const { nextState, modifiedCount, meanDelta } = applyRewardModulation(this.state, traces, reward);

    // 5. Update readout weights via Hebbian error gradient on normalized vector
    const readoutCount = this.bundle.readoutRows.length;
    let actNorm = 0.0;
    for (let i = 0; i < readoutCount; i++) {
      actNorm += prediction.readoutVector[i] * prediction.readoutVector[i];
    }
    actNorm = Math.sqrt(actNorm) || 1.0;

    const lr = 0.25;

    // Strengthen correct class weights
    const correctWeights = nextState.readoutWeights.get(expectedToken) ?? this.initReadoutWeights(expectedToken, readoutCount);
    for (let i = 0; i < readoutCount; i++) {
      correctWeights[i] = correctWeights[i] * 0.995 + lr * (prediction.readoutVector[i] / actNorm);
    }
    nextState.readoutWeights.set(expectedToken, correctWeights);

    // Depress incorrect prediction
    if (!isCorrect) {
      const wrongWeights = nextState.readoutWeights.get(prediction.predictedToken) ?? this.initReadoutWeights(prediction.predictedToken, readoutCount);
      for (let i = 0; i < readoutCount; i++) {
        wrongWeights[i] = wrongWeights[i] * 0.995 - lr * 0.5 * (prediction.readoutVector[i] / actNorm);
      }
      nextState.readoutWeights.set(prediction.predictedToken, wrongWeights);
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
