# Vector Abliteration Units tests: the manifest checks, the loader, and every built-in unit's
# conformance on a stand-in host (no model needed).
# Run: python -m pytest -q
# SPDX-License-Identifier: GPL-3.0-or-later
import json
import re

import torch
import pytest

import vau
from vau.testing import StandInHost, conformance, line, run_edit

REG = vau.Registry().load()
BUILTIN = sorted(REG.units)


def test_the_builtin_units_all_load():
    assert REG.errors == []
    assert {"compressor", "saturator", "delay", "reverb", "erosion", "shifter", "eq"} <= set(BUILTIN)


@pytest.mark.parametrize("uid", BUILTIN)
def test_builtin_unit_conforms(uid):
    assert conformance(REG.get(uid)) == []


def test_a_broken_unit_is_left_out_and_the_rest_load(tmp_path):
    (tmp_path / "broken.py").write_text("raise RuntimeError('no')\n")
    (tmp_path / "nameless.py").write_text("UNIT = {'vau': 1}\n")
    (tmp_path / "clash.py").write_text(
        "UNIT = dict(vau=1, id='delay', title='x', what='x', category='effect', level='model', site='stream',"
        " targets=['layer'], params=[])\ndef edit(u, layer):\n    return lambda h, pos: h\n")
    (tmp_path / "gain.py").write_text(
        "UNIT = dict(vau=1, id='gain', title='Gain', what='Multiplies the stream', category='effect', level='model',"
        " site='stream', targets=['layer'], example='gain layer=2 k=2',"
        " params=[dict(key='k', label='k', tip='h = k h', kind='fader', min=0, max=4, default=1, neutral=1)])\n"
        "def edit(u, layer):\n    k = u.num('k')\n    return lambda h, pos: h * k\n")
    reg = vau.Registry([(tmp_path, "user")]).load()
    errs = {e["file"]: e["error"] for e in reg.errors}
    assert set(errs) == {"broken.py", "nameless.py", "clash.py"}
    assert "already taken" in errs["clash.py"]
    assert "gain" in reg and reg.get("gain").source == "user"
    assert conformance(reg.get("gain")) == []
    assert set(BUILTIN) <= set(reg.units)


def test_a_host_id_cannot_be_taken():
    reg = vau.Registry(taken=["delay"]).load()
    assert "delay" not in reg
    assert any("already taken" in e["error"] for e in reg.errors)


def test_manifest_problems_are_named():
    bad = vau.check({"vau": 2, "id": "X", "title": "", "what": "w", "category": "magic", "level": "model",
                     "site": "stream", "targets": [], "requires": ["telepathy"],
                     "params": [{"key": "a", "label": "A", "kind": "fader", "min": 2, "max": 1, "default": 1},
                                {"key": "mlp", "label": "M", "tip": "x", "kind": "knob", "min": 0, "max": 1, "default": 0}]})
    text = " | ".join(bad)
    for word in ("VAU 2", "lower-case", "no title", "category", "telepathy", "min above max", "name of a target", "needs a tip"):
        assert word in text


def test_needs_and_missing():
    sh = REG.get("shifter")
    assert sh.needs() == ["stream", "directions"]
    assert REG.get("delay").needs() == ["stream", "ordered"]
    assert sh.missing({"stream"}) == ["directions"]
    cat = REG.catalogue({"stream", "stats"})
    eq = next(u for u in cat["units"] if u["id"] == "eq")
    assert eq["missing"] == ["pca"] and eq["source"] == "builtin"


def test_validate_names_the_problem():
    with pytest.raises(vau.UnitError, match="shifter needs dir2="):
        vau.validate(REG.get("shifter"), vau.Line("shifter", {"layer": "2", "dir": "a"}))
    with pytest.raises(vau.UnitError, match="should be a number"):
        vau.validate(REG.get("compressor"), vau.Line("compressor", {"layer": "2", "ratio": "lots"}))
    with pytest.raises(vau.UnitError, match="needs one of layer="):
        vau.validate(REG.get("delay"), vau.Line("delay", {"head": "2.1"}))


def test_delay_echoes_from_time_positions_back():
    host = StandInHost()
    h = torch.zeros(1, 8, host.d)
    h[0, 2] = 1.0
    out = run_edit(REG.get("delay"), "delay layer=1 time=3 feedback=0 mix=1", host, h)
    assert torch.allclose(out[0, 5], h[0, 2]) and float(out[0, 4].abs().sum()) == 0


