// WINDMILL — wake rule (pure logic, no DOM).
//
// Loaded as a plain <script> by the game (index.html) and by the tests
// (tests/run.html in a browser, tests/run.js in Node), so the tests check
// exactly the code the game runs.
//
// Coordinates: cell (0,0) is the south-west corner, x grows east, y grows
// north. Turbines sit on cell centres and are objects {x, y}.
// A direction is named for where the wind COMES FROM: a N wind blows south.

// ── Constants (change them here only) ────────────────────────────────────────

const WAKE_HALF_WIDTH = 0.5;   // cells, each side of the wind line through a turbine
const WAKE_LENGTH     = 6;     // cells, downwind of a turbine
const WAKE_EPS        = 1e-9;  // tolerance so exact lines and exact lengths count

const DIRECTIONS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const DIRECTIONS_8  = DIRECTIONS_16.filter((_, i) => i % 2 === 0);

// The directions of a setting (8 or 16), clockwise from N.
function directionsFor(setting) {
  return setting === 16 ? DIRECTIONS_16.slice() : DIRECTIONS_8.slice();
}

// Compass bearing in degrees, 0 = N, clockwise.
function bearingOf(dir) {
  const i = DIRECTIONS_16.indexOf(dir);
  if (i < 0) throw new Error('Unknown direction: ' + dir);
  return i * 22.5;
}

// Downwind unit vector (east, north) for a wind FROM dir.
function downwindVector(dir) {
  const t = bearingOf(dir) * Math.PI / 180;
  return [-Math.sin(t), -Math.cos(t)];
}

// Where B sits relative to the wind line through A:
// along = distance downwind (negative = upwind), perp = distance off the line.
function wakeGeometry(a, b, dir) {
  const [ux, uy] = downwindVector(dir);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { along: dx * ux + dy * uy, perp: Math.abs(dx * uy - dy * ux) };
}

// Is B inside A's wake for a wind from dir?
function isHit(a, b, dir) {
  const { along, perp } = wakeGeometry(a, b, dir);
  return along > WAKE_EPS &&
         along <= WAKE_LENGTH + WAKE_EPS &&
         perp  <= WAKE_HALF_WIDTH + WAKE_EPS;
}

// Every (upwind, hit) pair for one gust, as index pairs into turbines.
// Every turbine casts a wake, whether or not it is itself hit.
function hitPairs(turbines, dir) {
  const pairs = [];
  for (let i = 0; i < turbines.length; i++) {
    for (let j = 0; j < turbines.length; j++) {
      if (i !== j && isHit(turbines[i], turbines[j], dir)) pairs.push({ from: i, to: j });
    }
  }
  return pairs;
}

// Indices of the turbines hit by one gust (hit or not: no stacking), sorted.
function hitsForGust(turbines, dir) {
  const hit = new Set(hitPairs(turbines, dir).map(p => p.to));
  return [...hit].sort((p, q) => p - q);
}

// One pair per hit turbine: from the closest upwind turbine that hits it.
// Ties (equal distance) go to the turbine nearer the wind line, then to the
// lower index, so the result is always the same.
function nearestHitPairs(turbines, dir) {
  const best = new Map();
  for (const p of hitPairs(turbines, dir)) {
    const a = turbines[p.from];
    const b = turbines[p.to];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const perp = wakeGeometry(a, b, dir).perp;
    const cur = best.get(p.to);
    if (!cur ||
        dist < cur.dist - WAKE_EPS ||
        (Math.abs(dist - cur.dist) <= WAKE_EPS && perp < cur.perp - WAKE_EPS)) {
      best.set(p.to, { from: p.from, to: p.to, dist, perp });
    }
  }
  return [...best.values()]
    .sort((p, q) => p.dist - q.dist || p.to - q.to)
    .map(p => ({ from: p.from, to: p.to }));
}

// Indices of the turbines hit by at least one of the given directions,
// with every turbine exposed to every direction (as in the replay).
function hitByAny(turbines, dirs) {
  const hit = new Set();
  for (const dir of dirs) for (const i of hitsForGust(turbines, dir)) hit.add(i);
  return [...hit].sort((p, q) => p - q);
}

// Smallest distance of B = A + offset from the wind line through A, over the
// directions of a setting that put B downwind of A. Used by the tests.
function smallestLineDistance(offset, setting) {
  let best = Infinity;
  for (const dir of directionsFor(setting)) {
    const { along, perp } = wakeGeometry({ x: 0, y: 0 }, { x: offset[0], y: offset[1] }, dir);
    if (along > WAKE_EPS) best = Math.min(best, perp);
  }
  return best;
}
