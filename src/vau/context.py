# Vector Abliteration Units
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""What a unit sees: one strip, its parameters typed and defaulted, and the host's methods."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from . import hostfx
from .host import Host, UnitError
from .registry import Unit


@dataclass
class Line:
    """A strip as a host hands it over: its kind, its parameters as written (strings), its line
    number, and its target. A host may pass its own object with the same attributes."""
    kind: str
    params: Dict[str, str] = field(default_factory=dict)
    lineno: int = 1

    def target(self) -> Tuple[str, Any]:
        for t in ("head", "attn", "mlp", "block", "layer"):
            if t in self.params:
                return t, self.params[t]
        return "", None


class UnitContext:
    """One strip of one unit, for one call. With host=None (checking a line before any model
    is loaded) only the parameter methods work."""

    def __init__(self, unit: Unit, strip, host: Optional[Host] = None):
        self.unit, self.strip, self.host = unit, strip, host
        self.params: Dict[str, str] = strip.params
        self.lineno: int = strip.lineno

    # --- parameters -----------------------------------------------------------------------
    def error(self, msg: str) -> Exception:
        return self.host.error(self.lineno, msg) if self.host else UnitError(f"Line {self.lineno}: {msg}")

    def _default(self, key):
        p = self.unit.param(key)
        return p.get("default") if p else None

    def num(self, key: str, default: Optional[float] = None) -> float:
        v = self.params.get(key)
        if v is None:
            d = self._default(key) if default is None else default
            if d is None:
                raise self.error(f"{self.unit.id} needs {key}=.")
            return float(d)
        try:
            return float(v)
        except ValueError:
            raise self.error(f"{key}={v} should be a number.")

    def int(self, key: str, default: Optional[int] = None) -> int:
        v = self.params.get(key)
        if v is None:
            d = self._default(key) if default is None else default
            if d is None:
                raise self.error(f"{self.unit.id} needs {key}=.")
            return int(d)
        try:
            return int(v)
        except ValueError:
            raise self.error(f"{key}={v} should be a whole number.")

    def str(self, key: str, default: Optional[str] = None) -> str:
        d = self._default(key) if default is None else default
        return str(self.params.get(key, "" if d is None else d))

    def flag(self, key: str) -> bool:
        return bool(self.int(key))

    def clamped(self, key: str) -> float:
        """A number held to the range its manifest gives it."""
        p = self.unit.param(key)
        v = self.num(key)
        return min(p["max"], max(p["min"], v)) if p and "min" in p else v

    # --- the host ---------------------------------------------------------------------------
    @property
    def device(self):
        return self.host.device

    def stats(self) -> Dict[str, Any]:
        return self.host.stats()

    def pca(self, layer: int):
        return self.host.pca(layer)

    def pca_scales(self, layer: int):
        return self.host.pca_scales(layer)

    def hostfx(self) -> Dict[str, Any]:
        """The host features this line sets (hostfx.py)."""
        return hostfx.settings(self)

    def direction(self, key: str = "dir"):
        """A direction the line names, or, under a random control, a random direction of the
        same size at each layer."""
        d = self.host.direction(self.params[key], self.lineno)
        s = self.hostfx()
        if s["control"] == "random":
            return hostfx.RandomDirection(d, self.params[key], s["cseed"])
        return d

    def layers(self) -> List[int]:
        return self.host.layers(self.strip)

    def blocks(self) -> List[int]:
        return self.host.blocks(self.strip)

    def depth(self) -> int:
        return self.host.depth()

    def component(self, kind: str, layer: int):
        return self.host.component(kind, layer)

    def direction_texts(self, key: str = "dir") -> Dict[str, List[str]]:
        if self.hostfx()["control"] == "random":
            raise self.error(f"{self.unit.id} is fitted to a direction's texts; a random control has no texts.")
        return self.host.direction_texts(self.params[key], self.lineno)

    def reference_texts(self) -> List[str]:
        return self.host.reference_texts()

    def capture(self, texts, modules):
        return self.host.capture(texts, modules)

    def cache(self, kind: str, key: str):
        return self.host.cache(kind, key)

    def memory(self, layer: int) -> Dict[Any, Any]:
        return self.host.memory(self.strip, layer)

    def hook_stream(self, make: Callable[[int], Callable]) -> None:
        """An edit at each place in the stream the line names, with the host features around it
        (the envelope runs over the places 0 to the depth)."""
        s = self.hostfx()
        if not hostfx.active(s):
            self.host.hook_stream(self.strip, make)
            return
        n = self.host.depth() + 1 if s["env"] != "none" else None
        w = self._window(s)
        self.host.hook_stream(self.strip, lambda layer: hostfx.wrap_edit(make(layer), hostfx.factor(s, layer, n), s["keepnorm"], w))

    def _window(self, s):
        """The window's mask of positions, from the host's positions and prompt length."""
        if not hostfx.windowed(s):
            return None
        return lambda n, device: hostfx.window_mask(s, self.host.positions(n, device) - self.host.prompt_length() + 2)

    def hook_output(self, module, fn: Callable, block: Optional[int] = None) -> None:
        """A forward hook on one module, with the host features around it. Give the block it
        belongs to, and the envelope applies over the blocks."""
        s = self.hostfx()
        if hostfx.active(s):
            n = self.host.depth() if (s["env"] != "none" and block is not None) else None
            fn = hostfx.wrap_output(fn, hostfx.factor(s, block, n), s["keepnorm"], self._window(s))
        self.host.hook_output(self.strip, module, fn)

    def hook_input(self, module, fn: Callable, block: Optional[int] = None) -> None:
        """A forward pre-hook on one module, with the host features around it (the envelope over
        the blocks, if the block is given)."""
        s = self.hostfx()
        if hostfx.active(s):
            n = self.host.depth() if (s["env"] != "none" and block is not None) else None
            fn = hostfx.wrap_input(fn, hostfx.factor(s, block, n), s["keepnorm"], self._window(s))
        self.host.hook_input(self.strip, module, fn)

    def on_restore(self, fn: Callable) -> None:
        self.host.on_restore(fn)