def test_shifter_at_180_degrees_negates_both_components():
    host = StandInHost()
    h = torch.randn(1, 5, host.d)
    out = run_edit(REG.get("shifter"), "shifter layer=1 dir=a dir2=b angle=180", host, h)
    e1 = host.direction("a", 0).unit(1, "cpu")
    assert torch.allclose((out @ e1), -(h @ e1), atol=1e-5)
    assert torch.allclose(out.norm(dim=-1), h.norm(dim=-1), atol=1e-4)


def test_morph_fit_pulls_the_moved_set_and_keeps_the_kept_set():
    morph = REG.get("morph").module
    g = torch.Generator().manual_seed(0)
    W, b = torch.randn(12, 10, generator=g), torch.randn(12, generator=g)
    Xk, Xm = torch.randn(40, 10, generator=g), torch.randn(30, 10, generator=g) + 2
    Yk, Ym = Xk @ W.T + b, Xm @ W.T + b
    toward = Yk[:20]
    p = {"keep": 1.0, "pull": 0.3, "over": 0.5, "k": 3, "rank": 4, "size": False}
    f = morph.fit_morph(W, b, (Xk, Yk), (Xm, Ym), toward, p, seed=1)
    nm = morph.morph_outputs(W, b, Xm, Ym - b, f["A"], f["B"], False)
    nk = morph.morph_outputs(W, b, Xk, Yk - b, f["A"], f["B"], False)
    assert morph.knn_distance(nm, toward, 3).mean() < morph.knn_distance(Ym, toward, 3).mean()
    assert ((nk - Yk) ** 2).mean() < ((nm - Ym) ** 2).mean()
    assert f["A"].shape == (4, 10) and f["B"].shape == (12, 4)


def test_morph_keep_size_keeps_each_rows_length():
    morph = REG.get("morph").module
    g = torch.Generator().manual_seed(2)
    W, A, B = torch.randn(8, 6, generator=g), torch.randn(3, 6, generator=g), torch.randn(8, 3, generator=g)
    X = torch.eye(6)
    y = morph.morph_outputs(W, None, X, X @ W.T, A, B, True)        # rows of the effective weight, rescaled
    assert torch.allclose(y.T.norm(dim=1), W.norm(dim=1), atol=1e-4)


def test_abliterate_removes_the_direction_from_what_a_component_writes():
    ab = REG.get("abliterate").module
    g = torch.Generator().manual_seed(3)
    W, b, x = torch.randn(10, 7, generator=g), torch.randn(10, generator=g), torch.randn(1, 5, 7, generator=g)
    v = ab.unit_direction(torch.randn(10, generator=g), None)
    y = x @ W.T + b
    full = ab.abliterate_hook(v, 1.0, None, b, True)(None, (x,), y)
    assert float((full @ v).abs().max()) < 1e-5
    weights_only = ab.abliterate_hook(v, 1.0, None, b, False)(None, (x,), y)
    assert torch.allclose(weights_only @ v, (b @ v).expand(1, 5), atol=1e-5)
    half = ab.abliterate_hook(v, 0.5, None, b, True)(None, (x,), y)
    assert torch.allclose(half @ v, 0.5 * (y @ v), atol=1e-5)


def test_abliterate_keep_size_keeps_each_rows_length():
    ab = REG.get("abliterate").module
    g = torch.Generator().manual_seed(4)
    W = torch.randn(8, 6, generator=g)
    v = ab.unit_direction(torch.randn(8, generator=g), None)
    Wp = W - torch.outer(v, v @ W)
    scale = W.norm(dim=1) / Wp.norm(dim=1)
    X = torch.eye(6).unsqueeze(0)
    out = ab.abliterate_hook(v, 1.0, scale, None, True)(None, (X,), X @ W.T)
    assert torch.allclose(out[0].T.norm(dim=1), W.norm(dim=1), atol=1e-4)


