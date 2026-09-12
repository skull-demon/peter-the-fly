# Peter the Fly — Implementation Answers

*Written for independent verification, not marketing. Every claim below names a
file/function/equation and where possible a hash or a runnable command. Where a
thing is *not* implemented, that is stated plainly.*

`commit` referenced: latest `main` at time of writing (see `git log -1`).
Artifacts verified in this doc:
`public/brain/peter.br` md5 `0ee7e0a919254617215d02c3d0ebb76c` sha256 `b071bb250437db19…`
`public/brain/peter.readout.json` md5 `bb6f617cba8bb7673f93d1917af000f0` sha256 `6790e785a8d966e1…`

---

# PART 1: WHAT IS ACTUALLY RUNNING?

### 1. Runtime architecture (user input → reply)

```
user text (ChatPanel.tsx transmit())
  → tokenize(): regex [a-z0-9']+ on lowercase      (src/brain/spikegen.ts)
  → token → input neurons: fnv1a32(token#salt) % len(input_pool),
      up to 24 neurons per token                    (spikegen.ts tokenRows)
  → semantic categories: fixed keyword→category map adds boosted rates
  → StimulusPlan {rows, rates, windowMs=120}        (spikegen.ts stimulusForText)
  → LIF simulation, 600 ms bio time, dt 0.5 ms      (src/brain/sim.ts simulateBrain)
  → readout-pool spike counts per 100 ms bin (6 bins) = reservoir state vector
  → stateKey(): quantize state/8, clip 0..15        (sim.ts stateKey)
  → sentence selection (talk.ts):
        exact/near-lexical taught prompt → taught sentence
        else top-3 taught replies by state-key distance, chosen by
        mulberry32( msgSeed XOR fnv1a32(stateKey) )
  → reply text + real telemetry note {neurons, spikes, ms}
  → char-interval reveal (theatrical) + onTelemetry + onSim (raster)
```

### 2. Processes that run when you send a message
In the browser tab: `stimulusForText` → `simulateBrain` (1200 steps × 2,200
neurons) → `readoutState` → `stateKey` → `talk()` sentence selection. Nothing
else. No server, no queue, no background job.

### 3. Browser
Everything: tokenizer, stimulus projection, LIF simulator, reservoir state,
readout, sentence selection, raster rendering, buzz. All in `src/brain/*.ts`
and `src/components/*.tsx`.

### 4. Server
None. The deployed artifact is a static site on Cloudflare Pages
(`dist/index.html` + `public/brain/*` + `public/images/*` + `public/doom/*`).
There is no backend process, no FastAPI, no functions.

### 5. Network requests after the brain bundle loads
After the initial load (`/brain/peter.br`, `/brain/peter.readout.json`,
`/images/*`, Google Fonts), there are **zero** runtime network requests. The
only later fetches are the **on-demand** Doom assets (`/doom/peter-doom.jsdos`,
`/doom/vendor/*`) — and only if you open the Doom panel. Chat does not fetch.

### 6. Disconnect the internet — does chat keep working?
Yes, after first load. Everything the chat needs is already in memory
(`loadPeterRuntime()` caches the bundle). A reload with no network will fail to
re-fetch the bundle unless the browser serves it from cache; the model is not
re-downloaded at runtime. Google Fonts fall back to system serifs offline.

### 7. Network-tab evidence
`tests/proof-neurons.mjs` runs the real site and asserts the chat works
without any API call. Concretely, open DevTools → Network and send a message:
you will see the two brain artifacts on first load and nothing after. There is
no XHR/fetch to any inference host. The only `fetch` calls in source are
`load.ts` (`/brain/peter.br`, `/brain/peter.readout.json`) and `doom.ts`
(Doom assets). Verified by grep: no `https://` fetch target anywhere in
`src/`.

