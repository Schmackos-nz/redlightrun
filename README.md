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
| `SPACE` / `W` / `UP` | jump, press again in mid-air to double jump |
| `S` / `DOWN` | crouch (slide under low ceilings, duck high bullets) |
| `S` + jump | crouch jump: a low, flat hop (51px up, 106px across) |
| `SPACE` | on the death screen, run again |
| `R` | restart | 
| `M` | mute |

## On a phone

Touch controls appear automatically on any coarse-pointer device: two movement
pads under the left thumb, JUMP and DUCK under the right. A single global touch
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

## Level generation

The world is streamed in segments about 2600px ahead of the player and pruned
behind. Eleven segment types are drawn from a difficulty-weighted pool, with a
flat breather inserted after most hard segments:

`flat` `gaps` `pill` (spire field) `crch` (crouch tunnels) `turr` (firing line)
`up` / `down` (vertical shafts over spike floors) `red` (watcher zone)
`fly` `slsh` (bladeworks) `gaunt` (spike teeth) `climb` (the ascent)
`holes` (the drop)

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

- top speed 330 px/s, single jump lifts the feet 120px and carries 195px
- double jump lifts the feet 228px and carries 327px
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
