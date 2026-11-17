# Vector Abliteration Units: Neuron
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Neuron: edits one or several of a block's MLP neurons, where each neuron's activation enters
the MLP's output projection (after the nonlinearity, or after the gate and the up projection
multiplied, in a gated MLP). Inspired by OBLITERATUS's Neuron Lab, which offers the same six
operations on the same site; written from its description, no code used (AGPL-3.0).
"""
from __future__ import annotations

from typing import List

import torch

OPS = ["scale", "add", "set", "zero", "flip", "clamp"]

UNIT = {
    "vau": 1, "id": "neuron", "title": "Neuron", "category": "intervention", "level": "model",
    "what": "Scales, adds to, sets, zeroes, flips or clamps single MLP neurons in one block",
    "site": "output", "axis": "any", "targets": ["block"], "requires": [],
    "params": [
        {"key": "n", "label": "Neurons", "tip": "neurons i of a = MLP activation: a[..., i]", "kind": "text", "required": True, "hint": "373 or 373,2006"},
        {"key": "op", "label": "Operation", "tip": "scale a·v · add a + v · set v · zero 0 · flip −a · clamp ±|v|", "kind": "choice", "choices": OPS, "default": "scale"},
        {"key": "value", "label": "Value", "tip": "v in the operation", "kind": "fader", "min": -20, "max": 20, "default": 1, "step": 0.05, "neutral": 1},
    ],
    "example": "neuron block=5 n=373 op=scale value=1",
    "space": "hidden",     # it acts on the MLP's neurons, though it hooks the MLP's output (SPEC 2)
    "summary": {"reads": "change", "label": "change"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "A neuron is one of the MLP's hidden units (3,072 per block in GPT-2 small): its activation, after "
            "the nonlinearity, is what the MLP's output projection reads, and the projection's column for it is "
            "what the neuron writes into the stream. <code>n</code> names one neuron or several "
            "(<code>n=373,2006</code>), counted from 0. The operation acts on each named neuron's activation at "
            "every position: <i>scale</i> multiplies it by the value (1 is neutral, 0 zeroes, −1 flips), "
            "<i>add</i> adds the value, <i>set</i> replaces it with the value, <i>zero</i> and <i>flip</i> take no "
            "value, <i>clamp</i> holds it within ± the value. The finder in the bench's Directions panel lists "
            "neurons that fire differently where the model is about to write a word.",
    "inspired_by": "OBLITERATUS's Neuron Lab",
    "references": ["elder-plinius, OBLITERATUS. https://github.com/elder-plinius/OBLITERATUS (docs/neuron-lab.md)"],
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def neurons(u) -> List[int]:
    try:
        ns = [int(x) for x in u.str("n").replace(" ", "").split(",") if x != ""]
    except ValueError:
        raise u.error("n names neurons by number: n=373, or n=373,2006.")
    if not ns or min(ns) < 0:
        raise u.error("n names neurons by number, from 0: n=373, or n=373,2006.")
    return ns


def validate(u):
    neurons(u)


def neuron_hook(idx: torch.Tensor, op: str, value: float):
    """Forward pre-hook on an MLP's output projection: its input holds each neuron's activation
    at each position; edit the named ones."""
    def hook(module, args):
        x = args[0].clone()
        a = x[..., idx]
        if op == "scale":
            a = a * value
        elif op == "add":
            a = a + value
        elif op == "set":
            a = torch.full_like(a, value)
        elif op == "zero":
            a = torch.zeros_like(a)
        elif op == "flip":
            a = -a
        elif op == "clamp":
            a = a.clamp(-abs(value), abs(value))
        x[..., idx] = a
        return (x,) + tuple(args[1:])
    return hook


def _inputs(mod) -> int:
    w = mod.weight
    return w.shape[0] if type(mod).__name__ == "Conv1D" else w.shape[1]


def attach(u):
    op, value = u.str("op"), u.num("value")
    if (op == "scale" and value == 1) or (op == "add" and value == 0):
        return                                            # neutral: nothing to change
    ns = neurons(u)
    for l in u.blocks():
        mod = u.component("mlp", l)
        width = _inputs(mod)
        if max(ns) >= width:
            raise u.error(f"block {l}'s MLP has neurons 0 to {width - 1}.")
        u.hook_input(mod, neuron_hook(torch.tensor(ns, device=u.device), op, value), block=l)


def code(u):
    ns = u.str("n")
    return {"lines": [f"{u.host.component_path('mlp', l)}.register_forward_pre_hook(neuron_hook([{ns}], '{u.str('op')}', {u.str('value')}))"
                      for l in u.blocks()],
            "note": "the hook edits the named neurons' activations where the MLP's output projection reads them",
            "uses": [neuron_hook]}
