# Vector Abliteration Units: MLX versions of some units' edits (optional)
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
MLX versions of some units' edits, for a host whose model runs in MLX (on Apple silicon), so that
the edit stays on the GPU. Optional: it needs `mlx` (pip install "vau[mlx]"), imported only when
an edit is first called, so `import vau.mlx` works without it.

A unit's edits are written in torch. A host running in MLX can copy the stream out to torch at
each hooked layer and back, which makes MLX finish the frame up to that layer and wait for the
CPU (Neuron at block=all, twelve times a frame; Abliterate at block=all, 24). For the units here
the same arithmetic is written in MLX and stands in for the torch hook; tests/test_mlx.py checks
each against its unit.

Ported (PORTED): Neuron and Quantise (erosion), with the host features Wet, Envelope and Keep size
(a strip with a window or a random control keeps the torch path); Abliterate without host
features, taking the direction, strength and rescaling from the hook its unit made.

Each edit returned is marked `fn.mlx = True`. `port()` swaps a strip's torch hooks for these in a
host that keeps its hooks in tables, {"edits": {layer: [fn]}, "outs": {(block, kind): [fn]},
"ins": {(block, kind): [fn]}}, given the tables before and after the strip attached; a host that
keeps its hooks otherwise calls neuron_fn, erosion_fn and abliterate_fn itself.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import numpy as np

PORTED = {"neuron", "erosion", "abliterate"}


def _mx():
    import mlx.core as mx
    return mx


def _settings(strip) -> Optional[Dict[str, Any]]:
    """The strip's host features, or None if one of them needs the torch path."""
    from . import hostfx
    try:
        s = hostfx.settings(strip)
    except Exception:
        return None
    if s["control"] != "none" or hostfx.windowed(s):
        return None
    return s


def _factor(s: Dict[str, Any], index: Optional[int], n: Optional[int]) -> float:
    from . import hostfx
    return hostfx.factor(s, index, n)


def _mix(h, out, f: float, keepnorm: bool):
    """hostfx.mix in MLX: h moved toward out by f, then, with keepnorm, scaled back to h's size."""
    mx = _mx()
    if f == 1.0 and not keepnorm:
        return out
    x = h + f * (out - h)
    if keepnorm:
        x = x * (mx.linalg.norm(h, axis=-1, keepdims=True) / mx.maximum(mx.linalg.norm(x, axis=-1, keepdims=True), 1e-9))
    return x


def mlx_fn(fn: Callable) -> Callable:
    fn.mlx = True
    return fn


def neuron_fn(ns: List[int], op: str, value: float, f: float, keepnorm: bool) -> Callable:
    """An MLP down-projection's input (one position, flattened) with the named neurons edited, as
    units/neuron.py's neuron_hook does it."""
    masks: Dict[int, Any] = {}

    def edit(h):
        mx = _mx()
        shape, flat = h.shape, h.reshape(-1).astype(mx.float32)
        n = flat.shape[0]
        if n not in masks:
            m = np.zeros(n, np.float32)
            m[[i for i in ns if i < n]] = 1.0
            masks[n] = mx.array(m)
        m = masks[n]
        if op == "scale":
            a = flat * (1.0 + m * (value - 1.0))
        elif op == "add":
            a = flat + m * value
        elif op == "set":
            a = flat * (1.0 - m) + m * value
        elif op == "zero":
            a = flat * (1.0 - m)
        elif op == "flip":
            a = flat * (1.0 - 2.0 * m)
        else:                                                 # clamp
            v = abs(value)
            a = mx.where(m > 0, mx.clip(flat, -v, v), flat)
        out = _mix(flat.reshape(1, 1, -1), a.reshape(1, 1, -1), f, keepnorm)
        return out.reshape(shape).astype(h.dtype)
    return mlx_fn(edit)


