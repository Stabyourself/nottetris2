import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { createApp, rateKey } from './app.ts';
import { ScoreDb } from './db.ts';
import { type GameRecord, normalizeName, type Submission, validate, validateGame, weekStart } from './scores.ts';

const cut = (over: Partial<Submission> = {}): Submission => ({
  mode: 'cut',
  name: 'ANN',
  score: 500,
  lines: 4,
  level: 0,
  pieces: 12,
  durationMs: 60_000,
  ...over,
});

const played = (over: Partial<GameRecord> = {}): GameRecord => ({
  mode: 'cut',
  score: 500,
  lines: 4,
  level: 0,
  pieces: 12,
  cuts: 2,
  bestCut: 3,
  durationMs: 60_000,
  ...over,
});

describe('names', () => {
  test('are trimmed, squeezed and upper-cased', () => {
    assert.equal(normalizeName('  ann   lee '), 'ANN LEE');
    assert.equal(normalizeName('Jüri'), 'JÜRI');
    assert.equal(normalizeName('миша'), 'МИША');
    assert.equal(normalizeName("o'neil-2!"), "O'NEIL-2!");
    assert.equal(normalizeName('tab\there\n'), 'TAB HERE');
  });

  test('reject empty, long and odd input', () => {
    for (const bad of ['', '   ', 'ABCDEFGHIJK', '<script>', 'a😀', 'é́́', 42, null]) {
      assert.equal(normalizeName(bad), null, String(bad));
    }
  });
});

describe('validate', () => {
  test('accepts real-looking results', () => {
    assert.ok(validate(cut()).ok);
    assert.ok(validate(cut({ lines: 25, level: 2, score: 6000, pieces: 60, durationMs: 400_000 })).ok);
  });

  test('rejects impossible results', () => {
    const cases: [string, unknown][] = [
      ['mode', { ...cut(), mode: 'versus' }],
      ['stack is gone', { ...cut(), mode: 'stack', score: 2300, pieces: 23, lines: 0, level: 0 }],
      ['zero score', cut({ score: 0 })],
      ['fractional score', cut({ score: 10.5 })],
      ['level not lines/10', cut({ lines: 12, level: 0 })],
      ['too many points per row', cut({ lines: 2, score: 5000, pieces: 10 })],
      ['too few pieces for the rows', cut({ lines: 10, level: 1, score: 2000, pieces: 15 })],
      ['too fast', cut({ durationMs: 1000 })],
      ['not an object', 'hello'],
    ];
    for (const [why, body] of cases) assert.equal(validate(body).ok, false, why);
  });
});

describe('validate a score with its game', () => {
  test('a gameId is optional and must be a positive whole number', () => {
    const ok = validate({ ...cut(), gameId: 7 });
    assert.ok(ok.ok && ok.value.gameId === 7);
    assert.ok(validate(cut()).ok && !('gameId' in (validate(cut()) as { value: object }).value));
    for (const bad of [0, -1, 1.5, '7', null]) assert.equal(validate({ ...cut(), gameId: bad }).ok, false, String(bad));
  });
});