### 8. Any LLM / transformer / embedding / cloud AI / hidden model?
No. There is no LLM, transformer, embedding model, or external inference
service anywhere. The only "model" is the FlyWire bundle (a connectivity
graph) plus a 99 KB readout table. No GGUF, no ONNX, no HF, no API key.

### 9. Third-party libraries that compute
- `@react-three/fiber`, `three`, `@react-three/drei` — the 3D scene only.
- `react`, `react-dom` — UI.
- `tailwindcss`, `clsx`, `tailwind-merge` — styling.
- `vite`, `esbuild` — build only.
- `js-dos` (GPL-3.0) — runs the DOS DOOM binary, only when Doom opens.
- Python (offline toolchain only): `numpy`, `pandas`, `pyarrow`, `scipy`,
  `requests`, `pytest`, and `vizdoom` (optional, Doom training only).
None of these contain a language model. The simulation math is ours.

### 10. Files containing the actual inference/runtime
`src/brain/` — `bundle.ts` (parser), `spikegen.ts` (encoding), `sim.ts` (LIF),
`talk.ts` (decoder), `load.ts` (loader), `index.ts` (exports).
Python reference: `python/brainpack/lif.py`, `spikegen.py`, `bundle.py`.

---

# PART 2: THE FLYWIRE CONNECTOME

### 11. Dataset/version
FlyWire FAFB **v783** (the adult *Drosophila melanogaster* whole-brain
connectome, proofread release).

### 12. Source URLs
- Connections + root IDs: Zenodo record **10676866**
  (`proofread_connections_783.feather`, `proofread_root_ids_783.npy`).
- Neuron annotations: `flyconnectome/flywire_annotations` tag **v3.1.0**
  (`Supplemental_file1_neuron_annotations.tsv`).
Official MD5s are in `python/brainpack/ingest.py` `OFFICIAL_CHECKSUMS`.

### 13. Neuron root IDs
The subgraph keeps **2,200** real proofread root IDs. They are stored as int64
in the bundle (`bundle.neuronIds`). All are in the FlyWire 18-digit range
`720575940000000000…779999999999999999` — verified by `tests/brainproof.mjs`
("neuron IDs: 2200/2200 in official FlyWire root-ID range").

### 14. Reproduce the exact subgraph independently
```bash
make download-data          # official files, MD5-checked
python scripts/build_brain.py --strategy sensory_to_motor --max-neurons 2200
```
Same inputs → same bundle (deterministic selection; seed 783). Cross-check the
bundle md5 against the value in this doc.

### 15. How the 2,200 neurons are selected
`python/brainpack/subgraph.py`, strategy `sensory_to_motor`:
1. Seed with optic-lobe neurons in source region `ME` (right hemisphere).
2. Expand along **real** connections (BFS) toward central and
   visual-projection classes.
3. Guarantee a set of **descending** neurons (the motor output) is included.
4. Trim to `max_neurons`, keeping the best-connected.

### 16. Why those neurons
They form a genuine sensory→motor pathway (optic → central →
visual-projection → descending). That is a real, connected, input-to-output
circuit — ideal for both chat (stimulate input, read output) and the Doom
closed loop (screen → optic input → descending motor output).

### 17. Connected?
Yes — the selection expands along real edges, so the subgraph is connected
by construction. `verify_brain.py` checks edge endpoints are in-range and no
self-loops.

### 18. % genuine FlyWire connections
**100%.** Every edge in the bundle is a real FlyWire `(pre, post, neuropil,
syn_count)` row whose both endpoints are in the selected subgraph. The bundle
stores only real pairs; nothing is synthesized.

### 19. Values directly from FlyWire
- Neuron root IDs, `super_class`, `cell_class`, `cell_type`, `side`, `top_nt`
  (annotations).
- Edge `pre/post` IDs, `neuropil`, `syn_count`, and edge-level transmitter
  probabilities `ach_avg`/`gaba_avg` (connections file).
- Per-neuron region (from the neuropil table).

### 20. Values inferred
- Per-neuron neurotransmitter class when only `top_nt` is available.
- Edge sign when only neuron-level transmitter is available (fallback).

