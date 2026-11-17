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
