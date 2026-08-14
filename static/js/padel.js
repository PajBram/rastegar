/* The padel countdown.
 *
 * One target time, read from data-starts on .countdown as a full ISO string
 * with its offset, so the clock means the same thing in every timezone anyone
 * opens it in. The page ships readable numbers already; this only keeps them
 * moving, and says so in words underneath in case it never runs.
 */
(function () {
  'use strict';

  var box = document.querySelector('.countdown');
  if (!box) return;

  var target = new Date(box.getAttribute('data-starts')).getTime();
  if (!target) return;

  var MATCH_MINUTES = 60;   // how long "On court now" lasts before "Full time"
  var state = box.querySelector('.countdown__state');
  var clock = box.querySelector('.countdown__clock');
  var units = {
    days: box.querySelector('[data-unit="days"]'),
    hours: box.querySelector('[data-unit="hours"]'),
    minutes: box.querySelector('[data-unit="minutes"]'),
    seconds: box.querySelector('[data-unit="seconds"]')
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function paint() {
    var left = target - Date.now();

    if (left <= 0) {
      var since = -left;
      clock.hidden = true;
      box.classList.add('is-done');
      if (since < MATCH_MINUTES * 60000) {
        box.classList.add('is-live');
        state.textContent = 'On court now';
      } else {
        box.classList.remove('is-live');
        state.textContent = 'Full time';
      }
      return;
    }

    var seconds = Math.floor(left / 1000);
    units.days.textContent = String(Math.floor(seconds / 86400));
    units.hours.textContent = pad(Math.floor(seconds / 3600) % 24);
    units.minutes.textContent = pad(Math.floor(seconds / 60) % 60);
    units.seconds.textContent = pad(seconds % 60);
    // The last hour is allowed to feel like the last hour.
    box.classList.toggle('is-close', left < 3600000);
  }

  paint();
  var tick = setInterval(paint, 1000);

  // A phone that has been asleep comes back with a stale clock on screen.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) paint();
  });

  window.addEventListener('pagehide', function () { clearInterval(tick); });
})();
