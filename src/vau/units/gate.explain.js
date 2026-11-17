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