def erosion_fn(step: Optional[np.ndarray], hold: int, held: Dict[int, Any], f: float, keepnorm: bool, first: int = 1) -> Callable:
    """The stream at one position quantised to multiples of `step` and held over runs of `hold`
    frames, as units/erosion.py's erosion_edit does it. `first` is the first frame bent: 1 where
    frame 0 is an attention sink, 0 on a model with none (Host.sink). Only the
    current run's first frame is kept in `held`."""
    st = None

    def edit(h, frame: int):
        nonlocal st
        mx = _mx()
        if frame < first or (step is None and hold <= 1):
            return h
        x = h.astype(mx.float32)
        if step is not None:
            if st is None:
                st = mx.array(step.astype(np.float32))
            x = mx.round(x / st) * st
        if hold > 1:
            start = first + ((frame - first) // hold) * hold
            if frame == start:
                held.clear()
                held[start] = x
            elif start in held:
                x = held[start]
        return _mix(h.astype(mx.float32), x, f, keepnorm).astype(h.dtype)
    return mlx_fn(edit)


def abliterate_fn(v: np.ndarray, s: float, scale: Optional[np.ndarray]) -> Callable:
    """What a block's attention or MLP writes, less s times its part along the unit direction v, then with Keep
    size each output feature scaled back, as units/abliterate.py's abliterate_hook does it (no bias here)."""
    vv, sc = None, None

    def edit(h):
        nonlocal vv, sc
        mx = _mx()
        if vv is None:
            vv = mx.array(v.astype(np.float32))
            sc = mx.array(scale.astype(np.float32)) if scale is not None else None
        x = h.astype(mx.float32)
        x = x - s * mx.sum(x * vv, axis=-1, keepdims=True) * vv
        if sc is not None:
            x = x * sc
        return x.astype(h.dtype)
    return mlx_fn(edit)


def _closure(fn: Callable) -> Dict[str, Any]:
    return dict(zip(fn.__code__.co_freevars, (c.cell_contents for c in (fn.__closure__ or ()))))


def _param(u, strip, key: str):
    p = u.param(key) or {}
    return strip.params.get(key, p.get("default"))


def port(u, strip, host, before: Dict[str, Dict], after: Dict[str, Dict]) -> Optional[Dict[str, Dict]]:
    """The edit tables with this strip's torch hooks (what `after` adds to `before`) replaced by
    MLX ones, or None to keep the torch path."""
    if u.id not in PORTED:
        return None
    s = _settings(strip)
    if s is None:
        return None
    out = {k: {kk: list(vv) for kk, vv in before[k].items()} for k in before}
    try:
        if u.id == "neuron":
            op = str(_param(u, strip, "op"))
            value = float(_param(u, strip, "value"))
            if (op == "scale" and value == 1) or (op == "add" and value == 0):
                return out                                    # neutral, as the unit leaves it
            ns = [int(x) for x in str(strip.params["n"]).replace(" ", "").split(",") if x != ""]
            n = host.depth() if s["env"] != "none" else None
            added = {k: v[len(before["ins"].get(k, [])):] for k, v in after["ins"].items() if len(v) > len(before["ins"].get(k, []))}
            for (block, kind), fns in added.items():
                f = _factor(s, block, n)
                out["ins"].setdefault((block, kind), []).extend(
                    [neuron_fn(ns, op, value, f, s["keepnorm"]) if f != 0.0 else mlx_fn(lambda h: h)] * len(fns))
            return out
        if u.id == "abliterate":
            from . import hostfx
            if hostfx.active(s):
                return None
            added = {k: v[len(before["outs"].get(k, [])):] for k, v in after["outs"].items() if len(v) > len(before["outs"].get(k, []))}
            for key, fns in added.items():
                for fn in fns:
                    c = _closure(fn)
                    if c.get("bias") is not None or "v" not in c or "s" not in c:
                        return None                               # not the hook this port knows: keep the torch path
                    sc = c.get("scale")
                    out["outs"].setdefault(key, []).append(abliterate_fn(c["v"].float().cpu().numpy(), float(c["s"]),
                                                                         None if sc is None else sc.float().cpu().numpy()))
            return out
        if u.id == "erosion":
            bits, hold = int(_param(u, strip, "bits")), max(1, int(_param(u, strip, "hold")))
            n = host.depth() + 1 if s["env"] != "none" else None
            added = {k: v[len(before["edits"].get(k, [])):] for k, v in after["edits"].items() if len(v) > len(before["edits"].get(k, []))}
            for layer, fns in added.items():
                step = None if bits >= 16 else np.asarray(host.stats()["std"][layer], np.float64) * (6.0 / 2 ** max(1, bits))
                f = _factor(s, layer, n)
                first = 1 if host.sink() else 0
                fn = erosion_fn(step, hold, host.memory(strip, ("mlx", layer)), f, s["keepnorm"], first) if f != 0.0 else mlx_fn(lambda h, frame: h)
                out["edits"].setdefault(layer, []).extend([fn] * len(fns))
            return out
    except Exception:
        return None
    return None