# ---------------------------------------------------------------------------------------------
# What a host calls
# ---------------------------------------------------------------------------------------------

def validate(unit: Unit, strip) -> None:
    """Check a line against its unit before any model is loaded: required parameters present,
    choices among the choices, numbers that are numbers; then the unit's own validate()."""
    u = UnitContext(unit, strip)
    for p in unit.m["params"] + hostfx.HOST_PARAMS:
        v = strip.params.get(p["key"])
        if v is None:
            if p.get("required"):
                raise u.error(f"{unit.id} needs {p['key']}= ({p['label']}).")
            continue
        if p["kind"] == "choice" and v not in [str(c) for c in p["choices"]]:
            raise u.error(f"{unit.id} {p['key']} is " + " or ".join(str(c) for c in p["choices"]) + ".")
        if p["kind"] in ("knob", "fader"):
            u.num(p["key"])
        if p["kind"] in ("int", "toggle"):
            u.int(p["key"])
    t, _ = strip.target()
    if unit.m["targets"] and t not in unit.m["targets"]:
        raise u.error(f"{unit.id} needs one of " + ", ".join(f"{x}=" for x in unit.m["targets"]) + ".")
    f = unit.fn("validate")
    if f:
        f(u)


def prepare(unit: Unit, strip, host: Host) -> None:
    f = unit.fn("prepare")
    if f:
        f(UnitContext(unit, strip, host))


def attach(unit: Unit, strip, host: Host) -> None:
    """Put a strip into the model for one run. The host has checked the unit's needs."""
    u = UnitContext(unit, strip, host)
    for k in unit.direction_keys():
        if k in strip.params:
            u.direction(k)
    if unit.fn("attach"):
        unit.fn("attach")(u)
    else:
        u.hook_stream(lambda layer: unit.fn("edit")(u, layer))


def read(unit: Unit, strip, host: Optional[Host], data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """A meter's readings for one text, one per step. `data` holds what the host read in its
    meters' pass, one row per step (step j is the pass that wrote token j): "stream" (steps, d) at
    the meter's place, for a stream meter; "logprobs" (steps, vocab), the model's next-token log
    probabilities as the chain leaves it, for a logits meter; "tokens", the ids written; and
    "decode", which turns a list of ids into text. Each reading is {"value": number} for a series
    display, or {"top": [[text, number], ...]} for a words display."""
    u = UnitContext(unit, strip, host)
    out = unit.fn("read")(u, data)
    n = len(data.get("tokens", []))
    if len(out) != n:
        raise u.error(f"{unit.id} gave {len(out)} readings for {n} steps.")
    key = "value" if unit.m["display"]["kind"] == "series" else "top"
    for r in out:
        if key not in r:
            raise u.error(f"{unit.id}'s readings need '{key}' for a {unit.m['display']['kind']} display.")
    return out


def code(unit: Unit, strip, host: Host) -> Dict[str, Any]:
    """{"lines": [...], "uses": [functions whose source to show]} for a Code view."""
    u = UnitContext(unit, strip, host)
    c = unit.fn("code")(u) if unit.fn("code") else {}
    lines = [f"# unit {unit.id}: {unit.m['title']} ({unit.path.name}, VAU {unit.m['vau']}, {unit.source})"]
    s = hostfx.settings(u)
    if hostfx.active(s):
        lines.append(f"# host features: {hostfx.describe(s)}")
    if c.get("note"):
        lines.append(f"# {c['note']}")
    lines.extend(c.get("lines", []))
    if c.get("expr"):
        lines.extend(host.stream_code(strip, c["expr"]))
    return {"lines": lines, "uses": list(c.get("uses", []))}
