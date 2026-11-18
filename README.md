# Slicefall

A browser port of the gameplay from [Not Tetris 2](https://github.com/Stabyourself/nottetris2)
by Maurice Guégan (MIT). Pieces are real rigid bodies: you push and spin them with forces, they
tumble and stack, and a row is sliced straight through the pieces once it holds enough area.

The rules and tuning are carried over from the original Lua source; the presentation (name,
visuals, sound, music) is new. No assets from the original are used.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

`npm run build` writes a static build to `dist/` (`npm run preview` serves it locally).

## Modes

| Mode   | Original | Rules |
| ------ | -------- | ----- |
| Cut    | Game A   | Endless. A row is cut out when it holds 8.1 blocks' worth of area. Score = `ceil((n·3)^(avg^10)·20 + n²·40)` for `n` rows at average density `avg`. Level up every 10 rows (+7 px/s fall speed). |
| Stack  | Game B   | No clearing. 100 points per piece stacked before topping out. |
| Versus | 2P       | Two Stack fields side by side, same piece sequence (mirrored for player 1). Both play until they top out; more pieces wins. |

## Controls

| Action        | 1 player              | Versus P1 | Versus P2           |
| ------------- | --------------------- | --------- | ------------------- |
| Move          | ← → or A D            | A D       | J L or ← →          |
| Push down     | ↓ or S                | S         | K or ↓              |
| Rotate left   | Z                     | Q         | U or ,              |
| Rotate right  | X                     | E         | O or .              |

Hotkeys (all modes):

| Key              | Does |
| ---------------- | ---- |
| P / Esc / Enter  | Pause (or click the Pause button under the next-piece box) |
| P / Esc          | Resume, while paused |
| R                | Restart, while paused |
| O                | Options, while paused |
| Q                | Quit to the mode menu, while paused |
| M                | Mute / unmute all sound |
| F                | Fullscreen |

Gamepads work too (d-pad/stick to move, A/RB rotate right, B/X/LB rotate left, Start pauses;
in Versus, pad 1 is player 1 and pad 2 is player 2). Touch devices get on-screen buttons.

## How the port maps to the original

| File               | Ported from | What it does |
| ------------------ | ----------- | ------------ |
| `src/config.ts`    | `main.lua` constants | Forces, torque, damping, friction, thresholds, timings. LÖVE's 30 px/m scale is kept. |
| `src/field.ts`     | `gameA.lua`, `gameB.lua`, `gameBmulti.lua` | One playfield: planck.js world, walls, spawning, controls, landing detection, row density, cutting, scoring, levels, fall-out on game over. |
| `src/geometry.ts`  | `refineshape`, `shrinkpolygon`, `largeenough`, `settetrimass` | Polygon clipping, area, Box2D-style mass properties, sliver rejection. |
| `src/pieces.ts`    | `newtetrishapes` | Piece layouts (four 32 px squares each). |
| `src/games.ts`     | — | Single-player and Versus game flow plus the HUD. |
| `src/demo.ts`      | — | Self-playing field behind the title screen. |
| `src/audio.ts`     | — | Synthesised sound effects and two original music loops (WebAudio). |

Physics uses [planck.js](https://github.com/piqnt/planck.js), a JavaScript rewrite of Box2D,
the same engine LÖVE wraps. The simulation runs at a fixed 60 Hz step so it behaves the same
on any refresh rate.

High scores and settings are stored in the browser's `localStorage`.
