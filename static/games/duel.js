/* DUEL — sword fighting, one line at a time.
 *
 * Your opponent winds up in one of three lines: high, middle, low. Meet it
 * with your blade and you parry, which leaves them open for exactly as long
 * as it takes to punish. Meet the wrong line and you wear it.
 *
 * One input does both jobs: committing to a line guards it, and committing
 * while they are staggered is your riposte. Your blade takes time to travel,
 * so late is the same as wrong.
 */
(function () {
  'use strict';
  if (!window.Arcade) return;

  var W = 620, H = 420;
  var GROUND = 344;
  var PLAYER_X = 176, FOE_X = 444;
  var LINES = [128, 196, 264];          // high, middle, low
  var LINE_NAMES = ['HIGH', 'MID', 'LOW'];
  var TRAVEL = 0.17;                    // how long your blade takes to change line
  var OPEN_WINDOW = 0.75;               // how long a staggered opponent stays open

  function foeTiming(level) {
    var hard = Math.min(level, 8) / 8;
    return {
      pause: 1.05 - hard * 0.55,        // between attacks
      windup: 0.95 - hard * 0.45,       // telegraph you have to read
      feint: level < 2 ? 0 : Math.min(0.15 + (level - 2) * 0.09, 0.55),
      combo: level < 3 ? 0 : Math.min(0.12 + (level - 3) * 0.08, 0.45)
    };
  }

  function nextFoe(game) {
    var t = foeTiming(game.level);
    game.foe = {
      hp: 3,
      state: 'idle',
      timer: 0.9,
      line: 1,
      shown: 1,                          // the line the telegraph currently shows
      timing: t,
      feinted: false,
      comboLeft: 0
    };
  }

  function commit(game, line) {
    if (game.state !== 'playing' || game.foe.hp <= 0) return;
    var foe = game.foe;

    if (foe.state === 'open') {          // riposte
      foe.hp -= 1;
      foe.state = 'hurt';
      foe.timer = 0.55;
      game.hits += 1;
      game.score += 250;
      game.shout = { text: 'CUT', life: 0.5, good: true };
      game.slash = { line: line, life: 0.22 };
      if (foe.hp <= 0) {
        game.score += 800 + Math.max(0, Math.round(240 - game.duelTime * 20));
        game.defeated += 1;
        game.level += 1;
        game.shout = { text: 'DOWN', life: 0.9, good: true };
        game.between = 1.3;
      }
      return;
    }

    if (line === game.guard) return;     // already there
    game.guard = line;
    game.guardReady = TRAVEL;            // blade is in transit until this hits zero
  }

  function foeStrikes(game) {
    var foe = game.foe;
    var parried = game.guard === foe.line && game.guardReady <= 0;

    if (parried) {
      foe.state = 'open';
      foe.timer = OPEN_WINDOW;
      game.parries += 1;
      game.score += 80;
      game.spark = { line: foe.line, life: 0.35 };
      game.shout = { text: 'PARRY', life: 0.45, good: true };
    } else {
      foe.state = 'recover';
      foe.timer = 0.7;
      game.lives -= 1;
      game.shake = 0.4;
      game.flash = 0.35;
      game.shout = { text: 'HIT', life: 0.6, good: false };
      if (game.lives <= 0) game.over();
    }
  }

  window.Arcade.mount({
    slug: 'duel',
    title: 'DUEL',
    width: W,
    height: H,
    lives: 3,
    intro: 'They wind up high, middle or low. Meet the blade, then answer it.',
    hint: 'Keys 1 / 2 / 3, or arrows Up / Right / Down. On a phone, tap the top, middle or bottom third.',
    overTitle: 'First blood',

    init: function (game) {
      game.level = 1;
      game.guard = 1;
      game.guardReady = 0;
      game.parries = 0;
      game.hits = 0;
      game.defeated = 0;
      game.duelTime = 0;
      game.between = 0;
      game.shout = null;
      game.spark = null;
      game.slash = null;
      game.flash = 0;
      game.shake = 0;
      nextFoe(game);
    },

    hud: function (game) {
      var pips = '';
      for (var i = 0; i < Math.max(0, game.foe.hp); i++) pips += '▮';
      var hearts = '';
      for (var j = 0; j < game.lives; j++) hearts += '◆';
      return 'foe ' + (pips || '-') + '   you ' + (hearts || '-');
    },

    summary: function (game) {
      return game.defeated + ' opponents down  •  ' + game.parries + ' parries';
    },

    keyPress: function (key, game) {
      var map = { '1': 0, '2': 1, '3': 2, ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, w: 0, s: 2, d: 1 };
      var line = map[key];
      if (line !== undefined) commit(game, line);
    },

    tap: function (point, game) {
      commit(game, point.y < H / 3 ? 0 : point.y < H * 2 / 3 ? 1 : 2);
    },

    update: function (dt, game) {
      game.duelTime += dt;
      game.guardReady = Math.max(0, game.guardReady - dt);
      game.flash = Math.max(0, game.flash - dt);
      game.shake = Math.max(0, game.shake - dt);
      if (game.shout) { game.shout.life -= dt; if (game.shout.life <= 0) game.shout = null; }
      if (game.spark) { game.spark.life -= dt; if (game.spark.life <= 0) game.spark = null; }
      if (game.slash) { game.slash.life -= dt; if (game.slash.life <= 0) game.slash = null; }

      if (game.between > 0) {            // pause between opponents
        game.between -= dt;
        if (game.between <= 0) {
          game.duelTime = 0;
          nextFoe(game);
        }
        return;
      }

      var foe = game.foe;
      if (foe.hp <= 0) return;
      foe.timer -= dt;

      if (foe.state === 'idle' && foe.timer <= 0) {
        foe.line = Math.floor(Math.random() * 3);
        foe.shown = foe.line;
        foe.feinted = false;
        foe.state = 'windup';
        foe.timer = foe.timing.windup;
        return;
      }

      if (foe.state === 'windup') {
        // A feint shows one line and lands in another, switched late.
        if (!foe.feinted && foe.timer < foe.timing.windup * 0.38
            && Math.random() < foe.timing.feint * dt * 12) {
          foe.feinted = true;
          var other = (foe.shown + 1 + Math.floor(Math.random() * 2)) % 3;
          foe.line = other;
          foe.shown = other;
        }
        if (foe.timer <= 0) foeStrikes(game);
        return;
      }

      if (foe.state === 'open' && foe.timer <= 0) {
        foe.state = 'idle';
        foe.timer = foe.timing.pause * 0.6;
        return;
      }

      if ((foe.state === 'recover' || foe.state === 'hurt') && foe.timer <= 0) {
        foe.state = 'idle';
        // Chained attacks: sometimes they come straight back at you.
        foe.timer = Math.random() < foe.timing.combo ? 0.2 : foe.timing.pause;
      }
    },

    draw: function (ctx, game) {
      var shakeX = game.shake > 0 ? (Math.random() - 0.5) * 14 * game.shake : 0;
      ctx.save();
      ctx.translate(shakeX, 0);

      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(-20, 0, W + 40, H);

      // screentone sky and a hard ink horizon
      ctx.fillStyle = 'rgba(17,17,20,.12)';
      for (var y = 24; y < GROUND - 20; y += 13) {
        for (var x = 8; x < W; x += 13) {
          ctx.beginPath();
          ctx.arc(x, y, 1.3, 0, 6.2832);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#111114';
      ctx.fillRect(-20, GROUND, W + 40, 7);

      // the three lines of engagement
      LINES.forEach(function (ly, i) {
        var live = game.foe.state === 'windup' && game.foe.shown === i;
        ctx.strokeStyle = live ? 'rgba(255,45,85,.85)' : 'rgba(17,17,20,.14)';
        ctx.lineWidth = live ? 4 : 2;
        ctx.setLineDash(live ? [] : [5, 9]);
        ctx.beginPath();
        ctx.moveTo(40, ly);
        ctx.lineTo(W - 40, ly);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = live ? '#ff2d55' : 'rgba(17,17,20,.35)';
        ctx.font = '600 11px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(LINE_NAMES[i], 10, ly + 4);
      });

      drawFighter(ctx, game, PLAYER_X, 1, '#111114', LINES[game.guard], game.guardReady > 0);
      var foeLine = game.foe.state === 'windup' ? LINES[game.foe.shown]
        : game.foe.state === 'open' ? GROUND - 30 : LINES[1];
      drawFighter(ctx, game, FOE_X, -1, game.foe.state === 'open' ? '#8a8a92' : '#ff2d55',
                  foeLine, false);

      // clash spark on a parry
      if (game.spark) {
        var sx = (PLAYER_X + FOE_X) / 2, sy = LINES[game.spark.line];
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 3;
        for (var s = 0; s < 8; s++) {
          var a = s * 0.785 + game.spark.life * 6;
          var r = 14 + (0.35 - game.spark.life) * 120;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a) * 8, sy + Math.sin(a) * 8);
          ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
          ctx.stroke();
        }
      }

      // your riposte
      if (game.slash) {
        ctx.strokeStyle = '#ff2d55';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(PLAYER_X + 20, LINES[game.slash.line] + 26);
        ctx.lineTo(FOE_X + 20, LINES[game.slash.line] - 26);
        ctx.stroke();
      }

      // guard readout on your side
      LINES.forEach(function (ly, i) {
        var mine = game.guard === i;
        ctx.fillStyle = mine ? (game.guardReady > 0 ? '#8a8a92' : '#ff2d55') : 'rgba(17,17,20,.18)';
        ctx.fillRect(46, ly - 9, 10, 18);
      });

      if (game.shout) {
        ctx.save();
        ctx.translate(W / 2, 74);
        ctx.rotate(-0.05);
        ctx.textAlign = 'center';
        ctx.font = '700 46px Anton, Impact, sans-serif';
        ctx.fillStyle = game.shout.good ? '#111114' : '#ff2d55';
        ctx.fillText(game.shout.text, 0, 0);
        ctx.restore();
      }

      if (game.between > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#111114';
        ctx.font = '700 26px Anton, Impact, sans-serif';
        ctx.fillText('OPPONENT ' + (game.level), W / 2, 128);
      }

      if (game.flash > 0) {
        ctx.globalAlpha = game.flash * 1.4;
        ctx.fillStyle = '#ff2d55';
        ctx.fillRect(-20, 0, W + 40, H);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }
  });

  /** A fighter is a silhouette plus a blade held at a given height. */
  function drawFighter(ctx, game, x, facing, colour, bladeY, travelling) {
    ctx.save();
    ctx.translate(x, GROUND);
    ctx.scale(facing, 1);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-11, -92);
    ctx.lineTo(11, -92);
    ctx.lineTo(24, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();                        // head
    ctx.arc(0, -111, 18, 0, 6.2832);
    ctx.fill();

    var by = bladeY - GROUND;                // blade, drawn toward the middle
    ctx.strokeStyle = travelling ? '#8a8a92' : colour;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(7, -64);
    ctx.lineTo(104, by);
    ctx.stroke();
    ctx.restore();
  }
})();
