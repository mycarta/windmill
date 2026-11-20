// WINDMILL — tests of the wake rule (runtime-agnostic).
//
// Expects wake.js to be loaded first, in the same scope (never via require):
//   - Browser: tests/run.html loads ../wake.js then this file with <script> tags.
//   - Node:    tests/run.js runs both files in one vm context.
// Results go to the console and to WAKE_TEST_RESULT; in a browser they are
// also written into the page and the title becomes "PASS ..." or "FAIL ...".
//
// The fixture values come from the build prompt, where they were computed with
// the exact rule (half width 0.5, length 6) and checked by the planner.

var WAKE_TEST_LINES = [];
var wakePassed = 0;
var wakeFailed = 0;

function wtLog(line) {
  WAKE_TEST_LINES.push(line);
  if (typeof console !== 'undefined') console.log(line);
}

function check(name, ok, detail) {
  if (ok) { wakePassed++; wtLog('PASS  ' + name); }
  else    { wakeFailed++; wtLog('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

function t(x, y) { return { x: x, y: y }; }
function key(turbine) { return '(' + turbine.x + ',' + turbine.y + ')'; }

// ── 1. Direction lists and vectors ───────────────────────────────────────────

wtLog('-- directions');
check('8 directions are N NE E SE S SW W NW',
      directionsFor(8).join(' ') === 'N NE E SE S SW W NW', directionsFor(8).join(' '));
check('16 directions add NNE ENE ESE SSE SSW WSW WNW NNW in order',
      directionsFor(16).join(' ') === 'N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW');
(function () {
  const n = downwindVector('N');
  const e = downwindVector('E');
  check('a N wind blows south: downwind = (0, -1)',
        Math.abs(n[0]) < 1e-12 && Math.abs(n[1] + 1) < 1e-12, n.join(', '));
  check('an E wind blows west: downwind = (-1, 0)',
        Math.abs(e[0] + 1) < 1e-12 && Math.abs(e[1]) < 1e-12, e.join(', '));
})();

// ── 2. Smallest distance table (fixtures) ────────────────────────────────────

wtLog('-- smallest distance from the nearest wind line through A');
[
  { offset: [2, 1], d8: 0.707, d16: 0.159, label: '(2,1) knight' },
  { offset: [3, 1], d8: 1.000, d16: 0.224, label: '(3,1)' },
  { offset: [3, 2], d8: 0.707, d16: 0.700, label: '(3,2)' },
].forEach(function (row) {
  const got8  = smallestLineDistance(row.offset, 8);
  const got16 = smallestLineDistance(row.offset, 16);
  check(row.label + ' at 8 directions = ' + row.d8.toFixed(3),
        got8.toFixed(3) === row.d8.toFixed(3), got8.toFixed(6));
  check(row.label + ' at 16 directions = ' + row.d16.toFixed(3),
        got16.toFixed(3) === row.d16.toFixed(3), got16.toFixed(6));
});
check('(2,1) and (3,1) clear at 8, hit at 16; (3,2) clear at both (half width 0.5)',
      smallestLineDistance([2, 1], 8) > WAKE_HALF_WIDTH && smallestLineDistance([2, 1], 16) <= WAKE_HALF_WIDTH &&
      smallestLineDistance([3, 1], 8) > WAKE_HALF_WIDTH && smallestLineDistance([3, 1], 16) <= WAKE_HALF_WIDTH &&
      smallestLineDistance([3, 2], 8) > WAKE_HALF_WIDTH && smallestLineDistance([3, 2], 16) > WAKE_HALF_WIDTH);

// ── 3. Patterns on the 9x9 board (fixtures) ──────────────────────────────────

wtLog('-- patterns: centre (4,4) plus offsets, every turbine exposed to every direction');
[
  { name: 'Full knight ring',
    offsets: [[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]], hit8: 8, hit16: 9 },
  { name: 'Left-hand-only knight set',  offsets: [[2,1],[-1,2],[-2,-1],[1,-2]], hit8: 0, hit16: 5 },
  { name: 'Left-hand-only 3-by-1 set',  offsets: [[3,1],[-1,3],[-3,-1],[1,-3]], hit8: 0, hit16: 5 },
  { name: 'Left-hand-only 3-by-2 set',  offsets: [[3,2],[-2,3],[-3,-2],[2,-3]], hit8: 0, hit16: 0 },
].forEach(function (p) {
  const turbines = [t(4, 4)].concat(p.offsets.map(function (o) { return t(4 + o[0], 4 + o[1]); }));
  const in8  = hitByAny(turbines, directionsFor(8)).length;
  const in16 = hitByAny(turbines, directionsFor(16)).length;
  check(p.name + ': hit at 8 = ' + p.hit8, in8 === p.hit8, 'got ' + in8);
  check(p.name + ': hit at 16 = ' + p.hit16, in16 === p.hit16, 'got ' + in16);
});

// ── 4. Edge cases of the rule ────────────────────────────────────────────────

wtLog('-- edge cases');
check('N wind: B south of A is hit',           isHit(t(4, 4), t(4, 2), 'N'));
check('S wind: B south of A is not hit',       !isHit(t(4, 4), t(4, 2), 'S'));
check('a turbine never hits itself',           !isHit(t(4, 4), t(4, 4), 'N'));
check('side by side across the wind is not hit (along = 0)', !isHit(t(4, 4), t(5, 4), 'N'));
check('exactly WAKE_LENGTH (6) downwind is hit',            isHit(t(0, 4), t(6, 4), 'W'));
check('WAKE_LENGTH + 1 (7) downwind is not hit',            !isHit(t(0, 4), t(7, 4), 'W'));
check('diagonal NE wind: (5,5) hits (3,3)',                 isHit(t(5, 5), t(3, 3), 'NE'));
check('exactly WAKE_HALF_WIDTH off the line is hit (tolerance)', isHit(t(0, 0), t(0.5, -3), 'N'));
check('just beyond WAKE_HALF_WIDTH is not hit',             !isHit(t(0, 0), t(0.5001, -3), 'N'));

(function () {
  // Exact boundaries in every direction. On diagonals, floating-point rounding
  // can land a hair outside (e.g. 6.000000000000001); the tolerance keeps them in.
  const bad = [];
  for (const dir of directionsFor(16)) {
    const u = downwindVector(dir);
    const atLength = t(WAKE_LENGTH * u[0], WAKE_LENGTH * u[1]);
    const atCorner = t(WAKE_LENGTH * u[0] + WAKE_HALF_WIDTH * u[1], WAKE_LENGTH * u[1] - WAKE_HALF_WIDTH * u[0]);
    if (!isHit(t(0, 0), atLength, dir) || !isHit(t(0, 0), atCorner, dir)) bad.push(dir);
  }
  check('every direction: exactly WAKE_LENGTH downwind, and exactly WAKE_HALF_WIDTH off the line there, is hit',
        bad.length === 0, bad.join(' '));
})();

(function () {
  // Every turbine casts a wake, even when it is itself hit; no stacking.
  const row = [t(4, 6), t(4, 4), t(4, 2)];
  const hits = hitsForGust(row, 'N').map(function (i) { return key(row[i]); }).join(' ');
  check('N wind down a column: middle and bottom turbines hit', hits === '(4,4) (4,2)', hits);
  const pairs = hitPairs(row, 'N').length;
  check('the bottom turbine is in two wakes (two pairs) but counted once', pairs === 3 && hitsForGust(row, 'N').length === 2,
        pairs + ' pairs');
})();

(function () {
  // L lines (private ?lines=knight replay): only knight's-move pairs.
  const set = [t(4, 4), t(6, 5), t(3, 6), t(2, 3), t(5, 2)];   // left-hand knight set
  const all = hitPairs(set, 'ENE').length;
  const ls = knightHitPairs(set, 'ENE')
    .map(function (p) { return key(set[p.from]) + '->' + key(set[p.to]); }).join(' ');
  check('ENE over the left-hand knight set: 3 hit pairs', all === 3, all + ' pairs');
  check('ENE: Ls only for the two knight\'s-move pairs', ls === '(6,5)->(4,4) (4,4)->(2,3)', ls);
  check('ENE: the (6,5)->(2,3) pair (4 across, 2 down) gets no L', ls.indexOf('(6,5)->(2,3)') < 0, ls);
  const diag = [t(0, 1), t(3, 4)];
  check('SW diagonal hit (3 across, 3 up) gets no L',
        hitPairs(diag, 'SW').length === 1 && knightHitPairs(diag, 'SW').length === 0);
  const col = [t(4, 6), t(4, 4)];
  check('N hit down a column gets no L', hitPairs(col, 'N').length === 1 && knightHitPairs(col, 'N').length === 0);
})();

(function () {
  // A knight's move is never hit by the 8 directions, and always by exactly
  // one of the 8 added directions.
  const moves = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const bad = [];
  for (const m of moves) {
    const b = t(m[0], m[1]);
    const by8  = directionsFor(8).filter(function (d) { return isHit(t(0, 0), b, d); });
    const by16 = directionsFor(16).filter(function (d) { return isHit(t(0, 0), b, d); });
    if (by8.length !== 0 || by16.length !== 1 || !isKnightMove(t(0, 0), b)) bad.push(m.join(','));
  }
  check('every knight\'s move: missed by the 8 directions, hit by exactly one added direction',
        bad.length === 0, bad.join(' '));
})();

check('no turbines, no hits', hitsForGust([], 'N').length === 0 && hitByAny([], directionsFor(16)).length === 0);
check('one turbine, no hits', hitsForGust([t(4, 4)], 'N').length === 0);

// ── Summary ──────────────────────────────────────────────────────────────────

wtLog('');
wtLog((wakeFailed === 0 ? 'ALL PASSED' : 'FAILURES') + ': ' + wakePassed + ' passed, ' + wakeFailed + ' failed');
var WAKE_TEST_RESULT = { passed: wakePassed, failed: wakeFailed };

if (typeof document !== 'undefined' && document.body) {
  var pre = document.createElement('pre');
  pre.id = 'results';
  pre.textContent = WAKE_TEST_LINES.join('\n');
  document.body.appendChild(pre);
  document.title = (wakeFailed === 0 ? 'PASS ' : 'FAIL ') + wakePassed + '/' + (wakePassed + wakeFailed);
}
