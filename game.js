// WINDMILL — game UI.
//
// The wake rule lives in wake.js (loaded first). This file draws the board and
// compass, runs the turns, keeps the record, and plays the replay.
// SVG elements are positioned with SVG transform attributes only, never with
// CSS transforms (a lesson from Dandelions).

const SVG_NS = 'http://www.w3.org/2000/svg';

// Private tap-to-pick mode: index.html?wind=pick lets a person tap the
// direction on the compass instead of the random draw. Nothing on screen
// mentions it.
const PARAMS = new URLSearchParams(location.search);
const PICK_MODE = PARAMS.get('wind') === 'pick';
// Private: knight's-move L lines in the replay, for the video. No mention on screen.
const KNIGHT_LINES = PARAMS.get('lines') === 'knight';

const GUST_DELAY_MS   = 500;    // pause between placing a turbine and the gust
const REPLAY_FRAME_MS = 1200;   // each replay frame (a gust, or one L within it)
const PLAY_ALL_MS     = 1500;   // Play mode: each wind, when "Play all" runs
const CELL = 100;               // board units per cell
const BOARD_N = 9;

const COLOR = {
  now:   '#f5e642',
  pale:  '#c5d9e8',
  used:  '#1f3c51',
  added: '#94a0f0',
};

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function $(id) { return document.getElementById(id); }

// Centre of cell (x, y) in board units; y grows north, SVG y grows down.
function centre(t) { return [t.x * CELL + CELL / 2, (BOARD_N - 1 - t.y) * CELL + CELL / 2]; }

function coord(t) { return `(${t.x},${t.y})`; }

function hitText(n) {
  if (n === 0) return 'No turbines hit.';
  return n === 1 ? '1 turbine hit.' : `${n} turbines hit.`;
}

// ── State ────────────────────────────────────────────────────────────────────

let setting = 8;          // 8 or 16 directions
let turbines;             // [{x, y, rot}] in placement order
let usedDirs;             // directions already blown, in order
let record;               // [{dir, hit: [{x, y}]}]
let current;              // the gust on show: {dir, hits: [index]} or null
let gameOver, inputLocked, awaitingPick, gustTimer;
let replay = null;        // replay state while the replay is open
let mode = 'play';        // 'play' or 'learn'
let play = null;          // Play mode state: {phase, dirs, index, lost, playing, timer, review}

function initState() {
  clearTimeout(gustTimer);
  turbines = [];
  usedDirs = [];
  record = [];
  current = null;
  gameOver = false;
  inputLocked = false;
  awaitingPick = false;
  if (play) clearTimeout(play.timer);
  play = { phase: 'place', dirs: playOrder(), index: -1, lost: new Set(),
           playing: false, timer: null, review: null };
}

// ── Build the board ──────────────────────────────────────────────────────────

function buildGrid() {
  const svg = $('grid');
  svg.innerHTML = '';

  const defs = svgEl('defs');
  const clip = svgEl('clipPath', { id: 'board-clip' });
  clip.appendChild(svgEl('rect', { x: 0, y: 0, width: BOARD_N * CELL, height: BOARD_N * CELL }));
  defs.appendChild(clip);
  const marker = svgEl('marker', {
    id: 'l-arrow', viewBox: '0 0 10 10', refX: 6, refY: 5,
    markerWidth: 3.2, markerHeight: 3.2, orient: 'auto-start-reverse',
  });
  marker.appendChild(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'l-arrow' }));
  defs.appendChild(marker);
  svg.appendChild(defs);

  svg.appendChild(svgEl('rect', { x: -12, y: -12, width: 924, height: 924, rx: 18, class: 'board-bg' }));

  const cells = svgEl('g', { id: 'cells' });
  for (let y = BOARD_N - 1; y >= 0; y--) {
    for (let x = 0; x < BOARD_N; x++) {
      const g = svgEl('g', {
        id: `cell-${x}-${y}`, class: 'cell empty', role: 'button', tabindex: '0',
        'aria-label': `Square ${x}, ${y}`,
      });
      g.appendChild(svgEl('rect', {
        x: x * CELL + 5, y: (BOARD_N - 1 - y) * CELL + 5, width: 90, height: 90, rx: 10,
      }));
      g.addEventListener('click', () => handleCellClick(x, y));
      g.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCellClick(x, y); }
      });
      cells.appendChild(g);
    }
  }
  svg.appendChild(cells);

  svg.appendChild(svgEl('g', { id: 'wakes', 'clip-path': 'url(#board-clip)' }));
  svg.appendChild(svgEl('g', { id: 'hit-borders' }));
  svg.appendChild(svgEl('g', { id: 'l-lines' }));
  svg.appendChild(svgEl('g', { id: 'turbines' }));

  const axes = svgEl('g', { id: 'axes', 'aria-hidden': 'true' });
  for (let i = 0; i < BOARD_N; i++) {
    const xl = svgEl('text', { x: i * CELL + CELL / 2, y: 936, class: 'axis-label' });
    xl.textContent = i;
    const yl = svgEl('text', { x: -32, y: (BOARD_N - 1 - i) * CELL + CELL / 2, class: 'axis-label' });
    yl.textContent = i;
    axes.appendChild(xl);
    axes.appendChild(yl);
  }
  svg.appendChild(axes);
}

