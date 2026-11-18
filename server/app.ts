import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { ScoreDb } from './db.ts';
import { MODES, type Mode, validate, weekStart } from './scores.ts';

export interface AppOptions {
  db: ScoreDb;
  /** The built game (dist/). Null serves the API only, e.g. next to the Vite dev server. */
  staticDir: string | null;
  /** Header holding the client IP when behind a reverse proxy, e.g. "x-forwarded-for". */
  addressHeader?: string;
  /** Score submissions allowed per IP per window. */
  rateLimit?: { max: number; windowMs: number };
  now?: () => Date;
}

const BOARD_SIZE = 10;
const MAX_BODY = 2048;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Only itch.io may frame the game: its page (*.itch.io) holds a frame from *.itch.zone, which holds
// itch/index.html's iframe of this site. frame-ancestors is checked against every one of them.
const FRAME_ANCESTORS = 'https://itch.io https://*.itch.io https://*.itch.zone';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors ${FRAME_ANCESTORS}`,
};

interface StaticFile {
  body: Buffer;
  gzip: Buffer | null;
  type: string;
  cache: string;
}

/** Loads the whole build into memory: it is a few hundred kB and never changes in a running container. */
function loadStatic(dir: string): Map<string, StaticFile> {
  const files = new Map<string, StaticFile>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const path = join(d, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const url = '/' + relative(dir, path).split('\\').join('/');
      const type = TYPES[extname(path)] ?? 'application/octet-stream';
      const body = readFileSync(path);
      const compressible = /^(text\/|application\/(json|manifest)|image\/svg)/.test(type) && body.length > 1024;
      files.set(url, {
        body,
        gzip: compressible ? gzipSync(body, { level: 9 }) : null,
        type,
        // Vite puts a content hash in every file name under assets/, so those never change.
        cache: url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
    }
  };
  walk(dir);
  return files;
}

function send(res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string> = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Length': String(Buffer.byteLength(body)), ...headers });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

function json(res: ServerResponse, status: number, data: unknown) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Who a request counts against for rate limiting. An IPv6 user usually gets a whole /64 and could
 * take a fresh address for every request, so IPv6 addresses count per /64. IPv4 counts as is.
 */
export function rateKey(ip: string): string {
  const addr = ip.replace(/%.*$/, '').toLowerCase();
  if (!addr.includes(':')) return addr;
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  // Expand "::" so the first four groups can be read off. A trailing dotted IPv4 part is two groups.
  const groups = (part: string) => (part ? part.split(':').flatMap((g) => (g.includes('.') ? ['0', '0'] : [g])) : []);
  const [head, tail] = addr.split('::');
  const left = groups(head);
  const right = tail === undefined ? [] : groups(tail);
  const zeros = Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0');
  const prefix = [...left, ...zeros, ...right].slice(0, 4).map((g) => g.replace(/^0+(?=.)/, ''));
  return `${prefix.join(':')}::/64`;
}

/** Sliding-window counter per IP. Old IPs are dropped as the map is used. */
function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (ip: string, now: number): boolean => {
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(ip, recent);
      return false;
    }
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return true;
  };
}

export function createApp(opts: AppOptions): Server {
  const { db, addressHeader } = opts;
  const now = opts.now ?? (() => new Date());
  const files = opts.staticDir ? loadStatic(opts.staticDir) : new Map<string, StaticFile>();
  const limit = rateLimiter(opts.rateLimit?.max ?? 30, opts.rateLimit?.windowMs ?? 10 * 60_000);

  const clientIp = (req: IncomingMessage): string => {
    const forwarded = addressHeader ? req.headers[addressHeader.toLowerCase()] : undefined;
    const value = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded;
    // The proxy appends the address it saw, so the last entry is the one a client can't fake.
    const last = value?.split(',').at(-1)?.trim();
    return last || req.socket.remoteAddress || 'unknown';
  };

  const boards = (mode: Mode) => {
    const since = weekStart(now());
    return {
      mode,
      weekStart: since.toISOString(),
      week: db.board(mode, since, BOARD_SIZE),
      allTime: db.board(mode, null, BOARD_SIZE),
    };
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const read = method === 'GET' || method === 'HEAD';

    if (path === '/healthz') {
      if (!read) return json(res, 405, { error: 'method not allowed' });
      return db.ping() ? send(res, 200, 'ok', { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }) : json(res, 503, { error: 'database unavailable' });
    }

    if (path === '/api/leaderboard') {
      if (!read) return json(res, 405, { error: 'method not allowed' });
      const mode = url.searchParams.get('mode') as Mode;
      if (!MODES.includes(mode)) return json(res, 400, { error: 'mode must be "cut"' });
      return json(res, 200, boards(mode));
    }

    if (path === '/api/scores') {
      if (method !== 'POST') return json(res, 405, { error: 'method not allowed' });
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
        return json(res, 415, { error: 'send application/json' });
      }
      const raw = await readBody(req);
      if (raw === null) return json(res, 413, { error: 'body too large' });
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: 'invalid JSON' });
      }
      const checked = validate(body);
      if (!checked.ok) return json(res, 400, { error: checked.error });
      const at = now();
      if (!limit(rateKey(clientIp(req)), at.getTime())) return json(res, 429, { error: 'too many scores, try again later' });

      const s = checked.value;
      const id = db.add(s, at);
      console.log(`[score] ${s.mode} ${s.name} ${s.score}`);
      return json(res, 201, {
        id,
        name: s.name,
        weekRank: db.rank(s.mode, s.name, weekStart(at)),
        allTimeRank: db.rank(s.mode, s.name, null),
        ...boards(s.mode),
      });
    }

    if (path.startsWith('/api/')) return json(res, 404, { error: 'not found' });

    if (!read) return send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain' });
    const file = files.get(path === '/' ? '/index.html' : path);
    if (!file) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    const gzip = file.gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    return send(res, 200, gzip ? file.gzip! : file.body, {
      'Content-Type': file.type,
      'Cache-Control': file.cache,
      Vary: 'Accept-Encoding',
      ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
    });
  }

  return createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'server error' });
      else res.destroy();
    });
  });
}
