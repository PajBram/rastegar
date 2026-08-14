/* The chase.
 *
 * A small ink figure strolls along the bottom of the window. Every so often a
 * second one turns up wearing a red band, and it is *it* — it runs the first
 * one down, tags it, and wanders off. Then it is the other one's problem.
 *
 * It is the site's own joke: the app the devlog is about is a month-long game
 * of tag, so the mascot plays one.
 *
 * Drawn as line segments and posed every frame, which is why it walks instead
 * of sliding. Nothing here is an image file.
 *
 * Rules it keeps to:
 *   - prefers-reduced-motion means no mascot at all, not a slower one.
 *   - the game pages own the screen; it stays away from them.
 *   - it stops dead when the tab is hidden, and costs nothing while it is.
 *   - it never sits on top of anything you can click. Only the figures
 *     themselves take a pointer, and tapping one tags it.
 */
(function () {
  'use strict';

  // A canvas game fills the screen and takes every touch. A man walking over
  // the top of it is not a joke, it is a bug.
  if (document.getElementById('game-root')) return;

  var motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion && motion.matches) return;

  var SVG = 'http://www.w3.org/2000/svg';
  var WALK = 46;                 // px per second
  var RUN = 165;
  var CATCH = 26;                // how close *it* has to get

  // Smaller on a phone, where the strip is a bigger share of the screen.
  function unitFor() { return window.innerWidth < 600 ? 34 : 44; }
  var UNIT = unitFor();

  function node(name, attrs) {
    var n = document.createElementNS(SVG, name);
    for (var key in attrs) n.setAttribute(key, attrs[key]);
    return n;
  }

  // ------------------------------------------------------------------ figure
  /* Local coordinates: 24 wide, 40 tall, feet on y = 40. Every limb is a
     two-segment polyline posed from two angles, measured from straight down. */
  function makeFigure(isIt) {
    var g = node('g', { class: 'mascot__figure' + (isIt ? ' is-it' : '') });
    var parts = {
      backLeg: node('polyline', { class: 'mascot__limb mascot__limb--back' }),
      backArm: node('polyline', { class: 'mascot__limb mascot__limb--back' }),
      body: node('line', { class: 'mascot__body' }),
      head: node('circle', { class: 'mascot__head', r: 4.6 }),
      frontLeg: node('polyline', { class: 'mascot__limb' }),
      frontArm: node('polyline', { class: 'mascot__limb' })
    };
    // Back limbs first so the near side reads in front of the far side.
    g.appendChild(parts.backLeg);
    g.appendChild(parts.backArm);
    g.appendChild(parts.body);
    g.appendChild(parts.head);
    g.appendChild(parts.frontLeg);
    g.appendChild(parts.frontArm);
    parts.band = node('line', { class: 'mascot__band' });
    g.appendChild(parts.band);
    // The tap target: cut to the figure, not to the strip it walks along, so
    // it can never park itself on top of a link.
    g.appendChild(node('rect', {
      class: 'mascot__hit', x: 1, y: 0, width: 22, height: 40, fill: 'transparent'
    }));
    return { g: g, parts: parts };
  }

  function limb(x0, y0, a1, l1, a2, l2) {
    var x1 = x0 + Math.sin(a1) * l1, y1 = y0 + Math.cos(a1) * l1;
    var x2 = x1 + Math.sin(a2) * l2, y2 = y1 + Math.cos(a2) * l2;
    return x0 + ',' + y0 + ' ' + x1 + ',' + y1 + ' ' + x2 + ',' + y2;
  }

  /* Pose one figure. `phase` runs the walk cycle, `effort` is 0 strolling to 1
     flat out — it leans the body, lengthens the stride and swings the arms
     harder, which is the whole difference between a walk and a run. */
  function pose(fig, phase, effort, standing) {
    var p = fig.parts;
    var swing = (0.42 + effort * 0.42) * (standing ? 0.06 : 1);
    var lean = effort * 0.30;
    var bob = standing ? Math.sin(phase * 0.6) * 0.25 : Math.abs(Math.cos(phase)) * 1.5;

    var hipY = 24 - bob;
    var shoulderY = 11.5 - bob;
    var hipX = 12 + lean * 1.5;
    var shoulderX = 12 - lean * 4.5;

    var a = Math.sin(phase), b = Math.sin(phase + Math.PI);
    // A knee only bends one way. Bend it as the foot comes through, never back.
    var kneeA = Math.max(0, -Math.cos(phase)) * (0.5 + effort * 0.9);
    var kneeB = Math.max(0, -Math.cos(phase + Math.PI)) * (0.5 + effort * 0.9);

    p.frontLeg.setAttribute('points', limb(hipX, hipY, a * swing + lean, 9, a * swing + lean + kneeA, 9));
    p.backLeg.setAttribute('points', limb(hipX, hipY, b * swing + lean, 9, b * swing + lean + kneeB, 9));

    var armSwing = swing * 0.85;
    p.frontArm.setAttribute('points', limb(shoulderX, shoulderY, -a * armSwing + lean, 7, -a * armSwing + lean - 0.5 - effort * 0.7, 6.5));
    p.backArm.setAttribute('points', limb(shoulderX, shoulderY, -b * armSwing + lean, 7, -b * armSwing + lean - 0.5 - effort * 0.7, 6.5));

    p.body.setAttribute('x1', hipX); p.body.setAttribute('y1', hipY);
    p.body.setAttribute('x2', shoulderX); p.body.setAttribute('y2', shoulderY);

    var headX = shoulderX - lean * 2.2, headY = shoulderY - 5.2;
    p.head.setAttribute('cx', headX);
    p.head.setAttribute('cy', headY);
    if (p.band) {
      p.band.setAttribute('x1', headX - 5); p.band.setAttribute('y1', headY - 1.6);
      p.band.setAttribute('x2', headX + 5); p.band.setAttribute('y2', headY - 2.6);
    }
  }

  /* A wave instead of a walk: the near arm goes up and flaps. */
  function poseWave(fig, t) {
    pose(fig, t * 1.4, 0, true);
    var p = fig.parts;
    var flap = -2.5 + Math.sin(t * 9) * 0.35;
    p.frontArm.setAttribute('points', limb(12, 11.5, flap, 7, flap - 0.35, 6.5));
  }

  // ------------------------------------------------------------------- stage
  var layer = document.createElement('div');
  layer.className = 'mascot';
  layer.setAttribute('aria-hidden', 'true');

  var svg = node('svg', { class: 'mascot__svg', viewBox: '0 0 24 40', width: UNIT * 0.6, height: UNIT });
  var itSvg = node('svg', { class: 'mascot__svg', viewBox: '0 0 24 40', width: UNIT * 0.6, height: UNIT });

  var runner = makeFigure(false);
  var chaser = makeFigure(true);
  svg.appendChild(runner.g);
  itSvg.appendChild(chaser.g);

  var runnerBox = document.createElement('div');
  runnerBox.className = 'mascot__actor';
  runnerBox.appendChild(svg);

  var chaserBox = document.createElement('div');
  chaserBox.className = 'mascot__actor mascot__actor--it';
  chaserBox.appendChild(itSvg);

  var puff = document.createElement('span');
  puff.className = 'mascot__puff';
  puff.textContent = 'TAG!';

  layer.appendChild(runnerBox);
  layer.appendChild(chaserBox);
  layer.appendChild(puff);
  document.body.appendChild(layer);

  // ------------------------------------------------------------------- state
  /* A hidden or not-yet-laid-out window reports zero, and a stage with no width
     pins both figures to the same spot in the corner. Give it a floor. */
  function width() { return Math.max(window.innerWidth || 0, 320); }

  var A = { x: width() * 0.25, dir: 1, phase: 0, effort: 0, mode: 'walk', until: 2.5, it: false, box: runnerBox, fig: runner };
  var B = { x: -80, dir: 1, phase: 0, effort: 1, mode: 'off', until: 0, it: true, box: chaserBox, fig: chaser };
  var sinceChase = 0;
  var nextChase = 14 + Math.random() * 12;
  var puffUntil = 0;
  var darkCheck = 0;
  var footer = document.querySelector('.footer');

  function place(actor) {
    // The figure is drawn facing right; flip the whole box to turn it around.
    actor.box.style.transform = 'translateX(' + actor.x.toFixed(1) + 'px) scaleX(' + actor.dir + ')';
  }

  function edgeGuard(actor, margin) {
    var w = width();
    if (actor.x < margin) { actor.x = margin; actor.dir = 1; return true; }
    if (actor.x > w - margin - UNIT * 0.6) { actor.x = w - margin - UNIT * 0.6; actor.dir = -1; return true; }
    return false;
  }

  /* The band never swaps bodies — it swaps shoulders. A keeps the screen, B
     comes and goes, and whichever of them is *it* does the chasing. So the
     resident spends one visit running away and the next one running someone
     down, which is what the game actually feels like. */
  function wear(actor, isIt) {
    actor.it = isIt;
    actor.fig.g.classList.toggle('is-it', isIt);
  }

  function startChase() {
    // The visitor arrives from the far side, so there is a run to watch.
    var fromLeft = A.x > width() / 2;
    B.x = fromLeft ? -UNIT : width() + UNIT;
    B.dir = fromLeft ? 1 : -1;
    B.phase = 0;
    wear(B, !A.it);                 // one of them is it, never both, never neither
    B.mode = 'chase';
    A.mode = A.it ? 'hunt' : 'flee';
    A.until = 0;
  }

  function tagged() {
    var caught = A.it ? B : A;      // whoever was not it has just been caught
    var catcher = A.it ? A : B;
    puff.style.left = (caught.x + UNIT * 0.3) + 'px';
    puff.classList.add('is-on');
    puffUntil = 0.9;

    wear(caught, true);
    wear(catcher, false);

    A.mode = 'stunned'; A.until = 1.0; A.effort = 0;
    B.mode = 'leave';
    B.dir = B.x > width() / 2 ? 1 : -1;
    sinceChase = 0;
    nextChase = 16 + Math.random() * 14;
  }

  // A tap is a tag. You are allowed to join in: poke the one who is not it and
  // the band moves, exactly as if the other had caught them.
  [runnerBox, chaserBox].forEach(function (box, index) {
    box.addEventListener('click', function () {
      var actor = index === 0 ? A : B;
      var other = index === 0 ? B : A;
      if (actor.it || (actor === B && B.mode === 'off')) return;
      puff.style.left = (actor.x + UNIT * 0.3) + 'px';
      puff.classList.add('is-on');
      puffUntil = 0.9;
      wear(actor, true);
      wear(other, false);
      if (actor === A) { A.mode = 'stunned'; A.until = 0.8; A.effort = 0; }
      if (B.mode === 'chase') B.mode = 'leave';
    });
  });

  // -------------------------------------------------------------------- loop
  var last = 0;
  var frame = null;

  function step(now) {
    frame = requestAnimationFrame(step);
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    advance(dt);
  }

  function advance(dt) {
    if (puffUntil > 0) {
      puffUntil -= dt;
      if (puffUntil <= 0) puff.classList.remove('is-on');
    }

    // --- the one being chased ------------------------------------------
    A.until -= dt;
    if (A.mode === 'walk' && A.until <= 0) {
      A.mode = Math.random() < 0.45 ? 'idle' : 'walk';
      A.until = 2 + Math.random() * 4;
      if (Math.random() < 0.4) A.dir = -A.dir;
    } else if (A.mode === 'idle' && A.until <= 0) {
      A.mode = Math.random() < 0.35 ? 'wave' : 'walk';
      A.until = A.mode === 'wave' ? 1.6 : 3 + Math.random() * 4;
    } else if (A.mode === 'wave' && A.until <= 0) {
      A.mode = 'walk';
      A.until = 3 + Math.random() * 4;
    } else if (A.mode === 'stunned' && A.until <= 0) {
      A.mode = 'walk';
      A.until = 2 + Math.random() * 3;
    }

    var running = (A.mode === 'flee' || A.mode === 'hunt');
    var speed = 0;
    if (A.mode === 'walk') { speed = WALK; A.effort += (0 - A.effort) * dt * 3; }
    else if (running) { speed = RUN; A.effort += (1 - A.effort) * dt * 4; }

    if (speed) {
      A.x += A.dir * speed * dt;
      // Cornered while fleeing, turn and go the other way. Hunting, the wall
      // is just a wall — keep facing the one being chased.
      if (edgeGuard(A, 8) && A.mode === 'flee') A.dir = -A.dir;
      A.phase += dt * (running ? 15 : 7.5);
    } else {
      A.phase += dt * 2;
    }

    if (A.mode === 'wave') poseWave(A.fig, A.phase);
    else pose(A.fig, A.phase, A.effort, A.mode === 'idle' || A.mode === 'stunned');
    place(A);

    // --- *it* -----------------------------------------------------------
    if (B.mode === 'off') {
      sinceChase += dt;
      if (sinceChase > nextChase) startChase();
    } else if (B.mode === 'chase') {
      /* The one wearing the band closes; the other one keeps away. Which of
         the two that is flips every time somebody gets caught. */
      if (B.it) {
        B.dir = (A.x > B.x) ? 1 : -1;
        B.x += B.dir * RUN * 1.12 * dt;
        if (A.mode === 'flee') A.dir = (A.x < B.x) ? -1 : 1;
      } else {
        // B is the hunted one: run from A, but always onto the screen first.
        var offstage = B.x < 0 || B.x > width() - UNIT * 0.6;
        B.dir = offstage ? (B.x < 0 ? 1 : -1) : ((A.x > B.x) ? -1 : 1);
        B.x += B.dir * RUN * 0.92 * dt;
        A.dir = (A.x > B.x) ? -1 : 1;
      }
      B.phase += dt * 16;
      pose(B.fig, B.phase, 1, false);
      place(B);
      if (Math.abs(A.x - B.x) < CATCH) tagged();
    } else if (B.mode === 'leave') {
      B.x += B.dir * RUN * 0.7 * dt;
      B.phase += dt * 11;
      pose(B.fig, B.phase, 0.6, false);
      place(B);
      if (B.x < -UNIT * 1.5 || B.x > width() + UNIT * 1.5) { B.mode = 'off'; sinceChase = 0; }
    }

    // Nobody sprints at nothing: once the visitor is gone, fold the chase —
    // from either end of it — back into a stroll.
    if ((A.mode === 'flee' || A.mode === 'hunt') && B.mode !== 'chase') {
      A.mode = 'walk';
      A.until = 2;
    }

    /* The footer is nearly black, and an ink figure standing on it is an ink
       figure nobody can see. Four times a second, ask whether the footer has
       reached the strip, and hand the mascot a chalk line while it has. */
    darkCheck -= dt;
    if (footer && darkCheck <= 0) {
      darkCheck = 0.25;
      var strip = (window.innerHeight || 0) - 60;
      layer.classList.toggle('on-dark', footer.getBoundingClientRect().top < strip);
    }

    layer.classList.toggle('is-chase', B.mode === 'chase');
  }

  /* Reading beats watching. The strip sits over the last inch of the page, so
     while someone is actually scrolling the mascot steps out of the way and
     comes back when they settle. On its own timer, not the animation loop —
     the loop stops with the tab, and a mascot that went away mid-scroll would
     never come back. */
  var awayTimer = null;
  window.addEventListener('scroll', function () {
    layer.classList.add('is-away');
    clearTimeout(awayTimer);
    awayTimer = setTimeout(function () { layer.classList.remove('is-away'); }, 700);
  }, { passive: true });

  function start() { if (!frame) { last = 0; frame = requestAnimationFrame(step); } }
  function stop() { if (frame) { cancelAnimationFrame(frame); frame = null; } }

  /* Debug hook, same idea as __arcade in arcade.js. A chase starts every
     fifteen-odd seconds, which is far too slow to watch on purpose, so this
     advances the simulation without waiting for real time:
        __mascot.step(0.016, 600)   ten seconds of walking
        __mascot.chase()            send *it* in now
     Nothing in the site calls it. */
  window.__mascot = {
    step: function (dt, times) {
      for (var i = 0; i < (times || 1); i++) advance(dt);
    },
    chase: function () { startChase(); },
    state: function () {
      return {
        resident: { x: Math.round(A.x), mode: A.mode, dir: A.dir, it: A.it },
        visitor: { x: Math.round(B.x), mode: B.mode, dir: B.dir, it: B.it },
        puff: puff.classList.contains('is-on')
      };
    }
  };

  // A hidden tab should cost nothing at all.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  // Someone who turns reduced motion on mid-visit means it now, not next time.
  if (motion && motion.addEventListener) {
    motion.addEventListener('change', function (e) {
      if (e.matches) { stop(); layer.remove(); }
    });
  }

  function sizeToViewport() {
    UNIT = unitFor();
    [svg, itSvg].forEach(function (s) {
      s.setAttribute('width', UNIT * 0.6);
      s.setAttribute('height', UNIT);
    });
    edgeGuard(A, 8);
    place(A);
    place(B);
  }
  window.addEventListener('resize', sizeToViewport);

  sizeToViewport();
  pose(A.fig, 0, 0, true);
  pose(B.fig, 0, 1, false);
  start();
})();
