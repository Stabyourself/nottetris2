// Talks to the leaderboard server (server/). URLs are relative, so the game works from any path.

/** The only game with a leaderboard. The server keeps a mode column so others can come back later. */
const MODE = 'cut';

export const NAME_MAX = 10;

export interface BoardEntry {
  rank: number;
  name: string;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  at: string;
}

export interface Boards {
  mode: typeof MODE;
  /** Monday 00:00 UTC of the current week */
  weekStart: string;
  week: BoardEntry[];
  allTime: BoardEntry[];
}

export interface Submitted extends Boards {
  name: string;
  weekRank: number | null;
  allTimeRank: number | null;
}

export interface ScoreSubmission {
  name: string;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  durationMs: number;
}

const NAME_CHARS = /^[\p{L}\p{N} .\-_!?']+$/u;

/** Same rules as the server: arcade-style upper case, letters/digits/space and . - _ ! ? ' */
export function normalizeName(raw: string): string | null {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!name || [...name].length > NAME_MAX || !NAME_CHARS.test(name)) return null;
  return name;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal });
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !body) throw new Error(body?.error ?? `HTTP ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchBoards(): Promise<Boards> {
  return call<Boards>(`api/leaderboard?mode=${MODE}`);
}

export function submitScore(s: ScoreSubmission): Promise<Submitted> {
  return call<Submitted>('api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: MODE, ...s }),
  });
}
