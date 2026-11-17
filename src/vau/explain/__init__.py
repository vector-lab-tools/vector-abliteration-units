# Vector Abliteration Units: explainers
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
The files a host serves to show a unit's explainer: an animated figure of what the unit's code
computes, with a caption and, where examples.json has them, GPT-2 small's texts at a few of
the unit's settings. See SPEC.md, section 5c.

    explain.js       the runtime: VAUExplain.register(...) and VAUExplain.mount(element, id, ...)
    explain.css      its styles; a host sets the --vx-* colours to its own
    examples.json    the example texts, with how they were made
    <id>.explain.js  one unit's explainer, kept beside the unit's file

files() maps each of these names to its path, so that a host can serve exactly these and no
other file.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

HERE = Path(__file__).resolve().parent
RUNTIME = ("explain.js", "explain.css", "examples.json")
SUFFIX = ".explain.js"


def explainer(unit) -> Optional[Path]:
    """The unit's explainer: the file beside its own, named like it with .explain.js in place
    of .py (compressor.py, compressor.explain.js), or None if it has none."""
    p = unit.path.with_name(unit.path.stem + SUFFIX)
    return p if p.is_file() else None


def files(registry=None) -> Dict[str, Path]:
    """Name -> path for the runtime, its styles, the examples and every explainer: the built-in
    units' and, given a Registry, those of the units it has loaded from a host's folders. An
    explainer is named by its unit's id: <id>.explain.js."""
    out = {name: HERE / name for name in RUNTIME}
    if registry is None:
        from ..registry import Registry
        registry = Registry().load()
    for u in registry:
        p = explainer(u)
        if p is not None:
            out[u.id + SUFFIX] = p
    return out
