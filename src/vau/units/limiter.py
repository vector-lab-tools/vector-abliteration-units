# Vector Abliteration Units: Component Clamp
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
import torch

UNIT = {
    "vau": 1, "id": "limiter", "title": "Component Clamp", "short": "Clamp", "category": "effect", "level": "model",
    "what": "Clamps each position's largest components at a ceiling set by a quantile of their sizes",
    "site": "stream", "axis": "any", "targets": ["layer"], "requires": [],
    "params": [
        {"key": "sink", "label": "Sink too", "tip": "also clamp position 0, the attention sink", "kind": "toggle", "default": 0, "when": {"host": ["sink"]}},
        {"key": "ceiling", "label": "Ceiling", "tip": "L = quantile(|h|, ceiling);  h' = clamp(h, −L, L)", "kind": "fader", "min": 0.5, "max": 1, "default": 0.99, "step": 0.001, "neutral": 1},
    ],
    "example": "limiter layer=6 ceiling=0.99",
    "summary": {"reads": "touched", "label": "clamped"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "At each position, the sizes of the stream's components are ranked and the <i>ceiling</i> quantile "
            "of them taken as the limit; every component larger than that is clamped to it, sign kept. With "
            "ceiling 0.99 the largest 1% of a position's components are held down: in many models a few "
            "dimensions carry very large values (\"massive activations\"), and these are what a limiter "
            "catches. Heretic and OBLITERATUS clamp in the same way (winsorization) when they build "
            "directions, so that those dimensions do not dominate. The first position, where many models "
            "put an attention sink with the largest values of all, is left alone unless <i>sink too</i> is "
            "on (on a model with no sink there, it is clamped like any other). Ceiling 1 is neutral."
            "<p>It acts on each coordinate of the stream separately, so what it does depends on the coordinates the stream is written in. Those have a weaker claim to meaning than an MLP's neurons, which its nonlinearity singles out; how much weaker depends on the model's norms (a learned scale per coordinate gives them some standing).</p>",
    "inspired_by": "the winsorization of Heretic and OBLITERATUS",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def limiter_edit(q: float, sink: bool, has_sink: bool = True):
    """Each position's components clamped to ± the q-quantile of their absolute values; the first
    position (the attention sink) left alone unless `sink`."""
    def edit(h, pos):
        if q >= 1.0:
            return h
        x = h.float()
        lim = torch.quantile(x.abs(), q, dim=-1, keepdim=True)
        out = torch.maximum(torch.minimum(x, lim), -lim)
        if not sink and has_sink:
            out = torch.where(pos.view(1, -1, 1) == 0, x, out)
        return out.to(h.dtype)
    return edit


def edit(u, layer):
    return limiter_edit(min(1.0, max(0.5, u.num("ceiling"))), u.flag("sink"), u.sink)


def code(u):
    return {"expr": f"limiter_edit(q={u.str('ceiling')}, sink={u.flag('sink')})", "uses": [limiter_edit]}
