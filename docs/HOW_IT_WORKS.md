# How Peter the Fly Works

*Written for a technical audience. Every number below is produced by the code
in this repository and is verifiable end-to-end.*

## TL;DR

Peter is a chatbot with **no language model**. Its only computational substrate
is a **2,200-neuron subnetwork of the real *Drosophila* connectome** (FlyWire
FAFB v783), simulated as **Leaky Integrate-and-Fire spiking neurons in the
visitor's browser**. Your message becomes stimulation of input neurons; the
network's genuine spike response selects Peter's words through a small readout
table that was trained offline on the *same* simulator. There is no cloud call,
no LLM, no canned replies, and nothing randomized at runtime — the variability
you see is the fly wiring's actual dynamics.

## 1. The data (all real, all public)

| Artifact | Value | Source |
| --- | --- | --- |
| Proofread neurons | 139,255 | `proofread_root_ids_783.npy`, Zenodo record 10676866 |
| Proofread directed pairs | 15,091,983 | `proofread_connections_783.feather` (same record; note the published "3.7M connections" figure uses Codex's synapse-level definition — see the NOTE in `python/brainpack/ingest.py`) |
| Synapse contacts | 54,492,922 summed over pairs | same file |
| Official MD5 checksums | verified at build time | `OFFICIAL_CHECKSUMS` in `python/brainpack/ingest.py` |

Selection of Peter's subnetwork is **not random**: the strategy
(`visual_pathway_r`, in `python/brainpack/subgraph.py`) starts from optic-lobe
neurons of the right hemisphere and expands along real connectivity through
medulla (ME_R), lobula (LO_R), and the ventral lateral protocerebrum
(AVLP_R/PVLP_R), guaranteeing a connected, sensory-rooted circuit:

- **2,200 neurons** — 1,136 optic, 540 central, 417 visual_projection, 41 descending
- **71,365 neuron-to-neuron edges** (60,660 enabled after pruning), each weighted
  by real synapse counts (median weight 6)
- **33,078 inhibitory edges**, signed by edge-level transmitter probabilities
  where published, else the neuron's `top_nt` (from the official
  flywire_annotations v3.1.0 release)

## 2. The simulation (the actual computing)

Both the browser runtime (`src/brain/sim.ts`) and the offline Python trainer
(`python/brainpack/lif.py`) implement one documented **parity spec**:

- **Model:** Leaky Integrate-and-Fire. `τ_mem = 22 ms` (excitatory neurons),
  `τ_inh = 9 ms` (neurons whose transmitter class is inhibitory), `V_rest = −58 mV`,
  `V_thresh = −48 mV`, `V_reset = −66 mV`, refractory 2 ms, `dt = 0.5 ms`.
- **Synapses:** each spike at neuron *u* reaches targets one step later; each
  edge fires stochastically with its release probability; current is
  `+ w·0.55` for excitatory, `− w·0.55·3.2` for inhibitory, `w` = synapse count.
- **Input:** your message is tokenized (FNV-1a hashed, projected through the
  bundle's token→neuron tables) into Poisson-style stimulation (30 drive units,
  120 ms window) of input-pool neurons.
- **Determinism:** all stochasticity comes from counter-based pcg2d hashing —
  no RNG anywhere. The same message on the same bundle reproduces the same
  spikes, bit-for-bit. A test (`python/tests/test_parity.py`) compiles the
  TypeScript runtime and asserts **identical spike trains** with the Python
  reference.

One message = **600 ms of biological time = 1,200 simulation steps** across
2,200 neurons, ~1,000–2,000 spikes, in ~40–90 ms of wall time in a browser tab.

## 3. Synaptic plasticity & online learning

In addition to static reservoir lookup, Peter features genuine **local synaptic plasticity** and long-term memory (`src/brain/plasticity.ts`, `src/brain/memory.ts`, `src/data/flyBrain.ts`):

