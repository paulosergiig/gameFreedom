import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { openDatabase, leaderboard } from '../lib/store.mjs';
import { createApp } from '../server.mjs';
import { configuration } from '../lib/config.mjs';
import { cleanName, RateLimiter } from '../lib/security.mjs';
import { simulateRun } from '../public/shared/rules.js';

async function fixture(t, options = {}) {
  let clock = 1800000000000;
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-test-'));
  await fs.writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>Freedom</title>');
  const failures = [];
  const app = createApp({ env: {}, dbPath: ':memory:', publicDir, now: () => clock, onError: e => failures.push(e), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.close();
    assert.equal(failures.length, 0, failures.map(e => e.stack).join('\n'));
    assert.ok(path.resolve(publicDir).startsWith(path.join(os.tmpdir(), 'freedom-test-')));
    await fs.rm(publicDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  async function request(url, { client, body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
    const response = await fetch(origin + url, {
      method,
      headers: { ...(client ? { Cookie: client.cookie, Origin: origin, 'X-CSRF-Token': client.csrf } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const type = response.headers.get('content-type') ?? '';
    return { status: response.status, data: type.includes('json') ? await response.json() : await response.text(), headers: response.headers };
  }
  async function client(name = 'Visitante') {
    const session = await request('/api/session');
    const c = { cookie: session.headers.get('set-cookie').split(';')[0], csrf: session.data.csrfToken };
    if (name) assert.equal((await request('/api/player', { client: c, body: { name } })).status, 200);
    return c;
  }
  return { app, origin, request, client, advance: ms => { clock += ms; } };
}

test('session uses HttpOnly strict cookie and requires Origin plus CSRF', async t => {
  const f = await fixture(t);
  const session = await f.request('/api/session');
  assert.match(session.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal(session.data.player, null);
  assert.equal(session.data.privacy.retentionDays, 30);
  assert.equal(session.headers.get('cache-control'), 'no-store');
  const c = await f.client(null);
  assert.equal((await f.request('/api/player', { client: c, body: { name: 'Ana' }, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.request('/api/player', { client: c, body: { name: 'Ana' }, headers: { 'X-CSRF-Token': '' } })).status, 403);
  assert.equal((await f.request('/api/player', { client: c, body: { name: 'Ana' }, headers: { 'X-CSRF-Token': 'á'.repeat(43) } })).status, 403);
  assert.equal((await f.request('/api/player', { body: { name: 'Ana' } })).status, 401);
  assert.equal((await f.request('/api/player', { client: c, body: { name: 'Ana' } })).status, 200);
});

test('names normalize Unicode and block hostile HTML, invalid names and brand names', async t => {
  const f = await fixture(t);
  const c = await f.client(null);
  for (const name of ['<script>alert(1)</script>', 'x', 'a'.repeat(21), '😈', 'Pirelli', 'Honda', 'caralho']) {
    assert.equal((await f.request('/api/player', { client: c, body: { name } })).status, 400);
  }
  const result = await f.request('/api/player', { client: c, body: { name: '  Joa\u0303o   Silva  ' } });
  assert.equal(result.data.player.name, 'João Silva');
  assert.equal(cleanName('Freedom.26'), 'Freedom.26');
});

test('score replay rejects spoofed scores and invalid moves, retries are idempotent', async t => {
  const f = await fixture(t);
  const c = await f.client('Ana');
  const run = (await f.request('/api/runs', { client: c, body: {} })).data;
  const finish = body => f.request(`/api/runs/${run.runId}/finish`, { client: c, body });
  assert.equal((await finish({ moves: [], version: '1' })).data.code, 'RUN_TOO_EARLY');
  f.advance(63000);
  assert.equal((await finish({ moves: [], version: '1', score: 999999 })).status, 400);
  assert.equal((await finish({ moves: [{ tick: 1, direction: 1 }, { tick: 2, direction: -1 }], version: '1' })).status, 400);
  assert.equal((await finish({ moves: [{ tick: 1, direction: 1 }, { tick: 20, direction: 1 }], version: '1' })).status, 400);
  const expected = simulateRun(run.seed, []);
  const first = await finish({ moves: [], version: '1' });
  assert.equal(first.status, 200);
  assert.equal(first.data.score, expected.score);
  assert.equal(first.data.coins, expected.coins);
  assert.equal(first.data.hits, expected.hits);
  const retry = await finish({ moves: [], version: '1' });
  assert.deepEqual(retry.data, first.data);
  f.advance(86400001);
  assert.deepEqual((await finish({ moves: [], version: '1' })).data, first.data);
  const board = (await f.request('/api/leaderboard', { client: c })).data;
  assert.equal(board.entries.length, 1);
  assert.equal(board.record, expected.score);
  assert.equal(board.entries[0].isMe, true);
});

test('equal names have independent sessions and cannot finish each other runs', async t => {
  const f = await fixture(t);
  const a = await f.client('João');
  const b = await f.client('João');
  const run = (await f.request('/api/runs', { client: a, body: {} })).data;
  f.advance(63000);
  assert.equal((await f.request(`/api/runs/${run.runId}/finish`, { client: b, body: { moves: [], version: '1' } })).status, 404);
  assert.equal((await f.request(`/api/runs/${run.runId}/finish`, { client: a, body: { moves: [], version: '1' } })).status, 200);
  const board = (await f.request('/api/leaderboard', { client: b })).data;
  assert.equal(board.me, null);
  assert.equal(board.entries[0].isMe, false);
  const sa = (await f.request('/api/session', { client: a })).data;
  const sb = (await f.request('/api/session', { client: b })).data;
  assert.notEqual(sa.player.tag, sb.player.tag);
});

test('simultaneous duplicate finishes cannot duplicate entries or reduce personal best', async t => {
  const f = await fixture(t);
  const c = await f.client('Bia');
  let largest = -1;
  for (let round = 0; round < 3; round++) {
    const run = (await f.request('/api/runs', { client: c, body: {} })).data;
    f.advance(63000);
    const route = `/api/runs/${run.runId}/finish`;
    const results = await Promise.all([f.request(route, { client: c, body: { moves: [], version: '1' } }), f.request(route, { client: c, body: { moves: [], version: '1' } })]);
    assert.deepEqual(results[0].data, results[1].data);
    largest = Math.max(largest, results[0].data.score);
    assert.equal(results[0].data.best, largest);
  }
  const board = (await f.request('/api/leaderboard', { client: c })).data;
  assert.equal(board.entries.length, 1);
  assert.equal(board.me.score, largest);
});

test('expired sessions are replaced and removed from leaderboard without restoration', async t => {
  const f = await fixture(t, { retentionDays: 1 });
  const c = await f.client('Caio');
  const run = (await f.request('/api/runs', { client: c, body: {} })).data;
  f.advance(63000);
  await f.request(`/api/runs/${run.runId}/finish`, { client: c, body: { moves: [], version: '1' } });
  f.advance(86400000);
  assert.equal((await f.request('/api/runs', { client: c, body: {} })).status, 401);
  assert.equal((await f.request('/api/leaderboard', { client: c })).data.entries.length, 0);
  const replaced = await f.request('/api/session', { client: c });
  assert.equal(replaced.data.player, null);
  assert.notEqual(replaced.headers.get('set-cookie').split(';')[0], c.cookie);
});

test('abandoned and stale runs cannot score', async t => {
  const f = await fixture(t);
  const c = await f.client('Davi');
  const run = (await f.request('/api/runs', { client: c, body: {} })).data;
  assert.equal((await f.request(`/api/runs/${run.runId}/abandon`, { client: c, body: {} })).status, 200);
  f.advance(63000);
  assert.equal((await f.request(`/api/runs/${run.runId}/finish`, { client: c, body: { moves: [], version: '1' } })).data.code, 'RUN_ABANDONED');
  const next = (await f.request('/api/runs', { client: c, body: {} })).data;
  f.advance(180001);
  assert.equal((await f.request(`/api/runs/${next.runId}/finish`, { client: c, body: { moves: [], version: '1' } })).data.code, 'RUN_EXPIRED');
});

test('static allowlist blocks repository, traversal, and unknown Host; CSP is present', async t => {
  const f = await fixture(t);
  const index = await f.request('/');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const url of ['/server.mjs', '/.env', '/.git/config', '/data/freedom.sqlite', '/%2e%2e%2fserver.mjs', '/assets/%2e%2e%5cserver.mjs']) {
    assert.ok([400, 404].includes((await f.request(url)).status), url);
  }
  const hostileHost = await new Promise((resolve, reject) => {
    http.get(f.origin + '/api/health', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(hostileHost, 421);
  assert.deepEqual((await f.request('/api/health')).data, { ok: true });
});

test('configuration rejects unsafe database location and insecure production origins', () => {
  assert.throws(() => configuration({ env: { NODE_ENV: 'production' } }), /HTTPS/);
  assert.throws(() => configuration({ env: {}, publicUrl: 'http://game.example.com' }), /HTTPS/);
  assert.throws(() => configuration({ env: {}, publicUrl: 'https://game.example.com/foo' }), /origem/);
  assert.throws(() => configuration({ env: {}, publicDir: '/tmp/public', dbPath: '/tmp/public/data.sqlite' }), /fora de public/);
  assert.equal(configuration({ env: {}, publicUrl: 'https://game.example.com' }).publicUrl.origin, 'https://game.example.com');
});

test('bounded rate limiter fails closed and recovers when the window expires', () => {
  const limiter = new RateLimiter(2);
  assert.equal(limiter.allow('a', 1, 100, 0), true);
  assert.equal(limiter.allow('a', 1, 100, 0), false);
  assert.equal(limiter.allow('b', 1, 100, 0), true);
  assert.equal(limiter.allow('c', 1, 100, 0), false);
  assert.equal(limiter.allow('c', 1, 100, 101), true);
  assert.ok(limiter.entries.size <= 2);
});



test('production HTTPS origin issues Secure cookies and enforces public Host', async t => {
  const f = await fixture(t, { publicUrl: 'https://jogo.freedom.dev.br' });
  const response = await new Promise((resolve, reject) => {
    http.get(f.origin + '/api/session', { headers: { Host: 'jogo.freedom.dev.br' } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }));
    }).on('error', reject);
  });
  assert.equal(response.status, 200);
  assert.match(response.headers['set-cookie'][0], /; Secure$/);
  assert.equal(response.headers['strict-transport-security'], 'max-age=31536000');
  assert.equal((await f.request('/api/health')).status, 421);
});

test('database persists equal competition ranks; backup and confirmed local moderation work', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-db-test-'));
  const filename = path.join(directory, 'ranking.sqlite');
  const destination = path.join(directory, 'backup.sqlite');
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), 'freedom-db-test-')));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  let db = openDatabase(filename);
  const now = Date.now();
  const insert = db.prepare('INSERT INTO players(id,tag,name,best,best_at,created_at,expires_at) VALUES(?,?,?,?,?,?,?)');
  insert.run('first', '000000000001', 'Ana', 100, now, now, now + 86400000);
  insert.run('second', '000000000002', 'Bia', 100, now + 1, now, now + 86400000);
  insert.run('third', '000000000003', 'Caio', 80, now + 2, now, now + 86400000);
  assert.deepEqual(leaderboard(db, 'third', now).entries.map(row => row.rank), [1, 1, 3]);
  assert.equal(leaderboard(db, 'third', now).me.rank, 3);
  db.close();
  const execute = args => spawnSync(process.execPath, [path.resolve('scripts/admin.mjs'), ...args], {
    env: { ...process.env, NODE_ENV: 'test', DB_PATH: filename, PUBLIC_URL: '', TRUST_PROXY: 'false' }, encoding: 'utf8', windowsHide: true
  });
  const backedUp = execute(['backup', destination]);
  assert.equal(backedUp.status, 0, backedUp.stderr);
  const snapshot = openDatabase(destination);
  assert.equal(leaderboard(snapshot, 'third', now).totalPlayers, 3);
  snapshot.close();
  const refused = execute(['remove-player', '000000000002']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--confirm/);
  db = openDatabase(filename);
  assert.equal(leaderboard(db, 'third', now).totalPlayers, 3);
  db.close();
  const removed = execute(['remove-player', '000000000002', '--confirm']);
  assert.equal(removed.status, 0, removed.stderr);
  db = openDatabase(filename);
  assert.equal(leaderboard(db, 'third', now).me.rank, 2);
  db.close();
  const reset = execute(['reset-event', '--confirm']);
  assert.equal(reset.status, 0, reset.stderr);
  db = openDatabase(filename);
  assert.equal(leaderboard(db, null, now).totalPlayers, 0);
  db.close();
});

