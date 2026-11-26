// Vector Abliteration Units: the site's one script (the theme switch, the sections' fade-in, and opening a unit's details at its #id).
// Copyright (C) 2026 David M. Berry. SPDX-License-Identifier: GPL-3.0-or-later
(function () {
  var root = document.documentElement;
  function current() {
    var a = root.getAttribute('data-theme');
    return a === 'light' ? 'light' : 'dark';          // dark unless the reader chose light
  }
  document.querySelectorAll('.theme-toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('vau-theme', next); } catch (e) {}
    });
  });
  // a unit's folded details open when the page is opened at that unit (units.html#compressor)
  function openAt() {
    var el = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    var d = el && el.querySelector('details.unit-more');
    if (d) d.open = true;
  }
  openAt();
  window.addEventListener('hashchange', openAt);
  var els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach(function (el) { io.observe(el); });
})();

// A figure or screenshot opens in a viewer over the page, not on a page of its own: Esc, a click
// outside it or the close button shuts it. A very wide figure (the units desk) scrolls sideways.
// Cmd- or Ctrl-click still opens the image itself.
(function () {
  var IMG = /\.(png|svg|webp|jpe?g|gif)(\?|#|$)/i, dlg = null;
  function viewer() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.innerHTML = '<button type="button" class="lb-close" aria-label="Close">×</button><div class="lb-frame"><img alt=""></div><p class="lb-cap"></p>';
    document.body.appendChild(dlg);
    dlg.querySelector('.lb-close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { dlg.querySelector('img').removeAttribute('src'); });
    return dlg;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var href = a.getAttribute('href');
    if (!IMG.test(href) || /^https?:/i.test(href) && a.host !== location.host) return;
    var d = viewer();
    if (typeof d.showModal !== 'function') return;          // an old browser: the image's own page, as before
    e.preventDefault();
    var img = d.querySelector('img'), src = a.querySelector('img');
    img.alt = src ? src.alt : '';
    d.querySelector('.lb-cap').textContent = src ? src.alt : '';
    img.onload = function () { d.classList.toggle('lb-wide', img.naturalWidth / Math.max(1, img.naturalHeight) > 2.4); };
    img.src = a.href;
    d.showModal();
  });
})();
