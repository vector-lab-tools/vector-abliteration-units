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
