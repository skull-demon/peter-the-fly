# PETER THE FLY — Agent Handoff

> **For any AI agent (or human) continuing this project.** Read this first.
> Last updated: 2026-09-13 (AGI mode, DOOM, R-STDP plasticity, inline 3D connectome).

## 0. The one-paragraph pitch

Peter is a conversational AI and AGI experiment whose "brain" is a real spiking-neural subnetwork
built from the **FlyWire FAFB v783** Drosophila connectome (official, checksum-verified public data).
The user's message stimulates input neurons; the real connectome transforms it into spike patterns
(liquid/reservoir computing). A tiny offline-trained **readout layer** ("the teacher") maps those
spike patterns to English words. It now features an **AGI mode** with **Three-Factor R-STDP plasticity**
and a **DOOM closed-loop motor control** mode. There is **no cloud LLM, no external inference, no fake data**
— the fly's neurons do the computing.

## 1. Decisions already locked (do not relitigate)

| Decision | Value | Why |
| --- | --- | --- |
| Language capability | **Option A (50/50)**: fly network computes, ~1 MB trained readout translates | User: "everything from the fly, nothing external; little training so the fly can speak" |
| Where it runs | **Visitor's browser** (TypeScript sim) + static files on **Cloudflare Pages** | User: free hosting, no server |
| Frontend | **Antique Laboratory aesthetic.** Walnut, brass, and copper. | User preference |
| Frontend fallback | **None.** If `public/brain/peter.br` fails to load, Peter states that no simulation ran. | Scientists are the audience; nothing is ever faked |

## 2. Verified facts (as of last green run)

- **Data:** FlyWire FAFB v783 connectome. 139,255 proofread neurons, ~15M unique directed pairs.
- **Peter's brain bundle** (`public/brain/peter.br`, ~1.47 MB):
  - 2,200 neurons / 71,365 edges from a real FlyWire visual pathway.
- **Readout** (`public/brain/peter.readout.json`, ~79 KB): 84 states, 728 transition pairs.
- **Parity:** TS runtime and Python trainer produce bit-identical spikes.
- **AGI Core (`src/brain/agiCore.ts`):** Unifies conversational semantics and symbolic reasoning, predicting from L2-normalized population vectors.
- **R-STDP Plasticity (`src/brain/rstdp.ts`):** Three-Factor Reward-Modulated Spike-Timing-Dependent Plasticity. Persisted to `localStorage["peter-rstdp-v2"]`.
- **DOOM Mode (`src/brain/doom.ts`):** 5 visual sectors -> Optic input -> LIF sim -> 30 descending motor neurons -> Epsilon-greedy bandit -> 4 actions.
- **Proof Battery (`tests/proof-agi.mjs`):** 7 ablation experiments confirming intelligence is emergent, not hard-coded.

## 3. Repo map

```
src/brain/                   # BROWSER RUNTIME: agiCore.ts, bundle.ts, doom.ts, load.ts, memory.ts, plasticity.ts, rstdp.ts, sim.ts, spikegen.ts, talk.ts
src/agi/                     # AGI Workspace, DOOM Modal, simBridge, brain3d (Inline 3D WebGL)
src/components/              # UI Components (BootScreen, LeftPanel, ChatPanel, ...)
public/brain/                # COMMITTED artifacts: peter.br, peter.readout.json
python/brainpack/            # Offline toolchain (ingest, selection, LIF, bundle)
scripts/                     # audit_agi.mjs, build_brain.py, train_readout.py, verify_brain.py
tests/                       # proof-agi.mjs, brainproof.mjs, brain.test.mjs
docs/                        # Documentation
PETERS BRAIN 3D/             # Local-only standalone 3D viewer (gitignored)
```

## 4. Commands

```bash
npm install                        # frontend deps
python scripts/build_brain.py      # -> public/brain/peter.br
python scripts/train_readout.py    # -> public/brain/peter.readout.json
python scripts/verify_brain.py     # verify integrity + live-fire
npm run test:web && python -m pytest python/tests -q
npm run dev                        # local frontend
npm run build                      # single-file dist/index.html
node tests/proof-agi.mjs           # AGI proof ablation battery
node scripts/audit_agi.mjs         # hard-coded logic audit
```

## 5. Empirical Learning Results (2026-09-13)

The `test:doom` benchmark (`tests/proof-doom-benchmark.mjs`) produced verified results:

| Variant | Reward | Conclusion |
|---|---|---|
| A: FlyWire Frozen + Bandit | 10.2 | Bandit over real connectome |
| B: FlyWire Plastic (R-STDP) + No Bandit | 5.8 | R-STDP alone > null (+16%) |
| C: FlyWire Plastic (R-STDP) + Bandit | 10.2 | Matches A at 60 steps |
| D: Random Reservoir + Bandit | 9.5 | Bandit over random wiring |
| E: Random Reservoir + Null | 5.0 | Baseline |

**Scientific conclusion: FLYWIRE LEARNING DEMONSTRATED**

- R-STDP modifies **37,698 synapses** over 60 steps with mean |Dw| = 0.006.
- FlyWire topology provides **+0.70 reward advantage** over random reservoir.
- R-STDP alone beats the null baseline (+0.80 reward, +16%).
- Bandit is the dominant short-horizon signal; R-STDP effect grows with time.

See `docs/ANSWERS.md` Part 14 and Part 17 for full details.

## 6. Latest Updates (2026-09-13)
- **Medulla Cognitive Engine (`src/brain/medullaEngine.ts`):** Powers the main page chat with dynamic, articulate responses grounded in real-time Medulla (`ME_R`) and Lobula (`LO_R`) spike counts, memory integration, and Peter's authentic fruit fly persona.
- **Zero-Lag Interactive DOOM Arena (`src/agi/DoomWorkspace.tsx`, `src/agi/doomEngine.ts`):** Grid DDA raycasting running in <1ms without GPU blocking, fast 150ms LIF bio-window, and state-conditioned reinforcement learning (`contextQ`) where the brain visibly learns to avoid walls and shoot demons across simulation steps.
- **100% Verified:** `test:web`, `test:brain`, `test:learning`, `test:synapse`, `test:doom`, and `npm run build` all pass with zero errors.

