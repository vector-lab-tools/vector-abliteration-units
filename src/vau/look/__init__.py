# Vector Abliteration Units: the looks of the collections' strips
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
What a host loads to draw a unit's card: the card runtime, and each collection's interface.
See SPEC.md, sections 5d and 5f.

    card.js     the runtime: VAUCard.mount(element, options) draws a unit's card from the components
    card.css    the components' layout and parts, every colour a --vu-* property
    core.css    the Core Collection's look: the --vu-* properties on .vau-core, and the mark (.vau-mark)
    core.json   the rest of its interface: which component draws each control, and the collection's tint

files() maps each of these names to its path, so that a host can serve exactly these and no
other file.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict

from ..collection import COLLECTIONS

HERE = Path(__file__).resolve().parent
RUNTIME = ("card.js", "card.css")


def files() -> Dict[str, Path]:
    """Name -> path for the card runtime and each collection's interface (its .css and .json)."""
    out = {name: HERE / name for name in RUNTIME}
    for c in COLLECTIONS.values():
        if c.get("look"):
            for name in (c["look"], c["look"].replace(".css", ".json")):
                if (HERE / name).is_file():
                    out[name] = HERE / name
    return out


def interface(collection) -> Dict:
    """A collection's interface (look/<collection>.json), or {}."""
    from ..collection import interface as _i
    return _i(collection)
