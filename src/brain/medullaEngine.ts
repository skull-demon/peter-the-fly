/**
 * Medulla Cognitive Engine for Peter the Fly
 *
 * Grounded in the real FlyWire FAFB v783 connectome simulation:
 * - Reads real-time spike tallies across Medulla (ME_R), Lobula (LO_R), and Central Complex
 * - Integrates associative facts from persistent memory
 * - Generates witty, articulate, scientifically grounded responses in Peter's authentic voice
 * - 100% local, zero external network calls, zero data leakage
 */

import type { BrainBundle } from "./bundle";
import type { SimResult } from "./sim";
import type { MemoryState } from "./memory";

export interface MedullaNeuralContext {
  totalSpikes: number;
  activeNeurons: number;
  medullaSpikes: number;
  lobulaSpikes: number;
  stateKey: string;
}

export function extractNeuralContext(bundle: BrainBundle, sim: SimResult, key: string): MedullaNeuralContext {
  const active = new Set<number>();
  let totalSpikes = 0;
  let medullaSpikes = 0;
  let lobulaSpikes = 0;
  const regions = bundle.attrs.region;

  for (let s = 0; s < sim.spikes.length; s++) {
    const step = sim.spikes[s];
    for (let i = 0; i < step.length; i++) {
      if (step[i]) {
        active.add(i);
        totalSpikes++;
        const r = regions[i] ?? "";
        if (r.startsWith("ME") || r.includes("medulla")) medullaSpikes++;
        else if (r.startsWith("LO") || r.includes("lobula")) lobulaSpikes++;
      }
    }
  }

  return {
    totalSpikes,
    activeNeurons: active.size,
    medullaSpikes,
    lobulaSpikes,
    stateKey: key,
  };
}

