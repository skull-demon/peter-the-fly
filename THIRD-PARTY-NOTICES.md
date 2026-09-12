# Third-Party Notices

## Data

### FlyWire FAFB v783 connectome (the brain Peter runs on)
- Connectivity tables: FlyWire Consortium, "FlyWire Whole-brain Connectome
  Connectivity Data", Zenodo record 10676866
  (https://zenodo.org/records/10676866)
- Neuron annotations: flyconnectome/flywire_annotations, tag v3.1.0
  (https://github.com/flyconnectome/flywire_annotations)
- Explorer: https://codex.flywire.ai/
- **License: CC BY-NC 4.0** — attribution required, **non-commercial**.
  Peter inherits this restriction for any derived connectome data
  (`public/brain/peter.br` contains FlyWire-derived connectivity).
- Primary papers to cite:
  - Dorkenwald et al., "Neuronal wiring diagram of an adult brain", Nature (2024)
  - Schlegel et al., "Whole-brain annotation and multi-connectome cell typing
    of Drosophila", Nature (2024)
  - Matsliah et al., "Neuronal parts list and wiring diagram for a visual
    system", Nature (2024)
  - Buhmann et al. (2021) synapse detection; Eckstein, Bates et al. (2024)
    neurotransmitter prediction; Heinrich et al. (2018) cleft segmentation.

## Software (build-time toolchain, Python)

| Package | License | Notes |
| --- | --- | --- |
| numpy | BSD-3-Clause | https://github.com/numpy/numpy |
| pandas | BSD-3-Clause | https://github.com/pandas-dev/pandas |
| pyarrow | Apache-2.0 | feather file reading |
| scipy | BSD-3-Clause | sparse graph utilities |
| requests | Apache-2.0 | official-source downloads |
| pytest | MIT | tests |

## Software (runtime, JavaScript)

| Package | License | Notes |
| --- | --- | --- |
| react / react-dom | MIT | existing frontend |
| three | MIT | existing frontend |
| @react-three/fiber, @react-three/drei | MIT | existing frontend |
| vite, @vitejs/plugin-react | MIT | build only |
| tailwindcss | MIT | build only (existing stylesheet predates it) |
| esbuild | MIT | used by vite; also compiles the parity test |

## Components with obligations

- **FlyWire-derived bundle** (`peter.br`): CC BY-NC 4.0 attribution above must
  accompany any distribution of the bundle or a deployed site.
- This project's original code, corpus, and readout are independent works;
  no claim is made that FlyWire, its contributors, or the referenced software
  endorse this project.
- Licenses above are summaries; the authoritative texts live with each project.
  Verify before commercial use of any component.
