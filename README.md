# PETER THE FLY

*A conversation running on a real fly-brain connectome.*

Peter is a chat system whose "thinking" is a spiking neural simulation of an
actual connectome: the public **FlyWire FAFB v783** reconstruction of the adult
fruit-fly brain (139,255 neurons, 3,732,460 connections). Your message becomes
electrical stimulation of a real subnetwork; the spikes that ripple through it
choose Peter's words. Everything runs **locally** — the simulation happens in
the visitor's browser, and the language layer is a tiny readout trained on
Peter's own dynamics. No cloud. No LLM APIs. No fabricated data.

```
USER MESSAGE
  ↓ token → input-neuron projection   (documented hash spec)
  ↓ stimulus of real input neurons    (120 ms)
  ↓ LIF spiking simulation            (600 ms, dt 0.5 ms, in the browser)
  ↓ readout-pool spike counts         (the "reservoir state")
  ↓ state-biased word decoding        (trained readout, ~1 MB)
PETER'S REPLY + real telemetry
```

## What is real and what is taught

- **Real:** every neuron, edge, synapse count, class and neurotransmitter sign
  in the bundle comes from the official FlyWire v783 public release
  (CC BY-NC 4.0). Checksums verify it.
- **Taught:** Peter's vocabulary comes from a small authored corpus
  (`python/brainpack/corpus.py`) — like teaching a parrot a few dozen
  sentences — except recall is driven by the connectome's own spiking.
- **Not claimed:** consciousness, a house-fly brain (the data is *Drosophila*),
  or that a language model lives inside a fly. The field notes say exactly
  what is running.

## Repository layout

```
src/                    existing frontend (React 19 + Vite, UNCHANGED design)
src/brain/              the browser runtime (bundle parser, sim, decoder)
public/brain/           built artifacts (peter.br, peter.readout.json, sidecar)
python/brainpack/       offline toolchain (ingest, selection, LIF, bundle)
python/tests/           pytest suite incl. cross-language parity test
scripts/                build_brain.py, train_readout.py, verify_brain.py
docs/                   frontend_backend_contract.md
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

# 4. train the readout on Peter's corpus (~80 prompts, minutes on CPU)
python scripts/train_readout.py

# 5. verify everything (checksums, counts, live-fire simulation, parity)
python scripts/verify_brain.py
pytest

# 6. run the site
npm run dev
```

`npm run test:web` runs the TS-side unit tests. The full parity guarantee
(python and JS spike-for-spike identical) is part of `pytest`.

## Deployment (Cloudflare Pages, free)

- Build command: `npm run build`
- Output dir: `dist`
- Commit `public/brain/*` (or build them in CI: `pip install -r requirements.txt && python scripts/build_brain.py && python scripts/train_readout.py && npm run build`).
- No server, no functions required. The whole experiment ships as static files.

## Simulation tiers

The bundle currently simulates a selected subnetwork (default: ~2,200 neurons
grown from real sensory neurons toward real motor output — see
`python/brainpack/subgraph.py`). Tier knobs:

| Flag | Effect |
| --- | --- |
| `--max-neurons N` | subnetwork size (larger = slower chat, still milliseconds) |
| `--strategy` | `sensory_to_motor` or `neuropil_neighborhood` |
| `--min-synapses N` | real-synapse floor for edges (default 3) |

## Development commands

| Command | Does |
| --- | --- |
| `npm run dev` | frontend dev server |
| `npm run build` | production build (single-file) |
| `npm run test:web` | TS runtime unit tests |
| `python scripts/build_brain.py` | ingest FlyWire + build bundle |
| `python scripts/train_readout.py` | train the readout locally |
| `python scripts/verify_brain.py` | verify data + bundle + live-fire sim |
| `pytest` | full test suite (synthetic + parity; real-data tests need cache) |

## Data provenance

| Dataset | Source | License |
| --- | --- | --- |
| FlyWire FAFB v783 connectivity | Zenodo 10676866 (FlyWire Consortium) | CC BY-NC 4.0 |
| FlyWire FAFB v783 annotations | flyconnectome/flywire_annotations v3.1.0 | CC BY-NC 4.0 |
| Codex / FlyWire ecosystem | codex.flywire.ai | reference |

See `THIRD-PARTY-NOTICES.md` for software licenses and
`docs/frontend_backend_contract.md` for the component-to-engine contract.

## Reproducibility

Every bundle records: dataset version, manifest MD5, seed (783), selection
strategy + stats, simulation constants, and build timestamp. Simulations are
fully deterministic per message (counter-based hashing, no RNG), verified by
the parity tests.
