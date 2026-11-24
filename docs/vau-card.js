/* Vector Abliteration Units: the card runtime.
   Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later

   VAUCard.mount(element, options) draws a unit's card into an element the host gives it: the
   space on the unit's strip below the host's top line. The host keeps its frame and its top line
   (power, name, help, output summary); VAU draws everything on the card, from the components of
   the interface language (SPEC.md, section 5f), as the unit's collection maps its controls onto
   them (look/<collection>.json) and styles them (look/<collection>.css, with card.css).

   options:
     unit        the unit's catalogue entry (id, params, collection ...)
     iface       its collection's interface (look/<collection>.json), or null for the defaults
     get(key)    the line's value for a key, a string, or undefined
     set(key, v, rebuild)   write a value (rebuild: the host should redraw the card)
     target      controls the host describes for what the unit acts on (see below), drawn first
     host        controls for the host features (SPEC 5a), drawn in a fold
     hostOpen    whether that fold starts open; onHost(open) when it opens or closes
     directions  the names of the directions the host keeps, for a direction parameter
     screen      an element of the host's to put on the card, for a meter's readings
     tip(el, control, how)  optional: the host's own tooltip for a control
     flags       what the host says of its model, e.g. {sink: false} where position 0 is no attention
                 sink; a control whose when names a flag the model lacks is left out
     presets, start, presetsFrom   the unit's presets on the host's model (catalogue), listed in a
                 menu at the head of the card; onPreset(preset) hands the chosen one to the host

   A control the host describes: {key, label, kind: knob | int | choice | toggle | text, role,
   min, max, step, int, reset, choices, labels, tip, hint, all, get(), put(value), fmt(value)}.
   role is "target", "target-menu" or "host"; the interface maps roles as it maps kinds.

   A host may draw a card itself, from the same manifest; the standard discourages it, so that a
   unit looks the same on every host. */
