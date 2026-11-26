/* Vector Abliteration Units: the audio page's sweeps.
   Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
   Every [data-au] element gets its unit's sweep from window.VAU_AUDIO (docs/vau-audio.js, written by
   tools/import_audio.py): the model unchanged (Original), then one row per control, a clip at each
   setting it was rendered at, one control moved at a time from the unit's example line. One clip
   plays at a time. The unit's card (vau-cards.js) calls VAUListen.turn as a control turns and
   VAUListen.line when a preset is chosen; the nearest setting in each row is marked, and a playing
   clip moves to it at the same point in the sound. */
(function () {
  "use strict";
  var A = window.VAU_AUDIO, V = window.VAU || { units: [] };
  if (!A) return;
  var player = new Audio(), playing = null, panels = {};
  player.preload = "none";
  var byId = {}, cat = {};
  A.units.forEach(function (u) { byId[u.id] = u; });
  V.units.forEach(function (u) { cat[u.id] = u; });

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(k, v) { return k === "at" && v < 0 ? "all" : String(+v.toFixed(3)); }
  function label(id, k) {
    if (k === "at") return "Placement";
    var p = (cat[id] && cat[id].params || []).filter(function (q) { return q.key === k; })[0];
    return p ? p.label : k;
  }
  function show(pn, s, what) {
    var bad = s.broken && s.broken.length ? '<span class="au-bad">' + esc(s.broken.join("; ")) + "</span>" : "";
    pn.now.innerHTML = (what ? "<b>" + esc(what) + "</b> " : "") + (s.line ? "<code>" + esc(s.line) + "</code> " : "") +
      '<span class="au-m">' + (s.rms_db !== undefined ? s.rms_db.toFixed(1) + " dBFS" : "") +
      (s.centroid_hz !== undefined ? " · centroid " + Math.round(s.centroid_hz) + " Hz" : "") + "</span>" + bad;
  }
  function paint() {
    Object.keys(panels).forEach(function (id) {
      panels[id].buttons.forEach(function (b) {
        var on = playing && playing.btn === b && !player.paused;
        b.classList.toggle("on", !!on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  }
  function play(id, btn, s, what) {
    var pn = panels[id];
    if (playing && playing.btn === btn && !player.paused) { player.pause(); paint(); return; }
    var at = playing && playing.id === id && !player.paused ? player.currentTime : 0;
    player.src = s.src;
    playing = { id: id, btn: btn, s: s };
    player.currentTime = 0;
    var go = function () { try { player.currentTime = Math.min(at, (player.duration || at + 1) - 0.05); } catch (e) {} };
    if (at) player.addEventListener("loadedmetadata", go, { once: true });
    var pr = player.play();
    if (pr && pr.catch) pr.catch(function () { paint(); });
    show(pn, s, what);
    paint();
  }
  player.addEventListener("ended", paint);
  player.addEventListener("pause", paint);

  function near(id, k, v) {
    var pn = panels[id];
    if (!pn || !pn.rows[k]) return null;
    var row = pn.rows[k], best = 0;
    row.steps.forEach(function (s, i) { if (Math.abs(s.v - v) < Math.abs(row.steps[best].v - v)) best = i; });
    row.buttons.forEach(function (b, i) { b.classList.toggle("near", i === best); });
    return { btn: row.buttons[best], s: row.steps[best] };
  }

  function mount(el) {
    var id = el.dataset.au, u = byId[id];
    if (!u) return;
    var pn = { el: el, rows: {}, buttons: [] };
    panels[id] = pn;
    el.innerHTML = "";
    var head = document.createElement("div");
    head.className = "au-head";
    var orig = document.createElement("button");
    orig.type = "button"; orig.className = "au-s au-orig"; orig.textContent = "Original";
    orig.title = "the model unchanged";
    head.appendChild(orig);
    pn.buttons.push(orig);
    if (A.none) orig.addEventListener("click", function () { play(id, orig, A.none, "Original: the model unchanged"); });
    var now = document.createElement("div");
    now.className = "au-now";
    now.textContent = "Choose a setting to hear it.";
    pn.now = now;
    el.appendChild(head);
    Object.keys(u.controls).forEach(function (k) {
      var c = u.controls[k], row = document.createElement("div");
      row.className = "au-row";
      row.innerHTML = '<span class="au-k">' + esc(label(id, k)) + "</span>";
      var steps = document.createElement("span");
      steps.className = "au-steps";
      var r = { steps: c.steps, buttons: [] };
      c.steps.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "au-s" + (s.broken && s.broken.length ? " bad" : "");
        b.textContent = fmt(k, s.v) + (s.broken && s.broken.length ? " !" : "");
        b.title = (s.line || "") + (s.broken && s.broken.length ? " — " + s.broken.join("; ") : "");
        b.addEventListener("click", function () { play(id, b, s, label(id, k) + " " + fmt(k, s.v)); });
        steps.appendChild(b);
        r.buttons.push(b); pn.buttons.push(b);
      });
      row.appendChild(steps);
      el.appendChild(row);
      pn.rows[k] = r;
    });
    el.appendChild(now);
    var card = document.querySelector('[data-vau-card="' + id + '"]'), vals = {};
    try { vals = JSON.parse(card ? card.dataset.values : "{}"); } catch (e) { vals = {}; }
    Object.keys(pn.rows).forEach(function (k) {                       // mark where the card starts
      var v = k === "at" ? (vals._target ? (vals._target[1] === "all" ? -1 : parseFloat(vals._target[1])) : NaN) : parseFloat(vals[k]);
      if (!isNaN(v)) near(id, k, v);
    });
  }

  window.VAUListen = {
    turn: function (id, k, v) {
      var n = near(id, k, parseFloat(v));
      if (n && playing && playing.id === id && !player.paused && playing.btn !== n.btn) play(id, n.btn, n.s, label(id, k) + " " + fmt(k, n.s.v));
    },
    line: function (id, line, name) {
      var pn = panels[id];
      if (!pn) return;
      String(line).split(/\s+/).slice(1).forEach(function (w) {
        var i = w.indexOf("="); if (i < 1) return;
        var k = w.slice(0, i), v = w.slice(i + 1);
        if (k === "layer" || k === "block") near(id, "at", v === "all" ? -1 : parseFloat(v));
        else if (!isNaN(parseFloat(v))) near(id, k, parseFloat(v));
      });
      pn.now.innerHTML = "<b>Preset " + esc(name) + "</b> <code>" + esc(line) + "</code> " +
        '<span class="au-m">its own line was not rendered here; the nearest setting of each control is marked</span>';
    }
  };
  document.querySelectorAll("[data-au]").forEach(mount);
})();
