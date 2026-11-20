# Windmill: decisions after Step 0

Matteo's answers to every open item in [PROPOSAL.md](PROPOSAL.md), settled on
2026-11-19. Where this file and the proposal differ, this file wins.

![Every decision applied: two game screens, the replay in progress, the end of the replay](proposal/decided.png)

Source: [`proposal/decided.svg`](proposal/decided.svg). It is a mock-up of the
look, not game code.

## Game rules

| # | Decision |
|---|---|
| D1 | Play ends when every direction of the setting has been used. Reset starts over. |
| D2 | **Changed from the proposal.** The wind direction is drawn automatically, at random, from the directions not used yet, as in Dandelions' default mode. No computer player, no AI. A private tap-to-pick mode (the person taps a direction on the compass) is turned on only by the URL parameter `?wind=pick`, with no mention on screen. A public toggle may come later. |
| D3 | A direction is named for where the wind comes from: a N wind blows toward the south. |
| D4 | `WAKE_HALF_WIDTH = 0.5` cells, `WAKE_LENGTH = 6` cells. |
| D5 | Every turbine casts a wake, even when it is itself hit. Hit or not: wakes do not stack. |
| D6 | One turbine and one gust per turn. Header: "Turn 3 of 8". The first gust cannot hit anything, but its wake is still drawn. |
| D7 | Switching between 8 and 16 directions resets the game. |

## What the screen shows

| # | Decision |
|---|---|
| D8 | Only the current gust is shown: its wakes as pale streaks and the turbines it hits with a soft-red cell border. All of it clears when the next turbine is placed. Earlier gusts leave no trace on the board. Overlapping wakes are drawn separately, so overlaps look brighter. |
| D8 compass | Current gust: gold `#f5e642`. Directions not used yet: pale `#c5d9e8`. Used directions are "switched off" in the compass's own blue `#1f3c51` (options compared in [`proposal/compass-used-options.png`](proposal/compass-used-options.png)). |
| Legend | A discreet one-line legend under the compass, small dots and muted text: "Wind now", "Still to come", "Used". In the replay, below the buttons: "Wind now", "8 directions", "Added in 16 directions", "Used" (see [`proposal/legend.png`](proposal/legend.png)). |
| Lost output | **Added after the build.** A turbine hit at least once turns vermilion (`#f0743c` blades and tower, gold hub) and stays that colour (How to Play says it "changes colour", not naming the colour, since colour-blind players see it differently): the wake passes with the gust, but the lost output stays. The red border still means "hit by this gust". A board legend under the status line reads "Hit now" and "Lost output". The replay starts every turbine fresh and changes its colour the first time a replay gust hits it, so its end screen shows vermilion turbines and no borders (no gust is blowing). A faint border on those turbines, added while the colour was a pale rose, was removed once vermilion made it redundant. *Colour changed after the phone test (2026-11-20):* the first rose `#f4bcbc` read as off-white on the phone. Vermilion was compared with salmon, deep rose, magenta and violet under simulated protanopia, deuteranopia and tritanopia: it stays clearly unlike the white turbines for all of them (olive-ochre with red-green colour blindness), and it sits in the warm sector of the palette's "X" harmony template with the gold and the red border. Magenta falls outside the template and goes dull with deuteranopia; violet turns grey with tritanopia and is close to the periwinkle of the added directions. |
| D9 | A record under the compass, one line per gust: `NE — hit: (3,4), (5,6)` or `NE — none`. |
| D10 | Axis numbers 0–8 along the bottom (x) and up the left side (y). |
| Text sizes | The turn line, axis numbers and "8 directions" caption are larger than in the first draft (see the mock-up). |

## Replay with 16 directions

| # | Decision |
|---|---|
| D11 | Available in the 8-direction setting with at least two turbines, between turns and after the game ends. Closing returns to the game unchanged. |
| D12 | The 16 gusts play clockwise from N, with **Pause / Play**, **Step** and **Close**. The replay header always takes two lines, "Replay with 16 directions" over "Wind from SW · 11 of 16" (the second line is blank on the end screen), so the board does not move while the replay plays. |
| D13 | **Changed after the phone test (2026-11-20).** The public replay draws no L lines: wakes, red borders and vermilion turbines show what hit what. The L is kept for Matteo's videos as a private mode, turned on only by the URL parameter `?lines=knight` (combine with `?wind=pick` as `?wind=pick&lines=knight`), with no mention on screen. In that mode an L is drawn only for a knight's move (1 cell one way, 2 the other), the pattern the 8 directions never hit and exactly one of the 8 added directions always does. Straight and diagonal hits, and bigger offsets, get no L. Each L runs along the row first, then the column, from cell edge to cell edge with an arrowhead, under the turbines, one at a time within each gust. *Before:* one L per hit turbine from the closest upwind turbine, which drew big Ls such as 3 across and 3 up for diagonal hits. |
| D15 | End of replay: "Hit by at least one of the 8 directions: X of N turbines" and "Hit by at least one of the 16 directions: Y of N turbines". |
| Compass | The 8 added directions are periwinkle `#94a0f0` before they blow and `#282f5d` after. The original 8 follow the game's colours. Periwinkle was chosen with the hue templates of Cohen-Or et al., *Color Harmonization* (2006): the palette fits the "X" template, with the blues in one sector and gold and red in the opposite one, and periwinkle sits in the blue sector, far from cyan (see [`proposal/replay-added-options.png`](proposal/replay-added-options.png)). At the end of the replay every direction is lit again, the original 8 pale and the added 8 periwinkle, none gold, so the compass is a key for the two counts (changed after the phone test; before, all 16 showed their dim "used" colours). |

## Text, look and packaging

| # | Decision |
|---|---|
| Rule line | "In this game, the wind blows only from the 8 directions on the compass." The number follows the setting. |
| D14 | A status line guides each step, and a short How-to-Play panel holds the rule line and the two steps of a turn. |
| D16 | Footer: "A companion to Dandelions" (linked) and "Based on Dandelions from *Math Games with Bad Drawings* by Ben Orlin". A link to the YouTube playlist "Demystifying Offshore Wind" is a hidden placeholder until the channel exists. |
| D17 | Turbine option B: off-white blades `#e8f0f5`, gold hub `#f5e642`. |
| D18 | Repo `windmill`, default branch `main`. |
| D19 | App icon: turbine B on `#1a2d3a`. |

## Scale

The game does not show a cell size on screen, but one cell is taken to be
about **7 rotor diameters (7D)**, a typical offshore spacing. At that scale the
game's hit-or-clear rule agrees with a simple physical wake model (Jensen) for
every pair of turbines within the 6-cell wake length except one borderline
offset. At 1D it does not. The check, its assumptions and its output will be in
`tools/scale_check.py` and the README.