def test_abliterate_kernel_shapes():
    k = REG.get("abliterate").module.kernel
    lin = k(11, "linear", 0.5, 0.4, 0.25)              # peak at block 5, reaching 4 blocks either side
    assert lin[5] == 1.0 and lin[1] == pytest.approx(0.25) and lin[9] == pytest.approx(0.25) and lin[0] == 0 and lin[10] == 0
    bell = k(11, "bell", 0.5, 0.4, 0.25)
    assert bell[5] == 1.0 and bell[1] == pytest.approx(0.25) and 0.25 < bell[3] < 1
    assert k(5, "flat", 0.1, 0.1, 0) == [1.0] * 5
    projected = REG.get("abliterate").module.unit_direction(torch.tensor([1.0, 1.0]), torch.tensor([1.0, 0.0]))
    assert torch.allclose(projected, torch.tensor([0.0, 1.0]))


# --- the host features --------------------------------------------------------------------

def _through_host(text, h, host=None):
    """Attach a line's unit through vau.attach (so the host features apply) on a stand-in host,
    and run h through every edit it registered."""
    from vau.testing import line
    host = host or StandInHost()
    s = line(text)
    vau.attach(REG.get(s.kind), s, host)
    pos = torch.arange(h.shape[1])
    for e in host.edits:
        h = e(h, pos)
    return h


def test_wet_scales_the_change_and_zero_is_neutral():
    h = torch.randn(1, 6, 32, generator=torch.Generator().manual_seed(5))
    full = _through_host("saturator layer=2 drive=8 mix=1", h)
    half = _through_host("saturator layer=2 drive=8 mix=1 wet=0.5", h)
    assert torch.equal(_through_host("saturator layer=2 drive=8 mix=1 wet=0", h), h)
    assert torch.allclose(half - h, 0.5 * (full - h), atol=1e-5)


def test_keepnorm_keeps_each_positions_size():
    h = torch.randn(1, 6, 32, generator=torch.Generator().manual_seed(6))
    out = _through_host("saturator layer=2 drive=8 mix=1 keepnorm=1", h)
    assert not torch.allclose(out, h) and torch.allclose(out.norm(dim=-1), h.norm(dim=-1), atol=1e-4)
    # the Norm Shrink only changes the size, so keeping the size undoes it
    assert torch.allclose(_through_host("compressor layer=2 thresh=0.3 ratio=10 makeup=3 keepnorm=1", h), h, atol=1e-5)


def test_the_envelope_runs_over_the_depth():
    h = torch.randn(1, 4, 32, generator=torch.Generator().manual_seed(7))
    host = StandInHost(layers=4)                     # stream places 0 to 4
    _through_host("saturator layer=all drive=8 mix=1 env=linear epeak=0 ewidth=0.25 eedge=0", h, host)
    pos = torch.arange(4)
    changed = [not torch.allclose(e(h, pos), h) for e in host.edits]
    assert changed == [True, False, False, False, False]
    assert vau.hostfx.envelope(5, "bell", 0.5, 0.5, 0.25) == pytest.approx([0.25, 0.7071, 1.0, 0.7071, 0.25], abs=1e-3)


def test_a_random_control_replaces_the_direction_with_one_of_the_same_size():
    host = StandInHost()
    u = vau.UnitContext(REG.get("shifter"), vau.Line("shifter", {"layer": "2", "dir": "a", "dir2": "b", "control": "random", "cseed": "3"}), host)
    real, rnd = host.direction("a", 1), u.direction("dir")
    assert float(rnd.vector(2, "cpu").norm()) == pytest.approx(float(real.vector(2, "cpu").norm()), rel=1e-5)
    assert abs(float(rnd.unit(2, "cpu") @ real.unit(2, "cpu"))) < 0.6
    again = vau.UnitContext(REG.get("shifter"), vau.Line("shifter", {"layer": "2", "dir": "a", "dir2": "b", "control": "random", "cseed": "3"}), host)
    assert torch.equal(again.direction("dir").vector(2, "cpu"), rnd.vector(2, "cpu"))
    h = torch.randn(1, 5, 32, generator=torch.Generator().manual_seed(8))
    assert not torch.allclose(_through_host("shifter layer=2 dir=a dir2=b angle=90 control=random", h, host),
                              _through_host("shifter layer=2 dir=a dir2=b angle=90", h, host))


