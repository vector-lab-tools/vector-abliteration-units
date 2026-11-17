// Vector Abliteration Units: the Entropy unit's explainer, an animated figure of what entropy.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Entropy (a meter): bits at each token of the original text ---------- */
  // The readings are the meter's own, from the run in unit-texts.json.
  X.register("entropy", {
    caption: "The meter's reading at each token of GPT-2 small's original text: the entropy of the model's "
      + "next-token distribution, <code>H = −Σ p log₂ p</code>, in bits, 0 when it is sure of the next "
      + "token and about 15.6 if all 50,257 tokens were equally likely. The meter changes nothing.",
    meter: true,
    still: 3 * 900 + 300, draw: function (t, D) {
    var H = D ? D.units.entropy[0].reading : [], toks = D ? D.original.tokens : [], N = H.length || 30, j = Math.floor(t / 900) % N;
    var X0 = 34, slot = 358 / N, Y0 = 168, top = 46, MAX = 12, s = "", i;
    function hy(h) { return Y0 - h / MAX * (Y0 - top); }
    [0, 4, 8, 12].forEach(function (b) { s += L(X0 - 4, hy(b), 394, hy(b), b ? "s-soft" : "s-line"); s += TE(X0 - 7, hy(b) + 3, String(b), "f-dim t-xs"); });
    for (i = 0; i < H.length; i++) {
      var cur = i === j;
      s += R(X0 + i * slot + 1, Y0, slot - 2.4, -(H[i] / MAX) * (Y0 - top), cur ? "f-acc" : "f-green", ' opacity="' + (cur ? 1 : i < j ? 0.75 : 0.3) + '"');
    }
    if (H.length) {
      s += T(8, 22, "H = " + H[j].toFixed(2) + " bits", "f-ink t-m");
      s += TM(clamp(X0 + j * slot + slot / 2, 40, 360), 186, JSON.stringify(toks[j]).slice(1, -1).replace(/\\n/g, "↵"), "f-acc t-s");
    }
    s += T(8, 38, "bits, at each token of the original text", "f-dim t-xs");
    s += T(X0 - 4, 204, "tokens →", "f-dim t-xs");
    return { svg: s, setting: 0, token: j, read: H.length ? "token " + (j + 1) + " of " + N + ":  H = −Σ p log₂ p = " + H[j].toFixed(2) +
      " bits    (0 when the model is sure of the next token;  15.6 if all 50,257 were equally likely)" : "H = −Σ p log₂ p, in bits" };
  } });
})(window.VAUExplain);
