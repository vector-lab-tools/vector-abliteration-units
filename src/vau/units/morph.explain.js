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
