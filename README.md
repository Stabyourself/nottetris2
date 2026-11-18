# Slicefall

A browser port of the gameplay from [Not Tetris 2](https://github.com/Stabyourself/nottetris2)
by Maurice Guégan (MIT). Pieces are real rigid bodies: you push and spin them with forces, they
tumble and stack, and a row is sliced straight through the pieces once it holds enough area.

The rules and tuning are carried over from the original Lua source; the presentation (name,
visuals, sound, music) is new. No assets from the original are used.

Not Tetris 2 is itself a physics take on Tetris, which Alexey Pajitnov created in 1984. Tetris is a
trademark of The Tetris Company; neither project is affiliated with or endorsed by it.

## Run it

Needs Node 24 or newer.

```bash
npm install
npm run dev       # the game, with hot reload
npm run server    # in a second terminal: the leaderboard API on :5034
```

Open the URL Vite prints (default http://localhost:5173). Vite forwards `/api` to the server; without
it the game still plays and shows only the scores kept in the browser.

| Script              | What it does |
| ------------------- | ------------ |
| `npm run build`     | Typecheck and build the game into `dist/` |
| `npm start`         | Serve `dist/` and the API from one process, as in production (http://localhost:5034) |
| `npm test`          | Server tests (`node:test`) |
| `npm run typecheck` | Typecheck the game and the server |

Settings come from `.env` if it exists (see `.env.example`). Nothing secret is needed.

## Leaderboard

After a Cut game you enter a name and the score goes to the server. Names are the only
identity, like an arcade cabinet: the same name is the same player, upper-cased, so `ann` and `ANN`
are one player. Each board lists every player's best score:

- **This week**: since Monday 00:00 UTC
- **All time**

The server keeps the scores in SQLite (`data/slicefall.db`, `/data/slicefall.db` in Docker), using
Node's built-in `node:sqlite`, so it has no npm dependencies at all. It checks that a score is one
the game could produce (points per row, level and pieces must match the rows, a minimum time per
piece) and allows 30 submissions per IP per 10 minutes. That stops typos
and casual fakes, but the browser reports the score, so a determined cheat can still post a
believable one. Remove those by hand:

```sh
docker exec slicefall node server/admin.ts recent 20          # latest scores with their ids
docker exec slicefall node server/admin.ts name ANN           # every score of one player
docker exec slicefall node server/admin.ts delete 42          # one score
docker exec slicefall node server/admin.ts delete-name ANN    # all of a player's scores
```

| Endpoint                                  | Returns |
| ----------------------------------------- | ------- |
| `GET /api/leaderboard?mode=cut`           | `{ weekStart, week: [...], allTime: [...] }`, top 10 each |
| `POST /api/scores`                        | Takes `{ mode, name, score, lines, level, pieces, durationMs }`; returns the boards plus `weekRank` and `allTimeRank` |
| `GET /healthz`                            | `ok` when the database answers |

## Deployment

One Docker container serves the game and the API. Shipping works the same way as queesti.

Pushing to `master` runs `.github/workflows/deploy.yml`:

1. **check**: typecheck and tests. This also runs on pull requests.
2. **image**: builds the Docker image and pushes `ghcr.io/gdainti/nottetris2-web:latest` and
   `:sha-<commit>`. Pull requests only build it.
3. **deploy**: calls the deployment webhook. The server runs `/opt/docker/slicefall/deploy.sh`,
   which pulls the image, restarts the container and waits until it is healthy.

Actions are pinned to commit SHAs and the base image to a digest; Dependabot
(`.github/dependabot.yml`) opens a PR when either has an update.

The container joins the external `internet-grid` network, so Nginx Proxy Manager reaches it as
`slicefall:5034`. No port is published on the host. It runs as a non-root user with a read-only
filesystem and no Linux capabilities; only `/data` and `/tmp` are writable.

### One-time setup

**GitHub** (repo → Settings → Environments → `production`): under "Deployment branches and tags"
allow only `master`, then add:

| Name             | Type     | Value                                    |
| ---------------- | -------- | ---------------------------------------- |
| `WEBHOOK_URL`    | secret   | URL of the slicefall hook on the server  |
| `WEBHOOK_SECRET` | secret   | token the hook checks                    |
| `APP_URL`        | variable | optional, the game's public URL          |

As environment secrets, only the deploy job on `master` can read them.

**Server:**

```sh
mkdir -p /opt/docker/slicefall && cd /opt/docker/slicefall
# copy compose.yaml and deploy.sh from the repo here (chmod +x deploy.sh)
cp .env.example .env   # or an empty .env: the defaults are fine
docker login ghcr.io   # only if the image is private; a GitHub token with read:packages
```

Point the webhook receiver's slicefall hook at `/opt/docker/slicefall/deploy.sh`. CI does not sync
`compose.yaml` or `deploy.sh`, so copy them to the server again when they change in the repo.

Everything the app keeps is in `/opt/docker/slicefall/data` (`/data` in the container).

**Nginx Proxy Manager:** add a proxy host for your domain → scheme `http`, host `slicefall`, port
`5034`, with a Let's Encrypt certificate and "Force SSL".

### Manual deploy and rollback

```sh
cd /opt/docker/slicefall
./deploy.sh                    # latest
./deploy.sh sha-<commit>       # a specific (e.g. previous) build
```

### Local Docker test

```sh
docker build -t slicefall .
docker run --rm -p 5034:5034 -v "$PWD/data:/data" slicefall
```

Then open http://localhost:5034.

### Backups

To take a consistent copy of the database while it is running:

```sh
docker exec slicefall node server/admin.ts backup /data/backup.db
```

### itch.io

The itch.io page doesn't host a copy of the game. [`itch/index.html`](itch/index.html) is a page
with one full-size iframe of https://slicefall.gdainti.com, so itch always shows the deployed
version and the online leaderboard works. The server's `frame-ancestors` lets only itch.io's
domains frame the game.

To make the upload (`index.html` must sit at the root of the zip):

```sh
cd itch && zip -X slicefall-itch.zip index.html
```

On itch.io: Kind of project **HTML**, upload the zip and tick **This file will be played in the
browser**. Embed options: viewport **940 × 640**, **Mobile friendly** and **Fullscreen button** on.
Only re-upload when `itch/index.html` changes; game updates reach itch with each deploy.

The page's text, tags and settings are in [`itch/page.md`](itch/page.md) (and as rich text to paste
into itch's editor in `itch/description.html`); the cover, screenshots and gameplay GIF are in
`itch/screenshots/`.

## Modes

| Mode   | Original | Rules |
| ------ | -------- | ----- |
| Cut    | Game A   | Endless. A row is cut out when it holds 8.1 blocks' worth of area. Score = `ceil((n·3)^(avg^10)·20 + n²·40)` for `n` rows at average density `avg`. Level up every 10 rows (+7 px/s fall speed). |
| Versus | 2P       | Two Cut fields side by side, same piece sequence (mirrored for player 1). Both play until they top out; higher score wins. |

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

Options → Graphics switches between the default look and Retro: four greys, 8×8 pixel-art blocks
with a pattern per piece kind, brick walls round the well, square panels and monospace type.

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
| `src/api.ts`       | — | Calls the leaderboard API. |
| `server/`          | — | Node server: static files, leaderboard API, SQLite (`db.ts`), score checks (`scores.ts`), admin script. Runs as TypeScript directly, since Node strips the types. |

Physics uses [planck.js](https://github.com/piqnt/planck.js), a JavaScript rewrite of Box2D,
the same engine LÖVE wraps. The simulation runs at a fixed 60 Hz step so it behaves the same
on any refresh rate.

Settings, your last leaderboard name and a personal top 5 are stored in the browser's `localStorage`.