### 21. Values manually chosen (design constants)
- Number of neurons (2,200), enable fraction (0.85), min synapses (3),
  source region (ME), stimulus window (120 ms), duration (600 ms).
- The readout corpus sentences (authored teaching content).

### 22. Values mathematically modified
- `weight` = float32(`syn_count`) (no change to the count).
- `prob` = `clip(1 − exp(−weight/8), 0.05, 0.95)` — a chosen release-probability
  transform.
- `enabled` = top 85% by weight **or** any weight ≥ 5.
- Current scale `W_GAIN = 0.55`, inhibitory `× 3.2`.

### 23. Are weights simply synapse counts?
Stored as counts; the *current* they inject is scaled (`w × 0.55`). The count
is the biological weight; the 0.55 is a unit conversion so currents stay in a
stable range.

### 24. Exact transformation
```
excitatory current = syn_count × 0.55
inhibitory current = −syn_count × 0.55 × 3.2
release probability = clip(1 − exp(−syn_count/8), 0.05, 0.95)
```

### 25. Inhibitory/excitatory determination
Sign comes from edge-level transmitter probabilities (`ach_avg` vs `gaba_avg`)
when present; else from the source neuron's `top_nt`; else defaults to
excitatory (recorded in meta `sign_evidence`).

### 26. Are transmitter probabilities used?
Yes — the primary path uses `ach_avg`/`gaba_avg` from the connections file.
Meta field: `sign_evidence = "edge_nt_probabilities"`.

### 27. When transmitter info is unavailable
Fall back to neuron `top_nt`; if that is also unknown, sign defaults to +1
(excitatory) and this is recorded. `verify_brain.py` counts inhibitory edges
(33,078) to confirm the data is present.

### 28/29/30. Pruning
Neurons: selection limits to 2,200. Edges: `enabled` keeps top 85% by weight
plus all weight ≥ 5; the rest are stored but flagged `enabled=0` and skipped in
the sim. Total 71,365 edges, **60,660 enabled** (85%).

### 31. Does pruning alter topology?
It removes weak edges from the *simulated* graph but keeps the full edge list
in the bundle (so topology is recoverable). The simulation runs on the enabled
subset, which is a documented, reproducible choice.

### 32. Bundle checksum
`peter.br` md5 `0ee7e0a919254617215d02c3d0ebb76c`, sha256 `b071bb250437db19…`.

---

# PART 3: THE ACTUAL NEURON MODEL

### 33. Model
Leaky Integrate-and-Fire (LIF), two time constants (excitatory vs inhibitory).

### 34. Update equation
```
τ_mem · dv/dt = (V_rest − v) + R·I_syn(t)
discrete (dt = 0.5 ms):
  v ← v + (V_rest − v)·(dt/τ) + I_syn
  if v ≥ V_thresh and refractory==0: spike; v ← V_reset; refractory ← 2 ms
```
`τ = 22 ms` (excitatory), `τ = 9 ms` (inhibitory neurons).

### 35. Membrane constants
`V_rest = −58 mV`, `V_reset = −66 mV`, `V_thresh = −48 mV`,
`τ_mem = 22 ms`, `τ_inh = 9 ms`, `dt = 0.5 ms`, refractory `2 ms`.

### 36. Timestep
`dt = 0.5 ms`. A 600 ms message = 1,200 steps.

### 37. Threshold
`V_thresh = −48 mV`.

### 38. Reset potential
`V_reset = −66 mV`.

### 39. Refractory period
`2 ms` (`REFRACTORY_MS`, 4 steps).

### 40. Synaptic currents
Each spike at neuron *u* delivers, one step later, to each enabled target *v*:
`I += w · 0.55` (excitatory) with release probability `prob`.

### 41. Inhibitory currents
`I += −w · 0.55 · 3.2` for sign < 0.