- **Synaptic weight adaptation:** When Peter learns or corrects associations, active synapses between stimulated input pathways and participating neurons undergo localized Hebbian / delta adjustments.
- **Immutable connectome invariant:** Synaptic plasticity alters an overlay of synaptic weights (`peterPlasticity`) and learned associative facts (`peterMemory`), while the base FlyWire connectome graph (`public/brain/peter.brain`) remains cryptographically bit-for-bit identical (SHA-256 verified).
- **Shared & persistent brain:** Visitors start initialized from the owner-trained base brain state (`public/brain/peter.shared.json`), and individual learning continues locally in `localStorage`.

## 4. From spikes to words (the readout, and its honest limits)

The output pool's per-bin spike counts (6 bins × 100 ms) form a reservoir
state vector, quantized to a state key. Offline,
`scripts/train_readout.py` ran 85 short prompts (the corpus in
`python/brainpack/corpus.py`) through the *identical* simulation and recorded:

- `state_map` — which reply words associate with which neural states
- `transitions` — word→word continuation counts from the corpus
- `replies` — each taught reply with the state it produces

At runtime, the live state key retrieves candidate words and biases a Markov
walk; every ambiguous branch is decided by a hash stream seeded jointly by the
message and the **live spike state**, so different neural activity yields
different sentences with no runtime randomness.

**What this is NOT:** Peter is not an LLM and does not generalize. He is a
reservoir-computed lookup with ~84 learned states — think of a wind chime
tuned by a real connectome, or a parrot whose recall is driven by fly spikes.
He speaks short, simple English because that is what his 79 KB readout was
taught. Scientists should evaluate the *pipeline* (real data, real simulation,
real coupling), not expect conversation competence.

## 5. What the website shows is what the simulation produced

- **Neuron activity / Connectome Viewer** (`src/components/ConnectomeViewer.tsx`):
  Opens a dedicated dark FlyWire-gallery-style raster display showing every neuron that spiked in the last turn across anatomically labeled neuropil tracks (ME, LO, LOP, LA, etc.), displayed side-by-side with the generated reply.
- **3D Apparatus Inspection** (`src/three/LabScene3D.tsx`):
  An interactive WebGL 3D inspection view of the specimen on the laboratory bench under the observation bell, surrounded by micro-electrodes and instrumentation, accessible via the "Inspect in 3D" button.
- **3D Connectome Reference Project** (`PETERS BRAIN 3D/`):
  A separate standalone 3D reference connectome viewer containing 1,180 addressable render entities and normalized bilateral neuropil meshes, demonstrating anatomical arbor exploration.
- The **brain map** (`src/components/BrainMap.tsx`) lights regions by real
  per-region spike tallies from the last run.
- The **telemetry note** under each reply (neuron count, spike count, wall ms)
  is measured, never decorated.
- The **buzz** is cosmetic (Web Audio synthesis); it is a sound effect, not data.

If the brain bundle (`public/brain/peter.brain`) fails to load, Peter states that
he cannot think and that no simulation ran — the codebase contains **no
scripted answers at all**.

## 6. DOOM closed-loop simulation & Live 3D Neural Viewport

Peter includes a complete interactive closed-loop motor control pipeline for playing classic DOOM (`src/brain/doom.ts`, `src/agi/DoomModal.tsx`, `python/brainpack/doomtrain.py`):

- **Retina:** Game frames are mapped into 5 horizontal horizon sectors (`grayFromRgba`, `sectorBrightness`).
- **Connectome stimulation:** Sector luminance drives optic input neurons into the FlyWire LIF simulation.
- **Descending motor readout:** Spike counts across 30 real descending neurons in 4 post-stimulus windows form 4 action arms (`TURN_LEFT`, `TURN_RIGHT`, `FORWARD`, `SHOOT`).
- **Policy learning:** An epsilon-greedy bandit algorithm updates running action value estimates with decaying exploration rate, persisting across sessions in localStorage.
- **Live 3D Neural Viewport:** Clicking **"PLAY DOOM"** launches the integrated retro viewport and side-by-side 3D connectome visualization (`src/agi/DoomModal.tsx`). Each step visualizes retina sector activation, Central Complex arbitration, motor descending firing, and reward-driven plasticity flashes in real-time 3D.

