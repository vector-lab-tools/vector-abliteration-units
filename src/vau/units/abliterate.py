# Vector Abliteration Units: Abliterate
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Abliterate: directional ablation of what each block's attention and MLP write.

At each chosen block, the component of the attention and MLP outputs along a direction is
removed, in proportion to a strength that varies over the blocks. This is the operation of
Arditi et al. (2024), applied by the community as "abliteration" (FailSpy's abliterator;
Sumandora's remove-refusals-with-transformers; Labonne 2024), with the refinements later
tools added:

- a strength kernel over the blocks: largest at a peak block and tapering to an edge value
  over a width, then nothing (the linear taper of Heretic's weight kernel), or a bell curve
  (OBLITERATUS's Gaussian layer weighting);
- a separate strength for the MLPs (Heretic and OBLITERATUS both find ablating the MLPs
  harms a model more than ablating attention);
- projected removal (Lai 2025): the direction is first made orthogonal to the stream's mean
  at that layer, so that only the part of it that is not the ordinary stream is removed;
- Keep size (Lai 2025, Heretic's MPOA): each output feature is scaled back to the length its
  row of the weight matrix had before the removal;
- the bias too (as OBLITERATUS projects biases), so the direction is removed from everything
  the component writes, unless bias=0.

Written from those descriptions; no code from Heretic or OBLITERATUS (both AGPL-3.0) is used.
Applied with forward hooks on the output projections: removing v from W x + b is the same as
replacing W by (I - s v v^T) W and b by (I - s v v^T) b. No weight is altered.
"""
from __future__ import annotations

import math
from typing import List, Optional, Tuple

import torch

UNIT = {
    "vau": 1, "id": "abliterate", "title": "Abliterate", "category": "intervention", "level": "model",
    "what": "Removes a direction from what attention and MLPs write, with a strength that peaks at one block and tapers",
    "site": "output", "axis": "any", "targets": ["block"], "requires": ["stats", "directions"],
    "params": [
        {"key": "dir", "label": "Direction", "tip": "v = unit(dir) at the layer each block writes into", "kind": "direction", "required": True},
        {"key": "shape", "label": "Shape", "tip": "how s(l) falls from the peak: linear, bell or flat", "kind": "choice", "choices": ["linear", "bell", "flat"], "default": "linear"},
        {"key": "peak", "label": "Peak", "tip": "s(l) is largest at l = peak × (depth − 1)", "kind": "knob", "min": 0, "max": 1, "default": 0.7, "step": 0.01},
        {"key": "width", "label": "Width", "tip": "s(l) = 0 beyond width × (depth − 1) from the peak", "kind": "knob", "min": 0.05, "max": 1, "default": 0.4, "step": 0.01},
        {"key": "edge", "label": "Edge", "tip": "s at the edge of the reach = edge × s(peak)", "kind": "knob", "min": 0, "max": 1, "default": 0.3, "step": 0.01},
        {"key": "share", "label": "MLP share", "tip": "s_mlp(l) = share × s(l)", "kind": "knob", "min": 0, "max": 1, "default": 0.5, "step": 0.01},
        {"key": "projected", "label": "Projected", "tip": "v ← unit(v − (v·μ̂) μ̂),  μ = the stream's mean", "kind": "toggle", "default": 1},
        {"key": "size", "label": "Keep size", "tip": "rows of (I − s vvᵀ) W rescaled to ‖Wᵢ‖", "kind": "toggle", "default": 1},
        {"key": "bias", "label": "Bias too", "tip": "b' = (I − s vvᵀ) b as well", "kind": "toggle", "default": 1},
        {"key": "strength", "label": "Strength", "tip": "y' = (I − s vvᵀ) y,  s = strength × kernel(l)", "kind": "fader", "min": 0, "max": 1.5, "default": 1, "step": 0.01, "neutral": 0},
    ],
    "example": "abliterate block=all dir=negation strength=1",
    "summary": {"reads": "turn", "label": "turned"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "Removes the component along a direction from what each chosen block's attention and MLP write. "
            "<i>Strength</i> is the share removed at the peak (1 removes it all; above 1 reverses some of it). "
            "<i>Peak</i> is the block where the strength is greatest, as a share of the model's depth (0 the first "
            "block, 1 the last); <i>width</i>, also a share of the depth, is how far it reaches either side; "
            "<i>edge</i> is the strength at that reach, as a share of the peak. <i>Shape</i>: linear tapers in a "
            "straight line (Heretic's kernel), bell along a Gaussian (OBLITERATUS), flat removes the same share at "
            "every chosen block. <i>MLP share</i> scales the strength for the MLPs. <i>Projected</i> first makes the "
            "direction orthogonal to the stream's mean at that layer (Lai's projected abliteration); <i>Keep size</i> "
            "scales each output feature back to its weight row's length (Lai's norm-preserving abliteration); "
            "<i>Bias too</i> removes the direction from the bias as well. Each block uses the direction at the layer "
            "it writes into. Strength 0 is neutral.",
    "inspired_by": "directional ablation (Arditi et al. 2024) as abliteration tools apply it, with Heretic's kernel and Lai's refinements",
    "references": ["Arditi, A. et al. (2024) Refusal in Language Models Is Mediated by a Single Direction. arXiv:2406.11717",
                   "FailSpy, abliterator. https://github.com/FailSpy/abliterator",
                   "Sumandora, remove-refusals-with-transformers. https://github.com/Sumandora/remove-refusals-with-transformers",
                   "Labonne, M. (2024) Uncensor any LLM with abliteration. https://huggingface.co/blog/mlabonne/abliteration",
                   "Lai, J. (2025) Projected abliteration; Norm-preserving biprojected abliteration. Hugging Face",
                   "Weidmann, P. E. (2025) Heretic. https://github.com/p-e-w/heretic",
                   "elder-plinius, OBLITERATUS. https://github.com/elder-plinius/OBLITERATUS"],
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def kernel(n_blocks: int, shape: str, peak: float, width: float, edge: float) -> List[float]:
    """The strength (as a share of the peak's) at each block. Peak and width are shares of the
    depth. Linear: from 1 at the peak straight down to `edge` at `width` away, nothing beyond.
    Bell: a Gaussian whose value at `width` away is `edge` (or a tenth, if edge is 0), cut off
    beyond. Flat: 1 everywhere."""
    last = max(1, n_blocks - 1)
    p, w = peak * last, max(1e-6, width * last)
    out = []
    for l in range(n_blocks):
        d = abs(l - p)
        if shape == "flat":
            out.append(1.0)
        elif d > w + 1e-9:
            out.append(0.0)
        elif shape == "bell":
            e = edge if edge > 0 else 0.1
            out.append(math.exp(math.log(e) * (d / w) ** 2) if e < 1 else 1.0)
        else:
            out.append(1.0 + (d / w) * (edge - 1.0))
    return out


def out_matrix(mod) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
    """A projection's weight as an (out, in) float32 matrix, and its bias. GPT-2's Conv1D keeps
    its weight the other way round, (in, out)."""
    w = mod.weight.detach().float().cpu()
    if type(mod).__name__ == "Conv1D":
        w = w.T
    b = mod.bias.detach().float().cpu() if getattr(mod, "bias", None) is not None else None
    return w.contiguous(), b


def unit_direction(v: torch.Tensor, mean: Optional[torch.Tensor]) -> torch.Tensor:
    """The unit direction, made orthogonal to the stream's mean first if a mean is given."""
    v = v.float()
    if mean is not None:
        m = mean.float() / mean.float().norm().clamp_min(1e-9)
        v = v - (v @ m) * m
    return v / v.norm().clamp_min(1e-9)


def abliterate_hook(v: torch.Tensor, s: float, scale: Optional[torch.Tensor], bias: Optional[torch.Tensor], with_bias: bool):
    """Forward hook on an output projection: removes s times the output's component along the
    unit direction v. Without the bias, only what the weights write (output - bias) is projected.
    With `scale`, the projected weights' output features are scaled back to their rows' lengths."""
    def hook(module, args, output):
        y = output[0] if isinstance(output, tuple) else output
        yf = y.float()
        b = bias if bias is not None else 0
        w = yf - b                                   # what the weights write
        w = w - s * (w @ v).unsqueeze(-1) * v
        if scale is not None:
            w = w * scale
        if bias is not None:
            b2 = bias - s * (bias @ v) * v if with_bias else bias
        else:
            b2 = 0
        new = (w + b2).to(y.dtype)
        return (new,) + tuple(output[1:]) if isinstance(output, tuple) else new
    return hook


def _plan(u):
    """(block, part, strength) for every module to hook."""
    n = u.depth()
    k = kernel(n, u.str("shape"), u.clamped("peak"), u.clamped("width"), u.clamped("edge"))
    s, share = u.num("strength"), u.clamped("share")
    out = []
    for l in u.blocks():
        if k[l] <= 0:
            continue
        out.append((l, "attn", s * k[l]))
        if share > 0:
            out.append((l, "mlp", s * k[l] * share))
    return out


def attach(u):
    if u.num("strength") == 0:                # neutral: nothing to remove
        return
    stats = u.stats() if u.flag("projected") else None
    d = u.direction("dir")
    for l, part, s in _plan(u):
        layer = l + 1                            # block l writes into the stream at layer l + 1
        mean = torch.tensor(stats["mean"][layer]) if stats is not None else None
        v = unit_direction(d.vector(layer, "cpu"), mean)
        mod = u.component(part, l)
        W, b = out_matrix(mod)
        scale = None
        if u.flag("size"):
            Wp = W - s * torch.outer(v, v @ W)
            scale = (W.norm(dim=1) / Wp.norm(dim=1).clamp_min(1e-9)).to(u.device)
        u.hook_output(mod, abliterate_hook(v.to(u.device), s, scale, b.to(u.device) if b is not None else None,
                                           u.flag("bias")), block=l)


def code(u):
    lines = []
    if u.num("strength") == 0:
        lines.append("# strength 0: no hook")
    for l, part, s in _plan(u):
        lines.append(f"{u.host.component_path(part, l)}.register_forward_hook(abliterate_hook("
                     f"unit('{u.str('dir')}' at layer {l + 1}{', orthogonal to the mean' if u.flag('projected') else ''}), "
                     f"s={s:.3f}{', size kept' if u.flag('size') else ''}{', bias too' if u.flag('bias') else ''}))")
    return {"lines": lines,
            "note": f"strength over the blocks: {u.str('shape')} kernel, peak {u.str('peak')} of the depth, width {u.str('width')}, edge {u.str('edge')}; MLP share {u.str('share')}",
            "uses": [abliterate_hook, kernel, unit_direction]}