def test_host_feature_names_are_reserved_and_checked():
    bad = vau.check({"vau": 1, "id": "x", "title": "X", "what": "x", "category": "effect", "level": "model", "site": "stream",
                     "targets": [], "params": [{"key": "wet", "label": "W", "tip": "x", "kind": "knob", "min": 0, "max": 1, "default": 1}]})
    assert any("host feature" in b for b in bad)
    with pytest.raises(vau.UnitError, match="env is none or linear or bell or flat"):
        vau.validate(REG.get("delay"), vau.Line("delay", {"layer": "2", "env": "wiggly"}))
    assert REG.catalogue()["host_params"][0]["key"] == "wet"


def test_limiter_clamps_the_largest_components_and_spares_the_sink():
    lim = REG.get("limiter").module.limiter_edit
    h = torch.randn(1, 4, 100, generator=torch.Generator().manual_seed(9))
    h[0, :, 7] = 50.0                                       # a massive activation
    pos = torch.arange(4)
    out = lim(0.99, False)(h, pos)
    assert torch.equal(out[0, 0], h[0, 0])                  # the first position left alone
    assert float(out[0, 1:, 7].max()) < 5 and torch.allclose(out[0, 1:, :7], h[0, 1:, :7])
    assert torch.equal(lim(1.0, False)(h, pos), h)
    assert float(lim(0.99, True)(h, pos)[0, 0, 7]) < 5


def test_neuron_ops():
    hook = REG.get("neuron").module.neuron_hook
    x = torch.arange(12.0).view(1, 2, 6) - 5
    idx = torch.tensor([1, 4])
    run = lambda op, v: hook(idx, op, v)(None, (x,))[0]
    assert torch.equal(run("scale", 1)[..., [0, 2, 3, 5]], x[..., [0, 2, 3, 5]])
    assert torch.equal(run("scale", 2)[..., idx], 2 * x[..., idx])
    assert torch.equal(run("add", 3)[..., idx], x[..., idx] + 3)
    assert torch.equal(run("set", 7)[..., idx], torch.full((1, 2, 2), 7.0))
    assert torch.equal(run("zero", 0)[..., idx], torch.zeros(1, 2, 2))
    assert torch.equal(run("flip", 0)[..., idx], -x[..., idx])
    assert float(run("clamp", 2)[..., idx].abs().max()) == 2
    with pytest.raises(vau.UnitError, match="n names neurons"):
        vau.validate(REG.get("neuron"), vau.Line("neuron", {"block": "5", "n": "lots"}))


def test_meters_read_one_value_per_step():
    import math
    ent = REG.get("entropy")
    lp = torch.log_softmax(torch.zeros(3, 8), -1)                 # uniform over 8: 3 bits
    out = vau.read(ent, vau.Line("entropy", {}), None, {"logprobs": lp, "tokens": [1, 2, 3]})
    assert [round(r["value"], 4) for r in out] == [3.0, 3.0, 3.0]
    ps = REG.get("peakshare")
    x = torch.ones(2, 10); x[0, 0] = 3.0                            # 9 of 18 in the largest component
    out = vau.read(ps, vau.Line("peakshare", {"layer": "2", "k": "1"}), None, {"stream": x, "tokens": [5, 6]})
    assert out[0]["value"] == pytest.approx(50.0) and out[1]["value"] == pytest.approx(10.0)
    with pytest.raises(vau.UnitError, match="2 readings for 3 steps"):
        vau.read(ps, vau.Line("peakshare", {"layer": "2"}), None, {"stream": x, "tokens": [5, 6, 7]})
    bad = vau.check({"vau": 1, "id": "m", "title": "M", "what": "m", "category": "meter", "level": "probe",
                     "site": "output", "targets": [], "params": []})
    assert any("reads the stream or the logits" in b for b in bad) and any("needs a display" in b for b in bad)


def test_gate_keeps_the_largest_components():
    g = REG.get("gate").module.gate_edit
    h = torch.tensor([[[0.1, -5.0, 0.2, 3.0], [1.0, 2.0, -3.0, 4.0]]])
    out = g(0.5, True)(h, torch.arange(2))
    assert out[0, 0].tolist() == [0.0, -5.0, 0.0, 3.0] and out[0, 1].tolist() == [0.0, 0.0, -3.0, 4.0]
    assert torch.equal(g(0.5, False)(h, torch.arange(2))[0, 0], h[0, 0])       # the sink spared
    assert torch.equal(g(1.0, False)(h, torch.arange(2)), h)


