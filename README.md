# PETER THE FLY

*A conversation — and an AGI experiment — running on a real fly-brain connectome.*

Peter is a chat system whose "thinking" is a spiking neural simulation of an
actual connectome: the public **FlyWire FAFB v783** reconstruction of the adult
fruit-fly brain (139,255 neurons, 3,732,460 connections). Your message becomes
electrical stimulation of a real subnetwork; the spikes that ripple through it
choose Peter''s words. Everything runs **locally** — the simulation happens in
the visitor''s browser, and the language layer is a tiny readout trained on
Peter''s own dynamics. No cloud. No LLM APIs. No fabricated data.

```
USER MESSAGE
  ↓ token → input-neuron projection   (documented hash spec)
  ↓ stimulus of real input neurons     (120 ms)
  ↓ LIF spiking simulation            (450–600 ms, dt 0.5 ms, in the browser)
  ↓ readout-pool spike counts         (the "reservoir state")
  ↓ state-biased word decoding        (trained readout, ~1 MB)
PETER''S REPLY + real telemetry
```

## What is real and what is taught

- **Real:** every neuron, edge, synapse count, class and neurotransmitter sign
  in the bundle comes from the official FlyWire v783 public release
  (CC BY-NC 4.0). Checksums verify it.
- **Taught:** Peter''s vocabulary comes from a small authored corpus
  (`python/brainpack/corpus.py`) — like teaching a parrot a few dozen
  sentences — except recall is driven by the connectome''s own spiking.
- **Not claimed:** consciousness, a house-fly brain (the data is *Drosophila*),
  or that a language model lives inside a fly. The field notes say exactly
  what is running.

## Repository layout

```
src/                    React 19 + Vite frontend
src/brain/              Browser runtime (bundle parser, LIF sim, decoder, R-STDP, AGI core)
  ├── sim.ts            LIF spiking simulation (2,200 neurons, dt=0.5ms)
  ├── talk.ts           Markov readout decoder (~79 KB readout table)
  ├── doom.ts           DOOM closed-loop motor control + epsilon-greedy bandit
  ├── plasticity.ts     Hebbian co-activation overlay (simple, chat-only)
  ├── rstdp.ts          Three-Factor Reward-Modulated STDP (AGI mode)
  ├── agiCore.ts        FlyWireAgiCore — unified AGI cognitive engine
  └── memory.ts         Associative fact store
src/agi/                AGI workspace and DOOM modal
  ├── AgiWorkspace.tsx  4-tab cognitive cockpit
  ├── DoomModal.tsx     DOOM viewport + live 3D neural overlay
  ├── simBridge.ts      LIF spike → 3D BrainRuntime event bridge
  └── brain3d/          Inline WebGL 3D connectome viewer
src/components/         BootScreen, LeftPanel, ChatPanel, BrainMap, ...
public/brain/           Committed artifacts: peter.br, peter.readout.json
python/brainpack/       Offline toolchain (ingest, selection, LIF, bundle)
python/tests/           43 tests incl. cross-language parity test
scripts/                build_brain.py, train_readout.py, verify_brain.py, audit_agi.mjs
evaluation/v1/          AGI evaluation curriculum and evaluator framework
tests/                  brainproof.mjs, brain.test.mjs, proof-agi.mjs (7-ablation battery)
docs/                   HOW_IT_WORKS.md, ARCHITECTURE_FAQ.md, DEPLOY.md, ...
PETERS BRAIN 3D/        Local-only standalone 3D viewer (gitignored — not deployed)
```

## Quickstart

Prerequisites: Node 18+, Python 3.10+.

```bash
# 1. frontend deps
npm install

# 2. python toolchain
python -m venv .venv && source .venv/bin/activate  (Windows: .venv\Scripts\activate)
pip install -r requirements.txt

# 3. download the OFFICIAL FlyWire data (852 MB edge list + 1.1 MB ids + annotations)
python scripts/build_brain.py            # first run downloads; later runs reuse cache

# 4. train the readout on Peter''s corpus (~85 prompts, minutes on CPU)
python scripts/train_readout.py

# 5. verify everything (checksums, counts, live-fire simulation, parity)
python scripts/verify_brain.py
pytest

# 6. run the site
npm run dev
```

`npm run test:web` runs the TS-side unit tests. The full parity guarantee
(Python and JS spike-for-spike identical) is part of `pytest`.

## AGI Mode

Clicking **AGI** in the masthead opens the cognitive cockpit — a split-screen
workspace with the live 3D connectome on the left and four tabs on the right:

