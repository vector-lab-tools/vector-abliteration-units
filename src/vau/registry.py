# Vector Abliteration Units
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""Finding units, checking them and keeping the catalogue."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from .manifest import VAU_VERSION, check, requirements

BUILTIN = Path(__file__).resolve().parent / "units"


class Unit:
    """One loaded unit: its module, where it came from, and its manifest."""

    def __init__(self, module, path: Path, source: str):
        self.module = module
        self.path = path
        self.source = source                 # "builtin", or the name the host gave the folder
        self.m: Dict[str, Any] = module.UNIT
        self.id: str = self.m["id"]

    def fn(self, name: str) -> Optional[Callable]:
        f = getattr(self.module, name, None)
        return f if callable(f) else None

    def param(self, key: str) -> Optional[Dict[str, Any]]:
        return next((p for p in self.m["params"] if p["key"] == key), None)

    def direction_keys(self) -> List[str]:
        return [p["key"] for p in self.m["params"] if p["kind"] == "direction"]

    def needs(self) -> List[str]:
        return requirements(self.m)

    def missing(self, capabilities: Iterable[str]) -> List[str]:
        have = set(capabilities)
        return [c for c in self.needs() if c not in have]

    def public(self, capabilities: Optional[Iterable[str]] = None) -> Dict[str, Any]:
        """The manifest as a host's user interface gets it, with where the unit came from and,
        given a host's capabilities, what it lacks there."""
        out = dict(self.m)
        out["source"] = self.source
        from .manifest import space
        out["space"] = space(self.m)                         # what it transforms: stream, hidden, component, weights, logits, conditioning
        out["file"] = self.path.name
        out["needs"] = self.needs()
        from .explain import explainer
        out["explain"] = explainer(self) is not None      # an animated figure of it, <file>.explain.js
        from .collection import of, prefix, tint
        out["collection"] = of(self)                       # "core" for the units the package ships, else None
        out["prefix"] = prefix(self)                       # shown before the title wherever a host names the unit: "v"
        out["short"] = self.m.get("short") or self.m["title"]   # every unit has a full name (title) and a short one; a host chooses
        out["tint"] = tint(self)                           # its colour in its collection's interface, #rrggbb, or None
        if capabilities is not None:
            out["missing"] = self.missing(capabilities)
        return out

    def neutral_params(self) -> Dict[str, Any]:
        return {p["key"]: p["neutral"] for p in self.m["params"] if "neutral" in p}


class Registry:
    """The units in a list of folders: the built-in set first, then any the host adds. A unit
    that does not load or does not pass the checks is left out and listed with its reason;
    the rest are unaffected. `taken` names ids the host already uses for strips of its own."""

    def __init__(self, folders: Iterable[Tuple[Path, str]] = (), builtin: bool = True, taken: Iterable[str] = ()):
        self.folders: List[Tuple[Path, str]] = ([(BUILTIN, "builtin")] if builtin else []) + [(Path(f), s) for f, s in folders]
        self.taken = set(taken)
        self.units: Dict[str, Unit] = {}
        self.errors: List[Dict[str, str]] = []
        self.loaded = False

    def load(self) -> "Registry":
        self.units, self.errors = {}, []
        for folder, source in self.folders:
            if not folder.is_dir():
                continue
            for path in sorted(folder.glob("*.py")):
                if path.name.startswith("_"):
                    continue
                self._load_one(path, source)
        self.loaded = True
        return self

    def _load_one(self, path: Path, source: str):
        name = f"vau_units_{source}_{path.stem}".replace("-", "_")
        try:
            spec = importlib.util.spec_from_file_location(name, path)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[name] = mod
            spec.loader.exec_module(mod)
        except Exception as e:
            self.errors.append({"file": path.name, "source": source, "error": f"it did not load: {type(e).__name__}: {e}"})
            return
        m = getattr(mod, "UNIT", None)
        bad = check(m, mod)
        if not bad and (m["id"] in self.units or m["id"] in self.taken):
            bad = [f"the id {m['id']!r} is already taken"]
        if bad:
            self.errors.append({"file": path.name, "source": source, "error": "; ".join(bad)})
            return
        u = Unit(mod, path, source)
        self.units[u.id] = u

    def get(self, kind: str) -> Optional[Unit]:
        if not self.loaded:
            self.load()
        return self.units.get(kind)

    def __contains__(self, kind: str) -> bool:
        return self.get(kind) is not None

    def __iter__(self):
        if not self.loaded:
            self.load()
        return iter(self.units.values())

    def catalogue(self, capabilities: Optional[Iterable[str]] = None) -> Dict[str, Any]:
        if not self.loaded:
            self.load()
        caps = list(capabilities) if capabilities is not None else None
        from .hostfx import HOST_PARAMS
        from .collection import COLLECTIONS, interface
        collections = {cid: {"title": c["title"], "prefix": c.get("prefix", ""), "interface": interface(cid)} for cid, c in COLLECTIONS.items()}
        return {"vau": VAU_VERSION, "units": [u.public(caps) for u in self.units.values()],
                "host_params": HOST_PARAMS, "collections": collections, "errors": list(self.errors)}