def test_beat_repeat_replays_the_positions_before():
    br = REG.get("beatrepeat").module.beatrepeat_edit
    h = torch.arange(10.0).view(1, 10, 1).repeat(1, 1, 3)
    out = br(4, 1, 1.0, {})(h, torch.arange(10))
    # runs of 4 from position 1: 1-4, 5-8; the last of each (4, 8) takes the position before (3, 7)
    assert out[0, :, 0].tolist() == [0, 1, 2, 3, 3, 5, 6, 7, 7, 9]


def test_multiband_compresses_only_above_the_limit():
    mb = REG.get("multiband").module.multiband_edit
    v = torch.eye(4)
    bands, mean = [v[:2], v[2:]], torch.zeros(4)
    h = torch.tensor([[[3.0, 4.0, 0.3, 0.4]]])                  # band 0 size 5, band 1 size 0.5
    out = mb(mean, bands, [1.0, 1.0], 4.0, [0, 1])(h, torch.arange(1))
    assert out[0, 0, :2].norm().item() == pytest.approx(2.0) and torch.allclose(out[0, 0, 2:], h[0, 0, 2:])


def test_a_window_limits_the_strip_to_its_steps():
    h = torch.randn(1, 9, 32, generator=torch.Generator().manual_seed(11))
    host = StandInHost()                                        # prompt of 3: position 2 writes step 1
    out = _through_host("saturator layer=2 drive=8 mix=1 wfrom=2 wto=4", h, host)
    changed = [not torch.allclose(out[0, p], h[0, p]) for p in range(9)]
    assert changed == [False, False, False, True, True, True, False, False, False]   # steps 2-4: positions 3-5
    assert vau.hostfx.describe(vau.hostfx.settings(vau.UnitContext(REG.get("delay"), vau.Line("delay", {"layer": "2", "wfrom": "5"}), host))) == "only from step 5 to the end"



def test_every_parameter_has_a_tip():
    for u in REG:
        for p in u.m["params"]:
            assert 0 < len(p["tip"]) <= 100, (u.id, p["key"])
    assert all(p.get("tip") for p in vau.hostfx.HOST_PARAMS)


def test_every_builtin_unit_has_an_explainer_that_registers_it():
    files = vau.explain_files(REG)
    for name in ("explain.js", "explain.css", "examples.json"):
        assert files[name].is_file()
    for uid in BUILTIN:
        js = files[f"{uid}.explain.js"].read_text()
        assert f'X.register("{uid}", {{' in js
        assert REG.get(uid).public()["explain"] is True


def test_the_explainer_examples_cover_the_units_and_say_how_they_were_made():
    import json
    ex = json.loads(vau.explain_files(REG)["examples.json"].read_text())
    assert {"model", "prompt", "seed", "sampler"} <= set(ex["provenance"])
    assert set(ex["units"]) == set(BUILTIN)
    for uid, rows in ex["units"].items():
        for r in rows:
            assert r["chain"].split()[0] == uid and ("text" in r or len(r["reading"]) == len(ex["original"]["tokens"]))


def test_a_user_unit_without_an_explainer_is_marked_so_and_one_with_it_is_served(tmp_path):
    (tmp_path / "gain.py").write_text('''UNIT = dict(vau=1, id='gain', title='Gain', what='Multiplies the stream by k', category='effect',
            level='model', site='stream', targets=['layer'], example='gain layer=6 k=2',
            params=[dict(key='k', label='k', tip="h' = k h", kind='fader', min=0, max=4, default=1, neutral=1)])
def edit(u, layer):
    return lambda h, pos: h * u.num('k')
''')
    reg = vau.Registry([(tmp_path, "user")]).load()
    assert reg.get("gain").public()["explain"] is False and "gain.explain.js" not in vau.explain_files(reg)
    (tmp_path / "gain.explain.js").write_text('(function (X) { X.register("gain", {}); })(window.VAUExplain);')
    assert vau.explain_files(reg)["gain.explain.js"] == tmp_path / "gain.explain.js"


