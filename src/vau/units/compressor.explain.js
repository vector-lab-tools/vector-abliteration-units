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
