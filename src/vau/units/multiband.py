# Vector Abliteration Units: Band Shrink
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
from typing import List

import torch

BANDS = (8, 64)                    # as Principal Bands: principal directions 1-8, 9-64, the rest

UNIT = {
    "vau": 1, "id": "multiband", "title": "Band Shrink", "short": "Bandshrink", "category": "effect", "level": "model",
    "what": "Compresses the stream separately in three bands of its principal directions: low, mid, high",
    "site": "stream", "axis": "any", "targets": ["layer"], "requires": ["stats", "pca"],
    "params": [
        {"key": "ratio", "label": "Ratio", "tip": "per band b: n > L_b:  n' = L_b + (n − L_b) / ratio", "kind": "knob", "min": 1, "max": 20, "default": 4, "step": 0.5, "neutral": 1},
        {"key": "band", "label": "Band", "tip": "low: V₁₋₈ · mid: V₉₋₆₄ · high: V₆₅₊ · all", "kind": "choice", "choices": ["all", "low", "mid", "high"], "default": "all"},
        {"key": "thresh", "label": "Threshold", "tip": "L_b = thresh × typical ‖band b‖ over the corpus", "kind": "fader", "min": 0.1, "max": 3, "default": 1, "step": 0.05},
    ],
    "example": "multiband layer=6 thresh=1 ratio=4",
    "summary": {"reads": "gain", "label": "gain reduction"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "The stream, less its corpus mean, is split into the bands vPrincipal Bands uses (principal directions 1 to 8, "
            "9 to 64, the rest). In each band compressed (all three, or the one named), where the band's size at "
            "a position is above the threshold (a multiple of that band's typical size over the reference "
            "corpus), each unit over is reduced to 1/ratio of a unit. Ratio 1 is neutral.",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def multiband_edit(mean: torch.Tensor, bands: List[torch.Tensor], limits: List[float], ratio: float, which: List[int]):
    """Each chosen band of principal directions compressed above its limit (a size): the band's
    component of the stream (less the mean) is shortened so that every unit over the limit becomes
    1/ratio of a unit."""
    def edit(h, pos):
        x = h.float()
        xc = x - mean
        out = x.clone()
        for b in which:
            v, lim = bands[b], limits[b]
            y = xc @ v.T                                        # the band's coordinates
            n = y.norm(dim=-1, keepdim=True).clamp_min(1e-9)
            target = torch.where(n > lim, lim + (n - lim) / ratio, n)
            out = out + ((y * (target / n - 1)) @ v)
        return out.to(h.dtype)
    return edit


def prepare(u):
    for layer in u.layers():
        u.pca(layer)
        u.pca_scales(layer)


def edit(u, layer):
    v = torch.tensor(u.pca(layer), device=u.device)
    s = torch.tensor(u.pca_scales(layer))
    lo, mid = BANDS
    cuts = [(0, lo), (lo, mid), (mid, v.shape[0])]
    bands = [v[a:b] for a, b in cuts]
    thresh = u.num("thresh")
    limits = [thresh * float((s[a:b] ** 2).sum().sqrt()) for a, b in cuts]
    which = {"all": [0, 1, 2], "low": [0], "mid": [1], "high": [2]}[u.str("band")]
    return multiband_edit(torch.tensor(u.stats()["mean"][layer], device=u.device), bands, limits, max(1.0, u.num("ratio")), which)


def code(u):
    return {"expr": f"multiband_edit(corpus_mean[layer], principal_directions(layer) in bands 1-8, 9-64, 65-, "
                    f"limits={u.str('thresh')} * each band's typical size, ratio={u.str('ratio')}, bands={u.str('band')})",
            "note": "the mean, the principal directions and each band's typical size are measured over the reference set, model unchanged",
            "uses": [multiband_edit]}