def test_the_built_in_units_are_the_core_collection_and_its_look_sets_only_vu_properties():
    assert vau.COLLECTIONS["core"]["title"] == "Core Collection"
    assert all(REG.get(u.id).public()["collection"] == "core" for u in REG)
    files = vau.look_files()
    assert set(files) == {"card.js", "card.css", "core.css", "core.json"} and all(f.is_file() for f in files.values())
    css = re.sub(r"/\*.*?\*/", "", files["core.css"].read_text(), flags=re.S)
    rules = dict((sel.strip(), body) for sel, body in re.findall(r"([^{}]+)\{((?:[^{}\"]|\"[^\"]*\")*)\}", css))
    assert set(rules) == {".vau-core", ".vau-core .vau-mark"}
    props = re.findall(r"(?:^|;)\s*(--[\w-]+)\s*:", rules[".vau-core"])
    assert props and all(p.startswith("--vu-") for p in props)
    for p in ("--vu-bg", "--vu-knob-hi", "--vu-fader-cap", "--vu-led-on", "--vu-screen", "--vu-meter-needle", "--vu-mark"):
        assert p in props


def test_a_user_unit_belongs_to_no_collection(tmp_path):
    (tmp_path / "gain.py").write_text('''UNIT = dict(vau=1, id='gain', title='Gain', what='Multiplies the stream by k', category='effect',
            level='model', site='stream', targets=['layer'], example='gain layer=6 k=2',
            params=[dict(key='k', label='k', tip="h' = k h", kind='fader', min=0, max=4, default=1, neutral=1)])
def edit(u, layer):
    return lambda h, pos: h * u.num('k')
''')
    reg = vau.Registry([(tmp_path, "user")]).load()
    assert reg.get("gain").public()["collection"] is None
    assert reg.get("compressor").public()["collection"] == "core"
    assert reg.get("gain").public()["prefix"] == "" and reg.get("compressor").public()["prefix"] == "v"
    assert vau.collection.name(reg.get("compressor")) == "vNorm Shrink" and reg.get("compressor").m["title"] == "Norm Shrink"


def test_every_core_unit_that_changes_the_model_suggests_a_summary_and_a_bad_one_is_refused():
    for u in REG:
        if u.m["category"] == "meter":
            assert "summary" not in u.m
        else:
            assert u.m["summary"]["reads"] in vau.manifest.SUMMARIES and u.m["summary"]["label"]
    m = dict(REG.get("compressor").m, summary={"reads": "loudness", "label": "x"})
    assert any("summary" in e for e in vau.check(m))


def test_the_core_units_share_the_collections_tint_which_is_not_in_their_manifests():
    tints = {u.public()["tint"] for u in REG}
    assert len(tints) == 1 and re.fullmatch(r"#[0-9a-f]{6}", tints.pop())
    assert all("tint" not in u.m for u in REG)


def test_the_core_interface_maps_controls_onto_components_the_card_runtime_knows():
    js = vau.look_files()["card.js"].read_text()
    known = set(re.search(r"var COMPONENTS = \[([^\]]*)\]", js).group(1).replace('"', "").replace(" ", "").replace("\n", "").split(","))
    comp = vau.collection.interface("core")["components"]
    names = set(comp["defaults"].values()) | {c for u in comp["units"].values() for c in u.values()}
    assert names - {"selector"} <= known
    for uid, keys in comp["units"].items():
        assert REG.get(uid) and set(keys) <= {p["key"] for p in REG.get(uid).m["params"]}


def test_the_catalogue_carries_each_collections_interface():
    c = REG.catalogue()["collections"]["core"]
    assert c["title"] == "Core Collection" and c["prefix"] == "v" and c["interface"]["components"]["defaults"]["fader"] == "knob-big-1"


def test_every_unit_has_a_space_from_its_manifest_or_its_site_and_a_bad_one_is_refused():
    sp = {u.id: u.public()["space"] for u in REG}
    assert sp["neuron"] == "hidden" and sp["abliterate"] == sp["morph"] == "component" and sp["entropy"] == "logits"
    assert all(sp[k] == "stream" for k in ("compressor", "gate", "delay", "peakshare"))
    assert any("space" in e for e in vau.check(dict(REG.get("gate").m, space="time")))
    for uid in ("saturator", "erosion", "gate", "limiter"):
        assert "each coordinate of the stream separately" in REG.get(uid).m["help"]


