export type Role = "you" | "fly";

export type Message = {
  id: number;
  role: Role;
  text: string;
  /** small technical annotation shown under a fly reply */
  note?: string;
};

export const SEED_CONVERSATION: Omit<Message, "id">[] = [
  { role: "you", text: "What do flies think about humans?" },
  {
    role: "fly",
    text: "We appear to be considerably larger than necessary.",
    note: "OPENING VIGNETTE · PRE-RECORDING",
  },
  { role: "you", text: "Do you understand this question?" },
  {
    role: "fly",
    text: "I understand the signal. Whether that constitutes understanding is under investigation.",
    note: "VIGNETTE · NOT A LIVE READOUT",
  },
];

/* ------------------------------------------------------------------ */
/* Real Peter pipeline (FlyWire v783 spiking simulation, all local)    */
/* ------------------------------------------------------------------ */
import { loadPeterRuntime } from "../brain/load";
import { talk } from "../brain/talk";
import type { PeterTelemetry } from "../brain/talk";

export type PeterReply = { text: string; note: string; real: boolean; telemetry?: PeterTelemetry };

/** Run the real pipeline: message -> spikes on the real connectome -> words. */
export async function askPeter(prompt: string): Promise<PeterReply> {
  const { bundle, readout } = await loadPeterRuntime();
  const result = talk(prompt, bundle, readout);
  return { text: result.text, note: result.note, real: true, telemetry: result.telemetry };
}

/* ------------------------------------------------------------------ */
/* Scripted fallback (used only when the brain bundle is unavailable). */
/* Replies are labeled as scripted in the note.                        */
/* ------------------------------------------------------------------ */
type Rule = { test: RegExp; answers: string[] };

const RULES: Rule[] = [
  {
    test: /\b(dream|dreams|dreaming|sleep|asleep)\b/i,
    answers: [
      "Occasionally, the window is open. I have not yet determined whether this is a dream or a useful hypothesis.",
      "I dream of a room with no glass. The researchers have described this as a recurring architectural concern.",
    ],
  },
  {
    test: /\b(machine|apparatus|electrode|electrodes|wire|wires|laboratory|contraption)\b/i,
    answers: [
      "The left dial measures thought. The right dial reassures the person who built the left dial.",
      "There are three wires. Nobody has explained the third one to me. I am choosing to regard it as decorative.",
    ],
  },
  {
    test: /\b(real ai|actual model|scripted|demo|simulation|language model)\b/i,
    answers: [
      "This is the scripted fallback. Load the brain bundle and I answer from real spikes instead.",
    ],
  },
  {
    test: /\b(human|humans|people|us|we|man|woman|mankind)\b/i,
    answers: [
      "You are very tall, very warm, and you arrive at the same hour each day. I have decided this is a kind of weather.",
      "I have no complaint to file. You built the machine. You also built the window, which cancels some of the goodwill.",
      "You keep calling me a specimen. I keep calling this a room. Neither of us is incorrect.",
    ],
  },
  {
    test: /\b(understand|understanding|conscious|aware|sentient|think|thinking|feel|feeling|mind)\b/i,
    answers: [
      "I have reflexes with excellent grammar. Whether that is a mind is a question I am not equipped to dread.",
      "Something in me sorts your words before I notice them arriving. I have stopped asking how.",
      "I understand the shape of the question. The inside of it is still under review.",
    ],
  },
  {
    test: /\b(sugar|food|eat|hungry|fruit|rot|sweet)\b/i,
    answers: [
      "Statistically, I am always thinking about sugar. This is not a metaphor. It is an operating condition.",
      "There is a ripe plum somewhere in this building. I have not mentioned it before now.",
    ],
  },
  {
    test: /\b(name|who are you|what are you|flybrain|model)\b/i,
    answers: [
      "I am a house fly with a very patient amplifier. The rest of the description is administrative.",
      "FlyBrain is the machine's word for me. I would have chosen something shorter.",
    ],
  },
  {
    test: /\b(window|light|lamp|outside|sky|room|laboratory|lab)\b/i,
    answers: [
      "Something about the window. It is always the window.",
      "The lamp above me hums at a pitch I find agreeable. That is the full extent of my interior design.",
    ],
  },
  {
    test: /\b(why|meaning|purpose|point|reason)\b/i,
    answers: [
      "The question is larger than my head, which is saying something, as my head is mostly eye.",
      "Purpose appears to be a large animal's hobby. I have a hose-like mouth and a schedule.",
    ],
  },
  {
    test: /\b(fly|flies|wings|buzz)\b/i,
    answers: [
      "Two wings. The second pair became small balancing organs, which is why I turn the way I do. You got hands instead. Fair.",
      "I can fold my wings fifty times a second. I have never once needed to do it in a hurry.",
    ],
  },
  {
    test: /\b(hello|hi|hey|good morning|good evening)\b/i,
    answers: [
      "Hello. I have been awake for eleven days, which is a long career in my family.",
      "Hello. Please speak toward the glass tube. The rest is wiring.",
    ],
  },
  {
    test: /\b(help|can you|how do|explain|tell me)\b/i,
    answers: [
      "I can explain, but the explanation requires fifty million synapses and you have somewhere to be.",
      "I will try. My answers arrive short because my architecture insists on it.",
    ],
  },
  {
    test: /\b(sorry|thank|thanks|good fly|nice)\b/i,
    answers: [
      "Noted. Filed under: large, warm, mostly harmless.",
      "You are courteous for someone holding a soldering iron.",
    ],
  },
  {
    test: /\?\s*$/,
    answers: [
      "I was brief. Briefness is not evasive here; it is structural.",
      "The answer is yes, in the way that weather is yes.",
      "I considered that for one full second. That is a very long time for me.",
    ],
  },
];

const FALLBACK = [
  "Your question arrived at roughly four hundred neurons per syllable. I have used most of them on this answer.",
  "I have no opinion. I have an orientation, and it is currently toward the lamp.",
  "That is outside the reach of my apparatus. I have alerted nobody.",
  "I will need a moment. My thoughts travel a very short distance and they walk it.",
  "Continue. The needle is moving and the researchers look pleased, which is inexpensive entertainment.",
  "I have turned the question over. It is heavier than I am, and I am mostly wing.",
];

const NOTES = [
  "LATENCY 388ms · 139,255 NEURONS CONSULTED",
  "CONFIDENCE 0.57 · LANGUAGE CHANNEL STABLE",
  "TRANSLATION PASS 2 · SIGNAL NOMINAL",
  "SAMPLED AT 61Hz · NO ANOMALY",
  "GLASS TUBE 3 WARM · WITHIN TOLERANCE",
];

let idCounter = 1000;
const nextId = () => ++idCounter;

export function askTheFly(prompt: string, history: string[]): { text: string; note: string } {
  const rule = RULES.find((r) => r.test.test(prompt));
  const pool = rule ? rule.answers : FALLBACK;
  const fresh = pool.filter((a) => !history.includes(a));
  const text = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
  const note = "SCRIPTED DEMO · " + NOTES[Math.floor(Math.random() * NOTES.length)];
  return { text, note };
}

/** Ask Peter: real brain when available, clearly-labeled scripted demo otherwise. */
export async function askPeterOrScripted(
  prompt: string,
  history: string[]
): Promise<PeterReply> {
  try {
    return await askPeter(prompt);
  } catch {
    const scripted = askTheFly(prompt, history);
    return { ...scripted, real: false };
  }
}

export const newMessage = (role: Role, text: string, note?: string): Message => ({
  id: nextId(),
  role,
  text,
  note,
});