describe('validateGame', () => {
  test('accepts scored and scoreless games', () => {
    assert.ok(validateGame(played()).ok);
    assert.ok(validateGame(played({ score: 0, lines: 0, cuts: 0, bestCut: 0, pieces: 9, durationMs: 20_000 })).ok);
    assert.ok(validateGame(played({ score: 0, lines: 0, cuts: 0, bestCut: 0, pieces: 0, durationMs: 0 })).ok);
    assert.ok(validateGame(played({ lines: 1, cuts: 1, bestCut: 1, score: 80, pieces: 5 })).ok);
    assert.ok(validateGame(played({ lines: 25, level: 2, score: 6000, pieces: 60, cuts: 10, bestCut: 4, durationMs: 400_000 })).ok);
  });

  test('rejects games the field cannot produce', () => {
    const cases: [string, unknown][] = [
      ['points without rows', played({ lines: 0, cuts: 0, bestCut: 0 })],
      ['rows without points', played({ score: 0 })],
      ['level not lines/10', played({ lines: 12, level: 0, pieces: 30 })],
      ['too few pieces', played({ pieces: 7 })],
      ['too fast', played({ durationMs: 1000 })],
      ['rows without cuts', played({ cuts: 0, bestCut: 0 })],
      ['more cuts than rows', played({ cuts: 5, bestCut: 1 })],
      ['cuts cannot reach the rows', played({ cuts: 1, bestCut: 3 })],
      ['best cut bigger than the rows', played({ lines: 4, cuts: 1, bestCut: 5 })],
      ['best cut bigger than the field', played({ lines: 19, level: 1, pieces: 40, score: 9000, cuts: 1, bestCut: 19 })],
      ['missing cuts', { ...played(), cuts: undefined }],
      ['mode', { ...played(), mode: 'versus' }],
      ['not an object', 42],
    ];
    for (const [why, body] of cases) assert.equal(validateGame(body).ok, false, why);
  });
});

describe('game log', () => {
  const at = new Date('2026-11-18T12:00:00Z');
  const game = (db: ScoreDb, id: number) => db.sql.prepare('SELECT name, score_id FROM game WHERE id = ?').get(id);

  test('a submitted score names its game; a skipped game stays unnamed', () => {
    const db = new ScoreDb(':memory:');
    const scored = db.addGame(played(), at);
    const skipped = db.addGame(played({ score: 300 }), at);
    const scoreId = db.add(cut({ name: 'ANN', gameId: scored }), at);
    assert.deepEqual({ ...game(db, scored) }, { name: 'ANN', score_id: scoreId });
    assert.deepEqual({ ...game(db, skipped) }, { name: null, score_id: null });
    db.close();
  });

  test("a score can't name a game with other numbers, or one already named", () => {
    const db = new ScoreDb(':memory:');
    const id = db.addGame(played(), at);
    db.add(cut({ name: 'EVE', score: 499, gameId: id }), at);
    assert.equal(game(db, id)!.name, null);
    db.add(cut({ name: 'ANN', gameId: id }), at);
    db.add(cut({ name: 'EVE', gameId: id }), at);
    assert.equal(game(db, id)!.name, 'ANN');
    db.add(cut({ name: 'BOB', gameId: 999 }), at); // no such game: the score still counts
    assert.equal(db.board('cut', null, 10).length, 3);
    db.close();
  });

  test('removing scores keeps the games but drops the link and the name', () => {
    const db = new ScoreDb(':memory:');
    const a = db.addGame(played(), at);
    const b = db.addGame(played(), at);
    db.remove(db.add(cut({ name: 'ANN', gameId: a }), at));
    assert.deepEqual({ ...game(db, a) }, { name: 'ANN', score_id: null });
    db.add(cut({ name: 'BOB', gameId: b }), at);
    assert.equal(db.removeName('BOB'), 1);
    assert.deepEqual({ ...game(db, b) }, { name: null, score_id: null });
    assert.equal(db.gameTotals(null).games, 2);
    db.close();
  });

  test('totals and days', () => {
    const db = new ScoreDb(':memory:');
    assert.deepEqual({ ...db.gameTotals(null) }, { games: 0, named: 0, players: 0, lines: 0, pieces: 0, playMs: 0, best: 0, avgScore: 0 });
    const lastWeek = new Date('2026-11-10T12:00:00Z');
    db.addGame(played({ score: 900, lines: 9, pieces: 30, cuts: 3, bestCut: 3 }), lastWeek);
    const g1 = db.addGame(played(), at);
    const g2 = db.addGame(played({ score: 200 }), at);
    db.addGame(played({ score: 0, lines: 0, cuts: 0, bestCut: 0, pieces: 10 }), at);
    db.add(cut({ name: 'ANN', gameId: g1 }), at);
    db.add(cut({ name: 'ANN', score: 200, gameId: g2 }), at);

    assert.deepEqual(
      { ...db.gameTotals(null) },
      { games: 4, named: 2, players: 1, lines: 17, pieces: 64, playMs: 240_000, best: 900, avgScore: 400 },
    );
    const week = db.gameTotals(weekStart(at));
    assert.equal(week.games, 3);
    assert.equal(week.best, 500);
    assert.deepEqual(
      db.gamesByDay(lastWeek).map((d) => [d.day, d.games, d.named]),
      [
        ['2026-11-18', 3, 2],
        ['2026-11-10', 1, 0],
      ],
    );
    db.close();
  });
});

