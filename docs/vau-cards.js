/* Vector Abliteration Units: the site's live cards.
   Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
   Every [data-vau-card] element gets its unit's card, drawn by VAU's card runtime (vau-card.js,
   from src/vau/look/card.js) from the catalogue (vau-catalogue.js), as a host would mount it:
   the site plays the host, keeping the values, offering GPT-2 small's twelve layers as the
   target's range, and the host features in their fold. A meter gets a still screen with VAU's
   needle (meter-1). No model runs here: on the text page, turning a control holds the unit's
   explainer at the nearest setting its example texts were run at (VAUExplain.figure(id).hold); on
   the audio page (the Audio Collection's catalogue, window.VAU.collection "audio") the model has no
   attention sink, the presets measured on it are offered, and turning a control or choosing a
   preset marks the nearest setting in the unit's sweep (VAUListen.turn, VAUListen.line). */
(function () {
  "use strict";
  var V = window.VAU || { units: [], collections: {}, host_params: [] };
  if (!window.VAUCard) return;
  var byId = {};
  V.units.forEach(function (u) { byId[u.id] = u; });
  var NAMES = { layer: "Residual stream", head: "Head", attn: "Attention", mlp: "MLP", block: "Block" };
  var LAYERS = 12;
  var AUDIO = V.collection === "audio";
  var DIRECTIONS = AUDIO ? ["brightness", "pulse"] : ["negation", "formal", "refusal"];
  function listen(id, k, v) { if (window.VAUListen) window.VAUListen.turn(id, k, v); }

  function mountOne(el) {
    var u = byId[el.dataset.vauCard];
    if (!u) return;
    var vals = {};
    try { vals = JSON.parse(el.dataset.values || "{}"); } catch (e) { vals = {}; }
    var tk = vals._target ? vals._target[0] : (u.targets[0] || null), tv = vals._target ? String(vals._target[1]) : "6";
    delete vals._target;
    var state = vals, open = false;
    function target() {
      if (!tk) return [];
      var top = tk === "layer" ? LAYERS : LAYERS - 1, isHead = tk === "head";
      var out = [{ key: "_target", label: "Target", kind: "choice", role: "target-menu", choices: u.targets, labels: NAMES, reset: u.targets[0],
        tip: "what the unit acts on", get: function () { return tk; }, put: function (x) { tk = x; tv = x === "head" ? "5.1" : x === "layer" ? "6" : "5"; draw(); } }];
      var at = function () { listen(u.id, "at", tv === "all" ? -1 : parseFloat(tv)); };
      var lay = function () { return isHead ? +String(tv).split(".")[0] || 0 : tv === "all" ? top + 1 : +tv || 0; };
      out.push({ key: tk, label: tk === "layer" ? "Layer" : "Block", kind: "int", role: "target", min: 0, max: isHead ? top : top + 1, all: isHead ? undefined : top + 1,
        int: true, reset: tk === "layer" ? 6 : 5, get: lay,
        put: function (x) { tv = isHead ? x + "." + (String(tv).split(".")[1] || "1") : x >= top + 1 ? "all" : String(x); at(); },
        fmt: function (x) { return !isHead && x >= top + 1 ? "all" : String(x); } });
      if (isHead) out.push({ key: "head", label: "Head", kind: "int", role: "target", min: 0, max: 11, int: true, reset: 1,
        get: function () { return +String(tv).split(".")[1] || 0; }, put: function (x) { tv = String(tv).split(".")[0] + "." + x; } });
      return out;
    }
    function host() {
      if (u.category === "meter") return [];
      var env = state.env || "none", ctl = state.control || "none";
      return (V.host_params || []).filter(function (p) {
        return !(["epeak", "ewidth", "eedge"].indexOf(p.key) >= 0 && env === "none") && !(p.key === "cseed" && ctl === "none");
      }).map(function (p) {
        var kind = p.kind === "choice" ? "choice" : p.kind === "toggle" ? "toggle" : p.kind === "int" ? "int" : "knob";
        var reset = p["default"] !== undefined ? p["default"] : kind === "choice" ? p.choices[0] : 0;
        return { key: p.key, label: p.label, kind: kind, role: "host", min: p.min, max: p.max, step: p.step, int: kind === "int", reset: reset,
          choices: p.choices, tip: p.tip,
          get: function () { var s = state[p.key]; if (kind === "choice") return s === undefined ? String(reset) : s; var v = parseFloat(s); return s === undefined || isNaN(v) ? reset : v; },
          put: function (x) { state[p.key] = String(x); if (kind === "choice") draw(); } };
      });
    }
    function screen() {
      if (u.category !== "meter") return null;
      var d = u.display || {}, sc = document.createElement("div");
      sc.className = "uc-screen";
      sc.innerHTML = (d.kind === "series" ? '<div class="uc-needle">' + window.VAUCard.needle(0.78, 0.52, d.unit || "") + "</div>" : "") +
        '<div class="uc-read"><b>Diverged</b> and <b>Original</b>, at the step a host shows</div><div class="uc-note">' + (d.label || "") + ", each step</div>";
      return sc;
    }
    // on the units page, a turned control holds the unit's explainer at the nearest setting its example texts were run at
    var hint = el.closest(".uc") && el.closest(".uc").querySelector(".uc-hint");
    function follow() {
      var fx = window.VAUExplain && window.VAUExplain.figure && window.VAUExplain.figure(u.id);
      var chain = fx ? fx.hold(state, u.params) : null;
      if (hint && chain) hint.innerHTML = "Showing GPT-2 small at <code>" + chain.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }) + "</code>, the nearest setting it was run at. Play resumes the figure.";
    }
    // a preset writes its line: its settings, its placement and any host features it names
    function preset(p) {
      String(p.line || "").split(/\s+/).slice(1).forEach(function (w) {
        var i = w.indexOf("="); if (i < 1) return;
        var k = w.slice(0, i), v = w.slice(i + 1);
        if (u.targets.indexOf(k) >= 0) { tk = k; tv = v; } else state[k] = v;
      });
      draw();
      if (window.VAUListen) window.VAUListen.line(u.id, p.line, p.name);
    }
    function draw() {
      window.VAUCard.mount(el, { unit: u, iface: u.collection && V.collections && V.collections[u.collection] ? V.collections[u.collection].interface : null,
        get: function (k) { return state[k]; }, set: function (k, v, rebuild) { state[k] = String(v); if (rebuild) draw(); follow(); listen(u.id, k, v); },
        target: target(), host: host(), hostOpen: open, onHost: function (o) { open = o; }, directions: DIRECTIONS, screen: screen(),
        flags: AUDIO ? { sink: false } : undefined, presets: u.presets, start: u.start, onPreset: preset,
        presetsFrom: V.presets && V.presets.model ? V.presets.model.name : undefined });
    }
    draw();
  }
  document.querySelectorAll("[data-vau-card]").forEach(mountOne);
})();