// lost: the turbine has been hit at least once, so it has lost output (vermilion).
function turbineSymbol(t, fresh, lost) {
  const [cx, cy] = centre(t);
  const g = svgEl('g', {
    class: 'turbine-symbol' + (lost ? ' lost' : '') + (fresh ? ' fade-in' : ''),
    transform: `translate(${cx}, ${cy})`, 'data-x': t.x, 'data-y': t.y,
  });
  g.appendChild(svgEl('path', { class: 'turbine-tower', d: 'M -1.6 4 L -3.4 36 L 3.4 36 L 1.6 4 Z' }));
  const rotor = svgEl('g', { transform: `rotate(${t.rot})` });
  const blade = 'M -1.8 -4 C -5.8 -10 -5.2 -19 -1.6 -26 Q 0 -28.4 1.6 -26.6 C 3.2 -19 3.2 -10 1.8 -4 Z';
  for (const a of [0, 120, 240]) {
    rotor.appendChild(svgEl('path', { class: 'turbine-blade', d: blade, transform: `rotate(${a})` }));
  }
  g.appendChild(rotor);
  g.appendChild(svgEl('circle', { class: 'turbine-hub', r: 4.6 }));
  return g;
}

// L from the upwind turbine to the hit turbine: along A's row, then the
// column, starting and ending at the cell edges, with an arrowhead.
function lPoints(a, b) {
  const A = centre(a), B = centre(b), K = [B[0], A[1]];
  const E = 46;
  const toward = (p, q, d) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], n = Math.hypot(dx, dy);
    return n ? [p[0] + dx / n * d, p[1] + dy / n * d] : p;
  };
  const pts = (a.x === b.x || a.y === b.y)
    ? [toward(A, B, E), toward(B, A, E)]
    : [toward(A, K, E), K, toward(B, K, E)];
  return pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