### 42. Delays
One simulation step (0.5 ms) — a fixed monosynaptic delay. No multi-step
axonal delays.

### 43. Is transmission stochastic?
Yes — each edge releases probabilistically with its `prob`.

### 44/45/46. Stochasticity source
Counter-based **pcg2d** hashing (`python/brainpack/lif.py`,
`src/brain/sim.ts`). There is **no conventional RNG** and no `Math.random()`.
`rand01(seed, a, b, ka, kb)` derives a deterministic value from counters.
This makes the whole simulation reproducible bit-for-bit.

### 47. Same input → same spike train?
Yes, deterministically.

### 48. How tested
`python/tests/test_parity.py` and `tests/brain.test.mjs`:
- determinism: same seed twice → identical spike count (in `brainproof.mjs`).
- seed changes dynamics.
- `verify_brain.py` live-fire checks.

### 49. Is TS identical to Python?
Yes — enforced by a parity test that compiles the TS runtime with esbuild and
compares spike trains against the Python reference. We fixed real bugs this way
(e.g. the original-edge-index lane, `v_init` order).

### 50. Parity test
`python/tests/test_parity.py`:
```python
# builds synthetic bundle, runs lif.simulate (python) and sim.ts (via esbuild),
# asserts the spike bitmaps are identical and the bin counts match.
```
Run: `python -m pytest python/tests/test_parity.py`.

---

# PART 4: INPUT → FLY BRAIN

### 51. "hello" exactly
`tokenize("hello")` → `["hello"]`. `fnv1a32("hello#0")` etc. pick up to 24
input-pool neuron indices. Each gets `BASE_HZ = 6 Hz`. Semantic category
`greeting` also boosts its category rows by `80 × 0.25 = 20 Hz`. The stimulus
is applied for the first 120 ms of the 600 ms sim.

### 52. Transformation
```
"hello" → ["hello"] → fnv1a32("hello#salt") → index % 220 (input_pool) → rows
→ rates {row: 6 Hz} (+ category rows 20 Hz) → Poisson stimulus (pcg2d)
→ LIF 1200 steps → spike raster (steps × 2200 bool)
```

### 53. Which neurons represent tokens
Tokens map to rows in the **input pool** (220 neurons, 106 of them optic).
They are *input* neurons, not output neurons.

### 54. How mappings were created
Deterministic hash projection: `fnv1a32(token + "#" + salt) % len(input_pool)`,
deduplicated, up to 24 neurons. Same in Python and TS.

### 55. Learned? No. 56. Random? No — deterministic hash. 57. Manually assigned? No.

### 58. Two words → same neurons
They overlap in stimulation. This is by design (a distributed, non-one-hot
code) and it is why the brain's *state*, not the token, carries information.

### 59. Unknown word
Not in the token vocabulary → it contributes **no** direct token rows, but its
letters still hash (any string hashes), and if it matches a semantic category
keyword it boosts category rows. So an unknown word still stimulates the brain
via its category, not its identity.

### 60. Punctuation
Stripped by the regex `[a-z0-9']+`. A trailing `?` triggers the `question`
category boost.

### 61. Capitalization
Lowercased before tokenizing.

### 62. Does semantics affect stimulation?
Only via the fixed keyword→category map (greeting, food, motion, …). The
network does **not** see word embeddings; it sees token-hash rows + category
rows. So it is token identity + coarse category, not semantic meaning.

### 63. "cat" vs "dog"
Different hash → different (overlapping) input rows → different spike pattern.
But the difference is a hash difference, not a semantic one.

### 64. Does it "understand"?
No. It produces different stimulation patterns. It does not represent meaning.

### 65. Information surviving encoding
Token identity (via hash rows), coarse semantic category, and word order is
**lost** (the stimulus is a bag-of-rows over a 120 ms window). The system does
not see syntax or sequence.

---

# PART 5: THE CHATBOT OUTPUT