| Tab | What it shows |
| --- | --- |
| **Cognition** | Send any input; the FlyWire reservoir predicts a token via L2-normalized population decoding. R-STDP adjusts synaptic weights after each answer. |
| **Memory** | Inspect the plasticity overlay: total modified synapses, mean modifier, session episodes, reward baseline. Reset learning. |
| **Experiment** | Micro-stimulate any neuropil region, control R-STDP learning rate, run targeted ablations. |
| **Validation** | Run the 7-ablation proof battery in-browser; confirms emergent (non-hardcoded) intelligence. |

The AGI core (`src/brain/agiCore.ts`) uses **Three-Factor R-STDP**
(`src/brain/rstdp.ts`) — genuine spike-timing-dependent plasticity with a reward
third-factor. Mathematical spec:

```
Dt  = t_post - t_pre
K(Dt) = A+ * exp(-Dt / tau+)   [causal:     potentiation]
       -A- * exp( Dt / tau-)   [anti-causal: depression]
Dw  = eta * (R - baseline) * eligibility
```

Constants: `tau+ = 20 ms`, `tau- = 25 ms`, `A+ = 1.0`, `A- = 0.85`,
`tau_eligibility = 200 ms`, `eta = 0.045`, modifiers clamped [0.25, 2.5],
max 50,000 stored synapses. Persisted to `localStorage["peter-rstdp-v2"]`.

## DOOM Mode

Clicking **PLAY DOOM** opens a retro viewport alongside a live 3D neural overlay:

1. Game frames → 5 luminance sectors → optic input neuron stimulation
2. LIF simulation → 30 descending motor neurons → 4 action arms
3. Epsilon-greedy bandit learns action values from reward signal
4. 3D connectome displays spike waves in real time via `simBridge.ts`

> **Honest note:** The bandit does the RL. The FlyWire connectome provides the
> visual feature extraction (reservoir). Synaptic weights are **not** modified
> by DOOM reward — only the bandit''s Q-values update.

## Inline 3D Connectome

Clicking **LIVE 3D NEURONS** in the left panel replaces the static bench photo
with a full interactive WebGL 3D brain — no new tab. Filter by 12 neuropil
regions (MEDULLA, LAMINA, LOBULA, LOBULA PLATE, MUSHROOM BODY, FAN-SHAPED BODY,
CENTRAL COMPLEX, ANTENNAL LOBE, LATERAL HORN, PROTOCEREBRAL BRIDGE, NODULI,
ELLIPSOID BODY). Spike waves animate in real time as Peter processes each message.

## Deployment (Cloudflare Pages, free)

- Build command: `npm run build`
- Output dir: `dist`
- **Bundle: 1.52 MB (gzip 430 KB)** — well under the 25 MB limit
- Commit `public/brain/*` (or build in CI).
- No server, no functions required. The whole experiment ships as static files.

## Development commands

| Command | Does |
| --- | --- |
| `npm run dev` | Frontend dev server |
| `npm run build` | Production build (single-file, ~1.52 MB) |
| `npm run test:web` | TS runtime unit tests |
| `node tests/proof-agi.mjs` | 7-ablation AGI proof battery (requires esbuild) |
| `node scripts/audit_agi.mjs` | Hard-coded logic audit |
| `python scripts/build_brain.py` | Ingest FlyWire + build bundle |
| `python scripts/train_readout.py` | Train the readout locally |
| `python scripts/verify_brain.py` | Verify data + bundle + live-fire sim |
| `pytest` | Full test suite (synthetic + parity) |

## Data provenance

| Dataset | Source | License |
| --- | --- | --- |
| FlyWire FAFB v783 connectivity | Zenodo 10676866 (FlyWire Consortium) | CC BY-NC 4.0 |
| FlyWire FAFB v783 annotations | flyconnectome/flywire_annotations v3.1.0 | CC BY-NC 4.0 |
| Codex / FlyWire ecosystem | codex.flywire.ai | reference |

See `THIRD-PARTY-NOTICES.md` for software licenses and
`docs/frontend_backend_contract.md` for the component-to-engine contract.

## Simulation tiers

The bundle simulates a selected subnetwork (default: ~2,200 neurons grown from
real sensory neurons toward real motor output):

| Flag | Effect |
| --- | --- |
| `--max-neurons N` | Subnetwork size (larger = slower, still milliseconds) |
| `--strategy` | `sensory_to_motor` or `neuropil_neighborhood` |
| `--min-synapses N` | Real-synapse floor for edges (default 3) |

## Reproducibility

Every bundle records: dataset version, manifest MD5, seed (783), selection
strategy + stats, simulation constants, and build timestamp. Simulations are
fully deterministic per message (counter-based hashing, no RNG), verified by
the parity tests.
