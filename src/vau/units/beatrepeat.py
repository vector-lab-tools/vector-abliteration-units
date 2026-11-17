# Vector Abliteration Units: Position Repeat
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Dict

import torch

UNIT = {
    "vau": 1, "id": "beatrepeat", "title": "Position Repeat", "short": "Repeat", "category": "effect", "level": "model",
    "what": "In every run of positions, replays the stream of the few positions before over the last few: a stutter",
    "site": "stream", "axis": "ordered", "targets": ["layer"], "requires": [],
    "params": [
        {"key": "interval", "label": "Interval", "tip": "positions from 1 taken in runs of interval", "kind": "int", "min": 2, "max": 32, "default": 8},
        {"key": "length", "label": "Length", "tip": "last length of each run: from h[p − length]", "kind": "int", "min": 1, "max": 16, "default": 2},
        {"key": "mix", "label": "Mix", "tip": "h'[p] = (1 − mix) h[p] + mix · h[p − length]", "kind": "fader", "min": 0, "max": 1, "default": 1, "step": 0.01, "neutral": 0},
    ],
    "example": "beatrepeat layer=6 interval=8 length=2 mix=1",
    "summary": {"reads": "change", "label": "replaced"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "The positions after the first are taken in runs of <i>interval</i>; over the last <i>length</i> "
            "positions of each run, the stream is replaced (by <i>mix</i>) with the stream of the <i>length</i> "
            "positions just before them, so that stretch is heard twice. The first position, an attention sink, "
            "is neither changed nor replayed. Mix 0 is neutral.",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def beatrepeat_edit(interval: int, length: int, mix: float, kept: Dict[int, torch.Tensor]):
    """Over the last `length` positions of each run of `interval` (from position 1), the stream is
    moved toward the stream `length` positions back, as it was before this edit."""
    length = min(length, interval - 1)

    def edit(h, pos):
        x = h.float()
        out = x.clone()
        for j, p in enumerate(pos.tolist()):
            if p < 1:
                continue
            kept[p] = x[0, j].clone()
            if (p - 1) % interval >= interval - length and (p - length) in kept and p - length >= 1:
                out[0, j] = (1 - mix) * x[0, j] + mix * kept[p - length]
        return out.to(h.dtype)
    return edit


def edit(u, layer):
    return beatrepeat_edit(max(2, u.int("interval")), max(1, u.int("length")), min(1.0, max(0.0, u.num("mix"))), u.memory(layer))


def code(u):
    return {"expr": f"beatrepeat_edit(interval={u.str('interval')}, length={u.str('length')}, mix={u.str('mix')}, kept={{}})",
            "uses": [beatrepeat_edit]}
