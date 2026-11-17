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
