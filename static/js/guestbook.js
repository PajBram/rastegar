/* Guestbook.
 *
 * Reads visible entries straight from the `guestbook` view and posts new ones
 * through the sign_guestbook() database function, which enforces the length
 * limits, the honeypot and the rate limit. See supabase/schema.sql.
 */
(function () {
  'use strict';

  var cfg = window.RASTEGAR || {};
  var configured = Boolean(cfg.url && cfg.anonKey);
  var form = document.getElementById('guestbook-form');
  var list = document.getElementById('guestbook-entries');
  var status = document.getElementById('gb-status');
  var counter = document.getElementById('gb-count');
  var message = document.getElementById('gb-message');
  if (!form || !list) return;

  function headers() {
    return {
      'apikey': cfg.anonKey,
      'Authorization': 'Bearer ' + cfg.anonKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  function when(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    } catch (e) { return ''; }
  }

  function load() {
    if (!configured) {
      list.innerHTML = '<p class="scoreboard__empty">The guestbook opens as soon as the '
        + 'backend is switched on. Come back in a bit.</p>';
      return;
    }
    fetch(cfg.url.replace(/\/$/, '')
          + '/rest/v1/guestbook?select=name,message,created_at&order=created_at.desc&limit=50',
          { headers: headers() })
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(function (rows) {
        if (!rows.length) {
          list.innerHTML = '<p class="scoreboard__empty">No one has signed yet. Go on.</p>';
          return;
        }
        var ul = document.createElement('ul');
        ul.className = 'entries-list';
        rows.forEach(function (row) {
          var li = document.createElement('li');
          li.className = 'gb-entry';
          var head = document.createElement('div');
          head.className = 'gb-entry__head';
          var name = document.createElement('span');
          name.className = 'gb-entry__name';
          name.textContent = row.name;
          var time = document.createElement('time');
          time.dateTime = row.created_at;
          time.textContent = when(row.created_at);
          head.appendChild(name);
          head.appendChild(time);
          var text = document.createElement('p');
          text.textContent = row.message;      // textContent: no HTML from visitors, ever
          li.appendChild(head);
          li.appendChild(text);
          ul.appendChild(li);
        });
        list.innerHTML = '';
        list.appendChild(ul);
      })
      .catch(function () {
        list.innerHTML = '<p class="scoreboard__empty">Could not load the wall right now.</p>';
      });
  }

  if (message && counter) {
    message.addEventListener('input', function () {
      counter.textContent = String(message.value.length);
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var name = form.elements.name.value.trim();
    var text = form.elements.message.value.trim();
    var honeypot = form.elements.website.value;

    function fail(text) {
      status.className = 'form-status error';
      status.textContent = text;
    }

    if (name.length < 2 || name.length > 24) return fail('Name is 2 to 24 characters.');
    if (text.length < 2) return fail('Write something first.');
    if (text.length > 500) return fail('Keep it under 500 characters.');
    if (!configured) return fail('The guestbook is not switched on yet.');

    var button = form.querySelector('button');
    button.disabled = true;
    status.className = 'form-status';
    status.textContent = 'Sending...';

    fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/sign_guestbook', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_name: name, p_message: text, p_website: honeypot })
    }).then(function (res) {
      return res.text().then(function (body) {
        var data = null;
        if (body) { try { data = JSON.parse(body); } catch (e) { data = body; } }
        if (!res.ok) throw new Error((data && (data.message || data.hint)) || 'Rejected');
        return data;
      });
    }).then(function () {
      status.className = 'form-status ok';
      status.textContent = 'Signed. Thanks for stopping by.';
      form.reset();
      if (counter) counter.textContent = '0';
      button.disabled = false;
      load();
    }).catch(function (err) {
      button.disabled = false;
      fail(err.message || 'That did not go through.');
    });
  });

  load();
})();
