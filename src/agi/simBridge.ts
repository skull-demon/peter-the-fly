import { brain } from "./brain3d";
import type { SimResult } from "../brain/sim";
import type { BrainBundle } from "../brain/bundle";

/**
 * Maps Peter's 2,200 LIF neurons and biological connectome to 3D visual proxies
 * and feeds real simulation spikes, synapses, and regional activity into BrainRuntime.
 */

// Cached mapping from 2,200 LIF indices to 3D neuron IDs
let neuronIndexToProxyId: string[] | null = null;
let proxyNeuronList: string[] = [];

export function initNeuronMapping(bundle?: BrainBundle) {
  const model = brain.getModel();
  proxyNeuronList = model.neurons.map((n) => n.id);

  if (!bundle) {
    neuronIndexToProxyId = proxyNeuronList;
    return;
  }

  // Group 3D neurons by region abbreviation
  const proxiesByRegion = new Map<string, string[]>();
  model.neurons.forEach((n) => {
    const reg = n.region.toUpperCase();
    const list = proxiesByRegion.get(reg) ?? [];
    list.push(n.id);
    proxiesByRegion.set(reg, list);
  });

  const mapping: string[] = [];
  const neuronCount = bundle.neuronCount || 2200;
  const regions = bundle.attrs.region || [];

  for (let i = 0; i < neuronCount; i++) {
    const r = (regions[i] || "ME_R").toUpperCase();
    const matching = proxiesByRegion.get(r) || proxiesByRegion.get("ME_R") || proxyNeuronList;
    const proxyId = matching[i % matching.length];
    mapping.push(proxyId);
  }

  neuronIndexToProxyId = mapping;
}

/**
 * Streams a real LIF simulation result into the 3D BrainRuntime.
 * Spikes are converted to timestamped 3D neural events.
 */
export function streamSimResultTo3D(sim: SimResult, bundle?: BrainBundle) {
  if (!neuronIndexToProxyId) {
    initNeuronMapping(bundle);
  }

  const mapping = neuronIndexToProxyId || proxyNeuronList;
  const stepCount = sim.spikes.length;
  if (stepCount === 0) return;

  const events: Array<{ neuron_id: string; timestamp: number; intensity: number }> = [];
  const regionSpikeCounts = new Map<string, number>();
  const currentTime = brain.getStatus().simulationTime;

  // Sample spikes across the simulation to create a rich, fluid visual wave
  const stepInterval = Math.max(1, Math.floor(stepCount / 80));
  for (let step = 0; step < stepCount; step += stepInterval) {
    const spikeRow = sim.spikes[step];
    const stepTime = currentTime + (step * 0.5); // 0.5ms DT

    for (let neuronIdx = 0; neuronIdx < spikeRow.length; neuronIdx++) {
      if (spikeRow[neuronIdx] === 1) {
        const proxyId = mapping[neuronIdx % mapping.length];
        events.push({
          neuron_id: proxyId,
          timestamp: stepTime,
          intensity: 0.85 + Math.random() * 0.15,
        });

        const reg = bundle?.attrs.region[neuronIdx] ?? "ME_R";
        regionSpikeCounts.set(reg, (regionSpikeCounts.get(reg) || 0) + 1);
      }
    }
  }

  // Batch fire neurons
  if (events.length > 0) {
    brain.fireNeurons(events.slice(0, 450));
  }

  // Update region activities based on spike density
  const maxSpikes = Math.max(1, ...Array.from(regionSpikeCounts.values()));
  regionSpikeCounts.forEach((count, reg) => {
    const activity = Math.min(1.0, count / maxSpikes);
    brain.setRegionActivity(reg, activity, currentTime);
    // Also pair with left/right if applicable
    brain.setRegionActivity(`${reg}_R`, activity, currentTime);
    brain.setRegionActivity(`${reg}_L`, activity * 0.6, currentTime);
  });
}

/**
 * Visualizes a DOOM game step in 3D:
 * 1. Retina inputs hit visual regions (ME_R, LO_R, LA_R)
 * 2. Integration passes through central complex (PB, FB, EB, NO)
 * 3. Motor command fires
 */
export function streamDoomStepTo3D(
  sectors: number[],
  _actionIndex: number,
  _actionName: string,
  reward: number
) {
  const currentTime = brain.getStatus().simulationTime;
  const events: Array<{ neuron_id: string; timestamp: number; intensity: number }> = [];

  // 1. Retina activation: map 5 sectors to visual neurons
  const visualRegions = ["LA_R", "ME_R", "LO_R", "LOP_R", "AME_R"];
  sectors.forEach((luminance, sIdx) => {
    const reg = visualRegions[sIdx % visualRegions.length];
    brain.setRegionActivity(reg, Math.min(1.0, luminance * 1.8), currentTime);
    
    // Pick random neurons in that region
    const model = brain.getModel();
    const regionNeurons = model.neurons.filter((n) => n.region.includes(reg));
    regionNeurons.slice(0, 12).forEach((n) => {
      events.push({
        neuron_id: n.id,
        timestamp: currentTime + (sIdx * 15),
        intensity: Math.min(1.0, luminance * 1.5 + 0.3),
      });
    });
  });

  // 2. Central complex processing for action selection
  const centralRegions = ["FB", "EB", "PB", "NO"];
  centralRegions.forEach((cr, idx) => {
    brain.setRegionActivity(cr, 0.75 + Math.random() * 0.25, currentTime + 30 + idx * 20);
  });

  // 3. Motor output pool
  const motorNeuronCandidates = brain.getModel().neurons.filter(
    (n) => n.region === "GNG" || n.region === "SMP_L" || n.region === "SMP_R"
  );
  motorNeuronCandidates.slice(0, 8).forEach((n) => {
    events.push({
      neuron_id: n.id,
      timestamp: currentTime + 120,
      intensity: 1.0,
    });
  });

  if (events.length > 0) {
    brain.fireNeurons(events);
  }

  // If reward received, trigger a plasticity flash
  if (reward !== 0) {
    const conn = brain.getModel().connections[0];
    if (conn) {
      brain.applyPlasticity(conn.id, conn.weight, conn.weight + reward * 0.1, currentTime + 140);
    }
  }
}
