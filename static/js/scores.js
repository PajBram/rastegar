/* Highscores.
 *
 * Talks to Supabase over its REST API. Reads come straight from the `scores`
 * table (public). Writes go through two database functions:
 *
 *   start_run(game)                 -> a one-time token, handed out at game start
 *   submit_score(token, name, score) -> validates and stores
 *
 * The client cannot write to the table directly, so a score without a token
 * from a real run is rejected by the server. See supabase/schema.sql.
 *
 * If no backend is configured, everything degrades to a friendly message and
 * the games still play.
 */
(function () {
  'use strict';

  var cfg = window.RASTEGAR || {};
  var configured = Boolean(cfg.url && cfg.anonKey);
  var NAME_KEY = 'rastegar.name';
  var NAME_RE = /^[A-Za-z0-9 _\-.]{3,12}$/;

  function headers() {
    return {
      'apikey': cfg.anonKey,
      'Authorization': 'Bearer ' + cfg.anonKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /** POST to a database function. Tolerates an empty body, which is what a
   *  function returning nothing answers with. */
  function rpc(name, body) {
    return fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
        if (!res.ok) {
          throw new Error((data && (data.message || data.hint)) || 'Request failed');
        }
        return data;
      });
    });
  }

  /** The database speaks plainly, but not always usefully. Translate the two
   *  answers a player can actually do something about. */
  function friendly(message) {
    if (!message) return 'That did not go through. Try once more.';
    if (message.indexOf('cannot be scored') > -1) {
      return 'This round was not registered with the server. Play one more and it will post.';
    }
    if (message.indexOf('too fast') > -1) {
      return 'That round was too short to count. Survive a few seconds longer.';
    }
    return message;
  }

  var Scores = {
    configured: configured,

    /** Ask the server for a run token. Resolves to null when offline/unconfigured. */
    startRun: function (game) {
      if (!configured) return Promise.resolve(null);
      return rpc('start_run', { p_game: game }).catch(function () { return null; });
    },

    submit: function (game, token, name, score) {
      if (!configured) return Promise.reject(new Error('Highscores are not switched on yet.'));
      if (!token) return Promise.reject(new Error('This run cannot be scored. Play a fresh round.'));
      return rpc('submit_score', {
        p_token: token,
        p_name: name,
        p_score: Math.round(score)
      });
    },

    list: function (game, limit) {
      if (!configured) return Promise.resolve(null);
      var url = cfg.url.replace(/\/$/, '') + '/rest/v1/scores'
        + '?select=name,score,created_at&game=eq.' + encodeURIComponent(game)
        + '&order=score.desc,created_at.asc&limit=' + (limit || 10);
      return fetch(url, { headers: headers() })
        .then(function (res) { return res.ok ? res.json() : []; })
        .catch(function () { return []; });
    },

    rememberedName: function () {
      try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
    },

    /** Render a scoreboard into any element with .scoreboard[data-game]. */
    render: function (el) {
      var game = el.getAttribute('data-game');
      var limit = parseInt(el.getAttribute('data-limit'), 10) || 10;
      if (!configured) {
        el.innerHTML = '<p class="scoreboard__empty">Highscores switch on as soon as the '
          + 'backend is wired up. Your score still counts on your own screen until then.</p>';
        return Promise.resolve();
      }
      return Scores.list(game, limit).then(function (rows) {
        if (!rows || !rows.length) {
          el.innerHTML = '<p class="scoreboard__empty">Nobody has posted a score yet. Be first.</p>';
          return;
        }
        var mine = Scores.rememberedName();
        var list = document.createElement('ol');
        rows.forEach(function (row) {
          var li = document.createElement('li');
          if (mine && row.name === mine) li.className = 'mine';
          var who = document.createElement('span');
          who.className = 'who';
          who.textContent = row.name;
          var pts = document.createElement('span');
          pts.className = 'pts';
          pts.textContent = String(row.score);
          li.appendChild(who);
          li.appendChild(pts);
          list.appendChild(li);
        });
        el.innerHTML = '';
        el.appendChild(list);
      });
    },

    refresh: function (game) {
      document.querySelectorAll('.scoreboard[data-game="' + game + '"]').forEach(function (el) {
        Scores.render(el);
      });
    },

    /**
     * Build the "you scored X, put your name on it" form for a game-over screen.
     * Returns an element the game can drop into its overlay.
     *
     * `opts.token` may be a function. The run token arrives over the network,
     * and a run that ends quickly is over before it lands — read at build time
     * it would still be null, and the player would be told their round could
     * not be scored a moment before it could. Read it when Post is pressed.
     */
    submitForm: function (opts) {
      var wrap = document.createElement('div');
      wrap.className = 'score-submit';

      if (!configured) {
        var note = document.createElement('p');
        note.className = 'scoreboard__empty';
        note.textContent = 'Highscores are not switched on yet — this run stays between us.';
        wrap.appendChild(note);
        return wrap;
      }

      var form = document.createElement('form');
      var label = document.createElement('label');
      label.setAttribute('for', 'score-name');
      label.textContent = 'Name for the board';
      var input = document.createElement('input');
      input.type = 'text';
      input.id = 'score-name';
      input.maxLength = 12;
      input.placeholder = '3-12 characters';
      input.value = Scores.rememberedName();
      var button = document.createElement('button');
      button.className = 'btn btn--small';
      button.type = 'submit';
      button.textContent = 'Post score';
      var status = document.createElement('p');
      status.className = 'form-status';

      // On a phone the keyboard covers the bottom half of the screen, and the
      // field sits inside a scrolling overlay. Bring it into view on focus.
      input.addEventListener('focus', function () {
        setTimeout(function () {
          if (input.scrollIntoView) input.scrollIntoView({ block: 'center' });
        }, 250);
      });

      form.appendChild(label);
      form.appendChild(input);
      form.appendChild(button);
      form.appendChild(status);
      wrap.appendChild(form);

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var name = input.value.trim();
        if (!NAME_RE.test(name)) {
          status.className = 'form-status error';
          status.textContent = 'Names are 3 to 12 characters: letters, numbers, space, - _ .';
          return;
        }
        button.disabled = true;
        status.className = 'form-status';
        status.textContent = 'Sending...';
        var token = typeof opts.token === 'function' ? opts.token() : opts.token;
        Scores.submit(opts.game, token, name, opts.score).then(function () {
          try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* private mode */ }
          status.className = 'form-status ok';
          status.textContent = 'On the wall.';
          form.removeChild(input);
          form.removeChild(label);
          form.removeChild(button);
          Scores.refresh(opts.game);
          if (opts.onDone) opts.onDone();
        }).catch(function (err) {
          button.disabled = false;
          status.className = 'form-status error';
          status.textContent = friendly(err && err.message);
        });
      });

      return wrap;
    }
  };

  window.Scores = Scores;

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.scoreboard[data-game]').forEach(function (el) {
      Scores.render(el);
    });
  });
})();
