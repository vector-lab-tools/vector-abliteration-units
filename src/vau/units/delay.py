# Vector Abliteration Units: Lookback
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Dict

import torch

UNIT = {
    "vau": 1, "id": "delay", "title": "Lookback", "category": "effect", "level": "model",
    "what": "Adds the stream from some positions back: an echo, with feedback",
    "site": "stream", "axis": "ordered", "targets": ["layer"], "requires": [],
    "params": [
        {"key": "time", "label": "Time", "tip": "the echo of position p is read from p − time  (in tokens)", "kind": "int", "min": 1, "max": 32, "default": 4},
        {"key": "feedback", "label": "Feedback", "tip": "line[p] = h[p] + feedback · line[p − time]", "kind": "knob", "min": 0, "max": 0.95, "default": 0.3},
        {"key": "mix", "label": "Mix", "tip": "h'[p] = h[p] + mix · line[p − time]", "kind": "fader", "min": 0, "max": 1, "default": 0.5, "step": 0.01, "neutral": 0},
    ],
    "example": "delay layer=6 time=4 feedback=0.3 mix=0.5",
    "summary": {"reads": "change", "label": "echo"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "Adds the stream from <i>time</i> positions back (tokens, in a language model); with feedback the "
            "echo carries its own earlier echoes, fading. The first position, an attention sink in many "
            "models, is neither changed nor drawn on. Mix 0 is neutral.",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def delay_edit(time: int, feedback: float, mix: float, line: Dict[int, torch.Tensor]):
    """Adds `mix` times the delay line `time` tokens back. The line at a position is the stream
    there plus `feedback` times the line `time` tokens before it, so echoes repeat and fade."""
    def edit(h, pos):
        x = h.float()
        out = x.clone()
        for j, p in enumerate(pos.tolist()):
            src = line.get(p - time) if p - time >= 1 else None
            if p >= 1:
                line[p] = (x[0, j] + feedback * src) if src is not None else x[0, j].clone()
            if src is not None:
                out[0, j] = x[0, j] + mix * src
        return out.to(h.dtype)
    return edit


def edit(u, layer):
    return delay_edit(max(1, u.int("time")), min(0.95, max(0.0, u.num("feedback"))), u.num("mix"), u.memory(layer))


def code(u):
    return {"expr": f"delay_edit(time={u.str('time')}, feedback={u.str('feedback')}, mix={u.str('mix')}, line={{}})",
            "uses": [delay_edit]}
