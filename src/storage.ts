export type GameMode = 'cut' | 'versus';
const GAME_MODES: GameMode[] = ['cut', 'versus'];
export type ThemeName = 'modern' | 'retro';

export interface Settings {
  sfx: number; // 0..1
  music: number; // 0..1
  track: number; // index into TRACKS, or -1 for off
  mode: GameMode;
  muted: boolean;
  /** Look of the game: the default, or the monochrome LCD one */
  theme: ThemeName;
  /** Last name entered for the leaderboard, offered again next time */
  name: string;
}

export interface ScoreEntry {
  name: string;
  score: number;
}

const SETTINGS_KEY = 'slicefall.settings.v1';
const SCORES_KEY = 'slicefall.scores.v1';
export const TABLE_SIZE = 5;

const DEFAULT_SETTINGS: Settings = { sfx: 0.8, music: 0.6, track: 0, mode: 'cut', muted: false, theme: 'modern', name: '' };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode etc.) - settings just won't persist */
  }
}

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
  // A mode that no longer exists (Stack) falls back to the default
  if (!GAME_MODES.includes(s.mode)) s.mode = DEFAULT_SETTINGS.mode;
  return s;
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}

/** Stored as { cut: [...] }; older saves may also carry a Stack table, which is dropped on the next write. */
function loadTable(): ScoreEntry[] {
  return read<{ cut?: ScoreEntry[] }>(SCORES_KEY)?.cut ?? [];
}

export function highScores(): ScoreEntry[] {
  return loadTable().slice(0, TABLE_SIZE);
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false;
  const t = highScores();
  return t.length < TABLE_SIZE || score > t[t.length - 1].score;
}

export function addHighScore(entry: ScoreEntry): number {
  const t = loadTable();
  t.push(entry);
  t.sort((a, b) => b.score - a.score);
  const cut = t.slice(0, TABLE_SIZE);
  write(SCORES_KEY, { cut });
  return cut.indexOf(entry);
}
