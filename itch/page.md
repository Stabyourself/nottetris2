# itch.io page

What to fill in on the itch.io project page. Images are in [`screenshots/`](screenshots/); the
description is also in [`description.html`](description.html): open it in a browser, select all,
copy and paste into itch's description editor to keep the formatting.

## Fields

| Field | Value |
| ----- | ----- |
| Title | Slicefall |
| Short description or tagline | Falling blocks with real physics. Pack a row full enough and it gets sliced straight out. |
| Classification | Games |
| Kind of project | HTML (upload `slicefall-itch.zip`, tick "This file will be played in the browser") |
| Release status | Released |
| Pricing | No payments (or $0 or donate) |
| Embed options | Embed in page, viewport 940 × 640, Mobile friendly on (orientation: default), Fullscreen button on. itch's default 640 × 360 works too, but the game is taller than wide and shows at about half size there. |
| Cover image | `screenshots/cover.png` (630 × 500 shape, 2× resolution) |
| Screenshots | `screenshots/1-cut.png`, `2-slice.png`, `3-versus.png`, `4-retro.png`, `5-title.png`, `6-mobile.png` |
| Gameplay GIF | `screenshots/gameplay.gif`, inserted at the top of the description (image button in the editor) |
| Genre | Puzzle |
| Tags | physics, puzzle, arcade, falling-blocks, score-attack, local-multiplayer, retro, singleplayer, 2d, casual |
| Inputs | Keyboard, Mouse, Gamepad (any), Touchscreen |
| Multiplayer | Local multiplayer, 2 players, Shared/Split screen |
| Average session | A few minutes |
| Languages | English |

Keep "Tetris" out of the title and tags: it's a trademark. Naming it in the credits, as below, is
fine.

## Description

Pieces don't snap to a grid here. Every block is a real rigid body: you push it and spin it with
forces, and it tumbles, wedges and topples onto the pile. Once a row holds enough area it is
sliced straight out, cutting right through whatever pieces are in the way, and the leftover
fragments drop into the gap.

### How to play

- Steer the falling piece with forces: nudge it sideways, push it down, spin it. It keeps its momentum.
- The gauge beside the well shows how full each row is. Fill one to 8.1 blocks' worth of area and it's cut out.
- Tighter rows score more, and clearing several at once scores much more.
- Every 10 rows the pieces fall faster. The game ends when the stack reaches the top.

### Modes

- **Cut**: endless single player. Enter a name at the end to post your score to the online
  leaderboard, with a weekly and an all-time board.
- **Versus**: two players on one keyboard, or two gamepads. Same pieces for both, mirrored for
  player 1. When both have topped out, the higher score wins.

### Controls

- **Move**: ← → or A D
- **Push down**: ↓ or S
- **Rotate**: Z and X
- **Pause**: P or Esc · **Mute**: M · **Fullscreen**: F
- **Versus**: player 1 uses A D, S and Q E; player 2 uses J L, K and U O (or ← → ↓ and , .)
- Gamepads work (d-pad or stick, A/B to rotate, Start to pause), and phones and tablets get
  on-screen buttons.

### Also

- A Retro look in Options → Graphics: four greys, pixel-art blocks and brick walls.
- Two original music tracks; all sound is synthesised as you play.
- Settings and your personal top 5 are saved in your browser.

### Credits

The gameplay is ported from [Not Tetris 2](https://github.com/Stabyourself/nottetris2) by Maurice
Guégan: its rules and tuning are carried over from the original source. Everything
you see and hear is new: the graphics are drawn in code and the music and sound are synthesised
at runtime. Physics by [planck.js](https://github.com/piqnt/planck.js).

Not Tetris 2 is itself a physics take on Tetris, which Alexey Pajitnov created in 1984. Tetris is
a trademark of The Tetris Company; Slicefall is not affiliated with or endorsed by it.
