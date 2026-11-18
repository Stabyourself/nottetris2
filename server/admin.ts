// Leaderboard housekeeping and play statistics from the command line. In Docker:
//
//   docker exec slicefall node server/admin.ts stats [days]      games played: totals, then per day
//   docker exec slicefall node server/admin.ts games [n]         latest games, named or skipped
//   docker exec slicefall node server/admin.ts recent [n]        latest scores, with ids
//   docker exec slicefall node server/admin.ts name <NAME>       every score of one player
//   docker exec slicefall node server/admin.ts delete <id>       remove one score
//   docker exec slicefall node server/admin.ts delete-name <NAME> remove all of a player's scores
//   docker exec slicefall node server/admin.ts backup <file>     consistent copy, e.g. /data/backup.db

import { ScoreDb } from './db.ts';
import { normalizeName, weekStart } from './scores.ts';

const [cmd, arg] = process.argv.slice(2);
const db = new ScoreDb(process.env.DATABASE_URL || 'data/slicefall.db');

const fmt = (rows: unknown[]) =>
  console.table(
    (rows as { created_at: number }[]).map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })),
  );

const name = () => {
  const n = normalizeName(arg);
  if (!n) throw new Error('give a player name');
  return n;
};

const playTime = (ms: number) => (ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1)} h`);

function stats(days: number) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const periods = { today, 'this week': weekStart(now), 'all time': null };
  console.table(
    Object.fromEntries(
      Object.entries(periods).map(([label, since]) => {
        const t = db.gameTotals(since);
        return [
          label,
          {
            games: t.games,
            submitted: t.named,
            unnamed: t.games - t.named,
            players: t.players,
            lines: t.lines,
            pieces: t.pieces,
            played: playTime(t.playMs),
            'avg score': t.avgScore,
            best: t.best,
          },
        ];
      }),
    ),
  );
  console.log(`Per day, last ${days} days (UTC):`);
  console.table(db.gamesByDay(new Date(today.getTime() - (days - 1) * 86_400_000)));
}

switch (cmd) {
  case 'stats':
    stats(Number(arg) || 14);
    break;
  case 'games':
    fmt(db.recentGames(Number(arg) || 20).map((g) => ({ ...g, name: g.name ?? '(no name)' })));
    break;
  case 'recent':
    fmt(db.recent(Number(arg) || 20));
    break;
  case 'name':
    fmt(db.byName(name()));
    break;
  case 'delete':
    console.log(db.remove(Number(arg)) ? `deleted score ${arg}` : `no score with id ${arg}`);
    break;
  case 'delete-name':
    console.log(`deleted ${db.removeName(name())} scores of ${name()}`);
    break;
  case 'backup':
    if (!arg) throw new Error('give a target file');
    db.backup(arg);
    console.log(`backed up to ${arg}`);
    break;
  default:
    console.log('usage: node server/admin.ts stats [days] | games [n] | recent [n] | name <NAME> | delete <id> | delete-name <NAME> | backup <file>');
    process.exitCode = 1;
}
db.close();
