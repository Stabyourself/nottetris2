// Entry point: serves the built game and the leaderboard API from one process.
//
//   DATABASE_URL    SQLite file (default data/slicefall.db; /data/slicefall.db in Docker)
//   PORT            default 5034
//   STATIC_DIR      the built game, default dist (set it empty to serve the API only)
//   ADDRESS_HEADER  header with the client IP behind a reverse proxy, e.g. x-forwarded-for

import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { ScoreDb } from './db.ts';

const port = Number(process.env.PORT || 5034);
const dbFile = process.env.DATABASE_URL || 'data/slicefall.db';
const staticDir = process.env.STATIC_DIR ?? 'dist';
const serveStatic = staticDir !== '' && existsSync(staticDir);
if (staticDir !== '' && !serveStatic) console.warn(`[slicefall] ${staticDir}/ not found: serving the API only (run npm run build)`);

const db = new ScoreDb(dbFile);
const server = createApp({
  db,
  staticDir: serveStatic ? staticDir : null,
  addressHeader: process.env.ADDRESS_HEADER || undefined,
});

server.listen(port, () => console.log(`[slicefall] listening on http://localhost:${port} (database ${dbFile})`));

// Docker stops containers with SIGTERM; Node as PID 1 would otherwise ignore it.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeAllConnections();
  });
}