test('the week starts on Monday 00:00 UTC', () => {
  assert.equal(weekStart(new Date('2026-11-18T15:30:00Z')).toISOString(), '2026-11-16T00:00:00.000Z'); // Wednesday
  assert.equal(weekStart(new Date('2026-11-16T00:00:00Z')).toISOString(), '2026-11-16T00:00:00.000Z'); // Monday
  assert.equal(weekStart(new Date('2026-11-22T23:59:59Z')).toISOString(), '2026-11-16T00:00:00.000Z'); // Sunday
  assert.equal(weekStart(new Date('2027-01-01T12:00:00Z')).toISOString(), '2026-12-28T00:00:00.000Z'); // across a year
});

describe('boards', () => {
  const db = new ScoreDb(':memory:');
  const lastWeek = new Date('2026-11-10T12:00:00Z');
  const thisWeek = new Date('2026-11-17T12:00:00Z');
  const since = weekStart(new Date('2026-11-18T12:00:00Z'));

  before(() => {
    db.add(cut({ name: 'ANN', score: 900 }), lastWeek);
    db.add(cut({ name: 'ANN', score: 300 }), thisWeek);
    db.add(cut({ name: 'BOB', score: 400 }), thisWeek);
    db.add(cut({ name: 'BOB', score: 350 }), thisWeek);
    db.add(cut({ name: 'CY', score: 400 }), new Date(thisWeek.getTime() + 1000));
  });

  test('all time: one row per player, their best, ties to whoever was first', () => {
    const b = db.board('cut', null, 10);
    assert.deepEqual(
      b.map((e) => [e.rank, e.name, e.score]),
      [
        [1, 'ANN', 900],
        [2, 'BOB', 400],
        [3, 'CY', 400],
      ],
    );
  });

  test('this week only counts this week', () => {
    assert.deepEqual(
      db.board('cut', since, 10).map((e) => [e.name, e.score]),
      [
        ['BOB', 400],
        ['CY', 400],
        ['ANN', 300],
      ],
    );
  });

  test('the limit applies', () => {
    assert.equal(db.board('cut', null, 2).length, 2);
  });

  test('rank of a player', () => {
    assert.equal(db.rank('cut', 'ANN', null), 1);
    assert.equal(db.rank('cut', 'ANN', since), 3);
    assert.equal(db.rank('cut', 'CY', since), 1); // tied with BOB: same rank
    assert.equal(db.rank('cut', 'NOBODY', null), null);
  });
});

interface Boards {
  name: string;
  weekRank: number;
  allTimeRank: number;
  weekStart: string;
  week: { name: string; score: number }[];
  allTime: { name: string; score: number }[];
}

