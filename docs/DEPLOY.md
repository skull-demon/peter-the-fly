# Deploying PETER THE FLY to Cloudflare Pages

The whole site is a single static build plus two committed brain artifacts —
no server, no functions, no cost.

## What gets deployed

| File | Role |
| --- | --- |
| `dist/index.html` | The entire app (JS + CSS inlined by `vite-plugin-singlefile`) |
| `dist/brain/peter.br` | The real FlyWire brain bundle (~1.5 MB, copied from `public/`) |
| `dist/brain/peter.readout.json` | The trained readout (~79 KB) |

`public/**` is copied verbatim into `dist/` by Vite, and `public/brain/` is
**committed to the repo** — so the deployed site always ships a real brain,
even with zero CI changes. (If you ever prefer CI-built brains, see
`.gitignore` for the one-line switch, but then the CI must run the Python
toolchain before `npm run build`.)

## Option A — git integration (recommended)

1. Push the repo to GitHub (`peter-the-fly`).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick the repo, then set:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: 20+ (env var `NODE_VERSION` = `20` if needed)
4. Deploy. Every push to `main` redeploys automatically.
5. Verification: load the site → boot screen → open the inspector →
   the chat composer meta line must say the brain is **LIVE (FAFB v783)**,
   not "LOCAL DEMONSTRATION". The latter means `peter.br` failed to load.

## Option B — direct upload (no git hook)

```bash
npm run build
npx wrangler pages deploy dist --project-name=peter-the-fly
```

## Data policy on Cloudflare

- `data/flywire/raw/` (1.1 GB official cache) is **gitignored** and never
  deployed. Only the 1.5 MB distilled bundle ships.
- FlyWire data is **CC BY-NC 4.0** — attribution stays in the UI disclosure
  popup and `THIRD-PARTY-NOTICES.md`. Non-commercial use only.

## First-deploy smoke check

1. Boot screen completes with truthful status lines.
2. Type `hello` → reply streams with a real telemetry note
   (`FAFB v783 · 2,200 NEURONS · <n> SPIKES · <ms>MS`).
3. Brain map lights regions (ME_R/LO_R/AVLP_R/PVLP_R expected for visual
   stimulation).
4. Same message twice → identical spike count (deterministic brain).
