# Vector Abliteration Units: tests of the MLX versions (vau.mlx) against the units they stand in for
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""Runs where MLX is installed (pip install "vau[mlx]"); skipped elsewhere."""
import numpy as np
import pytest

mx = pytest.importorskip("mlx.core")
torch = pytest.importorskip("torch")

from vau import hostfx  # noqa: E402
from vau.units import erosion as V_erosion  # noqa: E402
from vau.units import neuron as V_neuron  # noqa: E402

from vau import mlx as mlxunits  # noqa: E402

RNG = np.random.default_rng(3)


def close(a_mx, b_t, tol=1e-5):
    a = np.array(a_mx.astype(mx.float32)).reshape(-1)
    b = b_t.float().numpy().reshape(-1)
    assert np.allclose(a, b, atol=tol, rtol=1e-5), np.abs(a - b).max()


@pytest.mark.parametrize("op,value", [("scale", 6.0), ("scale", -1.5), ("add", 2.0), ("set", 0.7), ("zero", 0), ("flip", 0), ("clamp", 0.3)])
@pytest.mark.parametrize("f,keepnorm", [(1.0, False), (0.4, False), (1.0, True), (0.6, True)])
def test_neuron_matches_vau(op, value, f, keepnorm):
    ns = [3, 17, 200]
    h = RNG.standard_normal(256).astype(np.float32)
    ref = V_neuron.neuron_hook(torch.tensor(ns), op, value)
    if f != 1.0 or keepnorm:
        ref = hostfx.wrap_input(ref, f, keepnorm)
    want = ref(None, (torch.from_numpy(h).reshape(1, 1, -1),))[0]
    got = mlxunits.neuron_fn(ns, op, value, f, keepnorm)(mx.array(h).reshape(1, 1, -1))
    close(got, want)


@pytest.mark.parametrize("bits,hold", [(6, 1), (3, 1), (16, 3), (4, 4)])
@pytest.mark.parametrize("f,keepnorm", [(1.0, False), (0.5, True)])
@pytest.mark.parametrize("first", [1, 0])
def test_erosion_matches_vau(bits, hold, f, keepnorm, first):
    std = np.abs(RNG.standard_normal(64)) + 0.2
    step = None if bits >= 16 else std * (6.0 / 2 ** bits)
    ref = V_erosion.erosion_edit(None if step is None else torch.tensor(step), hold, {}, first)
    if f != 1.0 or keepnorm:
        ref = hostfx.wrap_edit(ref, f, keepnorm)
    mine = mlxunits.erosion_fn(step, hold, {}, f, keepnorm, first)
    for frame in range(0, 12):
        h = RNG.standard_normal((1, 1, 64)).astype(np.float32)
        want = ref(torch.from_numpy(h), torch.tensor([frame]))
        got = mine(mx.array(h), frame)
        close(got, want, tol=1e-4)


@pytest.mark.parametrize("s,keep", [(1.0, False), (2.0, True), (6.0, False), (0.4, True)])
def test_abliterate_matches_vau(s, keep):
    from vau.units import abliterate as V_abl
    d = 256
    v = torch.from_numpy(RNG.standard_normal(d).astype(np.float32))
    v = v / v.norm()
    scale = torch.from_numpy((1 + 0.1 * RNG.standard_normal(d)).astype(np.float32)) if keep else None
    hook = V_abl.abliterate_hook(v, s, scale, None, True)
    h = RNG.standard_normal((1, 1, d)).astype(np.float32)
    want = hook(None, (None,), torch.from_numpy(h))
    got = mlxunits.abliterate_fn(v.numpy(), s, None if scale is None else scale.numpy())(mx.array(h))
    close(got, want, tol=1e-4)
    c = mlxunits._closure(hook)                                   # what the port reads from the hook VAU made
    assert set(c) >= {"v", "s", "scale", "bias"} and float(c["s"]) == s
