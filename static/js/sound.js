/* Sound for the canvas games.
 *
 * Everything here is generated: oscillators, a noise buffer, gain envelopes.
 * No files, no dependencies — the same rule the graphics follow, and the
 * reason a game still loads instantly.
 *
 * It starts silent. Browsers block audio that starts by itself, and nobody
 * wants a page that makes noise uninvited, so nothing exists until the visitor
 * presses the button: the AudioContext itself is built on that click. The
 * choice is remembered, so switching it on once is enough.
 *
 *   Sound.enabled              read-only, false until the visitor says otherwise
 *   Sound.button()             a real <button> to drop into a HUD
 *   Sound.toggle()             same thing from a key
 *   Sound.play(name)           one effect, see EFFECTS below
 *   Sound.music(intensity)     0 silent, 1-3 progressively more of the loop
 */
(function () {
  'use strict';

  var KEY = 'rastegar.sound';
  var MASTER = 0.55;

  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var enabled = false;
  var buttons = [];

  // Twenty swarm motes dying in the same frame is twenty of the same sound on
  // top of each other, which is not a sound any more. One of each per gap.
  var GAP = {
    shot: 0.055, hit: 0.035, kill: 0.05, hurt: 0.2, heart: 0.3,
    levelup: 0.3, wave: 0.25, boss: 0.6, bossdown: 0.6, over: 0.6
  };
  var lastAt = {};

  function remembered() {
    try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; }
  }

  function remember(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* private mode */ }
  }

  /** Build the audio graph. Only ever called from a real user gesture. */
  function wake() {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return true;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
    return true;
  }

  function noise() {
    if (!noiseBuffer) {
      var n = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    return src;
  }

  /** One oscillator with a pitch slide and a percussive envelope. */
  function tone(shape, from, to, dur, gain, at) {
    var t = ctx.currentTime + (at || 0);
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.3));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A burst of noise through a band-pass, which is every impact ever.
   *  The filter throws away most of the energy before the gain stage, so these
   *  numbers run roughly three times higher than the ones handed to tone(). */
  function crack(freq, q, dur, gain, at) {
    var t = ctx.currentTime + (at || 0);
    var src = noise();
    var band = ctx.createBiquadFilter();
    var amp = ctx.createGain();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band);
    band.connect(amp);
    amp.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* Levels are deliberately uneven. The shot plays five times a second for a
   * whole run, so it sits under everything; the King arriving is allowed to be
   * the loudest thing that happens. */
  var EFFECTS = {
    shot: function () { tone('square', 720, 260, 0.06, 0.13); },
    hit: function () { crack(1500, 1.2, 0.06, 0.6); },
    kill: function () {
      tone('sawtooth', 320, 70, 0.17, 0.2);
      crack(800, 0.8, 0.09, 0.42);
    },
    hurt: function () {
      tone('square', 190, 70, 0.34, 0.3);
      tone('square', 178, 66, 0.34, 0.22);
      crack(400, 0.7, 0.2, 0.6);
    },
    levelup: function () {
      [0, 4, 7, 12].forEach(function (semi, i) {
        var f = 330 * Math.pow(2, semi / 12);
        tone('triangle', f, f, 0.14, 0.24, i * 0.07);
      });
    },
    heart: function () {
      [0, 7, 12].forEach(function (semi, i) {
        var f = 392 * Math.pow(2, semi / 12);
        tone('sine', f, f, 0.2, 0.3, i * 0.06);
      });
    },
    wave: function () {
      tone('square', 440, 440, 0.08, 0.18);
      tone('square', 660, 660, 0.12, 0.18, 0.09);
    },
    boss: function () {
      tone('sine', 70, 34, 1.3, 0.5);
      tone('sawtooth', 116, 58, 1.1, 0.2);
      crack(220, 0.5, 1.2, 0.6);
    },
    bossdown: function () {
      tone('sawtooth', 300, 40, 1.1, 0.34);
      crack(600, 0.4, 0.8, 0.72);
      [12, 7, 4, 0].forEach(function (semi, i) {
        var f = 330 * Math.pow(2, semi / 12);
        tone('triangle', f, f, 0.16, 0.22, i * 0.08);
      });
    },
    over: function () {
      tone('sawtooth', 300, 42, 1.3, 0.32);
      tone('square', 150, 30, 1.3, 0.18);
    }
  };

  // ------------------------------------------------------------------- music
  /* An eight step loop in A minor. Layers switch on as the run gets worse:
   * 1 is the bass alone, 2 adds a hat, 3 puts an arpeggio over the top. It is
   * scheduled a fifth of a second ahead of the clock, because setTimeout is
   * nowhere near steady enough to put notes on. */
  var BASS = [0, 0, 7, 0, 5, 0, 3, 10];
  var LEAD = [12, 15, 19, 15, 17, 15, 12, 10];
  var music = { level: 0, step: 0, next: 0, timer: null };

  function schedule() {
    if (!ctx || !enabled || !music.level) return;
    var bpm = 92 + music.level * 14;
    var stepDur = 30 / bpm;                       // eighth notes
    /* A background tab throttles setInterval to about one tick a second while
       the audio clock keeps real time. Without this the scheduler wakes up a
       second in debt, and every note it owes lands on the same instant — the
       loop turns into a chord. Notes whose moment has passed are gone; start
       again from now. */
    if (music.next < ctx.currentTime) music.next = ctx.currentTime;
    while (music.next < ctx.currentTime + 0.2) {
      var at = music.next - ctx.currentTime;
      if (at < 0) at = 0;
      var s = music.step % 8;
      var root = 55 * Math.pow(2, BASS[s] / 12);
      // The loop stays under the effects: you should notice it stopping, not
      // notice it playing.
      tone('square', root, root * 0.99, stepDur * 0.85, 0.11, at);

      if (music.level >= 2 && s % 2 === 1) crack(7200, 1, 0.03, 0.18, at);
      if (music.level >= 3) {
        var lead = 55 * Math.pow(2, LEAD[s] / 12) * 4;
        tone('triangle', lead, lead, stepDur * 0.5, 0.08, at);
      }

      music.next += stepDur;
      music.step += 1;
    }
  }

  function musicRunning(on) {
    if (on && !music.timer) {
      music.next = ctx ? ctx.currentTime : 0;
      music.timer = setInterval(schedule, 45);
    } else if (!on && music.timer) {
      clearInterval(music.timer);
      music.timer = null;
    }
  }

  // ------------------------------------------------------------------ button

  function paint() {
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', enabled ? 'true' : 'false');
      buttons[i].setAttribute('aria-label', enabled ? 'Sound on' : 'Sound off');
      buttons[i].title = enabled ? 'Sound on (M)' : 'Sound off (M)';
    }
  }

  var Sound = {
    get enabled() { return enabled; },

    toggle: function () {
      if (!enabled) {
        if (!wake()) return;                      // no Web Audio: stay quiet
        enabled = true;
        remember(true);
        musicRunning(music.level > 0);
      } else {
        enabled = false;
        remember(false);
        musicRunning(false);
      }
      paint();
    },

    button: function () {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hud__sound';
      b.textContent = '♪';                   // an eighth note
      b.addEventListener('click', function () { Sound.toggle(); });
      buttons.push(b);
      paint();
      return b;
    },

    play: function (name) {
      if (!enabled || !ctx) return;
      var fn = EFFECTS[name];
      if (!fn) return;
      var now = ctx.currentTime;
      if (lastAt[name] && now - lastAt[name] < (GAP[name] || 0.05)) return;
      lastAt[name] = now;
      fn();
    },

    music: function (level) {
      if (level === music.level) return;
      music.level = level;
      if (!enabled) return;
      musicRunning(level > 0);
    }
  };

  /* Somebody who switched the sound on before should not have to do it again
   * every visit. A gesture is still required before any audio can exist, so
   * this arms it: the button reads as on, and the first press of anything —
   * which is going to be Start — builds the graph. */
  if (remembered()) {
    enabled = true;
    var armed = function () {
      document.removeEventListener('pointerdown', armed, true);
      document.removeEventListener('keydown', armed, true);
      if (!wake()) { enabled = false; }        // no Web Audio here after all
      else musicRunning(music.level > 0);
      paint();
    };
    document.addEventListener('pointerdown', armed, true);
    document.addEventListener('keydown', armed, true);
  }

  window.Sound = Sound;
})();
