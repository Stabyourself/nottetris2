// Rules for what a score submission or a game-log record may look like. Shared by the HTTP layer
// and the tests.
//
// Players are identified by name only, like an arcade cabinet: the same name is the same player.
// Names are stored upper-cased, so "ann" and "ANN" are one player.

/** Cut is the only scored game for now; the mode field stays so others can be added back. */
export const MODES = ['cut'] as const;
export type Mode = (typeof MODES)[number];

export const NAME_MAX = 10;

/** Rows one cut can take at most: the whole field. */
export const ROWS = 18;

/** What every finished game reports, whether or not it goes on the leaderboard. */
export interface GameStats {
  mode: Mode;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  durationMs: number;
}

/** One finished game for the game log (POST /api/games). */
export interface GameRecord extends GameStats {
  /** How many times rows were cut */
  cuts: number;
  /** Most rows taken by a single cut */
  bestCut: number;
}

/** A leaderboard entry (POST /api/scores). */
export interface Submission extends GameStats {
  name: string;
  /** The game-log row this score came from, so that row gets the player's name too */
  gameId?: number;
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Letters of any script, digits, spaces and a little punctuation. No emoji or combining marks. */
const NAME_CHARS = /^[\p{L}\p{N} .\-_!?']+$/u;

/** Trims, squeezes spaces and upper-cases. Returns null when nothing usable is left. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!name || [...name].length > NAME_MAX || !NAME_CHARS.test(name)) return null;
  return name;
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Checks game numbers against what the game can actually produce. This stops typos and the
 * laziest fakes, not a determined cheat: the browser is trusted with the numbers.
 *
 * - Cut: points only come from cutting rows, so no rows means no points. The level is lines / 10.
 *   A cut of n rows pays ceil((3n)^(avg^10)·20 + 40n²) where avg is how full the rows were
 *   (0.81–1). Even 18 rows at once stays under 1000 per row.
 *   Every cut row took at least 8 blocks, and a piece is 4 blocks, so pieces ≥ 2 × lines.
 * - A piece needs a moment to fall and land: at least 0.2 s each.
 */
function checkStats(b: Record<string, unknown>): Checked<GameStats> {
  if (!MODES.includes(b.mode as Mode)) return { ok: false, error: 'mode must be "cut"' };
  const mode = b.mode as Mode;

  const { score, lines, level, pieces, durationMs } = b;
  if (!isInt(score, 0, 100_000_000)) return { ok: false, error: 'score must be a whole number' };
  if (!isInt(lines, 0, 100_000) || !isInt(level, 0, 10_000) || !isInt(pieces, 0, 1_000_000)) {
    return { ok: false, error: 'lines, level and pieces must be whole numbers' };
  }
  if (!isInt(durationMs, 0, 24 * 3600 * 1000)) return { ok: false, error: 'durationMs out of range' };

  if (level !== Math.floor(lines / 10)) return { ok: false, error: 'level does not match lines' };
  if ((score === 0) !== (lines === 0) || score > lines * 1000 || pieces < lines * 2) {
    return { ok: false, error: 'not a possible Cut result' };
  }
  if (durationMs < pieces * 200) return { ok: false, error: 'game too short for that many pieces' };

  return { ok: true, value: { mode, score, lines, level, pieces, durationMs } };
}

/** A score for the leaderboard: a game that cut at least one row, plus a valid name. */
export function validate(body: unknown): Checked<Submission> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'expected a JSON object' };
  const b = body as Record<string, unknown>;

  if (!MODES.includes(b.mode as Mode)) return { ok: false, error: 'mode must be "cut"' };
  const name = normalizeName(b.name);
  if (!name) return { ok: false, error: `name: 1–${NAME_MAX} letters, digits, spaces or . - _ ! ? '` };
  if (!isInt(b.score, 1, 100_000_000)) return { ok: false, error: 'score must be a positive whole number' };
  if (b.gameId !== undefined && !isInt(b.gameId, 1, Number.MAX_SAFE_INTEGER)) {
    return { ok: false, error: 'gameId must be a positive whole number' };
  }

  const stats = checkStats(b);
  if (!stats.ok) return stats;
  const value: Submission = { ...stats.value, name };
  if (b.gameId !== undefined) value.gameId = b.gameId as number;
  return { ok: true, value };
}

/**
 * A finished game for the game log, scored or not. Every cut takes 1–18 rows, so the cuts have to
 * add up to the lines: at least bestCut + one row for each other cut, at most bestCut per cut.
 */
export function validateGame(body: unknown): Checked<GameRecord> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'expected a JSON object' };
  const b = body as Record<string, unknown>;

  const stats = checkStats(b);
  if (!stats.ok) return stats;
  const { lines } = stats.value;

  const { cuts, bestCut } = b;
  if (!isInt(cuts, 0, 100_000) || !isInt(bestCut, 0, ROWS)) {
    return { ok: false, error: `cuts must be a whole number and bestCut 0–${ROWS}` };
  }
  const fits = cuts === 0 ? lines === 0 && bestCut === 0 : bestCut >= 1 && bestCut + cuts - 1 <= lines && cuts * bestCut >= lines;
  if (!fits) return { ok: false, error: 'cuts and bestCut do not match lines' };

  return { ok: true, value: { ...stats.value, cuts, bestCut } };
}

/** Start of the current leaderboard week: Monday 00:00 UTC. */
export function weekStart(now: Date): Date {
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
}
