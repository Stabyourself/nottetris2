import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { createApp } from './app.ts';
import { ScoreDb } from './db.ts';
import { normalizeName, type Submission, validate, weekStart } from './scores.ts';

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
    assert.ok(validate({ ...cut(), mode: 'stack', score: 2300, pieces: 23, lines: 0, level: 0 }).ok);
    assert.ok(validate(cut({ lines: 25, level: 2, score: 6000, pieces: 60, durationMs: 400_000 })).ok);
  });

  test('rejects impossible results', () => {
    const cases: [string, unknown][] = [
      ['mode', { ...cut(), mode: 'versus' }],
      ['zero score', cut({ score: 0 })],
      ['fractional score', cut({ score: 10.5 })],
      ['level not lines/10', cut({ lines: 12, level: 0 })],
      ['too many points per row', cut({ lines: 2, score: 5000, pieces: 10 })],
      ['too few pieces for the rows', cut({ lines: 10, level: 1, score: 2000, pieces: 15 })],
      ['too fast', cut({ durationMs: 1000 })],
      ['stack score not pieces x 100', { ...cut(), mode: 'stack', score: 2350, pieces: 23, lines: 0, level: 0 }],
      ['not an object', 'hello'],
    ];
    for (const [why, body] of cases) assert.equal(validate(body).ok, false, why);
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
    db.add({ ...cut({ name: 'DEE' }), mode: 'stack', score: 9900, pieces: 99, lines: 0 }, thisWeek);
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

  test('modes are separate and the limit applies', () => {
    assert.deepEqual(
      db.board('stack', null, 10).map((e) => e.name),
      ['DEE'],
    );
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
    assert.ok(page.headers.get('content-security-policy'));

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
    const stack = (await (await fetch(`${base}/api/leaderboard?mode=stack`)).json()) as Boards;
    assert.deepEqual(stack.week, []);
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
});