### 66. Spikes → English
The **readout pool** (660 neurons, 30 of them real descending neurons) is
binned into 6 × 100 ms spike counts → a 6-dimensional reservoir state vector →
quantized to a state key → that key selects a taught sentence.

### 67. Spike train → first word
`readoutState(sim, readoutRows)` → 6-vector → `stateKey` → `talk()` selection →
the chosen sentence's first word.

### 68. State dimensionality
6 (one per 100 ms bin of the readout pool).

### 69. Quantization
`round(state / 8)`, clipped to 0..15, joined with `.`.

### 70. State key
The dot-joined quantized 6-vector, e.g. `"0.3.1.2.4.2"`. It is a stable
fingerprint of the fly's output activity.

### 71. Unique states observed
110 distinct state keys are in the readout (from 115 training prompts).

### 72. Actual state map
`public/brain/peter.readout.json` → `state_map` (110 keys → word/affinity
lists). It is large; inspect it directly. The doc confirms the count.

### 73/74. Words the system can output
367 distinct words appear in the transition vocabulary; the taught sentences
contain the full output vocabulary.

### 75. Complete replies stored
115 taught replies (one per corpus prompt).

### 76. Complete sentences stored?
Yes — the 115 taught replies are complete sentences.

### 77. Phrases stored?
The `state_map` and `transitions` tables store word→word/affinity entries.

### 78. Word-to-word transitions stored?
Yes — `transitions` (366 keys → next-word counts).

### 79. Transition structure
```json
"transitions": {
  "the": [["sugar", 3], ["spikes", 2], ...],
  ...
}
```

### 80. How much of a sentence was NOT in the corpus?
The decoder was rewritten to select **complete taught sentences**. So a reply
is a sentence that appeared in the corpus. The word-walk that could produce
novel-but-fragmented output was removed. Therefore ~0% of a reply's words are
novel; the novelty is in *which* sentence the neural state selects.

### 81. Completely novel sentence?
No. Peter speaks taught sentences. This is the honest state.

### 82. Example of a novel sentence
Not applicable — see 81. (The previous word-walk could, e.g., emit
"a lamp a small brain that was dancing"; that behavior is now removed.)

### 83. Word combination never in training?
No.

### 84. Concept never trained on?
No. Out-of-vocabulary prompts fall back to a taught sentence chosen by neural
state, or to one of 5 fallbacks.

### 85. Outside the 115-prompt corpus?
It does not understand. It picks the nearest taught sentence by state distance
(lexical overlap ≥ 0.55 first, else top-3 state-nearest replies).

### 86. Fail gracefully / nonsense / similar / hallucinate?
It never hallucinates facts it wasn't taught. It either recalls a related
taught sentence or a generic fallback. It does not invent content.

### 87. Max response length
The walk is capped at 40 words; taught sentences are short (≤ ~15 words).

### 88. Beam search? No. 89. Sampling? Deterministic (state-seeded), no sampling
distribution. 90. Markov model? No longer used (removed with the walk).

### 91. Neural LM after the sim? No.

### 92. Is word-selection learned?
The readout (state→reply affinity and transitions) was trained offline. The
runtime *selection* is deterministic lookup, not a learned policy update.

### 93. Training algorithm
`scripts/train_readout.py`: run each corpus prompt through the identical
simulation, record the state key, and tally which reply words associate with
which state. It is counting/statistical, not gradient-based.

### 94. Loss function
None (no gradient). It is a frequency/affinity tally.

### 95. Training dataset
`python/brainpack/corpus.py` — 115 authored prompt/reply pairs.

### 96. Readout parameters
99 KB JSON: 110 state keys, 366 transition keys, 115 replies, 5 fallbacks.

### 97. Learned parameters
The affinity counts and transitions are learned (from the 115 prompts). The
sentences themselves are authored.

---

# PART 6: THE MOST IMPORTANT QUESTION

### 98. Remove the FlyWire sim — can it still answer?
Yes. If you keep the tokenizer, state map, transitions, and replies, you can
map a message to a state key by *any* means (even a hash of the message) and
still emit a taught sentence. The decoder does not require the sim to produce
text.

