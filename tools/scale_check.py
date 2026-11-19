"""Does Windmill's hit-or-clear wake rule agree with a simple physical wake model?

The game never states a cell size. The README takes one cell to be about 7 rotor
diameters (7D), a typical offshore spacing. This script checks that choice by
comparing the game's rule with the Jensen wake model (the simplest textbook
model; PyWake calls it NOJ) for several cell sizes.

Model (all lengths in rotor diameters D, rotor radius R = 0.5):
  wake radius        r_w(x) = R + k * x          (x = distance downwind)
  speed deficit      dU/U   = (1 - sqrt(1 - Ct)) * (R / r_w)**2   inside the wake
  partial wake       deficit scaled by the fraction of the downstream rotor's
                     area that lies inside the wake circle
  power loss         ~ 1 - (1 - dU/U)**3

Assumptions and limits:
  - Ct = 0.8 (thrust coefficient below rated wind speed); at and above rated
    speed, real power losses are smaller.
  - k = 0.04 (typical offshore wake decay); 0.05 shown as a sensitivity check.
  - Top-hat wake: full deficit inside, none outside. Smoother models (e.g. the
    Gaussian ones in PyWake) give tails, so cases near the wake edge can shift.
  - One wake at a time: no combining of several upstream wakes.
  - Equal hub heights, flat sea, no turbulence model, no yaw.

Game rule (wake.js): B is hit by A if 0 < along <= 6 cells and perp <= 0.5 cells.

Run:  python3 tools/scale_check.py        (Python 3 standard library only)
"""
import math

CT = 0.8
R = 0.5
WAKE_HALF_WIDTH = 0.5   # cells, as in wake.js
WAKE_LENGTH = 6         # cells, as in wake.js
EPS = 1e-9
DIRS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
           'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
SETTINGS = {8: DIRS_16[::2], 16: DIRS_16}
CELL_SIZES = [1, 3, 5, 7, 10]          # rotor diameters per cell
FIXTURES = [((2, 1), 'knight (2,1)'), ((3, 1), '(3,1)'), ((3, 2), '(3,2)')]


def overlap_fraction(d, r_rotor, r_wake):
    """Fraction of a rotor disc (radius r_rotor) inside a wake disc (radius r_wake), centres d apart."""
    if d >= r_rotor + r_wake:
        return 0.0
    if d <= abs(r_wake - r_rotor):
        return 1.0 if r_wake >= r_rotor else (r_wake / r_rotor) ** 2
    a = r_rotor ** 2 * math.acos((d * d + r_rotor ** 2 - r_wake ** 2) / (2 * d * r_rotor))
    b = r_wake ** 2 * math.acos((d * d + r_wake ** 2 - r_rotor ** 2) / (2 * d * r_wake))
    c = 0.5 * math.sqrt((-d + r_rotor + r_wake) * (d + r_rotor - r_wake)
                        * (d - r_rotor + r_wake) * (d + r_rotor + r_wake))
    return (a + b - c) / (math.pi * r_rotor ** 2)


def power_loss(along_d, perp_d, k):
    """Jensen-model power loss of a rotor `along_d` downwind and `perp_d` off the wake axis (both in D)."""
    if along_d <= 0:
        return 0.0
    r_w = R + k * along_d
    deficit = (1 - math.sqrt(1 - CT)) * (R / r_w) ** 2 * overlap_fraction(perp_d, R, r_w)
    return 1 - (1 - deficit) ** 3


def geometry(offset, direction):
    """(along, perp) of B = A + offset for a wind FROM direction, in cells (same as wake.js)."""
    t = math.radians(DIRS_16.index(direction) * 22.5)
    ux, uy = -math.sin(t), -math.cos(t)
    return offset[0] * ux + offset[1] * uy, abs(offset[0] * uy - offset[1] * ux)


def game_hit(offset, setting):
    return any(EPS < a <= WAKE_LENGTH + EPS and p <= WAKE_HALF_WIDTH + EPS
               for a, p in (geometry(offset, d) for d in SETTINGS[setting]))


def model_worst(offset, setting, cell, k):
    """Largest power loss over the setting's directions, for a given cell size in D."""
    return max(power_loss(a * cell, p * cell, k) for a, p in (geometry(offset, d) for d in SETTINGS[setting]))


def header(cells):
    return ''.join(f'{str(c) + "D cell":>11}' for c in cells)


def main():
    for k in (0.04, 0.05):
        print(f'\n=== Jensen model, Ct = {CT}, wake decay k = {k} ===')

        print('\nA. Test fixtures: worst power loss over the setting\'s directions [game verdict]')
        print(f'{"offset":14}{"setting":>8}' + header(CELL_SIZES))
        for offset, name in FIXTURES:
            for s in (8, 16):
                row = ''.join(f'{model_worst(offset, s, c, k):>10.0%} ' for c in CELL_SIZES)
                print(f'{name:14}{s:>8}{row}  [game: {"HIT" if game_hit(offset, s) else "clear"}]')

        print(f'\nB. Straight downwind: power loss at n cells (game: hit up to {WAKE_LENGTH}, clear beyond)')
        print(f'{"cells":>6}' + header(CELL_SIZES))
        for n in range(1, 9):
            print(f'{n:>6}' + ''.join(f'{power_loss(n * c, 0, k):>10.0%} ' for c in CELL_SIZES))

        print('\nC. Model wake diameter in cells (the game draws a streak 1 cell wide)')
        for c in CELL_SIZES:
            print(f'   {c:>2}D cell: {2 * (R + k * c) / c:.2f} cells at 1 cell downwind, '
                  f'{2 * (R + k * 6 * c) / c:.2f} at 6 cells')

    k = 0.04
    offsets = [(dx, dy) for dx in range(1, 9) for dy in range(0, dx + 1)]   # all board offsets, up to symmetry
    print(f'\n=== D. Every offset on a 9x9 board: where game and model disagree (k = {k}, model "hit" = loss > 1%) ===')
    for cell in (5, 7, 10):
        rows, inside = [], 0
        for s in (8, 16):
            for off in offsets:
                g, m = game_hit(off, s), model_worst(off, s, cell, k)
                if g != (m > 0.01):
                    dist = math.hypot(*off)
                    inside += dist <= WAKE_LENGTH
                    rows.append(f'   {s:>2} dirs  offset {off}: game {"HIT" if g else "clear"}, '
                                f'model {m:.0%}  (distance {dist:.2f} cells)')
        print(f'\n-- {cell}D cell: {len(rows)} of {2 * len(offsets)} cases disagree, '
              f'{inside} of them within the {WAKE_LENGTH}-cell wake length')
        print('\n'.join(rows))


if __name__ == '__main__':
    main()
