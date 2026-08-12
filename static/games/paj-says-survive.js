/* PAJ SAYS SURVIVE — a top-down survival shooter.
 *
 * You fly. The gun fires by itself, straight ahead. Everything else on the
 * map is coming for you, and it keeps coming.
 *
 * The run is cut into waves with a breath between them. What the dead drop
 * levels you up, and every level you pick one of three upgrades — that pick
 * is the game. The waves get worse faster than you get better.
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
  var PLAYER_R = 13;
  var INVULN = 1.2;

  // --- the gun -----------------------------------------------------------
  var FIRE_EVERY = 0.185;
  var BULLET_SPEED = 470;
  var BULLET_LIFE = 1.15;
  var BULLET_R = 4;
  var FAN = 0.15;              // radians between shots in a spread

  // --- thumb -------------------------------------------------------------
  var DEAD_ZONE = 14;          // thumb this close to you: hover in place
  var FULL_THROTTLE = 62;      // and this far away: everything you have
  var DOUBLE_TAP = 0.32;

  // --- waves -------------------------------------------------------------
  var BREATHER = 2.4;          // seconds of quiet between waves
  var WAVE_CLEAR_POINTS = 25;  // times the wave number
  var OVERTIME = 7;            // seconds a wave may drag on before reinforcements
  var REINFORCE_EVERY = 2.4;

  // --- the boss -----------------------------------------------------------
  var BOSS_EVERY = 5;          // waves
  var BOSS_NAME = 'CARRION KING';

  // --- levelling ----------------------------------------------------------
  var ORB_RADIUS = 46;
  var ORB_SPIN = 2.3;
  var GEM_GIVE_UP = 4;         // after this long a gem comes to you regardless

  var TAU = Math.PI * 2;
  var nextId = 1;

  // ---------------------------------------------------------------- helpers

  function len(x, y) { return Math.sqrt(x * x + y * y); }

  /** sound.js is optional: the game plays fine without it. */
  function sfx(name) { if (window.Sound) window.Sound.play(name); }

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

  // ----------------------------------------------------------------- upgrades
  /* The whole pool, in one list. Adding one is adding an object here: nothing
   * else in the file knows what any of them are called.
   *
   *   max     how many times it can be taken
   *   offer   optional gate — false means "not worth showing right now"
   *   apply   mutates the stat block, and the run for the odd one out
   */
  var UPGRADES = [
    { id: 'rapid', tag: 'RAPID', name: 'RAPID FIRE', max: 5,
      desc: 'The gun cycles 18% faster.',
      apply: function (st) { st.fireEvery *= 0.82; } },

    { id: 'power', tag: 'HEAVY', name: 'HEAVY ROUNDS', max: 5,
      desc: 'Every shot hits one point harder.',
      apply: function (st) { st.damage += 1; } },

    { id: 'spread', tag: 'SPLIT', name: 'SPLIT SHOT', max: 3,
      desc: 'One more shot, fanned out beside it.',
      apply: function (st) { st.shots += 1; } },

    { id: 'pierce', tag: 'PUNCH', name: 'PUNCH THROUGH', max: 3,
      desc: 'Shots carry on through one more body.',
      apply: function (st) { st.pierce += 1; } },

    { id: 'bounce', tag: 'RICO', name: 'RICOCHET', max: 2,
      desc: 'Shots bounce off the frame once more.',
      apply: function (st) { st.bounce += 1; } },

    { id: 'wings', tag: 'WINGS', name: 'STRONGER WINGS', max: 4,
      desc: 'You fly 12% faster.',
      apply: function (st) { st.speed *= 1.12; } },

    { id: 'magnet', tag: 'REACH', name: 'LONG REACH', max: 3,
      desc: 'You pull XP in from much further out.',
      apply: function (st) { st.magnet *= 1.35; } },

    { id: 'orb', tag: 'BLADE', name: 'FEATHER BLADE', max: 3,
      desc: 'A blade circles you, cutting what it touches.',
      apply: function (st) { st.orbs += 1; } },

    { id: 'dash', tag: 'BLINK', name: 'BLINK', max: 3,
      desc: 'Blink forward, untouchable. Space, or two taps.',
      apply: function (st) { st.dash += 1; } },

    { id: 'heal', tag: 'MEND', name: 'SECOND WIND', max: 4,
      desc: 'Take one life back.',
      offer: function (game) { return game.lives < game.maxLives; },
      apply: function (st, game) { game.lives = Math.min(game.maxLives, game.lives + 1); } },

    { id: 'vessel', tag: '+LIFE', name: 'ONE MORE LIFE', max: 2,
      desc: 'One more life to lose, and it starts full.',
      apply: function (st, game) { game.maxLives += 1; game.lives += 1; } }
  ];

  function baseStats() {
    return {
      fireEvery: FIRE_EVERY,
      damage: 1,
      shots: 1,
      pierce: 0,
      bounce: 0,
      speed: SPEED,
      magnet: 78,
      orbs: 0,
      dash: 0
    };
  }

  /** Three upgrades worth showing, no repeats, nothing already maxed out. */
  function drawChoices(game) {
    var pool = [];
    for (var i = 0; i < UPGRADES.length; i++) {
      var up = UPGRADES[i];
      if ((game.taken[up.id] || 0) >= up.max) continue;
      if (up.offer && !up.offer(game)) continue;
      pool.push(up);
    }
    var out = [];
    while (out.length < 3 && pool.length) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return out;
  }

  function takeUpgrade(game, up) {
    game.taken[up.id] = (game.taken[up.id] || 0) + 1;
    up.apply(game.st, game);
    game.choices = null;
    game.pick = 0;
    game.mode = game.modeBefore;
    game.flash = { color: '#fffdf8', life: 0.22 };
    // A second level may already be waiting behind this one.
    checkLevel(game);
  }

  function checkLevel(game) {
    if (game.mode === 'levelup') return;
    if (game.xp < game.xpNeed) return;
    game.xp -= game.xpNeed;
    game.level += 1;
    game.xpNeed = 8 + game.level * 6;
    game.choices = drawChoices(game);
    if (!game.choices.length) return;          // everything is maxed: carry on
    game.pick = 0;
    game.modeBefore = game.mode;
    game.mode = 'levelup';
    game.panel = 0;                            // panel slam animation
  }

  // ------------------------------------------------------------------ enemies
  /* One entry per kind of enemy. Behaviour and looks both live here, so adding
   * a fifth kind is adding one object — nothing else in the file knows the
   * names.
   *
   *   cost   how much of a wave's budget it eats (a wave is a budget)
   *   from   the first wave it can turn up in
   *   pack   spawns this many at once, as a swarm does
   *   xp     how many crystals it leaves behind
   */
  var TYPES = {
    rusher: {
      r: 13, hp: 1, speed: [98, 148], points: 15, cost: 1, from: 1, xp: 1,

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
      r: 8, hp: 1, speed: [126, 168], points: 8, cost: 0.5, from: 2, xp: 1, pack: [4, 7],

      move: function (e, game, dt) {
        var dx = game.px - e.x, dy = game.py - e.y;
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
      r: 26, hp: 9, speed: [40, 56], points: 60, cost: 4, from: 3, xp: 4,

      move: function (e, game, dt) {
        var dx = game.px - e.x, dy = game.py - e.y;
        var d = len(dx, dy) || 1;
        e.vx = dx / d * e.speed;
        e.vy = dy / d * e.speed;
      },

      draw: function (ctx, game, e) {
        var heading = Math.atan2(e.vy, e.vx);
        ctx.rotate(heading);
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
        ctx.rotate(-heading);
        ctx.fillStyle = '#fffdf8';
        ctx.fillRect(-18, -34, 36, 6);
        ctx.fillStyle = '#ff2d55';
        ctx.fillRect(-18, -34, 36 * (e.hp / e.maxhp), 6);
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 2;
        ctx.strokeRect(-18, -34, 36, 6);
      }
    },

    shooter: {
      r: 15, hp: 3, speed: [66, 84], points: 40, cost: 2.5, from: 4, xp: 3,
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
        ctx.rotate(Math.atan2(game.py - e.y, game.px - e.x));
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
    },

    /* Every fifth wave. It works a loop of three attacks with a long, readable
     * wind-up before each: nothing it does should ever be a surprise, only a
     * problem. Its arena is penned so it cannot wander off the page. */
    boss: {
      r: 52, hp: 1, speed: [58, 58], points: 600, cost: 0, from: 999, xp: 12,
      penned: true,
      hpFor: function (wave) { return 84 + wave * 15; },

      move: function (e, game, dt) {
        var rage = e.hp / e.maxhp < 0.4 ? 1.45 : 1;
        var toPlayer = Math.atan2(game.py - e.y, game.px - e.x);
        e.vx = 0;
        e.vy = 0;
        e.phaseIn -= dt * rage;

        if (e.phase === 'stalk') {
          e.vx = Math.cos(toPlayer) * e.speed;
          e.vy = Math.sin(toPlayer) * e.speed;
          if (e.phaseIn <= 0) {
            var order = ['wind', 'burst', 'summon'];
            e.phase = order[e.cycle % order.length];
            e.cycle += 1;
            e.phaseIn = e.phase === 'wind' ? 0.85 : (e.phase === 'burst' ? 1.5 : 0.9);
            e.shotIn = 0.15;
            e.summoned = false;
          }

        } else if (e.phase === 'wind') {
          e.lock = toPlayer;                       // tracks you until it commits
          if (e.phaseIn <= 0) { e.phase = 'charge'; e.phaseIn = 0.85; }

        } else if (e.phase === 'charge') {
          e.vx = Math.cos(e.lock) * 350;
          e.vy = Math.sin(e.lock) * 350;
          if (e.phaseIn <= 0) { e.phase = 'stalk'; e.phaseIn = 1.5; }

        } else if (e.phase === 'burst') {
          e.shotIn -= dt * rage;
          if (e.shotIn <= 0) {
            e.shotIn = 0.6;
            e.flare = 0.2;
            var count = 14;
            for (var i = 0; i < count; i++) {
              var a = i / count * TAU + e.cycle * 0.22;
              game.foeShots.push({
                x: e.x + Math.cos(a) * (e.r + 8), y: e.y + Math.sin(a) * (e.r + 8),
                vx: Math.cos(a) * 152, vy: Math.sin(a) * 152,
                life: 4.5, r: 7
              });
            }
          }
          if (e.phaseIn <= 0) { e.phase = 'stalk'; e.phaseIn = 1.3; }

        } else if (e.phase === 'summon') {
          if (!e.summoned) {
            e.summoned = true;
            var kind = game.wave >= 10 ? 'swarm' : 'rusher';
            var many = game.wave >= 10 ? 6 : 4;
            for (var j = 0; j < many; j++) spawn(game, kind, { x: e.x, y: e.y });
            particles(game, e.x, e.y, 18, '#111114', 220);
          }
          if (e.phaseIn <= 0) { e.phase = 'stalk'; e.phaseIn = 1.4; }
        }
      },

      draw: function (ctx, game, e) {
        var beat = Math.sin(e.t * 4) * 0.5 + 0.5;
        var charging = e.phase === 'charge';

        // the wind-up, drawn in the world so you can read where it will go
        if (e.phase === 'wind') {
          var grow = 1 - Math.max(0, e.phaseIn) / 0.85;
          ctx.save();
          ctx.rotate(e.lock);
          ctx.globalAlpha = 0.25 + grow * 0.45;
          ctx.fillStyle = '#ff2d55';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, 250 * grow, -0.32, 0.32);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
        }

        ctx.rotate(Math.atan2(game.py - e.y, game.px - e.x) + Math.PI / 2);
        outline(ctx, 5);
        // Something this big is under fire constantly, so it flares at the
        // edges instead of flashing red all over and drowning the arena.
        if (e.hurt > 0) ctx.strokeStyle = '#fffdf8';
        ctx.fillStyle = '#111114';

        // wings, spread wide and beating slowly
        var reach = 42 + beat * 14 + (charging ? 16 : 0);
        for (var side = -1; side <= 1; side += 2) {
          ctx.beginPath();
          ctx.moveTo(side * 12, -14);
          ctx.quadraticCurveTo(side * (reach + 22), -34, side * reach, 16);
          ctx.quadraticCurveTo(side * (reach * 0.5), 6, side * 10, 20);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        ctx.beginPath();                          // body, a long hooded shape
        ctx.moveTo(0, -46);
        ctx.lineTo(20, -8);
        ctx.lineTo(14, 34);
        ctx.lineTo(0, 44);
        ctx.lineTo(-14, 34);
        ctx.lineTo(-20, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#111114';
        ctx.fillStyle = '#ff2d55';                // a crown of three spikes
        for (var k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(k * 13, -34);
          ctx.lineTo(k * 13 + 5, -56 - Math.abs(k) * -8);
          ctx.lineTo(k * 13 - 5, -56 - Math.abs(k) * -8);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = e.flare > 0 ? '#fffdf8' : '#ff2d55';
        ctx.beginPath();                          // the eye
        ctx.arc(0, -18, 9 + (charging ? 3 : 0), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 3;
        ctx.stroke();
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
    var speedUp = Math.min(1.55, 1 + (game.wave - 1) * 0.05);
    var tough = 1 + (game.wave - 1) * 0.07;
    var spot = at || edgePoint();

    var made = {
      id: nextId++,
      name: name, type: type,
      x: spot.x + (Math.random() - 0.5) * 34,
      y: spot.y + (Math.random() - 0.5) * 34,
      vx: 0, vy: 0,
      r: type.r,
      hp: type.hpFor ? type.hpFor(game.wave)
        : Math.max(1, Math.round(type.hp * (type.hp > 2 ? tough : 1))),
      maxhp: 1,
      phase: 'stalk',
      phaseIn: 1.1,
      cycle: 0,
      lock: 0,
      shotIn: 0,
      summoned: false,
      entered: false,
      speed: (type.speed[0] + Math.random() * (type.speed[1] - type.speed[0])) * speedUp,
      range: type.range,
      reload: type.reload,
      reloadIn: 0.6 + Math.random() * 1.2,
      spin: Math.random() < 0.5 ? -1 : 1,
      flare: 0,
      hurt: 0,
      orbHit: 0,
      t: 0,
      bob: Math.random() * TAU
    };
    made.maxhp = made.hp;
    game.enemies.push(made);
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
    game.spawnIn = 0.35;
    game.overtime = 0;
    game.reinforceIn = REINFORCE_EVERY;
    game.headline = null;

    if (wave % BOSS_EVERY === 0) {
      game.budget = 0;
      game.mode = 'boss';
      game.banner = { text: 'BOSS', under: BOSS_NAME, life: 2.4, max: 2.4 };
      spawn(game, 'boss', { x: W / 2, y: -90 });
      return;
    }

    game.budget = waveBudget(wave);
    game.mode = 'wave';
    game.banner = { text: 'WAVE ' + wave, life: 1.6, max: 1.6 };

    // A kind of enemy that turns up for the first time this wave leads it, so
    // the new thing is the first thing you meet rather than a surprise later.
    for (var i = 0; i < TYPE_NAMES.length; i++) {
      if (TYPES[TYPE_NAMES[i]].from === wave) game.headline = TYPE_NAMES[i];
    }
  }

  function bossIn(game) {
    for (var i = 0; i < game.enemies.length; i++) {
      if (game.enemies[i].name === 'boss') return game.enemies[i];
    }
    return null;
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
    var mid = aimAngle(game);
    var st = game.st;
    for (var i = 0; i < st.shots; i++) {
      var a = mid + (i - (st.shots - 1) / 2) * FAN;
      game.bullets.push({
        x: game.px + Math.cos(a) * 16,
        y: game.py + Math.sin(a) * 16,
        // The trail starts at your own centre, so something sitting right on
        // top of you is still in the shot's path rather than behind the muzzle.
        px: game.px, py: game.py, fresh: true,
        vx: Math.cos(a) * BULLET_SPEED,
        vy: Math.sin(a) * BULLET_SPEED,
        life: BULLET_LIFE,
        damage: st.damage,
        pierce: st.pierce,
        bounce: st.bounce,
        hit: {}
      });
    }
    game.recoil = 1;
    sfx('shot');
  }

  function dash(game) {
    if (!game.st.dash || game.dashIn > 0 || game.dashing > 0) return;
    game.dashing = 0.17;
    game.dashIn = Math.max(1.2, 3.2 - (game.st.dash - 1) * 0.6);
    game.shake = Math.max(game.shake, 0.1);
    particles(game, game.px, game.py, 10, '#111114', 150);
  }

  function takeHit(game, fromX, fromY, weight) {
    if (game.invuln > 0 || game.dashing > 0) return;
    game.lives -= 1;
    game.invuln = INVULN;
    game.shake = 0.4 + weight * 0.25;
    game.flash = { color: '#ff2d55', life: 0.3 };

    var a = Math.atan2(game.py - fromY, game.px - fromX);   // knocked back
    game.vx += Math.cos(a) * (260 + weight * 180);
    game.vy += Math.sin(a) * (260 + weight * 180);
    particles(game, game.px, game.py, 14, '#ff2d55', 210);

    if (game.lives > 0) {
      sfx('hurt');
      return;
    }
    sfx('over');
    if (window.Sound) window.Sound.music(0);
    game.over();
  }

  function dropGems(game, e) {
    var n = e.type.xp;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU;
      game.gems.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
        age: 0, bob: Math.random() * TAU
      });
    }
  }

  function killEnemy(game, e, index) {
    game.enemies.splice(index, 1);
    game.kills += 1;
    game.score += e.type.points;
    dropGems(game, e);

    if (e.name === 'boss') {
      game.bosses += 1;
      sfx('bossdown');
      game.shake = 0.9;
      game.flash = { color: '#fffdf8', life: 0.5 };
      game.banner = { text: 'DOWN', under: BOSS_NAME, life: 1.8, max: 1.8 };
      particles(game, e.x, e.y, 60, '#111114', 400);
      particles(game, e.x, e.y, 30, '#ff2d55', 300);
      return;
    }

    sfx('kill');
    game.shake = Math.max(game.shake, e.r > 20 ? 0.3 : 0.12);
    particles(game, e.x, e.y, e.r > 20 ? 22 : 10, '#111114', 150 + e.r * 4);
  }

  /** One point of damage landing on one enemy. True when it died. */
  function damage(game, e, index, amount, atX, atY) {
    e.hp -= amount;
    e.hurt = 0.12;
    particles(game, atX, atY, 3, '#ff2d55', 120);
    if (e.hp > 0) return false;
    killEnemy(game, e, index);
    return true;
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

  function orbPositions(game) {
    var out = [];
    for (var i = 0; i < game.st.orbs; i++) {
      var a = game.orbAngle + i * TAU / game.st.orbs;
      out.push({ x: game.px + Math.cos(a) * ORB_RADIUS, y: game.py + Math.sin(a) * ORB_RADIUS });
    }
    return out;
  }

  function drawPlayer(ctx, game) {
    // Blink through the invulnerable window rather than vanish.
    if (game.invuln > 0 && game.dashing <= 0 && Math.floor(game.invuln * 18) % 2) return;

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
    ctx.fillStyle = game.dashing > 0 ? '#ff2d55' : '#111114';
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(-2, -9);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-2, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = game.dashing > 0 ? '#fffdf8' : '#ff2d55';
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

    if (banner.under) {
      ctx.font = '400 22px Anton, Impact, sans-serif';
      ctx.fillStyle = '#111114';
      ctx.fillText(banner.under, 0, 56);
    }
    ctx.restore();
  }

  /** The boss's health, across the top of the arena. */
  function drawBossBar(ctx, boss) {
    var x = 46, y = 44, w = W - 92, h = 15;
    ctx.fillStyle = '#111114';
    ctx.fillRect(x + 4, y + 4, w, h);
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ff2d55';
    ctx.fillRect(x, y, w * Math.max(0, boss.hp / boss.maxhp), h);
    ctx.strokeStyle = '#111114';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    ctx.font = '400 17px Anton, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#111114';
    ctx.fillText(BOSS_NAME, W / 2, y - 6);
  }

  // --- the level-up panel ---------------------------------------------------
  // Drawn on the canvas rather than in the page, so it can look like a manga
  // panel and so the same rectangles serve keyboard and thumb alike.
  var CARD_X = 44, CARD_W = W - 88, CARD_H = 88, CARD_GAP = 14, CARD_TOP = 168;

  function cardRect(i) {
    return { x: CARD_X, y: CARD_TOP + i * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H };
  }

  function cardAt(point) {
    for (var i = 0; i < 3; i++) {
      var r = cardRect(i);
      if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return i;
    }
    return -1;
  }

  function drawLevelUp(ctx, game) {
    var slam = Math.min(1, game.panel / 0.16);
    ctx.fillStyle = 'rgba(17,17,20,' + (0.9 * slam).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    if (slam < 1) return;                       // the panel lands, then fills in

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(W / 2, 104);
    ctx.rotate(-0.03);
    ctx.font = '400 54px Anton, Impact, sans-serif';
    ctx.fillStyle = '#ff2d55';
    ctx.fillText('LEVEL ' + game.level, 4, 4);
    ctx.fillStyle = '#fffdf8';
    ctx.fillText('LEVEL ' + game.level, 0, 0);
    ctx.restore();

    for (var i = 0; i < game.choices.length; i++) {
      var up = game.choices[i];
      var r = cardRect(i);
      var on = i === game.pick;
      var have = game.taken[up.id] || 0;

      ctx.fillStyle = '#111114';
      ctx.fillRect(r.x + 6, r.y + 6, r.w, r.h);
      ctx.fillStyle = on ? '#ff2d55' : '#fffdf8';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#111114';
      ctx.lineWidth = 4;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      ctx.textAlign = 'left';
      ctx.fillStyle = on ? '#fffdf8' : '#ff2d55';
      ctx.font = '400 40px Anton, Impact, sans-serif';
      ctx.fillText(String(i + 1), r.x + 18, r.y + r.h / 2);

      ctx.fillStyle = on ? '#fffdf8' : '#111114';
      ctx.font = '400 27px Anton, Impact, sans-serif';
      ctx.fillText(up.name, r.x + 56, r.y + 30);

      ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(up.desc, r.x + 56, r.y + 58);

      if (have) {
        ctx.textAlign = 'right';
        ctx.font = '400 22px Anton, Impact, sans-serif';
        ctx.fillText('x' + have, r.x + r.w - 16, r.y + 30);
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,253,248,.6)';
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('1 2 3, or arrows and Enter, or just tap one', W / 2, H - 38);
  }

  /** The XP strip and the list of what you have taken, along the bottom edge. */
  function drawBuild(ctx, game) {
    var frac = Math.max(0, Math.min(1, game.xp / game.xpNeed));
    ctx.fillStyle = 'rgba(17,17,20,.16)';
    ctx.fillRect(10, H - 17, W - 20, 7);
    ctx.fillStyle = '#ff2d55';
    ctx.fillRect(10, H - 17, (W - 20) * frac, 7);

    ctx.globalAlpha = 0.55;
    ctx.font = '400 15px Anton, Impact, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#111114';
    var x = 12;
    for (var i = 0; i < UPGRADES.length; i++) {
      var up = UPGRADES[i];
      var have = game.taken[up.id] || 0;
      if (!have) continue;
      var label = up.tag + (have > 1 ? ' x' + have : '');
      var width = ctx.measureText(label).width;
      if (x + width > W - 62) { ctx.fillText('...', x, H - 24); break; }
      ctx.fillText(label, x, H - 24);
      x += width + 12;
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'right';
    ctx.font = '400 15px Anton, Impact, sans-serif';
    ctx.fillStyle = 'rgba(17,17,20,.5)';
    ctx.fillText('LV ' + game.level, W - 12, H - 24);
  }

  // ------------------------------------------------------------------- mount

  window.Arcade.mount({
    slug: 'paj-says-survive',
    title: 'PAJ SAYS',
    width: W,
    height: H,
    lives: 3,
    intro: 'They come from every edge and they do not stop. The gun fires by itself — all you do is fly, and point. Every level, you pick what gets stronger.',
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
      game.dashing = 0;
      game.dashIn = 0;
      game.lastTap = -9;
      game.shake = 0;
      game.flash = null;
      game.banner = null;
      game.kills = 0;
      game.bosses = 0;
      game.survived = 0;
      game.maxLives = 3;
      game.bullets = [];
      game.foeShots = [];
      game.enemies = [];
      game.gems = [];
      game.bits = [];
      game.orbAngle = 0;

      game.st = baseStats();
      game.taken = {};
      game.level = 0;
      game.xp = 0;
      game.xpNeed = 8;
      game.choices = null;
      game.pick = 0;
      game.panel = 0;
      game.modeBefore = 'wave';

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
        + '  •  ' + game.kills + ' down'
        + '  •  level ' + game.level
        + (game.bosses ? '  •  ' + game.bosses + ' king' + (game.bosses > 1 ? 's' : '') + ' felled' : '');
    },

    keyPress: function (key, game) {
      if (game.mode === 'levelup') {
        if (key === '1' || key === '2' || key === '3') {
          var want = parseInt(key, 10) - 1;
          if (want < game.choices.length) { game.pick = want; takeUpgrade(game, game.choices[want]); }
          return;
        }
        if (key === 'ArrowDown' || key === 'ArrowRight' || key === 's' || key === 'd') {
          game.pick = (game.pick + 1) % game.choices.length;
        }
        if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'w' || key === 'a') {
          game.pick = (game.pick + game.choices.length - 1) % game.choices.length;
        }
        if (key === 'Enter' || key === ' ') takeUpgrade(game, game.choices[game.pick]);
        return;
      }
      if (key === ' ') dash(game);
    },

    tap: function (point, game) {
      if (game.mode === 'levelup') {
        var i = cardAt(point);
        if (i >= 0 && i < game.choices.length) { game.pick = i; takeUpgrade(game, game.choices[i]); }
        return;
      }
      // Two quick taps blink, which is the thumb's version of the space bar.
      if (game.time - game.lastTap < DOUBLE_TAP) dash(game);
      game.lastTap = game.time;
    },

    update: function (dt, game) {
      var i, j, e, b, st = game.st;

      // Everything stops for the pick. The shell keeps its own clock running,
      // which is why the run is timed on game.survived and not on game.time.
      if (game.mode === 'levelup') {
        game.panel = Math.min(0.4, game.panel + dt);
        return;
      }

      game.survived += dt;

      // --- fly -----------------------------------------------------------
      var input = steering(game);
      if (game.dashing > 0) {
        game.vx = Math.cos(game.facing) * st.speed * 2.7;
        game.vy = Math.sin(game.facing) * st.speed * 2.7;
      } else {
        var damp = Math.exp(-DAMP * dt);
        game.vx = game.vx * damp + input.x * st.speed * DAMP * dt;
        game.vy = game.vy * damp + input.y * st.speed * DAMP * dt;
      }
      game.px += game.vx * dt;
      game.py += game.vy * dt;

      if (input.aimed && game.dashing <= 0) {
        game.facing = turn(game.facing, Math.atan2(input.y, input.x), Math.min(1, dt * 18));
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
        game.fireIn += st.fireEvery;
        if (game.fireIn < 0) game.fireIn = st.fireEvery;
      }

      for (i = game.bullets.length - 1; i >= 0; i--) {
        b = game.bullets[i];
        if (b.fresh) b.fresh = false;          // keep the muzzle-to-centre trail
        else { b.px = b.x; b.py = b.y; }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;

        if (b.bounce > 0) {
          if (b.x < BULLET_R) { b.x = BULLET_R; b.vx = -b.vx; b.bounce -= 1; b.hit = {}; }
          else if (b.x > W - BULLET_R) { b.x = W - BULLET_R; b.vx = -b.vx; b.bounce -= 1; b.hit = {}; }
          if (b.y < BULLET_R) { b.y = BULLET_R; b.vy = -b.vy; b.bounce -= 1; b.hit = {}; }
          else if (b.y > H - BULLET_R) { b.y = H - BULLET_R; b.vy = -b.vy; b.bounce -= 1; b.hit = {}; }
        }

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
      } else if (game.mode === 'boss') {
        // No budget, no pressure, no reinforcements: the wave is the boss, and
        // it ends the moment the boss does. Whatever it summoned lives on into
        // the breather rather than leaving you to hunt stragglers.
        if (!bossIn(game)) {
          game.score += WAVE_CLEAR_POINTS * game.wave * 3;
          game.mode = 'breather';
          game.breather = BREATHER;
        }
      } else if (game.mode === 'breather') {
        game.breather -= dt;
        if (game.breather <= 0) startWave(game, game.wave + 1);
      }

      // --- enemies -----------------------------------------------------------
      game.orbAngle += dt * ORB_SPIN;
      var orbs = orbPositions(game);

      for (i = game.enemies.length - 1; i >= 0; i--) {
        e = game.enemies[i];
        e.t += dt;
        e.hurt = Math.max(0, e.hurt - dt);
        e.flare = Math.max(0, e.flare - dt);
        e.orbHit = Math.max(0, e.orbHit - dt);

        var carried = e.speed;
        e.speed = carried * (1 + game.pressure);
        e.type.move(e, game, dt);
        e.speed = carried;

        e.x += e.vx * dt;
        e.y += e.vy * dt;

        if (e.type.penned) {
          var inside = e.x > e.r && e.x < W - e.r && e.y > e.r && e.y < H - e.r;
          if (e.entered) {
            e.x = Math.min(W - e.r, Math.max(e.r, e.x));
            e.y = Math.min(H - e.r, Math.max(e.r, e.y));
          } else if (inside) {
            e.entered = true;
          }
        }

        var dead = false;
        for (j = game.bullets.length - 1; j >= 0; j--) {
          b = game.bullets[j];
          if (b.hit[e.id]) continue;
          if (segDist(e.x, e.y, b.px, b.py, b.x, b.y) > e.r + BULLET_R) continue;
          b.hit[e.id] = 1;
          if (b.pierce > 0) b.pierce -= 1;
          else game.bullets.splice(j, 1);
          if (damage(game, e, i, b.damage, b.x, b.y)) { dead = true; break; }
        }
        if (dead) continue;

        for (j = 0; j < orbs.length; j++) {
          if (e.orbHit > 0) break;
          if (len(orbs[j].x - e.x, orbs[j].y - e.y) > e.r + 10) continue;
          e.orbHit = 0.4;
          if (damage(game, e, i, st.damage, e.x, e.y)) { dead = true; }
          break;
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

      // --- what the dead leave behind -------------------------------------------
      for (i = game.gems.length - 1; i >= 0; i--) {
        var gem = game.gems[i];
        gem.age += dt;
        var gdx = game.px - gem.x, gdy = game.py - gem.y;
        var gd = len(gdx, gdy) || 1;

        // Inside the magnet they come to you fast; after a while they come
        // anyway, so a crystal can never be stranded in a corner.
        if (gd < st.magnet || gem.age > GEM_GIVE_UP) {
          var pull = (gd < st.magnet ? 900 : 260) * dt;
          gem.vx += gdx / gd * pull;
          gem.vy += gdy / gd * pull;
        }
        gem.vx *= 0.9;
        gem.vy *= 0.9;
        gem.x += gem.vx * dt;
        gem.y += gem.vy * dt;

        if (gd < 17) {
          game.gems.splice(i, 1);
          game.xp += 1;
          checkLevel(game);
        }
      }

      // --- dressing ------------------------------------------------------------
      game.invuln = Math.max(0, game.invuln - dt);
      game.dashing = Math.max(0, game.dashing - dt);
      game.dashIn = Math.max(0, game.dashIn - dt);
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
      var shake = game.mode === 'levelup' ? 0 : game.shake;
      ctx.save();
      if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * 16 * shake, (Math.random() - 0.5) * 16 * shake);
      }

      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(-24, -24, W + 48, H + 48);
      ctx.fillStyle = screentone(ctx);
      ctx.fillRect(-24, -24, W + 48, H + 48);

      // speedlines, only once you are really moving
      var speed = len(game.vx, game.vy);
      if (speed > game.st.speed * 0.5) {
        var strength = Math.min(1, (speed - game.st.speed * 0.5) / (game.st.speed * 0.5));
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

      drawBuild(ctx, game);

      game.bits.forEach(function (p) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      });
      ctx.globalAlpha = 1;

      // xp crystals
      game.gems.forEach(function (gem) {
        ctx.save();
        ctx.translate(gem.x, gem.y + Math.sin(game.time * 6 + gem.bob) * 1.5);
        ctx.rotate(game.time * 2 + gem.bob);
        ctx.fillStyle = '#ff2d55';
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.lineTo(4.5, 0); ctx.lineTo(0, 6); ctx.lineTo(-4.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

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

      // the blades, drawn under the figure so it stays the readable thing
      orbPositions(game).forEach(function (o) {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(game.orbAngle * 2.5);
        outline(ctx, 2.5);
        ctx.fillStyle = '#fffdf8';
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.lineTo(6, 0); ctx.lineTo(0, 11); ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      drawPlayer(ctx, game);

      var boss = bossIn(game);
      if (boss && boss.entered) drawBossBar(ctx, boss);

      if (game.banner && game.state === 'playing') drawBanner(ctx, game.banner);

      if (game.flash) {
        ctx.globalAlpha = Math.max(0, game.flash.life * 1.6);
        ctx.fillStyle = game.flash.color;
        ctx.fillRect(-24, -24, W + 48, H + 48);
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      if (game.mode === 'levelup' && game.state === 'playing') drawLevelUp(ctx, game);

      // the panel border sits outside the shake, so the frame never wobbles
      ctx.strokeStyle = '#111114';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, W - 8, H - 8);
    }
  });
})();
