# Vector Abliteration Units: Sparsify
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
import math

import torch

UNIT = {
    "vau": 1, "id": "gate", "title": "Sparsify", "category": "effect", "level": "model",
    "what": "Keeps only each position's largest components and zeroes the rest, making the stream sparse",
    "site": "stream", "axis": "any", "targets": ["layer"], "requires": [],
    "params": [
        {"key": "sink", "label": "Sink too", "tip": "also gate position 0, the attention sink", "kind": "toggle", "default": 0, "when": {"host": ["sink"]}},
        {"key": "keep", "label": "Keep", "tip": "keep the ⌈keep · d⌉ largest |hᵢ|; set the rest to 0", "kind": "fader", "min": 0.01, "max": 1, "default": 0.25, "step": 0.01, "neutral": 1},
    ],
    "example": "gate layer=6 keep=0.25",
    "summary": {"reads": "touched", "label": "zeroed"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "At each position, only the <i>keep</i> share of the stream's components that are largest in size "
            "pass; the rest are set to zero. It shows how much of the stream the layers after it need. The "
            "first position, where the model has an attention sink there, is left alone unless <i>sink too</i> is on (on a model with none, such as a music model, it is gated like any other). Keep 1 is neutral."
            "<p>It acts on each coordinate of the stream separately, so what it does depends on the coordinates the stream happens to be written in. These mean less than an MLP's neurons do, since the MLP's nonlinearity singles its neurons out and nothing does the same for the stream's coordinates, except in part the model's norms (a learned scale for each coordinate gives them some meaning of their own).</p>",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def gate_edit(keep: float, sink: bool, has_sink: bool = True):
    """Each position's components outside the largest `keep` share (by size) set to zero; the
    first position left alone unless `sink`, or unless the model has no attention sink there
    (`has_sink` False)."""
    def edit(h, pos):
        if keep >= 1.0:
            return h
        x = h.float()
        k = max(1, math.ceil(keep * x.shape[-1]))
        idx = x.abs().topk(k, dim=-1).indices
        out = torch.zeros_like(x).scatter(-1, idx, x.gather(-1, idx))
        if not sink and has_sink:
            out = torch.where(pos.view(1, -1, 1) == 0, x, out)
        return out.to(h.dtype)
    return edit


def edit(u, layer):
    return gate_edit(min(1.0, max(0.01, u.num("keep"))), u.flag("sink"), u.sink)


def code(u):
    return {"expr": f"gate_edit(keep={u.str('keep')}, sink={u.flag('sink')})", "uses": [gate_edit]}
