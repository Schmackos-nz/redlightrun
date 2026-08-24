# REDLIGHT RUN

An infinite side-scrolling platformer for the browser. Run as far as you can;
the score is the distance. No build step - open `index.html`.

## Controls

| Key | Action |
| --- | --- |
| `A` / `D` or arrows | move |
| `SPACE` / `W` / `UP` | jump, press again in mid-air to double jump |
| `S` / `DOWN` | crouch (slide under low ceilings, duck high bullets) |
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

Difficulty ramps over the first 11,000px, then holds.

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
