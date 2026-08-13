/* Dashh: Voidfall runs as a self-contained WebGL page inside an iframe.
   This wrapper only does the two things the frame cannot do for itself:
   hand it the keyboard when you click it, and go fullscreen on request. */
(function () {
  'use strict';

  var root = document.getElementById('game-root');
  if (!root) return;

  var wrap = root.querySelector('.dashh');
  var frame = root.querySelector('.dashh__frame');
  var button = root.querySelector('[data-dashh-fullscreen]');
  var anyway = root.querySelector('[data-dashh-anyway]');
  if (!wrap || !frame) return;

  // The 171 kB game page is only fetched once we know it can be played:
  // straight away on a mouse, and on touch only if the visitor insists.
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

  // Clicking the frame focuses it, otherwise the page keeps the key presses.
  function focusGame() {
    try { frame.contentWindow.focus(); } catch (e) { /* other origin, ignore */ }
  }
  frame.addEventListener('mouseenter', focusGame);
  wrap.addEventListener('click', focusGame);

  if (button) {
    button.addEventListener('click', function () {
      var el = document.fullscreenElement || document.webkitFullscreenElement;
      if (el) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        return;
      }
      var go = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
      if (go) go.call(wrap);
      setTimeout(focusGame, 60);
    });
    document.addEventListener('fullscreenchange', function () {
      var on = !!document.fullscreenElement;
      wrap.classList.toggle('is-full', on);
      button.textContent = on ? 'Leave fullscreen' : 'Fullscreen';
      focusGame();
    });
  }
})();
