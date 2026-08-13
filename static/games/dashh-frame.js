/* Dashh: Voidfall runs as a self-contained WebGL page inside an iframe.
   Fullscreen is handled site-wide by fullscreen.js; this wrapper only defers
   the download until the game can actually be played, and hands the frame the
   keyboard, which a frame cannot claim for itself. */
(function () {
  'use strict';

  var root = document.getElementById('game-root');
  if (!root) return;

  var wrap = root.querySelector('.dashh');
  var frame = root.querySelector('.dashh__frame');
  var anyway = root.querySelector('[data-dashh-anyway]');
  if (!wrap || !frame) return;

  // The 180 kB game page is only fetched once we know it can be played:
  // straight away on a mouse, and on touch only if the visitor asks.
  var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  function load() {
    if (!frame.src) frame.src = frame.getAttribute('data-src');
  }
  if (touch) {
    if (anyway) anyway.addEventListener('click', function () {
      wrap.classList.add('is-open');
      load();
    });
  } else {
    load();
  }

  // Hovering or clicking the frame focuses it, otherwise the page keeps the
  // key presses and the game never sees WASD.
  function focusGame() {
    try { frame.contentWindow.focus(); } catch (e) { /* other origin, ignore */ }
  }
  frame.addEventListener('mouseenter', focusGame);
  wrap.addEventListener('click', focusGame);
  // Entering or leaving fullscreen moves focus to the button that did it.
  document.addEventListener('fullscreenchange', function () { setTimeout(focusGame, 60); });
})();
