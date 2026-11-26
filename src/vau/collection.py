# Vector Abliteration Units: collections
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
A collection is a set of units published together, with a name and, if it has one, a look: the
stylesheet a host draws its units' strips with (see SPEC.md, section 5d). The units the vau
package ships are the Core Collection. A unit outside any collection, such as one in a user's
folder, has none and is drawn in the host's own look.

A collection may be made from another: the Audio Collection is the Core Collection's units as
tuned for an audio model, with the same edits and a tuning file (collections/audio.json) that says
what differs for each unit it keeps: its name, defaults, ranges, measured safe ranges, host-feature
defaults, placements and a note (SPEC 5h). A host chooses it with Registry(collection="audio").
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Dict, Optional

HERE = Path(__file__).resolve().parent
CORE = "core"
AUDIO = "audio"
COLLECTIONS: Dict[str, Dict[str, str]] = {
    # prefix: shown before each unit's name wherever a host names it (vNorm Shrink), so that the
    # names read as vector effects; the manifest's title and the unit's id do not change
    CORE: {"title": "Core Collection", "what": "The units the vau package ships", "look": "core.css", "prefix": "v"},
    # from: the collection whose units it tunes; tuning: what differs, unit by unit
    AUDIO: {"title": "Audio Collection", "what": "The Core Collection's units as tuned for an audio model: names, defaults, "
            "ranges and notes, measured on Magenta RT 2 small", "look": "core.css", "interface": "audio.json", "prefix": "",
            "from": CORE, "tuning": "collections/audio.json"},
}


def of(unit) -> Optional[str]:
    """The id of the collection a unit belongs to, or None."""
    c = getattr(unit, "collection", None)
    return c if c else (CORE if unit.source == "builtin" else None)


def tuning(collection: Optional[str]) -> Dict[str, Any]:
    """A derived collection's tuning file ({"model": ..., "units": {id: what differs}}), or {}."""
    f = COLLECTIONS.get(collection or "", {}).get("tuning")
    return json.loads((HERE / f).read_text(encoding="utf-8")) if f and (HERE / f).is_file() else {}


def derive(m: Dict[str, Any], t: Dict[str, Any]) -> Dict[str, Any]:
    """A Core manifest with a tuning entry applied: a new manifest; the Core one is not changed."""
    from .manifest import SHORT_MAX
    out = copy.deepcopy(m)
    if "title" in t:
        out["title"] = t["title"]
        out["short"] = t.get("short") or (t["title"] if len(t["title"]) <= SHORT_MAX else m.get("short", t["title"][:SHORT_MAX]))
    elif "short" in t:
        out["short"] = t["short"]
    for k in ("host_defaults", "places", "place_default", "note"):
        if k in t:
            out[k] = copy.deepcopy(t[k])
    over = t.get("params", {})
    for p in out["params"]:
        p.update(copy.deepcopy(over.get(p["key"], {})))
    return out


def prefix(unit) -> str:
    """What a host shows before the unit's name: its collection's prefix ("v"), or nothing."""
    c = of(unit)
    return COLLECTIONS[c].get("prefix", "") if c else ""


def interface(collection: Optional[str]) -> Dict:
    """A collection's interface beyond its stylesheet (look/<collection>.json): its units' tints
    and the like. The units themselves carry none of it."""
    c = COLLECTIONS.get(collection or "", {})
    look = c.get("look")
    f = HERE / "look" / (c.get("interface") or (look or "").replace(".css", ".json"))
    return json.loads(f.read_text(encoding="utf-8")) if look and f.is_file() else {}


def tint(unit) -> Optional[str]:
    """The unit's colour in its collection's interface (#rrggbb): its own, if the interface gives
    units their own (tints, by id), else the collection's (tint); None outside a collection."""
    i = interface(of(unit))
    return i.get("tints", {}).get(unit.id) or i.get("tint")


def name(unit, short: bool = False) -> str:
    """The unit's name as a host shows it, with its collection's prefix: the full name (vNorm Shrink,
    vComponent Clamp), or the short one for tight spaces (vClamp), which is the title where the
    unit gives no short."""
    return prefix(unit) + ((unit.m.get("short") or unit.m["title"]) if short else unit.m["title"])
