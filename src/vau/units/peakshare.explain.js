// Vector Abliteration Units: the Peak share unit's explainer, an animated figure of what peakshare.py computes.
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
// Drawn by the explainer runtime (vau/explain/explain.js), which must be loaded first.
(function (X) {
  "use strict";
  if (!X) return;
  var H = X.h, n1 = H.n1, esc = H.esc, T = H.T, TM = H.TM, TE = H.TE, R = H.R, L = H.L, C = H.C, P = H.P, arrow = H.arrow,
      clamp = H.clamp, ease = H.ease, lerp = H.lerp, rnd = H.rnd, gauss = H.gauss, f2 = H.f2, sign = H.sign, stage = H.stage,
      cells = H.cells, arc = H.arc, BCLS = H.BAND, reduced = H.reduced;

  /* ---------- Peak share (a meter): the share of the size in the top k ---------- */
  var PV = [];
  (function () { for (var i = 0; i < 32; i++) PV.push(gauss(i + 1200)); PV[11] = 4.2; PV[25] = -2.9; })();
  X.register("peakshare", {
    caption: "Left, one position's squared components (32 drawn), the k largest in amber. Right, the meter's "
      + "reading at layer 6 for each token of GPT-2 small's original text, <code>Σ top-k hᵢ² / Σ hᵢ² × "
      + "100</code>, as k steps from 1 to 16; it changes nothing.",
    meter: true,
    still: 3 * 4200 + 4 * 700 + 300, draw: function (t, D) {
    var ks = [1, 2, 4, 8, 16], st = stage(t, 5, 4200, 600), k = ks[st.i], rows = D ? D.units.peakshare : null, toks = D ? D.original.tokens : [];
    var N = rows ? rows[0].reading.length : 30, j = Math.floor(t / 700) % N, s = "", Y0 = 168, Hh = 122, i;
    // left: one position's squared components, drawn, the k largest in amber
    var sq = PV.map(function (v) { return v * v; }), mx = Math.max.apply(null, sq);
    var rank = sq.map(function (v, i) { return i; }).sort(function (a, b) { return sq[b] - sq[a]; }), top = {};
    for (i = 0; i < k; i++) top[rank[i]] = 1;
    s += L(12, Y0, 186, Y0, "s-line");
    sq.forEach(function (v, i) { s += R(16 + i * 5.3, Y0, 3.6, -v / mx * Hh, top[i] ? "f-acc" : "f-blue", ' opacity="' + (top[i] ? 0.95 : 0.5) + '"'); });
    s += T(8, 22, "k = " + k, "f-ink t-m");
    s += T(8, 38, "hᵢ² at one position, drawn", "f-dim t-xs");
    // right: the meter's reading at each token of the original text, for this k
    var X0 = 214, slot = 178 / N;
    s += L(X0 - 4, Y0, 394, Y0, "s-line") + L(X0 - 4, Y0 - Hh, 394, Y0 - Hh, "s-soft");
    s += TE(X0 - 6, Y0 - Hh + 3, "100%", "f-dim t-xs") + TE(X0 - 6, Y0 + 3, "0", "f-dim t-xs");
    if (rows) {
      var a = rows[st.prev].reading, b = rows[st.i].reading;
      for (i = 0; i < N; i++) {
        var v = lerp(a[i], b[i], st.k), cur = i === j;
        s += R(X0 + i * slot + 0.6, Y0, slot - 1.6, -v / 100 * Hh, cur ? "f-acc" : "f-green", ' opacity="' + (cur ? 1 : 0.6) + '"');
      }
      s += T(X0, 22, b[j].toFixed(1) + "%", "f-ink t-m");
      s += TM(clamp(X0 + j * slot + slot / 2, X0 + 14, 380), 186, JSON.stringify(toks[j]).slice(1, -1).replace(/\\n/g, "↵"), "f-acc t-s");
    }
    s += T(X0, 38, "GPT-2 small, layer 6, each token", "f-dim t-xs");
    s += T(X0 - 4, 204, "tokens →", "f-dim t-xs");
    return { svg: s, setting: st.i, token: j, read: rows ? "k " + k + " · token " + (j + 1) + " of " + N + ":  Σ top-k hᵢ² / Σ hᵢ² × 100 = " + rows[st.i].reading[j].toFixed(1) + "%" : "Σ top-k hᵢ² / Σ hᵢ² × 100" };
  } });
})(window.VAUExplain);
