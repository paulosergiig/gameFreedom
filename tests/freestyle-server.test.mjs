import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';
import { openDatabase, leaderboard, freestyleLeaderboard, prune } from '../lib/store.mjs';
import { simulateFreestyleRun, FREESTYLE_VERSION, FREESTYLE_MAX_INPUTS } from '../public/shared/freestyle-rules.js';

async function fixture(t, options = {}) {
  let clock = 1800000000000;
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-freestyle-test-'));
  await fs.mkdir(path.join(publicDir, 'shared'));
  await Promise.all(['index.html', 'freestyle.js', 'shared/freestyle-rules.js'].map(file => fs.writeFile(path.join(publicDir, file), 'test')));
  const failures = [];
  const app = createApp({ env: {}, dbPath: ':memory:', publicDir, now: () => clock, onError: e => failures.push(e), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.close();
    assert.equal(failures.length, 0, failures.map(e => e.stack).join('\n'));
    assert.ok(path.resolve(publicDir).startsWith(path.join(os.tmpdir(), 'freedom-freestyle-test-')));
    await fs.rm(publicDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  async function request(url, { client, body, headers = {} } = {}) {
    const response = await fetch(origin + url, {
      method: body === undefined ? 'GET' : 'POST',
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
  return { request, client, advance: ms => { clock += ms; } };
}
const replay = (inputs = []) => ({ inputs, version: FREESTYLE_VERSION });
const start = (f, client, mode = 'freestyle') => f.request(mode === 'freestyle' ? '/api/freestyle/runs' : '/api/runs', { client, body: {} });
const finish = (f, client, run, body = replay()) => f.request(`/api/freestyle/runs/${run.runId}/finish`, { client, body });

test('freestyle shares player identity but preserves classic scores and separate records', async t => {
  const f = await fixture(t);
  const c = await f.client('Ana');
  const classic = (await start(f, c, 'classic')).data;
  f.advance(63000);
  assert.equal((await f.request(`/api/runs/${classic.runId}/finish`, { client: c, body: { moves: [], version: '1' } })).status, 200);
  const classicBefore = (await f.request('/api/leaderboard', { client: c })).data;
  const sessionBefore = (await f.request('/api/session', { client: c })).data.player;
  assert.equal((await f.request('/api/freestyle/leaderboard', { client: c })).data.me, null);
  const response = await start(f, c);
  assert.equal(response.status, 201);
  const run = response.data;
  assert.equal(run.duration, 90);
  assert.equal(run.countdown, 3);
  assert.equal(run.version, FREESTYLE_VERSION);
  assert.equal(run.expiresAt, 1800000000000 + 63000 + 240000);
  const inputs = [{ tick: 0, buttons: 1 }];
  f.advance(92999);
  assert.equal((await finish(f, c, run, replay(inputs))).data.code, 'RUN_TOO_EARLY');
  f.advance(1);
  const scored = await finish(f, c, run, replay(inputs));
  assert.equal(scored.status, 200);
  const expected = simulateFreestyleRun(run.seed, inputs);
  for (const key of ['score', 'tricks', 'crashes', 'jumps']) assert.equal(scored.data[key], expected[key]);
  assert.equal(scored.data.isPersonalBest, true);
  assert.equal(scored.data.isRecord, true);
  const board = (await f.request('/api/freestyle/leaderboard', { client: c })).data;
  assert.equal(board.me.tag, sessionBefore.tag);
  assert.equal(board.me.score, expected.score);
  assert.equal(board.entries[0].isMe, true);
  assert.equal(board.totalPlayers, 1);
  assert.deepEqual((await f.request('/api/leaderboard', { client: c })).data, classicBefore);
  assert.deepEqual((await f.request('/api/session', { client: c })).data.player, sessionBefore);
});

test('freestyle refuses score forgery, malformed transitions and unsupported versions', async t => {
  const f = await fixture(t);
  const c = await f.client('Bia');
  const run = (await start(f, c)).data;
  f.advance(93000);
  const invalid = [
    { ...replay(), score: 1000000 }, { ...replay(), version: '1' }, { version: FREESTYLE_VERSION },
    replay([{ tick: -1, buttons: 0 }]), replay([{ tick: 5400, buttons: 0 }]),
    replay([{ tick: 1, buttons: 1 }, { tick: 1, buttons: 0 }]),
    replay([{ tick: 2, buttons: 1 }, { tick: 1, buttons: 0 }]),
    replay([{ tick: 0, buttons: 16 }]), replay([{ tick: 0, buttons: -1 }]),
    replay([{ tick: 0.5, buttons: 1 }]), replay([{ tick: 0, buttons: '1' }]),
    replay([{ tick: 0, buttons: 1, x: 10000 }]), replay([null]),
    replay(Array.from({ length: FREESTYLE_MAX_INPUTS + 1 }, (_, tick) => ({ tick, buttons: tick % 2 })))
  ];
  for (const body of invalid) assert.equal((await finish(f, c, run, body)).status, 400, JSON.stringify(body).slice(0, 100));
  const maximum = replay(Array.from({ length: FREESTYLE_MAX_INPUTS }, (_, n) => ({ tick: n * 7, buttons: n % 2 })));
  assert.ok(Buffer.byteLength(JSON.stringify(maximum)) < 24576, 'all valid transitions fit the existing bounded request body');
  assert.equal((await finish(f, c, run, maximum)).status, 200);
});

test('freestyle finish is idempotent and retries cannot lower best or duplicate the player', async t => {
  const f = await fixture(t);
  const c = await f.client('Caio');
  const run = (await start(f, c)).data;
  f.advance(93000);
  const [first, second] = await Promise.all([finish(f, c, run, replay([{ tick: 0, buttons: 1 }])), finish(f, c, run, replay([{ tick: 0, buttons: 1 }]))]);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data, second.data);
  assert.deepEqual((await finish(f, c, run, { score: 999999 })).data, first.data);
  const next = (await start(f, c)).data;
  f.advance(93000);
  const other = await finish(f, c, next);
  assert.equal(other.status, 200);
  assert.equal(other.data.best, Math.max(first.data.score, other.data.score));
  f.advance(86400001);
  assert.deepEqual((await finish(f, c, run)).data, first.data);
  const board = (await f.request('/api/freestyle/leaderboard', { client: c })).data;
  assert.equal(board.totalPlayers, 1);
  assert.equal(board.me.score, other.data.best);
});

test('freestyle enforces session ownership, nickname, CSRF, abandonment and expiry', async t => {
  const f = await fixture(t);
  const anonymous = await f.client(null);
  assert.equal((await start(f, anonymous)).data.code, 'NAME_REQUIRED');
  assert.equal((await f.request('/api/freestyle/runs', { body: {} })).status, 401);
  const a = await f.client('Davi');
  const b = await f.client('Davi');
  assert.equal((await f.request('/api/freestyle/runs', { client: a, body: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
  const run = (await start(f, a)).data;
  assert.equal((await f.request(`/api/freestyle/runs/${run.runId}/abandon`, { client: b, body: {} })).status, 404);
  f.advance(93000);
  assert.equal((await finish(f, b, run)).status, 404);
  assert.equal((await f.request(`/api/freestyle/runs/${run.runId}/abandon`, { client: a, body: {} })).status, 200);
  assert.equal((await finish(f, a, run)).data.code, 'RUN_ABANDONED');
  const stale = (await start(f, a)).data;
  f.advance(240000);
  assert.equal((await finish(f, a, stale)).data.code, 'RUN_EXPIRED');
  const finished = (await start(f, a)).data;
  f.advance(93000);
  assert.equal((await finish(f, a, finished)).status, 200);
  assert.equal((await f.request('/api/freestyle/leaderboard', { client: b })).data.me, null);
});

test('switching modes only abandons active runs and keeps completed records', async t => {
  const f = await fixture(t);
  const c = await f.client('Eva');
  const classic = (await start(f, c, 'classic')).data;
  const free = (await start(f, c)).data;
  f.advance(93000);
  assert.equal((await f.request(`/api/runs/${classic.runId}/finish`, { client: c, body: { moves: [], version: '1' } })).data.code, 'RUN_ABANDONED');
  const first = (await finish(f, c, free)).data;
  const active = (await start(f, c)).data;
  await start(f, c, 'classic');
  f.advance(93000);
  assert.equal((await finish(f, c, active)).data.code, 'RUN_ABANDONED');
  assert.deepEqual((await finish(f, c, free)).data, first);
});

test('freestyle privacy retention removes expired scores and serves only allowed game files', async t => {
  const f = await fixture(t, { retentionDays: 1 });
  const c = await f.client('Fabi');
  const run = (await start(f, c)).data;
  f.advance(93000);
  await finish(f, c, run);
  for (const url of ['/freestyle.js', '/shared/freestyle-rules.js']) {
    const response = await f.request(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  }
  f.advance(86400000);
  assert.equal((await start(f, c)).status, 401);
  assert.deepEqual((await f.request('/api/freestyle/leaderboard', { client: c })).data, { entries: [], me: null, record: 0, totalPlayers: 0 });
});

test('additive migration preserves legacy tables, ranks ties and cascades privacy deletion', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-freestyle-migration-'));
  const filename = path.join(directory, 'ranking.sqlite');
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), 'freedom-freestyle-migration-')));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const legacy = new DatabaseSync(filename);
  legacy.exec(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY, tag TEXT NOT NULL UNIQUE, name TEXT,
      best INTEGER NOT NULL DEFAULT -1, best_at INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE runs (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      seed INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','finished','abandoned')), result TEXT
    ) STRICT;
  `);
  const now = 1800000000000;
  const insert = legacy.prepare('INSERT INTO players(id,tag,name,best,best_at,created_at,expires_at) VALUES(?,?,?,?,?,?,?)');
  insert.run('first', '000000000001', 'Ana', 300, now, now, now + 86400000);
  insert.run('second', '000000000002', 'Bia', 200, now + 1, now, now + 86400000);
  insert.run('third', '000000000003', 'Caio', 100, now + 2, now, now + 86400000);
  const originalResult = JSON.stringify({ score: 300, coins: 3, hits: 0 });
  legacy.prepare('INSERT INTO runs(id,player_id,seed,created_at,expires_at,state,result) VALUES(?,?,?,?,?,?,?)').run('existing-run', 'first', 1, now - 63000, now + 1000, 'finished', originalResult);
  const originalPlayers = legacy.prepare('SELECT * FROM players ORDER BY id').all();
  const originalRuns = legacy.prepare('SELECT * FROM runs ORDER BY id').all();
  legacy.close();
  let db = openDatabase(filename);
  assert.deepEqual(db.prepare('SELECT * FROM players ORDER BY id').all(), originalPlayers);
  assert.deepEqual(db.prepare('SELECT * FROM runs ORDER BY id').all(), originalRuns);
  assert.equal(freestyleLeaderboard(db, 'first', now).totalPlayers, 0);
  const score = db.prepare('INSERT INTO freestyle_scores(player_id,best,best_at) VALUES(?,?,?)');
  score.run('first', 500, now);
  score.run('second', 500, now + 1);
  score.run('third', 100, now + 2);
  db.prepare('INSERT INTO freestyle_runs(id,player_id,seed,created_at,expires_at,state,result) VALUES(?,?,?,?,?,?,?)').run('free-run', 'first', 1, now, now + 240000, 'finished', JSON.stringify({ score: 500 }));
  assert.deepEqual(freestyleLeaderboard(db, 'third', now).entries.map(row => row.rank), [1, 1, 3]);
  assert.equal(freestyleLeaderboard(db, 'third', now).me.rank, 3);
  assert.equal(leaderboard(db, 'first', now).me.score, 300);
  db.prepare('UPDATE players SET name = ? WHERE id = ?').run('Novo Apelido', 'first');
  assert.equal(freestyleLeaderboard(db, 'first', now).me.name, 'Novo Apelido');
  db.close();
  db = openDatabase(filename);
  assert.equal(freestyleLeaderboard(db, 'first', now).me.score, 500);
  assert.equal(leaderboard(db, 'first', now).me.score, 300);
  db.prepare('DELETE FROM players WHERE id = ?').run('first');
  assert.equal(db.prepare('SELECT count(*) AS n FROM freestyle_runs WHERE player_id = ?').get('first').n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM freestyle_scores WHERE player_id = ?').get('first').n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM runs WHERE player_id = ?').get('first').n, 0);
  assert.equal(freestyleLeaderboard(db, 'third', now).me.rank, 2);
  prune(db, now + 86400000);
  assert.equal(freestyleLeaderboard(db, null, now + 86400000).totalPlayers, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM freestyle_scores').get().n, 0);
  db.close();
});
