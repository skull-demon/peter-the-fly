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
| `ChatPanel.tsx` `transmit()` | local regex engine, fake notes | `talk()` in `src/brain/talk.ts` via `askPeterOrScripted()` | input: user text; effect: real spiking sim on `peter.br`; output: `{text, note, real}`; scripted fallback only if bundle missing (note labeled `SCRIPTED DEMO`) |
| `ChatPanel.tsx` composer meta | hard-coded `LOCAL DEMONSTRATION` | `probeBrainAvailable()` | label shows `FLYWIRE v783 · IN-BROWSER` when bundle present, else `SCRIPTED FALLBACK · LOCAL` |
| `ChatPanel.tsx` streaming | char-interval reveal | unchanged (theatrical reveal of the real reply) | text arrives complete; reveal speed untouched |
| `LeftPanel.tsx` readouts | hard-coded `139,255 / 50M+ / Local` | optional props `brainStatus`, `brainCounts` | neurons count = simulated subgraph size from bundle meta when live; falls back to the design's default copy otherwise |
| `LeftPanel.tsx` connectome dot | static `CONNECTOME ONLINE` | `status-dot.online/offline/loading` | reflects real runtime status; CSS addition only (3 lines, same palette) |
| `App.tsx` "Test the signal" | 4.8 s theatrical timer only | runs a REAL 300 ms simulation through the bundle | same 4.8 s visual window; the sim actually runs underneath |
| `App.tsx` field notes | claimed "scripted responses, not a model" | truthful copy | describes the real pipeline (still no overclaiming: "map, not a mind") |
| `BenchScene.tsx`, `DataPathway.tsx`, 3D scene | `active` boolean animations | unchanged | driven by `active` exactly as before (true while the sim/pipeline runs) |
| `Dialog.tsx`, `Marks.tsx`, `useMotionPreference` | static | unchanged | n/a |

## 3. Data flow (one message)

```
USER MESSAGE (ChatPanel)
  ↓ tokenize + semantic categories        (spikegen.ts  ==  spikegen.py)
  ↓ token/category → input-pool rows      (FNV-1a projection, parity spec)
  ↓ Poisson-style stimulus, 120 ms window (pcg2d hashing,   parity spec)
  ↓ LIF simulation, 600 ms, dt 0.5 ms     (sim.ts       ==  lif.py)
  ↓ readout-pool spike counts per 100 ms  (reservoir state)
  ↓ state key (quantised)                 (stateKey()   ==  state_key())
  ↓ state-biased word walk + transitions  (talk.ts, from peter.readout.json)
  ↓ reply + real telemetry note
CHAT UI (existing reveal animation)
```

## 4. Telemetry note format (chat annotation line)

`FAFB v783 · {neurons_simulated} NEURONS · {spike_count} SPIKES · {simulation_ms}MS`

All numbers are measured from the actual simulation run. The scripted
fallback labels its notes `SCRIPTED DEMO · …` so a demo can never be
mistaken for the real pipeline.

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
**bit-identical spike matrices**. Therefore: the readout was trained on
exactly the dynamics the visitor's browser runs.

## 7. Honesty rules encoded in the contract

- If the bundle is missing → scripted answers are visibly labeled as such.
- Notes never show numbers that were not measured.
- Field notes claim: real connectome map, real spikes, taught words,
  not conscious, not a house-fly brain (it is Drosophila data).
- No cloud inference anywhere in the pipeline.
