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

Touch controls appear automatically on touch devices.

## Rules

- Spikes, enemies and bullets kill instantly. There is no health bar.
- **Watcher zones** are red-light/green-light. Inside one, moving while the eye
  is red kills you. The amber phase is your warning to come to a complete stop -
  you slide for about a tenth of a second after releasing, so stop early.
- A storm eats the world behind you. It pauses while a watcher holds you frozen.
- Score is distance in metres; the top ten runs are kept in `localStorage`.

## Level generation

The world is streamed in segments about 2600px ahead of the player and pruned
behind. Eleven segment types are drawn from a difficulty-weighted pool, with a
flat breather inserted after most hard segments:

`flat` `gaps` `pill` (spire field) `crch` (crouch tunnels) `turr` (firing line)
`up` / `down` (vertical shafts over spike floors) `red` (watcher zone)
`fly` `slsh` (bladeworks) `gaunt` (spike teeth)

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
