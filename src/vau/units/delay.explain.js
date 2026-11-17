// Vector Abliteration Units: the Lookback unit's explainer, an animated figure of what delay.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Lookback: echoes from p − time, with feedback ---------- */
  X.register("delay", {
    caption: "One cell per position at a layer. The highlighted position adds mix times the delay line from "
      + "<i>time</i> positions back, and with feedback that line carries its own earlier echoes, each "
      + "fainter: <code>h'[p] = h[p] + mix · line[p − time]</code>. Position 0, the attention sink, is "
      + "neither changed nor drawn on.",
    examples: "time 4, 3 and 5, with feedback 0.3, 0.6 and 0.45",
    still: 8 * 800, draw: function (t) {
    var cfg = [[4, 0.3], [3, 0.6], [5, 0.45]], c = cfg[Math.floor(t / 12000) % 3], time = c[0], fb = c[1], mix = 0.5;
    var p = 1 + Math.floor((t % 12000) / 800), NP = 16, y = 116, s = "", srcs = [], k;
    function cx(i) { return 26 + i * 23.2; }
    for (k = 1; p - k * time >= 1; k++) srcs.push([p - k * time, mix * Math.pow(fb, k - 1)]);
    srcs.forEach(function (sv) {
      var a = cx(sv[0]), b = cx(p);
      s += arc(a, b, y - 15, Math.min(66, 12 + (b - a) * 0.2), "s-acc", 1 + 3 * sv[1] / mix, clamp(sv[1] / mix, 0.2, 1));
    });
    s = cells(s, y, p, NP, cx, 19, function (i) { for (var j = 0; j < srcs.length; j++) if (srcs[j][0] === i) return srcs[j][1] / mix; return 0; });
    s += TM(cx(0), y + 30, "sink", "f-dim t-xs");
    s += TM(cx(p), y + 30, "p", "f-acc t-s");
    if (srcs.length) s += TM(cx(p - time), y + 30, "p − " + time, "f-acc t-xs");
    s += T(8, 196, "one cell per position →", "f-dim t-xs");
    var terms = srcs.map(function (sv) { return " + " + (sv[1] < 0.1 ? sv[1].toFixed(3) : f2(sv[1])) + "·h[" + sv[0] + "]"; }).join("");
    return { svg: s, read: "time " + time + " · feedback " + fb + " · mix " + mix + "    h'[" + p + "] = h[" + p + "]" + (terms || "   (nothing " + time + " back yet)"), setting: Math.floor(t / 12000) % 3 };
  } });
})(window.VAUExplain);