// Draw the board.
// view: {gust, hits, pair, lost, freshGust, freshTurbine, freshLine}
//   hits: turbines in the current gust's wakes (red border, "Hit now")
//   lost: Set of turbine indices that have lost output so far (vermilion)
function drawBoard(view = {}) {
  const occupied = new Map(turbines.map((t, i) => [`${t.x}-${t.y}`, i]));
  const lost = view.lost || new Set();
  for (let y = 0; y < BOARD_N; y++) {
    for (let x = 0; x < BOARD_N; x++) {
      const g = $(`cell-${x}-${y}`);
      const i = occupied.get(`${x}-${y}`);
      const has = i !== undefined;
      g.setAttribute('class', 'cell ' + (has ? 'turbine' : 'empty'));
      g.setAttribute('aria-label', `Square ${x}, ${y}` +
        (has ? (lost.has(i) ? ': turbine, lost output' : ': turbine') : ''));
    }
  }

  const wakes = $('wakes');
  wakes.innerHTML = '';
  // view.wakeList: [{t, dir}] draws only those wakes (Play review);
  // otherwise view.gust draws every turbine's wake for that wind.
  const wakeList = view.wakeList || (view.gust ? turbines.map(t => ({ t, dir: view.gust })) : []);
  for (const { t, dir } of wakeList) {
    const [ux, uy] = downwindVector(dir);
    const angle = Math.atan2(-uy, ux) * 180 / Math.PI;   // SVG y points down
    const [cx, cy] = centre(t);
    wakes.appendChild(svgEl('rect', {
      class: 'wake' + (view.freshGust ? ' fade-in' : ''),
      x: 0, y: -WAKE_HALF_WIDTH * CELL, width: WAKE_LENGTH * CELL, height: 2 * WAKE_HALF_WIDTH * CELL,
      transform: `translate(${cx}, ${cy}) rotate(${angle.toFixed(3)})`,
    }));
  }

  const borders = $('hit-borders');
  borders.innerHTML = '';
  for (const i of view.hits || []) {
    const t = turbines[i];
    borders.appendChild(svgEl('rect', {
      class: 'hit-border' + (view.freshGust ? ' fade-in' : ''),
      x: t.x * CELL + 5, y: (BOARD_N - 1 - t.y) * CELL + 5, width: 90, height: 90, rx: 10,
    }));
  }
  if (view.selected !== undefined) {
    const t = turbines[view.selected];
    borders.appendChild(svgEl('rect', {
      class: 'select-border',
      x: t.x * CELL + 3, y: (BOARD_N - 1 - t.y) * CELL + 3, width: 94, height: 94, rx: 12,
    }));
  }

  const lines = $('l-lines');
  lines.innerHTML = '';
  if (view.pair) {
    lines.appendChild(svgEl('polyline', {
      class: 'l-line' + (view.freshLine ? ' fade-in' : ''),
      points: lPoints(turbines[view.pair.from], turbines[view.pair.to]),
      'marker-end': 'url(#l-arrow)',
    }));
  }

  const layer = $('turbines');
  layer.innerHTML = '';
  turbines.forEach((t, i) => layer.appendChild(turbineSymbol(t, i === view.freshTurbine, lost.has(i))));

  $('grid').classList.toggle('placing', canPlace());
}

// ── Build the compass ────────────────────────────────────────────────────────

function buildCompass(n) {
  const svg = $('compass');
  svg.innerHTML = '';
  svg.setAttribute('class', n === 8 ? 'n8' : n === 16 ? 'n16' : 'n16 n32');
  svg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 100, class: 'compass-ring' }));
  svg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 4.5, class: 'compass-center' }));
  // 32 directions: the 16 between the named ones are unlabelled ticks on the ring
  if (n === 32) {
    for (const dir of DIRECTIONS_32.filter(d => !DIRECTIONS_16.includes(d))) {
      const b = bearingOf(dir) * Math.PI / 180;
      const g = svgEl('g', { id: `dir-${dir}`, class: 'dir-group' });
      g.appendChild(svgEl('line', {
        x1: (88 * Math.sin(b)).toFixed(2), y1: (-88 * Math.cos(b)).toFixed(2),
        x2: (100 * Math.sin(b)).toFixed(2), y2: (-100 * Math.cos(b)).toFixed(2), class: 'dir-tick',
      }));
      svg.appendChild(g);
    }
  }
  for (const dir of directionsFor(n === 32 ? 16 : n)) {
    const b = bearingOf(dir) * Math.PI / 180;
    const x = 82 * Math.sin(b), y = -82 * Math.cos(b);
    const g = svgEl('g', { id: `dir-${dir}`, class: 'dir-group' });
    g.appendChild(svgEl('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: n === 16 ? 13 : 17, class: 'dir-hit' }));
    const text = svgEl('text', { x: x.toFixed(2), y: y.toFixed(2), class: 'dir-text' + (dir.length === 3 ? ' three' : '') });
    text.textContent = dir;
    g.appendChild(text);
    g.addEventListener('click', () => handleCompassClick(dir));
    svg.appendChild(g);
  }
}

// state(dir) returns {active, used, added, tappable}
function paintCompass(state) {
  for (const g of $('compass').querySelectorAll('.dir-group')) {
    const dir = g.id.slice(4);
    const s = state(dir);
    const mark = g.querySelector('text') || g.querySelector('line');
    mark.setAttribute('class', [mark.tagName === 'line' ? 'dir-tick' : 'dir-text', dir.length === 3 ? 'three' : '',
      s.added ? 'added' : '', s.used ? 'used' : '', s.active ? 'active' : ''].filter(Boolean).join(' '));
    g.setAttribute('class', 'dir-group' + (s.tappable ? ' tappable' : ''));
  }
}

function paintGameCompass() {
  paintCompass(dir => {
    const active = !!current && current.dir === dir;
    const used = !active && usedDirs.includes(dir);
    return { active, used, added: false, tappable: PICK_MODE && awaitingPick && !usedDirs.includes(dir) };
  });
}

function renderLegend(items) {
  const el = $('legend');
  el.innerHTML = '';
  for (const [color, label] of items) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = color;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(label));
    el.appendChild(item);
  }
}

