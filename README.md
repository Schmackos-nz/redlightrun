# REDLIGHT RUN

An infinite side-scrolling platformer for the browser. Run as far as you can;
the score is the distance. No build step - open `index.html`.

**The course is fixed.** Every run lays out the same world, so a longer run means
you played better, not that you drew an easier level, and the high-score table is
a fair comparison. Add `?seed=12345` to the URL for a different (but equally
fixed) course.

## Controls

| Key | Action |
| --- | --- |
| `A` / `D` or arrows | move |
| `SPACE` / `W` / `UP` | jump - release early to hop, **hold at the top to charge higher** |
| `S` / `DOWN` | crouch (slide under low ceilings, duck high bullets) |
| `S` + jump | crouch jump: a low, flat hop (51px up, 106px across) |
| `S` in mid-air | dive: straight back down at 900px/s, keeping your direction |
| `SPACE` | on the death screen, run again |
| `R` | restart | 
| `M` | mute |

## Look

Pastel world, vivid hazards. Terrain, sky and furniture are chalky and
low-chroma (0.12-0.21) so everything that can kill you - spikes, lava, shells,
the watcher, the storm - keeps its saturation (0.46-0.82) and reads instantly.
The gap between the softest hazard and the boldest piece of terrain is 0.25
chroma, which is the property worth preserving if you retune anything.

## On a phone

Touch controls appear automatically on any coarse-pointer device: an **analog
stick** under the left thumb, JUMP and DUCK under the right. The stick reads a
direction rather than an on/off press, so you can swing across it to turn round
without lifting off, and how far you push it scales your speed - a half push
walks. Pulling it straight down ducks, so the thumb never has to leave it.
On a short screen (a phone held sideways is about 380px tall) the menu collapses
to a compact card with the controls behind a HOW TO PLAY toggle. A single global touch
tracker handles them rather than per-button listeners, so several fingers work at
once and sliding a thumb from one pad to another hands over cleanly instead of
leaving the first stuck down. Starting a run requests fullscreen and tries to
lock landscape; in portrait the game asks you to turn the phone, because a
side-scroller in portrait shows almost none of the course.

Append `?touch` to force the mobile scheme on a desktop for layout checks.

## Rules

- Spikes, enemies and bullets kill instantly. There is no health bar.
- **Watcher zones** are red-light/green-light. Inside one, moving while the eye
  is red kills you. The amber phase is your warning to come to a complete stop -
  you slide for about a tenth of a second after releasing, so stop early.
- **The wall does not advance on its own.** It winds up while you are not making
  progress, and unwinds over 100 m of running. Standing still from a full 100 m
  lead is fatal in about 13 s; running sheds the whole wind-up over 100 m.
  Climbing counts as progress (net new height, so hopping on the spot does not),
  and a red light freezes the wall along with you.
- A chase bar at the top shows a 100 m span: a skull for the wall, an arrow for
  you. It reddens and the skull pulses as it closes.
- Score is distance in metres; the top ten runs are kept in `localStorage`.

## Music

Procedural, no assets. A 32-step (two bar) loop in A minor (i - VI - VII - v) is
scheduled ahead of the audio clock, and **the storm wall drives it**. The gap to
the wall is clamped at 1020px, and the interesting range is the last few hundred,
so it maps 800px to calm and 140px to panic rather than spreading the curve over
the whole slack:

| gap | tempo | mix |
| --- | --- | --- |
| 800px+ | 88 bpm | kick and bass pulse, lowpass closed at 700Hz |
| 550px | 129 bpm | hats come in |
| 400px | 154 bpm | arpeggio, snare |
| 140px or less | 196 bpm | sixteenth hats, alarm lead, lowpass wide at 5900Hz |

Tempo glides toward its target rather than snapping, so a brief scare does not
jerk the beat. Inside a watcher zone on red the melodic layers drop out entirely
and only a slow heartbeat kick is left, so holding still feels as exposed as it
should.

Two things worth knowing if you touch this:

- Audio is scheduled from the animation frame (`musicTick`), never from the fixed
  physics step. The audio clock has nothing to do with the timestep.
