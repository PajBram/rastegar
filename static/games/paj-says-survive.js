/* PAJ SAYS SURVIVE — a top-down survival shooter.
 *
 * You fly. The gun fires by itself, straight ahead. Everything else on the
 * map is coming for you, and it keeps coming.
 *
 * Step one of the build: flight, auto-fire and one kind of enemy. Waves,
 * upgrades, the boss and the sound land on top of this.
 */
(function () {
  'use strict';
  if (!window.Arcade) return;

  var W = 560, H = 520;

  /* Which way the gun points. 'facing' is the direction you last flew — on a
   * phone, the direction of your thumb. 'nearest' locks onto the closest
   * enemy instead. One word to switch if the aim ever feels wrong. */
  var AIM = 'facing';

  // --- flight ------------------------------------------------------------
  var SPEED = 268;              // px per second, flat out
  var DAMP = 3.2;              // how quickly you coast to a stop
  var ACCEL = SPEED * DAMP;    // picked so the two above give exactly SPEED
  var PLAYER_R = 13;
  var INVULN = 1.2;

  // --- the gun -----------------------------------------------------------
  var FIRE_EVERY = 0.185;
  var BULLET_SPEED = 470;
  var BULLET_LIFE = 1.15;
  var BULLET_R = 4;

  // --- thumb -------------------------------------------------------------
  var DEAD_ZONE = 14;          // thumb this close to you: hover in place
  var FULL_THROTTLE = 62;      // and this far away: everything you have

  var TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers

  function len(x, y) { return Math.sqrt(x * x + y * y); }

  /** Shortest way round from a to b, so the figure never spins the long way. */
  function turn(a, b, amount) {
    var d = (b - a + Math.PI * 3) % TAU - Math.PI;
    return a + d * amount;
  }

  function particles(game, x, y, count, color, power) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * TAU;
      var s = power * (0.35 + Math.random() * 0.85);
      game.bits.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.3 + Math.random() * 0.28,
        max: 0.58,
        size: 2 + Math.random() * 3,
        color: color
      });
    }
  }

  // ---------------------------------------------------------------- spawning

  function spawnRusher(game) {
    var edge = Math.floor(Math.random() * 4);
    var x, y;
    if (edge === 0) { x = Math.random() * W; y = -34; }
    else if (edge === 1) { x = W + 34; y = Math.random() * H; }
    else if (edge === 2) { x = Math.random() * W; y = H + 34; }
    else { x = -34; y = Math.random() * H; }

    game.enemies.push({
      x: x, y: y,
      vx: 0, vy: 0,
      r: 13,
      hp: 1,
      speed: 98 + Math.random() * 48,
      hurt: 0,
      bob: Math.random() * TAU
    });
  }

  // ------------------------------------------------------------------- input

  /** The direction the player is asking for, as a vector no longer than 1. */
  function steering(game) {
    var kx = 0, ky = 0;
    var k = game.keys;
    if (k.ArrowLeft || k.a || k.A) kx -= 1;
    if (k.ArrowRight || k.d || k.D) kx += 1;
    if (k.ArrowUp || k.w || k.W) ky -= 1;
    if (k.ArrowDown || k.s || k.S) ky += 1;

    if (kx || ky) {
      var m = len(kx, ky);
      return { x: kx / m, y: ky / m, aimed: true };
    }

    if (game.pointer.down) {
      var dx = game.pointer.x - game.px;
      var dy = game.pointer.y - game.py;
      var d = len(dx, dy);
      if (d < DEAD_ZONE) return { x: 0, y: 0, aimed: false };
      var throttle = Math.min(1, (d - DEAD_ZONE) / (FULL_THROTTLE - DEAD_ZONE));
      return { x: dx / d * throttle, y: dy / d * throttle, aimed: true };
    }

    return { x: 0, y: 0, aimed: false };
  }

  function aimAngle(game) {
    if (AIM === 'nearest') {
      var best = null, bestD = Infinity;
      for (var i = 0; i < game.enemies.length; i++) {
        var e = game.enemies[i];
        var d = len(e.x - game.px, e.y - game.py);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) return Math.atan2(best.y - game.py, best.x - game.px);
    }
    return game.facing;
  }

  function fire(game) {
    var a = aimAngle(game);
    game.bullets.push({
      x: game.px + Math.cos(a) * 16,
      y: game.py + Math.sin(a) * 16,
      vx: Math.cos(a) * BULLET_SPEED,
      vy: Math.sin(a) * BULLET_SPEED,
      life: BULLET_LIFE,
      damage: 1
    });
    game.recoil = 1;
  }

  function takeHit(game, enemy) {
    if (game.invuln > 0) return;
    game.lives -= 1;
    game.invuln = INVULN;
    game.shake = 0.45;
    game.flash = { color: '#ff2d55', life: 0.3 };

    var a = Math.atan2(game.py - enemy.y, game.px - enemy.x);   // knocked back
    game.vx += Math.cos(a) * 300;
    game.vy += Math.sin(a) * 300;
    particles(game, game.px, game.py, 14, '#ff2d55', 210);

    if (game.lives <= 0) game.over();
  }

  function killEnemy(game, enemy, index) {
    game.enemies.splice(index, 1);
    game.kills += 1;
    game.score += 15;
    game.shake = Math.max(game.shake, 0.12);
    particles(game, enemy.x, enemy.y, 10, '#111114', 190);
  }

  // ---------------------------------------------------------------- painting

  var tone = null;
  var tonePattern = null;

  /** A screentone tile, built once and repeated. Cheaper than a dot per frame. */
  function screentone(ctx) {
    if (!tonePattern) {
      tone = document.createElement('canvas');
      tone.width = 14;
      tone.height = 14;
      var g = tone.getContext('2d');
      g.fillStyle = 'rgba(17,17,20,.12)';
      g.beginPath(); g.arc(3.5, 3.5, 1.5, 0, TAU); g.fill();
      g.beginPath(); g.arc(10.5, 10.5, 1.5, 0, TAU); g.fill();
      tonePattern = ctx.createPattern(tone, 'repeat');
    }
    return tonePattern;
  }

  function drawPlayer(ctx, game) {
    // Blink through the invulnerable window rather than vanish.
    if (game.invuln > 0 && Math.floor(game.invuln * 18) % 2) return;

    var flap = Math.sin(game.time * 17) * 0.5 + 0.5;      // 0..1
    ctx.save();
    ctx.translate(game.px, game.py);
    ctx.rotate(game.facing);

    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111114';
    ctx.lineWidth = 3;

    // wings, one above and one below, beating as you fly
    var span = 15 + flap * 11;
    ctx.fillStyle = '#fffdf8';
    for (var side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(-2, side * 5);
      ctx.quadraticCurveTo(-14, side * (span + 4), -20, side * span);
      ctx.quadraticCurveTo(-8, side * (span * 0.5), 4, side * 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // body, pointing the way the gun points
    ctx.fillStyle = '#111114';
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(-2, -9);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-2, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // red visor, and a muzzle glow just after a shot
    ctx.fillStyle = '#ff2d55';
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(2, -4);
    ctx.lineTo(2, 4);
    ctx.closePath();
    ctx.fill();

    if (game.recoil > 0) {
      ctx.globalAlpha = game.recoil;
      ctx.fillStyle = '#ff2d55';
      ctx.beginPath();
      ctx.arc(20, 0, 4 + game.recoil * 5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawEnemy(ctx, game, e) {
    var wob = Math.sin(game.time * 9 + e.bob) * 2;
    ctx.save();
    ctx.translate(e.x, e.y + wob);
    ctx.rotate(Math.atan2(e.vy, e.vx));
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111114';
    ctx.lineWidth = 3;
    ctx.fillStyle = e.hurt > 0 ? '#ff2d55' : '#111114';

    ctx.beginPath();                       // a hunched, clawed thing
    ctx.moveTo(14, 0);
    ctx.lineTo(1, -11);
    ctx.lineTo(-9, -13);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 13);
    ctx.lineTo(1, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = e.hurt > 0 ? '#111114' : '#ff2d55';
    ctx.beginPath();                       // one eye
    ctx.arc(6, 0, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** A tick on the frame for anything still outside the arena. */
  function drawWarning(ctx, e) {
    var x = Math.min(W - 9, Math.max(9, e.x));
    var y = Math.min(H - 9, Math.max(9, e.y));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(e.y - y, e.x - x) + Math.PI);
    ctx.fillStyle = '#ff2d55';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -6);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------- mount

  window.Arcade.mount({
    slug: 'paj-says-survive',
    title: 'PAJ SAYS',
    width: W,
    height: H,
    lives: 3,
    intro: 'They come from every edge and they do not stop. The gun fires by itself — all you do is fly, and point.',
    hint: 'Arrow keys or WASD to fly. On a phone, hold your thumb on the panel and you fly to it.',
    overTitle: 'Wings down',

    init: function (game) {
      game.px = W / 2;
      game.py = H / 2;
      game.vx = 0;
      game.vy = 0;
      game.facing = -Math.PI / 2;
      game.fireIn = 0;
      game.recoil = 0;
      game.invuln = 0;
      game.shake = 0;
      game.flash = null;
      game.kills = 0;
      game.bullets = [];
      game.enemies = [];
      game.bits = [];
      game.spawnIn = 0.9;
    },

    hud: function (game) {
      var hearts = '';
      for (var i = 0; i < game.lives; i++) hearts += '◆';
      return game.kills + ' DOWN   ' + (hearts || '-');
    },

    summary: function (game) {
      return game.kills + ' shot down  •  ' + game.time.toFixed(1) + 's in the air';
    },

    update: function (dt, game) {
      var i, e, b;

      // --- fly -----------------------------------------------------------
      var input = steering(game);
      var damp = Math.exp(-DAMP * dt);
      game.vx = game.vx * damp + input.x * ACCEL * dt;
      game.vy = game.vy * damp + input.y * ACCEL * dt;
      game.px += game.vx * dt;
      game.py += game.vy * dt;

      if (input.aimed) {
        var want = Math.atan2(input.y, input.x);
        game.facing = turn(game.facing, want, Math.min(1, dt * 18));
      }

      // walls push back rather than stop you dead
      if (game.px < PLAYER_R) { game.px = PLAYER_R; game.vx = Math.abs(game.vx) * 0.35; }
      if (game.px > W - PLAYER_R) { game.px = W - PLAYER_R; game.vx = -Math.abs(game.vx) * 0.35; }
      if (game.py < PLAYER_R) { game.py = PLAYER_R; game.vy = Math.abs(game.vy) * 0.35; }
      if (game.py > H - PLAYER_R) { game.py = H - PLAYER_R; game.vy = -Math.abs(game.vy) * 0.35; }

      // --- shoot ----------------------------------------------------------
      game.fireIn -= dt;
      if (game.fireIn <= 0) {
        fire(game);
        game.fireIn += FIRE_EVERY;
        if (game.fireIn < 0) game.fireIn = FIRE_EVERY;
      }

      for (i = game.bullets.length - 1; i >= 0; i--) {
        b = game.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
          game.bullets.splice(i, 1);
        }
      }

      // --- enemies ---------------------------------------------------------
      game.spawnIn -= dt;
      if (game.spawnIn <= 0) {
        spawnRusher(game);
        game.spawnIn = Math.max(0.35, 1.15 - game.time * 0.012);
      }

      for (i = game.enemies.length - 1; i >= 0; i--) {
        e = game.enemies[i];
        e.hurt = Math.max(0, e.hurt - dt);

        var dx = game.px - e.x, dy = game.py - e.y;
        var d = len(dx, dy) || 1;
        e.vx = dx / d * e.speed;
        e.vy = dy / d * e.speed;
        e.x += e.vx * dt;
        e.y += e.vy * dt;

        var caught = false;
        for (var j = game.bullets.length - 1; j >= 0; j--) {
          b = game.bullets[j];
          if (len(b.x - e.x, b.y - e.y) > e.r + BULLET_R) continue;
          game.bullets.splice(j, 1);
          e.hp -= b.damage;
          e.hurt = 0.12;
          particles(game, b.x, b.y, 3, '#ff2d55', 120);
          if (e.hp <= 0) { killEnemy(game, e, i); caught = true; break; }
        }
        if (caught) continue;

        if (len(dx, dy) < e.r + PLAYER_R) takeHit(game, e);
      }

      // --- dressing ---------------------------------------------------------
      game.invuln = Math.max(0, game.invuln - dt);
      game.shake = Math.max(0, game.shake - dt);
      game.recoil = Math.max(0, game.recoil - dt * 9);
      if (game.flash) { game.flash.life -= dt; if (game.flash.life <= 0) game.flash = null; }

      for (i = game.bits.length - 1; i >= 0; i--) {
        var p = game.bits[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= dt;
        if (p.life <= 0) game.bits.splice(i, 1);
      }

      game.score += dt * 10;              // staying up pays a steady wage
    },

    draw: function (ctx, game) {
      var shake = game.shake > 0 ? game.shake : 0;
      ctx.save();
      if (shake) ctx.translate((Math.random() - 0.5) * 16 * shake, (Math.random() - 0.5) * 16 * shake);

      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(-24, -24, W + 48, H + 48);
      ctx.fillStyle = screentone(ctx);
      ctx.fillRect(-24, -24, W + 48, H + 48);

      // speedlines, only once you are really moving
      var speed = len(game.vx, game.vy);
      if (speed > SPEED * 0.5) {
        var strength = Math.min(1, (speed - SPEED * 0.5) / (SPEED * 0.5));
        var back = Math.atan2(-game.vy, -game.vx);
        ctx.strokeStyle = 'rgba(17,17,20,' + (0.1 + strength * 0.22).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var s = 0; s < 11; s++) {
          var off = (Math.random() - 0.5) * 46;
          var sx = game.px + Math.cos(back) * (22 + Math.random() * 20) - Math.sin(back) * off;
          var sy = game.py + Math.sin(back) * (22 + Math.random() * 20) + Math.cos(back) * off;
          var runLength = 24 + Math.random() * 54 * strength;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(back) * runLength, sy + Math.sin(back) * runLength);
        }
        ctx.stroke();
      }

      game.bits.forEach(function (p) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      });
      ctx.globalAlpha = 1;

      game.enemies.forEach(function (e) {
        if (e.x < -6 || e.x > W + 6 || e.y < -6 || e.y > H + 6) drawWarning(ctx, e);
        else drawEnemy(ctx, game, e);
      });

      ctx.fillStyle = '#111114';
      game.bullets.forEach(function (b) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillRect(-9, -2, 18, 4);
        ctx.fillStyle = '#ff2d55';
        ctx.fillRect(3, -2, 6, 4);
        ctx.restore();
        ctx.fillStyle = '#111114';
      });

      drawPlayer(ctx, game);

      if (game.flash) {
        ctx.globalAlpha = Math.max(0, game.flash.life * 1.6);
        ctx.fillStyle = game.flash.color;
        ctx.fillRect(-24, -24, W + 48, H + 48);
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // the panel border sits outside the shake, so the frame never wobbles
      ctx.strokeStyle = '#111114';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, W - 8, H - 8);
    }
  });
})();
