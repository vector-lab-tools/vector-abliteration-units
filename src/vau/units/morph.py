# Vector Abliteration Units: Morph
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Morph: a learned low-rank change to what each chosen block's attention and MLP write, fitted
to the two sets of texts a direction was made from.

What a block's output projection writes on one set's tokens (the moved set) is pulled toward
what it writes on the other set's nearest tokens (the set it moves toward), while what it
writes on that other set, and on the host's reference texts, stays where it was. The
objective is inspired by Arbitrary-Rank Ablation (ARA) in Philipp Emanuel Weidmann's Heretic
(2026): a term that keeps the kept outputs where they were, a term that pulls each moved
output toward its k nearest neighbours among the original outputs it moves toward, and an
overcorrection term that pushes it from its own original. Written here from that
description; no Heretic code is used (Heretic is AGPL-3.0).

The change is (x @ A.T) @ B.T added to the projection's output, A (rank, in) and B (out,
rank), fitted per module with L-BFGS on the CPU in float32 from a fixed seed, on the
unchanged model, before any hook goes on. With size kept, each output feature is then
scaled back to the length its row of the weight matrix had, inspired by Lai's norm-preserving
ablation (2025). No weight is altered: the change is applied with a forward hook.
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Dict, List, Optional, Tuple

import torch

UNIT = {
    "vau": 1, "id": "morph", "title": "Morph", "category": "fitted", "level": "model",
    "what": "A learned change to what attention and MLPs write, fitted to move one side of a direction's texts toward the other",
    "site": "output", "axis": "any", "targets": ["block"], "requires": ["texts", "contrasts"],
    "params": [
        {"key": "dir", "label": "Direction", "tip": "fitted to the two sets of texts dir was made from", "kind": "direction", "required": True},
        {"key": "move", "label": "Move", "tip": "away: positive → negative texts;  toward: negative → positive", "kind": "choice", "choices": ["away", "toward"], "default": "away"},
        {"key": "part", "label": "Part", "tip": "which output projections change: attn, mlp or both", "kind": "choice", "choices": ["both", "attn", "mlp"], "default": "both"},
        {"key": "keep", "label": "Keep", "tip": "loss += keep · mean ‖Y′ − Y‖² on the kept texts", "kind": "knob", "min": 0, "max": 1, "default": 1},
        {"key": "pull", "label": "Pull", "tip": "loss += pull · (kNN(Y′ₘ, Yₜ) − over · kNN(Y′ₘ, Yₘ))", "kind": "knob", "min": 0, "max": 1, "default": 0.3},
        {"key": "over", "label": "Over", "tip": "push from their own originals: − over · kNN(Y′ₘ, Yₘ)", "kind": "knob", "min": 0, "max": 1.3, "default": 0.5},
        {"key": "k", "label": "Neighbours", "tip": "k nearest neighbours in each kNN distance", "kind": "int", "min": 1, "max": 15, "default": 5},
        {"key": "rank", "label": "Rank", "tip": "ΔW = B·A,  A: rank × in,  B: out × rank", "kind": "int", "min": 1, "max": 64, "default": 16},
        {"key": "size", "label": "Keep size", "tip": "each row of W + B·A rescaled to its original ‖Wᵢ‖", "kind": "toggle", "default": 1},
        {"key": "amount", "label": "Amount", "tip": "y' = y + amount · (x Aᵀ) Bᵀ", "kind": "fader", "min": 0, "max": 2, "default": 1, "step": 0.01, "neutral": 0},
    ],
    "example": "morph block=all dir=not-x-but-y move=away amount=1",
    "summary": {"reads": "turn", "label": "turned"},     # what a host's summary of the strip shows (SPEC 5e)
    "help": "Fitted to the two sets of texts a direction was made from. With <code>move=away</code> what each "
            "chosen block writes on the direction's positive texts is pulled toward what it writes on the "
            "negative texts (or the reference corpus, for a direction made from a passage or a word); with "
            "<code>move=toward</code> the other way. What it writes on the set moved toward, and on the reference "
            "corpus, is held where it was (<i>keep</i>); <i>pull</i> weighs the move against that; <i>over</i> "
            "pushes the moved outputs from where they were; <i>neighbours</i> is how many of the nearest outputs "
            "each is pulled toward; <i>rank</i> is the change's rank. The fit runs once per setting, before the "
            "run, and is cached; <i>amount</i> scales the fitted change and needs no new fit. Amount 0 is neutral. The fit "
            "works token by token: where a contrast set's paired texts are the same up to the construction (\"The "
            "door is\" before \"not\"), the positions before it have nothing to pull, so vMorph changes how the model "
            "goes on after the construction more than whether it writes it.",
    "inspired_by": "the objective of Arbitrary-Rank Ablation in Heretic (Weidmann 2026)",
    "references": ["Weidmann, P. E. (2025) Heretic. https://github.com/p-e-w/heretic (Arbitrary-Rank Ablation: pull request 211, 2026)",
                   "Lai, J. (2025) Norm-preserving biprojected abliteration. https://huggingface.co/blog/grimjim/norm-preserving-biprojected-abliteration"],
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}