// ── Game rendering ───────────────────────────────────────────────────────────

function canPlace() {
  if (mode === 'play') return play.phase === 'place' && turbines.length < playTurbines();
  return !replay && !gameOver && !inputLocked && !awaitingPick && turbines.length < setting;
}

function setStatus(msg) { $('status').textContent = msg; }
// The header under the title always takes two lines, in the game and in the
// replay, so the board never moves: where you are, then the wind. An empty
// second line keeps its height (no-break space).
function setTurnLine(first, second) {
  const el = $('turn-line');
  el.innerHTML = '';
  for (const part of [first, second || '\u00a0']) {
    const line = document.createElement('span');
    line.className = 'line';
    line.textContent = part;
    el.appendChild(line);
  }
}

function turnLine() {
  const n = Math.max(turbines.length, 1);
  return [`Turn ${n} of ${setting}`, current ? `Wind blows ${current.dir}` : ''];
}

function renderRecord() {
  const ol = $('record');
  ol.innerHTML = '';
  for (const r of record) {
    const li = document.createElement('li');
    const d = document.createElement('span');
    d.className = 'rec-dir';
    d.textContent = r.dir;
    li.appendChild(d);
    if (r.hit.length) {
      li.appendChild(document.createTextNode(' — hit: ' + r.hit.map(coord).join(', ')));
    } else {
      li.appendChild(document.createTextNode(' — '));
      const none = document.createElement('span');
      none.className = 'rec-none';
      none.textContent = 'none';
      li.appendChild(none);
    }
    ol.appendChild(li);
  }
}

function updateRuleText() {
  const text = `In this game, the wind blows only in the ${setting} directions on the compass.`;
  $('rule-line').textContent = text;
  $('htp-rule').textContent = text;
  $('compass-caption').textContent = `${setting} directions`;
}

function updateButtons() {
  const btn = $('replay-btn');
  btn.hidden = mode !== 'learn' || setting !== 8;
  btn.disabled = !(setting === 8 && turbines.length >= 2 && !inputLocked && !awaitingPick);
  document.querySelectorAll('.set-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.setting) === setting);
    b.disabled = !!replay;
  });
}

// Turbines hit at least once in this game have lost output: the wake passes,
// the loss stays.
function lostInGame() {
  return new Set(turbines.map((t, i) => (t.lost ? i : -1)).filter(i => i >= 0));
}

function renderGame(view = {}) {
  drawBoard(Object.assign({
    gust: current && current.dir, hits: current ? current.hits : [], lost: lostInGame(),
  }, view));
  paintGameCompass();
  renderLegend([[COLOR.now, 'Wind now'], [COLOR.pale, 'Still to come'], [COLOR.used, 'Used']]);
  renderRecord();
  setTurnLine(...turnLine());
  $('reset-btn').textContent = 'Reset';
  updateButtons();
}

// ── Turns ────────────────────────────────────────────────────────────────────

function handleCellClick(x, y) {
  if (replay) return;
  if (mode === 'play') { playCellClick(x, y); return; }
  if (!canPlace()) return;
  if (turbines.some(t => t.x === x && t.y === y)) return;

  turbines.push({ x, y, rot: Math.round(Math.random() * 80 - 40) });
  current = null;                     // the previous gust clears

  if (PICK_MODE) {
    awaitingPick = true;
    renderGame({ freshTurbine: turbines.length - 1 });
    setStatus('Pick a wind direction on the compass');
  } else {
    inputLocked = true;
    renderGame({ freshTurbine: turbines.length - 1 });
    setStatus('The wind is blowing…');
    gustTimer = setTimeout(() => {
      const unused = directionsFor(setting).filter(d => !usedDirs.includes(d));
      blow(unused[Math.floor(Math.random() * unused.length)]);
    }, GUST_DELAY_MS);
  }
}

