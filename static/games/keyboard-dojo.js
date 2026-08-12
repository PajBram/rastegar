/* Keyboard Dojo — touch typing drills.
 *
 * Not an arcade game, so it does not sit on arcade.js: there is no canvas and
 * no game loop, only a target string and a cursor walking through it. What it
 * does share is the stage furniture (HUD, overlay) and highscores, where the
 * score posted is net words per minute.
 *
 * The drawn keyboard is the whole point. It lights the next key so the typist
 * has somewhere to look that is not their own hands, which is the only way the
 * habit ever breaks. Layouts are data; adding one means adding an entry to
 * LAYOUTS, not touching the engine.
 */
(function () {
  'use strict';

  var root = document.getElementById('game-root');
  if (!root || !root.getAttribute('data-layout')) return;

  var SLUG = root.getAttribute('data-game');
  var PREF_KEY = 'rastegar.dojo';

  // Fingers are numbered left little (0) to right little (7). 8 is the thumbs.
  var FINGER_NAMES = [
    'left little', 'left ring', 'left middle', 'left index',
    'right index', 'right middle', 'right ring', 'right little', 'thumb'
  ];

  /* ------------------------------------------------------------- layouts */
  /* A character key is a string: first character unshifted, second shifted.
     Anything else on the row is an object and never a typing target. The
     fingers array lines up with keys, one entry per key. */
  var LAYOUTS = {
    se: {
      label: 'Swedish',
      rows: [
        { keys: ['§½', '1!', '2"', '3#', '4¤', '5%', '6&', '7/', '8(', '9)', '0=', '+?', '´`'],
          fingers: [0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7],
          post: { n: 'Back', w: 2 } },
        { pre: { n: 'Tab', w: 1.5 },
          keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'å', '¨^'],
          fingers: [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7],
          post: { n: 'Enter', w: 1.5 } },
        { pre: { n: 'Caps', w: 1.8 },
          keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä', "'*"],
          fingers: [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7],
          post: { n: '↵', w: 1.2 } },
        { pre: { n: 'Shift', w: 1.3, id: 'lshift' },
          keys: ['<>', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',;', '.:', '-_'],
          fingers: [0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7],
          post: { n: 'Shift', w: 2.6, id: 'rshift' } },
        { space: true }
      ]
    },
    us: {
      label: 'US',
      rows: [
        { keys: ['`~', '1!', '2@', '3#', '4$', '5%', '6^', '7&', '8*', '9(', '0)', '-_', '=+'],
          fingers: [0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7],
          post: { n: 'Back', w: 2 } },
        { pre: { n: 'Tab', w: 1.5 },
          keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[{', ']}'],
          fingers: [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7],
          post: { n: '\\|', w: 1.5 } },
        { pre: { n: 'Caps', w: 1.8 },
          keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';:', "'\""],
          fingers: [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7],
          post: { n: 'Enter', w: 2.2 } },
        { pre: { n: 'Shift', w: 2.2, id: 'lshift' },
          keys: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',<', '.>', '/?'],
          fingers: [0, 1, 2, 3, 3, 4, 4, 5, 6, 7],
          post: { n: 'Shift', w: 2.4, id: 'rshift' } },
        { space: true }
      ]
    }
  };

  /* --------------------------------------------------------------- drills */
  var WORDS = ('the and for you with this that have from they will what when your '
    + 'said each time make like into more than them some other only over most also '
    + 'after first well much down come long many good know take year work back '
    + 'give day part hand right small never under while place great home night')
    .split(' ');

  var SENTENCES = [
    'The quick brown fox jumps over the lazy dog.',
    'Sphinx of black quartz, judge my vow.',
    'How vexingly quick daft zebras jump!',
    'Pack my box with five dozen jugs of milk.',
    'The ink dries long before the story ends.',
    'A steady hand beats a fast one every single time.',
    'Panels are only frames with something to say.',
    'Keep going until your fingers stop asking for help.',
    'Every page starts as a blank white rectangle.',
    'Speed is what accuracy turns into when you wait.'
  ];

  /* Each drill is a recipe, not a fixed text: a fresh one is rolled per run so
     you cannot learn the answer instead of the keys. `nordic` drills are only
     offered on layouts that actually have those keys. */
  var DRILLS = [
    { name: 'Home Row', badge: 'HOME', blurb: 'Where your fingers live. Never look down.',
      pool: 'asdfjkl', poolSe: 'asdfjklö',
      words: ['ask', 'all', 'fall', 'flask', 'salad', 'lad', 'dad', 'alas', 'fads', 'flak'] },
    { name: 'Home Row plus G H', badge: 'HOME +', blurb: 'The two keys your index fingers stretch for.',
      pool: 'asdfghjkl', poolSe: 'asdfghjklö',
      words: ['gash', 'glad', 'flash', 'shall', 'hall', 'half', 'dash', 'lash', 'flags', 'glass'] },
    { name: 'Top Row', badge: 'TOP', blurb: 'Reach up, then come straight back home.',
      pool: 'qwertyuiop',
      words: ['you', 'type', 'quiet', 'tower', 'power', 'report', 'pretty', 'output', 'poetry', 'write'] },
    { name: 'Bottom Row', badge: 'BOTTOM', blurb: 'The awkward one. No vowels, no mercy.',
      pool: 'zxcvbnm', letters: true },
    { name: 'Nordic Keys', badge: '\u00c5 \u00c4 \u00d6', blurb: 'The three keys the rest of the world does not have.',
      nordic: true, pool: 'åäöasdfjkl',
      words: ['ås', 'älg', 'öl', 'öka', 'åka', 'ägg', 'öde', 'år'] },
    { name: 'The Whole Alphabet', badge: 'A-Z', blurb: 'Every letter, in no particular order.',
      pool: 'abcdefghijklmnopqrstuvwxyz', words: WORDS },
    { name: 'Capitals', badge: 'SHIFT', blurb: 'Shift with the hand that is not typing the letter.',
      caps: true },
    { name: 'Numbers and Signs', badge: '0-9', blurb: 'The row you always look down at. Stop.',
      digits: true },
    { name: 'Real Words', badge: 'WORDS', blurb: 'The hundred words that make up most of everything.',
      realWords: true },
    { name: 'Sentences', badge: 'TEXT', blurb: 'Punctuation, capitals and rhythm together.',
      sentences: true }
  ];

  /* ---------------------------------------------------------------- state */
  var prefs = loadPrefs();
  var layoutKey = LAYOUTS[prefs.layout] ? prefs.layout : root.getAttribute('data-layout');
  if (!LAYOUTS[layoutKey]) layoutKey = 'se';

  var keys = {};        // character -> { el, finger, shift }
  var special = {};     // id -> element
  var chars = [];       // one span per character of the target
  var target = '';
  var pos = 0;
  var typed = 0;
  var misses = 0;
  var missByChar = {};
  var startedAt = null;
  var token = null;
  var ticker = null;
  var drill = null;
  var running = false;

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

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function group(pool, min, max) {
    var n = min + Math.floor(Math.random() * (max - min + 1));
    var out = '';
    for (var i = 0; i < n; i++) out += pool.charAt(Math.floor(Math.random() * pool.length));
    return out;
  }

  function nordicLayout() { return layoutKey === 'se'; }

  function availableDrills() {
    return DRILLS.filter(function (d) { return !d.nordic || nordicLayout(); });
  }

  /* Build the text for one run. Around 30 tokens keeps a run near a minute at
     beginner speed, which is long enough to measure and short enough to retry. */
  function buildText(d) {
    var out = [];
    var i;
    if (d.sentences) {
      for (i = 0; i < 4; i++) out.push(pick(SENTENCES));
      return out.join(' ');
    }
    if (d.realWords) {
      for (i = 0; i < 32; i++) out.push(pick(WORDS));
      return out.join(' ');
    }
    if (d.caps) {
      for (i = 0; i < 28; i++) {
        var w = pick(WORDS);
        out.push(i % 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toUpperCase());
      }
      return out.join(' ');
    }
    if (d.digits) {
      var mixed = ['1,5', '2.0', '10%', '4/5', '3-1', '(7)', '8-0', 'no9'];
      for (i = 0; i < 30; i++) {
        out.push(i % 3 === 2 ? pick(mixed) : group('0123456789', 2, 4));
      }
      return out.join(' ');
    }
    var pool = (nordicLayout() && d.poolSe) ? d.poolSe : d.pool;
    for (i = 0; i < 30; i++) {
      if (d.words && !d.letters && i % 3 === 1) { out.push(pick(d.words)); continue; }
      out.push(group(pool, 3, 5));
    }
    return out.join(' ');
  }

  /* ------------------------------------------------------------- keyboard */
  function keyNode(lower, upper, finger, home) {
    var node = el('span', 'dojo__key' + (home ? ' is-home' : ''));
    if (upper) node.appendChild(el('small', null, upper));
    node.appendChild(el('span', 'dojo__cap', lower === ' ' ? '' : lower.toUpperCase()));
    keys[lower] = { el: node, finger: finger, shift: false };
    if (lower.toUpperCase() !== lower) {
      keys[lower.toUpperCase()] = { el: node, finger: finger, shift: true };
    }
    if (upper) keys[upper] = { el: node, finger: finger, shift: true };
    return node;
  }

  /* Widths are shares of the row, never pixels: at 375px a fixed-width Shift
     eats the letters next to it, which are the keys that matter. */
  function modNode(spec) {
    // Only the two Shifts are ever pointed at, so the rest are scenery and get
    // dropped on narrow screens to leave room for the keys being taught.
    var node = el('span', 'dojo__key dojo__key--mod' + (spec.id ? '' : ' dojo__key--extra'), spec.n);
    node.style.flexGrow = spec.w;
    node.style.flexBasis = '0';
    if (spec.id) special[spec.id] = node;
    return node;
  }

  function buildKeyboard() {
    var wrap = el('div', 'dojo__kb');
    keys = {};
    special = {};
    LAYOUTS[layoutKey].rows.forEach(function (row) {
      var line = el('div', 'dojo__kbrow');
      if (row.space) {
        line.appendChild(modNode({ n: 'Ctrl', w: 1.4 }));
        line.appendChild(modNode({ n: 'Alt', w: 1.2 }));
        var bar = keyNode(' ', '', 8, false);
        bar.style.flexGrow = 7;
        bar.style.flexBasis = '0';
        line.appendChild(bar);
        line.appendChild(modNode({ n: 'Alt', w: 1.2 }));
        line.appendChild(modNode({ n: 'Ctrl', w: 1.4 }));
        wrap.appendChild(line);
        return;
      }
      if (row.pre) line.appendChild(modNode(row.pre));
      row.keys.forEach(function (pair, index) {
        var lower = pair.charAt(0);
        var upper = pair.length > 1 ? pair.charAt(1) : '';
        line.appendChild(keyNode(lower, upper, row.fingers[index], lower === 'f' || lower === 'j'));
      });
      if (row.post) line.appendChild(modNode(row.post));
      wrap.appendChild(line);
    });
    return wrap;
  }

  /* Two hands of four fingers. The active one goes red; that is the whole
     vocabulary this design gets, and it is enough. */
  function buildHands() {
    var wrap = el('div', 'dojo__hands');
    ui.fingers = {};
    [[0, 1, 2, 3], [7, 6, 5, 4]].forEach(function (set, hand) {
      var h = el('div', 'dojo__hand' + (hand ? ' dojo__hand--right' : ''));
      set.forEach(function (finger, index) {
        var f = el('span', 'dojo__finger');
        var tall = hand ? [30, 40, 46, 40][3 - index] : [30, 40, 46, 40][index];
        f.style.height = tall + 'px';
        ui.fingers[finger] = f;
        h.appendChild(f);
      });
      var thumb = el('span', 'dojo__thumb');
      if (!ui.fingers[8]) ui.fingers[8] = thumb;
      h.appendChild(thumb);
      wrap.appendChild(h);
    });
    return wrap;
  }

  /* ---------------------------------------------------------------- stage */
  function buildStage() {
    root.innerHTML = '';
    var stage = el('div', 'stage stage--dojo');

    var hud = el('div', 'stage__hud');
    ui.wpm = el('strong', null, '0');
    ui.acc = el('strong', null, '100%');
    ui.left = el('span', null, '0%');
    hud.appendChild(wrapStat('WPM', ui.wpm));
    hud.appendChild(wrapStat('ACC', ui.acc));
    hud.appendChild(wrapStat('DONE', ui.left));
    stage.appendChild(hud);

    var body = el('div', 'stage__body dojo');
    ui.text = el('div', 'dojo__text');
    ui.scroll = el('div', 'dojo__scroll');
    ui.text.appendChild(ui.scroll);
    body.appendChild(ui.text);

    ui.hint = el('p', 'dojo__hint', 'Type the first letter to start the clock.');
    body.appendChild(ui.hint);
    body.appendChild(buildHands());
    ui.kb = buildKeyboard();
    body.appendChild(ui.kb);

    // Off-screen input so a phone raises its keyboard when the stage is tapped.
    ui.input = document.createElement('input');
    ui.input.className = 'dojo__input';
    ui.input.setAttribute('autocomplete', 'off');
    ui.input.setAttribute('autocorrect', 'off');
    ui.input.setAttribute('autocapitalize', 'none');
    ui.input.setAttribute('spellcheck', 'false');
    ui.input.setAttribute('aria-label', 'Typing area');
    body.appendChild(ui.input);

    body.appendChild(buildOptions());
    stage.appendChild(body);

    ui.overlay = el('div', 'stage__overlay');
    stage.appendChild(ui.overlay);

    root.appendChild(stage);

    stage.addEventListener('mousedown', function (event) {
      if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'BUTTON') focusInput();
    });
    stage.addEventListener('touchstart', function (event) {
      if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'BUTTON') focusInput();
    }, { passive: true });

    ui.input.addEventListener('keydown', onKeyDown);
    ui.input.addEventListener('input', onSoftInput);
  }

  function wrapStat(label, strong) {
    var span = el('span', 'dojo__stat');
    span.appendChild(document.createTextNode(label + ' '));
    span.appendChild(strong);
    return span;
  }

  function buildOptions() {
    var bar = el('div', 'dojo__opts');

    var layout = el('button', 'dojo__toggle');
    layout.type = 'button';
    layout.textContent = 'Layout: ' + LAYOUTS[layoutKey].label;
    layout.addEventListener('click', function () {
      layoutKey = layoutKey === 'se' ? 'us' : 'se';
      prefs.layout = layoutKey;
      savePrefs();
      layout.textContent = 'Layout: ' + LAYOUTS[layoutKey].label;
      var fresh = buildKeyboard();
      ui.kb.parentNode.replaceChild(fresh, ui.kb);
      ui.kb = fresh;
      showMenu();
    });
    bar.appendChild(layout);

    bar.appendChild(toggle('Hide keys', 'hide', function (on) {
      ui.kb.classList.toggle('is-hidden', on);
    }));
    bar.appendChild(toggle('Stop on error', 'strict', function () {}));
    return bar;
  }

  function toggle(label, key, apply) {
    var wrap = el('label', 'dojo__check');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = Boolean(prefs[key]);
    box.addEventListener('change', function () {
      prefs[key] = box.checked;
      savePrefs();
      apply(box.checked);
      focusInput();
    });
    wrap.appendChild(box);
    wrap.appendChild(document.createTextNode(label));
    apply(box.checked);
    return wrap;
  }

  function focusInput() {
    if (!running) return;
    try { ui.input.focus({ preventScroll: true }); } catch (e) { ui.input.focus(); }
  }

  /* ----------------------------------------------------------- rendering */
  function renderText() {
    ui.scroll.innerHTML = '';
    chars = [];
    var words = target.split(' ');
    words.forEach(function (word, index) {
      var holder = el('span', 'dojo__word');
      var piece = word + (index < words.length - 1 ? ' ' : '');
      for (var i = 0; i < piece.length; i++) {
        var span = el('span', 'dojo__ch', piece.charAt(i));
        holder.appendChild(span);
        chars.push(span);
      }
      ui.scroll.appendChild(holder);
    });
  }

  function highlight() {
    Object.keys(keys).forEach(function (ch) { keys[ch].el.classList.remove('is-next'); });
    Object.keys(special).forEach(function (id) { special[id].classList.remove('is-next'); });
    Object.keys(ui.fingers).forEach(function (f) { ui.fingers[f].classList.remove('is-next'); });
    chars.forEach(function (span) { span.classList.remove('is-current'); });

    if (pos >= target.length) return;
    var span = chars[pos];
    span.classList.add('is-current');

    // Keep the active line in the middle of the window.
    var line = parseFloat(window.getComputedStyle(ui.text).lineHeight) || 34;
    ui.scroll.style.transform = 'translateY(' + (-Math.max(0, span.offsetTop - line)) + 'px)';

    var ch = target.charAt(pos);
    var key = keys[ch];
    if (!key) {
      ui.hint.textContent = '';
      return;
    }
    key.el.classList.add('is-next');
    if (ui.fingers[key.finger]) ui.fingers[key.finger].classList.add('is-next');

    var name = ch === ' ' ? 'Space' : '“' + ch + '”';
    var text = name + ' — ' + FINGER_NAMES[key.finger] + ' finger';
    if (key.shift) {
      var side = key.finger <= 3 ? 'rshift' : 'lshift';
      if (special[side]) special[side].classList.add('is-next');
      text += ' + Shift with the ' + (key.finger <= 3 ? 'right' : 'left') + ' little finger';
    }
    ui.hint.textContent = text;
  }

  function stats() {
    var seconds = startedAt ? (Date.now() - startedAt) / 1000 : 0;
    var right = 0;
    for (var i = 0; i < pos; i++) {
      if (chars[i].classList.contains('is-right')) right++;
    }
    return {
      seconds: seconds,
      wpm: seconds > 1 ? Math.round((right / 5) / (seconds / 60)) : 0,
      accuracy: typed ? Math.round((typed - misses) / typed * 100) : 100
    };
  }

  function paintStats() {
    var s = stats();
    ui.wpm.textContent = String(s.wpm);
    ui.acc.textContent = s.accuracy + '%';
    ui.left.textContent = Math.round(pos / target.length * 100) + '%';
    return s;
  }

  /* --------------------------------------------------------------- input */
  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Backspace') {
      event.preventDefault();
      back();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      showMenu();
      return;
    }
    if (event.key.length !== 1) return;
    event.preventDefault();
    press(event.key);
  }

  /* Soft keyboards on phones do not report a usable key in keydown, so read
     what actually landed in the field and then empty it again. */
  function onSoftInput() {
    var value = ui.input.value;
    ui.input.value = '';
    if (!value) { back(); return; }
    for (var i = 0; i < value.length; i++) press(value.charAt(i));
  }

  function press(ch) {
    if (!running || pos >= target.length) return;
    if (!startedAt) {
      startedAt = Date.now();
      ticker = setInterval(paintStats, 250);
      if (window.Scores) {
        window.Scores.startRun(SLUG).then(function (t) { token = t; });
      }
    }

    var want = target.charAt(pos);
    typed++;

    if (ch === want) {
      chars[pos].className = 'dojo__ch is-right';
      pos++;
    } else {
      misses++;
      missByChar[want] = (missByChar[want] || 0) + 1;
      var key = keys[ch];
      if (key) {
        key.el.classList.add('is-wrong');
        setTimeout(function () { key.el.classList.remove('is-wrong'); }, 140);
      }
      if (!prefs.strict) {
        chars[pos].className = 'dojo__ch is-wrong';
        pos++;
      }
    }

    if (pos >= target.length) { finish(); return; }
    highlight();
    paintStats();
  }

  function back() {
    if (!running || pos === 0) return;
    pos--;
    chars[pos].className = 'dojo__ch';
    highlight();
  }

  /* --------------------------------------------------------------- rounds */
  function start(d) {
    drill = d;
    target = buildText(d);
    pos = 0;
    typed = 0;
    misses = 0;
    missByChar = {};
    startedAt = null;
    token = null;
    running = true;
    clearInterval(ticker);
    ticker = null;
    ui.overlay.innerHTML = '';
    ui.overlay.classList.add('hidden');
    ui.input.value = '';
    renderText();
    ui.scroll.style.transform = 'translateY(0)';
    paintStats();
    highlight();
    focusInput();
  }

  function finish() {
    running = false;
    clearInterval(ticker);
    ticker = null;
    var s = paintStats();
    highlight();

    ui.overlay.innerHTML = '';
    ui.overlay.classList.remove('hidden');
    ui.overlay.classList.remove('stage__overlay--list');
    ui.overlay.appendChild(el('h3', null, 'Run complete'));
    ui.overlay.appendChild(el('p', 'big', String(s.wpm)));
    ui.overlay.appendChild(el('p', null, 'words per minute at ' + s.accuracy + '% accuracy'));

    var worst = Object.keys(missByChar).sort(function (a, b) {
      return missByChar[b] - missByChar[a];
    }).slice(0, 5);
    if (worst.length) {
      var line = el('p', 'dojo__worst');
      line.appendChild(document.createTextNode('Drill these: '));
      worst.forEach(function (ch) {
        line.appendChild(el('code', null, (ch === ' ' ? 'space' : ch) + ' ×' + missByChar[ch]));
      });
      ui.overlay.appendChild(line);
    }

    // Accuracy below 90% means the speed was borrowed, not earned.
    if (s.accuracy < 90) {
      ui.overlay.appendChild(el('p', 'dojo__note',
        'Under 90% accurate. Slow down until the mistakes stop; the speed follows on its own.'));
    }

    if (window.Scores && (token || !window.Scores.configured)) {
      ui.overlay.appendChild(window.Scores.submitForm({
        game: SLUG, token: token, score: s.wpm
      }));
    } else if (window.Scores) {
      // No token means the run never registered, so offering the form would
      // only hand out an error after the typing is already done.
      ui.overlay.appendChild(el('p', 'scoreboard__empty',
        'This run could not be registered with the scoreboard, so it stays on your own screen.'));
    }

    var again = el('button', 'btn btn--small', 'Same drill again');
    again.type = 'button';
    again.addEventListener('click', function () { start(drill); });
    ui.overlay.appendChild(again);

    var other = el('button', 'btn btn--small btn--ghost', 'Pick another drill');
    other.type = 'button';
    other.addEventListener('click', showMenu);
    ui.overlay.appendChild(other);
  }

  function showMenu() {
    running = false;
    clearInterval(ticker);
    ticker = null;
    startedAt = null;
    ui.overlay.innerHTML = '';
    ui.overlay.classList.remove('hidden');
    // Ten drills are taller than the stage, and centred content clips its own
    // top when it overflows.
    ui.overlay.classList.add('stage__overlay--list');
    ui.overlay.appendChild(el('h3', null, 'Pick a drill'));

    var list = el('div', 'difficulties');
    availableDrills().forEach(function (d) {
      var button = el('button', 'difficulty');
      button.type = 'button';
      var left = el('span');
      left.appendChild(document.createTextNode(d.name));
      left.appendChild(document.createElement('br'));
      left.appendChild(el('small', null, d.blurb));
      button.appendChild(left);
      // The badge is not decoration: the shared .difficulty style dresses the
      // last child as one, and without it the drill's name is what gets dressed.
      button.appendChild(el('span', null, d.badge));
      button.addEventListener('click', function () { start(d); });
      list.appendChild(button);
    });
    ui.overlay.appendChild(list);
    ui.overlay.appendChild(el('p', 'dojo__note',
      'Eyes on the screen, not on your hands. The red key is the next one.'));
  }

  buildStage();
  showMenu();
})();
