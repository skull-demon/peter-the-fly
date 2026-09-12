/**
 * Curriculum definition for FlyWire AGI Prototype.
 * Version: 1.0.0
 *
 * Distinct splits:
 * 1. Training Set (used during learning)
 * 2. Generalization Holdout (NEVER seen during training; tests unseen combinations)
 * 3. Transfer / Robustness Set (different phrasing & syntax variations)
 */

export interface CurriculumExample {
  id: string;
  category: "arithmetic" | "language" | "hanuman";
  input: string;
  expectedOutput: string;
  candidateVocab: string[];
}

export const VOCAB_ARITHMETIC = ["2", "3", "4", "5", "6", "7", "8"];
export const VOCAB_LANGUAGE = ["fine", "peter", "krishna", "housefly", "connectome"];
export const VOCAB_HANUMAN = ["ram", "hanuman", "kesari", "siddhi"];

export const GLOBAL_CANDIDATE_VOCAB = [
  ...VOCAB_ARITHMETIC,
  ...VOCAB_LANGUAGE,
  ...VOCAB_HANUMAN,
];

// --- 1. Training Curriculum ---
export const TRAINING_CURRICULUM: CurriculumExample[] = [
  // Arithmetic training examples
  { id: "ari_tr_1", category: "arithmetic", input: "2 + 2", expectedOutput: "4", candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_2", category: "arithmetic", input: "3 + 2", expectedOutput: "5", candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_3", category: "arithmetic", input: "1 + 3", expectedOutput: "4", candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_4", category: "arithmetic", input: "2 + 3", expectedOutput: "5", candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_5", category: "arithmetic", input: "3 + 3", expectedOutput: "6", candidateVocab: VOCAB_ARITHMETIC },

  // Language / Identity training examples
  { id: "lan_tr_1", category: "language", input: "who created you", expectedOutput: "krishna", candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_2", category: "language", input: "what is your name", expectedOutput: "peter", candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_3", category: "language", input: "how are you", expectedOutput: "fine", candidateVocab: VOCAB_LANGUAGE },

  // Hanuman / Sanskrit associative training examples
  { id: "han_tr_1", category: "hanuman", input: "pawan putra", expectedOutput: "hanuman", candidateVocab: VOCAB_HANUMAN },
  { id: "han_tr_2", category: "hanuman", input: "sita", expectedOutput: "ram", candidateVocab: VOCAB_HANUMAN },
  { id: "han_tr_3", category: "hanuman", input: "ashta", expectedOutput: "siddhi", candidateVocab: VOCAB_HANUMAN },
  { id: "han_tr_4", category: "hanuman", input: "nandan", expectedOutput: "kesari", candidateVocab: VOCAB_HANUMAN },
];

// --- 2. Blind Generalization Holdout (NEVER seen during training) ---
export const BLIND_HOLDOUT: CurriculumExample[] = [
  // Unseen arithmetic pairs
  { id: "ari_ho_1", category: "arithmetic", input: "2 + 4", expectedOutput: "6", candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_ho_2", category: "arithmetic", input: "3 + 1", expectedOutput: "4", candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_ho_3", category: "arithmetic", input: "4 + 2", expectedOutput: "6", candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_ho_4", category: "arithmetic", input: "1 + 4", expectedOutput: "5", candidateVocab: VOCAB_ARITHMETIC },

  // Unseen phrasing / paraphrases
  { id: "lan_ho_1", category: "language", input: "tell me your creator", expectedOutput: "krishna", candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_ho_2", category: "language", input: "what do people call you", expectedOutput: "peter", candidateVocab: VOCAB_LANGUAGE },

  // Reverse & associative relations
  { id: "han_ho_1", category: "hanuman", input: "son of wind", expectedOutput: "hanuman", candidateVocab: VOCAB_HANUMAN },
  { id: "han_ho_2", category: "hanuman", input: "ram consort", expectedOutput: "ram", candidateVocab: VOCAB_HANUMAN },
];
