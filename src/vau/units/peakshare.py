# Vector Abliteration Units: Peak share (a meter)
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
UNIT = {
    "vau": 1, "id": "peakshare", "title": "Peak share", "category": "meter", "level": "probe",
    "what": "The share of the stream's size held by its few largest components, step by step",
    "site": "stream", "axis": "any", "targets": ["layer"], "requires": [],
    "params": [{"key": "k", "label": "Components", "tip": "Σ top-k hᵢ² / Σ hᵢ²  × 100", "kind": "int", "min": 1, "max": 64, "default": 8}],
    "display": {"kind": "series", "label": "share of the size in the largest components", "unit": "%"},
    "example": "peakshare layer=6 k=8",
    "help": "At each step, the share of the stream's squared size held by its <i>k</i> largest components, in "
            "percent. In many models a few dimensions carry very large values (\"massive activations\"); where "
            "they dominate, this meter reads high, and a vComponent Clamp at the same layer brings it down.",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def peak_share(stream, k: int):
    """Each row's share of its squared size in its k largest components, in percent."""
    sq = stream.float() ** 2
    return (100 * sq.topk(min(k, sq.shape[-1]), dim=-1).values.sum(-1) / sq.sum(-1).clamp_min(1e-12)).tolist()


def read(u, data):
    return [{"value": round(float(x), 3)} for x in peak_share(data["stream"], max(1, u.int("k")))]


def code(u):
    return {"lines": ["# a meter: no hook while the texts are written; afterwards the stream here is kept in one",
                      "# teacher-forced pass over each text, and read with peak_share(stream, k)"], "uses": [peak_share]}
