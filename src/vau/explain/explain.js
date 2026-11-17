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
