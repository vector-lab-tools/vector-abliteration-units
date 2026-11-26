# Vector Abliteration Units: Tanh Squash
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
import torch

UNIT = {
    "vau": 1, "id": "saturator", "title": "Tanh Squash", "short": "Squash", "category": "effect", "level": "model",
    "what": "Soft-clips each dimension of the stream, harder as the drive rises",
    "site": "stream", "axis": "any", "targets": ["layer"], "requires": ["stats"],
    "params": [
        {"key": "mix", "label": "Mix", "tip": "h' = (1 − mix)·h + mix · L·tanh(h / L)", "kind": "knob", "min": 0, "max": 1, "default": 1, "neutral": 0},
        {"key": "drive", "label": "Drive", "tip": "L = 3σ / drive,  σ = each dimension's spread over the corpus", "kind": "fader", "min": 0.1, "max": 10, "default": 1, "step": 0.1},
    ],
    "example": "saturator layer=6 drive=2",
    "summary": {"reads": "gain", "label": "level"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "Each dimension soft-clipped with tanh at three times its typical spread divided by the drive. "
            "Mix 0 is neutral."
            "<p>It acts on each coordinate of the stream separately, so what it does depends on the coordinates the stream happens to be written in. These mean less than an MLP's neurons do, since the MLP's nonlinearity singles its neurons out and nothing does the same for the stream's coordinates, except in part the model's norms (a learned scale for each coordinate gives them some meaning of their own).</p>",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def saturator_edit(level: torch.Tensor, mix: float):
    """Each dimension soft-clipped at its own `level` (level * tanh(x / level)), mixed with the
    dry stream by `mix`."""
    def edit(h, pos):
        x = h.float()
        wet = level * torch.tanh(x / level)
        return ((1 - mix) * x + mix * wet).to(h.dtype)
    return edit


def edit(u, layer):
    level = torch.tensor(u.stats()["std"][layer], device=u.device) * (3.0 / max(1e-3, u.num("drive")))
    return saturator_edit(level.clamp_min(1e-6), min(1.0, max(0.0, u.num("mix"))))


def code(u):
    return {"expr": f"saturator_edit(3 * spread[layer] / {u.str('drive')}, mix={u.str('mix')})",
            "note": "spread is each dimension's standard deviation at that layer over the reference set, model unchanged",
            "uses": [saturator_edit]}
