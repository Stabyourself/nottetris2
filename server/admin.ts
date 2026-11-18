// Leaderboard housekeeping from the command line. In Docker:
//
//   docker exec slicefall node server/admin.ts recent [n]        latest scores, with ids
//   docker exec slicefall node server/admin.ts name <NAME>       every score of one player
//   docker exec slicefall node server/admin.ts delete <id>       remove one score
//   docker exec slicefall node server/admin.ts delete-name <NAME> remove all of a player's scores
//   docker exec slicefall node server/admin.ts backup <file>     consistent copy, e.g. /data/backup.db

import { ScoreDb } from './db.ts';
import { normalizeName } from './scores.ts';

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

switch (cmd) {
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
    console.log('usage: node server/admin.ts recent [n] | name <NAME> | delete <id> | delete-name <NAME> | backup <file>');
    process.exitCode = 1;
}
db.close();