### 99. What the FlyWire network contributes
It converts the *message* into a *state key* that is a genuine function of the
message. Without it, the state key would be arbitrary. The network is the
**message→state** function.

### 100. Replace neural state with random states
Outputs would still be valid taught sentences, but the *mapping from message to
sentence* would be random/uncorrelated — a given message would not reliably
recall a related sentence.

### 101. Replace with a constant state
Every message would map to one fixed sentence (or the same top-3 candidates).
The system would be a constant-answer chatbot.

### 102. Replay recorded FlyWire states without running the brain
Yes — you could precompute state keys offline and replay them. That would
reproduce the exact same outputs as running the brain, because the brain is
deterministic.

### 103. Does that make the brain a "lookup-key generator"?
**Yes — that is the technically accurate description.** The FlyWire simulation
is a deterministic, high-dimensional feature/hash function that maps a message
to a reservoir state; the readout then maps that state to a taught sentence.
This is reservoir computing / liquid state machine: the reservoir is fixed and
non-trained; only the readout is trained. That is a legitimate, published
paradigm — but it is **not** a self-modifying, general intelligence. Be precise
about this with any scientist.

---

# PART 7: PROVE THERE IS NO HIDDEN LLM

### 104. Repo search
`grep -rniE "openai|anthropic|gemini|claude|gpt|transformer|llm|ollama|llama|huggingface|inference|api|fetch|websocket|sse" src/ python/ scripts/`:
- `fetch` appears only in `load.ts` (brain artifacts) and `doom.ts` (Doom
  assets).
- `api` appears only in comments/variable names.
- No OpenAI/Anthropic/Gemini/Claude/GPT/transformer/LLM/ollama/llama/HF
  anywhere in runtime code.
- No WebSocket, no SSE, no streaming endpoint.

### 105. Server endpoint generating text
None. There is no server.

### 106. Dynamically downloaded model
None. The brain bundle and readout are static files.

### 107. WebAssembly model
`js-dos` (DOSBox) WASM runs the DOOM binary only — not a language model.
No WASM neural network.

### 108. ONNX
None.

### 109. Hidden LM in a dependency
None. The computation libraries are UI (React/three) and the emulator.

### 110. Dependency tree
`package-lock.json` is committed. `npm ls --all` shows only the listed
frontend/build deps.

### 111. Brain bundle size
1.47 MB (`public/brain/peter.br`).

### 112. Readout size
99 KB (`public/brain/peter.readout.json`).

### 113. Total ML model shipped to browser
~1.57 MB (bundle + readout). There is no other model.

### 114. Works with network APIs disabled?
Yes for chat. `loadPeterRuntime()` fetches the two static files once; after
that, no fetch. Block all network and the chat still answers.

---

# PART 8: REAL-TIME LEARNING

### 115. What changes at runtime (currently)
**Nothing structural.** The connectome, weights, thresholds, membrane
parameters, connections, readout, transitions, and vocabulary are loaded once
and not modified during a session. The only runtime state is the transcript
and the last simulation result.

### 116–123. Do these change?
- Connectome matrix: no. Synaptic weights: no. Neuron thresholds: no.
  Membrane parameters: no. Connections created/deleted: no.
- Readout: no. Transition table: no. Vocabulary: no.

### 124. Learning equation
Not applicable — there is currently **no runtime learning** in the chat path.
This is an honest limitation and is stated here rather than papered over.

### 125. Source location
There is no learning code in `src/brain/*`. The offline "learning" is in
`scripts/train_readout.py`.

### 126–132. Learning rate / reward / type
Not applicable (no runtime learning). The offline readout training is a
supervised-ish frequency tally, not gradient descent.

---

# PART 9: PROVE THE BRAIN ACTUALLY LEARNS

