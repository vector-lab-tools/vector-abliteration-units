# Vector Abliteration Units: collections
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
A collection is a set of units published together, with a name and, if it has one, a look: the
stylesheet a host draws its units' strips with (see SPEC.md, section 5d). The units the vau
package ships are the Core Collection. A unit outside any collection, such as one in a user's
folder, has none and is drawn in the host's own look.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional

CORE = "core"
COLLECTIONS: Dict[str, Dict[str, str]] = {
    # prefix: shown before each unit's name wherever a host names it (vNorm Shrink), so that the
    # names read as vector effects; the manifest's title and the unit's id do not change
    CORE: {"title": "Core Collection", "what": "The units the vau package ships", "look": "core.css", "prefix": "v"},
}


def of(unit) -> Optional[str]:
    """The id of the collection a unit belongs to, or None."""
    return CORE if unit.source == "builtin" else None


def prefix(unit) -> str:
    """What a host shows before the unit's name: its collection's prefix ("v"), or nothing."""
    c = of(unit)
    return COLLECTIONS[c].get("prefix", "") if c else ""


def interface(collection: Optional[str]) -> Dict:
    """A collection's interface beyond its stylesheet (look/<collection>.json): its units' tints
    and the like. The units themselves carry none of it."""
    look = COLLECTIONS.get(collection or "", {}).get("look")
    f = Path(__file__).resolve().parent / "look" / (look or "").replace(".css", ".json")
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
