# Vector Abliteration Units: Principal Bands
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
from typing import List

import torch

BANDS = (8, 64)                    # low: principal directions 1-8; mid: 9-64; high: the rest

UNIT = {
    "vau": 1, "id": "eq", "title": "Principal Bands", "short": "Bands", "category": "effect", "level": "model",
    "what": "Scales three bands of the stream's principal directions: low, mid, high",
    "site": "stream", "axis": "any", "targets": ["layer"], "requires": ["stats", "pca"],
    "params": [
        {"key": "low", "label": "Low", "tip": "x = h − μ;  h' = h + (low − 1) · x V₁₋₈ᵀ V₁₋₈", "kind": "knob", "min": 0, "max": 2, "default": 1, "neutral": 1},
        {"key": "mid", "label": "Mid", "tip": "h' += (mid − 1) · x V₉₋₆₄ᵀ V₉₋₆₄", "kind": "knob", "min": 0, "max": 2, "default": 1, "neutral": 1},
        {"key": "high", "label": "High", "tip": "h' += (high − 1) · x V₆₅₊ᵀ V₆₅₊", "kind": "knob", "min": 0, "max": 2, "default": 1, "neutral": 1},
    ],
    "example": "eq layer=6 low=1 mid=1 high=1",
    "summary": {"reads": "gain", "label": "level"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "The stream's principal directions over the reference set at that layer, ranked by how much they "
            "vary, in three bands (1 to 8, 9 to 64, the rest), each multiplied by its gain; the mean is kept. "
            "All gains 1 are neutral.",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def eq_edit(mean: torch.Tensor, bands: List[torch.Tensor], gains: List[float]):
    """Splits the stream (less the corpus mean) into bands of principal directions and scales
    each band by its gain; the mean is kept."""
    def edit(h, pos):
        x = h.float()
        xc = x - mean
        for v, g in zip(bands, gains):
            if g != 1.0:
                x = x + (g - 1.0) * ((xc @ v.T) @ v)
        return x.to(h.dtype)
    return edit


def prepare(u):
    for layer in u.layers():          # measured on the unchanged model, before any hook goes on
        u.pca(layer)


def edit(u, layer):
    v = torch.tensor(u.pca(layer), device=u.device)
    lo, mid = BANDS
    return eq_edit(torch.tensor(u.stats()["mean"][layer], device=u.device), [v[:lo], v[lo:mid], v[mid:]],
                   [u.num("low"), u.num("mid"), u.num("high")])


def code(u):
    return {"expr": f"eq_edit(corpus_mean[layer], principal_directions(layer) in bands 1-8, 9-64, 65-, "
                    f"gains=[{u.str('low')}, {u.str('mid')}, {u.str('high')}])",
            "note": "the mean and the principal directions are measured over the reference set, model unchanged",
            "uses": [eq_edit]}
