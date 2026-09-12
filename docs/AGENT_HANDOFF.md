# PETER THE FLY — Agent Handoff

> **For any AI agent (or human) continuing this project.** Read this first.
> Last updated: 2026-09-12 (honesty pass: scripted fallback deleted, Peter-the-Fly rename, live spike raster, buzz). Everything below reflects the verified state of the repo.

## 0. The one-paragraph pitch

Peter is a conversational AI whose "brain" is a real spiking-neural subnetwork
built from the **FlyWire FAFB v783** Drosophila connectome (official, checksum-
verified public data). The user's message stimulates input neurons; the real
connectome transforms it into spike patterns (liquid/reservoir computing); a
tiny offline-trained **readout layer** ("the teacher") maps those spike patterns
to English words. There is **no cloud LLM, no external inference, no fake data**
— the fly's neurons do the computing, the readout merely translates.

## 1. Decisions already locked (do not relitigate)

| Decision | Value | Why |
| --- | --- | --- |
| Language capability | **Option A (50/50)**: fly network computes, ~1 MB trained readout translates | User: "everything from the fly, nothing external; little training so the fly can speak" |
| Where it runs | **Visitor's browser** (TypeScript sim) + static files on **Cloudflare Pages** | User: free hosting, no server |
| Python's role | **Offline toolchain only** (ingest → build bundle → train readout). Brian2/FastAPI/llama.cpp from the original spec were **dropped** | Cloudflare Workers can't run Python; browser-only keeps it free |
| Frontend | **Untouched visual design.** Wiring is surgical | Original spec: frontend is source of truth |
| Frontend fallback | **None.** If `public/brain/peter.br` fails to load, Peter states that no simulation ran and refuses to answer. The scripted engine was deleted | Scientists are the audience; nothing is ever faked |

## 2. Verified facts (as of last green run)

- **Data (official, MD5-verified against Zenodo record 10676866):**
  - 139,255 proofread neurons (`proofread_root_ids_783.npy`)
  - **15,091,983 unique directed pairs** in `proofread_connections_783.feather`
    (⚠️ NOT the published 3,732,460 — that's Codex's *synapse-level* definition;
    see the NOTE in `python/brainpack/ingest.py`)
  - 54,492,922 total synapses across those pairs
- **Peter's brain bundle** (`public/brain/peter.br`, ~1.47 MB):
  - 2,200 neurons / 71,365 edges from a real FlyWire visual pathway
    (optic → central → visual_projection → descending; right hemisphere:
    ME_R, LO_R, AVLP_R, PVLP_R), selection strategy `visual_pathway_r`
  - 33,078 inhibitory edges from real transmitter probabilities (`top_nt`)
  - Edge signs come from edge-level transmitter probabilities when present,
    else neuron `top_nt`
- **Readout** (`public/brain/peter.readout.json`, ~79 KB): 84 states,
  728 transition pairs, trained on 85 corpus prompts on the *same* simulator
- **Parity:** the TS runtime and Python trainer produce **bit-identical spikes**
  (counter-based pcg2d RNG, aligned binary bundle format `PETERBR1`). Enforced
  by `python/tests/test_parity.py`.
- **Verification status (all green):**
  - `python scripts/verify_brain.py` → all checks passed (checksums, bundle,
    live-fire sim: 898 spikes/600 ms, deterministic, not runaway)
  - `npm run test:brain` → real root IDs (720575940... range), real spikes,
    deterministic, 3 different messages → 3 different replies
  - `python -m pytest python/tests -q` → 43 passed
  - `npm run test:web` → passed (node:test + esbuild-compiled runtime)
  - `./node_modules/.bin/tsc --noEmit` → clean
  - `npm run build` → single-file `dist/index.html` (~1.29 MB)

## 3. Repo map

