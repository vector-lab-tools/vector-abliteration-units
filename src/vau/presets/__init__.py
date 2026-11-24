# Vector Abliteration Units: presets, by model
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Presets for the Core Collection's units, one file per model they were measured on (a preset that
suits one model can silence another). Each file gives the model's name and the ids a host may
know it by, how the presets were measured, and per unit its presets (a name, a chain line, a tip,
the figures on held-out seeds) and the one a host should start at on that model. See SPEC.md,
section 5g.

    magenta-rt-2-small.json   Magenta RT 2 small, a music model: 75 presets for 12 units,
                              measured by Abliterator
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Optional

HERE = Path(__file__).resolve().parent


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(s).lower())


def files() -> Dict[str, Path]:
    """Name -> path for each model's presets."""
    return {p.name: p for p in sorted(HERE.glob("*.json"))}


def for_model(model: Optional[str]) -> Optional[Dict[str, Any]]:
    """The presets measured on a model, by any of its ids or its name (case and punctuation
    ignored), or None where VAU has none for it."""
    if not model:
        return None
    want = _norm(model)
    for p in files().values():
        d = json.loads(p.read_text(encoding="utf-8"))
        names = [d["model"]["name"], *d["model"].get("ids", [])]
        if any(_norm(n) == want or (len(_norm(n)) >= 6 and _norm(n) in want) for n in names):
            return d
    return None
