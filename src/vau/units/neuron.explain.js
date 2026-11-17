// Vector Abliteration Units: the Neuron unit's explainer, an animated figure of what neuron.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Neuron: one MLP neuron's activation edited ---------- */
  var OPS = [["zero"], ["flip"], ["set", -0.8], ["add", 1], ["set", 20]];
  function applyOp(o, a) {
    switch (o[0]) {
      case "scale": return a * o[1];
      case "add": return a + o[1];
      case "set": return o[1];
      case "zero": return 0;
      case "flip": return -a;
      default: return clamp(a, -Math.abs(o[1]), Math.abs(o[1]));
    }
  }
  function gelu(x) { return 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x))); }
  X.register("neuron", {
    caption: "Twelve of the 3,072 activations of a GPT-2 small MLP, with neuron 373 named. The operation acts "
      + "on that neuron's activation where the output projection reads it, in turn zero, flip, set and "
      + "add; the lines below are its column of the projection, what it writes into the stream.",
    examples: "each operation",
    still: 3 * 3200 + 1600, draw: function (t) {
    var st = stage(t, OPS.length, 3200, 500), o = OPS[st.i], op = OPS[st.prev], NI = 12, NAMED = 4, cy = 92, ky = 30, s = "", i;
    function x(j) { return 46 + j * 28; }
    s += L(30, cy, 370, cy, "s-line");
    s += R(40, 176, 320, 20, "f-panel", ' rx="3"') + TM(200, 189.5, "the stream: what the MLP writes", "f-dim t-xs");
    var a373 = 0.55 + 0.45 * Math.sin(t / 1100), edited = lerp(applyOp(op, a373), applyOp(o, a373), st.k);
    for (i = 0; i < NI; i++) {
      var named = i === NAMED, a = named ? edited : gelu(1.1 * Math.sin(t / 1300 + i * 1.9) + 0.5 * Math.sin(t / 530 + i * 0.7) + 0.2);
      for (var f = 0; f < 4; f++) {
        var tx = 70 + (i * 4 + f) * 5.6;
        s += L(x(i), 154, tx, 176, named ? "s-acc" : "s-line", named ? ' stroke-width="' + n1(0.4 + 1.6 * Math.min(1.5, Math.abs(a))) + '" opacity="0.8"' : ' stroke-width="0.6"');
      }
      s += C(x(i), 150, 4, named ? "f-acc" : "f-dim");
      if (named) s += R(x(i) - 6, cy, 12, -a373 * ky, "s-ink", ' fill="none" stroke-width="1" stroke-dasharray="3 2" opacity="0.7"');
      var shown = clamp(a, -2.4, 2.4);
      s += R(x(i) - 6, cy, 12, -shown * ky, named ? "f-acc" : "f-blue", ' opacity="' + (named ? 0.95 : 0.55) + '"');
      if (shown !== a) s += T(x(i) + 9, cy - shown * ky + 9, (a > 0 ? "↑ " : "↓ ") + a.toFixed(1), "f-acc t-xs");
    }
    s += TM(x(NAMED), 141, "373", "f-acc t-xs");
    s += T(8, 16, "MLP activations a, after the nonlinearity (12 of 3,072)", "f-dim t-xs");
    var name = o[0] + (o.length > 1 ? ", value " + String(o[1]).replace("-", "−") : ""), form = { scale: "a · v", add: "a + v", set: "v", zero: "0", flip: "−a", clamp: "clamp(a, −|v|, |v|)" }[o[0]];
    return { svg: s, read: "n=373 · op " + name + ":  a[..., 373] → " + form + "    (" + sign(a373) + " → " + sign(applyOp(o, a373)) + ")", setting: st.i };
  } });
})(window.VAUExplain);
