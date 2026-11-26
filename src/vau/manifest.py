# Vector Abliteration Units
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""The manifest: what a unit says about itself, and the checks a host makes before using it."""
from __future__ import annotations

import re
from typing import Any, Dict, List

VAU_VERSION = 1
CATEGORIES = ("intervention", "effect", "fitted", "meter", "sampler")
LEVELS = ("model", "weights", "order", "sampler", "probe")
SITES = ("stream", "output", "weights", "logits")
HOST_FLAGS = ("sink",)               # what a host says of its model, which a control may depend on (when: {"host": [...]})
SHORT_MAX = 14                       # a unit's short name, for a host's tight spaces (a strip's top bar)
SPACES = ("stream", "hidden", "component", "weights", "logits", "conditioning")   # what a unit transforms (SPEC 2); site is where its hook goes
SPACE_OF_SITE = {"stream": "stream", "output": "component", "weights": "weights", "logits": "logits"}
AXES = ("any", "ordered")
KINDS = ("knob", "fader", "int", "choice", "toggle", "direction", "text")
SUMMARIES = ("change", "gain", "turn", "touched")   # what a unit suggests a host's summary of its strip reads (SPEC 5e)
DISPLAYS = ("series", "words")     # how a meter's readings are drawn: a number per step, or ranked words per step
TARGETS = ("head", "attn", "mlp", "block", "layer")   # a line names its target with one of these, so no parameter may

# What a host can offer. A unit lists what it needs in `requires`; its `site` and an
# `ordered` axis are needed too. A host says what it has in Host.capabilities().
CAPABILITIES = {
    "stream": "a sequence of vectors through the stack, one per position (an LLM's residual stream)",
    "output": "what one component (attention, MLP) writes",
    "weights": "a component's parameters, changed for the run and restored after",
    "logits": "the output distribution at each step",
    "ordered": "positions in order, so that a position can draw on earlier ones",
    "stats": "each layer's mean, per-dimension spread and mean size over a reference set",
    "pca": "each layer's principal directions over a reference set",
    "directions": "named directions, one vector per layer",
    "texts": "the model run on given texts, unchanged, to measure or fit before a run",
    "contrasts": "the two sets of texts a direction was made from",
}


def requirements(m: Dict[str, Any]) -> List[str]:
    """Everything a unit needs from a host: its site, an ordered axis if it says so, and its
    `requires` list."""
    need = [m["site"]] + (["ordered"] if m.get("axis") == "ordered" else []) + list(m.get("requires", []))
    if any(p.get("kind") == "direction" for p in m.get("params", [])) and "directions" not in need:
        need.append("directions")
    return list(dict.fromkeys(need))


def check(m: Any, module=None) -> List[str]:
    """What is wrong with a manifest, as plain sentences; an empty list if nothing."""
    if not isinstance(m, dict):
        return ["it has no UNIT dict"]
    bad = []
    if m.get("vau") != VAU_VERSION:
        bad.append(f"it is written for VAU {m.get('vau')!r}; this host runs VAU {VAU_VERSION}")
    if not re.fullmatch(r"[a-z][a-z0-9_-]*", str(m.get("id", ""))):
        bad.append("its id must be a lower-case word")
    for k in ("title", "what"):
        if not str(m.get(k, "")).strip():
            bad.append(f"it has no {k}")
    for k, allowed in (("category", CATEGORIES), ("level", LEVELS), ("site", SITES)):
        if m.get(k) not in allowed:
            bad.append(f"its {k} must be one of {', '.join(allowed)}")
    if m.get("axis", "any") not in AXES:
        bad.append("its axis must be any or ordered")
    if not isinstance(m.get("targets"), list):
        bad.append("its targets must be a list")
    for r in m.get("requires", []) or []:
        if r not in CAPABILITIES:
            bad.append(f"it requires {r!r}, which VAU {VAU_VERSION} does not define")
    if not isinstance(m.get("params"), list):
        bad.append("its params must be a list")
    keys = set()
    for p in m.get("params", []) or []:
        k = p.get("key", "")
        if not re.fullmatch(r"[a-z][a-z0-9_]*", str(k)) or k in keys:
            bad.append(f"parameter {k!r} needs a unique lower-case key")
        from .hostfx import RESERVED
        if k in RESERVED:
            bad.append(f"parameter {k!r} is a host feature's name ({', '.join(RESERVED)}), which the host reserves")
        if k in TARGETS:
            bad.append(f"parameter {k!r} has the name of a target ({', '.join(TARGETS)}), which a line would read as its target")
        keys.add(k)
        if not str(p.get("label", "")).strip():
            bad.append(f"parameter {k!r} needs a label")
        tip = str(p.get("tip", "")).strip()
        if not tip:
            bad.append(f"parameter {k!r} needs a tip: a short line, a formula where the transformation is one")
        elif len(tip) > 100:
            bad.append(f"parameter {k!r} has a tip of {len(tip)} characters; keep it to 100")
        kind = p.get("kind")
        if kind not in KINDS:
            bad.append(f"parameter {k!r} needs a kind ({', '.join(KINDS)})")
        if kind in ("knob", "fader", "int"):
            if not all(isinstance(p.get(x), (int, float)) for x in ("min", "max", "default")):
                bad.append(f"parameter {k!r} needs a number for min, max and default")
            elif not p["min"] <= p["max"]:
                bad.append(f"parameter {k!r} has min above max")
        if kind == "choice" and not p.get("choices"):
            bad.append(f"parameter {k!r} needs its choices")
    if sum(1 for p in m.get("params", []) or [] if p.get("kind") == "fader") > 1:
        bad.append("a unit has at most one fader")
    if m.get("level") == "probe":
        if m.get("site") not in ("stream", "logits"):
            bad.append("a meter reads the stream or the logits (site stream or logits)")
        disp = m.get("display")
        if not isinstance(disp, dict) or disp.get("kind") not in DISPLAYS:
            bad.append(f"a meter needs a display: {{'kind': one of {', '.join(DISPLAYS)}, 'label': ...}}")
    pkeys = {q.get("key") for q in m.get("params", []) or []}
    for q in m.get("params", []) or []:
        w = q.get("when")
        if w is None:
            continue
        if not isinstance(w, dict) or not w:
            bad.append(f"parameter {q.get('key')!r}: when is a dict, {{key: [values]}} or {{'host': [flags]}}")
            continue
        for k, v in w.items():
            if not isinstance(v, list) or not v:
                bad.append(f"parameter {q.get('key')!r}: when[{k!r}] is a list of values")
            elif k == "host":
                if any(f not in HOST_FLAGS for f in v):
                    bad.append(f"parameter {q.get('key')!r}: when['host'] names one of {', '.join(HOST_FLAGS)}")
            elif k not in pkeys or k == q.get("key"):
                bad.append(f"parameter {q.get('key')!r}: when names {k!r}, which is not another of its unit's parameters")
    if "short" in m and not (isinstance(m["short"], str) and 0 < len(m["short"]) <= SHORT_MAX):
        bad.append(f"short is a title of at most {SHORT_MAX} characters, for a host's tight spaces")
    elif "short" not in m and isinstance(m.get("title"), str) and len(m["title"]) > SHORT_MAX:
        bad.append(f"a title longer than {SHORT_MAX} characters needs a short one (short) for a host's tight spaces")
    if "space" in m and m["space"] not in SPACES:
        bad.append(f"space is one of {', '.join(SPACES)}")
    if "summary" in m:
        s = m["summary"]
        if not isinstance(s, dict) or s.get("reads") not in SUMMARIES or not isinstance(s.get("label"), str) or not s.get("label"):
            bad.append(f"summary needs {{'reads': one of {', '.join(SUMMARIES)}, 'label': ...}}")
    hd = m.get("host_defaults")
    if hd is not None:
        from .hostfx import RESERVED
        if not isinstance(hd, dict) or any(k not in RESERVED for k in hd):
            bad.append(f"host_defaults is a dict of host features ({', '.join(RESERVED)}) and their defaults")
    if "places" in m and not (isinstance(m["places"], list) and m["places"]):
        bad.append("places is a list of the layers or blocks the unit is measured to work at")
    if "note" in m and not isinstance(m["note"], str):
        bad.append("note is a sentence or two on what the unit does differently in its collection")
    if module is not None:
        has = lambda n: callable(getattr(module, n, None))
        if m.get("level") == "probe":
            if not has("read"):
                bad.append("a meter needs read(u, data)")
        elif m.get("site") == "stream":
            if not (has("edit") or has("attach")):
                bad.append("a stream unit needs edit(u, layer) or attach(u)")
        elif not has("attach"):
            bad.append("it needs attach(u)")
    return bad


def space(m: Dict[str, Any]) -> str:
    """The space a unit transforms: its manifest's space, else the one its site implies."""
    return m.get("space") or SPACE_OF_SITE.get(m.get("site"), "stream")
