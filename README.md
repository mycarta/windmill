# Windmill

A free, offline, no-ads browser game about wind turbines and their wakes, and a
companion to [Dandelions](https://mycarta.github.io/Dandelions/).

It has two modes. **Play** is a puzzle: place 8 turbines on a 9×9 board, then
the wind blows from every direction on the compass, one at a time, and you see
how many turbines lost output. **Learn** shows wakes one gust at a time: after
each turbine, the wind blows in one direction, and you see which placements get
hit when the wind can blow in **8 directions**, and which when it can blow in
**16**.

Windmill is a teaching tool for the YouTube playlist *Demystifying Offshore
Wind* (coming soon), and it is meant to be playable on its own by anyone.

## Play

**On your phone:** visit [mycarta.github.io/windmill](https://mycarta.github.io/windmill/)
and tap "Add to Home Screen". It works offline after that.

**On desktop:** open the same link in any browser.

## How to play

In both modes, choose **8 directions** or **16 directions**. In this game, the
wind blows only in the directions on the compass. That is a rule of the game,
not a claim about real wind.

### Play

1. Tap empty squares to place 8 turbines. Tap a turbine to take it back.
2. Tap **Let the wind blow**. Each wind blows over your layout in turn. Tap
   **Next wind** to move on, or **Play all** to watch them all.
3. Every turbine casts a wake (the pale streaks), and any turbine inside a
   wake gets a red border and changes colour: it has lost output.
4. At the end, count the turbines that lost output. With 8 winds, a layout can
   keep them all. With 16 winds, losing half or fewer is acceptable.
5. Tap a direction on the compass to see that wind again, or tap a turbine to
   see which winds hit it.

With 16 winds, each game blows the winds either round the compass from N, or the
8 main directions first and then the 8 added ones (shown in periwinkle). The
order never changes the result.

### Learn

1. Tap an empty square to place a turbine.
2. The wind blows in one direction on the compass, picked at random. Each
   direction blows once. Every turbine casts a wake, and any turbine inside a
   wake gets a red border. The wake passes with the gust, but the lost output
   stays: a turbine that has been hit changes colour.
3. The game ends when every direction has blown. The record under the compass
   lists which turbines each gust hit.

With 8 directions, **Replay with 16 directions** takes the turbines on the board
and blows all 16 directions over them, one at a time, with **Pause / Play** and
**Step**. Each gust shows its wakes and red borders, and turbines change colour as
they are hit. At the end, two counts compare the 8 original directions with
all 16:

> Hit by at least one of the 8 directions: X of N turbines
> Hit by at least one of the 16 directions: Y of N turbines

The replay changes nothing in the game.

## The wake rule

Cell (0,0) is the south-west corner; x grows east, y grows north. Turbines sit
on cell centres. A direction is named for where the wind **blows toward**, as in
Dandelions: a N wind blows north, and its wakes stream north. (Weather reports
and wind roses name winds the other way, for where they come from.)

For a wind blowing toward compass bearing θ (0 = N, clockwise), the downwind unit
vector is `u = (sin θ, cos θ)`. For turbines A and B, let `d = B − A`,
`along = d · u` and `perp = |d_x u_y − d_y u_x|`. B is hit by A if

    0 < along ≤ WAKE_LENGTH   and   perp ≤ WAKE_HALF_WIDTH

with `WAKE_LENGTH = 6` cells and `WAKE_HALF_WIDTH = 0.5` cells (both set at the
top of [`wake.js`](wake.js)) and a 1e-9 tolerance, so exact lines count. Every
turbine casts a wake, whether or not it is itself hit. A turbine is either hit
or not: wakes do not add up.

## Scale: one cell is about 7 rotor diameters

The game shows no cell size, but its rule only makes physical sense at some
scale, so here it is stated openly: **one cell is taken to be about 7 rotor
diameters (7D)**, a typical spacing between offshore turbines.

Why not 1D, where a cell holds one rotor? Because then neighbouring turbines
would almost touch, a real wake would still be strong where the game cuts it off
at 6 cells, and the game's main lesson would fail: the knight-move pair that is
clear with 8 directions would already be partly in the wake.

[`tools/scale_check.py`](tools/scale_check.py) compares the game's rule with the
Jensen wake model (the simplest textbook model, called NOJ in PyWake), assuming
thrust coefficient 0.8 and offshore wake decay 0.04. Power loss of the
downwind turbine, worst case over the setting's directions:

| Offset | Setting | Game | 1D | 5D | **7D** | 10D |
|---|---|---|---|---|---|---|
| knight (2,1) | 8 | clear | 30% | 0% | **0%** | 0% |
| knight (2,1) | 16 | hit | 75% | 27% | **15%** | 5% |
| (3,1) | 8 | clear | 5% | 0% | **0%** | 0% |
| (3,1) | 16 | hit | 69% | 14% | **5%** | 0% |
| (3,2) | 8 and 16 | clear | 31% | 0% | **0%** | 0% |

At 7D the game and the model agree on all of these. Across every pair of
positions on the board, they disagree in only one case within the 6-cell wake
length: a 4-by-2 offset with 16 directions, which the game calls hit and the
model places just outside the wake. Beyond 6 cells the game says clear where the
model still gives 3–7% loss, the price of a wake that stops dead.

What the game simplifies, on purpose:

- A real wake weakens gradually with distance; in the game it is hit or nothing.
- A real wake starts about one rotor wide and slowly widens; the game draws it
  one cell (7D) wide all the way.
- Wakes from several turbines combine in reality; in the game a turbine is
  simply hit or not.
- The Jensen model is itself simple. PyWake's smoother models would move cases
  near the edge of the wake, and at high wind speeds real losses are smaller.

If you think another scale, or other constants, would make the game more
faithful, please open an issue. Run `python3 tools/scale_check.py` to see the
full output (Python 3, standard library only).

## Colours

The palette is Dandelions' palette with every green moved to ocean blue. Used
compass directions fade into the compass's own blue. In the replay, the 8 added
directions are periwinkle, chosen with the hue templates of Cohen-Or et al.,
[*Color Harmonization*](https://igl.ethz.ch/projects/color-harmonization/harmonization.pdf)
(SIGGRAPH 2006): the blues sit in one sector of the hue wheel, and gold and red
in the opposite one. The reasoning is in [DECISIONS.md](DECISIONS.md).

## Tests

- **Wake rule:** open [`tests/run.html`](tests/run.html) in a browser (the tab
  title shows PASS or FAIL), or run `node tests/run.js`. Both load the game's own
  `wake.js` and check the fixture values the game was specified with, plus edge
  cases.
- **Game screen:** [`tests/ui-smoke.html`](tests/ui-smoke.html) plays the real
  game in iframes and checks what it shows. It needs a local web server:
  run `python3 -m http.server` in the repo root, then open
  `http://localhost:8000/tests/ui-smoke.html`.

## Files

| File | What it is |
|---|---|
| `index.html`, `style.css` | The page and its layout |
| `wake.js` | The wake rule: no screen code, shared by the game and the tests |
| `game.js` | Board, compass, Play and Learn modes, record and replay |
| `manifest.json`, `sw.js`, `icon-*.png` | Installable offline app |
| `generate-icons.html` | Draws the app icons |
| `tests/` | Wake-rule tests and the UI smoke test |
| `tools/scale_check.py` | The physical-scale check above |
| `PROPOSAL.md`, `PLAY_PROPOSAL.md`, `DECISIONS.md`, `proposal/` | How the design was proposed and decided |

**Updating the offline app:** whenever any cached file changes, bump `CACHE` in
`sw.js` (`windmill-v1` → `windmill-v2` …). Otherwise phones that installed the
app keep serving the old files.

## Attribution

Based on Dandelions from *Math Games with Bad Drawings* by Ben Orlin (Black Dog &
Leventhal / Hachette, 2022), by way of the [Dandelions](https://github.com/mycarta/Dandelions)
app. No text or illustrations from the book are reproduced.

## License

MIT
