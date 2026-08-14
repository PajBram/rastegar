/* Kana Dojo — learn to read hiragana and katakana.
 *
 * Not an arcade game, so it does not sit on arcade.js: there is no canvas and
 * no clock pressure, only a question and four answers. What it shares is the
 * stage furniture (HUD, overlay) and highscores, where the score posted is
 * points from one twenty-question round.
 *
 * The teaching trick is weighted repetition: every character remembers how
 * often it was missed, and the picker leans toward the ones that owe you.
 * Characters are data; the whole syllabary lives in the tables below and the
 * engine never mentions a specific kana.
 */
(function () {
  'use strict';

  var root = document.getElementById('game-root');
  if (!root || !root.getAttribute('data-round')) return;

  var SLUG = root.getAttribute('data-game');
  var ROUND = parseInt(root.getAttribute('data-round'), 10) || 20;
  var PREF_KEY = 'rastegar.kana';

  /* -------------------------------------------------------------- tables */
  /* Romaji lines up index for index with both syllabaries, so one answer key
     serves hiragana and katakana alike. */
  var R_BAS = ('a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to '
    + 'na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro '
    + 'wa wo n').split(' ');
  var H_BAS = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'.split('');
  var K_BAS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'.split('');

  var R_DAK = 'ga gi gu ge go za ji zu ze zo da ji zu de do ba bi bu be bo pa pi pu pe po'.split(' ');
  var H_DAK = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ'.split('');
  var K_DAK = 'ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ'.split('');

  var R_COMBO = ('kya kyu kyo sha shu sho cha chu cho nya nyu nyo hya hyu hyo '
    + 'mya myu myo rya ryu ryo gya gyu gyo ja ju jo bya byu byo pya pyu pyo').split(' ');
  var H_COMBO = ('きゃ きゅ きょ しゃ しゅ しょ ちゃ ちゅ ちょ にゃ にゅ にょ ひゃ ひゅ ひょ '
    + 'みゃ みゅ みょ りゃ りゅ りょ ぎゃ ぎゅ ぎょ じゃ じゅ じょ びゃ びゅ びょ ぴゃ ぴゅ ぴょ').split(' ');
  var K_COMBO = ('キャ キュ キョ シャ シュ ショ チャ チュ チョ ニャ ニュ ニョ ヒャ ヒュ ヒョ '
    + 'ミャ ミュ ミョ リャ リュ リョ ギャ ギュ ギョ ジャ ジュ ジョ ビャ ビュ ビョ ピャ ピュ ピョ').split(' ');

  /* Real words stick better than bare symbols, so the last lesson reads whole
     words. Their romaji is derived from the kana, so a word is one line here.
     No small tsu and no long-vowel bar — the engine does not teach those yet. */
  var H_WORDS = [
    ['ねこ', 'cat'], ['いぬ', 'dog'], ['みず', 'water'], ['さかな', 'fish'],
    ['やま', 'mountain'], ['かわ', 'river'], ['ひと', 'person'], ['ほん', 'book'],
    ['はな', 'flower'], ['そら', 'sky'], ['あめ', 'rain'], ['ゆき', 'snow'],
    ['うみ', 'sea'], ['つき', 'moon'], ['くるま', 'car'], ['いえ', 'house'],
    ['ともだち', 'friend'], ['せんせい', 'teacher'], ['たべもの', 'food'], ['のみもの', 'drink'],
    ['ありがとう', 'thank you'], ['おはよう', 'good morning'], ['さようなら', 'goodbye'], ['おちゃ', 'tea']
  ];
  var K_WORDS = [
    ['テレビ', 'TV'], ['カメラ', 'camera'], ['バナナ', 'banana'], ['パン', 'bread'],
    ['アニメ', 'anime'], ['ピアノ', 'piano'], ['トマト', 'tomato'], ['ホテル', 'hotel'],
    ['バス', 'bus'], ['ミルク', 'milk'], ['レモン', 'lemon'], ['カラオケ', 'karaoke'],
    ['ワイン', 'wine'], ['メロン', 'melon'], ['サラダ', 'salad'], ['ズボン', 'trousers'],
    ['ガラス', 'glass'], ['テスト', 'test'], ['パソコン', 'computer']
  ];

  var KANA2R = {};
  function index(kana, romaji) {
    for (var i = 0; i < kana.length; i++) KANA2R[kana[i]] = romaji[i];
  }
  index(H_BAS, R_BAS); index(K_BAS, R_BAS);
  index(H_DAK, R_DAK); index(K_DAK, R_DAK);
  index(H_COMBO, R_COMBO); index(K_COMBO, R_COMBO);

  /* Spellings accepted in the typing mode beyond Hepburn: what a Japanese
     IME accepts, a learner should not be marked down for. */
  var VARIANTS = {
    shi: ['si'], chi: ['ti'], tsu: ['tu'], fu: ['hu'], ji: ['zi', 'di'],
    zu: ['du'], wo: ['o'], n: ['nn'],
    sha: ['sya'], shu: ['syu'], sho: ['syo'],
    cha: ['tya'], chu: ['tyu'], cho: ['tyo'],
    ja: ['zya', 'jya'], ju: ['zyu', 'jyu'], jo: ['zyo', 'jyo']
  };

  var SMALL = 'ゃゅょャュョ';

  function syllables(word) {
    var out = [];
    for (var i = 0; i < word.length; i++) {
      if (i + 1 < word.length && SMALL.indexOf(word.charAt(i + 1)) !== -1) {
        out.push(word.substr(i, 2));
        i++;
      } else {
        out.push(word.charAt(i));
      }
    }
    return out;
  }

  function romajiOf(word) {
    return syllables(word).map(function (s) { return KANA2R[s]; }).join('');
  }

  /** Every accepted spelling of a kana string: the cartesian product of each
   *  syllable's variants. Words here are short, so the set stays small. */
  function acceptedFor(word) {
    var set = [''];
    syllables(word).forEach(function (s) {
      var r = KANA2R[s];
      var alts = [r].concat(VARIANTS[r] || []);
      var next = [];
      set.forEach(function (pre) {
        alts.forEach(function (a) { next.push(pre + a); });
      });
      set = next;
    });
    return set;
  }

  /* ------------------------------------------------------------- lessons */
  var ROWRANGE = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 38], [38, 43], [43, 46]];
  var LESSONS = [
    { name: 'The First Ten', blurb: 'The a and ka rows. Everything starts here.', rows: [0, 1] },
    { name: 'Sa and Ta', blurb: 'Ten more, including the rebels shi, chi and tsu.', rows: [2, 3] },
    { name: 'Na and Ha', blurb: 'Halfway through the syllabary.', rows: [4, 5] },
    { name: 'Ma, Ya, Ra', blurb: 'Thirteen at once — the rows start rhyming.', rows: [6, 7, 8] },
    { name: 'All 46', blurb: 'The whole basic syllabary in one pot.', rows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { name: 'Voiced Marks', blurb: 'Two dots or a circle turn ka into ga and ha into pa.', set: 'dak' },
    { name: 'Combinations', blurb: 'A small ya, yu or yo glued on: kya, sho, chu.', set: 'combo' },
    { name: 'Real Words', blurb: 'Whole words you can actually use, with meanings.', set: 'words' }
  ];
  var SCRIPTS = [
    { id: 'h', label: 'Hiragana' },
    { id: 'k', label: 'Katakana' },
    { id: 'b', label: 'Mixed' }
  ];
  var MODES = [
    { id: 'read', label: 'Pick romaji' },
    { id: 'reco', label: 'Pick kana' },
    { id: 'write', label: 'Type romaji' },
    { id: 'study', label: 'Study' }
  ];

  function lessonItems(scriptId, lesson) {
    var items = [];
    var scripts = scriptId === 'b' ? ['h', 'k'] : [scriptId];
    scripts.forEach(function (s) {
      var i;
      if (lesson.set === 'dak') {
        var dak = s === 'h' ? H_DAK : K_DAK;
        for (i = 0; i < dak.length; i++) items.push({ k: dak[i], r: R_DAK[i] });
      } else if (lesson.set === 'combo') {
        var combo = s === 'h' ? H_COMBO : K_COMBO;
        for (i = 0; i < combo.length; i++) items.push({ k: combo[i], r: R_COMBO[i] });
      } else if (lesson.set === 'words') {
        var words = s === 'h' ? H_WORDS : K_WORDS;
        words.forEach(function (w) {
          items.push({ k: w[0], r: romajiOf(w[0]), gloss: w[1], word: true });
        });
      } else {
        var bas = s === 'h' ? H_BAS : K_BAS;
        lesson.rows.forEach(function (ri) {
          for (i = ROWRANGE[ri][0]; i < ROWRANGE[ri][1]; i++) {
            items.push({ k: bas[i], r: R_BAS[i] });
          }
        });
      }
    });
    return items;
  }

  /* ---------------------------------------------------------------- state */
  var prefs = loadPrefs();
  if (!prefs.chars) prefs.chars = {};
  var scriptId = prefs.script === 'k' || prefs.script === 'b' ? prefs.script : 'h';
  var modeId = { read: 1, reco: 1, write: 1, study: 1 }[prefs.mode] ? prefs.mode : 'read';

  var lesson = null;
  var pool = [];
  var q = null;            // current question item
  var qNum = 0;
  var nRight = 0;
  var nWrong = 0;
  var streak = 0;
  var score = 0;
  var askedAt = 0;
  var lastKana = null;
  var missed = {};         // kana -> misses this round
  var locked = false;      // answer shown, waiting to advance
  var advance = null;
  var running = false;
  var token = null;

  var ui = {};

  /* -------------------------------------------------------------- helpers */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; }
  }

  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ }
  }

  function charStat(kana) {
    return prefs.chars[kana] || (prefs.chars[kana] = { right: 0, wrong: 0, streak: 0 });
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  /* Japanese speech is a bonus, not a dependency: no ja voice, no sound,
     and everything else still works. */
  var jaVoice = null;
  function pickVoice() {
    var voices = window.speechSynthesis.getVoices();
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang && voices[i].lang.toLowerCase().indexOf('ja') === 0) { jaVoice = voices[i]; return; }
    }
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }
  function speak(text) {
    if (!('speechSynthesis' in window) || prefs.quiet) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  }

  /* ---------------------------------------------------------------- stage */
  function buildStage() {
    root.innerHTML = '';
    var stage = el('div', 'stage stage--kana');

    var hud = el('div', 'stage__hud');
    ui.score = el('strong', null, '0');
    ui.q = el('strong', null, '-');
    ui.streak = el('strong', null, '0');
    ui.acc = el('strong', null, '100%');
    hud.appendChild(stat('SCORE', ui.score));
    hud.appendChild(stat('Q', ui.q));
    hud.appendChild(stat('STREAK', ui.streak));
    hud.appendChild(stat('ACC', ui.acc));
    stage.appendChild(hud);

    var body = el('div', 'stage__body kana');
    ui.prompt = el('div', 'kana__prompt');
    ui.prompt.setAttribute('lang', 'ja');
    ui.sub = el('p', 'kana__sub');
    ui.choices = el('div', 'kana__choices');
    ui.write = el('form', 'kana__write');
    ui.input = document.createElement('input');
    ui.input.type = 'text';
    ui.input.setAttribute('autocomplete', 'off');
    ui.input.setAttribute('autocorrect', 'off');
    ui.input.setAttribute('autocapitalize', 'none');
    ui.input.setAttribute('spellcheck', 'false');
    ui.input.setAttribute('aria-label', 'Type the romaji');
    ui.input.placeholder = 'type romaji, then Enter';
    ui.write.appendChild(ui.input);
    ui.feedback = el('p', 'kana__feedback');
    ui.cards = el('div', 'kana__cards');
    ui.cards.setAttribute('lang', 'ja');

    body.appendChild(ui.prompt);
    body.appendChild(ui.sub);
    body.appendChild(ui.choices);
    body.appendChild(ui.write);
    body.appendChild(ui.feedback);
    body.appendChild(ui.cards);
    stage.appendChild(body);

    ui.overlay = el('div', 'stage__overlay');
    stage.appendChild(ui.overlay);
    root.appendChild(stage);
    // Outside the stage so the lesson-list overlay never covers them: script
    // and mode need to be switchable while choosing a lesson.
    root.appendChild(buildOptions());

    ui.choices.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('button') : null;
      if (button && !locked) answer(button.getAttribute('data-value'));
    });
    ui.write.addEventListener('submit', function (event) {
      event.preventDefault();
      if (locked) { next(); return; }
      var value = ui.input.value.trim().toLowerCase();
      if (value) answer(value);
    });
    // Once the verdict is on screen, a tap anywhere moves on. Phones first.
    body.addEventListener('click', function (event) {
      if (locked && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'INPUT'
          && event.target.tagName !== 'LABEL') next();
    });
    ui.cards.addEventListener('click', function (event) {
      var card = event.target.closest ? event.target.closest('.kana__card') : null;
      if (card) speak(card.getAttribute('data-kana'));
    });
    document.addEventListener('keydown', onKey);
  }

  function stat(label, strong) {
    var span = el('span', 'kana__stat');
    span.appendChild(document.createTextNode(label + ' '));
    span.appendChild(strong);
    return span;
  }

  function buildOptions() {
    var bar = el('div', 'kana__opts');

    ui.scriptToggle = el('button', 'kana__toggle');
    ui.scriptToggle.type = 'button';
    ui.scriptToggle.addEventListener('click', function () {
      var order = ['h', 'k', 'b'];
      scriptId = order[(order.indexOf(scriptId) + 1) % order.length];
      prefs.script = scriptId;
      savePrefs();
      paintToggles();
      showMenu();
    });
    bar.appendChild(ui.scriptToggle);

    ui.modeToggle = el('button', 'kana__toggle');
    ui.modeToggle.type = 'button';
    ui.modeToggle.addEventListener('click', function () {
      var ids = MODES.map(function (m) { return m.id; });
      modeId = ids[(ids.indexOf(modeId) + 1) % ids.length];
      prefs.mode = modeId;
      savePrefs();
      paintToggles();
      showMenu();
    });
    bar.appendChild(ui.modeToggle);

    var check = el('label', 'kana__check');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !prefs.quiet;
    box.addEventListener('change', function () {
      prefs.quiet = !box.checked;
      savePrefs();
    });
    check.appendChild(box);
    check.appendChild(document.createTextNode('Speak answers'));
    bar.appendChild(check);

    paintToggles();
    return bar;
  }

  function paintToggles() {
    var scriptLabel = SCRIPTS.filter(function (s) { return s.id === scriptId; })[0].label;
    var modeLabel = MODES.filter(function (m) { return m.id === modeId; })[0].label;
    ui.scriptToggle.textContent = 'Script: ' + scriptLabel;
    ui.modeToggle.textContent = 'Mode: ' + modeLabel;
  }

  function onKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') { event.preventDefault(); showMenu(); return; }
    if (!running) return;
    if (event.target === ui.input) return;   // the form handles its own Enter
    if (event.key === 'Enter' && locked) { event.preventDefault(); next(); return; }
    if (!locked && '1234'.indexOf(event.key) !== -1) {
      var button = ui.choices.children[Number(event.key) - 1];
      if (button) { event.preventDefault(); answer(button.getAttribute('data-value')); }
    }
  }

  /* ----------------------------------------------------------- questions */
  /* Unseen characters and recent offenders come up more; the mastered ones
     fade to the background instead of padding the score. */
  function weightOf(item) {
    var s = prefs.chars[item.k];
    var w;
    if (!s || (s.right === 0 && s.wrong === 0)) w = 2.5;
    else {
      w = 1 + 2 * (s.wrong / (s.right + s.wrong));
      if (s.streak >= 5) w *= 0.35;
    }
    if (item.k === lastKana) w *= 0.05;
    return w;
  }

  function pickItem() {
    var total = 0;
    var weights = pool.map(function (item) { var w = weightOf(item); total += w; return w; });
    var roll = Math.random() * total;
    for (var i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function distractors(item, field, count) {
    var seen = {};
    seen[item[field]] = true;
    var out = [];
    shuffle(pool.slice()).forEach(function (candidate) {
      if (out.length >= count || seen[candidate[field]]) return;
      seen[candidate[field]] = true;
      out.push(candidate);
    });
    return out;
  }

  function ask() {
    clearTimeout(advance);
    locked = false;
    q = pickItem();
    lastKana = q.k;
    qNum++;
    askedAt = Date.now();
    ui.q.textContent = qNum + '/' + ROUND;
    ui.feedback.textContent = '';
    ui.feedback.className = 'kana__feedback';
    ui.choices.innerHTML = '';
    ui.write.style.display = 'none';

    var reversed = modeId === 'reco';
    ui.prompt.textContent = reversed ? q.r : q.k;
    ui.prompt.className = 'kana__prompt' + (q.word || reversed ? ' kana__prompt--small' : '');
    ui.sub.textContent = reversed ? 'Which character reads like this?'
      : (q.word ? 'What does this spell? Answer in romaji.' : 'How does this read?');

    if (modeId === 'write') {
      ui.write.style.display = '';
      ui.input.disabled = false;
      ui.input.value = '';
      ui.input.focus();
      return;
    }
    var field = reversed ? 'k' : 'r';
    var options = shuffle([q].concat(distractors(q, field, 3)));
    options.forEach(function (option, i) {
      var button = el('button', 'kana__choice');
      button.type = 'button';
      button.setAttribute('data-value', option[field]);
      if (reversed) button.setAttribute('lang', 'ja');
      button.appendChild(el('small', null, String(i + 1)));
      button.appendChild(el('span', null, option[field]));
      ui.choices.appendChild(button);
    });
  }

  function answer(value) {
    if (locked) return;
    locked = true;
    if (!token && window.Scores) {
      window.Scores.startRun(SLUG).then(function (t) { token = t; });
    }

    var right;
    if (modeId === 'write') {
      right = acceptedFor(q.k).indexOf(value) !== -1;
      ui.input.disabled = true;
    } else {
      var field = modeId === 'reco' ? 'k' : 'r';
      right = value === q[field];
      for (var i = 0; i < ui.choices.children.length; i++) {
        var button = ui.choices.children[i];
        button.disabled = true;
        if (button.getAttribute('data-value') === q[field]) button.classList.add('is-right');
        else if (button.getAttribute('data-value') === value) button.classList.add('is-wrong');
      }
    }

    var s = charStat(q.k);
    if (right) {
      s.right++; s.streak++;
      nRight++; streak++;
      // Base points, a bonus for answering inside five seconds, and a pinch
      // of streak. All three are capped so no single habit games the board.
      var seconds = (Date.now() - askedAt) / 1000;
      score += 100 + Math.round(Math.max(0, 50 - seconds * 10)) + 5 * Math.min(streak, 10);
    } else {
      s.wrong++; s.streak = 0;
      nWrong++; streak = 0;
      missed[q.k] = (missed[q.k] || 0) + 1;
    }
    savePrefs();

    ui.score.textContent = String(score);
    ui.streak.textContent = String(streak);
    ui.acc.textContent = Math.round(100 * nRight / (nRight + nWrong)) + '%';
    var meaning = q.gloss ? ' — "' + q.gloss + '"' : '';
    ui.feedback.textContent = (right ? 'Right! ' : 'It reads: ') + q.k + ' = ' + q.r + meaning;
    ui.feedback.className = 'kana__feedback ' + (right ? 'is-right' : 'is-wrong');
    speak(q.k);

    advance = setTimeout(next, right ? 900 : 2000);
  }

  function next() {
    clearTimeout(advance);
    if (!running) return;
    if (qNum >= ROUND) finish();
    else ask();
  }

  /* --------------------------------------------------------------- rounds */
  function start(chosen) {
    lesson = chosen;
    pool = lessonItems(scriptId, lesson);
    qNum = 0; nRight = 0; nWrong = 0; streak = 0; score = 0;
    missed = {};
    lastKana = null;
    token = null;
    running = true;
    ui.overlay.innerHTML = '';
    ui.overlay.classList.add('hidden');
    ui.cards.innerHTML = '';
    ui.score.textContent = '0';
    ui.streak.textContent = '0';
    ui.acc.textContent = '100%';

    if (modeId === 'study') { study(); return; }
    ask();
  }

  /* Study is the same lesson laid flat: every character with its reading,
     tap to hear it. No clock, no score — it feeds the quiz modes. */
  function study() {
    running = false;
    ui.prompt.textContent = '';
    ui.prompt.className = 'kana__prompt';
    ui.sub.textContent = 'Tap a card to hear it. Switch mode below when it sticks.';
    ui.choices.innerHTML = '';
    ui.write.style.display = 'none';
    ui.feedback.textContent = '';
    ui.feedback.className = 'kana__feedback';
    ui.q.textContent = '-';
    ui.cards.innerHTML = '';
    pool.forEach(function (item) {
      var card = el('div', 'kana__card' + (item.word ? ' kana__card--word' : ''));
      card.setAttribute('data-kana', item.k);
      card.appendChild(el('span', 'kana__glyph', item.k));
      card.appendChild(el('small', null, item.r + (item.gloss ? ' · ' + item.gloss : '')));
      ui.cards.appendChild(card);
    });
  }

  function finish() {
    running = false;
    var accuracy = Math.round(100 * nRight / (nRight + nWrong));

    ui.overlay.innerHTML = '';
    ui.overlay.classList.remove('hidden');
    ui.overlay.classList.remove('stage__overlay--list');
    ui.overlay.appendChild(el('h2', null, 'Round complete'));
    ui.overlay.appendChild(el('p', 'big', String(score)));
    ui.overlay.appendChild(el('p', null, nRight + ' of ' + (nRight + nWrong) + ' right — ' + accuracy + '% accuracy'));

    var worst = Object.keys(missed).sort(function (a, b) { return missed[b] - missed[a]; }).slice(0, 5);
    if (worst.length) {
      var line = el('p', 'kana__worst');
      line.appendChild(document.createTextNode('Study these: '));
      worst.forEach(function (kana) {
        line.appendChild(el('code', null, kana + ' = ' + (KANA2R[kana] || romajiOf(kana))));
      });
      ui.overlay.appendChild(line);
    }

    if (window.Scores && (token || !window.Scores.configured)) {
      ui.overlay.appendChild(window.Scores.submitForm({ game: SLUG, token: token, score: score }));
    } else if (window.Scores) {
      ui.overlay.appendChild(el('p', 'scoreboard__empty',
        'This round could not be registered with the scoreboard, so it stays on your own screen.'));
    }

    var again = el('button', 'btn btn--small', 'Same lesson again');
    again.type = 'button';
    again.addEventListener('click', function () { start(lesson); });
    ui.overlay.appendChild(again);

    var other = el('button', 'btn btn--small btn--ghost', 'Pick another lesson');
    other.type = 'button';
    other.addEventListener('click', showMenu);
    ui.overlay.appendChild(other);
  }

  function showMenu() {
    running = false;
    locked = false;
    clearTimeout(advance);
    ui.overlay.innerHTML = '';
    ui.overlay.classList.remove('hidden');
    ui.overlay.classList.add('stage__overlay--list');
    ui.overlay.appendChild(el('h2', null, 'Pick a lesson'));

    var list = el('div', 'difficulties');
    LESSONS.forEach(function (entry) {
      var items = lessonItems(scriptId, entry);
      var solid = items.filter(function (item) {
        var s = prefs.chars[item.k];
        return s && s.streak >= 5;
      }).length;

      var button = el('button', 'difficulty');
      button.type = 'button';
      var left = el('span');
      left.appendChild(document.createTextNode(entry.name));
      left.appendChild(document.createElement('br'));
      left.appendChild(el('small', null, entry.blurb + (solid ? ' — ' + solid + ' of ' + items.length + ' solid' : '')));
      button.appendChild(left);
      // The badge shows the lesson in the script you are actually drilling.
      var badge = el('span', null, items[0].k + (items[1] && !items[0].word ? ' ' + items[1].k : ''));
      badge.setAttribute('lang', 'ja');
      button.appendChild(badge);
      button.addEventListener('click', function () { start(entry); });
      list.appendChild(button);
    });
    ui.overlay.appendChild(list);
    ui.overlay.appendChild(el('p', 'kana__note',
      'Characters you miss come back more often until they stop missing. '
      + 'Switch script and mode below the stage.'));
  }

  buildStage();
  showMenu();
})();
