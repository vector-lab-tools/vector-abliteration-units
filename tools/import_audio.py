#!/usr/bin/env python3
# Vector Abliteration Units: bring in the Audio Collection's tuning, and the Audio page's sounds
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Writes, from an audio host's checkout (the instrument the units were tuned and heard on):

    src/vau/collections/audio.json   the Audio Collection: for each Core unit it keeps, what differs
                                     on an audio model (name, defaults, ranges, measured safe ranges,
                                     host-feature defaults, placements, a note); SPEC 5h
    docs/audio/*.mp3, docs/vau-audio.js   with --media: the units' sweeps on the model, for the Audio page

    python tools/import_audio.py path/to/audio-host [--media]

It imports the host's `units` module with this checkout's vau first on the path, so the tuning is
read against the units as they are here, and keeps only what differs from the Core manifests.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

import vau  # noqa: E402

OUT = ROOT / "src" / "vau" / "collections" / "audio.json"
MODEL = {"name": "Magenta RT 2 small", "ids": ["magenta-rt-2-small", "mrt2_small", "mrt2-small"], "kind": "music",
         "positions": "a 40 ms frame, counted from the start of play", "sink": False}
# a host's note, worded for the collection: what it said of itself becomes what the collection offers
REWORD = [("VAU stops at 1.5", "the Core Collection stops at 1.5"),
          ("It runs in MLX, on the GPU, so all twelve blocks cost no more than none.",
           "Its MLX version (vau.mlx) keeps it on the GPU, so on a host that runs in MLX all twelve blocks cost no more than none.")]
KEEP = ("default", "min", "max", "taper", "safe", "fragile", "measured", "hidden", "tip", "label")


def tuning(host: Path) -> dict:
    sys.path.insert(1, str(host / "backend"))
    from abliterator import units as H          # the host's own module; the collection names no host
    core = {u.id: u for u in vau.Registry().load()}
    out = {}
    for e in H.catalogue():
        if not e["available"]:
            continue
        u = core[e["id"]]
        mine = {p["key"]: p for p in u.m["params"]}
        d: dict = {}
        if e["title"] != u.m["title"]:
            d["title"] = e["title"]
        if e["short"] != (u.m.get("short") or u.m["title"]) and e["short"] != e["title"]:
            d["short"] = e["short"]
        params, host_defaults = {}, {}
        for q in e["params"]:
            if q.get("host"):                                   # a host feature the card shows among the unit's own
                host_defaults[q["key"]] = q.get("default", 0)
                continue
            p = mine.get(q["key"], {})
            diff = {k: q[k] for k in KEEP if k in q and q[k] != p.get(k) and not (k == "fragile" and q[k] is False)}
            if "host" in (p.get("when") or {}):
                diff.pop("hidden", None)                         # its `when` already hides it on a model without the flag
            if "tip" in diff:
                diff["tip"] = diff["tip"].replace("(in tokens)", "(in frames)")
                if diff["tip"] == p.get("tip"):
                    del diff["tip"]
            if isinstance(p.get("tip"), str) and "(in tokens)" in p["tip"] and "tip" not in diff:
                diff["tip"] = p["tip"].replace("(in tokens)", "(in frames)")
            if diff:
                params[q["key"]] = diff
        if params:
            d["params"] = params
        if host_defaults:
            d["host_defaults"] = host_defaults
        if e.get("places"):
            d["places"] = [int(x) if float(x).is_integer() and x >= 0 else ("all" if x < 0 else x) for x in e["places"]]
            pd = e.get("place_default")
            d["place_default"] = "all" if isinstance(pd, (int, float)) and pd < 0 else int(pd) if isinstance(pd, (int, float)) else pd
        if e.get("host_note"):
            d["note"] = e["host_note"]
            for a, b in REWORD:
                d["note"] = d["note"].replace(a, b)
        if e.get("note"):
            d["note"] = (d.get("note", "") + " " + e["note"]).strip()
        out[e["id"]] = d
    return out


def media(host: Path) -> int:
    src = host / "docs"
    t = (src / "units-media.js").read_text()
    data = json.loads(t[t.index("{"):t.rindex("}") + 1])
    keep = {"preset": data.get("preset"), "seed": data.get("seed"), "none": data.get("none"), "units": []}
    files = set()
    for u in data["units"]:
        ctl = {}
        for k, c in (u.get("controls") or {}).items():
            steps = [{x: s[x] for x in ("v", "src", "rms_db", "centroid_hz", "silence", "line", "broken") if x in s} for s in c.get("steps", [])]
            files.update(s["src"] for s in steps if s.get("src"))
            ctl[k] = {**{x: c[x] for x in c if x != "steps"}, "steps": steps}
        keep["units"].append({"id": u["id"], "example": u.get("example"), "places": u.get("places"), "controls": ctl})
    n = keep.get("none")
    if isinstance(n, dict) and n.get("src"):
        files.add(n["src"])
    (ROOT / "docs" / "audio").mkdir(exist_ok=True)
    for f in sorted(files):
        shutil.copy2(src / f, ROOT / "docs" / f)
    (ROOT / "docs" / "vau-audio.js").write_text(
        "// The Audio Collection's units swept on Magenta RT 2 small: one clip per setting. Written by tools/import_audio.py.\n"
        "window.VAU_AUDIO = " + json.dumps(keep, ensure_ascii=False, separators=(",", ":")) + ";\n")
    return len(files)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if not args:
        raise SystemExit("usage: python tools/import_audio.py path/to/audio-host [--media]")
    host = Path(args[0]).expanduser()
    units = tuning(host)
    OUT.parent.mkdir(exist_ok=True)
    doc = {"_": "The Audio Collection (SPEC 5h): the Core Collection's units as tuned for an audio model. Each entry says what differs "
                "from the Core manifest; a unit not listed is not in the collection. Written by tools/import_audio.py.",
           "id": "audio", "title": "Audio Collection", "model": MODEL, "units": units}
    OUT.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(units)} units")
    if "--media" in sys.argv:
        print(f"copied {media(host)} clips to docs/audio/ and wrote docs/vau-audio.js")


if __name__ == "__main__":
    main()
