/* Shared scaffolding for the canvas games.
 *
 * Handles the boring identical parts: a crisp canvas on any screen, a HUD,
 * start and game-over overlays, keyboard and touch input, a fixed-step-ish
 * game loop, and posting the score when a run ends.
 *
 * A game supplies: { slug, width, height, init, update, draw, hud }.
 * See slash.js for the smallest complete example.
 */
(function () {
  'use strict';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function mount(spec) {
    var root = document.getElementById('game-root');
    if (!root) return;

    root.innerHTML = '';
    var wrap = el('div', 'stage stage--arcade');

    // --- HUD ------------------------------------------------------------
    var hud = el('div', 'stage__hud');
    var hudLeft = el('span', null, spec.title || '');
    var hudScore = el('span');
    var scoreValue = el('strong', null, '0');
    hudScore.appendChild(scoreValue);
    hudScore.appendChild(document.createTextNode(' pts'));
    var hudRight = el('span', 'hud__lives', '');
    hud.appendChild(hudLeft);
    hud.appendChild(hudScore);
    hud.appendChild(hudRight);
    wrap.appendChild(hud);

    // --- canvas ---------------------------------------------------------
    var holder = el('div', 'arcade');
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', (spec.title || 'Game') + ' play area');
    canvas.setAttribute('role', 'img');
    holder.appendChild(canvas);
    wrap.appendChild(holder);
    root.appendChild(wrap);

    var ctx = canvas.getContext('2d');
    var W = spec.width, H = spec.height;

    /* On a phone the canvas fills the screen, and a canvas that swallows every
       touch leaves nowhere to swipe. Only take the gestures while a run is
       actually going; before and after, let the page scroll normally. */
    function setTouch(playing) {
      canvas.style.touchAction = playing ? 'none' : 'pan-y';
    }
    setTouch(false);

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.aspectRatio = W + ' / ' + H;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // --- game object handed to the game module ---------------------------
    var game = {
      w: W,
      h: H,
      score: 0,
      lives: 3,
      time: 0,
      state: 'intro',
      keys: Object.create(null),
      pointer: { x: W / 2, y: H / 2, down: false, side: 0 },
      token: null,
      taps: [],
      ctx: ctx,
      /** End the run. Called by the game when the player is out. */
      over: function () {
        if (game.state !== 'playing') return;
        game.state = 'over';
        setTouch(false);
        showGameOver();
      }
    };

    // --- input -----------------------------------------------------------
    var BLOCK = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, ' ': 1 };

    /** True while the player is typing somewhere — a name field, say. */
    function typingSomewhere(target) {
      if (!target) return false;
      var tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    }

    function onKeyDown(event) {
      // Never eat keys aimed at a text field: swallowing space and the arrow
      // keys made the name box impossible to type into.
      if (typingSomewhere(event.target)) return;
      // Space and the arrows are the game's while a run is on. Outside one they
      // belong to the page: the write-up sits below the game, and a visitor
      // reading it with the keyboard should be able to scroll.
      if (BLOCK[event.key] && game.state === 'playing') event.preventDefault();
      if (game.keys[event.key]) return;          // ignore auto-repeat
      game.keys[event.key] = true;
      if (event.key === ' ' || event.key === 'Enter') {
        if (game.state === 'intro' || game.state === 'over') {
          event.preventDefault();
          startRun();
          return;
        }
      }
      if (game.state === 'playing' && spec.keyPress) spec.keyPress(event.key, game);
    }
    function onKeyUp(event) { game.keys[event.key] = false; }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    function pointFromEvent(event) {
      var rect = canvas.getBoundingClientRect();
      // A canvas that has not been laid out yet has no size, and dividing by
      // it would hand the game NaN coordinates.
      if (!rect.width || !rect.height) return null;
      return {
        x: (event.clientX - rect.left) / rect.width * W,
        y: (event.clientY - rect.top) / rect.height * H
      };
    }

    canvas.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      var point = pointFromEvent(event);
      if (!point) return;
      game.pointer.x = point.x;
      game.pointer.y = point.y;
      game.pointer.down = true;
      game.pointer.side = point.x < W / 2 ? -1 : 1;
      if (game.state === 'intro') { startRun(); return; }
      if (game.state === 'playing' && spec.tap) spec.tap(point, game);
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(event.pointerId); } catch (e) {} }
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!game.pointer.down) return;
      var point = pointFromEvent(event);
      if (!point) return;
      game.pointer.x = point.x;
      game.pointer.y = point.y;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
      canvas.addEventListener(name, function () { game.pointer.down = false; });
    });

    // --- overlays --------------------------------------------------------
    var overlay = null;

    function clearOverlay() {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
    }

    function showIntro() {
      clearOverlay();
      overlay = el('div', 'stage__overlay');
      overlay.appendChild(el('h3', null, spec.title || 'Ready?'));
      overlay.appendChild(el('p', null, spec.intro || ''));
      var button = el('button', 'btn');
      button.type = 'button';
      button.textContent = 'Start';
      button.addEventListener('click', startRun);
      overlay.appendChild(button);
      overlay.appendChild(el('p', 'scoreboard__empty', spec.hint || ''));
      wrap.appendChild(overlay);
    }

    function showGameOver() {
      clearOverlay();
      overlay = el('div', 'stage__overlay');
      overlay.appendChild(el('h3', null, spec.overTitle || 'Down you go'));
      overlay.appendChild(el('p', 'big', String(Math.round(game.score))));
      if (spec.summary) overlay.appendChild(el('p', null, spec.summary(game)));
      if (window.Scores) {
        overlay.appendChild(window.Scores.submitForm({
          game: spec.slug,
          score: Math.round(game.score),
          token: function () { return game.token; }
        }));
      }
      var again = el('button', 'btn btn--small');
      again.type = 'button';
      again.textContent = 'Run it back';
      again.addEventListener('click', startRun);
      overlay.appendChild(again);
      wrap.appendChild(overlay);
    }

    // --- run control ------------------------------------------------------
    function startRun() {
      clearOverlay();
      game.score = 0;
      game.lives = spec.lives || 3;
      game.time = 0;
      game.token = null;
      game.state = 'playing';
      setTouch(true);
      spec.init(game);
      startLoop();
      if (window.Scores) {
        window.Scores.startRun(spec.slug).then(function (token) { game.token = token; });
      }
    }

    function updateHud() {
      scoreValue.textContent = String(Math.round(game.score));
      hudRight.textContent = spec.hud ? spec.hud(game) : '';
    }

    // --- loop -------------------------------------------------------------
    var last = 0;
    var running = false;
    function frame(now) {
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (game.state === 'playing') {
        game.time += dt;
        spec.update(dt, game);
      }
      spec.draw(ctx, game);
      updateHud();
      // Once the run is over the picture stops changing, and a canvas
      // redrawing sixty times a second behind a form makes typing feel sticky
      // on a phone. Draw the last frame, then stand still.
      if (game.state === 'over') { running = false; return; }
      requestAnimationFrame(frame);
    }

    function startLoop() {
      if (running) return;
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    }

    spec.init(game);
    game.state = 'intro';
    showIntro();
    startLoop();

    // Debug hook. Lets a test drive the simulation without waiting for real
    // time to pass: __arcade.step(0.016) advances one frame. Harmless in
    // production — nothing in the site calls it.
    window.__arcade = {
      game: game,
      start: startRun,
      tap: function (x, y) { if (spec.tap) spec.tap({ x: x, y: y }, game); },
      key: function (k) { if (spec.keyPress) spec.keyPress(k, game); },
      step: function (dt, times) {
        for (var i = 0; i < (times || 1); i++) {
          if (game.state === 'playing') { game.time += dt; spec.update(dt, game); }
        }
        spec.draw(ctx, game);
        updateHud();
      }
    };
  }

  window.Arcade = { mount: mount };
})();
