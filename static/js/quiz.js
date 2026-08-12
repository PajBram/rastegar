/* Quiz engine.
 *
 * One engine, many question banks. The page supplies a bank URL through
 * data-bank on #game-root; everything else — difficulties, questions, spoiler
 * notes — comes from that JSON file. Adding Bleach means adding a JSON file
 * and a game card, never touching this file. See CONTENT.md.
 */
(function () {
  'use strict';

  var root = document.getElementById('game-root');
  if (!root || !root.getAttribute('data-bank')) return;

  var SLUG = root.getAttribute('data-game');
  var PER_ROUND = 15;
  var SECONDS = 20;

  var bank = null;
  var state = null;
  var tickHandle = null;

  // ---------------------------------------------------------------- helpers
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function shuffle(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  /** Shuffle the options too, and follow the correct answer to its new index. */
  function prepare(question) {
    var pairs = question.a.map(function (text, index) {
      return { text: text, correct: index === question.correct };
    });
    var mixed = shuffle(pairs);
    return {
      q: question.q,
      note: question.note || '',
      options: mixed.map(function (p) { return p.text; }),
      correct: mixed.findIndex(function (p) { return p.correct; })
    };
  }

  // ------------------------------------------------------------------ menu
  function showMenu() {
    stopTimer();
    root.innerHTML = '';
    var stage = el('div', 'stage');
    var body = el('div', 'stage__body');

    body.appendChild(el('h3', 'quiz__question', 'Pick your level'));
    var list = el('div', 'difficulties');

    Object.keys(bank.difficulties).forEach(function (key) {
      var level = bank.difficulties[key];
      var button = el('button', 'difficulty');
      button.type = 'button';
      var left = el('span');
      left.appendChild(document.createTextNode(level.label));
      var small = el('small', null, level.blurb);
      left.appendChild(document.createElement('br'));
      left.appendChild(small);
      button.appendChild(left);
      button.appendChild(el('span', null, String(level.questions.length) + ' Q'));
      button.addEventListener('click', function () { start(key); });
      list.appendChild(button);
    });

    body.appendChild(list);
    var hint = el('p', 'quiz__feedback');
    hint.textContent = PER_ROUND + ' questions, ' + SECONDS
      + ' seconds each. Answer fast, keep a streak, do not guess wildly.';
    body.appendChild(hint);

    stage.appendChild(body);
    root.appendChild(stage);
  }

  // ------------------------------------------------------------------ play
  function start(levelKey) {
    var level = bank.difficulties[levelKey];
    state = {
      level: levelKey,
      label: level.label,
      spoiler: level.spoiler || '',
      questions: shuffle(level.questions).slice(0, PER_ROUND).map(prepare),
      index: 0,
      score: 0,
      streak: 0,
      best: 0,
      correct: 0,
      missed: [],
      token: null,
      locked: false
    };

    if (window.Scores) {
      window.Scores.startRun(SLUG).then(function (token) { state.token = token; });
    }
    renderQuestion();
  }

  function renderQuestion() {
    stopTimer();
    state.locked = false;
    state.remaining = SECONDS;
    var question = state.questions[state.index];

    root.innerHTML = '';
    var stage = el('div', 'stage');

    var hud = el('div', 'stage__hud');
    var left = el('span', null, state.label.toUpperCase());
    var mid = el('span');
    mid.appendChild(el('strong', null, String(state.score)));
    mid.appendChild(document.createTextNode(' pts'));
    var timer = el('span', 'hud__timer', SECONDS + 's');
    hud.appendChild(left);
    hud.appendChild(mid);
    hud.appendChild(timer);
    stage.appendChild(hud);

    var body = el('div', 'stage__body');
    body.appendChild(el('p', 'quiz__progress',
      'Question ' + (state.index + 1) + ' of ' + state.questions.length
      + (state.streak > 1 ? '  •  streak ' + state.streak : '')));
    body.appendChild(el('h3', 'quiz__question', question.q));

    var options = el('div', 'quiz__options');
    question.options.forEach(function (text, index) {
      var button = el('button', 'quiz__option');
      button.type = 'button';
      button.textContent = (index + 1) + '.  ' + text;
      button.addEventListener('click', function () { answer(index); });
      options.appendChild(button);
    });
    body.appendChild(options);

    var feedback = el('p', 'quiz__feedback');
    feedback.setAttribute('role', 'status');
    body.appendChild(feedback);

    stage.appendChild(body);
    root.appendChild(stage);

    startTimer(timer);
  }

  function startTimer(node) {
    var started = Date.now();
    tickHandle = setInterval(function () {
      state.remaining = Math.max(0, SECONDS - (Date.now() - started) / 1000);
      node.textContent = state.remaining.toFixed(1) + 's';
      node.classList.toggle('low', state.remaining <= 5);
      if (state.remaining <= 0) {
        stopTimer();
        answer(-1);
      }
    }, 100);
  }

  function stopTimer() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }

  function answer(choice) {
    if (state.locked) return;
    state.locked = true;
    stopTimer();

    var question = state.questions[state.index];
    var right = choice === question.correct;
    var buttons = root.querySelectorAll('.quiz__option');
    var gained = 0;

    if (right) {
      state.correct += 1;
      state.streak += 1;
      state.best = Math.max(state.best, state.streak);
      gained = 100
        + Math.round(100 * (state.remaining / SECONDS))
        + Math.min(state.streak, 5) * 20;
      state.score += gained;
    } else {
      state.streak = 0;
      state.missed.push(question);
    }

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      if (i === question.correct) buttons[i].classList.add('correct');
      else if (i === choice) buttons[i].classList.add('wrong');
    }

    var feedback = root.querySelector('.quiz__feedback');
    var verdict = right ? 'Correct. +' + gained : (choice === -1 ? 'Out of time.' : 'Nope.');
    feedback.innerHTML = '';
    feedback.appendChild(el('b', null, verdict));
    if (question.note) {
      feedback.appendChild(document.createTextNode('  ' + question.note));
    }

    setTimeout(next, right ? 1200 : 2200);
  }

  function next() {
    state.index += 1;
    if (state.index >= state.questions.length) finish();
    else renderQuestion();
  }

  // --------------------------------------------------------------- results
  function finish() {
    stopTimer();
    root.innerHTML = '';
    var stage = el('div', 'stage');
    var overlay = el('div', 'stage__overlay');

    overlay.appendChild(el('h3', null, 'Round over'));
    overlay.appendChild(el('p', 'big', String(state.score)));
    overlay.appendChild(el('p', null,
      state.correct + ' of ' + state.questions.length + ' correct  •  best streak '
      + state.best + '  •  ' + state.label));

    if (window.Scores) {
      overlay.appendChild(window.Scores.submitForm({
        game: SLUG, score: state.score, token: state.token
      }));
    }

    var again = el('button', 'btn btn--small');
    again.type = 'button';
    again.textContent = 'Play again';
    again.addEventListener('click', showMenu);
    overlay.appendChild(again);

    if (state.missed.length) {
      var review = el('ul', 'quiz__review');
      state.missed.forEach(function (question) {
        var li = el('li');
        li.appendChild(el('span', 'mark', 'x '));
        li.appendChild(document.createTextNode(question.q + ' — '));
        li.appendChild(el('b', null, question.options[question.correct]));
        review.appendChild(li);
      });
      overlay.appendChild(el('p', null, 'What you missed:'));
      overlay.appendChild(review);
    }

    stage.appendChild(overlay);
    root.appendChild(stage);
  }

  // -------------------------------------------------------------- keyboard
  document.addEventListener('keydown', function (event) {
    if (!state || state.locked) return;
    var index = ['1', '2', '3', '4'].indexOf(event.key);
    if (index > -1) {
      var buttons = root.querySelectorAll('.quiz__option');
      if (buttons[index]) { event.preventDefault(); buttons[index].click(); }
    }
  });

  // ------------------------------------------------------------------ boot
  root.innerHTML = '<div class="stage"><div class="stage__body">'
    + '<p class="quiz__progress">Loading questions&hellip;</p></div></div>';

  fetch(root.getAttribute('data-bank'))
    .then(function (res) {
      if (!res.ok) throw new Error('bank ' + res.status);
      return res.json();
    })
    .then(function (data) { bank = data; showMenu(); })
    .catch(function () {
      root.innerHTML = '<div class="stage"><div class="stage__body">'
        + '<p class="quiz__progress">The question bank did not load. Reload the page?</p>'
        + '</div></div>';
    });
})();
