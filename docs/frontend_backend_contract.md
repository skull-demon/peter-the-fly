# Frontend ↔ Backend Contract

**PETER THE FLY / FlyBrain** — this document maps every existing frontend
component to the engine that drives it. The frontend's visual design is the
source of truth; nothing visual was redesigned.

> Architecture note: after the compute decision, the "backend" is not a server.
> The engine is a **browser runtime** (`src/brain/`) fed by a **prebuilt
> brain bundle** (`public/brain/peter.br`) produced from the official
> FlyWire FAFB v783 data by the Python toolchain (`scripts/build_brain.py`).
> The contract below maps components to that runtime + bundle artifacts.

## 1. Artifacts

| Artifact | Produced by | Consumed by | Purpose |
| --- | --- | --- | --- |
| `public/brain/peter.br` | `scripts/build_brain.py` (FlyWire Zenodo 10676866 + annotations v3.1.0) | `src/brain/bundle.ts` | The connectome: neurons, edges, weights, signs, pools, token projections |
| `public/brain/peter.readout.json` | `scripts/train_readout.py` | `src/brain/talk.ts` | The taught language layer: state→words, transitions, fallbacks |
| `public/brain/peter.brain.json` | `scripts/build_brain.py` | UI status/readouts | Human-readable sidecar (counts, regions, provenance) |
| `data/flywire/data_manifest.json` | `brainpack.ingest` | `verify_brain.py`, reproducibility | Official checksums, counts, provenance |

## 2. Component → Engine map

| Frontend component | Existing behavior | Engine now drives it | Contract |
| --- | --- | --- | --- |
| `ChatPanel.tsx` `transmit()` | local regex engine, fake notes (DELETED) | `talk()` in `src/brain/talk.ts` via `askPeterOrScripted()` | input: user text; effect: real spiking sim on `peter.br`; output: `{text, note, real, sim}`. No scripted fallback exists - if the bundle is missing, Peter says no simulation ran |
| `LeftPanel.tsx` 3D Brain | Static bench photo | `InlineBrainView.tsx` | Replaces static image with live 3D WebGL FlyWire connectome. |
| `AgiWorkspace.tsx` | N/A (New Feature) | `agiCore.ts`, `rstdp.ts` | 4-tab cognitive cockpit for AGI interaction, memory inspection, experiments, and proof validation. |
| `DoomModal.tsx` | N/A (New Feature) | `doom.ts` | Closed-loop motor control mapping 5 visual sectors to 30 motor descending neurons via epsilon-greedy bandit. |
| `App.tsx` field notes | claimed "scripted responses, not a model" | truthful copy | describes the real pipeline (still no overclaiming: "map, not a mind") |

## 3. Data flow (one message)

```
USER MESSAGE (ChatPanel / AgiWorkspace)
  ↓ tokenize + semantic categories        (spikegen.ts  ==  spikegen.py)
  ↓ token/category → input-pool rows      (FNV-1a projection, parity spec)
  ↓ Poisson-style stimulus, 120 ms window (pcg2d hashing,   parity spec)
  ↓ LIF simulation, 600 ms, dt 0.5 ms     (sim.ts       ==  lif.py)
  ↓ readout-pool spike counts             (reservoir state vector)
  ↓ L2-Normalized population decoding     (agiCore.ts) OR state-biased Markov walk (talk.ts)
  ↓ R-STDP Weight Update                  (rstdp.ts)
  ↓ reply + real telemetry note
CHAT UI (existing reveal animation)
```

## 4. Telemetry note format (chat annotation line)

`FAFB v783 · {neurons_simulated} NEURONS · {spike_count} SPIKES · {simulation_ms}MS`

All numbers are measured from the actual simulation run. There is no scripted
path anymore; a missing bundle produces an explicit "no simulation ran" reply.

## 5. HTTP surface

The site is fully static (Cloudflare Pages). The runtime fetches:

| Request | Response |
| --- | --- |
| `GET /brain/peter.br` | binary bundle (see layout in `python/brainpack/bundle.py`) |
| `GET /brain/peter.readout.json` | readout JSON (`format: "peter-readout-1"`) |
| `GET /brain/peter.brain.json` | sidecar (status/readouts; optional) |

No other network calls. No cloud AI. No WebSocket needed (single-page,
single-process simulation in the browser).

## 6. Parity guarantee

`python/tests/test_parity.py` compiles the TS runtime with esbuild and runs
the same synthetic bundle + stimulus through both implementations, asserting
**bit-identical spike matrices**.
