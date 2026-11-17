# Vector Abliteration Units: Rotate
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
import math

import torch

UNIT = {
    "vau": 1, "id": "shifter", "title": "Rotate", "category": "effect", "level": "model",
    "what": "Rotates the stream in the plane of two directions",
    "site": "stream", "axis": "any", "targets": ["layer"], "requires": ["directions"],
    "params": [
        {"key": "dir", "label": "Direction", "tip": "e₁ = unit(dir) at this layer", "kind": "direction", "required": True},
        {"key": "dir2", "label": "Toward", "tip": "e₂ = unit(dir2 − (dir2·e₁) e₁)", "kind": "direction", "required": True},
        {"key": "angle", "label": "Angle", "tip": "(h·e₁, h·e₂) rotated by angle°; the rest of h kept", "kind": "fader", "min": -180, "max": 180, "default": 90, "step": 1, "neutral": 0},
    ],
    "example": "shifter layer=6 dir=negation dir2=not-x-but-y angle=90",
    "summary": {"reads": "turn", "label": "rotation"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "Rotates the stream by the angle in the plane of two directions (the second made orthogonal to "
            "the first), leaving the rest. Project out's reflect is close to 180°. Angle 0 is neutral.",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def shifter_edit(e1: torch.Tensor, e2: torch.Tensor, angle: float):
    """Rotates the stream by `angle` degrees in the plane of two orthonormal directions e1, e2,
    leaving every other component as it was. 180 degrees negates both components."""
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    def edit(h, pos):
        x = h.float()
        a, b = (x * e1).sum(-1, keepdim=True), (x * e2).sum(-1, keepdim=True)
        return (x + (a * c - b * s - a) * e1 + (a * s + b * c - b) * e2).to(h.dtype)
    return edit


def edit(u, layer):
    e1 = u.direction("dir").unit(layer, u.device).float()
    v = u.direction("dir2").unit(layer, u.device).float()
    v = v - (v @ e1) * e1
    if float(v.norm()) < 1e-6:
        raise u.error(f"shifter needs two directions that are not parallel at layer {layer}.")
    return shifter_edit(e1, v / v.norm(), u.num("angle"))


def code(u):
    return {"expr": f"shifter_edit(unit('{u.str('dir')}'), unit('{u.str('dir2')}') made orthogonal, angle={u.str('angle')})",
            "uses": [shifter_edit]}