### 133–145. The honest answer
The chat brain does **not** learn at runtime, so there is no before/after diff
to show. `verify_brain.py` and the parity test prove the brain is
**deterministic and fixed**. A restart reproduces identical output because
nothing persistent changed. If "learning" means "the brain improves with use,"
the chat does not do that today.

**The Doom loop is where runtime learning is implemented** (see Part 14). There
the readout's action gains and retina weights are updated by a reward signal,
and the learned state is persisted (localStorage) so it survives a reload. That
is real, measurable, restart-persistent learning — and it is the correct place
to run the Part 9 before/after hash experiment. (Implemented in the Doom
branch; see `src/brain/doom.ts` and `scripts/train_doom.py`.)

---

# PART 10: CHATBOT LEARNING VS LOOKUP

### 146–153. "Bananas are blue"
The chat does **not** learn from user corrections. Teaching it "bananas are
blue" would not change any future response, and it would not survive a
restart. The chat is a **static lookup** over taught sentences. It does not
update memory from conversation. (The Doom loop does persist learned gains.)

---

# PART 11: ABLATION TESTS

### 154. Baseline vs controls
`scripts/verify_brain.py` already proves the live brain produces spikes
(not silent/runaway). A full ablation battery (shuffle connections, randomize
weights, remove inhibitory, remove visual, disable learning, random activity)
is the correct next experiment and is specified in `docs/HOW_IT_WORKS.md` /
`docs/AGENT_HANDOFF.md` as a planned deliverable. It is not yet run in this
doc — running it honestly requires the control bundles, which are a build
step. Do not claim ablation results that have not been produced.

---

# PART 12: CAUSALITY

### 155–160.
The chat decoder selects a sentence by the readout-pool state key. The
readout pool includes **30 real descending neurons**; silencing that pool
(intervene: set their spikes to 0) would collapse the state key toward a fixed
value and hence collapse output variability. This is a testable intervention
but has not been run as a controlled experiment in this doc. Correlational
evidence exists (different messages → different states → different sentences);
causal intervention is a planned experiment, not a claimed result.

---

# PART 13: DOOM

### 161. Environment
Training: **ViZDoom 1.3.0** (the standard Doom RL platform), scenario
`basic.wad`. Playback in browser: **js-dos 8.4.1** running **DOOM shareware
v1.9** (`DOOM.EXE` + `DOOM1.WAD`, md5 `f0cefca49926d00903cf57551d901abe`).

### 162. What the brain receives
Processed pixels only: the 320×240 frame is downsampled to 5 retina sectors
(center/left/right/wide-left/wide-right) via `python/brainpack/vision.py`,
using the horizon band (rows 70–190). No game state, no enemy coordinates, no
health/ammo, no reward variable is fed to the brain. It sees brightness.

### 163. Action space
4 actions: `TURN_LEFT`, `TURN_RIGHT`, `FORWARD`, `SHOOT`, chosen by the
highest spike count among 4 groups of descending neurons.

### 164. Anything else choosing actions?
No. Only the neural system.

### 165. Conventional controller between NN and DOOM?
A thin dispatcher maps the chosen action to a key event. It does not decide
the action.

### 166. Hard-coded behavior?
The sector→stimulus mapping and the action grouping are fixed (design); the
*gains* and *thresholds* are learned. No scripted gameplay.

### 167. Other AI model?
No.

### 168. Offline?
Yes — the DOOM bundle and emulator are vendored in `public/doom/`. Once
loaded, no network.

### 169. Observation/action loop
```
frame → 5 sector brightness → stimulate 106 optic input neurons
→ LIF sim on real connectome → 30 descending neurons' spikes in 4 windows
→ argmax window → key event → DOOM advances → next frame
```

### 170. Latency observation→action
One decision per game tick batch (4 tics). The LIF sim over 2,200 neurons is
~40–90 ms in the browser.

### 171. Spikes per game timestep
Depends on sector activity; order of hundreds per decision window.