def test_every_unit_has_a_full_and_a_short_name_and_a_long_title_needs_a_short_one():
    for u in REG:
        e = u.public()
        assert e["title"] and e["short"] and len(e["short"]) <= vau.manifest.SHORT_MAX
    assert REG.get("delay").public()["short"] == "Lookback"
    assert vau.collection.name(REG.get("limiter"), short=True) == "vClamp" and vau.collection.name(REG.get("limiter")) == "vComponent Clamp"
    m = dict(REG.get("limiter").m); m.pop("short")
    assert any("short" in e for e in vau.check(m))


def test_a_short_title_is_offered_and_checked():
    assert [REG.get(k).public()["short"] for k in ("compressor", "saturator", "reverb", "eq", "beatrepeat", "multiband", "limiter")] == ["Shrink", "Squash", "Average", "Bands", "Repeat", "Bandshrink", "Clamp"]
    assert any("short" in e for e in vau.check(dict(REG.get("limiter").m, short="A much too long short title")))


def test_the_units_that_keep_earlier_positions_keep_only_the_window_they_read():
    from vau.units.delay import delay_edit
    from vau.units.reverb import reverb_edit
    from vau.units.beatrepeat import beatrepeat_edit
    from vau.units.erosion import erosion_edit
    d = 8
    for make, bound in ((lambda m: delay_edit(4, 0.3, 0.5, m), 4), (lambda m: reverb_edit(0.9, 0.5, m), 1),
                        (lambda m: beatrepeat_edit(8, 2, 1.0, m), 2), (lambda m: erosion_edit(None, 4, m), 1)):
        mem = {}
        fn = make(mem)
        fn(torch.randn(1, 5, d), torch.arange(5))                 # a prompt pass, then one position at a time
        for p in range(5, 2000):
            fn(torch.randn(1, 1, d), torch.tensor([p]))
            assert len(mem) <= bound, (make, len(mem))


def test_position_zero_is_left_alone_only_where_the_model_has_an_attention_sink():
    from vau.units.delay import delay_edit
    from vau.units.gate import gate_edit
    h = torch.randn(1, 6, 8)
    for first in (1, 0):
        out = delay_edit(1, 0.0, 1.0, {}, first)(h, torch.arange(6))
        assert torch.equal(out[0, 1], h[0, 1]) == (first == 1)    # position 1 echoes position 0 only without a sink
    g = h.clone(); g[0, 0, 0] = 100.0
    assert torch.equal(gate_edit(0.25, False, True)(g, torch.arange(6))[0, 0], g[0, 0])
    assert not torch.equal(gate_edit(0.25, False, False)(g, torch.arange(6))[0, 0], g[0, 0])
    assert StandInHost(sink=False).sink() is False and StandInHost().sink() is True


def test_the_core_groups_place_every_unit_once():
    groups = vau.collection.interface("core")["groups"]
    ids = [u for g in groups for u in g["units"]]
    assert sorted(ids) == sorted(u.id for u in REG) and len(ids) == len(set(ids))


def test_a_when_names_another_parameter_or_a_host_flag():
    a = REG.get("abliterate").m
    assert all(p["when"] == {"shape": ["linear", "bell"]} for p in a["params"] if p["key"] in ("peak", "width", "edge"))
    assert [p["when"] for p in REG.get("gate").m["params"] if p["key"] == "sink"] == [{"host": ["sink"]}]
    m = dict(a, params=[dict(p, when={"nothing": ["x"]}) if p["key"] == "peak" else p for p in a["params"]])
    assert any("when" in e for e in vau.check(m))


def test_every_preset_is_a_valid_line_for_its_unit_and_its_start_is_one_of_them():
    from vau.hostfx import HOST_PARAMS
    host_keys = {p["key"] for p in HOST_PARAMS}
    for name, path in vau.presets.files().items():
        d = json.loads(path.read_text())
        assert d["model"]["name"] and d["measured"]["how"]
        for uid, got in d["units"].items():
            u = REG.get(uid)
            assert u is not None, (name, uid)
            keys = {p["key"] for p in u.m["params"]} | host_keys | set(u.m["targets"])
            names = [p["name"] for p in got["presets"]]
            assert len(names) == len(set(names)) and (got.get("start") is None or got["start"] in names)
            for p in got["presets"]:
                words = p["line"].split()
                assert words[0] == uid and all(w.split("=")[0] in keys for w in words[1:]), (uid, p["line"])
                assert p["held_out"]["broken"] == 0