## 7. Integrated AGI Mode & Live 3D Connectome Replacement

The frontend features a dedicated **AGI Workspace** and inline 3D brain integration (`src/agi/`):

- **Inline 3D Connectome Replacement:** Clicking **"LIVE 3D NEURONS"** or **"SEE IN 3D"** in the left panel replaces the static bench apparatus photo with a full interactive 3D FlyWire connectome (`src/agi/brain3d/InlineBrainView.tsx`) directly in place. Users can filter by neuropil regions (`MEDULLA`, `LAMINA`, `LOBULA`, `LOBULA PLATE`, `MUSHROOM BODY`, `FAN-SHAPED BODY`, `CENTRAL COMPLEX`, `ANTENNAL LOBE`, `LATERAL HORN`, `PROTOCEREBRAL BRIDGE`, `NODULI`, `ELLIPSOID BODY`), orbit/zoom, and watch real LIF spikes illuminate in synchrony with speech.
- **Dedicated AGI Workspace:** Clicking **"AGI MODE"** opens the cognitive cockpit (`src/agi/AgiWorkspace.tsx`), providing split-screen 3D connectome exploration with 7 visualization modes, live LIF membrane potential and spike telemetry, Hebbian memory inspection, targeted micro-stimulation controls, and single-neuron inspection.
- **Real-Time LIF Bridge:** `src/agi/simBridge.ts` bridges the 2,200 LIF simulated neurons directly to 3D visual proxy neurons, rendering authentic firing waves and synapse transfers.


## 8. Security and deployment protection

When deployed on Cloudflare Pages, several hardening measures are enforced (`public/_headers`, `public/robots.txt`):

- **Hotlink & Asset Theft Lockdown:** `public/_headers` applies strict Cross-Origin Resource Policy (`Cross-Origin-Resource-Policy: same-origin`) and restricts CORS so external sites cannot hotlink or steal the compiled connectome bundle (`peter.brain`) or readout tables.
- **Clickjacking & Embedding Prevention:** Enforces `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`.
- **MIME Sniffing Protection:** `X-Content-Type-Options: nosniff`.
- **Bot Crawling Restriction:** `public/robots.txt` disallows automated scrapers from ingesting the raw brain artifacts (`/brain/`).
- **Zero Exposed Cloud Secrets:** 100% client-side computation with no third-party API keys or credentials exposed in the build.

## 9. Deep Dive FAQ

For explicit code-level answers regarding learning mechanisms, DOOM causality, plasticity limits, and infrastructural claims, please read the [Architectural FAQ](ARCHITECTURE_FAQ.md) (`docs/ARCHITECTURE_FAQ.md`).

## 10. Verification suite

```bash
# Brain & simulation verification
npm run test:brain              # proves replies are driven by real spikes
npm run test:neurons            # proves zero external network calls after initial load
python scripts/verify_brain.py  # integrity + live-fire simulation checks
python -m pytest python/tests -q

# Synaptic plasticity verification
npm run test:synapse            # proves synaptic weights change while connectome hash is invariant
npm run test:learning           # verifies multi-turn persistent learning

# Security sanity check (against live Cloudflare URL)
npm run test:security -- https://your-site.pages.dev
```

## 9. Explicit non-claims

Peter is not conscious, not intelligent, and not a house-fly brain (the data is
*Drosophila*). The system does not demonstrate that a fly brain "can speak
English"; it demonstrates a reproducible, fully local pipeline in which a real
connectome's simulated dynamics are the *only* computational engine behind a
chat interface. FlyWire data is CC BY-NC 4.0; attribution is preserved in
`THIRD-PARTY-NOTICES.md`.
