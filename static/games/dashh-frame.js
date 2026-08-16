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

  /* Highscores.
   *
   * The game is inside a frame and cannot reach window.Scores itself, so it
   * shouts two things over postMessage and this end does the paperwork: fetch
   * a run token when a survival run starts, and offer the submit form when it
   * ends. Adventure runs say nothing — they resume from checkpoints, so they
   * are not one attempt and not comparable.
   */
  var token = null;
  var panel = null;

  function clearPanel() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
  }

  function showResult(run) {
    clearPanel();
    if (!window.Scores) return;
    panel = document.createElement('div');
    panel.className = 'dashh__result';

    var head = document.createElement('p');
    head.className = 'dashh__result-line';
    head.textContent = 'Wave ' + run.wave + ' · ' + run.kills + ' kills';
    panel.appendChild(head);

    var big = document.createElement('p');
    big.className = 'big';
    big.textContent = String(run.score);
    panel.appendChild(big);

    panel.appendChild(window.Scores.submitForm({
      game: 'dashh',
      score: run.score,
      // Read late: a run that ends before the token lands would otherwise be
      // told it cannot be scored a moment before it can.
      token: function () { return token; }
    }));
    wrap.appendChild(panel);
    panel.scrollIntoView({ block: 'nearest' });
  }

  window.addEventListener('message', function (event) {
    // Only our own frame, on our own origin, gets to say anything.
    if (event.origin !== window.location.origin) return;
    if (event.source !== frame.contentWindow) return;
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.dashh === 'run-start') {
      token = null;
      clearPanel();
      if (window.Scores) {
        window.Scores.startRun('dashh').then(function (t) { token = t; });
      }
    } else if (msg.dashh === 'run-over' && typeof msg.score === 'number') {
      showResult(msg);
    }
  });

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
