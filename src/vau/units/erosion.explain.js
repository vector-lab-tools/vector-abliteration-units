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