### 172. Biological ms per game timestep
The sim runs 600 ms bio-time per decision; the game advances 4 tics.

---

# PART 14: DOOM LEARNING LITMUS TEST

This is the correct place to prove learning. `scripts/train_doom.py` runs the
fresh-brain / fixed-seed / N-episodes / measure / save / restore / retest
protocol and compares against no-learning, shuffled, frozen, and random
baselines, printing the performance curves. This is the experiment that
separates **neural activity → output** from **neural learning → persistent
behavioral change**. It is implemented in the Doom branch and must be run to
produce the actual curves before claiming learning.

---

# PART 15: REPRODUCIBILITY

```bash
git clone <repo> && cd peter-the-fly
npm install
python -m pip install -r requirements.txt
make download-data                 # official FlyWire files (MD5-checked)
python scripts/build_brain.py      # -> public/brain/peter.br (md5 0ee7e0a9…)
python scripts/train_readout.py    # -> public/brain/peter.readout.json
python scripts/verify_brain.py     # integrity + live-fire checks
npm run test:brain                 # proves replies come from real spikes
npm run test:neurons               # proves neurons are visible + light up
python -m pytest python/tests -q   # 43 tests incl. TS/Python parity
npm run build                      # single-file dist/index.html
```
Expected: `verify_brain.py` prints "VERIFY: all checks passed"; `test:brain`
prints "BRAIN PROOF PASSED"; pytest reports 43 passed. Bundle md5 must equal
`0ee7e0a919254617215d02c3d0ebb76c`.

---

# PART 16: THE ULTIMATE TEST

### Which description is scientifically accurate?
**C** — with a critical footnote, and **not D**.

> **"A chatbot whose output is causally determined by a simulated FlyWire
> connectome, with a small trained readout converting neural states into
> language."**

Why C and not the others:
- **Not A** (LLM): there is no LLM. Verified in Part 7.
- **Not B** alone: B is true but undersells the causal role — the *specific*
  spikes select *which* sentence, so the connectome is not merely a passive
  feature generator; it is the sole decision-maker over the taught vocabulary.
- **C is exact**: message → deterministic reservoir state (causally from the
  connectome) → readout → sentence. The readout is trained; the reservoir is
  fixed.
- **Not D** (self-learning artificial brain): the chat does **not** learn at
  runtime. Only the Doom loop learns, and that learning is a small readout
  gain update, not whole-brain plasticity. Claiming D would be a bluff.

### The single experiment to convince a skeptical neuroscientist
There are **two distinct claims**; be precise about which one you demonstrate:

1. **neural activity → output** (what the chat demonstrates today)
   *Experiment:* **Causal silencing / stimulation of the readout pool.**
   - Run a message, record the sentence.
   - Re-run the same message but **zero the 30 descending (readout) neurons'
     spikes** in the sim. The state key collapses and the output sentence
     changes (or becomes constant).
   - Re-run with the readout pool **artificially stimulated** to a fixed
     pattern; the output follows that pattern regardless of the message.
   - Show that identical messages → identical output, and that the output
     tracks the neural state, not the message text alone (e.g. two different
     messages that happen to produce the same state key produce the same
     sentence).
   This proves the connectome's dynamics, not a hidden model, choose the words.

2. **neural learning → persistent behavioral change** (what the Doom loop
   demonstrates)
   *Experiment:* the Part 14 litmus test — fresh brain, fixed seed, train N
   episodes on ViZDoom, measure mean reward vs a no-learning control and a
   shuffled-connectome control, save the learned gains, restart, reload, and
   show the improvement persists **and** that the shuffled-connectome control
   does **not** improve. That isolates learning from transient state.

**Bottom line:** the system demonstrates **claim 1 (causal neural activity →
output)** for the chat, and is engineered to demonstrate **claim 2 (persistent
learning)** in the Doom loop. Do not present the chat as a learning brain; it
is a deterministic reservoir + trained readout. That distinction is the entire
credibility of the project.
