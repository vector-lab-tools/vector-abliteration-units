# Vector Abliteration Units: Quantise
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Dict, Optional

import torch

UNIT = {
    "vau": 1, "id": "erosion", "title": "Quantise", "category": "effect", "level": "model",
    "what": "Quantises the stream to few levels, or holds it over several positions",
    "site": "stream", "axis": "ordered", "targets": ["layer"], "requires": ["stats"],
    "params": [
        {"key": "bits", "label": "Bits", "tip": "h' = round(h / s) · s,  s = 6σ / 2^bits  (16: off)", "kind": "int", "min": 1, "max": 16, "default": 16, "neutral": 16},
        {"key": "hold", "label": "Hold", "tip": "h'[p] = h[first p of each run of hold]  (1: off)", "kind": "int", "min": 1, "max": 16, "default": 1, "neutral": 1},
    ],
    "example": "erosion layer=6 bits=4",
    "summary": {"reads": "change", "label": "quantisation error"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "Rounds each dimension to one of 2<sup>bits</sup> steps across six times its spread, and holds the "
            "stream of one position over the next <i>hold</i> − 1. It degrades the activations, much as "
            "rounding a model's weights to fewer bits degrades the weights. Where the model has an attention sink at the first position, that position is left as it is. Bits 16 and hold 1 are neutral."
            "<p>It acts on each coordinate of the stream separately, so what it does depends on the coordinates the stream happens to be written in. These mean less than an MLP's neurons do, since the MLP's nonlinearity singles its neurons out and nothing does the same for the stream's coordinates, except in part the model's norms (a learned scale for each coordinate gives them some meaning of their own).</p>",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def erosion_edit(step: Optional[torch.Tensor], hold: int, held: Dict[int, torch.Tensor], first: int = 1):
    """Quantises each dimension to multiples of its own `step` (fewer bits, coarser steps), and
    holds the stream of the first position of each run of `hold` positions over the rest.
    `first` is the first position bent: 1 where position 0 is an attention sink, else 0. Only the
    run in hand is kept."""
    def edit(h, pos):
        x = h.float()
        if step is not None:
            x = torch.round(x / step) * step
        if hold > 1:
            x = x.clone()
            for j, p in enumerate(pos.tolist()):
                if p < first:
                    continue
                start = first + ((p - first) // hold) * hold
                if p == start:
                    held.pop(start - hold, None)
                    held[start] = x[0, j].clone()
                elif start in held:
                    x[0, j] = held[start]
        if (step is not None or hold > 1) and first:
            x = torch.where(pos.view(1, -1, 1) == 0, h.float(), x)   # the attention sink untouched
        return x.to(h.dtype)
    return edit


def edit(u, layer):
    bits = u.int("bits")
    step = None if bits >= 16 else torch.tensor(u.stats()["std"][layer], device=u.device) * (6.0 / 2 ** max(1, bits))
    return erosion_edit(step, max(1, u.int("hold")), u.memory(layer), 1 if u.sink else 0)


def code(u):
    return {"expr": f"erosion_edit(step=6 * spread[layer] / 2**{u.str('bits')}, hold={u.str('hold')}, held={{}})",
            "note": "spread is each dimension's standard deviation at that layer over the reference set, model unchanged",
            "uses": [erosion_edit]}