(function (root) {
  "use strict";
  var COMPONENTS = ["knob-small-1", "knob-1", "knob-big-1", "knob-big-3", "selector-small", "selector-med",
    "menu-1", "light-1", "field-1", "fader-1", "meter-1", "meter-3"];
  var FALLBACK = { knob: "knob-1", int: "knob-1", fader: "fader-1", choice: "menu-1", toggle: "light-1", direction: "menu-1",
    text: "field-1", target: "knob-small-1", "target-menu": "menu-1", "host-knob": "knob-small-1", "host-choice": "menu-1", "host-toggle": "light-1" };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function num(v) { var x = +(+v).toFixed(4); return isFinite(x) ? String(x) : String(v); }
  var gid = 0;
  // a knob's or a selector's black body: a radial gradient lit from the upper left, whose stops take the look's colours
  // and its shadow, with the very slight blur that keeps it from looking drawn, on the body alone (not on printed numbers)
  function dome() {
    var id = "vcg" + (++gid);
    return { id: id, defs: '<defs><radialGradient id="' + id + '" cx="0.5" cy="0.5" r="0.5" fx="0.4" fy="0.34"><stop offset="0" class="vc-g0"/><stop offset="0.4" class="vc-g1"/><stop offset="0.85" class="vc-g2"/><stop offset="1" class="vc-g3"/></radialGradient>' +
      '<filter id="' + id + 'f" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow class="vc-shadow" dx="0" dy="1.4" stdDeviation="1.1"/><feGaussianBlur stdDeviation="0.22"/></filter></defs>' };
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  function pt(cx, cy, r, deg) { var a = deg * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; }
  function arc(cx, cy, r, a0, a1) {
    var p = pt(cx, cy, r, a0), q = pt(cx, cy, r, a1);
    return "M" + p[0].toFixed(2) + " " + p[1].toFixed(2) + " A" + r + " " + r + " 0 " + (a1 - a0 > 180 ? 1 : 0) + " 1 " + q[0].toFixed(2) + " " + q[1].toFixed(2);
  }

  // Which component draws a control: the collection's choice for this unit's key, else for the
  // control's role or kind, else the fallback. "selector" picks a size from the number of choices.
  function component(iface, unitId, c) {
    var comp = (iface && iface.components) || {}, byUnit = (comp.units || {})[unitId] || {}, def = comp.defaults || {};
    var role = c.role === "host" ? "host-" + (c.kind === "choice" ? "choice" : c.kind === "toggle" ? "toggle" : "knob") : c.role;
    var kind = c.direction ? "direction" : c.kind;   // a direction is a choice among the host's directions, but drawn as its own kind (a menu)
    var name = (c.role ? null : byUnit[c.key]) || (role && def[role]) || def[kind] || FALLBACK[role] || FALLBACK[kind] || "field-1";
    if (name === "selector") name = !c.choices ? "menu-1" : c.choices.length <= 3 ? "selector-small" : c.choices.length <= 5 ? "selector-med" : "menu-1";
    if (/^selector/.test(name) && (!c.choices || c.choices.length < 2 || c.choices.length > 5)) name = "menu-1";
    if (/^selector/.test(name)) {               // settings printed around a lever must fit: none longer than 8 letters, 15 in all
      var lens = c.choices.map(function (x) { return String((c.labels && c.labels[x]) || x).length; });
      if (Math.max.apply(null, lens) > 8 || lens.reduce(function (a, b) { return a + b; }, 0) > 15) name = "menu-1";
    }
    if (/^(knob|fader)/.test(name) && !(c.kind === "knob" || c.kind === "int" || c.kind === "fader")) name = FALLBACK[c.kind] || "field-1";
    return name;
  }

  function decorate(o, node, c, how) {
    if (o.tip) { o.tip(node, c, how); return node; }
    var range = (c.kind === "knob" || c.kind === "int" || c.kind === "fader") && c.max > c.min ? " · " + num(c.min) + " to " + num(c.max) : "";
    node.title = c.label + range + (c.tip ? ": " + c.tip : "") + (how ? ". " + how : "");
    node.dataset.info = node.title;
    return node;
  }

  // ---------------------------------------------------------------- knobs
  // knob-small-1, knob-1: a ring of printed dots, an arc, a pointer. knob-big-1: large, with the
  // numbers 0 to 10 printed around it. knob-big-3: large, with its range printed at the ends.
  function knob(o, c, name) {
    var size = name === "knob-small-1" ? "s" : /big/.test(name) ? "l" : "m";
    var big = size === "l";
    var node = el("div", "vc-knob vc-k" + size + " vc-" + name);
    node.tabIndex = 0;
    var vb = big ? "-15 -15 78 78" : "0 0 48 48", d = dome(), s = d.defs;
    if (name === "knob-big-1") for (var k = 0; k <= 10; k++) {
      var p = pt(24, 24, 31, -135 + 27 * k);
      s += '<text class="vc-num" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="central">' + k + "</text>";
    }
    if (name === "knob-big-3") {
      var a = pt(24, 24, 30, -150), b = pt(24, 24, 30, 150);
      s += '<text class="vc-num" x="' + a[0].toFixed(1) + '" y="' + (a[1] + 4).toFixed(1) + '" text-anchor="middle">' + esc(c.fmt ? c.fmt(c.min) : num(c.min)) + "</text>" +
           '<text class="vc-num" x="' + b[0].toFixed(1) + '" y="' + (b[1] + 4).toFixed(1) + '" text-anchor="middle">' + esc(c.fmt ? c.fmt(c.max) : num(c.max)) + "</text>";
    }
    node.innerHTML = '<div class="vc-l">' + esc(c.label) + '</div><svg viewBox="' + vb + '" aria-hidden="true">' + s +
      '<path class="vc-track" pathLength="100" d="' + arc(24, 24, 21, -135, 135) + '"/><path class="vc-arc"/>' +
      '<g filter="url(#' + d.id + 'f)"><circle class="vc-body" cx="24" cy="24" r="17" pathLength="100" fill="url(#' + d.id + ')"/><line class="vc-ptr" x1="24" y1="24" x2="24" y2="10.5"/></g></svg><div class="vc-v"></div>';
    var cur = function () { return c.get(); }, show = function (v) { return c.fmt ? c.fmt(v) : num(v); };
    var pos = function (v) { return (v - c.min) / ((c.max - c.min) || 1); }, val = function (t) { return c.min + t * (c.max - c.min); };
    var rnd = function (v) { return c.int || c.kind === "int" ? Math.round(v) : c.step ? +(Math.round(v / c.step) * c.step).toFixed(4) : +(+v).toFixed(4); };
    function paint() {
      var v = cur(), t = clamp(pos(v));
      node.querySelector(".vc-arc").setAttribute("d", arc(24, 24, 21, -135, -135 + 270 * Math.max(t, 0.002)));
      node.querySelector(".vc-ptr").setAttribute("transform", "rotate(" + (-135 + 270 * t).toFixed(2) + " 24 24)");
      node.querySelector(".vc-v").textContent = show(v);
      node.setAttribute("role", "slider"); node.setAttribute("aria-label", c.label); node.setAttribute("aria-valuetext", show(v));
    }
    var acc = null, idle = null;
    function nudge(dt) { if (acc === null) acc = clamp(pos(cur())); acc = clamp(acc + dt); var v = rnd(val(acc)); if (v !== cur()) c.put(v); paint(); }
    function step(d) {
      acc = null;
      var v = c.int || c.kind === "int" ? Math.min(c.max, Math.max(c.min, Math.round(cur()) + d)) : rnd(val(clamp(pos(cur()) + d * 0.025)));
      c.put(v); paint();
    }
    node.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || e.target.closest(".vc-v")) return;
      e.preventDefault(); node.focus(); node.setPointerCapture(e.pointerId);
      acc = clamp(pos(cur()));
      var x = e.clientX, y = e.clientY, range = big ? 220 : 160;
      function move(ev) { nudge(((y - ev.clientY) + (ev.clientX - x)) / (ev.shiftKey ? range * 5 : range)); x = ev.clientX; y = ev.clientY; }
      function up() { acc = null; node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up); }
      node.addEventListener("pointermove", move); node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up);
    });
    node.addEventListener("wheel", function (e) {
      e.preventDefault(); nudge(-e.deltaY / (e.shiftKey ? 3000 : 600));
      clearTimeout(idle); idle = setTimeout(function () { acc = null; }, 400);
    }, { passive: false });
    node.querySelector("svg").addEventListener("dblclick", function () { acc = null; c.put(c.reset); paint(); });
    node.querySelector(".vc-v").addEventListener("dblclick", function (e) {
      e.stopPropagation();
      var v = prompt(c.label + (c.all !== undefined ? " (" + c.min + " to " + (c.all - 1) + ", or all)" : " (any number)"), show(cur()));
      if (v === null) return;
      acc = null;
      if (c.all !== undefined && v.trim().toLowerCase() === "all") c.put(c.all);
      else if (!isNaN(parseFloat(v))) c.put(c.int || c.kind === "int" ? Math.round(parseFloat(v)) : parseFloat(v));
      paint();
    });
    node.addEventListener("keydown", function (e) {
      var d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); e.stopPropagation(); step(e.shiftKey && !(c.int || c.kind === "int") ? d / 5 : d); }
    });
    paint();
    return decorate(o, node, c, "Drag up or right to turn it up (Shift for fine), scroll, or use the arrow keys. Double-click the knob to reset it, or the number to type a value.");
  }

  // ---------------------------------------------------------------- selectors: a lever on a black body, its choices printed around it
  function selector(o, c, name) {
    var n = c.choices.length, med = name === "selector-med";
    var W = med ? 120 : 104, Hh = med ? 66 : 58, cx = W / 2, cy = Hh - 18, R = med ? 38 : 32, spread = med ? 64 : 54;
    var node = el("div", "vc-sel vc-" + name);
    node.tabIndex = 0;
    var d = dome(), labels = d.defs;
    for (var i = 0; i < n; i++) {
      var a = n === 1 ? 0 : -spread + 2 * spread * i / (n - 1), p = pt(cx, cy, R, a);
      var text = (c.labels && c.labels[c.choices[i]]) || c.choices[i];
      labels += '<text class="vc-opt" data-i="' + i + '" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="central">' + esc(text) + "</text>";
    }
    node.innerHTML = '<div class="vc-l">' + esc(c.label) + '</div><svg viewBox="0 0 ' + W + " " + Hh + '" aria-hidden="true">' + labels +
      '<g filter="url(#' + d.id + 'f)"><g class="vc-lever"><path class="vc-sw" fill="url(#' + d.id + ')" d="M' + (cx - 3.6) + " " + cy + " L" + (cx - 2.4) + " " + (cy - 19) + " Q" + cx + " " + (cy - 21.5) + " " + (cx + 2.4) + " " + (cy - 19) +
      " L" + (cx + 3.6) + " " + cy + ' Z"/><line class="vc-ptr" x1="' + cx + '" y1="' + (cy - 4) + '" x2="' + cx + '" y2="' + (cy - 17.5) + '"/></g>' +
      '<circle class="vc-swbody" fill="url(#' + d.id + ')" cx="' + cx + '" cy="' + cy + '" r="10"/></g></svg>';
    function idx() { var v = String(c.get()); var k = c.choices.indexOf(v); return k < 0 ? 0 : k; }
    function paint() {
      var k = idx(), a = n === 1 ? 0 : -spread + 2 * spread * k / (n - 1);
      node.querySelector(".vc-lever").setAttribute("transform", "rotate(" + a.toFixed(1) + " " + cx + " " + cy + ")");
      node.querySelectorAll(".vc-opt").forEach(function (t) { t.classList.toggle("on", +t.dataset.i === k); });
      node.setAttribute("role", "slider"); node.setAttribute("aria-label", c.label); node.setAttribute("aria-valuetext", c.choices[k]);
    }
    function pick(k) { k = (k + n) % n; if (c.choices[k] !== String(c.get())) c.put(c.choices[k]); paint(); }
    node.addEventListener("click", function (e) {
      var t = e.target.closest(".vc-opt");
      pick(t ? +t.dataset.i : idx() + 1);
    });
    node.addEventListener("keydown", function (e) {
      var d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); e.stopPropagation(); pick(Math.min(n - 1, Math.max(0, idx() + d))); }
    });
    node.addEventListener("wheel", function (e) { e.preventDefault(); pick(Math.min(n - 1, Math.max(0, idx() + (e.deltaY < 0 ? 1 : -1)))); }, { passive: false });
    paint();
    return decorate(o, node, c, "Click a setting, or the lever to move it on; the arrow keys and the wheel also turn it.");
  }

  // ---------------------------------------------------------------- menu, light, field, fader
  function menu(o, c) {
    var wrap = el("label", "vc-menu-w", '<span class="vc-l">' + esc(c.label) + "</span>");
    var s = el("select", "vc-menu");
    s.setAttribute("aria-label", c.label);
    var cur = String(c.get() === undefined ? "" : c.get()), opts = c.choices.indexOf(cur) >= 0 || !cur ? c.choices : [cur].concat(c.choices);
    s.innerHTML = opts.map(function (x) { return "<option value=\"" + esc(x) + "\"" + (x === cur ? " selected" : "") + ">" + esc((c.labels && c.labels[x]) || x) + "</option>"; }).join("");
    s.addEventListener("change", function () { c.put(s.value); });
    wrap.appendChild(s);
    return decorate(o, wrap, c, "");
  }
  function light(o, c) {
    var b = el("button", "vc-light");
    b.type = "button";
    function paint() { b.setAttribute("aria-pressed", +c.get() ? "true" : "false"); b.innerHTML = "<i></i><span>" + esc(c.label) + "</span>"; }
    b.addEventListener("click", function () { c.put(+c.get() ? 0 : 1); paint(); });
    paint();
    return decorate(o, b, c, "Click to switch it.");
  }
  function field(o, c) {
    var wrap = el("label", "vc-field-w", '<span class="vc-l">' + esc(c.label) + "</span>");
    var i = el("input", "vc-field");
    i.type = "text"; i.spellcheck = false; i.value = c.get() === undefined ? "" : c.get(); i.placeholder = c.hint || "";
    i.addEventListener("change", function () { c.put(i.value); });
    wrap.appendChild(i);
    return decorate(o, wrap, c, "");
  }
  function fader(o, c) {
    var node = el("div", "vc-fader", '<div class="vc-v"></div><div class="vc-well"><input type="range" min="0" max="1000" step="1" aria-label="' + esc(c.label) + '"></div><div class="vc-l">' + esc(c.label) + "</div>");
    var input = node.querySelector("input"), pos = function (v) { return (v - c.min) / ((c.max - c.min) || 1); };
    function paint() { var v = c.get(); input.value = Math.round(clamp(pos(v)) * 1000); node.querySelector(".vc-v").textContent = c.fmt ? c.fmt(v) : num(v); }
    input.addEventListener("input", function () {
      var v = c.min + (input.value / 1000) * (c.max - c.min);
      c.put(c.int ? Math.round(v) : c.step ? +(Math.round(v / c.step) * c.step).toFixed(4) : +v.toFixed(4)); paint();
    });
    input.addEventListener("dblclick", function () { c.put(c.reset); paint(); });
    paint();
    return decorate(o, node, c, "Drag the cap, or use the arrow keys; double-click it to reset.");
  }

  // ---------------------------------------------------------------- meter-1: a needle meter
  // The reading at the shown step, for the original text (orig) and the diverged (bent), each a
  // fraction of the scale (or null), as two needles over a scale that turns red near the top.
  function needle(orig, bent, unit) {
    var W = 180, cx = 90, cy = 96, R = 78, A = 42, s = "";
    function p(f, r) { var a = (-A + 2 * A * clamp(f)) * Math.PI / 180; return [(cx + r * Math.sin(a)).toFixed(1), (cy - r * Math.cos(a)).toFixed(1)]; }
    function band(f0, f1, cls) { var a = p(f0, R + 1.5), b = p(f1, R + 1.5); return '<path class="' + cls + '" d="M' + a[0] + " " + a[1] + " A" + (R + 1.5) + " " + (R + 1.5) + " 0 0 1 " + b[0] + " " + b[1] + '"/>'; }
    s += band(0, 0.7, "ns") + band(0.7, 1, "nz");
    for (var k = 0; k <= 10; k++) { var a = p(k / 10, R - (k % 5 ? 4 : 7)), b = p(k / 10, R); s += '<line class="' + (k >= 7 ? "nh" : "ni") + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>'; }
    [[orig, "no"], [bent, "nb"]].forEach(function (x) { if (x[0] !== null && x[0] !== undefined) { var q = p(x[0], R + 2); s += '<line class="' + x[1] + '" x1="' + cx + '" y1="' + cy + '" x2="' + q[0] + '" y2="' + q[1] + '"/>'; } });
    return '<svg class="vc-needle" viewBox="0 0 ' + W + ' 64" aria-hidden="true">' + s + '<text class="nu" x="' + (W - 8) + '" y="58" text-anchor="end">' + esc(unit || "") + "</text></svg>";
  }

  // ---------------------------------------------------------------- the card
  function draw(o, c) {
    var put = c.put;                              // every change re-reads the controls that apply only when others have certain values
    c.put = function (v) { put(v); if (o._refresh) o._refresh(); };
    var name = component(o.iface, o.unit.id, c);
    var node = /^knob/.test(name) ? knob(o, c, name) : /^selector/.test(name) ? selector(o, c, name) : name === "fader-1" ? fader(o, c)
      : name === "light-1" ? light(o, c) : name === "field-1" ? field(o, c) : menu(o, c);
    if (o._all) o._all.push({ c: c, node: node });
    return { name: name, node: node };
  }
  // Lay controls out: small knobs three to a row, knobs two to a row, lights side by side, the
  // rest one to a row; large knobs and faders go to the main place, which takes the spare height.
  function lay(into, items, main) {
    var row = null, rowKind = null;
    items.forEach(function (it) {
      var kind = it.name === "knob-small-1" ? "s" : it.name === "knob-1" ? "m" : it.name === "light-1" ? "l" : null;
      if (/big|fader/.test(it.name) && main) { main.appendChild(it.node); return; }
      if (!kind) { row = null; into.appendChild(it.node); return; }
      var max = kind === "s" ? 3 : kind === "m" ? 2 : 2;
      if (!row || rowKind !== kind || row.children.length >= max) { row = el("div", "vc-row vc-row-" + kind); rowKind = kind; into.appendChild(row); }
      row.appendChild(it.node);
    });
  }
  function fromManifest(o, p) {
    var isNum = p.kind === "knob" || p.kind === "fader" || p.kind === "int";
    var reset = p["default"] !== undefined ? p["default"] : p.kind === "choice" ? p.choices[0] : p.kind === "toggle" ? 0 : "";
    var choices = p.kind === "choice" ? p.choices.map(String) : p.kind === "direction" ? (o.directions && o.directions.length ? o.directions : ["(none yet)"]) : undefined;
    return { key: p.key, label: p.label, kind: p.kind === "direction" ? "choice" : p.kind === "fader" ? "fader" : p.kind, direction: p.kind === "direction", min: p.min, max: p.max, step: p.step,
      int: p.kind === "int", reset: reset, choices: choices, tip: p.tip, hint: p.hint, when: p.when,
      get: function () { var s = o.get(p.key); if (!isNum) return s === undefined ? reset : s; var v = parseFloat(s); return s === undefined || isNaN(v) ? reset : v; },
      put: function (v) { o.set(p.key, v, p.kind === "text"); } };
  }
  // when: {key: [values]} applies while the control `key` has one of those values (dimmed otherwise);
  // {host: [flags]} applies only where the host says so of its model (hidden otherwise). Flags:
  // sink (position 0 is an attention sink), true unless the host says otherwise.
  function applies(o, c) {
    var w = c.when || {}, flags = o.flags || {}, k, ok = true, shown = true;
    for (k in w) {
      if (k === "host") { w.host.forEach(function (f) { if (flags[f] === false || (flags[f] === undefined && f !== "sink")) shown = false; }); continue; }
      var other = (o._all || []).filter(function (x) { return x.c.key === k && x.c !== c; })[0];
      if (other && w[k].map(String).indexOf(String(other.c.get())) < 0) ok = false;
    }
    return { shown: shown, ok: ok };
  }
  function refresh(o) {
    (o._all || []).forEach(function (x) {
      if (!x.c.when) return;
      var a = applies(o, x.c);
      x.node.hidden = !a.shown;
      x.node.classList.toggle("vc-dim", !a.ok);
      x.node.setAttribute("aria-disabled", a.ok ? "false" : "true");
    });
  }
  // presets: the ones measured on the host's model for this unit (catalogue: units[i].presets),
  // listed in a menu at the head of the card; choosing one hands it to the host (onPreset), which
  // writes its line, placement and host features as it does for any line
  function presetMenu(o) {
    var wrap = el("label", "vc-menu-w vc-presets"), s = el("select", "vc-menu");
    s.setAttribute("aria-label", "Presets");
    s.innerHTML = '<option value="" selected disabled>Presets…</option>' + o.presets.map(function (p, i) {
      return '<option value="' + i + '" title="' + esc(p.tip || "") + '">' + esc(p.name) + (o.start === p.name ? " (start)" : "") + "</option>";
    }).join("");
    s.addEventListener("change", function () { var p = o.presets[+s.value]; s.value = ""; if (p && o.onPreset) o.onPreset(p); });
    wrap.appendChild(s);
    wrap.title = "Presets measured on this model" + (o.presetsFrom ? " (" + o.presetsFrom + ")" : "") + ": choosing one writes its line";
    return wrap;
  }
  function mount(host, o) {
    host.innerHTML = "";
    host.classList.add("vau-card");
    if (o.unit.collection) host.classList.add("vau-" + o.unit.collection);
    o._all = []; o._refresh = function () { refresh(o); };
    var body = el("div", "vc-body"), main = el("div", "vc-main");
    if (o.presets && o.presets.length) body.appendChild(presetMenu(o));
    if (o.target && o.target.length) {
      var t = el("div", "vc-target");
      lay(t, o.target.map(function (c) { return draw(o, c); }), null);
      body.appendChild(t);
    }
    lay(body, (o.unit.params || []).map(function (p) { return draw(o, fromManifest(o, p)); }), main);
    if (o.host && o.host.length) {
      var d = el("details", "vc-host"), changed = o.host.filter(function (c) { return String(c.get()) !== String(c.reset); }).length;
      d.open = !!o.hostOpen;
      d.innerHTML = '<summary title="The host\'s features, applied around this unit\'s own change: wet, an envelope over the depth, keep size, and a random control">Host' + (changed ? " <i>" + changed + "</i>" : "") + "</summary>";
      d.addEventListener("toggle", function () { if (o.onHost) o.onHost(d.open); });
      lay(d, o.host.map(function (c) { return draw(o, c); }), null);
      body.appendChild(d);
    }
    host.appendChild(body);
    if (o.screen) main.appendChild(o.screen);
    if (main.children.length) host.appendChild(main);
    host.appendChild(el("span", "vau-mark", "VAU"));
    refresh(o);
    return host;
  }

  root.VAUCard = { mount: mount, component: component, needle: needle, COMPONENTS: COMPONENTS };
})(typeof window !== "undefined" ? window : this);