STEPS = 5                      # L-BFGS steps, each of up to 20 iterations
_fits: Dict[str, Dict[Tuple[int, str], Dict[str, torch.Tensor]]] = {}


# ---------------------------------------------------------------------------------------------
# The objective and the fit
# ---------------------------------------------------------------------------------------------

def knn_distance(a: torch.Tensor, b: torch.Tensor, k: int) -> torch.Tensor:
    """For each row of a, the mean Euclidean distance to its k nearest rows of b."""
    d = torch.cdist(a, b)
    return d.topk(min(k, b.shape[0]), dim=1, largest=False).values.mean(1)


def morph_outputs(W, b, X, base, A, B, keep_size: bool):
    """What the module writes with the change: its own product plus (X @ A.T) @ B.T, each output
    feature scaled back to its weight row's original length if size is kept, then the bias."""
    y = base + (X @ A.T) @ B.T
    if keep_size:
        y = y * (W.norm(dim=1) / (W + B @ A).norm(dim=1).clamp_min(1e-9))
    return y + b if b is not None else y


def morph_loss(W, b, kept, moved, toward, A, B, p) -> torch.Tensor:
    """keep × the mean squared change on the kept set, plus pull × (the moved set's mean distance
    to its nearest original outputs on the set it moves toward, less over × its distance to its
    own original outputs)."""
    Xk, Yk, base_k = kept
    Xm, Ym, base_m = moved
    nk = morph_outputs(W, b, Xk, base_k, A, B, p["size"])
    nm = morph_outputs(W, b, Xm, base_m, A, B, p["size"])
    keep = ((nk - Yk) ** 2).mean()
    pull = knn_distance(nm, toward, p["k"]).mean() - p["over"] * knn_distance(nm, Ym, p["k"]).mean()
    return p["keep"] * keep + p["pull"] * pull


def fit_morph(W, b, kept, moved, toward, p, seed: int) -> Dict[str, torch.Tensor]:
    """A (rank, in) and B (out, rank) for one module. A starts as PyTorch starts a linear layer's
    weight, from a fixed seed; B starts at zero, which is no change at all."""
    out_f, in_f = W.shape
    A = torch.empty(p["rank"], in_f)
    torch.nn.init.kaiming_uniform_(A, a=math.sqrt(5), generator=torch.Generator().manual_seed(seed))
    A.requires_grad_(True)
    B = torch.zeros(out_f, p["rank"], requires_grad=True)
    sub = (lambda Y: Y - b) if b is not None else (lambda Y: Y)
    kept = (kept[0], kept[1], sub(kept[1]))
    moved = (moved[0], moved[1], sub(moved[1]))
    opt = torch.optim.LBFGS([A, B], lr=1.0, max_iter=20, history_size=10, line_search_fn="strong_wolfe")

    def closure():
        opt.zero_grad()
        loss = morph_loss(W, b, kept, moved, toward, A, B, p)
        loss.backward()
        return loss
    with torch.enable_grad():
        for _ in range(STEPS):
            opt.step(closure)
    return {"A": A.detach().clone(), "B": B.detach().clone()}


def out_matrix(mod) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
    """A projection's weight as an (out, in) float32 matrix, and its bias. GPT-2's Conv1D keeps
    its weight the other way round, (in, out)."""
    w = mod.weight.detach().float().cpu()
    if type(mod).__name__ == "Conv1D":
        w = w.T
    b = mod.bias.detach().float().cpu() if getattr(mod, "bias", None) is not None else None
    return w.contiguous(), b


def morph_hook(A: torch.Tensor, B: torch.Tensor, scale: Optional[torch.Tensor], bias: Optional[torch.Tensor]):
    """Forward hook on an output projection: adds (x @ A.T) @ B.T to what it writes. With `scale`,
    the module's own product and the addition are scaled per output feature (the bias is not)."""
    def hook(module, args, output):
        y = output[0] if isinstance(output, tuple) else output
        x = args[0].float()
        d = (x @ A.T) @ B.T
        if scale is None:
            new = y.float() + d
        else:
            base = y.float() - bias if bias is not None else y.float()
            new = (base + d) * scale + (bias if bias is not None else 0)
        new = new.to(y.dtype)
        return (new,) + tuple(output[1:]) if isinstance(output, tuple) else new
    return hook


