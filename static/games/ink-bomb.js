/* INK BOMB — one drop, one chain.
 *
 * You get a single detonation per round. It blooms, and anything it touches
 * blooms too. The whole game happens in the second before you commit: where
 * the crowd is going, not where it is.
 */
(function () {
  'use strict';
  if (!window.Arcade) return;

  var W = 620, H = 460;
  var GROW = 0.4, HOLD = 0.58, FADE = 0.4;   // seconds of a bloom's life
  var MAX_R = 80;

  function roundPlan(level) {
    // The field fills up to 50 dots, and the quota keeps climbing after that:
    // the last rounds ask for nearly every dot on the page.
    var dots = Math.min(18 + level * 2, 50);
    var share = Math.min(0.10 + level * 0.030, 0.98);
    return { dots: dots, target: Math.max(1, Math.round(dots * share)) };
  }

  function fillRound(game) {
    var plan = roundPlan(game.level);
    game.plan = plan;
    game.dots = [];
    game.blasts = [];
    game.caught = 0;
    game.fired = false;
    game.settle = 0;
    var speed = 34 + game.level * 4;
    for (var i = 0; i < plan.dots; i++) {
      var angle = Math.random() * 6.2832;
      game.dots.push({
        x: 40 + Math.random() * (W - 80),
        y: 40 + Math.random() * (H - 80),
        vx: Math.cos(angle) * speed * (0.6 + Math.random() * 0.8),
        vy: Math.sin(angle) * speed * (0.6 + Math.random() * 0.8),
        wobble: Math.random() * 6.28,
        dead: false
      });
    }
  }

  function bloom(game, x, y) {
    game.blasts.push({ x: x, y: y, t: 0, r: 0 });
  }

  function detonate(game, x, y) {
    if (game.fired || game.between > 0) return;
    game.fired = true;
    bloom(game, x, y);
  }

  window.Arcade.mount({
    slug: 'ink-bomb',
    title: 'INK BOMB',
    width: W,
    height: H,
    lives: 3,
    intro: 'One drop of ink per round. Everything it touches goes off too.',
    hint: 'Tap where you want it. On a keyboard: arrows to move the crosshair, Space to drop.',
    overTitle: 'Out of ink',

    init: function (game) {
      game.level = 1;
      game.cross = { x: W / 2, y: H / 2, shown: false };
      game.between = 0;
      game.banner = null;
      game.chainBest = 0;
      fillRound(game);
    },

    hud: function (game) {
      var hearts = '';
      for (var i = 0; i < game.lives; i++) hearts += '◆';
      return 'round ' + game.level + '   ' + game.caught + '/' + game.plan.target + '   ' + (hearts || '-');
    },

    summary: function (game) {
      return 'reached round ' + game.level + '  •  best chain ' + game.chainBest;
    },

    keyPress: function (key, game) {
      if (key === ' ' || key === 'Enter') {
        game.cross.shown = true;
        detonate(game, game.cross.x, game.cross.y);
      }
    },

    tap: function (point, game) {
      game.cross.shown = false;
      detonate(game, point.x, point.y);
    },

    update: function (dt, game) {
      if (game.banner) { game.banner.life -= dt; if (game.banner.life <= 0) game.banner = null; }

      // keyboard crosshair
      var speed = 340 * dt, moved = false;
      if (game.keys.ArrowLeft) { game.cross.x -= speed; moved = true; }
      if (game.keys.ArrowRight) { game.cross.x += speed; moved = true; }
      if (game.keys.ArrowUp) { game.cross.y -= speed; moved = true; }
      if (game.keys.ArrowDown) { game.cross.y += speed; moved = true; }
      if (moved) {
        game.cross.shown = true;
        game.cross.x = Math.max(10, Math.min(W - 10, game.cross.x));
        game.cross.y = Math.max(10, Math.min(H - 10, game.cross.y));
      }

      if (game.between > 0) {
        game.between -= dt;
        if (game.between <= 0) fillRound(game);
        return;
      }

      var i;
      for (i = 0; i < game.dots.length; i++) {
        var d = game.dots[i];
        if (d.dead) continue;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.wobble += dt * 3;
        if (d.x < 12 || d.x > W - 12) { d.vx *= -1; d.x = Math.max(12, Math.min(W - 12, d.x)); }
        if (d.y < 12 || d.y > H - 12) { d.vy *= -1; d.y = Math.max(12, Math.min(H - 12, d.y)); }
      }

      for (i = game.blasts.length - 1; i >= 0; i--) {
        var b = game.blasts[i];
        b.t += dt;
        b.r = b.t < GROW ? MAX_R * (b.t / GROW)
            : b.t < GROW + HOLD ? MAX_R
            : MAX_R * Math.max(0, 1 - (b.t - GROW - HOLD) / FADE);

        if (b.t < GROW + HOLD) {          // only a live bloom can set others off
          for (var j = 0; j < game.dots.length; j++) {
            var dot = game.dots[j];
            if (dot.dead) continue;
            var dx = dot.x - b.x, dy = dot.y - b.y;
            if (dx * dx + dy * dy < b.r * b.r) {
              dot.dead = true;
              game.caught += 1;
              game.chainBest = Math.max(game.chainBest, game.caught);
              game.score += 40 + game.caught * 12;
              bloom(game, dot.x, dot.y);
            }
          }
        }
        if (b.t > GROW + HOLD + FADE) game.blasts.splice(i, 1);
      }

      // the round is decided once every bloom has faded
      if (game.fired && game.blasts.length === 0) {
        if (game.caught >= game.plan.target) {
          game.score += 200 + game.level * 60;
          game.level += 1;
          game.banner = { text: 'CHAIN OF ' + game.caught, life: 1.2, good: true };
        } else {
          game.lives -= 1;
          game.banner = { text: 'ONLY ' + game.caught, life: 1.2, good: false };
          if (game.lives <= 0) { game.over(); return; }
        }
        game.between = 1.2;
      }
    },

    draw: function (ctx, game) {
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(17,17,20,.08)';
      for (var y = 10; y < H; y += 16) {
        for (var x = 10; x < W; x += 16) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, 6.2832);
          ctx.fill();
        }
      }

      game.dots.forEach(function (d) {
        if (d.dead) return;
        ctx.fillStyle = '#111114';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 8 + Math.sin(d.wobble) * 0.8, 0, 6.2832);
        ctx.fill();
      });

      game.blasts.forEach(function (b) {
        ctx.fillStyle = 'rgba(255,45,85,.30)';
        ctx.beginPath();
        blot(ctx, b.x, b.y, b.r, b.t);
        ctx.fill();
        ctx.strokeStyle = '#ff2d55';
        ctx.lineWidth = 3;
        ctx.beginPath();
        blot(ctx, b.x, b.y, b.r, b.t);
        ctx.stroke();
      });

      if (game.cross.shown && !game.fired && game.between <= 0) {
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(game.cross.x - 14, game.cross.y);
        ctx.lineTo(game.cross.x + 14, game.cross.y);
        ctx.moveTo(game.cross.x, game.cross.y - 14);
        ctx.lineTo(game.cross.x, game.cross.y + 14);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(game.cross.x, game.cross.y, 9, 0, 6.2832);
        ctx.stroke();
      }

      if (!game.fired && game.between <= 0) {
        ctx.fillStyle = 'rgba(17,17,20,.45)';
        ctx.font = '600 13px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        var quota = 'CATCH ' + game.plan.target + ' OF ' + game.plan.dots;
        if (game.plan.target >= game.plan.dots) quota = 'CATCH EVERY LAST ONE';
        ctx.fillText(quota, W / 2, H - 18);
      }

      if (game.banner) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(-0.04);
        ctx.textAlign = 'center';
        ctx.font = '700 44px Anton, Impact, sans-serif';
        ctx.fillStyle = game.banner.good ? '#111114' : '#ff2d55';
        ctx.fillText(game.banner.text, 0, 0);
        ctx.restore();
      }
    }
  });

  /** An ink blot: a circle that refuses to be a circle. */
  function blot(ctx, x, y, r, seed) {
    for (var i = 0; i <= 16; i++) {
      var a = (i / 16) * 6.2832;
      var wobble = 1 + Math.sin(a * 3 + seed * 4) * 0.07 + Math.cos(a * 5 - seed * 2) * 0.05;
      var px = x + Math.cos(a) * r * wobble;
      var py = y + Math.sin(a) * r * wobble;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
})();
