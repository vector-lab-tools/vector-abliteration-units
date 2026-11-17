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
