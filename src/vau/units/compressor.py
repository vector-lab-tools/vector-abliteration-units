# Vector Abliteration Units: Norm Shrink
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
import torch

UNIT = {
    "vau": 1, "id": "compressor", "title": "Norm Shrink", "short": "Shrink", "category": "effect", "level": "model",
    "what": "Above a threshold, reduces the stream's size at each position by a ratio",
    "site": "stream", "axis": "any", "targets": ["layer"], "requires": ["stats"],
    "params": [
        {"key": "ratio", "label": "Ratio", "tip": "n > T:  n' = T + (n − T) / ratio,  n = ‖h‖ at a position", "kind": "knob", "min": 1, "max": 20, "default": 4, "step": 0.5, "neutral": 1},
        {"key": "makeup", "label": "Makeup", "tip": "h' = makeup · h, after the compression", "kind": "knob", "min": 0.25, "max": 4, "default": 1, "neutral": 1},
        {"key": "thresh", "label": "Threshold", "tip": "T = thresh × mean ‖h‖ at this layer over the corpus", "kind": "fader", "min": 0.1, "max": 3, "default": 1, "step": 0.05},
    ],
    "example": "compressor layer=6 thresh=1 ratio=4",
    "summary": {"reads": "gain", "label": "gain reduction"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "Where the stream at a position is larger than the threshold (a multiple of its typical size at "
            "that layer), each unit over is reduced to 1/ratio of a unit; then everything is multiplied by "
            "makeup. Ratio 1 is neutral; 20 is close to a limiter.",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def compressor_edit(threshold: float, ratio: float, makeup: float):
    """Above `threshold` (a size), the stream's size at a position is reduced: every unit over
    the threshold becomes 1/ratio of a unit. Then everything is multiplied by `makeup`."""
    def edit(h, pos):
        x = h.float()
        n = x.norm(dim=-1, keepdim=True).clamp_min(1e-9)
        target = torch.where(n > threshold, threshold + (n - threshold) / ratio, n)
        return (x * (target / n) * makeup).to(h.dtype)
    return edit


def edit(u, layer):
    return compressor_edit(u.num("thresh") * float(u.stats()["norm"][layer]), max(1.0, u.num("ratio")), u.num("makeup"))


def code(u):
    return {"expr": f"compressor_edit({u.str('thresh')} * typical_size[layer], ratio={u.str('ratio')}, makeup={u.str('makeup')})",
            "note": "typical_size is the stream's mean size at that layer over the reference set, model unchanged",
            "uses": [compressor_edit]}
