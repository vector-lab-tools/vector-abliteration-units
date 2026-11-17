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
