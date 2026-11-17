// Vector Abliteration Units: the Running Average unit's explainer, an animated figure of what reverb.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Running Average: a decaying tail of the earlier positions ---------- */
  X.register("reverb", {
    caption: "The highlighted position adds mix times the tail, a running average of the positions before it. "
      + "The bars under the cells are each earlier position's weight in that tail, which falls by "
      + "<i>decay</i> at each step back: <code>tail[p] = decay · tail[p − 1] + (1 − decay) · h[p]</code>.",
    examples: "decay 0.8, 0.5 and 0.95",
    still: 9 * 800, draw: function (t) {
    var decays = [0.8, 0.5, 0.95], dc = decays[Math.floor(t / 12000) % 3], mix = 0.5;
    var p = 1 + Math.floor((t % 12000) / 800), NP = 16, y = 74, s = "", i;
    function cx(i) { return 26 + i * 23.2; }
    function wt(i) {                          // the weight of h[i] in tail[p − 1]
      if (p < 2 || i < 1 || i > p - 1) return 0;
      return i === 1 ? Math.pow(dc, p - 2) : (1 - dc) * Math.pow(dc, p - 1 - i);
    }
    for (i = 1; i < p; i++) s += arc(cx(i), cx(p), y - 15, Math.min(26, 6 + (cx(p) - cx(i)) * 0.09), "s-acc", 1 + 2 * wt(i), clamp(wt(i), 0.08, 0.9));
    s = cells(s, y, p, NP, cx, 19, wt);
    s += L(10, 160, 394, 160, "s-line");
    for (i = 1; i < p; i++) s += R(cx(i) - 6, 160, 12, -wt(i) * 62, "f-acc", ' opacity="0.85"');
    s += TM(cx(0), y + 30, "sink", "f-dim t-xs");
    s += T(8, 178, "weight of each earlier position in tail[p − 1]", "f-dim t-xs");
    s += T(8, 196, "one cell per position →", "f-dim t-xs");
    var read = "decay " + dc + " · mix " + mix + "    " + (p < 2 ? "position 1 has nothing before it but the sink: unchanged" :
      "h'[" + p + "] = h[" + p + "] + " + mix + " · tail[" + (p - 1) + "],   tail[p] = decay · tail[p − 1] + (1 − decay) · h[p]");
    return { svg: s, read: read, setting: Math.floor(t / 12000) % 3 };
  } });
})(window.VAUExplain);
