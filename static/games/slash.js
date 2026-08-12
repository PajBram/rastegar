/* SLASH — a reaction game.
 *
 * Enemies charge in from both sides. Cut the side they are on, but only once
 * they are inside the strike zone. Swinging at nothing costs you the combo,
 * and the combo is where the points live.
 */
(function () {
  'use strict';
  if (!window.Arcade) return;

  var W = 620, H = 440;
  var GROUND = H - 96;
  var REACH_FAR = 168;     // furthest a cut can land
  var REACH_NEAR = 32;     // closer than this and they are already on you
  var COOLDOWN = 0.16;

  function difficulty(t) {
    // Ramps over the first ninety seconds, then holds.
    return Math.min(t / 90, 1);
  }

  function spawnEnemy(game) {
    var d = difficulty(game.time);
    var side = Math.random() < 0.5 ? -1 : 1;
    var elite = Math.random() < 0.12 + d * 0.1;
    game.enemies.push({
      side: side,
      x: side < 0 ? -70 : W + 70,
      speed: (140 + d * 190) * (elite ? 1.35 : 1) * (0.9 + Math.random() * 0.25),
      elite: elite,
      bob: Math.random() * 6.28,
      dead: 0
    });
  }

  function cut(game, side) {
    if (game.cooldown > 0 || game.stun > 0) return;
    game.cooldown = COOLDOWN;
    game.swing = { side: side, life: 0.22 };

    var best = null;
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (e.dead || e.side !== side) continue;
      var dist = Math.abs(e.x - W / 2);
      if (dist <= REACH_FAR && (!best || dist < Math.abs(best.x - W / 2))) best = e;
    }

    if (!best) {                       // swung at air
      game.stun = 0.32;
      game.combo = 0;
      game.flash = { color: '#111114', life: 0.18 };
      return;
    }

    // Cutting late is worth more than cutting the moment they enter the zone.
    var nerve = 1 - Math.abs(best.x - W / 2) / REACH_FAR;
    best.dead = 0.28;
    game.combo += 1;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    game.cuts += 1;
    game.score += (best.elite ? 120 : 60) + game.combo * 12 + Math.round(nerve * 70);
    game.flash = { color: '#ff2d55', life: 0.12 };
  }

  function takeHit(game, enemy) {
    enemy.dead = 0.2;
    game.lives -= 1;
    game.combo = 0;
    game.shake = 0.35;
    game.stun = 0.25;
    game.flash = { color: '#ff2d55', life: 0.3 };
    if (game.lives <= 0) game.over();
  }

  window.Arcade.mount({
    slug: 'slash',
    title: 'SLASH',
    width: W,
    height: H,
    lives: 3,
    intro: 'They come from both sides. Cut the side they are on — but wait until they are close.',
    hint: 'Arrow keys or A / D. On a phone, tap the left or right half.',
    overTitle: 'Cut down',

    init: function (game) {
      game.enemies = [];
      game.combo = 0;
      game.bestCombo = 0;
      game.cuts = 0;
      game.cooldown = 0;
      game.stun = 0;
      game.shake = 0;
      game.swing = null;
      game.flash = null;
      game.nextSpawn = 0.8;
    },

    hud: function (game) {
      var hearts = '';
      for (var i = 0; i < game.lives; i++) hearts += '◆';
      return 'x' + game.combo + '   ' + (hearts || '-');
    },

    summary: function (game) {
      return game.cuts + ' clean cuts  •  best combo x' + game.bestCombo;
    },

    keyPress: function (key, game) {
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') cut(game, -1);
      if (key === 'ArrowRight' || key === 'd' || key === 'D') cut(game, 1);
    },

    tap: function (point, game) {
      cut(game, point.x < W / 2 ? -1 : 1);
    },

    update: function (dt, game) {
      var d = difficulty(game.time);
      game.cooldown -= dt;
      game.stun -= dt;
      game.shake = Math.max(0, game.shake - dt);
      if (game.swing) { game.swing.life -= dt; if (game.swing.life <= 0) game.swing = null; }
      if (game.flash) { game.flash.life -= dt; if (game.flash.life <= 0) game.flash = null; }

      game.nextSpawn -= dt;
      if (game.nextSpawn <= 0) {
        spawnEnemy(game);
        if (Math.random() < 0.18 + d * 0.22) spawnEnemy(game);   // pincer
        game.nextSpawn = (1.15 - d * 0.62) * (0.75 + Math.random() * 0.5);
      }

      for (var i = game.enemies.length - 1; i >= 0; i--) {
        var e = game.enemies[i];
        if (e.dead > 0) {
          e.dead -= dt;
          e.x += e.side * -260 * dt;                // knocked back
          if (e.dead <= 0) game.enemies.splice(i, 1);
          continue;
        }
        e.x += -e.side * e.speed * dt;
        if (Math.abs(e.x - W / 2) < REACH_NEAR) takeHit(game, e);
      }

      game.score += dt * 4;                          // surviving pays a little
    },

    draw: function (ctx, game) {
      var shakeX = game.shake > 0 ? (Math.random() - 0.5) * 12 * game.shake : 0;
      ctx.save();
      ctx.translate(shakeX, 0);

      // paper
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(-20, 0, W + 40, H);

      // speedlines rushing inward
      ctx.strokeStyle = 'rgba(17,17,20,.10)';
      ctx.lineWidth = 2;
      for (var i = 0; i < 26; i++) {
        var y = (i * 37 + (game.time * 90) % 37) % H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W / 2 - 60, H / 2 + (y - H / 2) * 0.35);
        ctx.moveTo(W, y);
        ctx.lineTo(W / 2 + 60, H / 2 + (y - H / 2) * 0.35);
        ctx.stroke();
      }

      // ground
      ctx.fillStyle = '#111114';
      ctx.fillRect(-20, GROUND + 46, W + 40, 8);

      // strike zone markers
      ctx.strokeStyle = 'rgba(255,45,85,.55)';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 3;
      [W / 2 - REACH_FAR, W / 2 + REACH_FAR].forEach(function (x) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND - 60);
        ctx.lineTo(x, GROUND + 46);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // enemies
      game.enemies.forEach(function (e) {
        var inRange = Math.abs(e.x - W / 2) <= REACH_FAR;
        ctx.save();
        ctx.translate(e.x, GROUND + Math.sin(game.time * 12 + e.bob) * 3);
        ctx.scale(e.side, 1);
        ctx.globalAlpha = e.dead > 0 ? Math.max(0, e.dead / 0.28) : 1;
        ctx.fillStyle = e.elite ? '#ff2d55' : '#111114';
        ctx.beginPath();                       // hunched silhouette
        ctx.moveTo(-26, 44);
        ctx.lineTo(-6, -34);
        ctx.lineTo(14, -38);
        ctx.lineTo(30, 8);
        ctx.lineTo(20, 44);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fffdf8';              // eye
        ctx.fillRect(2, -26, 14, 4);
        if (inRange && !e.dead) {                // a red tick when cuttable
          ctx.fillStyle = '#ff2d55';
          ctx.beginPath();
          ctx.moveTo(0, -50); ctx.lineTo(9, -62); ctx.lineTo(-9, -62);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });

      // player
      ctx.save();
      ctx.translate(W / 2, GROUND);
      ctx.fillStyle = game.stun > 0 ? '#8a8a92' : '#111114';
      ctx.beginPath();
      ctx.moveTo(-16, 44);
      ctx.lineTo(-8, -40);
      ctx.lineTo(8, -40);
      ctx.lineTo(16, 44);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff2d55';
      ctx.fillRect(-12, -52, 24, 10);
      if (game.swing) {
        var s = game.swing.side;
        ctx.strokeStyle = '#ff2d55';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(0, -6, 96, s < 0 ? Math.PI * 0.75 : -Math.PI * 0.25,
                s < 0 ? Math.PI * 1.25 : Math.PI * 0.25);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(17,17,20,.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(s * 170, -40);
        ctx.stroke();
      }
      ctx.restore();

      // combo shout
      if (game.combo > 2 && game.state === 'playing') {
        ctx.save();
        ctx.translate(W / 2, 58);
        ctx.rotate(-0.06);
        ctx.fillStyle = '#ff2d55';
        ctx.font = '700 44px Anton, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('x' + game.combo, 0, 0);
        ctx.restore();
      }

      if (game.flash) {
        ctx.globalAlpha = Math.max(0, game.flash.life * 1.6);
        ctx.fillStyle = game.flash.color;
        ctx.fillRect(-20, 0, W + 40, H);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }
  });
})();
