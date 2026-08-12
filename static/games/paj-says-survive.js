/* PAJ SAYS SURVIVE — a top-down survival shooter.
 *
 * You fly. The gun fires by itself, straight ahead. Everything else on the
 * map is coming for you, and it keeps coming.
 *
 * The run is cut into waves with a breath between them. Every wave is bigger
 * and faster than the last, and new kinds of enemy keep arriving.
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

  // --- waves -------------------------------------------------------------
  var BREATHER = 2.4;          // seconds of quiet between waves
  var WAVE_CLEAR_POINTS = 25;  // times the wave number
  var OVERTIME = 7;            // seconds a wave may drag on before reinforcements
  var REINFORCE_EVERY = 2.4;

  var TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers

  function len(x, y) { return Math.sqrt(x * x + y * y); }

  /** Shortest way round from a to b, so the figure never spins the long way. */
  function turn(a, b, amount) {
    var d = (b - a + Math.PI * 3) % TAU - Math.PI;
    return a + d * amount;
  }

  /** Distance from a point to the segment a-b. Bullets are tested against the
   *  whole step they just took, not the dot they landed on: at this speed they
   *  would otherwise skip straight over a swarm mote between two frames. */
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return len(px - (ax + dx * t), py - (ay + dy * t));
  }

  function clockFace(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
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

  function outline(ctx, width) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111114';
    ctx.lineWidth = width || 3;
  }

  // ------------------------------------------------------------------ enemies
  /* One entry per kind of enemy. Behaviour and looks both live here, so adding
   * a fifth kind is adding one object — nothing else in the file knows the
   * names.
   *
   *   cost   how much of a wave's budget it eats (a wave is a budget)
   *   from   the first wave it can turn up in
   *   pack   spawns this many at once, as a swarm does
   */
  var TYPES = {
    rusher: {
      r: 13, hp: 1, speed: [98, 148], points: 15, cost: 1, from: 1,

      move: function (e, game, dt) {
        var dx = game.px - e.x, dy = game.py - e.y;
        var d = len(dx, dy) || 1;
        e.vx = dx / d * e.speed;
        e.vy = dy / d * e.speed;
      },

      draw: function (ctx, game, e) {
        ctx.rotate(Math.atan2(e.vy, e.vx));
        outline(ctx, 3);
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
        ctx.beginPath();
        ctx.arc(6, 0, 3, 0, TAU);
        ctx.fill();
      }
    },

    swarm: {
      r: 8, hp: 1, speed: [126, 168], points: 8, cost: 0.5, from: 2, pack: [5, 7],

      move: function (e, game, dt) {
        var dx = game.px - e.x, dy = game.py - e.y;
        var d = len(dx, dy) || 1;
        var weave = Math.sin(e.t * 6 + e.bob) * 0.55;    // never flies straight
        var a = Math.atan2(dy, dx) + weave;
        e.vx = Math.cos(a) * e.speed;
        e.vy = Math.sin(a) * e.speed;
      },

      draw: function (ctx, game, e) {
        ctx.rotate(e.t * 5 + e.bob);
        outline(ctx, 2.5);
        ctx.fillStyle = e.hurt > 0 ? '#ff2d55' : '#111114';
        ctx.beginPath();                       // a little four-pointed mote
        for (var i = 0; i < 4; i++) {
          var a = i * Math.PI / 2;
          ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
          ctx.lineTo(Math.cos(a + Math.PI / 4) * 4, Math.sin(a + Math.PI / 4) * 4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    },

    tank: {
      r: 26, hp: 9, speed: [40, 56], points: 60, cost: 4, from: 3,

      move: function (e, game, dt) {
        var dx = game.px - e.x, dy = game.py - e.y;
        var d = len(dx, dy) || 1;
        e.vx = dx / d * e.speed;
        e.vy = dy / d * e.speed;
      },

      draw: function (ctx, game, e) {
        ctx.rotate(Math.atan2(e.vy, e.vx));
        outline(ctx, 4);
        ctx.fillStyle = e.hurt > 0 ? '#ff2d55' : '#111114';
        ctx.beginPath();                       // a slab with shoulders
        ctx.moveTo(24, 0);
        ctx.lineTo(8, -22);
        ctx.lineTo(-16, -24);
        ctx.lineTo(-22, 0);
        ctx.lineTo(-16, 24);
        ctx.lineTo(8, 22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // a damage read-out, because nine hits is a long time to wonder
        ctx.rotate(-Math.atan2(e.vy, e.vx));
        var frac = e.hp / e.maxhp;
        ctx.fillStyle = '#fffdf8';
        ctx.fillRect(-18, -34, 36, 6);
        ctx.fillStyle = '#ff2d55';
        ctx.fillRect(-18, -34, 36 * frac, 6);
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 2;
        ctx.strokeRect(-18, -34, 36, 6);
      }
    },

    shooter: {
      r: 15, hp: 3, speed: [66, 84], points: 40, cost: 2.5, from: 4,
      range: 178, reload: 1.9,

      move: function (e, game, dt) {
        var dx = game.px - e.x, dy = game.py - e.y;
        var d = len(dx, dy) || 1;
        var a = Math.atan2(dy, dx);
        // Hold the range: close in when far, back off when crowded, and drift
        // sideways the whole time so it is never a stationary target. Pressure
        // pulls the range in, otherwise a shooter and a cagey player could
        // circle each other until the sun went out.
        var range = e.range * (1 - game.pressure * 1.7);
        var push = d > range ? 1 : (d < range * 0.78 ? -1 : 0);
        var slide = e.spin * 0.75;
        e.vx = (Math.cos(a) * push + Math.cos(a + Math.PI / 2) * slide) * e.speed;
        e.vy = (Math.sin(a) * push + Math.sin(a + Math.PI / 2) * slide) * e.speed;

        e.reloadIn -= dt;
        if (e.reloadIn <= 0 && d < e.range * 1.7) {
          e.reloadIn = e.reload;
          e.flare = 0.18;
          game.foeShots.push({
            x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 16,
            vx: Math.cos(a) * 185, vy: Math.sin(a) * 185,
            life: 3.4, r: 6
          });
        }
      },

      draw: function (ctx, game, e) {
        var a = Math.atan2(game.py - e.y, game.px - e.x);
        ctx.rotate(a);
        outline(ctx, 3);
        ctx.fillStyle = e.hurt > 0 ? '#ff2d55' : '#111114';
        ctx.beginPath();                       // a long-barrelled sentry
        ctx.moveTo(-4, -14);
        ctx.lineTo(10, -7);
        ctx.lineTo(18, 0);
        ctx.lineTo(10, 7);
        ctx.lineTo(-4, 14);
        ctx.lineTo(-13, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fffdf8';
        ctx.fillRect(-2, -3, 12, 6);
        if (e.flare > 0) {
          ctx.globalAlpha = Math.min(1, e.flare * 6);
          ctx.fillStyle = '#ff2d55';
          ctx.beginPath();
          ctx.arc(20, 0, 7, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
  };

  var TYPE_NAMES = ['rusher', 'swarm', 'tank', 'shooter'];

  // ---------------------------------------------------------------- spawning

  function edgePoint() {
    var edge = Math.floor(Math.random() * 4);
    if (edge === 0) return { x: Math.random() * W, y: -36 };
    if (edge === 1) return { x: W + 36, y: Math.random() * H };
    if (edge === 2) return { x: Math.random() * W, y: H + 36 };
    return { x: -36, y: Math.random() * H };
  }

  function spawn(game, name, at) {
    var type = TYPES[name];
    var speedUp = 1 + (game.wave - 1) * 0.05;
    if (speedUp > 1.55) speedUp = 1.55;
    var tough = 1 + (game.wave - 1) * 0.07;
    var spot = at || edgePoint();

    game.enemies.push({
      name: name, type: type,
      x: spot.x + (Math.random() - 0.5) * 34,
      y: spot.y + (Math.random() - 0.5) * 34,
      vx: 0, vy: 0,
      r: type.r,
      hp: Math.max(1, Math.round(type.hp * (type.hp > 2 ? tough : 1))),
      maxhp: 0,
      speed: (type.speed[0] + Math.random() * (type.speed[1] - type.speed[0])) * speedUp,
      range: type.range,
      reload: type.reload,
      reloadIn: 0.6 + Math.random() * 1.2,
      spin: Math.random() < 0.5 ? -1 : 1,
      flare: 0,
      hurt: 0,
      t: 0,
      bob: Math.random() * TAU
    });
    var made = game.enemies[game.enemies.length - 1];
    made.maxhp = made.hp;
  }

  /** Budget for one wave, in the cost units on the type table. */
  function waveBudget(wave) { return 4 + wave * 3.2; }

  /** Everything unlocked by this wave, that the remaining budget can pay for. */
  function affordable(game) {
    var out = [];
    for (var i = 0; i < TYPE_NAMES.length; i++) {
      var name = TYPE_NAMES[i];
      var type = TYPES[name];
      if (game.wave < type.from) continue;
      var pack = type.pack ? type.pack[0] : 1;
      if (type.cost * pack > game.budget + 0.001) continue;
      out.push(name);
    }
    return out;
  }

  function startWave(game, wave) {
    game.wave = wave;
    game.budget = waveBudget(wave);
    game.spawnIn = 0.35;
    game.overtime = 0;
    game.reinforceIn = REINFORCE_EVERY;
    game.mode = 'wave';
    game.banner = { text: 'WAVE ' + wave, life: 1.6, max: 1.6 };

    // A kind of enemy that turns up for the first time this wave leads it, so
    // the new thing is the first thing you meet rather than a surprise later.
    game.headline = null;
    for (var i = 0; i < TYPE_NAMES.length; i++) {
      if (TYPES[TYPE_NAMES[i]].from === wave) game.headline = TYPE_NAMES[i];
    }
  }

  function spendBudget(game) {
    var options = affordable(game);
    if (!options.length) { game.budget = 0; return; }

    var name;
    if (game.headline && options.indexOf(game.headline) >= 0) {
      name = game.headline;
      game.headline = null;
    } else {
      name = options[Math.floor(Math.random() * options.length)];
    }

    var type = TYPES[name];
    if (type.pack) {
      var count = type.pack[0] + Math.floor(Math.random() * (type.pack[1] - type.pack[0] + 1));
      var spot = edgePoint();
      for (var i = 0; i < count; i++) spawn(game, name, spot);
      game.budget -= type.cost * count;
    } else {
      spawn(game, name);
      game.budget -= type.cost;
    }
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
      // The trail starts at your own centre, so something sitting right on top
      // of you is still in the shot's path rather than behind the muzzle.
      px: game.px, py: game.py, fresh: true,
      vx: Math.cos(a) * BULLET_SPEED,
      vy: Math.sin(a) * BULLET_SPEED,
      life: BULLET_LIFE,
      damage: 1
    });
    game.recoil = 1;
  }

  function takeHit(game, fromX, fromY, weight) {
    if (game.invuln > 0) return;
    game.lives -= 1;
    game.invuln = INVULN;
    game.shake = 0.4 + weight * 0.25;
    game.flash = { color: '#ff2d55', life: 0.3 };

    var a = Math.atan2(game.py - fromY, game.px - fromX);   // knocked back
    game.vx += Math.cos(a) * (260 + weight * 180);
    game.vy += Math.sin(a) * (260 + weight * 180);
    particles(game, game.px, game.py, 14, '#ff2d55', 210);

    if (game.lives <= 0) game.over();
  }

  function killEnemy(game, e, index) {
    game.enemies.splice(index, 1);
    game.kills += 1;
    game.score += e.type.points;
    game.shake = Math.max(game.shake, e.r > 20 ? 0.3 : 0.12);
    particles(game, e.x, e.y, e.r > 20 ? 22 : 10, '#111114', 150 + e.r * 4);
  }

  // ---------------------------------------------------------------- painting

  var tonePattern = null;

  /** A screentone tile, built once and repeated. Cheaper than a dot per frame. */
  function screentone(ctx) {
    if (!tonePattern) {
      var tone = document.createElement('canvas');
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
    outline(ctx, 3);

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

  /** The wave title, slamming in the way a manga panel does. */
  function drawBanner(ctx, banner) {
    var age = 1 - banner.life / banner.max;
    var slam = age < 0.18 ? 1 + (0.18 - age) * 7 : 1;      // overshoot, then settle
    var fade = banner.life < 0.4 ? banner.life / 0.4 : 1;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(W / 2, H * 0.3);
    ctx.rotate(-0.05);
    ctx.scale(slam, slam);

    ctx.font = '400 62px Anton, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var width = ctx.measureText(banner.text).width + 46;

    ctx.fillStyle = '#111114';
    ctx.fillRect(-width / 2 + 7, -33 + 7, width, 66);       // hard offset shadow
    ctx.fillStyle = '#ff2d55';
    ctx.fillRect(-width / 2, -33, width, 66);
    ctx.strokeStyle = '#111114';
    ctx.lineWidth = 4;
    ctx.strokeRect(-width / 2, -33, width, 66);

    ctx.fillStyle = '#fffdf8';
    ctx.fillText(banner.text, 0, 3);
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
      game.banner = null;
      game.kills = 0;
      game.survived = 0;
      game.bullets = [];
      game.foeShots = [];
      game.enemies = [];
      game.bits = [];
      game.wave = 0;
      game.budget = 0;
      game.headline = null;
      game.breather = 0;
      game.pressure = 0;              // ramps up once a wave's spawns are done
      game.overtime = 0;
      game.reinforceIn = 0;
      startWave(game, 1);
    },

    hud: function (game) {
      var hearts = '';
      for (var i = 0; i < game.lives; i++) hearts += '◆';
      return 'WAVE ' + game.wave + '   ' + (hearts || '-');
    },

    summary: function (game) {
      return 'Survived ' + clockFace(game.survived)
        + '  •  wave ' + game.wave
        + '  •  ' + game.kills + ' down';
    },

    update: function (dt, game) {
      var i, j, e, b;
      game.survived += dt;

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
        if (b.fresh) b.fresh = false;          // keep the muzzle-to-centre trail
        else { b.px = b.x; b.py = b.y; }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
          game.bullets.splice(i, 1);
        }
      }

      // --- the wave clock ---------------------------------------------------
      if (game.mode === 'wave') {
        if (game.budget > 0) {
          game.spawnIn -= dt;
          if (game.spawnIn <= 0) {
            spendBudget(game);
            game.spawnIn = Math.max(0.3, 1 - game.wave * 0.035) * (0.75 + Math.random() * 0.5);
          }
          game.pressure = 0;
        } else if (game.enemies.length) {
          // Nothing left to send. Lean on the stragglers so the wave cannot
          // stall on one enemy in a corner — and if it still drags, start
          // sending free reinforcements, because outrunning everything for
          // ever is not meant to be a way to play.
          game.pressure = Math.min(0.7, game.pressure + dt * 0.09);
          game.overtime += dt;
          if (game.overtime > OVERTIME) {
            game.reinforceIn -= dt;
            if (game.reinforceIn <= 0) {
              spawn(game, 'rusher');
              game.reinforceIn = REINFORCE_EVERY;
            }
          }
        } else {
          game.score += WAVE_CLEAR_POINTS * game.wave;
          game.mode = 'breather';
          game.breather = BREATHER;
          game.pressure = 0;
          game.overtime = 0;
        }
      } else if (game.mode === 'breather') {
        game.breather -= dt;
        if (game.breather <= 0) startWave(game, game.wave + 1);
      }

      // --- enemies -----------------------------------------------------------
      for (i = game.enemies.length - 1; i >= 0; i--) {
        e = game.enemies[i];
        e.t += dt;
        e.hurt = Math.max(0, e.hurt - dt);
        e.flare = Math.max(0, e.flare - dt);

        var carried = e.speed;
        e.speed = carried * (1 + game.pressure);
        e.type.move(e, game, dt);
        e.speed = carried;

        e.x += e.vx * dt;
        e.y += e.vy * dt;

        var dead = false;
        for (j = game.bullets.length - 1; j >= 0; j--) {
          b = game.bullets[j];
          if (segDist(e.x, e.y, b.px, b.py, b.x, b.y) > e.r + BULLET_R) continue;
          game.bullets.splice(j, 1);
          e.hp -= b.damage;
          e.hurt = 0.12;
          particles(game, b.x, b.y, 3, '#ff2d55', 120);
          if (e.hp <= 0) { killEnemy(game, e, i); dead = true; break; }
        }
        if (dead) continue;

        if (len(game.px - e.x, game.py - e.y) < e.r + PLAYER_R) {
          takeHit(game, e.x, e.y, e.r > 20 ? 1 : 0);
        }
      }

      // --- what the shooters send back ----------------------------------------
      for (i = game.foeShots.length - 1; i >= 0; i--) {
        var s = game.foeShots[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        if (s.life <= 0 || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) {
          game.foeShots.splice(i, 1);
          continue;
        }
        if (len(game.px - s.x, game.py - s.y) < s.r + PLAYER_R) {
          game.foeShots.splice(i, 1);
          takeHit(game, s.x, s.y, 0);
        }
      }

      // --- dressing ------------------------------------------------------------
      game.invuln = Math.max(0, game.invuln - dt);
      game.shake = Math.max(0, game.shake - dt);
      game.recoil = Math.max(0, game.recoil - dt * 9);
      if (game.flash) { game.flash.life -= dt; if (game.flash.life <= 0) game.flash = null; }
      if (game.banner) { game.banner.life -= dt; if (game.banner.life <= 0) game.banner = null; }

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
        for (var i = 0; i < 11; i++) {
          var off = (Math.random() - 0.5) * 46;
          var sx = game.px + Math.cos(back) * (22 + Math.random() * 20) - Math.sin(back) * off;
          var sy = game.py + Math.sin(back) * (22 + Math.random() * 20) + Math.cos(back) * off;
          var run = 24 + Math.random() * 54 * strength;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(back) * run, sy + Math.sin(back) * run);
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
        if (e.x < -6 || e.x > W + 6 || e.y < -6 || e.y > H + 6) {
          drawWarning(ctx, e);
          return;
        }
        ctx.save();
        ctx.translate(e.x, e.y + Math.sin(game.time * 9 + e.bob) * 2);
        e.type.draw(ctx, game, e);
        ctx.restore();
      });

      game.foeShots.forEach(function (s) {
        ctx.fillStyle = '#ff2d55';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      });

      game.bullets.forEach(function (b) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = '#111114';
        ctx.fillRect(-9, -2, 18, 4);
        ctx.fillStyle = '#ff2d55';
        ctx.fillRect(3, -2, 6, 4);
        ctx.restore();
      });

      drawPlayer(ctx, game);

      if (game.banner && game.state === 'playing') drawBanner(ctx, game.banner);

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