- The lowpass is retargeted from `musicTick` with a dead zone, not from `update`.
  Driving an `AudioParam` at 120Hz piles up an automation event every 8ms and the
  filter never actually travels.

## Replay

WATCH REPLAY on the death screen plays your last attempt back in full, then
lands on the same end screen. It records **one byte of input per physics step**
(~7KB a minute, capped at ten minutes) and plays it back by re-running the real
simulation, rather than animating a recording - so what you watch is exactly what
happened, not an approximation. That only works because the course is seeded and
the sim is deterministic; verified frame-for-frame over a 948-step run with live
input deliberately jammed during playback. Any key skips.

## Enemies

Landing on an enemy's head **stomps** it: the enemy dies and you bounce at
560px/s. Side or underneath contact still kills you. The stomp is judged from
where your feet were *before* the step, so clipping a side at speed is still a
side hit.

Some walkers and chasers wear **spikes on their head** - same red and glow as the
floor spikes, so the read is immediate. Landing on one kills you and leaves the
enemy standing. Both kinds appear from 110m, so you learn to look before leaping.

**Chasers** (from 154m) sit still until you come within 380px, then run you down
at 235px/s. That is slower than your 330, so they can always be outrun, but they
follow a long way and only give up past 760px. They stop at ledges rather than
walking into pits, and a watcher's red light freezes them - without that, being
forced to stand still with one bearing down on you is unwinnable.

A stomp does not hand back the jump, only the charge. Chaining off a flyer at the
top of its arc reaches 354px, still under the 460px descent-shaft wall, so
nothing becomes reachable that was not already.

Turret and lobber chassis are non-lethal to touch - the projectiles are the
threat. A gun is bolted where you have to stand to get past it.

## Level generation

The world is streamed in segments about 2600px ahead of the player and pruned
behind. Eleven segment types are drawn from a difficulty-weighted pool, with a
flat breather inserted after most hard segments:

`flat` `gaps` `pill` (spire field) `crch` (crouch tunnels) `turr` (firing line)
`up` / `down` (vertical shafts over spike floors) `red` (watcher zone)
`fly` `slsh` (bladeworks) `gaunt` (spike teeth) `climb` (the ascent)
`holes` (the drop)

### Mortars

From 275m, some shaft and tower walls carry a **lobber**: a mortar that arcs a
shell at wherever you are standing when it fires. It will not fire again until
that shell has landed or expired, so a single gun never has two in the air. A
pulsing ring marks where the shell is coming down, and the charge glow telegraphs
the shot, so the 0.55s wind-up plus flight time is your window to move. Standing
put gets you hit; walking off the marked spot does not.

### Verticality

`climb` is a walled tower of 6-13 floating rungs zig-zagging upward, up to
1200px tall. Rungs rise 100px and are wide enough that the diagonal is 110px at
worst, where a single jump is still 122px up. Missing one drops you onto a safe
floor at the base: the cost is the climb, not the run.

`holes` is an elevated run whose only way onward is a marked hole in the floor,
with the far end walled so you cannot run past it.

Two platform kinds appear as the course goes on. **Movers** (from 247m) slide
along one axis and carry their rider. **Crumblers** (from 341m) shake for half a
second when you land, give way, then return 2.6s later.

Ascending and descending segments are steered by how far the course sits above
its start, so elevation cannot run away; over 400 segments it stays within
-800..2670px. Towers are walled for a reason: without walls you can drift out
sideways halfway up into the next segment's column, far below its floor, which
the fall check reads as a fall.

Each type has a `minD` unlock so techniques arrive in order rather than
everything being possible on the first screen (d = metres / 550):

| from | type |
| --- | --- |
| 0m | `flat` `gaps` |
| 33m | `crch` |
| 55m | `pill` |
| 88m | `red` |
| 110m | `up` |
| 143m | `fly` |
| 165m | `down` |
| 187m | `turr` |
| 220m | `slsh` |
| 253m | `gaunt`, and the first ceiling over any hazard |

Difficulty ramps over the first 11,000px, then holds. It is derived from the
**generation cursor**, not the player position - otherwise a segment would get a
different difficulty depending on where the player happened to be standing when
it streamed in, and the course would drift between runs.