test('migrating an old database drops Stack scores and keeps Cut ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nt2-migrate-'));
  try {
    const file = join(dir, 'scores.db');
    // The schema as it shipped with Stack, at user_version 1
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE score (
        id INTEGER PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('cut', 'stack')), name TEXT NOT NULL,
        score INTEGER NOT NULL, lines INTEGER NOT NULL, level INTEGER NOT NULL, pieces INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL, created_at INTEGER NOT NULL);
      INSERT INTO score VALUES (1, 'cut', 'ANN', 500, 4, 0, 12, 60000, 1);
      INSERT INTO score VALUES (2, 'stack', 'BOB', 2300, 0, 0, 23, 60000, 2);
      INSERT INTO score VALUES (3, 'cut', 'CY', 300, 3, 0, 9, 60000, 3);
      PRAGMA user_version = 1;`);
    old.close();

    const db = new ScoreDb(file);
    try {
      assert.deepEqual(
        db.recent(10).map((r) => [r.id, r.mode, r.name]),
        [
          [3, 'cut', 'CY'],
          [1, 'cut', 'ANN'],
        ],
      );
      assert.throws(() => db.sql.exec(`INSERT INTO score VALUES (4, 'stack', 'DEE', 100, 0, 0, 1, 1000, 4)`), /CHECK/);
      const indexes = db.sql.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'score' ORDER BY name`).all();
      assert.deepEqual(
        indexes.map((r) => r.name),
        ['score_by_mode_name', 'score_by_mode_score', 'score_by_mode_time'],
      );
      assert.equal(db.add(cut({ name: 'EVE' }), new Date(5)), 4); // ids carry on
      assert.equal(db.gameTotals(null).games, 0); // the game log starts empty
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('http', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slicefall-test-'));
  const db = new ScoreDb(':memory:');
  let base = '';
  let server: ReturnType<typeof createApp>;

  before(async () => {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Slicefall</title>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1);'.repeat(200));
    server = createApp({
      db,
      staticDir: dir,
      addressHeader: 'x-forwarded-for',
      rateLimit: { max: 3, windowMs: 60_000 },
      gameRateLimit: { max: 4, windowMs: 60_000 },
      now: () => new Date('2026-11-18T12:00:00Z'),
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (body: unknown, ip = '10.0.0.1') =>
    fetch(`${base}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `1.2.3.4, ${ip}` },
      body: JSON.stringify(body),
    });

  const postGame = (body: unknown, ip = '10.0.0.1') =>
    fetch(`${base}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `1.2.3.4, ${ip}` },
      body: JSON.stringify(body),
    });

  test('health check', async () => {
    const r = await fetch(`${base}/healthz`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'ok');
  });

  test('serves the game, with long caching only for hashed assets', async () => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type')!, /text\/html/);
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    // Framable only by itch.io (itch/index.html), nowhere else
    assert.match(
      page.headers.get('content-security-policy')!,
      /frame-ancestors https:\/\/itch\.io https:\/\/\*\.itch\.io https:\/\/\*\.itch\.zone(;|$)/,
    );

    const js = await fetch(`${base}/assets/app-abc123.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('cache-control')!, /immutable/);

    assert.equal((await fetch(`${base}/nope.js`)).status, 404);
    assert.equal((await fetch(`${base}/assets/../../etc/passwd`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
  });

  test('gzips text when the client accepts it', async () => {
    const { request } = await import('node:http');
    const res = await new Promise<import('node:http').IncomingMessage>((resolve) =>
      request(`${base}/assets/app-abc123.js`, { headers: { 'Accept-Encoding': 'gzip' } }, resolve).end(),
    );
    assert.equal(res.headers['content-encoding'], 'gzip');
    const chunks: Buffer[] = [];
    for await (const c of res) chunks.push(c as Buffer);
    assert.equal(gunzipSync(Buffer.concat(chunks)).toString(), 'console.log(1);'.repeat(200));
  });

  test('a score goes in and comes back on both boards', async () => {
    const r = await post({ ...cut(), name: ' zed ' });
    assert.equal(r.status, 201);
    const body = (await r.json()) as Boards;
    assert.equal(body.name, 'ZED');
    assert.equal(body.weekRank, 1);
    assert.equal(body.allTimeRank, 1);
    assert.equal(body.week[0].name, 'ZED');
    assert.equal(body.allTime[0].score, 500);
    assert.equal(body.weekStart, '2026-11-16T00:00:00.000Z');

    const board = (await (await fetch(`${base}/api/leaderboard?mode=cut`)).json()) as Boards;
    assert.equal(board.week[0].name, 'ZED');
    assert.equal((await fetch(`${base}/api/leaderboard?mode=stack`)).status, 400);
  });

  test('every game is logged, and a submitted score names its game', async () => {
    const skipped = await postGame({ ...played(), score: 0, lines: 0, cuts: 0, bestCut: 0 }, '10.1.1.1');
    assert.equal(skipped.status, 201);
    const skippedId = ((await skipped.json()) as { id: number }).id;

    const r = await postGame(played(), '10.1.1.1');
    assert.equal(r.status, 201);
    const { id } = (await r.json()) as { id: number };
    assert.ok(id > skippedId);

    assert.equal((await post({ ...cut(), name: 'logged', gameId: id }, '10.1.1.1')).status, 201);
    const rows = db.sql.prepare('SELECT id, name FROM game WHERE id IN (?, ?) ORDER BY id').all(skippedId, id);
    assert.deepEqual(
      rows.map((g) => [g.id, g.name]),
      [
        [skippedId, null],
        [id, 'LOGGED'],
      ],
    );
  });

  test('bad game records are refused', async () => {
    assert.equal((await postGame(played({ cuts: 0 }))).status, 400);
    assert.equal((await postGame({ ...played(), mode: 'stack' })).status, 400);
    assert.equal((await post({ ...cut(), gameId: 'x' })).status, 400);
    assert.equal((await fetch(`${base}/api/games`)).status, 405);
    assert.equal((await fetch(`${base}/api/games`, { method: 'POST', body: '{}' })).status, 415);
    const broken = await fetch(`${base}/api/games`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(broken.status, 400);
  });

  test('too many games from one address are refused, apart from the score limit', async () => {
    const ip = '10.7.7.7';
    for (let i = 0; i < 4; i++) assert.equal((await postGame(played(), ip)).status, 201);
    assert.equal((await postGame(played(), ip)).status, 429);
    assert.equal((await post(cut({ name: 'STILL' }), ip)).status, 201);
  });

  test('bad requests are refused', async () => {
    assert.equal((await post({ ...cut(), score: 99999999 })).status, 400);
    assert.equal((await fetch(`${base}/api/leaderboard?mode=versus`)).status, 400);
    assert.equal((await fetch(`${base}/api/scores`)).status, 405);
    const notJson = await fetch(`${base}/api/scores`, { method: 'POST', body: 'name=x' });
    assert.equal(notJson.status, 415);
    const huge = await fetch(`${base}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cut(), pad: 'x'.repeat(5000) }),
    });
    assert.equal(huge.status, 413);
    assert.equal((await fetch(`${base}/api/nothing`)).status, 404);
  });

  test('too many scores from one address are refused', async () => {
    const ip = '10.9.9.9';
    for (let i = 0; i < 3; i++) assert.equal((await post(cut({ name: `R${i}` }), ip)).status, 201);
    assert.equal((await post(cut({ name: 'R9' }), ip)).status, 429);
    assert.equal((await post(cut({ name: 'OTHER' }), '10.8.8.8')).status, 201);
  });

  test('IPv6 addresses in one /64 share a limit', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await post(cut({ name: `S${i}` }), `2001:db8:1:2::${i + 1}`)).status, 201);
    assert.equal((await post(cut({ name: 'S9' }), '2001:db8:1:2:ffff:ffff:ffff:ffff')).status, 429);
    assert.equal((await post(cut({ name: 'NEXT' }), '2001:db8:1:3::1')).status, 201);
  });
});

describe('rate key', () => {
  test('IPv4 as is, IPv6 by /64', () => {
    assert.equal(rateKey('203.0.113.7'), '203.0.113.7');
    assert.equal(rateKey('::ffff:203.0.113.7'), '203.0.113.7');
    assert.equal(rateKey('2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
    assert.equal(rateKey('2001:db8:1:2::1'), '2001:db8:1:2::/64');
    assert.equal(rateKey('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(rateKey('fe80::1%eth0'), 'fe80:0:0:0::/64');
    assert.equal(rateKey('::1'), '0:0:0:0::/64');
    assert.equal(rateKey('64:ff9b::192.0.2.1'), '64:ff9b:0:0::/64');
  });
});
