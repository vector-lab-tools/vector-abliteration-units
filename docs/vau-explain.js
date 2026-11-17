// Built by tools/build_site.py from the files VAU ships: vau/explain/explain.js, vau/units/compressor.explain.js, vau/units/saturator.explain.js, vau/units/delay.explain.js, vau/units/reverb.explain.js, vau/units/erosion.explain.js, vau/units/shifter.explain.js, vau/units/eq.explain.js, vau/units/beatrepeat.explain.js, vau/units/gate.explain.js, vau/units/limiter.explain.js, vau/units/multiband.explain.js, vau/units/morph.explain.js, vau/units/abliterate.explain.js, vau/units/neuron.explain.js, vau/units/entropy.explain.js, vau/units/peakshare.explain.js.

// ---- vau/explain/explain.js
// Vector Abliteration Units: the explainer runtime.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
//
// A unit may come with an explainer, <unit file>.explain.js beside it, which registers an
// animated figure of what the unit's code computes:
//
//     VAUExplain.register("compressor", { caption, examples, still, draw(t, ex) { ... } });
//
// draw(t, ex) is given the figure's clock in milliseconds and the example texts (examples.json,
// or null), and returns { svg, read, setting, token }: the inside of a 400 x 210 SVG, the
// readout line, which of the unit's example settings the figure is showing, and, for a meter,
// which token it has reached. A host loads this file and explain.css, then the explainers it
// wants, and calls VAUExplain.mount(element, unitId, { examples }) to draw one: with a pause
// button (a click on the figure does the same), paused while off screen, and drawn once, at the
// explainer's `still` moment, under reduced motion. Colours come from the --vx-* properties
// (see explain.css), so the figure follows the host's theme. Plain JS, no libraries.
(function (root) {
  "use strict";
  if (root.VAUExplain) return;
  var reduced = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------- drawing helpers ---------- */
  function n1(v) { return Math.round(v * 10) / 10; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function T(x, y, s, cls, extra) { return '<text x="' + n1(x) + '" y="' + n1(y) + '" class="' + (cls || "f-ink t-s") + '"' + (extra || "") + ">" + esc(s) + "</text>"; }
  function TM(x, y, s, cls) { return T(x, y, s, cls, ' text-anchor="middle"'); }
  function TE(x, y, s, cls) { return T(x, y, s, cls, ' text-anchor="end"'); }
  function R(x, y, w, h, cls, extra) {
    if (h < 0) { y += h; h = -h; }
    return '<rect x="' + n1(x) + '" y="' + n1(y) + '" width="' + n1(Math.max(0, w)) + '" height="' + n1(Math.max(0, h)) + '" class="' + cls + '"' + (extra || "") + "/>";
  }
  function L(x1, y1, x2, y2, cls, extra) { return '<line x1="' + n1(x1) + '" y1="' + n1(y1) + '" x2="' + n1(x2) + '" y2="' + n1(y2) + '" class="' + cls + '"' + (extra || "") + "/>"; }
  function C(x, y, r, cls, extra) { return '<circle cx="' + n1(x) + '" cy="' + n1(y) + '" r="' + r + '" class="' + cls + '"' + (extra || "") + "/>"; }
  function P(d, cls, extra) { return '<path d="' + d + '" class="' + cls + '" fill="none"' + (extra || "") + "/>"; }
  function arrow(x1, y1, x2, y2, cls, w) {
    var a = Math.atan2(y2 - y1, x2 - x1), h = 8, len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return "";
    var bx = x2 - (h * 0.8) * Math.cos(a), by = y2 - (h * 0.8) * Math.sin(a);
    return L(x1, y1, bx, by, cls, ' stroke-width="' + (w || 2) + '" stroke-linecap="round"') +
      '<path d="M' + n1(x2) + " " + n1(y2) + " L" + n1(x2 - h * Math.cos(a - 0.42)) + " " + n1(y2 - h * Math.sin(a - 0.42)) +
      " L" + n1(x2 - h * Math.cos(a + 0.42)) + " " + n1(y2 - h * Math.sin(a + 0.42)) + 'Z" class="' + cls.replace("s-", "f-") + '"/>';
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ease(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function gauss(i) { return (rnd(i) + rnd(i + 71) + rnd(i + 143) + rnd(i + 219) - 2) * 1.73; }
  function f2(v) { return v.toFixed(2); }
  function sign(v) { return v < 0 ? "−" + Math.abs(v).toFixed(2) : v.toFixed(2); }
  function stage(t, n, step, tr) {          // which of n stages is playing, the one before, and the blend
    var i = Math.floor(t / step), k = ease((t - i * step) / tr);
    return { i: i % n, prev: (i + n - 1) % n, k: k, n: i };
  }


  /* ---------- a row of positions (Lookback, Running Average) ---------- */
  function cells(s, y, p, NP, cx, w, weight) {
    for (var i = 0; i < NP; i++) {
      var on = i === p, wt = weight ? weight(i) : 0;
      s += R(cx(i) - w / 2, y - 13, w, 26, on ? "f-acc" : "f-panel", ' rx="3"' + (i === 0 ? ' style="stroke:var(--vx-dim);stroke-dasharray:2 2"' : ""));
      if (!on && wt > 0) s += R(cx(i) - w / 2, y - 13, w, 26, "f-acc", ' rx="3" opacity="' + n1(clamp(wt, 0.08, 1) * 0.6 * 100) / 100 + '"');
      s += TM(cx(i), y + 3.5, String(i), on ? "f-bg t-xs" : "f-dim t-xs");
    }
    return s;
  }
  function arc(a, b, y, hgt, cls, w, op) {
    return P("M" + n1(a) + " " + y + " Q" + n1((a + b) / 2) + " " + n1(y - hgt * 2) + " " + n1(b) + " " + y, cls, ' stroke-width="' + n1(w) + '" opacity="' + f2(op) + '"');
  }

  var BAND = ["f-acc", "f-blue", "f-green"];   // the low, mid and high bands of principal directions

  /* ---------- the example texts ---------- */
  var EX = null;                           // the example texts (examples.json), once loaded
  function words(text) { return text.replace(/\n+/g, " ¶ ").trim().split(/\s+/).filter(Boolean); }
  function diff(a, b) {                     // a word-level diff: which words of a and of b are kept
    var n = a.length, m = b.length, L2 = [], i, j;
    for (i = 0; i <= n; i++) { L2.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L2[i][j] = a[i] === b[j] ? L2[i + 1][j + 1] + 1 : Math.max(L2[i + 1][j], L2[i][j + 1]);
    var ka = a.map(function () { return false; }), kb = b.map(function () { return false; });
    for (i = 0, j = 0; i < n && j < m;) {
      if (a[i] === b[j]) { ka[i] = kb[j] = true; i++; j++; }
      else if (L2[i + 1][j] >= L2[i][j + 1]) i++; else j++;
    }
    return [ka, kb];
  }
  function show(ws, keep, tag) {
    return ws.map(function (w, i) {
      var h = w === "¶" ? '<span class="at-nl">¶</span>' : esc(w);
      return keep[i] ? h : "<" + tag + ">" + h + "</" + tag + ">";
    }).join(" ");
  }
  // Every version of a figure's text (the original, then the text at each of the unit's settings)
  // is drawn at once, all in one grid cell, and only the one showing is visible: the block is as
  // tall as the longest at the page's width, and keeps that size whichever is showing. The
  // diverged text is the original with the words that differ swapped in and marked.
  var ORIGINAL_MS = 1200;                   // after each change of setting the original shows this long, while the figure moves
  function variant(i, head, body) {
    return '<div class="vx-tv" data-v="' + i + '" aria-hidden="true">' + head + '<p class="at-row">' + body + "</p></div>";
  }
  function textBlocks(unit) {
    var rows = EX && EX.units[unit];
    if (!rows) return "";
    var O = EX.original, P = EX.provenance, pr = '<span class="at-prompt">' + esc(P.prompt) + "</span> ", vs = [];
    if (rows[0].reading) {                  // a meter: the original text at each setting, the token reached marked
      var toks = O.tokens.map(function (w, j) { return '<span data-j="' + j + '">' + esc(w).replace(/\n/g, '<span class="at-nl">¶</span>') + "</span>"; }).join("");
      rows.forEach(function (r, i) { vs.push(variant(i, '<div class="at-chain"><code>' + esc(r.chain) + "</code></div>", pr + toks)); });
    } else {
      var a = words(O.text), all = a.map(function () { return true; });
      vs.push(variant(0, '<div class="at-chain"><span class="at-lab">original</span><span class="at-same">the model unchanged</span></div>', pr + show(a, all, "ins")));
      rows.forEach(function (r, i) {
        var same = r.text === O.text, b = words(r.text);
        vs.push(variant(i + 1, '<div class="at-chain"><code>' + esc(r.chain) + "</code>" + (same ? ' <span class="at-same">unchanged</span>' : "") + "</div>",
                        pr + show(b, same ? all : diff(a, b)[1], "ins")));
      });
    }
    return '<div class="vx-tgrid">' + vs.join("") + '</div><div class="at-src">GPT-2 small, prompt “' + esc(P.prompt) + "”, seed " + P.seed +
      " · temperature " + P.sampler.temperature + ", top-k " + P.sampler.top_k + ", top-p " + P.sampler.top_p + "</div>";   // which host made them stays in examples.json's provenance
  }

  /* ---------- the units' explainers, and mounting one ---------- */
  var defs = {}, figs = [], io = null, running = false, prev = null, pending = {}, byUnit = {};

  function register(id, def) { defs[id] = def; }
  function has(id) { return Object.prototype.hasOwnProperty.call(defs, id); }
  function caption(id, withExamples) {
    var d = defs[id];
    if (!d) return "";
    var c = d.caption || "";
    if (withExamples && d.examples) c += " Under the figure, GPT-2 small's text (seed 42) at " + d.examples + ", marked where it differs from the original.";
    else if (withExamples && d.meter) c += " Under the figure, the original text (seed 42), with the token the figure has reached marked.";
    return c;
  }
  function loadExamples(src) {             // a URL, or the examples themselves
    if (!src) return Promise.resolve(EX);
    if (typeof src === "object") { EX = src; redrawAll(); return Promise.resolve(EX); }
    if (!pending[src]) {
      pending[src] = root.fetch ? root.fetch(src).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d) { EX = d; redrawAll(); } return EX; }).catch(function () { return EX; }) : Promise.resolve(EX);
    }
    return pending[src];
  }
  function redrawAll() { figs.forEach(function (f) { f.render(); }); }

  function mount(el, id, opts) {
    opts = opts || {};
    var def = defs[id];
    if (!el || !def) return null;
    var title = opts.title || id, withEx = opts.examples !== undefined && opts.examples !== false;
    el.innerHTML = '<figure class="vau-explain" data-unit="' + esc(id) + '">' +
      '<div class="vx-stage"><svg viewBox="0 0 400 210" role="img" aria-label="Animated figure: ' + esc(title) + '"></svg></div>' +
      '<div class="vx-bar"><span class="vx-read"></span><button type="button" class="vx-play" aria-pressed="false">Pause</button></div>' +
      '<div class="vx-texts"></div>' +
      (opts.caption === false ? "" : '<figcaption class="vx-cap">' + caption(id, withEx) + "</figcaption>") + "</figure>";
    var fig = el.firstChild, svg = fig.querySelector("svg");
    var f = { el: fig, id: id, def: def, svg: svg, read: fig.querySelector(".vx-read"), btn: fig.querySelector(".vx-play"), texts: fig.querySelector(".vx-texts"),
              t: reduced ? (def.still || 0) : 0, visible: !("IntersectionObserver" in root), paused: reduced, last: "", lastRead: "", built: null };
    f.render = function () {
      var out = def.draw(f.t, EX) || {};
      if (out.svg !== f.last) { svg.innerHTML = out.svg || ""; f.last = out.svg; }
      if (out.read !== f.lastRead) { f.read.textContent = out.read || ""; f.lastRead = out.read; }
      if (EX && withEx && f.built !== EX) {
        f.texts.innerHTML = textBlocks(id);
        fig.classList.toggle("vx-has-texts", !!f.texts.innerHTML);
        f.built = EX; f.shown = null; f.setting = null; f.tok = null;
      }
      if (f.built && f.texts.innerHTML) {
        var rows = EX.units[id], si = Math.min(out.setting || 0, rows.length - 1), v;
        if (si !== f.setting) { f.setting = si; f.since = f.t; }
        if (rows[0].reading) v = si;
        else v = !reduced && !f.held && f.t - f.since < ORIGINAL_MS ? 0 : si + 1;   // held at a setting: its text at once
        if (v !== f.shown) {
          f.texts.querySelectorAll(".vx-tv").forEach(function (e) {
            var on = +e.getAttribute("data-v") === v;
            e.classList.toggle("on", on);
            e.setAttribute("aria-hidden", on ? "false" : "true");
          });
          f.shown = v;
        }
        if (out.token !== undefined && out.token !== f.tok) {
          f.texts.querySelectorAll("span[data-j]").forEach(function (e) { e.classList.toggle("at-cur", +e.getAttribute("data-j") === out.token); });
          f.tok = out.token;
        }
      }
    };
    f.toggle = function () {
      if (reduced) return;
      f.paused = !f.paused;
      if (!f.paused) f.held = false;
      fig.classList.toggle("vx-paused", f.paused);
      f.btn.textContent = f.paused ? "Play" : "Pause";
      f.btn.setAttribute("aria-pressed", f.paused ? "true" : "false");
      wake();
    };
    if (reduced) f.btn.hidden = true;
    else f.btn.addEventListener("click", f.toggle);
    fig.querySelector(".vx-stage").addEventListener("click", f.toggle);
    f.render();
    figs.push(f);
    if (withEx) loadExamples(opts.examples);
    if (!reduced) {
      if ("IntersectionObserver" in root) {
        if (!io) io = new root.IntersectionObserver(function (es) {
          es.forEach(function (e) { figs.forEach(function (g) { if (g.el === e.target) g.visible = e.isIntersecting; }); });
          wake();
        }, { rootMargin: "40px" });
        io.observe(fig);
      }
      wake();
    }
    if (!byUnit[id]) byUnit[id] = f;
    return {
      figure: fig,
      pause: function () { if (!f.paused) f.toggle(); },
      hold: function (values, params) { return hold(f, values, params); },
      destroy: function () {
        var i = figs.indexOf(f);
        if (i >= 0) figs.splice(i, 1);
        if (byUnit[id] === f) delete byUnit[id];
        if (io) io.unobserve(fig);
        if (fig.parentNode) fig.parentNode.removeChild(fig);
      },
    };
  }
  // every element with data-vau-explain="<unit id>" under root (data-title names the unit)
  function mountAll(rootEl, opts) {
    var out = [];
    (rootEl || root.document).querySelectorAll("[data-vau-explain]").forEach(function (el) {
      var o = {}, k;
      for (k in (opts || {})) o[k] = opts[k];
      if (el.getAttribute("data-title")) o.title = el.getAttribute("data-title");
      var m = mount(el, el.getAttribute("data-vau-explain"), o);
      if (m) out.push(m);
    });
    return out;
  }
  // The clock runs only while some figure is on screen and playing, in a visible page: off screen,
  // paused or in a hidden tab, nothing is drawn and no frame is asked for, so the figures use no CPU.
  function live() { return !root.document.hidden && figs.some(function (f) { return f.visible && !f.paused; }); }
  function wake() { if (!running && live()) { running = true; prev = null; root.requestAnimationFrame(frame); } }
  function frame(now) {
    var dt = prev === null ? 0 : Math.min(100, now - prev);
    prev = now;
    figs.forEach(function (f) { if (f.visible && !f.paused) { f.t += dt; f.render(); } });
    if (live()) root.requestAnimationFrame(frame);
    else { running = false; prev = null; }
  }
  if (root.document) root.document.addEventListener("visibilitychange", wake);

  // hold(values): show the figure at the setting of the unit's example texts nearest to a host's
  // values (a card's), paused, with that setting's text; Play lets it run again. params: the
  // unit's manifest params (for ranges and defaults). Returns the chain line shown, or null.
  function chainParams(chain) {
    var out = {};
    String(chain).split(/\s+/).slice(1).forEach(function (w) { var i = w.indexOf("="); if (i > 0) out[w.slice(0, i)] = w.slice(i + 1); });
    return out;
  }
  function hold(f, values, params) {
    var rows = EX && EX.units[f.id];
    if (!rows || !rows.length) return null;
    var best = 0, bestD = Infinity;
    rows.forEach(function (r, k) {
      var rp = chainParams(r.chain), d = 0;
      (params || []).forEach(function (p) {
        var have = values[p.key] !== undefined ? values[p.key] : p["default"], want = rp[p.key] !== undefined ? rp[p.key] : p["default"];
        if (have === undefined || want === undefined) return;
        if (p.kind === "knob" || p.kind === "fader" || p.kind === "int") d += Math.abs(+have - +want) / ((p.max - p.min) || 1);
        else if (String(have) !== String(want)) d += 1;
      });
      if (d < bestD) { bestD = d; best = k; }
    });
    if (!f.times) {                         // when each setting is on show, found once by stepping the figure's clock
      f.times = {};
      for (var t = 0; t <= 90000; t += 100) {
        var s = (f.def.draw(t, EX) || {}).setting || 0;
        if (!f.times[s]) f.times[s] = [t, t];                      // the first run of steps showing it
        else if (f.times[s][1] === t - 100) f.times[s][1] = t;
      }
    }
    var span = f.times[best];
    if (!span) return null;
    f.t = (span[0] + span[1]) / 2;
    if (!f.paused) f.toggle();
    f.held = true;
    f.render();
    return rows[best].chain;
  }

  var h = { n1: n1, esc: esc, T: T, TM: TM, TE: TE, R: R, L: L, C: C, P: P, arrow: arrow, clamp: clamp, ease: ease, lerp: lerp,
            rnd: rnd, gauss: gauss, f2: f2, sign: sign, stage: stage, cells: cells, arc: arc, BAND: BAND, reduced: reduced };
  root.VAUExplain = { version: "1", register: register, has: has, mount: mount, mountAll: mountAll, caption: caption,
    figure: function (id) { var f = byUnit[id]; return f ? { hold: function (v, p) { return hold(f, v, p); } } : null; },
                      loadExamples: loadExamples, units: function () { return Object.keys(defs); }, h: h };
})(typeof window !== "undefined" ? window : this);

// ---- vau/units/compressor.explain.js
// Vector Abliteration Units: the Norm Shrink unit's explainer, an animated figure of what compressor.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Norm Shrink: per-position sizes over a threshold ---------- */
  X.register("compressor", {
    caption: "Each bar is the stream's size ‖h‖ at one position, against the threshold T (at thresh 1, the "
      + "layer's mean size); the outlines are the sizes before. As the ratio rises, the part of each bar "
      + "above T shrinks by it, <code>n' = T + (n − T) / ratio</code>, and makeup then scales every bar.",
    examples: "ratio 1, 2, 4 and 8, then 8 with makeup 1.5",
    still: 3 * 3000 + 1500, draw: function (t) {
    var n = [0.55, 0.8, 1.6, 0.9, 0.7, 2.3, 1.1, 0.6, 1.9, 0.85, 1.35, 0.75];
    var S = [[1, 1], [2, 1], [4, 1], [8, 1], [8, 1.5]], st = stage(t, 5, 3000, 900), a = S[st.prev], b = S[st.i];
    var ratio = lerp(a[0], b[0], st.k), makeup = lerp(a[1], b[1], st.k);
    var X0 = 44, slot = 29, bw = 17, Y0 = 178, ky = 150 / 3.3, s = "", i;
    function y(v) { return Y0 - v * ky; }
    [2, 3].forEach(function (g) { s += L(X0 - 4, y(g), 394, y(g), "s-soft"); s += TE(36, y(g) + 4, String(g), "f-dim t-xs"); });
    s += L(X0 - 4, Y0, 394, Y0, "s-line");
    for (i = 0; i < n.length; i++) {
      var x = X0 + i * slot + (slot - bw) / 2, out = (n[i] > 1 ? 1 + (n[i] - 1) / ratio : n[i]) * makeup;
      s += R(x, Y0, bw, -out * ky, n[i] > 1 ? "f-acc" : "f-blue", ' opacity="0.82"');
      s += R(x, Y0, bw, -n[i] * ky, "s-ink", ' fill="none" stroke-width="1" stroke-dasharray="3 2" opacity="0.6"');
    }
    s += L(X0 - 4, y(1), 394, y(1), "s-green", ' stroke-width="1.4" stroke-dasharray="6 4"');
    s += TE(36, y(1) + 4, "T", "f-green t-s");
    s += T(8, 16, "‖h‖ / mean ‖h‖ at each position", "f-dim t-xs");
    s += T(X0, 196, "positions →", "f-dim t-xs");
    return { svg: s, read: "ratio " + ratio.toFixed(1) + " · makeup " + f2(makeup) + " · thresh 1    n > T:  n' = T + (n − T) / ratio,  then h' = makeup · h", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/saturator.explain.js
// Vector Abliteration Units: the Tanh Squash unit's explainer, an animated figure of what saturator.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Tanh Squash: a tanh curve, and a position's components through it ---------- */
  X.register("saturator", {
    caption: "Left, the curve each dimension passes through, in units of its spread σ: <code>h' = (1 − mix)·h "
      + "+ mix · L·tanh(h / L)</code>, with <code>L = 3σ / drive</code>. Right, one position's components"
      + " before (outlines) and after: as the drive rises the larger ones are held under ±L, and a lower "
      + "mix brings the straight line back.",
    examples: "drive 0.5, 1, 2 and 6, then 6 at mix 0.5",
    still: 2 * 3000 + 1500, draw: function (t) {
    var S = [[0.5, 1], [1, 1], [2, 1], [6, 1], [6, 0.5]], st = stage(t, 5, 3000, 900), a = S[st.prev], b = S[st.i];
    var drive = Math.exp(lerp(Math.log(a[0]), Math.log(b[0]), st.k)), mix = lerp(a[1], b[1], st.k), Lv = 3 / drive;
    var comp = [2.9, -1.2, 0.4, 3.6, -2.5, 1.7, -0.6, -3.3, 0.9, 2.2, -1.9, 0.2, -3.8, 1.3];
    function sat(x) { return (1 - mix) * x + mix * Lv * Math.tanh(x / Lv); }
    var cx = 104, cy = 108, k = 20, s = "", i, d = "";
    s += R(cx - 80, cy - 80, 160, 160, "f-panel");
    s += L(cx - 80, cy, cx + 80, cy, "s-line") + L(cx, cy - 80, cx, cy + 80, "s-line");
    s += L(cx - 80, cy + 80, cx + 80, cy - 80, "s-dim", ' stroke-dasharray="3 3" stroke-width="1"');
    if (Lv <= 4) {
      s += L(cx - 80, cy - Lv * k, cx + 80, cy - Lv * k, "s-green", ' stroke-dasharray="4 3" stroke-width="1"');
      s += L(cx - 80, cy + Lv * k, cx + 80, cy + Lv * k, "s-green", ' stroke-dasharray="4 3" stroke-width="1"');
      s += T(cx - 77, cy - Lv * k - 3, "+L", "f-green t-xs");
    }
    for (i = 0; i <= 80; i++) { var x = -4 + i * 0.1; d += (i ? " L" : "M") + n1(cx + x * k) + " " + n1(cy - sat(x) * k); }
    s += P(d, "s-acc", ' stroke-width="2.2"');
    comp.forEach(function (v) { s += C(cx + v * k, cy - sat(v) * k, 2.6, "f-acc"); });
    s += T(cx - 80, 20, "h' against h, in σ", "f-dim t-xs");
    var X0 = 216, slot = 12.6, bw = 8;
    s += L(X0 - 4, cy, 394, cy, "s-line");
    comp.forEach(function (v, j) {
      var x = X0 + j * slot;
      s += R(x, cy, bw, -sat(v) * k, "f-acc", ' opacity="0.85"');
      s += R(x, cy, bw, -v * k, "s-ink", ' fill="none" stroke-width="1" stroke-dasharray="3 2" opacity="0.6"');
    });
    s += T(X0 - 4, 20, "one position: before, after", "f-dim t-xs");
    return { svg: s, read: "drive " + drive.toFixed(1) + " → L = 3σ / drive = " + f2(Lv) + "σ · mix " + f2(mix) + "    h' = (1 − mix)·h + mix · L·tanh(h / L)", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/delay.explain.js
// Vector Abliteration Units: the Lookback unit's explainer, an animated figure of what delay.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Lookback: echoes from p − time, with feedback ---------- */
  X.register("delay", {
    caption: "One cell per position at a layer. The highlighted position adds mix times the delay line from "
      + "<i>time</i> positions back, and with feedback that line carries its own earlier echoes, each "
      + "fainter: <code>h'[p] = h[p] + mix · line[p − time]</code>. Position 0, the attention sink, is "
      + "neither changed nor drawn on.",
    examples: "time 4, 3 and 5, with feedback 0.3, 0.6 and 0.45",
    still: 8 * 800, draw: function (t) {
    var cfg = [[4, 0.3], [3, 0.6], [5, 0.45]], c = cfg[Math.floor(t / 12000) % 3], time = c[0], fb = c[1], mix = 0.5;
    var p = 1 + Math.floor((t % 12000) / 800), NP = 16, y = 116, s = "", srcs = [], k;
    function cx(i) { return 26 + i * 23.2; }
    for (k = 1; p - k * time >= 1; k++) srcs.push([p - k * time, mix * Math.pow(fb, k - 1)]);
    srcs.forEach(function (sv) {
      var a = cx(sv[0]), b = cx(p);
      s += arc(a, b, y - 15, Math.min(66, 12 + (b - a) * 0.2), "s-acc", 1 + 3 * sv[1] / mix, clamp(sv[1] / mix, 0.2, 1));
    });
    s = cells(s, y, p, NP, cx, 19, function (i) { for (var j = 0; j < srcs.length; j++) if (srcs[j][0] === i) return srcs[j][1] / mix; return 0; });
    s += TM(cx(0), y + 30, "sink", "f-dim t-xs");
    s += TM(cx(p), y + 30, "p", "f-acc t-s");
    if (srcs.length) s += TM(cx(p - time), y + 30, "p − " + time, "f-acc t-xs");
    s += T(8, 196, "one cell per position →", "f-dim t-xs");
    var terms = srcs.map(function (sv) { return " + " + (sv[1] < 0.1 ? sv[1].toFixed(3) : f2(sv[1])) + "·h[" + sv[0] + "]"; }).join("");
    return { svg: s, read: "time " + time + " · feedback " + fb + " · mix " + mix + "    h'[" + p + "] = h[" + p + "]" + (terms || "   (nothing " + time + " back yet)"), setting: Math.floor(t / 12000) % 3 };
  } });
})(window.VAUExplain);

// ---- vau/units/reverb.explain.js
// Vector Abliteration Units: the Running Average unit's explainer, an animated figure of what reverb.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Running Average: a decaying tail of the earlier positions ---------- */
  X.register("reverb", {
    caption: "The highlighted position adds mix times the tail, a running average of the positions before it. "
      + "The bars under the cells are each earlier position's weight in that tail, which falls by "
      + "<i>decay</i> at each step back: <code>tail[p] = decay · tail[p − 1] + (1 − decay) · h[p]</code>.",
    examples: "decay 0.8, 0.5 and 0.95",
    still: 9 * 800, draw: function (t) {
    var decays = [0.8, 0.5, 0.95], dc = decays[Math.floor(t / 12000) % 3], mix = 0.5;
    var p = 1 + Math.floor((t % 12000) / 800), NP = 16, y = 74, s = "", i;
    function cx(i) { return 26 + i * 23.2; }
    function wt(i) {                          // the weight of h[i] in tail[p − 1]
      if (p < 2 || i < 1 || i > p - 1) return 0;
      return i === 1 ? Math.pow(dc, p - 2) : (1 - dc) * Math.pow(dc, p - 1 - i);
    }
    for (i = 1; i < p; i++) s += arc(cx(i), cx(p), y - 15, Math.min(26, 6 + (cx(p) - cx(i)) * 0.09), "s-acc", 1 + 2 * wt(i), clamp(wt(i), 0.08, 0.9));
    s = cells(s, y, p, NP, cx, 19, wt);
    s += L(10, 160, 394, 160, "s-line");
    for (i = 1; i < p; i++) s += R(cx(i) - 6, 160, 12, -wt(i) * 62, "f-acc", ' opacity="0.85"');
    s += TM(cx(0), y + 30, "sink", "f-dim t-xs");
    s += T(8, 178, "weight of each earlier position in tail[p − 1]", "f-dim t-xs");
    s += T(8, 196, "one cell per position →", "f-dim t-xs");
    var read = "decay " + dc + " · mix " + mix + "    " + (p < 2 ? "position 1 has nothing before it but the sink: unchanged" :
      "h'[" + p + "] = h[" + p + "] + " + mix + " · tail[" + (p - 1) + "],   tail[p] = decay · tail[p − 1] + (1 − decay) · h[p]");
    return { svg: s, read: read, setting: Math.floor(t / 12000) % 3 };
  } });
})(window.VAUExplain);

// ---- vau/units/erosion.explain.js
// Vector Abliteration Units: the Quantise unit's explainer, an animated figure of what erosion.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Quantise: bits and hold over one dimension ---------- */
  X.register("erosion", {
    caption: "One dimension of the stream over 40 positions, in units of its spread σ, the original as a thin "
      + "line. Fewer bits round it to coarser steps, <code>s = 6σ / 2^bits</code>; a hold above 1 repeats"
      + " the first position of each run of <i>hold</i> over the rest. Position 0 is left as it is.",
    examples: "bits 4, 2 and 1, then hold 4 and 8",
    still: 3000 + 1500, draw: function (t) {
    var S = [[4, 1], [2, 1], [1, 1], [16, 4], [16, 8]];
    var st = stage(t, S.length, 3000, 600), cur = S[st.i], prev = S[st.prev], NP = 40, cy = 100, ky = 24, s = "", p, d = "", o = "";
    function sig(q) { return 2.1 * Math.sin(q * 0.23 + 0.4) + 0.75 * Math.sin(q * 0.71 + 1.3) + 0.25 * Math.sin(q * 1.9); }
    function out(c, q) {
      if (q === 0) return sig(0);                                   // the attention sink untouched
      var first = c[1] > 1 ? 1 + Math.floor((q - 1) / c[1]) * c[1] : q, v = sig(first);
      if (c[0] < 16) { var stp = 6 / Math.pow(2, c[0]); v = Math.round(v / stp) * stp; }
      return v;
    }
    function x(q) { return 26 + q * 9.2; }
    if (cur[0] <= 4) { var stp = 6 / Math.pow(2, cur[0]); for (var j = -12; j <= 12; j++) if (Math.abs(j * stp) <= 3.3) s += L(20, cy - j * stp * ky, 392, cy - j * stp * ky, "s-soft"); }
    s += L(20, cy, 392, cy, "s-line");
    for (p = 0; p < NP; p++) o += (p ? " L" : "M") + n1(x(p)) + " " + n1(cy - sig(p) * ky);
    s += P(o, "s-dim", ' stroke-width="1.1"');
    for (p = 0; p < NP; p++) {
      var v = lerp(out(prev, p), out(cur, p), st.k), yy = n1(cy - v * ky);
      d += p ? " V" + yy + " H" + n1(x(p) + 4.6) : "M" + n1(x(0) - 4.6) + " " + yy + " H" + n1(x(0) + 4.6);
    }
    s += P(d, "s-acc", ' stroke-width="2" stroke-linejoin="round"');
    if (cur[1] > 1) for (p = 1; p < NP; p += cur[1]) s += L(x(p) - 4.6, 182, x(p) - 4.6, 190, "s-blue", ' stroke-width="1.5"');
    s += C(x(0), cy - sig(0) * ky, 3, "f-ink");
    s += TM(x(0) + 4, 202, "sink", "f-dim t-xs");
    s += T(8, 14, "one dimension over positions, in σ", "f-dim t-xs");
    var parts = [];
    if (cur[0] < 16) parts.push("bits " + cur[0] + " → s = 6σ / 2^" + cur[0] + " = " + (6 / Math.pow(2, cur[0])).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "σ,  h' = round(h / s) · s");
    if (cur[1] > 1) parts.push("hold " + cur[1] + ":  h'[p] = h[first p of each run of " + cur[1] + "]");
    return { svg: s, read: parts.length ? parts.join("    ") : "bits 16 · hold 1: the stream passes as it is", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/shifter.explain.js
// Vector Abliteration Units: the Rotate unit's explainer, an animated figure of what shifter.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Rotate: a rotation in the plane of e1, e2 ---------- */
  X.register("shifter", {
    caption: "The plane of two directions: e₁ from <i>dir</i>, and e₂ from <i>dir2</i> made orthogonal to e₁ "
      + "(the dashed arrow is dir2 as given). The stream's part in that plane turns by the angle, and on "
      + "the right its other components stay as they were.",
    examples: "angle 45°, 90°, 180° and −90°",
    still: 3000 + 1500, draw: function (t) {
    var AS = [45, 90, 180, -90], st = stage(t, 4, 3000, 1000), a0 = AS[st.prev], dg = ((AS[st.i] - a0 + 540) % 360) - 180;
    var ang = a0 + dg * st.k;
    ang = ang - 360 * Math.ceil((ang - 180) / 360);                // in (−180, 180]
    var O = [118, 112], len = 80, base = 28, s = "", i;
    function pt(deg, r) { var a = deg * Math.PI / 180; return [O[0] + r * Math.cos(a), O[1] - r * Math.sin(a)]; }
    s += L(O[0] - 96, O[1], O[0] + 100, O[1], "s-line") + L(O[0], O[1] + 92, O[0], O[1] - 96, "s-line");
    s += T(O[0] + 86, O[1] + 15, "e₁", "f-ink t-s") + T(O[0] + 7, O[1] - 78, "e₂", "f-ink t-s");
    var d2 = pt(58, 92);
    s += arrow(O[0], O[1], d2[0], d2[1], "s-blue", 1.2).replace('stroke-width="1.2"', 'stroke-width="1.2" stroke-dasharray="4 3"');
    s += L(d2[0], d2[1], d2[0], O[1], "s-blue", ' stroke-width="0.8" stroke-dasharray="2 3" opacity="0.7"');
    s += T(d2[0] + 5, d2[1] + 4, "dir2", "f-blue t-xs");
    var a0 = pt(base, len), a1 = pt(base + ang, len), d = "";
    for (i = 0; i <= 30; i++) { var q = pt(base + ang * i / 30, 30); d += (i ? " L" : "M") + n1(q[0]) + " " + n1(q[1]); }
    s += P(d, "s-acc", ' stroke-width="1.2" opacity="0.8"');
    s += arrow(O[0], O[1], a0[0], a0[1], "s-dim", 1.5);
    s += arrow(O[0], O[1], a1[0], a1[1], "s-acc", 2.6);
    s += C(O[0], O[1], 2.5, "f-ink");
    s += T(8, 16, "the stream's part in the plane", "f-dim t-xs");
    var ca = Math.cos(base * Math.PI / 180), sb = Math.sin(base * Math.PI / 180);
    var r = ang * Math.PI / 180, na = ca * Math.cos(r) - sb * Math.sin(r), nb = ca * Math.sin(r) + sb * Math.cos(r);
    var rest = [0.35, -0.5, 0.2, 0.62, -0.28, -0.12, 0.44, -0.4], X0 = 252, cy = 112, k = 60, bars = [na, nb].concat(rest), orig = [ca, sb].concat(rest);
    s += L(X0 - 4, cy, 394, cy, "s-line");
    bars.forEach(function (v, j) {
      var x = X0 + j * 14.5 + (j > 1 ? 6 : 0);
      s += R(x, cy, 9, -v * k, j < 2 ? "f-acc" : "f-blue", ' opacity="0.85"');
      if (j < 2) s += R(x, cy, 9, -orig[j] * k, "s-ink", ' fill="none" stroke-width="1" stroke-dasharray="3 2" opacity="0.6"');
    });
    s += TM(X0 + 4.5, 196, "e₁", "f-acc t-xs") + TM(X0 + 19, 196, "e₂", "f-acc t-xs");
    s += T(X0 + 34, 196, "rest of h, kept", "f-blue t-xs");
    return { svg: s, read: "angle " + String(Math.round(ang)).replace("-", "−") + "°    (h·e₁, h·e₂) = (" + f2(ca) + ", " + f2(sb) + ") → (" + sign(na) + ", " + sign(nb) + "),  the rest of h kept", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/eq.explain.js
// Vector Abliteration Units: the Principal Bands unit's explainer, an animated figure of what eq.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Principal Bands: gains on three bands of principal directions ---------- */
  var D = 768, NB = 60, IDX = [];
  (function () { for (var i = 0; i < NB; i++) { var r = Math.round(Math.exp(Math.log(D) * i / (NB - 1))); if (!IDX.length || IDX[IDX.length - 1] !== r) IDX.push(r); } })();
  function lx(r) { return 30 + 362 * Math.log(r) / Math.log(D); }
  function bandOf(r) { return r <= 8 ? 0 : r <= 64 ? 1 : 2; }
  X.register("eq", {
    caption: "The stream less its corpus mean, along the layer's principal directions ranked by spread (log "
      + "scale, the 768 of GPT-2 small); the outlines are the stream as it was. Each band is multiplied "
      + "by its gain: <code>h' = h + (gain − 1) · x Vᵀ V</code> over that band's directions.",
    examples: "one band at a time at gain 0 or 2",
    still: 3000 + 1500, draw: function (t) {
    var GS = [[0, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 0], [1, 1, 2]], st = stage(t, 5, 3000, 900), ga = GS[st.prev], gb = GS[st.i];
    var g = [0, 1, 2].map(function (b) { return lerp(ga[b], gb[b], st.k); });
    var Y0 = 172, s = "", names = ["low", "mid", "high"], cuts = [[1, 8], [9, 64], [65, 768]];
    cuts.forEach(function (c, b) {
      var xa = lx(c[0]) - 3, xb = lx(c[1]) + 3;
      s += R(xa, 30, xb - xa, Y0 - 30, BCLS[b], ' opacity="0.07"');
      s += T(xa + 3, 24, names[b] + " ×" + f2(g[b]), BCLS[b] + " t-s");
    });
    s += L(26, Y0, 396, Y0, "s-line");
    IDX.forEach(function (r, i) {
      var base = Math.pow(r, -0.42) * 74 * (1 + (reduced ? 0 : 0.06 * Math.sin(t / 700 + i * 1.7))), b = bandOf(r), x = lx(r) - 2.2;
      s += R(x, Y0, 4.4, -Math.min(140, base * g[b]), BCLS[b], ' opacity="0.85"');
      s += R(x, Y0, 4.4, -base, "s-ink", ' fill="none" stroke-width="0.7" opacity="0.55"');
    });
    [1, 8, 64, 768].forEach(function (r) { s += L(lx(r), Y0, lx(r), Y0 + 4, "s-dim") + TM(lx(r), Y0 + 15, String(r), "f-dim t-xs"); });
    s += T(8, 202, "principal direction, ranked by spread (log scale)", "f-dim t-xs");
    return { svg: s, read: "low " + f2(g[0]) + " · mid " + f2(g[1]) + " · high " + f2(g[2]) + "    x = h − μ;  h' = h + Σ (gain − 1) · x Vᵀ V over each band", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/beatrepeat.explain.js
// Vector Abliteration Units: the Position Repeat unit's explainer, an animated figure of what beatrepeat.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Position Repeat: the last positions of each run replayed ---------- */
  X.register("beatrepeat", {
    caption: "Top, the stream at each position, each cell's marks standing for its content; bottom, after the "
      + "unit. From position 1 the positions are taken in runs of <i>interval</i>, and over the last "
      + "<i>length</i> of each run the stream is replaced by that of the <i>length</i> positions just "
      + "before: <code>h'[p] = (1 − mix) h[p] + mix · h[p − length]</code>.",
    examples: "interval 8, 6 and 4, with length 2, 3 and 1",
    still: 7 * 420 + 200, draw: function (t) {
    var cfg = [[8, 2], [6, 3], [4, 1]], STEP = 420, cyc = 24 * STEP, c = cfg[Math.floor(t / cyc) % 3], interval = c[0], length = Math.min(c[1], interval - 1);
    var p = 1 + Math.floor((t % cyc) / STEP), NP = 25, s = "", i, j;
    function cx(q) { return 18 + q * 15.1; }
    function rep(q) { return q >= 1 && (q - 1) % interval >= interval - length && q - length >= 1; }
    function glyph(at, q, y, cls) { var g = ""; for (j = 0; j < 3; j++) g += R(cx(at) - 4.8 + j * 3.4, y, 2.4, -(4 + 18 * rnd(q * 3 + j + 40)), cls); return g; }
    for (i = 1; i < NP; i += interval) s += L(cx(i) - 7.5, 76, cx(i) - 7.5, 130, "s-line", ' stroke-dasharray="2 3"');
    for (i = 0; i < NP; i++) if (rep(i)) {
      var a = cx(i - length), b = cx(i), on = i === p;
      s += P("M" + n1(a) + " 72 C" + n1(a) + " 104 " + n1(b) + " 102 " + n1(b) + " 134", "s-blue", ' stroke-width="' + (on ? 2.2 : 1) + '" opacity="' + (on ? 1 : 0.35) + '"');
    }
    for (i = 0; i < NP; i++) {
      var sink = i === 0, cur = i === p, r = rep(i), st = sink ? ' style="stroke:var(--vx-dim);stroke-dasharray:2 2"' : "";
      s += R(cx(i) - 6.5, 40, 13, 32, "f-panel", ' rx="2"' + (cur ? ' style="stroke:var(--vx-acc);stroke-width:1.5"' : st));
      s += glyph(i, i, 68, "f-ink");
      s += R(cx(i) - 6.5, 134, 13, 32, "f-panel", ' rx="2"' + (cur ? ' style="stroke:var(--vx-acc);stroke-width:1.5"' : r ? ' style="stroke:var(--vx-blue)"' : st));
      s += glyph(i, r ? i - length : i, 162, r ? "f-blue" : "f-ink");
    }
    s += T(8, 30, "h, the stream at each position", "f-dim t-xs");
    s += T(8, 182, "h', after beat repeat", "f-dim t-xs");
    s += TM(cx(0), 196, "sink", "f-dim t-xs") + TM(cx(p), 196, String(p), "f-acc t-xs");
    var read = "interval " + interval + " · length " + length + " · mix 1    " + (rep(p) ? "position " + p + " is in the last " + length + " of its run:  h'[" + p + "] = h[" + (p - length) + "]" : "position " + p + " passes as it is");
    return { svg: s, read: read, setting: Math.floor(t / cyc) % 3 };
  } });
})(window.VAUExplain);

// ---- vau/units/gate.explain.js
// Vector Abliteration Units: the Sparsify unit's explainer, an animated figure of what gate.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Sparsify: only the largest ⌈keep · d⌉ components pass ---------- */
  var GV = [], GR = [];
  (function () {
    for (var i = 0; i < 32; i++) GV.push(gauss(i + 5) * 1.05);
    GV[6] = 3.1; GV[21] = -2.8;
    var order = GV.map(function (v, i) { return i; }).sort(function (a, b) { return Math.abs(GV[b]) - Math.abs(GV[a]); });
    order.forEach(function (i, r) { GR[i] = r; });
  })();
  X.register("gate", {
    caption: "One position's components (32 drawn of GPT-2 small's 768). Only the ⌈keep · d⌉ largest in size "
      + "pass and the rest fall to zero; the dashed lines mark the smallest size still kept. Position 0, "
      + "the attention sink, is left alone unless <i>sink too</i> is on.",
    examples: "keep 1, 0.5, 0.25 and 0.1",
    still: 2 * 3000 + 1500, draw: function (t) {
    var keeps = [1, 0.5, 0.25, 0.1], st = stage(t, keeps.length, 3000, 600);
    var d = 32, kc = Math.ceil(keeps[st.i] * d), kp = Math.ceil(keeps[st.prev] * d), cy = 104, ky = 26, s = "";
    s += L(20, cy, 394, cy, "s-line");
    if (kc < d) {
      var lim = Math.abs(GV[GR.indexOf(kc - 1)]);
      s += L(20, cy - lim * ky, 394, cy - lim * ky, "s-green", ' stroke-width="1" stroke-dasharray="4 3"');
      s += L(20, cy + lim * ky, 394, cy + lim * ky, "s-green", ' stroke-width="1" stroke-dasharray="4 3"');
    }
    GV.forEach(function (v, i) {
      var inC = GR[i] < kc, inP = GR[i] < kp, sc = inC ? (inP ? 1 : st.k) : (inP ? 1 - st.k : 0), x = 24 + i * 11.6;
      if (sc < 1) s += R(x, cy, 7.5, -v * ky, "s-ink", ' fill="none" stroke-width="0.8" stroke-dasharray="2 2" opacity="0.45"');
      s += R(x, cy, 7.5, -v * sc * ky, inC ? "f-acc" : "f-dim", ' opacity="0.85"');
    });
    s += T(8, 16, "one position's components hᵢ (32 drawn)", "f-dim t-xs");
    var keep = keeps[st.i];
    return { svg: s, read: keep >= 1 ? "keep 1: every component passes" :
      "keep " + keep + ":  the ⌈keep · d⌉ largest |hᵢ| pass,  " + kc + " of the 32 drawn (" + Math.ceil(keep * 768) + " of 768 in GPT-2 small),  the rest set to 0", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/limiter.explain.js
// Vector Abliteration Units: the Component Clamp unit's explainer, an animated figure of what limiter.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Component Clamp: clamp at a quantile of the sizes ---------- */
  var LV = [];
  (function () { for (var i = 0; i < 64; i++) LV.push(gauss(i + 400)); LV[9] = 6.2; LV[37] = -4.6; LV[52] = 3.4; })();
  function quantile(a, q) {                 // as torch.quantile: linear between the ranked values
    var s = a.slice().sort(function (x, y) { return x - y; }), pos = q * (s.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }
  X.register("limiter", {
    caption: "One position's components (64 drawn), a few of them very large. The limit is the <i>ceiling</i> "
      + "quantile of their sizes, <code>L = quantile(|h|, ceiling)</code>, and every component past ±L is"
      + " clamped to it with its sign kept; the outlines show what was cut.",
    examples: "ceiling 1, 0.99, 0.95 and 0.9",
    still: 2 * 3000 + 1500, draw: function (t) {
    var QS = [1, 0.99, 0.95, 0.9], st = stage(t, 4, 3000, 900), q = lerp(QS[st.prev], QS[st.i], st.k), lim = quantile(LV.map(Math.abs), q), cy = 104, ky = 13.5, s = "", nc = 0;
    s += L(20, cy, 394, cy, "s-line");
    s += L(20, cy - lim * ky, 394, cy - lim * ky, "s-green", ' stroke-width="1.2" stroke-dasharray="5 3"');
    s += L(20, cy + lim * ky, 394, cy + lim * ky, "s-green", ' stroke-width="1.2" stroke-dasharray="5 3"');
    s += T(6, cy - lim * ky + 3, "L", "f-green t-xs") + T(2, cy + lim * ky + 3, "−L", "f-green t-xs");
    LV.forEach(function (v, i) {
      var c = clamp(v, -lim, lim), x = 24 + i * 5.8, cut = Math.abs(v) > lim + 1e-9;
      if (cut) { nc++; s += R(x, cy, 4, -v * ky, "s-red", ' fill="none" stroke-width="0.9" stroke-dasharray="2 1.5"'); }
      s += R(x, cy, 4, -c * ky, cut ? "f-acc" : "f-blue", ' opacity="0.85"');
    });
    s += T(16, 16, "one position's components hᵢ (64 drawn)", "f-dim t-xs");
    return { svg: s, read: q >= 0.9995 ? "ceiling 1: L is the largest |hᵢ|, nothing clamped" :
      "ceiling " + q.toFixed(3) + " → L = quantile(|h|, " + q.toFixed(3) + ") = " + f2(lim) + ":  " + nc + " of 64 clamped,  h' = clamp(h, −L, L)", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/multiband.explain.js
// Vector Abliteration Units: the Band Shrink unit's explainer, an animated figure of what multiband.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Band Shrink: each band compressed above its own limit ---------- */
  X.register("multiband", {
    caption: "The size of the stream's part in each band at six positions, each band with its own limit "
      + "<code>L_b = thresh × typical ‖band b‖</code>. In the band or bands chosen, the part above the "
      + "limit shrinks by the ratio, <code>n' = L_b + (n − L_b) / ratio</code>; the others pass "
      + "unchanged.",
    examples: "ratio 8 in each choice of band",
    still: 3500 + 1700, draw: function (t) {
    var choices = ["all", "low", "mid", "high"], st = stage(t, 4, 3500, 900), band = choices[st.i], ratio = 8;
    function chosen(c, b) { return c === "all" || c === ["low", "mid", "high"][b]; }
    var typ = [2.6, 1.7, 1.1], f = [[1.5, 0.7, 1.9, 1.1, 0.6, 1.3], [0.8, 1.7, 1.2, 0.5, 1.45, 0.9], [1.2, 0.6, 1.0, 1.8, 0.75, 1.55]];
    var names = ["low · V₁₋₈", "mid · V₉₋₆₄", "high · V₆₅₊"], Y0 = 176, ky = 30, s = "";
    s += L(14, Y0, 396, Y0, "s-line");
    for (var b = 0; b < 3; b++) {
      var on = chosen(band, b), amt = lerp(chosen(choices[st.prev], b) ? 1 : 0, on ? 1 : 0, st.k), gx = 20 + b * 127, Lb = typ[b];
      for (var i = 0; i < 6; i++) {
        var nv = typ[b] * f[b][i], out = nv > Lb ? lerp(nv, Lb + (nv - Lb) / ratio, amt) : nv, x = gx + i * 19;
        s += R(x, Y0, 12, -out * ky, BCLS[b], ' opacity="' + (on ? 0.85 : 0.35) + '"');
        s += R(x, Y0, 12, -nv * ky, "s-ink", ' fill="none" stroke-width="1" stroke-dasharray="3 2" opacity="0.55"');
      }
      s += L(gx - 3, Y0 - Lb * ky, gx + 112, Y0 - Lb * ky, "s-ink", ' stroke-width="1.2" stroke-dasharray="5 3" opacity="' + (on ? 0.9 : 0.4) + '"');
      s += T(gx - 2, Y0 - Lb * ky - 4, "L", "f-ink t-xs");
      s += T(gx - 2, Y0 + 15, names[b], BCLS[b] + " t-xs", on ? "" : ' opacity="0.6"');
    }
    s += T(8, 16, "‖band b‖ at six positions", "f-dim t-xs");
    return { svg: s, read: "band " + band + " · ratio " + ratio + " · thresh 1    per band b:  n > L_b:  n' = L_b + (n − L_b) / ratio,  L_b = thresh × typical ‖band b‖", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/morph.explain.js
// Vector Abliteration Units: the Morph unit's explainer, an animated figure of what morph.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Morph: one side of the texts moved toward the other ---------- */
  var MT = [], MM = [], MK = [], MD = [], MN = [];
  (function () {
    var i;
    for (i = 0; i < 10; i++) MT.push([250 + gauss(i + 600) * 22, 72 + gauss(i + 650) * 16]);
    for (i = 0; i < 10; i++) MM.push([104 + gauss(i + 700) * 22, 150 + gauss(i + 750) * 14]);
    for (i = 0; i < 9; i++) MK.push([170 + rnd(i + 800) * 210, 120 + rnd(i + 850) * 70]);
    var mx = 0, my = 0;
    MM.forEach(function (m) { mx += m[0] / MM.length; my += m[1] / MM.length; });
    MM.forEach(function (m) {
      var near = MT.map(function (q, j) { return [Math.hypot(q[0] - m[0], q[1] - m[1]), j]; }).sort(function (a, b) { return a[0] - b[0]; }).slice(0, 3).map(function (e) { return e[1]; });
      var cx = 0, cy = 0; near.forEach(function (j) { cx += MT[j][0] / 3; cy += MT[j][1] / 3; });
      MN.push(near); MD.push([(cx + 0.6 * (m[0] - mx) - m[0]) * 0.85, (cy + 0.6 * (m[1] - my) - m[1]) * 0.85]);
    });
  })();
  X.register("morph", {
    caption: "What a block writes on each side of a direction's texts, drawn in two dimensions. With "
      + "<code>move=away</code> the fitted change pulls each output on the positive texts toward its "
      + "nearest outputs on the negative texts, while those and the reference texts stay where they were;"
      + " amount scales the change, <code>y' = y + amount · (x Aᵀ) Bᵀ</code>.",
    examples: "amount 0.5, 1 and 2",
    still: 3500 + 1750, draw: function (t) {
    var AM = [0.5, 1, 2], st = stage(t, 3, 3500, 1200), amount = lerp(AM[st.prev], AM[st.i], st.k), s = "";
    MK.forEach(function (q) { s += C(q[0], q[1], 3, "f-green", ' opacity="0.8"'); });
    MT.forEach(function (q) { s += C(q[0], q[1], 3.4, "f-blue"); });
    MM.forEach(function (m, i) {
      var x = m[0] + amount * MD[i][0], y = m[1] + amount * MD[i][1];
      MN[i].forEach(function (j) { s += L(x, y, MT[j][0], MT[j][1], "s-acc", ' stroke-width="0.7" opacity="0.18"'); });
      s += C(m[0], m[1], 3.2, "s-acc", ' fill="none" stroke-width="1" opacity="0.5"');
      s += C(x, y, 3.4, "f-acc");
    });
    s += C(14, 16, 3.4, "f-acc") + T(22, 19.5, "positive texts, moved", "f-acc t-xs");
    s += C(14, 31, 3.4, "f-blue") + T(22, 34.5, "negative texts, held", "f-blue t-xs");
    s += C(14, 46, 3, "f-green") + T(22, 49.5, "reference texts, held", "f-green t-xs");
    s += T(8, 202, "what a block writes on each text's tokens, in two dimensions", "f-dim t-xs");
    return { svg: s, read: "move away · neighbours 3 · amount " + f2(amount) + "    y' = y + amount · (x Aᵀ) Bᵀ,  A: rank × in,  B: out × rank, fitted once", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/abliterate.explain.js
// Vector Abliteration Units: the Abliterate unit's explainer, an animated figure of what abliterate.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Abliterate: removal along v, with a strength kernel over the blocks ---------- */
  function kernel(n, shape, peak, width, edge) {         // as kernel() in abliterate.py
    var last = Math.max(1, n - 1), p = peak * last, w = Math.max(1e-6, width * last), out = [];
    for (var l = 0; l < n; l++) {
      var d = Math.abs(l - p);
      if (shape === "flat") out.push(1);
      else if (d > w + 1e-9) out.push(0);
      else if (shape === "bell") { var e = edge > 0 ? edge : 0.1; out.push(e < 1 ? Math.exp(Math.log(e) * Math.pow(d / w, 2)) : 1); }
      else out.push(1 + (d / w) * (edge - 1));
    }
    return out;
  }
  var SHAPES = ["linear", "bell", "flat"], KER = SHAPES.map(function (sh) { return kernel(12, sh, 0.7, 0.4, 0.3); });
  X.register("abliterate", {
    caption: "Right, the strength over GPT-2 small's 12 blocks at peak 0.7, width 0.4 and edge 0.3, for each "
      + "shape in turn: attention in amber, the MLPs at share 0.5 in blue. Left, at the block "
      + "highlighted, what attention writes loses s times its component along v: <code>y' = (I − s vvᵀ) "
      + "y</code>.",
    examples: "each shape, with the negation direction",
    still: 7 * 650 + 400, draw: function (t) {
    var STEP = 650, cyc = 12 * STEP, si = Math.floor(t / cyc) % 3, l = Math.floor((t % cyc) / STEP), k = KER[si], share = 0.5;
    var sPrev = l > 0 ? k[l - 1] : KER[(si + 2) % 3][11], sv = lerp(sPrev, k[l], ease((t % STEP) / 260)), s = "";
    // left: y and y' = (I − s vvᵀ) y
    var O = [74, 128], va = -12 * Math.PI / 180, v = [Math.cos(va), -Math.sin(va)], ya = 64 * Math.PI / 180, y = [84 * Math.cos(ya), -84 * Math.sin(ya)];
    var c = y[0] * v[0] + y[1] * v[1], yp = [y[0] - sv * c * v[0], y[1] - sv * c * v[1]];
    s += L(O[0] - 64 * v[0], O[1] - 64 * v[1], O[0] + 100 * v[0], O[1] + 100 * v[1], "s-acc", ' stroke-width="1.1" stroke-dasharray="6 4"');
    s += T(O[0] + 92 * v[0] - 4, O[1] + 92 * v[1] + 16, "v", "f-acc t-s");
    s += L(O[0], O[1], O[0] + sv * c * v[0], O[1] + sv * c * v[1], "s-acc", ' stroke-width="6" stroke-linecap="round" opacity="0.45"');
    s += L(O[0] + y[0], O[1] + y[1], O[0] + c * v[0], O[1] + c * v[1], "s-dim", ' stroke-width="1" stroke-dasharray="3 3"');
    s += arrow(O[0], O[1], O[0] + y[0], O[1] + y[1], "s-ink", 1.8) + T(O[0] + y[0] + 6, O[1] + y[1] + 2, "y", "f-ink t-s");
    s += arrow(O[0], O[1], O[0] + yp[0], O[1] + yp[1], "s-green", 2.6) + T(O[0] + yp[0] - 18, O[1] + yp[1] - 4, "y'", "f-green t-s");
    s += C(O[0], O[1], 2.5, "f-ink");
    s += T(8, 16, "at block " + l + ": s = " + f2(sv), "f-dim t-xs");
    // right: the kernel
    var X0 = 186, slot = 17.2, Y0 = 172, Hh = 118;
    s += R(X0 + l * slot - 1, 40, slot - 1, Y0 - 40 + 2, "f-panel");
    s += L(X0 - 3, Y0, 396, Y0, "s-line") + L(X0 - 3, Y0 - Hh, 396, Y0 - Hh, "s-soft");
    s += TE(X0 - 5, Y0 - Hh + 3, "1", "f-dim t-xs");
    for (var b = 0; b < 12; b++) {
      var x = X0 + b * slot;
      s += R(x + 2, Y0, 7, -k[b] * Hh, "f-acc", ' opacity="' + (b === l ? 1 : 0.65) + '"');
      s += R(x + 9.5, Y0, 5, -k[b] * share * Hh, "f-blue", ' opacity="' + (b === l ? 1 : 0.65) + '"');
    }
    s += L(X0 + 0.7 * 11 * slot + 8, 38, X0 + 0.7 * 11 * slot + 8, Y0, "s-dim", ' stroke-width="0.8" stroke-dasharray="2 3"');
    [0, 6, 11].forEach(function (b) { s += TM(X0 + b * slot + 8, Y0 + 14, String(b), "f-dim t-xs"); });
    s += T(X0, 28, "shape " + SHAPES[si] + " · peak 0.7", "f-ink t-s");
    s += T(X0, 202, "blocks → (attention, MLP)", "f-dim t-xs");
    return { svg: s, read: "block " + l + " · " + SHAPES[si] + " kernel · s = strength × kernel(l) = " + f2(k[l]) + " attention, " + f2(k[l] * share) + " MLP    y' = (I − s vvᵀ) y", setting: si };
  } });
})(window.VAUExplain);

// ---- vau/units/neuron.explain.js
// Vector Abliteration Units: the Neuron unit's explainer, an animated figure of what neuron.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Neuron: one MLP neuron's activation edited ---------- */
  var OPS = [["zero"], ["flip"], ["set", -0.8], ["add", 1], ["set", 20]];
  function applyOp(o, a) {
    switch (o[0]) {
      case "scale": return a * o[1];
      case "add": return a + o[1];
      case "set": return o[1];
      case "zero": return 0;
      case "flip": return -a;
      default: return clamp(a, -Math.abs(o[1]), Math.abs(o[1]));
    }
  }
  function gelu(x) { return 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x))); }
  X.register("neuron", {
    caption: "Twelve of the 3,072 activations of a GPT-2 small MLP, with neuron 373 named. The operation acts "
      + "on that neuron's activation where the output projection reads it, in turn zero, flip, set and "
      + "add; the lines below are its column of the projection, what it writes into the stream.",
    examples: "each operation",
    still: 3 * 3200 + 1600, draw: function (t) {
    var st = stage(t, OPS.length, 3200, 500), o = OPS[st.i], op = OPS[st.prev], NI = 12, NAMED = 4, cy = 92, ky = 30, s = "", i;
    function x(j) { return 46 + j * 28; }
    s += L(30, cy, 370, cy, "s-line");
    s += R(40, 176, 320, 20, "f-panel", ' rx="3"') + TM(200, 189.5, "the stream: what the MLP writes", "f-dim t-xs");
    var a373 = 0.55 + 0.45 * Math.sin(t / 1100), edited = lerp(applyOp(op, a373), applyOp(o, a373), st.k);
    for (i = 0; i < NI; i++) {
      var named = i === NAMED, a = named ? edited : gelu(1.1 * Math.sin(t / 1300 + i * 1.9) + 0.5 * Math.sin(t / 530 + i * 0.7) + 0.2);
      for (var f = 0; f < 4; f++) {
        var tx = 70 + (i * 4 + f) * 5.6;
        s += L(x(i), 154, tx, 176, named ? "s-acc" : "s-line", named ? ' stroke-width="' + n1(0.4 + 1.6 * Math.min(1.5, Math.abs(a))) + '" opacity="0.8"' : ' stroke-width="0.6"');
      }
      s += C(x(i), 150, 4, named ? "f-acc" : "f-dim");
      if (named) s += R(x(i) - 6, cy, 12, -a373 * ky, "s-ink", ' fill="none" stroke-width="1" stroke-dasharray="3 2" opacity="0.7"');
      var shown = clamp(a, -2.4, 2.4);
      s += R(x(i) - 6, cy, 12, -shown * ky, named ? "f-acc" : "f-blue", ' opacity="' + (named ? 0.95 : 0.55) + '"');
      if (shown !== a) s += T(x(i) + 9, cy - shown * ky + 9, (a > 0 ? "↑ " : "↓ ") + a.toFixed(1), "f-acc t-xs");
    }
    s += TM(x(NAMED), 141, "373", "f-acc t-xs");
    s += T(8, 16, "MLP activations a, after the nonlinearity (12 of 3,072)", "f-dim t-xs");
    var name = o[0] + (o.length > 1 ? ", value " + String(o[1]).replace("-", "−") : ""), form = { scale: "a · v", add: "a + v", set: "v", zero: "0", flip: "−a", clamp: "clamp(a, −|v|, |v|)" }[o[0]];
    return { svg: s, read: "n=373 · op " + name + ":  a[..., 373] → " + form + "    (" + sign(a373) + " → " + sign(applyOp(o, a373)) + ")", setting: st.i };
  } });
})(window.VAUExplain);

// ---- vau/units/entropy.explain.js
// Vector Abliteration Units: the Entropy unit's explainer, an animated figure of what entropy.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Entropy (a meter): bits at each token of the original text ---------- */
  // The readings are the meter's own, from the run in unit-texts.json.
  X.register("entropy", {
    caption: "The meter's reading at each token of GPT-2 small's original text: the entropy of the model's "
      + "next-token distribution, <code>H = −Σ p log₂ p</code>, in bits, 0 when it is sure of the next "
      + "token and about 15.6 if all 50,257 tokens were equally likely. The meter changes nothing.",
    meter: true,
    still: 3 * 900 + 300, draw: function (t, D) {
    var H = D ? D.units.entropy[0].reading : [], toks = D ? D.original.tokens : [], N = H.length || 30, j = Math.floor(t / 900) % N;
    var X0 = 34, slot = 358 / N, Y0 = 168, top = 46, MAX = 12, s = "", i;
    function hy(h) { return Y0 - h / MAX * (Y0 - top); }
    [0, 4, 8, 12].forEach(function (b) { s += L(X0 - 4, hy(b), 394, hy(b), b ? "s-soft" : "s-line"); s += TE(X0 - 7, hy(b) + 3, String(b), "f-dim t-xs"); });
    for (i = 0; i < H.length; i++) {
      var cur = i === j;
      s += R(X0 + i * slot + 1, Y0, slot - 2.4, -(H[i] / MAX) * (Y0 - top), cur ? "f-acc" : "f-green", ' opacity="' + (cur ? 1 : i < j ? 0.75 : 0.3) + '"');
    }
    if (H.length) {
      s += T(8, 22, "H = " + H[j].toFixed(2) + " bits", "f-ink t-m");
      s += TM(clamp(X0 + j * slot + slot / 2, 40, 360), 186, JSON.stringify(toks[j]).slice(1, -1).replace(/\\n/g, "↵"), "f-acc t-s");
    }
    s += T(8, 38, "bits, at each token of the original text", "f-dim t-xs");
    s += T(X0 - 4, 204, "tokens →", "f-dim t-xs");
    return { svg: s, setting: 0, token: j, read: H.length ? "token " + (j + 1) + " of " + N + ":  H = −Σ p log₂ p = " + H[j].toFixed(2) +
      " bits    (0 when the model is sure of the next token;  15.6 if all 50,257 were equally likely)" : "H = −Σ p log₂ p, in bits" };
  } });
})(window.VAUExplain);

// ---- vau/units/peakshare.explain.js
// Vector Abliteration Units: the Peak share unit's explainer, an animated figure of what peakshare.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Peak share (a meter): the share of the size in the top k ---------- */
  var PV = [];
  (function () { for (var i = 0; i < 32; i++) PV.push(gauss(i + 1200)); PV[11] = 4.2; PV[25] = -2.9; })();
  X.register("peakshare", {
    caption: "Left, one position's squared components (32 drawn), the k largest in amber. Right, the meter's "
      + "reading at layer 6 for each token of GPT-2 small's original text, <code>Σ top-k hᵢ² / Σ hᵢ² × "
      + "100</code>, as k steps from 1 to 16; it changes nothing.",
    meter: true,
    still: 3 * 4200 + 4 * 700 + 300, draw: function (t, D) {
    var ks = [1, 2, 4, 8, 16], st = stage(t, 5, 4200, 600), k = ks[st.i], rows = D ? D.units.peakshare : null, toks = D ? D.original.tokens : [];
    var N = rows ? rows[0].reading.length : 30, j = Math.floor(t / 700) % N, s = "", Y0 = 168, Hh = 122, i;
    // left: one position's squared components, drawn, the k largest in amber
    var sq = PV.map(function (v) { return v * v; }), mx = Math.max.apply(null, sq);
    var rank = sq.map(function (v, i) { return i; }).sort(function (a, b) { return sq[b] - sq[a]; }), top = {};
    for (i = 0; i < k; i++) top[rank[i]] = 1;
    s += L(12, Y0, 186, Y0, "s-line");
    sq.forEach(function (v, i) { s += R(16 + i * 5.3, Y0, 3.6, -v / mx * Hh, top[i] ? "f-acc" : "f-blue", ' opacity="' + (top[i] ? 0.95 : 0.5) + '"'); });
    s += T(8, 22, "k = " + k, "f-ink t-m");
    s += T(8, 38, "hᵢ² at one position, drawn", "f-dim t-xs");
    // right: the meter's reading at each token of the original text, for this k
    var X0 = 214, slot = 178 / N;
    s += L(X0 - 4, Y0, 394, Y0, "s-line") + L(X0 - 4, Y0 - Hh, 394, Y0 - Hh, "s-soft");
    s += TE(X0 - 6, Y0 - Hh + 3, "100%", "f-dim t-xs") + TE(X0 - 6, Y0 + 3, "0", "f-dim t-xs");
    if (rows) {
      var a = rows[st.prev].reading, b = rows[st.i].reading;
      for (i = 0; i < N; i++) {
        var v = lerp(a[i], b[i], st.k), cur = i === j;
        s += R(X0 + i * slot + 0.6, Y0, slot - 1.6, -v / 100 * Hh, cur ? "f-acc" : "f-green", ' opacity="' + (cur ? 1 : 0.6) + '"');
      }
      s += T(X0, 22, b[j].toFixed(1) + "%", "f-ink t-m");
      s += TM(clamp(X0 + j * slot + slot / 2, X0 + 14, 380), 186, JSON.stringify(toks[j]).slice(1, -1).replace(/\\n/g, "↵"), "f-acc t-s");
    }
    s += T(X0, 38, "GPT-2 small, layer 6, each token", "f-dim t-xs");
    s += T(X0 - 4, 204, "tokens →", "f-dim t-xs");
    return { svg: s, setting: st.i, token: j, read: rows ? "k " + k + " · token " + (j + 1) + " of " + N + ":  Σ top-k hᵢ² / Σ hᵢ² × 100 = " + rows[st.i].reading[j].toFixed(1) + "%" : "Σ top-k hᵢ² / Σ hᵢ² × 100" };
  } });
})(window.VAUExplain);

// ---- the units page: draw every explainer, with the example texts
VAUExplain.mountAll(document, { examples: "unit-texts.json" });
