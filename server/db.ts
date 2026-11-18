import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Mode, Submission } from './scores.ts';

export interface BoardEntry {
  rank: number;
  name: string;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  /** When this best score was set, ISO 8601 */
  at: string;
}

/**
 * Schema changes, applied in order. PRAGMA user_version remembers how many have run, so add new
 * steps at the end and never edit one that has shipped.
 */
const MIGRATIONS = [
  `CREATE TABLE score (
     id          INTEGER PRIMARY KEY,
     mode        TEXT    NOT NULL CHECK (mode IN ('cut', 'stack')),
     name        TEXT    NOT NULL,
     score       INTEGER NOT NULL,
     lines       INTEGER NOT NULL,
     level       INTEGER NOT NULL,
     pieces      INTEGER NOT NULL,
     duration_ms INTEGER NOT NULL,
     created_at  INTEGER NOT NULL -- unix ms
   );
   CREATE INDEX score_by_mode_score ON score (mode, score DESC);
   CREATE INDEX score_by_mode_time  ON score (mode, created_at);
   CREATE INDEX score_by_mode_name  ON score (mode, name, score DESC);`,
];

export class ScoreDb {
  readonly sql: DatabaseSync;

  /** `file` is a path, or `:memory:` for tests. */
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.sql = new DatabaseSync(file);
    this.sql.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate() {
    const { user_version: done } = this.sql.prepare('PRAGMA user_version').get() as { user_version: number };
    for (let i = done; i < MIGRATIONS.length; i++) {
      this.sql.exec('BEGIN');
      try {
        this.sql.exec(MIGRATIONS[i]);
        this.sql.exec(`PRAGMA user_version = ${i + 1}`);
        this.sql.exec('COMMIT');
      } catch (e) {
        this.sql.exec('ROLLBACK');
        throw e;
      }
    }
  }

  add(s: Submission, at: Date): number {
    const r = this.sql
      .prepare(
        `INSERT INTO score (mode, name, score, lines, level, pieces, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(s.mode, s.name, s.score, s.lines, s.level, s.pieces, s.durationMs, at.getTime());
    return Number(r.lastInsertRowid);
  }

  /**
   * One row per player: their best score since `since` (or ever), highest first.
   * Equal scores: whoever got there first ranks higher.
   */
  board(mode: Mode, since: Date | null, limit: number): BoardEntry[] {
    const rows = this.sql
      .prepare(
        `SELECT name, score, lines, level, pieces, created_at FROM (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY name ORDER BY score DESC, created_at ASC, id ASC) AS n
           FROM score WHERE mode = ? AND created_at >= ?
         ) WHERE n = 1
         ORDER BY score DESC, created_at ASC, name ASC
         LIMIT ?`,
      )
      .all(mode, since?.getTime() ?? 0, limit) as {
      name: string;
      score: number;
      lines: number;
      level: number;
      pieces: number;
      created_at: number;
    }[];
    return rows.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      score: r.score,
      lines: r.lines,
      level: r.level,
      pieces: r.pieces,
      at: new Date(r.created_at).toISOString(),
    }));
  }

  /** A player's place on a board: 1 + the players with a higher best. Null if they have no score there. */
  rank(mode: Mode, name: string, since: Date | null): number | null {
    const from = since?.getTime() ?? 0;
    const mine = this.sql
      .prepare('SELECT MAX(score) AS best FROM score WHERE mode = ? AND name = ? AND created_at >= ?')
      .get(mode, name, from) as { best: number | null };
    if (mine.best === null) return null;
    const above = this.sql
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT MAX(score) AS best FROM score WHERE mode = ? AND created_at >= ? GROUP BY name
         ) WHERE best > ?`,
      )
      .get(mode, from, mine.best) as { n: number };
    return above.n + 1;
  }

  /** Every score a name has, newest first (for the admin script). */
  byName(name: string) {
    return this.sql
      .prepare('SELECT id, mode, name, score, lines, created_at FROM score WHERE name = ? ORDER BY created_at DESC')
      .all(name);
  }

  recent(limit: number) {
    return this.sql
      .prepare('SELECT id, mode, name, score, lines, pieces, duration_ms, created_at FROM score ORDER BY id DESC LIMIT ?')
      .all(limit);
  }

  remove(id: number): boolean {
    return Number(this.sql.prepare('DELETE FROM score WHERE id = ?').run(id).changes) > 0;
  }

  removeName(name: string): number {
    return Number(this.sql.prepare('DELETE FROM score WHERE name = ?').run(name).changes);
  }

  /** A consistent copy of the database while it is in use. */
  backup(to: string) {
    this.sql.prepare('VACUUM INTO ?').run(to);
  }

  ping(): boolean {
    return (this.sql.prepare('SELECT 1 AS ok').get() as { ok: number }).ok === 1;
  }

  close() {
    this.sql.close();
  }
}
