# Vector Abliteration Units
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Conformance checks that need no model: a stand-in host with random statistics, directions
and principal directions, and the checks every unit should pass with it.

    from vau.testing import conformance
    problems = conformance(unit)          # [] if the unit passes

A unit passes if its manifest checks, its example line validates, its edit runs on a stream
of the stand-in's shape and keeps that shape and dtype, and, where it declares neutral
values, those values give back the stream unchanged.
"""
from __future__ import annotations

import shlex
from typing import Any, Callable, Dict, List

import numpy as np
import torch

from .context import Line, UnitContext, validate
from .host import Host
from .manifest import CAPABILITIES, check
from .registry import Unit


class _Dir:
    def __init__(self, vecs: np.ndarray):
        self.v = vecs

    def vector(self, layer, device):
        return torch.tensor(self.v[layer], device=device)

    def unit(self, layer, device):
        v = self.v[layer]
        return torch.tensor(v / np.linalg.norm(v), device=device)


class StandInHost(Host):
    """A host with no model: a stream of `layers` + 1 places, `d` wide, statistics drawn from
    a fixed seed, any direction name answered with a random direction."""

    name = "stand-in"

    def sink(self) -> bool:
        return self._sink

    def __init__(self, layers: int = 4, d: int = 32, seed: int = 0, sink: bool = True):
        self.n, self.d, self._sink = layers, d, sink
        g = np.random.default_rng(seed)
        self._stats = {"mean": g.normal(size=(layers + 1, d)).astype(np.float32),
                       "std": np.abs(g.normal(1, 0.2, size=(layers + 1, d))).astype(np.float32),
                       "norm": np.full(layers + 1, float(np.sqrt(d)), dtype=np.float32)}
        self._pca = [np.linalg.qr(g.normal(size=(d, d)))[0].T.astype(np.float32) for _ in range(layers + 1)]
        self._dirs: Dict[str, _Dir] = {}
        self._g = g
        self._mem: Dict[Any, Any] = {}
        self.edits: List[Callable] = []

    def capabilities(self):
        return set(CAPABILITIES) - {"texts", "weights", "output", "logits"}

    @property
    def device(self):
        return torch.device("cpu")

    def layers(self, strip):
        t, v = strip.target()
        if str(v).lower() == "all":
            return list(range(self.n + 1))
        return [int(x) for x in str(v).split(",")]

    def depth(self):
        return self.n

    def blocks(self, strip):
        t, v = strip.target()
        if str(v).lower() == "all":
            return list(range(self.n))
        return [int(x) for x in str(v).split(",")]

    def stats(self):
        return self._stats

    def pca(self, layer):
        return self._pca[layer]

    def pca_scales(self, layer):
        return np.linspace(2.0, 0.1, self.d).astype(np.float32)

    def direction(self, name, lineno):
        if name not in self._dirs:
            self._dirs[name] = _Dir(self._g.normal(size=(self.n + 1, self.d)).astype(np.float32))
        return self._dirs[name]

    prompt = 3                                                # stand-in prompt length

    def positions(self, n, device):
        return torch.arange(n, device=device)

    def prompt_length(self):
        return self.prompt

    def memory(self, strip, layer):
        return self._mem.setdefault((strip.lineno, layer), {})

    def hook_stream(self, strip, make):
        for layer in self.layers(strip):
            self.edits.append(make(layer))


def line(text: str) -> Line:
    words = shlex.split(text)
    return Line(words[0], dict(w.split("=", 1) for w in words[1:]))


def run_edit(unit: Unit, text: str, host: StandInHost, h: torch.Tensor) -> torch.Tensor:
    """Apply a stream unit's line to h at every place it names, all positions at once."""
    s = line(text)
    s.params = {k: v for k, v in s.params.items()}
    u = UnitContext(unit, s, host)
    pos = torch.arange(h.shape[1])
    out = h
    for layer in host.layers(s):
        out = unit.fn("edit")(u, layer)(out, pos)
    return out


def conformance(unit: Unit, layer: int = 2) -> List[str]:
    bad = check(unit.m, unit.module)
    if bad:
        return bad
    try:
        validate(unit, line(unit.m["example"]))
    except Exception as e:
        return [f"its example line does not validate: {e}"]
    if unit.m["level"] == "probe":
        from .context import read
        g = torch.Generator().manual_seed(2)
        steps, d, v = 7, 32, 50
        data = {"tokens": list(range(steps)), "decode": lambda ids: " ".join(f"t{i}" for i in ids)}
        if unit.m["site"] == "stream":
            data["stream"] = torch.randn(steps, d, generator=g)
        else:
            data["logprobs"] = torch.log_softmax(torch.randn(steps, v, generator=g), -1)
        ex = line(unit.m["example"])
        try:
            out = read(unit, ex, StandInHost(), data)
        except Exception as e:
            return [f"its read failed on stand-in data: {type(e).__name__}: {e}"]
        return [] if len(out) == steps else [f"its read gave {len(out)} readings for {steps} steps"]
    if unit.m["site"] != "stream" or not unit.fn("edit"):
        return []
    host = StandInHost()
    h = torch.randn(1, 9, host.d, generator=torch.Generator().manual_seed(1)) * 3
    ex = line(unit.m["example"])
    target = f"layer={layer}"
    rest = " ".join(f"{k}={shlex.quote(v)}" for k, v in ex.params.items() if k not in ("layer", "head", "attn", "mlp", "block"))
    try:
        out = run_edit(unit, f"{unit.id} {target} {rest}", host, h)
    except Exception as e:
        return [f"its edit failed on the stand-in stream: {type(e).__name__}: {e}"]
    if out.shape != h.shape or out.dtype != h.dtype:
        return [f"its edit changed the stream's shape or dtype ({tuple(out.shape)}, {out.dtype})"]
    neutral = unit.neutral_params()
    if neutral:
        params = dict(ex.params)
        params.update({k: str(v) for k, v in neutral.items()})
        params.pop("layer", None)
        text = f"{unit.id} {target} " + " ".join(f"{k}={shlex.quote(v)}" for k, v in params.items())
        out = run_edit(unit, text, StandInHost(), h)
        if not torch.allclose(out, h, atol=1e-5):
            return [f"its neutral values change the stream (largest change {float((out - h).abs().max()):.3g})"]
    return []
