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
const PICK_MODE = new URLSearchParams(location.search).get('wind') === 'pick';

const GUST_DELAY_MS   = 500;    // pause between placing a turbine and the gust
const REPLAY_FRAME_MS = 1200;   // each replay frame (a gust, or one L within it)
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

function initState() {
  clearTimeout(gustTimer);
  turbines = [];
  usedDirs = [];
  record = [];
  current = null;
  gameOver = false;
  inputLocked = false;
  awaitingPick = false;
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

// lost: the turbine has been hit at least once, so it has lost output (rose).
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
//   lost: Set of turbine indices that have lost output so far (rose)
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
  if (view.gust) {
    const [ux, uy] = downwindVector(view.gust);
    const angle = Math.atan2(-uy, ux) * 180 / Math.PI;   // SVG y points down
    for (const t of turbines) {
      const [cx, cy] = centre(t);
      wakes.appendChild(svgEl('rect', {
        class: 'wake' + (view.freshGust ? ' fade-in' : ''),
        x: 0, y: -WAKE_HALF_WIDTH * CELL, width: WAKE_LENGTH * CELL, height: 2 * WAKE_HALF_WIDTH * CELL,
        transform: `translate(${cx}, ${cy}) rotate(${angle.toFixed(3)})`,
      }));
    }
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
  svg.setAttribute('class', n === 16 ? 'n16' : 'n8');
  svg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 100, class: 'compass-ring' }));
  svg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 4.5, class: 'compass-center' }));
  for (const dir of directionsFor(n)) {
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
    const text = g.querySelector('text');
    text.setAttribute('class', ['dir-text', dir.length === 3 ? 'three' : '',
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
  return !replay && !gameOver && !inputLocked && !awaitingPick && turbines.length < setting;
}

function setStatus(msg) { $('status').textContent = msg; }
function setTurnLine(msg) { $('turn-line').textContent = msg; }

function turnLine() {
  const n = Math.max(turbines.length, 1);
  return current ? `Turn ${n} of ${setting} · Wind from ${current.dir}` : `Turn ${n} of ${setting}`;
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
  const text = `In this game, the wind blows only from the ${setting} directions on the compass.`;
  $('rule-line').textContent = text;
  $('htp-rule').textContent = text;
  $('compass-caption').textContent = `${setting} directions`;
}

function updateButtons() {
  const btn = $('replay-btn');
  btn.hidden = setting !== 8;
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
  setTurnLine(turnLine());
  updateButtons();
}

// ── Turns ────────────────────────────────────────────────────────────────────

function handleCellClick(x, y) {
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
  renderGame();
  setStatus('Tap a square to place a turbine');
}

function chooseSetting(n) {
  if (replay || n === setting) return;
  setting = n;
  resetGame();
}

// ── Replay with 16 directions ────────────────────────────────────────────────

function openReplay() {
  if (setting !== 8 || turbines.length < 2 || inputLocked || awaitingPick || replay) return;

  // The replay is its own experiment: every turbine starts with no lost
  // output and turns rose the first time a replay gust hits it.
  const frames = [];
  const lostSoFar = new Set();
  for (const dir of DIRECTIONS_16) {
    const hits = hitsForGust(turbines, dir);
    hits.forEach(i => lostSoFar.add(i));
    const lost = new Set(lostSoFar);
    const pairs = nearestHitPairs(turbines, dir);
    if (pairs.length === 0) frames.push({ dir, hits, lost, pair: null });
    else pairs.forEach(pair => frames.push({ dir, hits, lost, pair }));
  }
  frames.push({ final: true });

  replay = {
    frames,
    index: -1,
    playing: true,
    timer: null,
    saved: { turn: $('turn-line').textContent, status: $('status').textContent },
    hit8: hitByAny(turbines, DIRECTIONS_8).length,
    hit16: hitByAny(turbines, DIRECTIONS_16),
  };

  ['compass-caption', 'rule-line', 'record', 'game-buttons'].forEach(id => { $(id).hidden = true; });
  $('replay-controls').hidden = false;
  $('pause-btn').hidden = false;
  $('step-btn').hidden = false;
  setPauseLabel();
  buildCompass(16);
  renderLegend([[COLOR.now, 'Wind now'], [COLOR.pale, '8 directions'],
                [COLOR.added, 'Added in 16 directions'], [COLOR.used, 'Used']]);
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
    drawBoard({ lost: new Set(replay.hit16) });   // no gust now: no borders, only lost output
    paintCompass(dir => ({ active: false, used: true, added: !DIRECTIONS_8.includes(dir), tappable: false }));
    setTurnLine('Replay with 16 directions');
    setStatus('');
    setSummary('summary-8',  'Hit by at least one of the 8 directions:',  `${replay.hit8} of ${n} turbines`);
    setSummary('summary-16', 'Hit by at least one of the 16 directions:', `${replay.hit16.length} of ${n} turbines`);
    $('replay-summary').hidden = false;
    $('pause-btn').hidden = true;
    $('step-btn').hidden = true;
    return;
  }

  const newGust = !prev || prev.dir !== f.dir;
  drawBoard({ gust: f.dir, hits: f.hits, lost: f.lost, pair: f.pair, freshGust: newGust, freshLine: true });
  const k = DIRECTIONS_16.indexOf(f.dir);
  paintCompass(dir => {
    const added = !DIRECTIONS_8.includes(dir);
    const active = dir === f.dir;
    return { active, used: !active && DIRECTIONS_16.indexOf(dir) < k, added, tappable: false };
  });
  setTurnLine(`Replay with 16 directions · Wind from ${f.dir} · ${k + 1} of 16`);
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
  renderGame();
  setTurnLine(saved.turn);
  setStatus(saved.status);
}

// ── Initialise ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildGrid();
  resetGame();

  $('reset-btn').addEventListener('click', resetGame);
  $('replay-btn').addEventListener('click', openReplay);
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
