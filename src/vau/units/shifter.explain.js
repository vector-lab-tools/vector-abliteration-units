// Vector Abliteration Units: the Rotate unit's explainer, an animated figure of what shifter.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Rotate: a rotation in the plane of e1, e2 ---------- */
  X.register("shifter", {
    caption: "The plane of two directions: e₁ from <i>dir</i>, and e₂ from <i>dir2</i> made orthogonal to e₁ "
      + "(the dashed arrow is dir2 as given). The stream's part in that plane turns by the angle, and on "
      + "the right its other components stay as they were.",
    examples: "angle 45°, 90°, 180° and −90°",
    still: 3000 + 1500, draw: function (t) {
    var AS = [45, 90, 180, -90], st = stage(t, 4, 3000, 1000), a0 = AS[st.prev], dg = ((AS[st.i] - a0 + 540) % 360) - 180;
    var ang = a0 + dg * st.k;
    ang = ang - 360 * Math.ceil((ang - 180) / 360);                // in (−180, 180]
    var O = [118, 112], len = 80, base = 28, s = "", i;
    function pt(deg, r) { var a = deg * Math.PI / 180; return [O[0] + r * Math.cos(a), O[1] - r * Math.sin(a)]; }
    s += L(O[0] - 96, O[1], O[0] + 100, O[1], "s-line") + L(O[0], O[1] + 92, O[0], O[1] - 96, "s-line");
    s += T(O[0] + 86, O[1] + 15, "e₁", "f-ink t-s") + T(O[0] + 7, O[1] - 78, "e₂", "f-ink t-s");
    var d2 = pt(58, 92);
    s += arrow(O[0], O[1], d2[0], d2[1], "s-blue", 1.2).replace('stroke-width="1.2"', 'stroke-width="1.2" stroke-dasharray="4 3"');
    s += L(d2[0], d2[1], d2[0], O[1], "s-blue", ' stroke-width="0.8" stroke-dasharray="2 3" opacity="0.7"');
    s += T(d2[0] + 5, d2[1] + 4, "dir2", "f-blue t-xs");
    var a0 = pt(base, len), a1 = pt(base + ang, len), d = "";
    for (i = 0; i <= 30; i++) { var q = pt(base + ang * i / 30, 30); d += (i ? " L" : "M") + n1(q[0]) + " " + n1(q[1]); }
    s += P(d, "s-acc", ' stroke-width="1.2" opacity="0.8"');
    s += arrow(O[0], O[1], a0[0], a0[1], "s-dim", 1.5);
    s += arrow(O[0], O[1], a1[0], a1[1], "s-acc", 2.6);
    s += C(O[0], O[1], 2.5, "f-ink");
    s += T(8, 16, "the stream's part in the plane", "f-dim t-xs");
    var ca = Math.cos(base * Math.PI / 180), sb = Math.sin(base * Math.PI / 180);
    var r = ang * Math.PI / 180, na = ca * Math.cos(r) - sb * Math.sin(r), nb = ca * Math.sin(r) + sb * Math.cos(r);
    var rest = [0.35, -0.5, 0.2, 0.62, -0.28, -0.12, 0.44, -0.4], X0 = 252, cy = 112, k = 60, bars = [na, nb].concat(rest), orig = [ca, sb].concat(rest);
    s += L(X0 - 4, cy, 394, cy, "s-line");
    bars.forEach(function (v, j) {
      var x = X0 + j * 14.5 + (j > 1 ? 6 : 0);
      s += R(x, cy, 9, -v * k, j < 2 ? "f-acc" : "f-blue", ' opacity="0.85"');
      if (j < 2) s += R(x, cy, 9, -orig[j] * k, "s-ink", ' fill="none" stroke-width="1" stroke-dasharray="3 2" opacity="0.6"');
    });
    s += TM(X0 + 4.5, 196, "e₁", "f-acc t-xs") + TM(X0 + 19, 196, "e₂", "f-acc t-xs");
    s += T(X0 + 34, 196, "rest of h, kept", "f-blue t-xs");
    return { svg: s, read: "angle " + String(Math.round(ang)).replace("-", "−") + "°    (h·e₁, h·e₂) = (" + f2(ca) + ", " + f2(sb) + ") → (" + sign(na) + ", " + sign(nb) + "),  the rest of h kept", setting: st.i };
  } });
})(window.VAUExplain);
