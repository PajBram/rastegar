/* Fullscreen for the game area.
 *
 * The button lives outside #game-root on purpose: the quiz rebuilds its own
 * insides on every question and an arcade game replaces them at every run, so
 * a button placed inside would keep disappearing.
 *
 * iOS Safari refuses requestFullscreen on anything that is not a video, so
 * there is a fallback that pins the element over the viewport with CSS. That
 * path also runs whenever a browser rejects the request for any other reason.
 *
 * While fullscreen, a small exit control is placed inside the game area — and
 * put back if the game wipes its own children out from under it.
 */
(function () {
  'use strict';

  var button = document.querySelector('.fs-toggle');
  var target = document.getElementById('game-root');
  if (!button || !target) return;

  var faking = false;
  var watcher = null;

  var exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'fs-exit';
  exit.textContent = 'Exit';
  exit.setAttribute('aria-label', 'Leave fullscreen');
  exit.addEventListener('click', function (event) {
    event.stopPropagation();
    toggle();
  });

  function nativeElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isOn() { return faking || nativeElement() === target; }

  function keepExitInPlace() {
    if (!exit.parentNode) target.appendChild(exit);
  }

  function paint() {
    var on = isOn();
    button.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
    button.setAttribute('aria-pressed', on ? 'true' : 'false');

    if (on) {
      keepExitInPlace();
      if (!watcher && window.MutationObserver) {
        watcher = new MutationObserver(keepExitInPlace);
        watcher.observe(target, { childList: true });
      }
    } else {
      if (watcher) { watcher.disconnect(); watcher = null; }
      if (exit.parentNode) exit.parentNode.removeChild(exit);
    }

    // Canvas games measure themselves off the element box; make them re-check.
    window.dispatchEvent(new Event('resize'));
  }

  function enterFake() {
    faking = true;
    target.classList.add('fs-fallback');
    document.body.classList.add('fs-locked');
    paint();
  }

  function exitFake() {
    faking = false;
    target.classList.remove('fs-fallback');
    document.body.classList.remove('fs-locked');
    paint();
  }

  function toggle() {
    if (faking) { exitFake(); return; }

    if (nativeElement() === target) {
      var leave = document.exitFullscreen || document.webkitExitFullscreen;
      if (leave) leave.call(document);
      return;
    }

    var request = target.requestFullscreen || target.webkitRequestFullscreen;
    if (!request) { enterFake(); return; }

    try {
      var result = request.call(target);
      if (result && result.catch) result.catch(enterFake);
    } catch (e) {
      enterFake();
    }
  }

  button.addEventListener('click', toggle);

  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (name) {
    document.addEventListener(name, paint);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && faking) exitFake();
  });

  paint();
})();
