# Vector Abliteration Units: Running Average
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Dict

import torch

UNIT = {
    "vau": 1, "id": "reverb", "title": "Running Average", "short": "Average", "category": "effect", "level": "model",
    "what": "Adds a decaying average of the earlier positions",
    "site": "stream", "axis": "ordered", "targets": ["layer"], "requires": [],
    "params": [
        {"key": "decay", "label": "Decay", "tip": "tail[p] = decay · tail[p − 1] + (1 − decay) · h[p]", "kind": "knob", "min": 0, "max": 0.999, "default": 0.8},
        {"key": "mix", "label": "Mix", "tip": "h'[p] = h[p] + mix · tail[p − 1]", "kind": "fader", "min": 0, "max": 1, "default": 0.5, "step": 0.01, "neutral": 0},
    ],
    "example": "reverb layer=6 decay=0.8 mix=0.5",
    "summary": {"reads": "change", "label": "wet"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "Adds a running average of the earlier positions, each step keeping <i>decay</i> of the last "
            "average. The first position is neither changed nor drawn on. Mix 0 is neutral.",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def reverb_edit(decay: float, mix: float, tail: Dict[int, torch.Tensor]):
    """Adds `mix` times a decaying average of the earlier positions (the tail): the tail at a
    position is `decay` times the tail before it plus (1 - decay) times the stream there."""
    def edit(h, pos):
        x = h.float()
        out = x.clone()
        for j, p in enumerate(pos.tolist()):
            prev = tail.get(p - 1) if p >= 2 else None
            if p >= 1:
                tail[p] = (decay * prev + (1 - decay) * x[0, j]) if prev is not None else x[0, j].clone()
            if prev is not None:
                out[0, j] = x[0, j] + mix * prev
        return out.to(h.dtype)
    return edit


def edit(u, layer):
    return reverb_edit(min(0.999, max(0.0, u.num("decay"))), u.num("mix"), u.memory(layer))


def code(u):
    return {"expr": f"reverb_edit(decay={u.str('decay')}, mix={u.str('mix')}, tail={{}})", "uses": [reverb_edit]}
