# Windmill: proposal for a play mode and a demonstration mode

Draft for Matteo, 2026-11-22. Nothing here is built. Where it would change a
rule in the spec or in [DECISIONS.md](DECISIONS.md), it says so.

## Why

A Dandelions player picked up the phone, played Windmill unprompted, cracked
the 8-direction game in a few rounds and enjoyed it as a game. Then
"Replay with 16 directions" made them think they could play with 16, and the
replay turned out to be something to watch. They were disappointed. They also
never found the 16-direction game behind the switch at the top.

Windmill now serves two audiences with one screen: players, who want a goal,
and Matteo's teaching and videos, which need tools to show things.

## What the game should reward

**The real-world skill is choosing a layout that holds up against every wind.**
A real farm faces wind from all directions for its whole life; no wind is ever
"used up".

Today's 16-direction game (16 turbines, one random wind per turn) rewards
something else. A layout that survives all 16 winds holds at most 7 turbines on
9×9, so the only way to place 16 well is timing: put turbines in line only after
both winds along that line have blown. That skill works (careful play loses
about 5 of 16 turbines against 14 for random placing), but it has no real-world
counterpart and teaches the opposite of the replay's lesson. Starting from a
regular pattern does not help either: it does worse (about 7 lost), because it
fills the board before the winds have shown anything.

So the 16-direction game should **judge the finished layout against all 16
winds**, whatever their order. Then timing stops mattering and layout is the
skill.

## Choosing the board size and turbine count

Figures use the game's exact wake rule (length 6, half width 0.5). "Best" is the
fewest turbines that lose output in the best layout found by optimisation
search; "random" is the average for random placing. Scripts were run once and
kept out of the repo.

**Turbines that lose output, finished layout against all 16 winds:**

| Board | 7 turbines | 8 turbines | 9 | 10 | 12 |
|---|---|---|---|---|---|
| 9×9 | best 0 · random 6.8 | **best 3 · random 7.9** | 5 · 8.9 | 7 · 9.9 | 9 · 12.0 |
| 10×10 | 0 · 6.7 | 2 · 7.7 | 2 · 8.8 | 5 · 9.9 | 7 · 11.9 |
| 11×11 | 0 · 6.4 | 0 · 7.6 | 0 · 8.7 | 3 · 9.8 | 6 · 11.9 |
| 12×12 | 0 · 6.3 | 0 · 7.4 | 0 · 8.5 | 0 · 9.6 | 4 · 11.7 |

- **Random placing loses almost everything** at every size: with 16 winds, the
  wake lines cover nearly every offset within 6 cells. The gap between skill
  and no skill is wide.
- **Each board has a sharp limit:** up to a certain count a perfect layout
  exists (7 on 9×9, 9 on 11×11, 10 on 12×12); one more and the losses jump.
- **The good layouts are tilted grids:** rows offset at an angle so that no
  wind lines two turbines up. Finding them is pattern knowledge that holds
  against every wind.

For comparison, the 8-direction game on 9×9 fits up to 12 turbines with no
wind ever hitting any of them, so its 8 turbines can always come through clean.

## Proposal

### 1. The 16-direction game: 8 turbines on 9×9, judged on the finished layout

- **Same board and same turbine count as the 8-direction game**, so it reads as
  "the same game, now with 16 winds".
- **Place all 8 turbines, then the 16 winds blow** over the finished layout,
  one at a time, with wakes, red borders and lost output, as the replay does
  today. No gust after each placement: one or two random winds out of 16 would
  say "fine" when most of the other winds would hit, which teaches luck, not
  layout.
- **The verdict is the replay's end count:** turbines hit by at least one of
  the 16 winds. The replay stops being a disappointment and becomes the ending.
- **A perfect game is impossible: the best possible is 3 lost.** This was
  checked exactly, not only by search (losing just 2 cannot be done). Random
  placing loses about 8 of 8.
- **An acceptable level of loss: half the turbines (4 of 8)**, chosen by
  Matteo. 3 is the expert target (the best possible); random placing loses
  about 8. On-screen wording to be confirmed, for example "Lost output: 4 of 8
  turbines. Acceptable: half or fewer." The level can be tuned by watching
  people play. Real farms also accept some wake loss.
