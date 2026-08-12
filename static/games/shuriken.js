/* SHURIKEN — two taps and a prayer.
 *
 * The aim sweeps on its own and so does the power. All you do is say when,
 * twice. Targets drift across the page and anything that reaches the far
 * edge costs you.
 */
(function () {
  'use strict';
  if (!window.Arcade) return;

  var W = 620, H = 460;
  var HAND = { x: 72, y: 372 };
  var GRAVITY = 640;
  var ANGLE_MIN = -1.45, ANGLE_MAX = -0.06;   // radians, up-right

  function targetSpeed(level) { return 20 + Math.min(level, 12) * 5; }

  // Two lanterns at a time to begin with, a third once you have found the range.
  function targetCount(level) { return Math.min(2 + Math.floor(level / 5), 4); }

  function spawnTarget(game, atLeft) {
    var small = Math.random() < 0.25 + Math.min(game.level, 8) * 0.02;
    game.targets.push({
      x: atLeft ? 190 + Math.random() * 230 : 110 + Math.random() * 120,
      y: 70 + Math.random() * 210,
      r: small ? 15 : 25,
      small: small,
      drift: (Math.random() - 0.5) * 30,
      phase: Math.random() * 6.28,
      hit: 0
    });
  }

  function throwStar(game) {
    var speed = 330 + game.power * 460;
    game.star = {
      x: HAND.x, y: HAND.y - 22,
      vx: Math.cos(game.angle) * speed,
      vy: Math.sin(game.angle) * speed,
      spin: 0,
      trail: []
    };
    game.phase = 'flight';
    game.throws += 1;
  }

  function commit(game) {
    if (game.phase === 'angle') { game.phase = 'power'; game.power = 0; game.powerUp = true; return; }
    if (game.phase === 'power') { throwStar(game); }
  }

  window.Arcade.mount({
    slug: 'shuriken',
    title: 'SHURIKEN',
    width: W,
    height: H,
    lives: 3,
    intro: 'The aim swings by itself. Tap once to fix the angle, once for the power.',
    hint: 'Space, or tap anywhere. Let a target reach the right edge and it costs you a life.',
    overTitle: 'Out of stars',

    init: function (game) {
      game.level = 1;
      game.phase = 'angle';
      game.angle = ANGLE_MIN;
      game.angleDir = 1;
      game.power = 0;
      game.powerUp = true;
      game.star = null;
      game.targets = [];
      game.combo = 0;
      game.bestCombo = 0;
      game.hitCount = 0;
      game.throws = 0;
      game.pop = null;
      game.flash = 0;
      for (var i = 0; i < 2; i++) spawnTarget(game, true);
    },

    hud: function (game) {
      var hearts = '';
      for (var i = 0; i < game.lives; i++) hearts += '◆';
      return 'x' + game.combo + '   ' + (hearts || '-');
    },

    summary: function (game) {
      return game.hitCount + ' of ' + game.throws + ' stars landed  •  best streak x' + game.bestCombo;
    },

    keyPress: function (key, game) {
      if (key === ' ' || key === 'Enter' || key === 'ArrowUp') commit(game);
    },

    tap: function (point, game) { commit(game); },

    update: function (dt, game) {
      game.flash = Math.max(0, game.flash - dt);
      if (game.pop) { game.pop.life -= dt; if (game.pop.life <= 0) game.pop = null; }

      var sweep = 0.85 + Math.min(game.level, 10) * 0.07;
      if (game.phase === 'angle') {
        game.angle += game.angleDir * sweep * dt;
        if (game.angle > ANGLE_MAX) { game.angle = ANGLE_MAX; game.angleDir = -1; }
        if (game.angle < ANGLE_MIN) { game.angle = ANGLE_MIN; game.angleDir = 1; }
      } else if (game.phase === 'power') {
        var rate = 1.1 + Math.min(game.level, 10) * 0.09;
        game.power += (game.powerUp ? rate : -rate) * dt;
        if (game.power >= 1) { game.power = 1; game.powerUp = false; }
        if (game.power <= 0) { game.power = 0; game.powerUp = true; }
      }

      // targets drift right and bob
      var speed = targetSpeed(game.level);
      for (var i = game.targets.length - 1; i >= 0; i--) {
        var t = game.targets[i];
        if (t.hit > 0) {
          t.hit -= dt;
          if (t.hit <= 0) game.targets.splice(i, 1);
          continue;
        }
        t.x += speed * dt;
        t.phase += dt * 1.6;
        t.y += Math.sin(t.phase) * t.drift * dt;
        t.y = Math.max(50, Math.min(H - 110, t.y));
        if (t.x > W + 30) {                       // escaped
          game.targets.splice(i, 1);
          game.lives -= 1;
          game.combo = 0;
          game.flash = 0.4;
          game.pop = { text: 'GONE', x: W - 60, y: t.y, life: 0.7, good: false };
          if (game.lives <= 0) { game.over(); return; }
          spawnTarget(game, false);
        }
      }
      while (game.targets.filter(function (t) { return t.hit <= 0; }).length < targetCount(game.level)) {
        spawnTarget(game, false);
      }

      if (game.star) {
        var s = game.star;
        s.trail.unshift({ x: s.x, y: s.y });
        if (s.trail.length > 14) s.trail.pop();
        s.vy += GRAVITY * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.spin += dt * 22;

        for (var j = 0; j < game.targets.length; j++) {
          var tg = game.targets[j];
          if (tg.hit > 0) continue;
          var dx = tg.x - s.x, dy = tg.y - s.y;
          if (dx * dx + dy * dy < (tg.r + 9) * (tg.r + 9)) {
            tg.hit = 0.35;
            game.combo += 1;
            game.bestCombo = Math.max(game.bestCombo, game.combo);
            game.hitCount += 1;
            var worth = (tg.small ? 260 : 120) + game.combo * 30 + Math.round(tg.x / 6);
            game.score += worth;
            game.pop = { text: '+' + worth, x: tg.x, y: tg.y, life: 0.7, good: true };
            game.star = null;
            game.phase = 'angle';
            if (game.hitCount % 4 === 0) game.level += 1;
            break;
          }
        }

        if (game.star && (s.y > H + 40 || s.x > W + 60 || s.x < -40)) {
          game.star = null;
          game.combo = 0;
          game.phase = 'angle';
        }
      }
    },

    draw: function (ctx, game) {
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(0, 0, W, H);

      // slanted speedlines, faint
      ctx.strokeStyle = 'rgba(17,17,20,.06)';
      ctx.lineWidth = 6;
      for (var i = -4; i < 14; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 60, 0);
        ctx.lineTo(i * 60 + 120, H);
        ctx.stroke();
      }

      ctx.fillStyle = '#111114';
      ctx.fillRect(0, H - 56, W, 6);

      // targets: paper lanterns on a string
      game.targets.forEach(function (t) {
        ctx.strokeStyle = 'rgba(17,17,20,.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.x, 0);
        ctx.lineTo(t.x, t.y - t.r);
        ctx.stroke();

        if (t.hit > 0) {                       // burst
          ctx.strokeStyle = '#ff2d55';
          ctx.lineWidth = 4;
          for (var k = 0; k < 7; k++) {
            var a = k * 0.9;
            var r = t.r + (0.35 - t.hit) * 150;
            ctx.beginPath();
            ctx.moveTo(t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r);
            ctx.lineTo(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r);
            ctx.stroke();
          }
          return;
        }
        ctx.fillStyle = t.small ? '#ff2d55' : '#fffdf8';
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y, t.r, t.r * 1.15, 0, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#111114';
        ctx.fillRect(t.x - t.r * 0.75, t.y - 3, t.r * 1.5, 6);
      });

      // thrower
      ctx.fillStyle = '#111114';
      ctx.beginPath();
      ctx.moveTo(HAND.x - 18, H - 50);
      ctx.lineTo(HAND.x - 8, HAND.y - 30);
      ctx.lineTo(HAND.x + 8, HAND.y - 30);
      ctx.lineTo(HAND.x + 18, H - 50);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(HAND.x, HAND.y - 46, 14, 0, 6.2832);
      ctx.fill();

      // aim line while sweeping or locked
      if (game.phase !== 'flight') {
        ctx.strokeStyle = game.phase === 'angle' ? '#ff2d55' : 'rgba(17,17,20,.4)';
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.moveTo(HAND.x, HAND.y - 22);
        ctx.lineTo(HAND.x + Math.cos(game.angle) * 150, HAND.y - 22 + Math.sin(game.angle) * 150);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // power bar
      if (game.phase === 'power') {
        ctx.fillStyle = 'rgba(17,17,20,.15)';
        ctx.fillRect(30, H - 40, 200, 16);
        ctx.fillStyle = '#ff2d55';
        ctx.fillRect(30, H - 40, 200 * game.power, 16);
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 3;
        ctx.strokeRect(30, H - 40, 200, 16);
      }

      if (game.star) {
        var s = game.star;
        s.trail.forEach(function (p, idx) {
          ctx.globalAlpha = (1 - idx / s.trail.length) * 0.35;
          ctx.fillStyle = '#ff2d55';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, 6.2832);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.spin);
        ctx.fillStyle = '#111114';
        ctx.beginPath();
        for (var b = 0; b < 8; b++) {
          var ang = b * 0.7854;
          var rad = b % 2 ? 4 : 13;
          var px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
          if (b === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (game.pop) {
        ctx.textAlign = 'center';
        ctx.font = '700 26px Anton, Impact, sans-serif';
        ctx.fillStyle = game.pop.good ? '#111114' : '#ff2d55';
        ctx.fillText(game.pop.text, game.pop.x, game.pop.y - (0.7 - game.pop.life) * 40);
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(17,17,20,.45)';
      ctx.font = '600 13px ui-monospace, Menlo, monospace';
      ctx.fillText(game.phase === 'angle' ? 'TAP TO FIX THE ANGLE'
                 : game.phase === 'power' ? 'TAP TO THROW' : '', 30, 30);

      if (game.flash > 0) {
        ctx.globalAlpha = game.flash;
        ctx.fillStyle = '#ff2d55';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
  });
})();
