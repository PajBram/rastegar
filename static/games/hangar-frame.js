/* Hangar Survivors is a self-contained canvas page inside an iframe. The
   wrapper defers the download on phones (the game needs a keyboard), and hands
   the frame keyboard focus, which a frame cannot claim for itself. Highscores
   stay inside the game: it keeps its own local best-run list. */
(function () {
  'use strict';

  var root = document.getElementById('game-root');
  if (!root) return;

  var wrap = root.querySelector('.dashh');
  var frame = root.querySelector('.dashh__frame');
  var anyway = root.querySelector('[data-hangar-anyway]');
  if (!wrap || !frame) return;

  var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  function load() {
    if (!frame.src) frame.src = frame.getAttribute('data-src');
  }
  if (touch) {
    if (anyway) anyway.addEventListener('click', function () {
      wrap.classList.add('is-open');
      load();
      setTimeout(focusGame, 300);
    });
  } else {
    load();
  }

  // Without focus the page keeps the key presses and the game never sees WASD.
  function focusGame() {
    try { frame.contentWindow.focus(); } catch (e) { /* other origin, ignore */ }
  }
  frame.addEventListener('load', focusGame);
  frame.addEventListener('mouseenter', focusGame);
  wrap.addEventListener('click', focusGame);
  document.addEventListener('fullscreenchange', function () { setTimeout(focusGame, 60); });
})();
