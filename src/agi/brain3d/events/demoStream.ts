import type { NeuralEvent } from "../types";

export const buildDemoEventStream = (neuronIds: string[]): NeuralEvent[] => {
  const events: NeuralEvent[] = [];
  neuronIds.slice(0, 8).forEach((id, index, sequence) => {
    const timestamp = 420 + index * 620;
    events.push({ type: "spike", neuron_id: id, timestamp, intensity: 0.72 + (index % 3) * 0.12, duration: 760 });
    if (index < sequence.length - 1) {
      events.push({ type: "synapse", source: id, target: sequence[index + 1], timestamp: timestamp + 250, weight: 0.8, intensity: 0.8, duration: 900 });
    }
  });
  events.push(
    { type: "region_activity", region: "ME_L", timestamp: 350, activity: 0.8 },
    { type: "region_activity", region: "ME_R", timestamp: 850, activity: 0.64 },
    { type: "region_activity", region: "CA_L", timestamp: 1900, activity: 0.76 },
    { type: "region_activity", region: "EB", timestamp: 3150, activity: 0.92 },
    { type: "region_activity", region: "AL_L", timestamp: 4300, activity: 0.72 },
    { type: "plasticity", connection: "DEMO_CONNECTION_001", timestamp: 3700, old_weight: 3, new_weight: 6, change: 3 },
    { type: "plasticity", connection: "DEMO_CONNECTION_002", timestamp: 4600, old_weight: 4, new_weight: 2, change: -2 },
  );
  return events;
};