def test_the_catalogue_carries_a_models_presets_only_when_the_host_names_that_model():
    plain = REG.catalogue()
    assert "presets" not in plain and all("presets" not in e for e in plain["units"])
    c = REG.catalogue(model="google/magenta-rt-2-small")
    assert c["presets"]["model"]["name"] == "Magenta RT 2 small"
    delay = next(e for e in c["units"] if e["id"] == "delay")
    assert delay["start"] == "Feedback Loop" and len(delay["presets"]) == 7
    assert sum(len(e.get("presets", [])) for e in c["units"]) == 75


# ---- the Audio Collection (SPEC 5h) and vau.mlx

AUDIO_CAPS = {"stream", "output", "ordered", "stats", "pca", "directions", "contrasts"}


def test_the_audio_collection_is_the_core_units_tuned_and_leaves_the_core_ones_alone():
    a = vau.Registry(collection="audio").load()
    assert not a.errors and len(list(a)) == 13
    assert {u.collection for u in a} == {"audio"} and a.get("beatrepeat").m["title"] == "Frame Repeat"
    assert vau.collection.name(a.get("delay")) == "Lookback"                  # no prefix: the names as an audio host shows them
    assert a.get("delay").m["params"][0]["default"] == 8 and a.get("morph") is None and a.get("entropy") is None
    c = vau.Registry().load()
    assert c.get("delay").m["params"][0]["default"] == 4 and c.get("beatrepeat").m["title"] == "Position Repeat"
    assert vau.collection.of(c.get("delay")) == "core"
    with pytest.raises(ValueError):
        vau.Registry(collection="nowhere")


def test_every_audio_unit_passes_conformance_and_its_tuning_names_only_its_own_settings():
    a = vau.Registry(collection="audio").load()
    core = vau.Registry().load()
    t = vau.collection.tuning("audio")["units"]
    for u in a:
        assert conformance(u) == [], u.id
        keys = {p["key"] for p in core.get(u.id).m["params"]}
        assert set(t[u.id].get("params", {})) <= keys, u.id
        for p in u.m["params"]:
            if p["kind"] in ("knob", "fader", "int"):
                assert p["min"] <= p["default"] <= p["max"], (u.id, p["key"])
                if "safe" in p:
                    assert p["min"] <= p["safe"][0] <= p["safe"][1] <= p["max"], (u.id, p["key"])
        if "places" in u.m:                                  # the default may be its start preset's, beyond the measured places
            pd = u.m["place_default"]
            assert pd == "all" or (isinstance(pd, int) and 0 <= pd <= 12), u.id


def test_an_audio_units_host_feature_defaults_apply_unless_the_line_sets_them():
    from vau.context import UnitContext
    a = vau.Registry(collection="audio").load()
    assert vau.hostfx.settings(UnitContext(a.get("delay"), line("delay layer=6")))["keepnorm"] is True
    assert vau.hostfx.settings(UnitContext(a.get("delay"), line("delay layer=6 keepnorm=0")))["keepnorm"] is False
    assert vau.hostfx.settings(UnitContext(vau.Registry().load().get("delay"), line("delay layer=6")))["keepnorm"] is False


def test_the_audio_catalogue_carries_its_model_and_its_presets_and_its_own_look():
    cat = vau.Registry(collection="audio").catalogue(AUDIO_CAPS)
    assert cat["collection"] == "audio" and cat["model"]["sink"] is False
    assert cat["presets"]["model"]["name"] == cat["model"]["name"]
    d = next(e for e in cat["units"] if e["id"] == "delay")
    assert d["prefix"] == "" and d["start"] == "Feedback Loop" and d["host_defaults"] == {"keepnorm": 1}
    i = cat["collections"]["audio"]["interface"]
    placed = [u for g in i["groups"] for u in g["units"]]
    assert sorted(placed) == sorted(e["id"] for e in cat["units"]) and len(placed) == len(set(placed))
    assert d["tint"] == i["tint"] != cat["collections"]["core"]["interface"]["tint"]


def test_vau_mlx_imports_without_mlx_and_names_what_it_ports():
    import vau.mlx
    assert vau.mlx.PORTED == {"neuron", "erosion", "abliterate"}
    assert all(hasattr(vau.mlx, f) for f in ("neuron_fn", "erosion_fn", "abliterate_fn", "port"))
