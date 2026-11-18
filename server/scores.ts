// Rules for what a score submission may look like. Shared by the HTTP layer and the tests.
//
// Players are identified by name only, like an arcade cabinet: the same name is the same player.
// Names are stored upper-cased, so "ann" and "ANN" are one player.

/** Cut is the only scored game for now; the mode field stays so others can be added back. */
export const MODES = ['cut'] as const;
export type Mode = (typeof MODES)[number];

export const NAME_MAX = 10;

export interface Submission {
  mode: Mode;
  name: string;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  durationMs: number;
}

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
 * Checks a submission against what the game can actually produce. This stops typos and the
 * laziest fakes, not a determined cheat: the browser is trusted with the numbers.
 *
 * - Cut: the level is lines / 10. A cut of n rows pays ceil((3n)^(avg^10)·20 + 40n²) where avg is
 *   how full the rows were (0.81–1). Even 18 rows at once stays under 1000 per row.
 *   Every cut row took at least 8 blocks, and a piece is 4 blocks, so pieces ≥ 2 × lines.
 * - A piece needs a moment to fall and land: at least 0.2 s each.
 */
export function validate(body: unknown): { ok: true; value: Submission } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'expected a JSON object' };
  const b = body as Record<string, unknown>;

  if (!MODES.includes(b.mode as Mode)) return { ok: false, error: 'mode must be "cut"' };
  const mode = b.mode as Mode;
  const name = normalizeName(b.name);
  if (!name) return { ok: false, error: `name: 1–${NAME_MAX} letters, digits, spaces or . - _ ! ? '` };

  const { score, lines, level, pieces, durationMs } = b;
  if (!isInt(score, 1, 100_000_000)) return { ok: false, error: 'score must be a positive whole number' };
  if (!isInt(lines, 0, 100_000) || !isInt(level, 0, 10_000) || !isInt(pieces, 1, 1_000_000)) {
    return { ok: false, error: 'lines, level and pieces must be whole numbers' };
  }
  if (!isInt(durationMs, 0, 24 * 3600 * 1000)) return { ok: false, error: 'durationMs out of range' };

  if (level !== Math.floor(lines / 10)) return { ok: false, error: 'level does not match lines' };
  if (lines === 0 || score > lines * 1000 || pieces < lines * 2) return { ok: false, error: 'not a possible Cut result' };
  if (durationMs < pieces * 200) return { ok: false, error: 'game too short for that many pieces' };

  return { ok: true, value: { mode, name, score, lines, level, pieces, durationMs } };
}

/** Start of the current leaderboard week: Monday 00:00 UTC. */
export function weekStart(now: Date): Date {
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
}