- **Players learn game by game:** each reveal shows which shapes are dangerous,
  and the tilted-grid insight is discovered, not told.

**The reveal must leave time to think.** Today's replay moves on every 1.2
seconds, which suits a narrated demonstration but not a player working things
out alone. Matteo chose to try:

- **Player-paced reveal:** each wind stays on screen until the player taps
  "Next wind" (wording to be confirmed). An optional "Play all" runs the rest.
- **Review at the end,** like the post-game review in chess apps: tap any
  direction on the end compass to see that wind's wakes again, and tap a
  turbine that lost output to see which winds hit it. This is where most of the
  reflection happens: "why did this one go?"

A slower automatic pace (about 3 seconds per wind) was considered and set
aside: the player would still be watching rather than thinking.

This **changes the spec** (no winner, no score) and **D1, D6 and D7** (one
turbine and one gust per turn, play ends when every direction has blown). An
acceptable level is a target, not a win, and no score is kept across games.

### 2. Two modes, both open to everyone: Learn and Play

Matteo's direction: separate the two cleanly, because they serve different
purposes, and let anyone switch between them. The names "Learn" and "Play" are
working names, provisionally approved. Play opens first for a new visitor.

**Play:** a goal, and skill that pays.
- The 8-direction game, then the 16-direction game, **both in the same shape**:
  place 8 turbines, then the winds blow over the finished layout (player-paced,
  with review), judged on that layout. The only thing that changes between
  them is the number of winds.
- This is the escalation the replay shows today, but lived instead of watched:
  the player cracks the 8-wind game, carries the trick into the 16-wind game,
  sees it fail in the reveal, and has to find a better shape and accept some
  loss.
- Same shape matters. With a gust after each turn, the 8-wind game can be
  passed by timing: the board from Matteo's phone test came through clean, yet
  6 of its 8 turbines would be hit if all 8 winds blew on the finished layout.
- The 8-direction game must end clean (it always can); the 16-direction game
  has the acceptable level of half the turbines.
- No "Replay with 16 directions": nothing promises play that isn't there.

**Learn:** today's game, to understand wakes.
- The Dandelions rhythm: one turbine, then one gust, each turn; 8 or 16
  directions; the record of hits.
- "Replay with 16 directions" stays, since the mode says it is for learning.
- The private tools stay behind the URL for Matteo's videos (`?wind=pick`,
  `?lines=knight`), decided for now.

A switch between the two, placed and worded with a preview before it is built.

### 3. Set aside

- **Today's 16-direction game as the Play game** (16 turbines, one random wind
  per turn): rewards timing, which has no real-world counterpart. It stays in
  Learn.
- **8 turbines with two random gusts after each placement:** always solvable by
  timing, a second puzzle, same problem.
- **A 14×14 board** for 16 turbines: a perfect regular layout becomes possible,
  but cells shrink to about 25px on a phone and the layout spaces turbines
  about 25 rotor diameters apart (at one cell = 7D), far sparser than real
  farms (about 7 to 10D).
- **A board where a perfect game is possible** (7 turbines on 9×9, or 9 on
  11×11): an option if a perfect game turns out to matter to players.

## Questions for Matteo

1. ~~Acceptable level~~ Decided: half the turbines, 4 of 8.
2. ~~The 8-direction game~~ Decided: in Play it takes the same shape as the
   16-direction game; today's rhythm lives in Learn.
3. ~~Demonstration by URL~~ Decided: Learn and Play are both open to everyone,
   with a switch.
4. ~~Names~~ Decided, provisionally: "Learn" and "Play".
5. ~~First mode~~ Decided: Play opens first for a new visitor.
6. Should the end of the 8-direction game in Play lead into the 16-direction
   game? Open. Options: nothing (the player switches to 16 when they like), an
   offer at the end ("Try it with 16 winds", wording to be confirmed), or going
   straight on.
7. ~~Private tools~~ Decided: picking winds and knight Ls stay private (URL)
   for now.

## First release

Matteo may ask friends in the wind business, and Python-minded friends, to try
the first release of Play. Their reactions would set the acceptable level and
answer question 6.