Generation draws from a seeded mulberry32 stream (`worldRand`). `rngSrc` is
swapped to it for the duration of `generate()` only, so cosmetic randomness
(particles, sparks, screen shake, star twinkle) can never consume world entropy
and shift the layout when a frame is dropped.

## Layout

- `index.html` - markup, styling, menus, HUD
- `game.js` - everything else

Append `?debug=N` to start N metres into the course to test late content. The
world is generated exactly as a normal run would generate it, so what you land
in is the real thing, and the spawn walks forward until it finds solid ground
clear of spikes and enemies. **A `?debug=` run is flagged practice and never
touches the high score board** - the HUD shows a PRACTICE badge and the death
screen says NOT SAVED.

Append `?dev` to the URL to expose `window.__RLR` (world, player, state, and a
`startRun` / `update` / `render` / `generate` handle) for driving the sim by hand.

## Tuning constants that matter

Measured from the real physics, not assumed:

- top speed 330 px/s, plain jump lifts the feet 120px and carries 195px
- charge jump lifts the feet 228px and carries 360px (there is no double jump;
  holding at the apex is the only way to go high, and it is always available)
- lava fills some ground openings instead of spikes: same depth and lethality,
  so nothing about the jump geometry changes
- standing box 26x46, crouched 26x24

Generation is capped against those numbers: obstacles never exceed 210px, pits
never exceed 260px, shaft rungs rise 100px, and crouch doorways always leave
between 26 and 45px so they need a crouch but are never impassable.

### Turret halls

A high shot passes over a crouching player; a low shot has to be hopped. Three
rules keep them dodgeable:

- **One mode per hall.** Mixing high and low side by side can demand a duck and a
  jump in the same instant, which is not dodgeable at any bullet speed.
- **210px minimum spacing**, so shots arrive one at a time rather than stacked.
- **Staggered volleys**, phased above the 0.35s offscreen grace so entering the
  view cannot reset them into unison.

Bullets travel 364px/s against a 330px/s runner, closing at 694, so a shot
visible 400px out gives ~0.58s to react. Measured across 36 halls: minimum gap
between arrivals in a *low* hall is 0.625s, comfortably above the 0.40s a crouch
hop costs. High halls can bunch tighter, which is fine - a duck is instant and
can simply be held.

The turret chassis does **not** kill on contact. A high shot has to pass through
a standing player's box, so the muzzle is unavoidably in the running lane; if the
body killed too, every turret would have to be jumped *while* dodging its own
fire.

### Descent shafts

Two rules keep a descent from being a trap, both learned from a shaft at 474m
that was effectively impassable:

- **No spikes on the rungs.** They used to sit in the middle of a ledge, which is
  exactly where you land: stepping off the entry lip at running speed covers 98px
  while falling the 130px to the first rung, and the spikes sat at 97..121.
- **The floor spikes are sized from the last rung**, not fixed. A rung butting the
  right wall can only be left by its *left* edge, and the spikes used to run to
  rel 171 while that edge sat at 168 - the only exit available dropped you onto
  them. The clear pad is now derived from where the last rung forces you down and
  never sits between you and the doorway.

Measured by throwing 6000 randomised input policies at one shaft: survival went
from 6 to 749. Across 111 shafts, every one leaves a landing stretch of at least
143px within reach of its last rung.

### The unjumpable band

The rule that matters most for how fair the game feels: **no ceiling above a
surface the player stands on may sit between 46 and 170px.** Below 46 you cannot
stand up at all, so it reads as a crouch tunnel. At 170+ a full standing jump
(feet 120 + 46 of player = 166) fits underneath. In between you can stand up but
not jump, which silently turns an ordinary hop into a frame-perfect input. That
band was the single biggest source of unfair-feeling deaths.

Two related invariants, both measured rather than assumed:

- A spike patch with ground either side is a *tooth*. A full jump taken from its
  edge lands the player box across `[+169, +195]`, so tooth width plus landing
  strip must exceed 195 or the player's own default input overshoots the gap and
  lands them on the next tooth.
- Pillar tops are sized against the jump that *arrives* at them: gap at most 150
  so the jump always reaches, and gap + top width at least 215 so the top
  catches the box with ~20px of overlap rather than a few pixels of edge.
