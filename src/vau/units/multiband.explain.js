// Vector Abliteration Units: the Band Shrink unit's explainer, an animated figure of what multiband.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Band Shrink: each band compressed above its own limit ---------- */
  X.register("multiband", {
    caption: "The size of the stream's part in each band at six positions, each band with its own limit "
      + "<code>L_b = thresh × typical ‖band b‖</code>. In the band or bands chosen, the part above the "
      + "limit shrinks by the ratio, <code>n' = L_b + (n − L_b) / ratio</code>; the others pass "
      + "unchanged.",
    examples: "ratio 8 in each choice of band",
    still: 3500 + 1700, draw: function (t) {
    var choices = ["all", "low", "mid", "high"], st = stage(t, 4, 3500, 900), band = choices[st.i], ratio = 8;
    function chosen(c, b) { return c === "all" || c === ["low", "mid", "high"][b]; }
    var typ = [2.6, 1.7, 1.1], f = [[1.5, 0.7, 1.9, 1.1, 0.6, 1.3], [0.8, 1.7, 1.2, 0.5, 1.45, 0.9], [1.2, 0.6, 1.0, 1.8, 0.75, 1.55]];
    var names = ["low · V₁₋₈", "mid · V₉₋₆₄", "high · V₆₅₊"], Y0 = 176, ky = 30, s = "";
    s += L(14, Y0, 396, Y0, "s-line");
    for (var b = 0; b < 3; b++) {
      var on = chosen(band, b), amt = lerp(chosen(choices[st.prev], b) ? 1 : 0, on ? 1 : 0, st.k), gx = 20 + b * 127, Lb = typ[b];
      for (var i = 0; i < 6; i++) {
        var nv = typ[b] * f[b][i], out = nv > Lb ? lerp(nv, Lb + (nv - Lb) / ratio, amt) : nv, x = gx + i * 19;
        s += R(x, Y0, 12, -out * ky, BCLS[b], ' opacity="' + (on ? 0.85 : 0.35) + '"');
        s += R(x, Y0, 12, -nv * ky, "s-ink", ' fill="none" stroke-width="1" stroke-dasharray="3 2" opacity="0.55"');
      }
      s += L(gx - 3, Y0 - Lb * ky, gx + 112, Y0 - Lb * ky, "s-ink", ' stroke-width="1.2" stroke-dasharray="5 3" opacity="' + (on ? 0.9 : 0.4) + '"');
      s += T(gx - 2, Y0 - Lb * ky - 4, "L", "f-ink t-xs");
      s += T(gx - 2, Y0 + 15, names[b], BCLS[b] + " t-xs", on ? "" : ' opacity="0.6"');
    }
    s += T(8, 16, "‖band b‖ at six positions", "f-dim t-xs");
    return { svg: s, read: "band " + band + " · ratio " + ratio + " · thresh 1    per band b:  n > L_b:  n' = L_b + (n − L_b) / ratio,  L_b = thresh × typical ‖band b‖", setting: st.i };
  } });
})(window.VAUExplain);
