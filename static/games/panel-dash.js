/* PANEL DASH — an endless fall down the gutter between manga panels.
 *
 * Steer through the gaps, sweep up the red orbs. Everything speeds up, orbs
 * are worth more the faster you are going, so greed is a real decision.
 */
(function () {
  'use strict';
  if (!window.Arcade) return;

  var W = 620, H = 520;
  var PLAYER_Y = H - 78;
  var RADIUS = 13;
  var ROW_H = 26;

  function speedAt(t) { return 190 + Math.min(t, 75) * 3.6; }        // px per second
  function gapAt(t) { return Math.max(112, 210 - Math.min(t, 70) * 1.4); }

  function addRow(game, y) {
    var gap = gapAt(game.time);
    var previous = game.rows.length ? game.rows[game.rows.length - 1].gapX : W / 2;
    var drift = (Math.random() - 0.5) * 240;
    var gapX = Math.min(W - gap / 2 - 14, Math.max(gap / 2 + 14, previous + drift));
    game.rows.push({
      y: y,
      gapX: gapX,
      gap: gap,
      skew: (Math.random() - 0.5) * 14,
      hit: false,
      scored: false
    });
    if (Math.random() < 0.62) {
      game.orbs.push({ x: gapX + (Math.random() - 0.5) * (gap - 40), y: y - 60, taken: false });
    }
  }

  window.Arcade.mount({
    slug: 'panel-dash',
    title: 'PANEL DASH',
    width: W,
    height: H,
    lives: 3,
    intro: 'Fall through the page. Miss the black panels, catch the red orbs.',
    hint: 'Arrow keys to steer, or drag your thumb across the panel.',
    overTitle: 'Panel border',

    init: function (game) {
      game.x = W / 2;
      game.vx = 0;
      game.rows = [];
      game.orbs = [];
      game.orbCount = 0;
      game.depth = 0;
      game.invuln = 0;
      game.flash = null;
      game.trail = [];
      for (var i = 0; i < 4; i++) addRow(game, -i * 190 - 60);
      game.nextRowAt = game.rows[game.rows.length - 1].y - 190;
    },

    hud: function (game) {
      var marks = '';
      for (var i = 0; i < game.lives; i++) marks += '◆';
      return game.orbCount + ' orbs   ' + (marks || '-');
    },

    summary: function (game) {
      return game.orbCount + ' orbs  •  ' + Math.round(game.depth / 10) + ' m fallen';
    },

    update: function (dt, game) {
      var speed = speedAt(game.time);
      game.depth += speed * dt;
      game.score += speed * dt * 0.05;
      game.invuln -= dt;
      if (game.flash) { game.flash.life -= dt; if (game.flash.life <= 0) game.flash = null; }

      // steering: keys accelerate, a held finger pulls you toward it
      var input = 0;
      if (game.keys.ArrowLeft || game.keys.a || game.keys.A) input -= 1;
      if (game.keys.ArrowRight || game.keys.d || game.keys.D) input += 1;
      if (game.pointer.down) {
        var wanted = game.pointer.x - game.x;
        input = Math.max(-1, Math.min(1, wanted / 60));
      }
      game.vx += input * 2600 * dt;
      game.vx *= Math.pow(0.0016, dt);          // drag
      game.vx = Math.max(-520, Math.min(520, game.vx));
      game.x += game.vx * dt;
      if (game.x < RADIUS + 4) { game.x = RADIUS + 4; game.vx = 0; }
      if (game.x > W - RADIUS - 4) { game.x = W - RADIUS - 4; game.vx = 0; }

      game.trail.unshift({ x: game.x, y: PLAYER_Y });
      if (game.trail.length > 12) game.trail.pop();

      // world scrolls up past the player
      var i;
      for (i = game.rows.length - 1; i >= 0; i--) {
        var row = game.rows[i];
        row.y += speed * dt;

        if (!row.hit && !row.scored
            && row.y + ROW_H > PLAYER_Y - RADIUS && row.y < PLAYER_Y + RADIUS) {
          var insideGap = Math.abs(game.x - row.gapX) < row.gap / 2 - RADIUS * 0.6;
          if (!insideGap && game.invuln <= 0) {
            row.hit = true;
            game.lives -= 1;
            game.invuln = 1.3;
            game.flash = { life: 0.35 };
            game.vx = 0;
            if (game.lives <= 0) { game.over(); return; }
          } else if (insideGap) {
            row.scored = true;
            game.score += 15;
          }
        }
        if (row.y > H + 40) game.rows.splice(i, 1);
      }

      for (i = game.orbs.length - 1; i >= 0; i--) {
        var orb = game.orbs[i];
        orb.y += speed * dt;
        var dx = orb.x - game.x, dy = orb.y - PLAYER_Y;
        if (!orb.taken && dx * dx + dy * dy < (RADIUS + 12) * (RADIUS + 12)) {
          orb.taken = true;
          game.orbCount += 1;
          game.score += 40 + Math.round(speed / 8);
        }
        if (orb.y > H + 30 || orb.taken) game.orbs.splice(i, 1);
      }

      // keep the corridor stocked
      game.nextRowAt += speed * dt;
      if (game.nextRowAt > -40) {
        addRow(game, game.nextRowAt - 190);
        game.nextRowAt -= 190;
      }
    },

    draw: function (ctx, game) {
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(0, 0, W, H);

      // screentone drifting upward, so falling reads as falling
      var offset = (game.depth * 0.5) % 14;
      ctx.fillStyle = 'rgba(17,17,20,.13)';
      for (var y = -14 + offset; y < H; y += 14) {
        for (var x = 7; x < W; x += 14) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, 6.2832);
          ctx.fill();
        }
      }

      // panels
      game.rows.forEach(function (row) {
        ctx.fillStyle = row.hit ? '#ff2d55' : '#111114';
        var leftW = row.gapX - row.gap / 2;
        var rightX = row.gapX + row.gap / 2;
        ctx.beginPath();
        ctx.moveTo(0, row.y);
        ctx.lineTo(leftW, row.y + row.skew);
        ctx.lineTo(leftW, row.y + ROW_H + row.skew);
        ctx.lineTo(0, row.y + ROW_H);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(rightX, row.y + row.skew);
        ctx.lineTo(W, row.y);
        ctx.lineTo(W, row.y + ROW_H);
        ctx.lineTo(rightX, row.y + ROW_H + row.skew);
        ctx.closePath();
        ctx.fill();
      });

      // orbs
      game.orbs.forEach(function (orb) {
        ctx.fillStyle = '#ff2d55';
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, 9, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 3;
        ctx.stroke();
      });

      // trail
      game.trail.forEach(function (point, index) {
        ctx.globalAlpha = (1 - index / game.trail.length) * 0.25;
        ctx.fillStyle = '#ff2d55';
        ctx.beginPath();
        ctx.arc(point.x, point.y + index * 4, RADIUS * (1 - index / 20), 0, 6.2832);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // player
      var blink = game.invuln > 0 && Math.floor(game.invuln * 12) % 2 === 0;
      if (!blink) {
        ctx.fillStyle = '#ff2d55';
        ctx.beginPath();
        ctx.arc(game.x, PLAYER_Y, RADIUS, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = '#111114';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = '#fffdf8';
        ctx.fillRect(game.x - 5, PLAYER_Y - 4, 10, 3);
      }

      if (game.flash) {
        ctx.globalAlpha = Math.max(0, game.flash.life * 1.5);
        ctx.fillStyle = '#ff2d55';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
  });
})();