```
data/flywire/raw/            # official cache, 1.1 GB, GITIGNORED, re-downloadable
python/brainpack/            # ingest, subgraph, lif, spikegen, bundle, corpus
python/tests/                # 43 tests incl. TS/Python parity
scripts/                     # build_brain.py, train_readout.py, verify_brain.py,
                             # build_corpus_stats.py
src/brain/                   # BROWSER RUNTIME: bundle.ts (parser), sim.ts (LIF),
                             # spikegen.ts, talk.ts (decoder), load.ts, index.ts
src/components/              # BootScreen, BootFly, Disclosure, BrainMap, ChatPanel,
                             # LeftPanel, Dialog, Marks, DataPathway
src/three/                   # R3F scene (LabScene3D, Machine, Fly, Wiring, ...)
src/data/flyBrain.ts         # real-brain bridge (scripted engine deleted: brain-only answers)
public/brain/                # COMMITTED artifacts: peter.br + peter.readout.json
tests/brainproof.mjs         # runtime proof (npm run test:brain)
tests/brain.test.mjs         # web unit tests
docs/frontend_backend_contract.md
docs/DEPLOY.md               # Cloudflare Pages deployment
```

## 4. Commands

```bash
npm install                        # frontend deps (vite, react, r3f, esbuild)
python -m pip install -r requirements.txt
make download-data                 # ~900 MB official files → data/flywire/raw
python scripts/build_brain.py      # → public/brain/peter.br
python scripts/train_readout.py    # → public/brain/peter.readout.json
python scripts/verify_brain.py     # refuses to pass a fake/silent brain
npm run test:brain                 # proves replies come from real spikes
npm run test:web && python -m pytest python/tests -q
npm run dev                        # local frontend (serves public/brain too)
npm run build                      # single-file dist/index.html
```

## 5. Pitfalls learned the hard way (do not rediscover these)

1. **Bundle alignment:** `BigInt64Array` views need 8-byte-aligned offsets. The
   writer (python) and parser (TS) both pad sections — keep them in lockstep.
2. **RNG parity:** never use language RNGs (`random`, `Math.random`). Only the
   counter-based pcg2d stream in `spikegen`/`lif` (identical constants both
   sides). `v_init` lane order is `(0, i)` — not `(i, 0)`.
3. **Edge identity:** synaptic delivery hashes the **original edge index**,
   never its position in a filtered/sorted array.
4. **FlyWire root IDs are 18-digit** (`720575940...` ≥ 7.2e17). A range check
   with 17 digits silently rejects every real ID.
5. **Windows shell:** run esbuild via `node node_modules/esbuild/bin/esbuild`,
   never the `.bin` shim directly; node:test dynamic imports need
   `pathToFileURL`.
6. **The synthetic test bundle is intentionally hot** (boosted weights) so
   activity propagates — the real bundle's dynamics are separately verified by
   `verify_brain.py` live-fire checks.
7. **Large JSX file writes were error-prone in this environment.** Prefer small
   `str_replace` edits for big components (BootScreen, ChatPanel).
8. The frontend bench photo already contains a fly — don't overlay another.

## 6. What's NOT done yet (pick up here)

1. **GitHub repo** — commit everything (except ignored paths), create
   `peter-the-fly` with description + topics (user asked for a professional,
   funny About).
2. **Cloudflare Pages deploy** — build command `npm run build`, output `dist/`,
   framework preset "Vite"; see `docs/DEPLOY.md`. Committing `public/brain/`
   means the deployed site ships a real brain with zero CI changes.
3. **Optional niceties:** CI workflow (pytest + tsc + build on PR), a
   "SIMULATION" badge in LeftPanel driven by per-message telemetry (the
   `PeterTelemetry` object already carries everything), more corpus prompts
   (`python/brainpack/corpus.py` — the readout's vocabulary is currently small,
   which is why replies can be short/cryptic).
4. **If you rebuild the brain:** run the full chain
   (`build_brain.py → train_readout.py → verify_brain.py → test:brain`) —
   the readout must be trained on the exact bundle it ships with.

## 7. Honesty rules (from the original spec, still binding)

Never claim: Peter is conscious; this is a biological fly brain; the LLM runs
"inside" the fly; the data is fabricated. Never fabricate telemetry — every
number shown comes from `PeterTelemetry`. FlyWire data is CC BY-NC 4.0 —
attribution is in `THIRD-PARTY-NOTICES.md` and must stay.
