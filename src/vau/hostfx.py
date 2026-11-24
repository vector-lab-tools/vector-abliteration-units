# Vector Abliteration Units
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
The host features: controls every strip has, which the host applies around the unit's own
edit, so that no unit implements them and every unit has them. Their keys are reserved: no
unit may take a parameter of the same name.

- wet        how much of the strip's change is applied: 1 all of it, 0 none (neutral).
- env        an envelope over the depth: none (the same everywhere), linear, bell or flat.
  epeak      where it peaks, as a share of the depth (0 the first layer or block, 1 the last)
  ewidth     how far it reaches either side, as a share of the depth
  eedge      its value at that reach, as a share of the peak
- keepnorm   after the change, each position is scaled back to the size it had before it
- wfrom      a window over the text: the strip acts only from this step (1 is the pass that
  wto        writes the first new token; earlier positions are the prompt's) to this one;
             0 and 0 is everywhere, prompt included; wto 0 is to the end
- control    none, or random: every direction the strip uses is replaced, at each layer,
  cseed      by a random direction of the same size, drawn from this seed. A random control
             shows what a push of the same size in no particular direction does, against
             which a direction's own effect can be read.

For a stream unit the envelope runs over the places in the stream (0 to the depth); for a
unit that hooks a component's output it runs over the blocks, if the unit says which block
it hooks (u.hook_output(module, fn, block=...)); otherwise only wet applies.
"""
from __future__ import annotations

import hashlib
import math
from typing import Any, Callable, Dict, List, Optional

import torch

HOST_PARAMS: List[Dict[str, Any]] = [
    {"key": "wet", "label": "Wet", "tip": "h' = h + wet · (edit(h) − h)", "kind": "knob", "min": 0, "max": 1, "default": 1, "step": 0.01, "neutral": 0},
    {"key": "env", "label": "Envelope", "tip": "wet × e(l): none, linear, bell or flat over the depth", "kind": "choice", "choices": ["none", "linear", "bell", "flat"], "default": "none"},
    {"key": "epeak", "label": "Peak", "tip": "e(l) is largest at l = epeak × depth", "kind": "knob", "min": 0, "max": 1, "default": 0.5, "step": 0.01, "when": {"env": ["linear", "bell", "flat"]}},
    {"key": "ewidth", "label": "Width", "tip": "e(l) = 0 beyond ewidth × depth from the peak", "kind": "knob", "min": 0.05, "max": 1, "default": 0.5, "step": 0.01, "when": {"env": ["linear", "bell", "flat"]}},
    {"key": "eedge", "label": "Edge", "tip": "e at the edge of the reach = eedge", "kind": "knob", "min": 0, "max": 1, "default": 0, "step": 0.01, "when": {"env": ["linear", "bell", "flat"]}},
    {"key": "keepnorm", "label": "Keep size", "tip": "h' ← h' · ‖h‖ / ‖h'‖ at each position", "kind": "toggle", "default": 0},
    {"key": "wfrom", "label": "From step", "tip": "acts only at steps ≥ wfrom  (0: everywhere)", "kind": "int", "min": 0, "max": 4096, "default": 0},
    {"key": "wto", "label": "To step", "tip": "acts only at steps ≤ wto  (0: to the end)", "kind": "int", "min": 0, "max": 4096, "default": 0},
    {"key": "control", "label": "Control", "tip": "random: each direction → random, same ‖·‖ per layer", "kind": "choice", "choices": ["none", "random"], "default": "none"},
    {"key": "cseed", "label": "Control seed", "tip": "the random control's seed", "kind": "int", "min": 0, "max": 9999, "default": 0, "when": {"control": ["random"]}},
]
RESERVED = tuple(p["key"] for p in HOST_PARAMS)


def envelope(n: int, shape: str, peak: float, width: float, edge: float) -> List[float]:
    """A factor at each of n places. Peak and width are shares of the depth. linear: 1 at the
    peak, straight down to `edge` at `width` away, nothing beyond. bell: a Gaussian whose value
    at `width` away is `edge` (a tenth if edge is 0), nothing beyond. flat: 1 within reach,
    nothing beyond. none: 1 everywhere."""
    if shape == "none":
        return [1.0] * n
    last = max(1, n - 1)
    p, w = peak * last, max(1e-6, width * last)
    out = []
    for l in range(n):
        d = abs(l - p)
        if d > w + 1e-9:
            out.append(0.0)
        elif shape == "flat":
            out.append(1.0)
        elif shape == "bell":
            e = edge if edge > 0 else 0.1
            out.append(math.exp(math.log(e) * (d / w) ** 2) if e < 1 else 1.0)
        else:
            out.append(1.0 + (d / w) * (edge - 1.0))
    return out


def settings(u) -> Dict[str, Any]:
    """The host features as a line sets them, with their defaults."""
    p = u.params

    def num(k, d):
        try:
            return float(p.get(k, d))
        except ValueError:
            raise u.error(f"{k}={p[k]} should be a number.")
    return {"wet": min(1.0, max(0.0, num("wet", 1))), "env": p.get("env", "none"),
            "epeak": min(1.0, max(0.0, num("epeak", 0.5))), "ewidth": min(1.0, max(0.05, num("ewidth", 0.5))),
            "eedge": min(1.0, max(0.0, num("eedge", 0))), "keepnorm": bool(int(num("keepnorm", 0))),
            "control": p.get("control", "none"), "cseed": int(num("cseed", 0)),
            "wfrom": max(0, int(num("wfrom", 0))), "wto": max(0, int(num("wto", 0)))}


def active(s: Dict[str, Any]) -> bool:
    """Whether any host feature changes what the unit does."""
    return s["wet"] != 1.0 or s["env"] != "none" or s["keepnorm"] or s["control"] != "none" or windowed(s)


def windowed(s: Dict[str, Any]) -> bool:
    return s["wfrom"] > 0 or s["wto"] > 0


def window_mask(s: Dict[str, Any], steps: torch.Tensor) -> torch.Tensor:
    """Which positions the strip acts at, from each position's step (1 writes the first new token)."""
    m = steps >= max(1, s["wfrom"]) if s["wfrom"] > 0 else torch.ones_like(steps, dtype=torch.bool)
    if s["wto"] > 0:
        m = m & (steps <= s["wto"])
    return m


def factor(s: Dict[str, Any], index: Optional[int], n: Optional[int]) -> float:
    """wet times the envelope's value at place `index` of `n` (1 if there is no envelope or no index)."""
    if s["env"] == "none" or index is None or not n:
        return s["wet"]
    return s["wet"] * envelope(n, s["env"], s["epeak"], s["ewidth"], s["eedge"])[index]


def mix(h: torch.Tensor, out: torch.Tensor, f: float, keepnorm: bool, mask: Optional[torch.Tensor] = None) -> torch.Tensor:
    """h moved toward the edited out by f (1 all the way, 0 not at all), then, with keepnorm,
    each position scaled back to the size it had in h; with a mask (positions), only there."""
    if f == 0.0:
        return h
    if f == 1.0 and not keepnorm:
        x = out
    else:
        x = h.float() + f * (out.float() - h.float())
        if keepnorm:
            x = x * (h.float().norm(dim=-1, keepdim=True) / x.norm(dim=-1, keepdim=True).clamp_min(1e-9))
        x = x.to(h.dtype)
    if mask is not None and h.dim() == 3 and mask.shape[0] == h.shape[1]:
        x = torch.where(mask.view(1, -1, 1).to(h.device), x, h)
    return x


def wrap_edit(edit: Callable, f: float, keepnorm: bool, window: Optional[Callable] = None) -> Callable:
    """A stream edit (h, pos) -> h with the host features around it. `window(n, device)` gives
    the mask of positions the strip acts at, if it has a window."""
    if f == 0.0:
        return lambda h, pos: h
    return lambda h, pos: mix(h, edit(h, pos), f, keepnorm, window(h.shape[1], h.device) if window else None)


def wrap_output(fn: Callable, f: float, keepnorm: bool, window: Optional[Callable] = None) -> Callable:
    """A forward hook (module, args, output) -> output with the host features around it."""
    def first(o):
        return o[0] if isinstance(o, tuple) else o

    def hook(module, args, output):
        if f == 0.0:
            return output
        r = fn(module, args, output)
        if r is None:
            return output
        y, y2 = first(output), first(r)
        new = mix(y, y2, f, keepnorm, window(y.shape[1], y.device) if (window and y.dim() == 3) else None)
        return (new,) + tuple(r[1:]) if isinstance(r, tuple) else new
    return hook


def wrap_input(fn: Callable, f: float, keepnorm: bool, window: Optional[Callable] = None) -> Callable:
    """A forward pre-hook (module, args) -> args with the host features around it: the module's
    input moved toward the edited input by f."""
    def hook(module, args):
        if f == 0.0:
            return args
        r = fn(module, args)
        if r is None:
            return args
        x = args[0]
        return (mix(x, r[0], f, keepnorm, window(x.shape[1], x.device) if (window and x.dim() == 3) else None),) + tuple(r[1:])
    return hook


class RandomDirection:
    """Stands in for a direction: at each layer, a random vector of the same size as the real
    direction there, drawn from a seed, the direction's name and the layer, so that the same
    line draws the same control every time."""

    def __init__(self, real, name: str, seed: int):
        self.real, self.name, self.seed = real, name, seed

    def _draw(self, layer: int, device) -> torch.Tensor:
        v = self.real.vector(layer, "cpu").float()
        k = int(hashlib.sha256(f"{self.seed}:{self.name}:{layer}".encode()).hexdigest()[:15], 16)
        z = torch.randn(v.shape[-1], generator=torch.Generator().manual_seed(k))
        return (z / z.norm() * v.norm()).to(device)

    def vector(self, layer: int, device) -> torch.Tensor:
        return self._draw(layer, device)

    def unit(self, layer: int, device) -> torch.Tensor:
        v = self._draw(layer, device)
        return v / v.norm().clamp_min(1e-12)

    @property
    def data(self):
        return {"name": f"random control for {self.name}", "source": {"kind": "random", "seed": self.seed}}

    def raw(self, layer: int):
        return self._draw(layer, "cpu").numpy()


def describe(s: Dict[str, Any]) -> str:
    """One line for a Code view: which host features are on."""
    parts = []
    if s["wet"] != 1.0:
        parts.append(f"wet {s['wet']:g}")
    if s["env"] != "none":
        parts.append(f"{s['env']} envelope (peak {s['epeak']:g}, width {s['ewidth']:g}, edge {s['eedge']:g} of the depth)")
    if s["keepnorm"]:
        parts.append("each position kept at its size")
    if windowed(s):
        parts.append(f"only from step {max(1, s['wfrom']) if s['wfrom'] else 'the start'} to {s['wto'] or 'the end'}")
    if s["control"] == "random":
        parts.append(f"random control: each direction replaced by a random one of the same size (seed {s['cseed']})")
    return "; ".join(parts)