# ---------------------------------------------------------------------------------------------
# The unit
# ---------------------------------------------------------------------------------------------

def _settings(u) -> Dict[str, Any]:
    return {"keep": max(0.0, u.num("keep")), "pull": max(0.0, u.num("pull")), "over": max(0.0, u.num("over")),
            "k": max(1, u.int("k")), "rank": max(1, min(256, u.int("rank"))), "size": u.flag("size")}


def _parts(u) -> List[str]:
    return ["attn", "mlp"] if u.str("part") == "both" else [u.str("part")]


def _sets(u) -> Tuple[List[str], List[str], List[str]]:
    """(moved, toward, kept) texts."""
    t = u.direction_texts("dir")
    pos = [x for x in t.get("positive", []) if str(x).strip()]
    neg = [x for x in t.get("negative", []) if str(x).strip()]
    ref = u.reference_texts()
    if not pos:
        raise u.error(f"direction '{u.str('dir')}' keeps no texts to fit to.")
    against_ref = not neg
    if against_ref:
        neg = ref
    moved, toward = (pos, neg) if u.str("move") == "away" else (neg, pos)
    kept = toward + ([] if against_ref else ref)          # the reference texts stay where they were too
    return moved, toward, kept


def _key(u, moved, toward, kept) -> str:
    blob = json.dumps({"moved": moved, "toward": toward, "kept": kept, "blocks": u.blocks(), "parts": _parts(u),
                       "p": _settings(u), "steps": STEPS, "v": 1}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:24]


def fit(u) -> Dict[Tuple[int, str], Dict[str, torch.Tensor]]:
    """The fitted change for every module the line names: kept in memory, cached by the host, or
    fitted now."""
    moved, toward, kept = _sets(u)
    key = _key(u, moved, toward, kept)
    path = u.cache("morph", key)
    tag = str(path) if path is not None else key
    if tag in _fits:
        return _fits[tag]
    if path is not None and path.exists():
        _fits[tag] = torch.load(path, weights_only=True)
        return _fits[tag]
    mods = {(l, p): u.component(p, l) for l in u.blocks() for p in _parts(u)}
    io_k, io_m, io_t = u.capture(kept, mods), u.capture(moved, mods), u.capture(toward, mods)
    p = _settings(u)
    out = {}
    for (l, prt), mod in mods.items():
        W, b = out_matrix(mod)
        seed = int(hashlib.sha256(f"{l}:{prt}".encode()).hexdigest()[:8], 16)
        out[(l, prt)] = fit_morph(W, b, io_k[(l, prt)], io_m[(l, prt)], io_t[(l, prt)][1], p, seed)
    if path is not None:
        torch.save(out, path)
    _fits[tag] = out
    return out


def prepare(u):
    fit(u)


def attach(u):
    amount = u.num("amount")
    if amount == 0:                       # neutral: nothing to add
        return
    f = fit(u)
    size = u.flag("size")
    for l in u.blocks():
        for prt in _parts(u):
            mod = u.component(prt, l)
            A, B = f[(l, prt)]["A"], f[(l, prt)]["B"] * amount
            scale = bias = None
            if size:
                W, b = out_matrix(mod)
                scale = (W.norm(dim=1) / (W + B @ A).norm(dim=1).clamp_min(1e-9)).to(u.device)
                bias = b.to(u.device) if b is not None else None
            u.hook_output(mod, morph_hook(A.to(u.device), B.to(u.device), scale, bias), block=l)


def code(u):
    lines = []
    host = u.host
    for l in u.blocks():
        for prt in _parts(u):
            lines.append(f"{host.component_path(prt, l)}.register_forward_hook(morph_hook(A[{l}, '{prt}'], "
                         f"{u.str('amount')} * B[{l}, '{prt}']{', size kept' if u.flag('size') else ''}))")
    return {"lines": lines,
            "note": (f"A and B fitted with fit_morph on the unchanged model: move={u.str('move')} along "
                     f"'{u.str('dir')}', keep={u.str('keep')}, pull={u.str('pull')}, over={u.str('over')}, "
                     f"k={u.str('k')}, rank={u.str('rank')}"),
            "uses": [morph_hook, fit_morph, morph_loss, morph_outputs, knn_distance]}