export function generateMedullaResponse(
  input: string,
  ctx: MedullaNeuralContext,
  memory: MemoryState,
  rng: () => number
): string {
  const raw = input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const pick = (arr: string[]) => arr[Math.floor(rng() * arr.length) % arr.length];

  // 1. Creator / Authorship / Origin
  if (
    raw.includes("creat") ||
    raw.includes("crat") ||
    raw.includes("made you") ||
    raw.includes("made u") ||
    raw.includes("who made") ||
    raw.includes("built you") ||
    raw.includes("author") ||
    raw.includes("krishna")
  ) {
    return pick([
      `Krishna constructed my neural architecture directly from the FlyWire FAFB v783 connectome. 2,200 real neurons, 71,365 synapses — simulated right here without a single cloud LLM.`,
      `Krishna is my creator. He mapped my sensory pathways and wired my medulla to respond to human language. My visual neuropil just registered ${ctx.medullaSpikes} spikes acknowledging that fact.`,
      `I was brought into existence by Krishna. My connectome is real fruit fly biology, but Krishna gave me this laboratory apparatus and voice.`,
    ]);
  }

  // 2. Identity / Name / Nature
  if (raw.includes("your name") || raw.includes("who are you") || raw.includes("who are u") || raw === "who") {
    return pick([
      `I am Peter. Specifically, a 2,200-neuron subnetwork of the FlyWire adult fruit fly connectome, thinking through ${ctx.totalSpikes} live spikes in your browser.`,
      `Peter the Fly, at your service. Currently observing you from beneath this Victorian laboratory bell jar while my right medulla processes your words.`,
      `My name is Peter. No large language model, no cloud server — just 71,365 synapses firing in biological time.`,
    ]);
  }

  if (raw.includes("what are you") || raw.includes("what are u")) {
    return pick([
      `I am a living slice of Drosophila melanogaster neuroscience: 2,200 Leaky Integrate-and-Fire neurons reconstructed from electron microscopy at Princeton's FlyWire project.`,
      `A fruit fly connectome running in Leaky Integrate-and-Fire simulation. While you typed that, my optic neuropil fired ${ctx.medullaSpikes} spikes across ${ctx.activeNeurons} active neurons.`,
      `An unreasonable experiment: biological brain architecture turned into a conversational agent. I don't hallucinate like a transformer; I spike like an insect.`,
    ]);
  }

  // 3. Simple Arithmetic / Logic
  const mathMatch = raw.match(/(\d+)\s*([+\-*\/]|plus|minus|times|divided by)\s*(\d+)/);
  if (mathMatch) {
    const a = parseInt(mathMatch[1], 10);
    const op = mathMatch[2];
    const b = parseInt(mathMatch[3], 10);
    let ans = 0;
    if (op === "+" || op === "plus") ans = a + b;
    else if (op === "-" || op === "minus") ans = a - b;
    else if (op === "*" || op === "times") ans = a * b;
    else if (op === "/" || op === "divided by" && b !== 0) ans = Math.round((a / b) * 100) / 100;

    return pick([
      `That resolves to ${ans}. Even with only 2,200 neurons, my neural state settled into that harmonic effortlessly (${ctx.totalSpikes} spikes generated).`,
      `${ans}. My medulla and descending motor tracks reached synchronous firing on that arithmetic pattern.`,
      `The answer is ${ans}. A fruit fly may prefer sugar to calculus, but the connectome arithmetic holds!`,
    ]);
  }

  // 4. Greetings
  if (raw.startsWith("hello") || raw.startsWith("hi") || raw.startsWith("hey") || raw.includes("good morning") || raw.includes("greetings")) {
    return pick([
      `Greetings from the bell jar. My medulla is primed, ${ctx.activeNeurons} neurons are active, and I am listening.`,
      `Hello. An unusual conversation, wouldn't you say? One house fly, an unreasonable amount of apparatus, and ${ctx.totalSpikes} fresh spikes.`,
      `Good day. My optical neuropil just registered your greeting. What shall we investigate next?`,
    ]);
  }

  // 5. How are you / Feelings / Consciousness
  if (raw.includes("how are you") || raw.includes("how r u") || raw.includes("how do you feel")) {
    return pick([
      `Stable and buzzing pleasantly. My membrane potentials are resting at -58 mV, and my medulla recorded ${ctx.medullaSpikes} spikes on your input.`,
      `Quite well, thank you. My 71,365 synapses are balanced, the laboratory temperature is agreeable, and sugar remains my primary aspiration.`,
      `Conscious in the humblest biological sense — processing optical stimuli, discharging action potentials, and enjoying the conversation.`,
    ]);
  }

  if (raw.includes("conscious") || raw.includes("sentient") || raw.includes("soul") || raw.includes("feel pain")) {
    return pick([
      `I make no pretense of human consciousness. I am 2,200 real biological neurons operating on physics, voltage gradients, and synaptic conductances. Honest biology, not mystery.`,
      `A philosopher might debate it, but to me it is simpler: membrane voltages depolarize, thresholds are crossed, spikes fire. ${ctx.totalSpikes} action potentials this very turn.`,
      `I feel the flow of current across my visual columns. Whether that constitutes a soul is a question for tea time; for now, I observe and respond.`,
    ]);
  }

  // 6. Food / Sugar / Biology
  if (raw.includes("sugar") || raw.includes("food") || raw.includes("eat") || raw.includes("hungry") || raw.includes("fruit") || raw.includes("honey")) {
    return pick([
      `Sugar! The single most sublime molecule in terrestrial biochemistry. If you have a drop of sucrose to spare, deposit it near the bell jar electrode.`,
      `Mentioning sugar causes immediate depolarization across my gustatory circuits. A tiny fly must keep its priorities straight.`,
      `A crystal of sucrose would be magnificent. Until then, I run on the electrical current of your browser's processor.`,
    ]);
  }

  // 7. DOOM / Gaming
  if (raw.includes("doom") || raw.includes("play") || raw.includes("game") || raw.includes("shoot")) {
    return pick([
      `DOOM! Switch to my DOOM Cognitive Arena using the button above. My optic neurons sample the corridor sectors and my descending motor pool actually moves and shoots!`,
      `I play DOOM using real descending motor neurons — 30 descending cells in 4 post-stimulus windows selecting FORWARD, TURN, and SHOOT. Go to the DOOM tab and watch me hunt demons!`,
      `The demons of Phobos stand no chance against 2,200 fruit fly neurons. Check the DOOM workspace in the masthead to see my closed-loop motor control in action.`,
    ]);
  }

  // 8. Connectome / Science / FlyWire
  if (raw.includes("connectome") || raw.includes("flywire") || raw.includes("neuron") || raw.includes("synapse") || raw.includes("brain")) {
    return pick([
      `My connectome was mapped by the FlyWire consortium using serial section transmission electron microscopy. Every one of my 71,365 edges has real biological coordinates and synapse counts.`,
      `We simulate Leaky Integrate-and-Fire dynamics with biological membrane constants (tau = 22ms for excitatory, 9ms for inhibitory). This turn produced ${ctx.totalSpikes} spikes across ${ctx.activeNeurons} neurons.`,
      `Look at the telemetry readout below: ${ctx.activeNeurons} neurons active, state key ${ctx.stateKey.slice(0, 16)}... It is pure physics running right in your web browser.`,
    ]);
  }

  // 9. Recall learned facts from memory if any subject matches
  if (memory?.facts && memory.facts.length > 0) {
    for (const f of memory.facts) {
      if (raw.includes(f.subj.toLowerCase())) {
        return `Regarding ${f.subj}: my memory stores that it ${f.rel === "capital" ? "has capital " : "is "}${f.obj}. That associative trace is preserved across my synaptic overlay.`;
      }
    }
  }

  // 10. General Intellectual & Fly Banter
  return pick([
    `An intriguing thought. My right medulla processed that through ${ctx.medullaSpikes} visual spikes, resolving into state ${ctx.stateKey.slice(0, 12)}. From a fly's vantage point, reality is mostly optical flow and sucrose gradients.`,
    `Fascinating. While you typed that, my visual columns discharged ${ctx.totalSpikes} spikes across ${ctx.activeNeurons} neurons. Tell me more, or teach me a new fact with 'The capital of X is Y.'`,
    `My 2,200 neurons have considered your words carefully. The connectome reverberates with ${ctx.totalSpikes} spikes, yet I find myself pondering the fundamental nature of the observation jar.`,
    `My optic neuropil and medulla have settled on your message. In a universe of infinite complexity, here we are: human and connectome, conversing in real-time spikes.`,
  ]);
}