function handleCompassClick(dir) {
  if (replay) return;
  if (mode === 'play') { playCompassClick(dir); return; }
  if (replay || !PICK_MODE || !awaitingPick || usedDirs.includes(dir)) return;
  blow(dir);
}

function blow(dir) {
  usedDirs.push(dir);
  const hits = hitsForGust(turbines, dir);
  hits.forEach(i => { turbines[i].lost = true; });
  current = { dir, hits };
  record.push({
    dir,
    hit: hits.map(i => turbines[i]).slice().sort((p, q) => p.x - q.x || p.y - q.y),
  });
  inputLocked = false;
  awaitingPick = false;
  gameOver = usedDirs.length === setting;

  renderGame({ freshGust: true });
  setStatus(hitText(hits.length) + (gameOver
    ? ` All ${setting} directions have blown.`
    : ' Tap a square for the next turbine.'));
}

function resetGame() {
  if (replay) closeReplay();
  initState();
  buildCompass(setting);
  updateRuleText();
  applyMode();
  if (mode === 'play') { renderPlay(); return; }
  renderGame();
  setStatus('Tap a square to place a turbine');
}

function chooseMode(m) {
  if (m === mode) return;
  mode = m;
  resetGame();
}

// Show the controls of the current mode; hide the other's.
function applyMode() {
  document.querySelectorAll('.mode-tab').forEach(b => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  const learn = mode === 'learn';
  $('game-buttons').hidden = false;
  $('replay-btn').hidden = !learn || setting !== 8;
  $('record').hidden = false;
  $('play-controls').hidden = learn;
}

function chooseSetting(n) {
  if (replay || n === setting) return;
  setting = n;
  resetGame();
}

// ── Play mode ────────────────────────────────────────────────────────────────
// Place all 8 turbines, then the winds of the setting blow over the finished
// layout, one at a time, at the player's pace. The verdict counts turbines hit
// by at least one wind. At the end the player can review: tap a direction to
// see that wind again, tap a turbine to see which winds hit it.
// Wording here is provisional, pending Matteo's approval.

// The order the winds blow in Play. It never changes the verdict, only what the
// player sees on the way. With 16 winds each game picks one of two orders at
// random: round the compass from N, or the 8 main directions first and then
// the 8 added ones (an 8-wind layout survives the first half, then breaks).
function playOrder() {
  if (setting === 8 || Math.random() < 0.5) return directionsFor(setting);
  return [...DIRECTIONS_8, ...DIRECTIONS_16.filter(d => !DIRECTIONS_8.includes(d))];
}

// Turbines to place in Play: 8 with 8 winds, 6 with 16. On 9×9 both counts
// can come through with no turbine hit, in many different layouts (with 16
// winds, 137 shapes of 6; 7 would leave a single shape, 8 cannot be clean).
// Finer wind, fewer turbines on the same site: the drop is left for players
// to notice.
function playTurbines() { return setting === 8 ? 8 : 6; }
function playAcceptable() { return 0; }
function playBest() { return 0; }

function playCellClick(x, y) {
  const i = turbines.findIndex(t => t.x === x && t.y === y);
  if (play.phase === 'place') {
    if (i >= 0) turbines.splice(i, 1);                       // tap a turbine to remove it
    else if (turbines.length < playTurbines()) turbines.push({ x, y, rot: Math.round(Math.random() * 80 - 40) });
    else return;
    renderPlay(i >= 0 ? {} : { freshTurbine: turbines.length - 1 });
  } else if (play.phase === 'done') {
    play.review = i >= 0 && !(play.review && play.review.turbine === i) ? { turbine: i } : null;
    renderPlay();
  }
}

function playCompassClick(dir) {
  if (play.phase !== 'done') return;
  play.review = play.review && play.review.dir === dir ? null : { dir };
  renderPlay({ freshGust: !!play.review });
}

function startWind() {
  if (play.phase !== 'place' || turbines.length < playTurbines()) return;
  play.phase = 'reveal';
  record = [];
  nextWind();
}

function nextWind() {
  if (play.phase !== 'reveal') return;
  play.index++;
  if (play.index >= play.dirs.length) { finishPlay(); return; }
  const dir = play.dirs[play.index];
  const hits = hitsForGust(turbines, dir);
  hits.forEach(i => play.lost.add(i));
  record.push({ dir, hit: hits.map(i => turbines[i]).slice().sort((p, q) => p.x - q.x || p.y - q.y) });
  renderPlay({ freshGust: true });
}

function finishPlay() {
  play.phase = 'done';
  play.playing = false;
  clearTimeout(play.timer);
  renderPlay();
}

function togglePlayAll() {
  if (play.phase !== 'reveal') return;
  play.playing = !play.playing;
  const tick = () => {
    if (!play.playing || play.phase !== 'reveal') return;
    nextWind();
    if (play.phase === 'reveal') play.timer = setTimeout(tick, PLAY_ALL_MS);
  };
  clearTimeout(play.timer);
  if (play.playing) tick();
  else renderPlay();
}

function renderPlay(view = {}) {
  const n = turbines.length;
  const dirs = play.dirs;
  let board = { lost: play.lost, freshTurbine: view.freshTurbine };
  let line1, line2, status;
  const k = play.index;

  if (play.phase === 'place') {
    const T = playTurbines();
    line1 = `Place ${T} turbines`;
    line2 = `Then ${setting} winds blow`;
    status = n === 0 ? 'Tap a square to place a turbine.'
      : n < T ? `${n} of ${T} placed. Tap a turbine to remove it.`
      : `All ${T} placed. Tap a turbine to move it, or let the wind blow.`;
  } else if (play.phase === 'reveal') {
    const dir = dirs[k];
    const hits = record[k].hit.map(h => turbines.indexOf(h));
    board = Object.assign(board, { gust: dir, hits, freshGust: view.freshGust });
    line1 = `Wind ${k + 1} of ${dirs.length}`;
    line2 = `Wind blows ${dir}`;
    status = hitText(hits.length);
  } else {
    const lostN = play.lost.size, ok = lostN <= playAcceptable(), best = lostN <= playBest();
    line1 = `Lost output: ${lostN} of ${n} turbines`;
    line2 = 'Acceptable: none';
    status = (best ? 'The best possible result. ' : ok ? 'Within the acceptable loss. ' : 'More than the acceptable loss. ') +
             'Tap a direction or a turbine to look again.';
    const r = play.review;
    if (r && r.dir) {
      const hits = hitsForGust(turbines, r.dir);
      board = Object.assign(board, { gust: r.dir, hits, freshGust: view.freshGust });
      status = `Wind blows ${r.dir}: ${hitText(hits.length).toLowerCase()}`;
    } else if (r && r.turbine !== undefined) {
      const by = dirs.filter(d => hitsForGust(turbines, d).includes(r.turbine));
      const wl = [];
      for (const d of by) for (const p of hitPairs(turbines, d)) if (p.to === r.turbine) wl.push({ t: turbines[p.from], dir: d });
      board = Object.assign(board, { wakeList: wl, selected: r.turbine });
      status = by.length ? `${coord(turbines[r.turbine])} was hit by ${by.join(', ')}.` : `${coord(turbines[r.turbine])} was never hit.`;
    }
  }

  drawBoard(board);
  const reviewDirs = play.review && play.review.turbine !== undefined
    ? dirs.filter(d => hitsForGust(turbines, d).includes(play.review.turbine)) : [];
  // Main winds first: the added directions show periwinkle, as in the replay
  const mainFirst = dirs.length === 16 && dirs[1] === 'NE';
  paintCompass(dir => {
    if (play.phase === 'place') return { active: false, used: false, added: false, tappable: false };
    if (play.phase === 'reveal') {
      const j = dirs.indexOf(dir);
      return { active: j === k, used: j < k, added: mainFirst && !DIRECTIONS_8.includes(dir), tappable: false };
    }
    const active = (play.review && play.review.dir === dir) || reviewDirs.includes(dir);
    return { active, used: false, added: false, tappable: true };
  });
  renderLegend(play.phase === 'done'
    ? [[COLOR.now, 'Shown now'], [COLOR.pale, 'Tap to look again']]
    : play.phase === 'reveal' && mainFirst
    ? [[COLOR.now, 'Wind now'], [COLOR.pale, '8 directions'], [COLOR.added, 'Added in 16 directions'], [COLOR.used, 'Used']]
    : [[COLOR.now, 'Wind now'], [COLOR.pale, 'Still to come'], [COLOR.used, 'Used']]);
  renderRecord();
  setTurnLine(line1, line2);
  setStatus(status);

  $('start-btn').hidden = play.phase !== 'place';
  $('start-btn').disabled = n < playTurbines();
  $('next-btn').hidden = play.phase !== 'reveal';
  $('all-btn').hidden = play.phase !== 'reveal';
  $('all-btn').textContent = play.playing ? 'Pause' : 'Play all';
  $('next-btn').disabled = play.playing;
  $('replay32-btn').hidden = !(play.phase === 'done' && setting === 16);
  $('reset-btn').textContent = play.phase === 'done' ? 'New game' : 'Reset';
  updateButtons();
}

// ── Replays: Learn 8 → 16 directions, Play 16 → 32 directions ────────────────
// The same static replay one step finer: every direction of the finer set
// blows once, clockwise from N, over the turbines on the board.

function openReplay() {
  if (replay) return;
  const fine = mode === 'play';
  if (fine && !(play.phase === 'done' && setting === 16)) return;
  if (!fine && (setting !== 8 || turbines.length < 2 || inputLocked || awaitingPick)) return;
  const base = fine ? DIRECTIONS_16 : DIRECTIONS_8;
  const all  = fine ? DIRECTIONS_32 : DIRECTIONS_16;

  // The replay is its own experiment: every turbine starts with no lost
  // output and turns vermilion the first time a replay gust hits it.
  const frames = [];
  const lostSoFar = new Set();
  for (const dir of all) {
    const hits = hitsForGust(turbines, dir);
    hits.forEach(i => lostSoFar.add(i));
    const lost = new Set(lostSoFar);
    const pairs = KNIGHT_LINES && !fine ? knightHitPairs(turbines, dir) : [];
    if (pairs.length === 0) frames.push({ dir, hits, lost, pair: null });
    else pairs.forEach(pair => frames.push({ dir, hits, lost, pair }));
  }
  frames.push({ final: true });

  replay = {
    frames,
    index: -1,
    playing: true,
    timer: null,
    saved: { status: $('status').textContent },
    base, all,
    title: `Replay with ${all.length} directions`,
    hitBase: hitByAny(turbines, base).length,
    hitAll: hitByAny(turbines, all),
  };

  ['compass-caption', 'rule-line', 'record', 'game-buttons', 'play-controls'].forEach(id => { $(id).hidden = true; });
  $('replay-controls').hidden = false;
  $('pause-btn').hidden = false;
  $('step-btn').hidden = false;
  setPauseLabel();
  buildCompass(all.length);
  renderLegend([[COLOR.now, 'Wind now'], [COLOR.pale, `${base.length} directions`],
                [COLOR.added, `Added in ${all.length} directions`], [COLOR.used, 'Used']]);
  updateButtons();
  showFrame(0);
  scheduleReplay();
}

function showFrame(i) {
  const prev = replay.frames[replay.index];
  replay.index = i;
  const f = replay.frames[i];
  const n = turbines.length;

  if (f.final) {
    replay.playing = false;
    clearTimeout(replay.timer);
    // No gust now, so no borders: only the colour of lost output.
    const { base, all } = replay;
    drawBoard({ lost: new Set(replay.hitAll) });
    // The compass becomes a key for the two counts: the base directions pale,
    // the added ones periwinkle, none gold (no gust is blowing).
    paintCompass(dir => ({ active: false, used: false, added: !base.includes(dir), tappable: false }));
    renderLegend([[COLOR.pale, `${base.length} directions`], [COLOR.added, `Added in ${all.length} directions`]]);
    setTurnLine(replay.title, '');
    setStatus(all.length === 32 ? 'Finer wind finds gaps between the 16 directions.' : '');
    setSummary('summary-8',  `Hit by at least one of the ${base.length} directions:`, `${replay.hitBase} of ${n} turbines`);
    setSummary('summary-16', `Hit by at least one of the ${all.length} directions:`, `${replay.hitAll.length} of ${n} turbines`);
    $('replay-summary').hidden = false;
    $('pause-btn').hidden = true;
    $('step-btn').hidden = true;
    return;
  }

  const newGust = !prev || prev.dir !== f.dir;
  drawBoard({ gust: f.dir, hits: f.hits, lost: f.lost, pair: f.pair, freshGust: newGust, freshLine: true });
  const { base, all } = replay;
  const k = all.indexOf(f.dir);
  paintCompass(dir => {
    const added = !base.includes(dir);
    const active = dir === f.dir;
    return { active, used: !active && all.indexOf(dir) < k, added, tappable: false };
  });
  // The 16 unlabelled directions of 32 are named by their neighbours
  const wind = DIRECTIONS_16.includes(f.dir) ? `Wind blows ${f.dir}`
    : `Between ${all[k - 1]} and ${all[(k + 1) % all.length]}`;
  setTurnLine(replay.title, `${wind} · ${k + 1} of ${all.length}`);
  setStatus(hitText(f.hits.length));
}

// "Hit by at least one of the 8 directions: X of N turbines", with the count
// on its own line so it reads well in the narrow side column.
function setSummary(id, label, count) {
  const p = $(id);
  p.innerHTML = '';
  p.appendChild(document.createTextNode(label + ' '));
  const strong = document.createElement('strong');
  strong.textContent = count;
  p.appendChild(strong);
}

function scheduleReplay() {
  clearTimeout(replay.timer);
  if (!replay.playing) return;
  replay.timer = setTimeout(() => {
    if (!replay || !replay.playing) return;
    showFrame(replay.index + 1);
    scheduleReplay();
  }, REPLAY_FRAME_MS);
}

function setPauseLabel() {
  const b = $('pause-btn');
  b.textContent = replay.playing ? 'Pause' : 'Play';
  b.classList.toggle('primary', replay.playing);
}

function togglePause() {
  if (!replay) return;
  replay.playing = !replay.playing;
  setPauseLabel();
  scheduleReplay();
}

function stepReplay() {
  if (!replay) return;
  replay.playing = false;
  clearTimeout(replay.timer);
  setPauseLabel();
  if (!replay.frames[replay.index].final) showFrame(replay.index + 1);
}

function closeReplay() {
  if (!replay) return;
  clearTimeout(replay.timer);
  const saved = replay.saved;
  replay = null;
  ['replay-controls', 'replay-summary'].forEach(id => { $(id).hidden = true; });
  ['compass-caption', 'rule-line', 'record', 'game-buttons'].forEach(id => { $(id).hidden = false; });
  buildCompass(setting);
  if (mode === 'play') { $('play-controls').hidden = false; renderPlay(); return; }
  renderGame();
  setTurnLine(...turnLine());
  setStatus(saved.status);
}

// ── Initialise ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildGrid();
  resetGame();

  $('reset-btn').addEventListener('click', resetGame);
  $('start-btn').addEventListener('click', startWind);
  $('next-btn').addEventListener('click', () => { if (!play.playing) nextWind(); });
  $('all-btn').addEventListener('click', togglePlayAll);
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => chooseMode(btn.dataset.mode));
  });
  $('replay-btn').addEventListener('click', openReplay);
  $('replay32-btn').addEventListener('click', openReplay);
  $('pause-btn').addEventListener('click', togglePause);
  $('step-btn').addEventListener('click', stepReplay);
  $('close-btn').addEventListener('click', closeReplay);
  document.querySelectorAll('.set-btn').forEach(btn => {
    btn.addEventListener('click', () => chooseSetting(Number(btn.dataset.setting)));
  });

  const htpToggle = $('htp-toggle');
  const htpBody = $('htp-body');
  htpToggle.addEventListener('click', () => {
    const expanded = htpToggle.getAttribute('aria-expanded') === 'true';
    htpToggle.setAttribute('aria-expanded', String(!expanded));
    htpBody.classList.toggle('htp-collapsed', expanded);
    htpToggle.textContent = expanded ? 'How to Play ▸' : 'How to Play ▾';
  });
});
