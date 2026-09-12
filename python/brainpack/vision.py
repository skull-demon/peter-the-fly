"""Peter's retina: the game frame, seen the way a compound eye sees.

The 320x240 frame is divided into 5 sectors (compound-eye style, no fovea):
    center | left | right | wide-left | wide-right
Each sector's mean brightness (0..1) is the stimulation rate of the optic
input neurons whose receptive field is that sector.

This module is the PARITY TWIN of the sector math in src/brain/doom.ts:
grid-mean over a fixed lattice, identical indices, identical ordering.
Do not change one side without the other; test_doom.py checks equality.
"""

from __future__ import annotations

import numpy as np

# Sector rectangles on the 320x240 frame: (x0, x1) in 1/32 units of width.
# The horizon band (rows 70..190) is where threats live; rows above are sky.
SECTORS: list[tuple[int, int]] = [
    (13, 19),   # center
    (7, 13),    # left
    (19, 25),   # right
    (0, 8),     # wide-left
    (24, 32),   # wide-right
]
HORIZON_Y0 = 70
HORIZON_Y1 = 190


def sector_brightness(gray: np.ndarray) -> np.ndarray:
    """gray: uint8 (240, 320) -> 5 brightness values in [0, 1], sector order."""
    band = gray[HORIZON_Y0:HORIZON_Y1, :].astype(np.float64) / 255.0
    out = np.empty(len(SECTORS), dtype=np.float64)
    w = gray.shape[1] // 32
    for i, (a, b) in enumerate(SECTORS):
        out[i] = float(band[:, a * w : b * w].mean())
    return out
