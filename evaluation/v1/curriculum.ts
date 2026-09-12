/**
 * Curriculum definition for FlyWire AGI Prototype.
 * Version: 2.0.0
 *
 * Distinct splits:
 * 1. Training Set (used during learning)
 * 2. Generalization Holdout (NEVER seen during training; tests unseen combinations)
 */

export interface CurriculumExample {
  id: string;
  category: "arithmetic" | "language" | "hanuman";
  input: string;
  expectedOutput: string;
  candidateVocab: string[];
}

export const VOCAB_ARITHMETIC = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "12"];
export const VOCAB_LANGUAGE = ["fine", "peter", "krishna", "housefly", "connectome"];
export const VOCAB_HANUMAN = ["ram", "hanuman", "kesari", "siddhi"];

export const GLOBAL_CANDIDATE_VOCAB = [
  ...VOCAB_ARITHMETIC,
  ...VOCAB_LANGUAGE,
  ...VOCAB_HANUMAN,
];

// --- 1. Training Curriculum ---
export const TRAINING_CURRICULUM: CurriculumExample[] = [
  // Arithmetic — multiple examples per output token to strongly separate them
  { id: "ari_tr_1",  category: "arithmetic", input: "2 + 2",  expectedOutput: "4",  candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_2",  category: "arithmetic", input: "1 + 3",  expectedOutput: "4",  candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_3",  category: "arithmetic", input: "3 + 2",  expectedOutput: "5",  candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_4",  category: "arithmetic", input: "2 + 3",  expectedOutput: "5",  candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_5",  category: "arithmetic", input: "3 + 3",  expectedOutput: "6",  candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_6",  category: "arithmetic", input: "4 + 3",  expectedOutput: "7",  candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_7",  category: "arithmetic", input: "3 + 5",  expectedOutput: "8",  candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_8",  category: "arithmetic", input: "6 + 2",  expectedOutput: "8",  candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_9",  category: "arithmetic", input: "4 + 5",  expectedOutput: "9",  candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_10", category: "arithmetic", input: "5 + 5",  expectedOutput: "10", candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_11", category: "arithmetic", input: "4 + 8",  expectedOutput: "12", candidateVocab: VOCAB_ARITHMETIC },
  { id: "ari_tr_12", category: "arithmetic", input: "6 + 6",  expectedOutput: "12", candidateVocab: VOCAB_ARITHMETIC },

  // Language / Identity — multiple phrasings per answer
  { id: "lan_tr_1", category: "language", input: "who created you",   expectedOutput: "krishna",  candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_2", category: "language", input: "who made you",      expectedOutput: "krishna",  candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_3", category: "language", input: "your creator",      expectedOutput: "krishna",  candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_4", category: "language", input: "what is your name", expectedOutput: "peter",    candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_5", category: "language", input: "your name",         expectedOutput: "peter",    candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_6", category: "language", input: "who are you",       expectedOutput: "peter",    candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_7", category: "language", input: "who are u",         expectedOutput: "peter",    candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_8", category: "language", input: "how are you",       expectedOutput: "fine",     candidateVocab: VOCAB_LANGUAGE },
  { id: "lan_tr_9", category: "language", input: "what are you",      expectedOutput: "housefly", candidateVocab: VOCAB_LANGUAGE },

  // Hanuman / Sanskrit associative
  { id: "han_tr_1", category: "hanuman", input: "pawan putra",  expectedOutput: "hanuman", candidateVocab: VOCAB_HANUMAN },
  { id: "han_tr_2", category: "hanuman", input: "bajrangbali",  expectedOutput: "hanuman", candidateVocab: VOCAB_HANUMAN },
  { id: "han_tr_3", category: "hanuman", input: "maruti",       expectedOutput: "hanuman", candidateVocab: VOCAB_HANUMAN },
  { id: "han_tr_4", category: "hanuman", input: "sita",         expectedOutput: "ram",     candidateVocab: VOCAB_HANUMAN },
  { id: "han_tr_5", category: "hanuman", input: "ashta",        expectedOutput: "siddhi",  candidateVocab: VOCAB_HANUMAN },
  { id: "han_tr_6", category: "hanuman", input: "nandan",       expectedOutput: "kesari",  candidateVocab: VOCAB_HANUMAN },
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
