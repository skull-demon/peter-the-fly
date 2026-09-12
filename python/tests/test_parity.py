"""Cross-language parity: the TS runtime must spike identically to the reference.

Compiles src/brain/index.ts with esbuild (shipped with vite), runs the same
synthetic bundle + stimulus through both implementations and asserts the spike
matrices are bit-for-bit identical. This is what makes "the browser simulates
the same brain that was trained" a tested fact instead of a hope.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
sys.path.insert(0, str(ROOT))

from brainpack.bundle import read_bundle, write_bundle  # noqa: E402
from brainpack.lif import readout_state, simulate, state_key  # noqa: E402
from brainpack.spikegen import fnv1a32, stimulus_from_tokens  # noqa: E402

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not available")

from conftest import write_synthetic_bundle as _write_synthetic  # noqa: E402


def _esbuild_compile(outfile: Path) -> Path:
    # prefer the real JS entry over the .bin shim (the shim is a sh script and
    # cannot be executed by node on Windows)
    candidates = [
        PROJECT / "node_modules" / "esbuild" / "bin" / "esbuild",
        PROJECT / "node_modules" / ".bin" / "esbuild",
    ]
    esbuild = next((c for c in candidates if c.exists()), None)
    if esbuild is None:
        pytest.skip("esbuild not installed (run npm install)")
    cmd = [
        str(NODE), str(esbuild),
        str(PROJECT / "src" / "brain" / "index.ts"),
        "--bundle", "--format=esm", "--platform=neutral",
        f"--outfile={outfile}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        pytest.fail(f"esbuild failed:\n{result.stderr}")
    return outfile


DRIVER_TEMPLATE = """import {{ parseBrainBundle, fnv1a32 }} from "./{module}";
import {{ simulateBrain, stimulusForText }} from "./{module}";
import {{ readFileSync }} from "node:fs";

const [bundlePath, mode, payload] = process.argv.slice(2);
const raw = readFileSync(bundlePath);
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const bundle = parseBrainBundle(buf);
if (mode === "fnv") {{
  console.log(JSON.stringify({{ a: fnv1a32("hello"), b: fnv1a32("") }}));
}} else if (mode === "stim") {{
  const plan = stimulusForText(payload, bundle);
  console.log(JSON.stringify({{ rows: Array.from(plan.rows), rates: Array.from(plan.rates) }}));
}} else if (mode === "sim") {{
  const {{ rows, rates, seed, durationMs }} = JSON.parse(payload);
  const res = simulateBrain(bundle, rows, rates, seed, durationMs);
  const spikes = [];
  for (const step of res.spikes) for (const x of step) spikes.push(x ? 1 : 0);
  console.log(JSON.stringify({{ spikes, bins: Array.from(res.binCounts) }}));
}}
"""


def _run_node(script: Path, *args: str) -> str:
    result = subprocess.run(
        [str(NODE), str(script), *[str(a) for a in args]],
        capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        raise AssertionError(f"node driver failed:\n{result.stderr}")
    return result.stdout.strip()


@pytest.fixture(scope="module")
def driver(tmp_path_factory) -> Path:
    outdir = tmp_path_factory.mktemp("tsbuild")
    compiled = _esbuild_compile(outdir / "brain.mjs")
    # driver must live NEXT TO the compiled module for the relative import
    drv = outdir / "driver.mjs"
    drv.write_text(DRIVER_TEMPLATE.format(module=compiled.name))
    return drv


@pytest.fixture(scope="module")
def synthetic_br_path(tmp_path_factory) -> Path:
    """Materialise the synthetic bundle (recipe shared with conftest.py)."""
    path = tmp_path_factory.mktemp("bundle") / "synthetic.br"
    _write_synthetic(path)
    return path


def test_fnv_parity(driver, synthetic_br_path):
    out = json.loads(_run_node(driver, str(synthetic_br_path), "fnv"))
    assert out["a"] == fnv1a32("hello")
    assert out["b"] == fnv1a32("")


def test_stimulus_parity(driver, synthetic_br_path):
    out = json.loads(_run_node(driver, str(synthetic_br_path), "stim", "hello peter"))
    bundle = read_bundle(synthetic_br_path)
    plan = stimulus_from_tokens("hello peter", bundle.input_rows)
    assert out["rows"] == plan.neuron_rows.tolist()
    assert np.allclose(np.array(out["rates"]), plan.rates_hz, atol=0)


def test_spike_parity(driver, synthetic_br_path):
    """THE parity test: same bundle, same stimulus, identical spikes."""
    bundle = read_bundle(synthetic_br_path)
    plan = stimulus_from_tokens("hello peter", bundle.input_rows)
    payload = json.dumps(
        {
            "rows": plan.neuron_rows.tolist(),
            "rates": plan.rates_hz.tolist(),
            "seed": 783,
            "durationMs": 300.0,
        }
    )
    out = json.loads(_run_node(driver, str(synthetic_br_path), "sim", payload))
    py = simulate(bundle, plan.neuron_rows, plan.rates_hz, seed=783, duration_ms=300.0)
    ts_spikes = np.array(out["spikes"], dtype=np.int8).reshape(py.spikes.shape)
    assert np.array_equal(ts_spikes.astype(bool), py.spikes), (
        "TS and Python simulations diverge - parity spec broken"
    )
    assert np.allclose(np.array(out["bins"]), py.bin_counts, atol=0)


def test_state_key_format_parity(synthetic_br_path):
    bundle = read_bundle(synthetic_br_path)
    plan = stimulus_from_tokens("hello", bundle.input_rows)
    py = simulate(bundle, plan.neuron_rows, plan.rates_hz, seed=783, duration_ms=300.0)
    state = readout_state(py, bundle.readout_rows)
    key = state_key(state)
    assert all(0 <= int(x) < 16 for x in key.split("."))
    assert "." in key
