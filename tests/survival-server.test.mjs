import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createApp } from '../server.mjs';
import { openDatabase, survivalLeaderboard, prune } from '../lib/store.mjs';
import * as classic from '../public/shared/classic-survival.js';
import * as freestyle from '../public/shared/freestyle-survival.js';

async function fixture(t, options = {}) {
  let clock = 1800000000000;
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-survival-test-'));
  await fs.mkdir(path.join(publicDir, 'shared'));
  await Promise.all(['index.html', 'shared/classic-survival.js', 'shared/freestyle-survival.js'].map(file => fs.writeFile(path.join(publicDir, file), 'test')));
  const failures = [];
  const app = createApp({ env: {}, dbPath: ':memory:', publicDir, now: () => clock, onError: e => failures.push(e), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.close();
    assert.equal(failures.length, 0, failures.map(e => e.stack).join('\n'));
    assert.ok(path.resolve(publicDir).startsWith(path.join(os.tmpdir(), 'freedom-survival-test-')));
    await fs.rm(publicDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  async function request(url, { client, body, headers = {} } = {}) {
    const requestHeaders = { ...(client ? { Cookie: client.cookie, Origin: origin, 'X-CSRF-Token': client.csrf } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers };
    for (const key of Object.keys(requestHeaders)) if (requestHeaders[key] === undefined) delete requestHeaders[key];
    const response = await fetch(origin + url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: requestHeaders,
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
const base = mode => `/api/survival/${mode}`;
const packet = (fromTick, toTick, inputs = [], end = false, reason = 'exit') => ({ version: 'survival-1', fromTick, toTick, inputs, end, reason });
const start = async (f, client, mode = 'classic') => {
  const result = await f.request(`${base(mode)}/runs`, { client, body: {} });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return { ...result.data, mode };
};
const sync = (f, client, run, body) => f.request(`${base(run.mode)}/runs/${run.runId}/sync`, { client, body });
const board = async (f, client, mode = 'classic') => (await f.request(`${base(mode)}/leaderboard`, { client })).data;

for (const [mode, model] of [['classic', classic], ['freestyle', freestyle]]) {
  test(`${mode} survival checkpoints replay server-side, preserve overlaps and bank an early exit`, async t => {
    const f = await fixture(t);
    const c = await f.client('Ana');
    const run = await start(f, c, mode);
    assert.equal(run.lives, 3);
    assert.equal(run.countdown, 3);
    assert.equal(run.version, 'survival-1');
    const state = model.createSurvivalState(run.seed);
    const firstInput = mode === 'classic' ? [{ tick: 0, direction: 1 }] : [{ tick: 0, buttons: 1 }];
    for (let i = 0; i < 120; i++) model.stepSurvivalState(state, mode === 'classic' ? i === 0 ? 1 : 0 : 1);
    f.advance(5000);
    const first = await sync(f, c, run, packet(0, 120, firstInput));
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.tick, state.tick);
    assert.equal(first.data.score, state.score);
    assert.equal((await board(f, c, mode)).me, null, 'active checkpoints are not final leaderboard rows');
    for (let i = 120; i < 240; i++) model.stepSurvivalState(state, mode === 'classic' ? 0 : 1);
    f.advance(2000);
    const later = await sync(f, c, run, packet(0, 240, firstInput));
    assert.equal(later.status, 200);
    assert.equal(later.data.tick, 240);
    assert.equal(later.data.score, state.score);
    const older = await sync(f, c, run, packet(0, 120, firstInput));
    assert.equal(older.data.tick, 240, 'late acknowledgements cannot rewind a run');
    const [ended, repeated] = await Promise.all([
      sync(f, c, run, packet(120, 240, [], true, 'hidden')),
      sync(f, c, run, packet(0, 240, firstInput, true, 'hidden'))
    ]);
    assert.equal(ended.status, 200);
    assert.equal(ended.data.finished, true);
    assert.equal(ended.data.result.endReason, 'hidden');
    assert.equal(ended.data.result.score, state.score);
    assert.deepEqual(repeated.data, ended.data);
    const saved = await board(f, c, mode);
    assert.equal(saved.me.score, state.score);
    assert.equal(saved.totalPlayers, 1);
    const status = await f.request(`${base(mode)}/runs/${run.runId}`, { client: c });
    assert.deepEqual(status.data, ended.data);
  });
}

test('survival rejects forged scores, invalid transitions, future time, checkpoint gaps and cross-packet cooldown', async t => {
  const f = await fixture(t);
  const c = await f.client('Bia');
  const run = await start(f, c);
  assert.equal((await sync(f, c, run, packet(0, 1))).data.code, 'RUN_TOO_EARLY');
  f.advance(15000);
  const invalid = [
    { ...packet(0, 120), score: 999999 }, { ...packet(0, 120), state: { lives: 3 } },
    { ...packet(0, 120), version: '1' }, { ...packet(0, 120), end: 'yes' },
    { ...packet(0, 120), reason: 'anything' }, packet(-1, 120), packet(2, 1), packet(0, 1.5),
    packet(0, 120, [{ tick: -1, direction: 1 }]), packet(0, 120, [{ tick: 120, direction: 1 }]),
    packet(0, 120, [{ tick: 1, direction: 0 }]), packet(0, 120, [{ tick: 1, direction: 1, score: 500 }]),
    packet(0, 120, [{ tick: 1, direction: 1 }, { tick: 1, direction: -1 }]),
    packet(0, 120, [{ tick: 0, direction: 1 }, { tick: 1, direction: -1 }]),
    packet(0, 120, [{ tick: 0, direction: 1 }, { tick: 10, direction: 1 }]),
    packet(0, 120, Array.from({ length: 1201 }, () => ({ tick: 0, direction: 1 })))
  ];
  for (const body of invalid) assert.equal((await sync(f, c, run, body)).status, 400, JSON.stringify(body).slice(0, 150));
  assert.equal((await sync(f, c, run, packet(1, 120))).data.code, 'CHECKPOINT_GAP');
  assert.equal((await sync(f, c, run, packet(0, 3601))).data.code, 'CHECKPOINT_TOO_LARGE');
  assert.equal((await sync(f, c, run, packet(0, 5, [{ tick: 0, direction: 1 }]))).status, 200);
  assert.equal((await sync(f, c, run, packet(5, 20, [{ tick: 5, direction: -1 }]))).status, 400);
  assert.equal((await sync(f, c, run, packet(5, 20, [{ tick: 10, direction: -1 }], true))).status, 200);
});

test('survival starts require a name and session; beacon tokens only work on same-origin sync', async t => {
  const f = await fixture(t);
  const anonymous = await f.client(null);
  assert.equal((await f.request(`${base('classic')}/runs`, { client: anonymous, body: {} })).data.code, 'NAME_REQUIRED');
  assert.equal((await f.request(`${base('classic')}/runs`, { body: {} })).status, 401);
  const a = await f.client('Caio');
  const b = await f.client('Caio');
  const run = await start(f, a);
  const url = `${base(run.mode)}/runs/${run.runId}/sync`;
  const body = { ...packet(0, 0, [], true), csrfToken: a.csrf };
  assert.equal((await sync(f, b, run, packet(0, 0, [], true))).status, 404);
  assert.equal((await f.request(`${base(run.mode)}/runs/${run.runId}`, { client: b })).status, 404);
  assert.equal((await f.request(url, { body, headers: { Cookie: a.cookie, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.request(url, { body: { ...body, csrfToken: 'invalid' }, headers: { Cookie: a.cookie, Origin: 'http://localhost' } })).status, 403);
  const status = await f.request(`${base(run.mode)}/runs/${run.runId}`, { client: a });
  assert.equal(status.data.finished, false);
  // Use the known request origin through its normal client headers, omitting only the custom token.
  const beacon = await f.request(url, { client: a, body, headers: { 'X-CSRF-Token': undefined } });
  assert.equal(beacon.status, 200);
  assert.equal(beacon.data.finished, true);
  const ended = await sync(f, a, run, packet(0, 0, [], true, 'lives'));
  assert.equal(ended.data.result.endReason, 'exit');
  assert.equal(ended.data.result.rank, null);
  assert.equal(ended.data.result.isPersonalBest, false);
  assert.equal((await board(f, a)).totalPlayers, 0, 'countdown cancellation creates no zero-score ranking entry');
});

test('three classic accidents end immediately and inputs past death cannot be submitted', async t => {
  const f = await fixture(t);
  const c = await f.client('Davi');
  const run = await start(f, c);
  const state = classic.createSurvivalState(run.seed);
  f.advance(3000);
  let response;
  while (!state.finished && state.tick < 36000) {
    const from = state.tick;
    const target = from + 300;
    while (state.tick < target && !state.finished) classic.stepSurvivalState(state);
    f.advance(Math.ceil((state.tick - from) * 1000 / 60));
    if (state.finished) {
      f.advance(20);
      const forged = await sync(f, c, run, packet(from, state.tick + 1));
      assert.equal(forged.status, 400);
    }
    response = await sync(f, c, run, packet(from, state.tick));
    assert.equal(response.status, 200, JSON.stringify(response.data));
  }
  assert.equal(state.lives, 0);
  assert.equal(response.data.finished, true);
  assert.equal(response.data.result.endReason, 'lives');
  assert.equal(response.data.result.hits, 3);
  assert.equal(response.data.result.score, state.score);
  assert.equal((await board(f, c)).me.score, state.score);
});

test('disconnect and replacement finalize only confirmed checkpoints and status recovers the saved result', async t => {
  const f = await fixture(t);
  const c = await f.client('Eva');
  const run = await start(f, c);
  f.advance(8000);
  const checkpoint = (await sync(f, c, run, packet(0, 300))).data;
  assert.equal(checkpoint.finished, false);
  f.advance(29999);
  assert.equal((await board(f, c)).totalPlayers, 0);
  f.advance(1);
  assert.equal((await board(f, c)).me.score, checkpoint.score);
  const recovered = (await f.request(`${base(run.mode)}/runs/${run.runId}`, { client: c })).data;
  assert.equal(recovered.result.elapsedTicks, 300);
  assert.equal(recovered.result.endReason, 'disconnect');
  assert.deepEqual((await sync(f, c, run, packet(300, 1200, [], true))).data, recovered);
  const active = await start(f, c);
  f.advance(8000);
  const saved = (await sync(f, c, active, packet(0, 300))).data;
  await start(f, c, 'freestyle');
  const replaced = (await f.request(`${base(active.mode)}/runs/${active.runId}`, { client: c })).data;
  assert.equal(replaced.result.endReason, 'replaced');
  assert.equal(replaced.result.score, saved.score);
  assert.equal((await board(f, c, 'freestyle')).totalPlayers, 0);
});

test('survival leaderboards include legacy records while active legacy clients remain compatible', async t => {
  const f = await fixture(t);
  const c = await f.client('Fabi');
  const legacy = (await f.request('/api/runs', { client: c, body: {} })).data;
  const legacyFreestyle = (await f.request('/api/freestyle/runs', { client: c, body: {} })).data;
  f.advance(93000);
  assert.equal((await f.request(`/api/freestyle/runs/${legacyFreestyle.runId}/finish`, { client: c, body: { version: 'freestyle-1', inputs: [] } })).status, 200);
  const oldBoard = (await f.request('/api/freestyle/leaderboard', { client: c })).data;
  const activeLegacy = (await f.request('/api/runs', { client: c, body: {} })).data;
  const survival = await start(f, c);
  f.advance(5000);
  assert.equal((await sync(f, c, survival, packet(0, 120, [], true))).status, 200);
  f.advance(58000);
  assert.equal((await f.request(`/api/runs/${activeLegacy.runId}/finish`, { client: c, body: { version: '1', moves: [] } })).status, 200);
  assert.deepEqual((await f.request('/api/freestyle/leaderboard', { client: c })).data, oldBoard);
  assert.equal((await board(f, c, 'freestyle')).totalPlayers, 1);
  assert.equal((await board(f, c, 'freestyle')).me.score, oldBoard.me.score);
  assert.equal((await board(f, c)).totalPlayers, 1);
  assert.ok(legacy.runId !== activeLegacy.runId);
});

test('freestyle accepts jump bit, rejects invalid masks and applies a separate bounded heartbeat rate', async t => {
  const f = await fixture(t);
  const c = await f.client('Gabi');
  const run = await start(f, c, 'freestyle');
  f.advance(6000);
  for (const inputs of [[{ tick: 0, buttons: 32 }], [{ tick: 0, buttons: -1 }], [{ tick: 0, buttons: 1.5 }], [{ tick: 0, direction: 1 }]]) {
    assert.equal((await sync(f, c, run, packet(0, 120, inputs))).status, 400);
  }
  const valid = packet(0, 120, [{ tick: 0, buttons: 1 }, { tick: 30, buttons: 17 }, { tick: 31, buttons: 1 }]);
  assert.equal((await sync(f, c, run, valid)).status, 200);
  for (let i = 0; i < 80; i++) assert.equal((await sync(f, c, run, packet(120, 120))).status, 200);
  let response;
  for (let i = 0; i < 6; i++) response = await sync(f, c, run, packet(120, 120));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
});

test('survival ranking ties, file persistence and privacy deletion do not modify prior records', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-survival-migration-'));
  const filename = path.join(directory, 'ranking.sqlite');
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), 'freedom-survival-migration-')));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  let db = openDatabase(filename);
  const time = 1800000000000;
  for (const [index, id] of ['a', 'b', 'c'].entries()) {
    db.prepare('INSERT INTO players(id,tag,name,best,best_at,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, String(index).padStart(12, '0'), `Piloto ${id}`, index < 2 ? 500 : 100, time, time, time + 86400000);
    db.prepare('INSERT INTO freestyle_scores(player_id,best,best_at) VALUES(?,?,?)').run(id, 800 - index, time);
    db.prepare('INSERT INTO survival_scores(player_id,mode,best,best_at) VALUES(?,?,?,?)').run(id, 'classic', index < 2 ? 500 : 100, time + index);
    db.prepare('INSERT INTO survival_runs(id,player_id,mode,seed,created_at,last_sync_at,simulation) VALUES(?,?,?,?,?,?,?)')
      .run(`run-${id}`, id, 'classic', 1, time, time, JSON.stringify(classic.createSurvivalState(1)));
  }
  const before = db.prepare('SELECT * FROM players ORDER BY id').all();
  const oldScores = db.prepare('SELECT * FROM freestyle_scores ORDER BY player_id').all();
  db.close();
  db = openDatabase(filename);
  try {
    assert.deepEqual(db.prepare('SELECT * FROM players ORDER BY id').all(), before);
    assert.deepEqual(db.prepare('SELECT * FROM freestyle_scores ORDER BY player_id').all(), oldScores);
    assert.deepEqual(survivalLeaderboard(db, 'c', 'classic', time).entries.map(row => row.rank), [1, 1, 3]);
    assert.equal(survivalLeaderboard(db, 'c', 'classic', time).me.rank, 3);
    assert.equal(survivalLeaderboard(db, 'a', 'freestyle', time).totalPlayers, 3);
    db.prepare('DELETE FROM players WHERE id = ?').run('a');
    assert.equal(db.prepare('SELECT count(*) AS n FROM survival_runs WHERE player_id = ?').get('a').n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM survival_scores WHERE player_id = ?').get('a').n, 0);
    prune(db, time + 86400000);
    assert.equal(db.prepare('SELECT count(*) AS n FROM survival_scores').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM survival_runs').get().n, 0);
  } finally { db.close(); }
});

test('new static modules keep CSP while data remains inaccessible', async t => {
  const f = await fixture(t);
  for (const url of ['/shared/classic-survival.js', '/shared/freestyle-survival.js']) {
    const response = await f.request(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  }
  assert.equal((await f.request('/lib/survival.mjs')).status, 404);
  const c = await f.client('Hugo');
  const run = await start(f, c);
  const oversized = { ...packet(0, 0), unknown: 'x'.repeat(49152) };
  assert.equal((await sync(f, c, run, oversized)).status, 413);
});

test('local admin lists all editions, backs up survival checkpoints and removes the complete participant', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-survival-admin-'));
  const filename = path.join(directory, 'ranking.sqlite');
  const destination = path.join(directory, 'backup.sqlite');
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), 'freedom-survival-admin-')));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const time = Date.now();
  let db = openDatabase(filename);
  db.prepare('INSERT INTO players(id,tag,name,best,best_at,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
    .run('player', '012345ABCDEF', 'Ana', 111, time, time, time + 86400000);
  db.prepare('INSERT INTO freestyle_scores(player_id,best,best_at) VALUES(?,?,?)').run('player', 222, time);
  for (const [mode, score] of [['classic', 333], ['freestyle', 444]]) {
    db.prepare('INSERT INTO survival_scores(player_id,mode,best,best_at) VALUES(?,?,?,?)').run('player', mode, score, time);
    db.prepare('INSERT INTO survival_runs(id,player_id,mode,seed,created_at,last_sync_at,simulation) VALUES(?,?,?,?,?,?,?)')
      .run(mode, 'player', mode, 1, time, time, JSON.stringify((mode === 'classic' ? classic : freestyle).createSurvivalState(1)));
  }
  db.close();
  const execute = args => spawnSync(process.execPath, [path.resolve('scripts/admin.mjs'), ...args], {
    env: { ...process.env, NODE_ENV: 'test', DB_PATH: filename, PUBLIC_URL: '', TRUST_PROXY: 'false' }, encoding: 'utf8', windowsHide: true
  });
  const listed = execute(['list']);
  assert.equal(listed.status, 0, listed.stderr);
  for (const field of ['desafio_atual', 'freestyle_atual', 'desafio_historico', 'freestyle_historico', '111', '222', '333', '444']) assert.ok(listed.stdout.includes(field), field);
  const saved = execute(['backup', destination]);
  assert.equal(saved.status, 0, saved.stderr);
  db = openDatabase(destination);
  assert.equal(db.prepare('SELECT count(*) AS n FROM survival_scores').get().n, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM survival_runs').get().n, 2);
  assert.equal(db.prepare('SELECT best FROM players').get().best, 111);
  db.close();
  assert.equal(execute(['remove-player', '012345ABCDEF']).status, 1);
  const removed = execute(['remove-player', '012345ABCDEF', '--confirm']);
  assert.equal(removed.status, 0, removed.stderr);
  db = openDatabase(filename);
  for (const table of ['players', 'runs', 'freestyle_scores', 'freestyle_runs', 'survival_scores', 'survival_runs']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0, table);
  }
  db.close();
});

for (const mode of ['classic', 'freestyle']) {
  test(`${mode} keeps an older higher record and uses the combined best for new-record flags`, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-survival-combined-'));
    const dbPath = path.join(directory, 'ranking.sqlite');
    const f = await fixture(t, { dbPath });
    t.after(async () => {
      assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), 'freedom-survival-combined-')));
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });
    const c = await f.client('Iara');
    let db = openDatabase(dbPath);
    const player = db.prepare('SELECT * FROM players WHERE name = ?').get('Iara');
    if (mode === 'classic') db.prepare('UPDATE players SET best = ?, best_at = ? WHERE id = ?').run(99999, player.created_at, player.id);
    else db.prepare('INSERT INTO freestyle_scores(player_id,best,best_at) VALUES(?,?,?)').run(player.id, 99999, player.created_at);
    db.close();
    assert.equal((await board(f, c, mode)).me.score, 99999);
    const run = await start(f, c, mode);
    f.advance(5000);
    const response = await sync(f, c, run, packet(0, 120, [], true));
    assert.equal(response.status, 200);
    assert.equal(response.data.result.best, 99999);
    assert.equal(response.data.result.isPersonalBest, false);
    assert.equal(response.data.result.isRecord, false);
    const ranking = await board(f, c, mode);
    assert.equal(ranking.me.score, 99999);
    assert.equal(ranking.totalPlayers, 1);
    db = openDatabase(dbPath);
    assert.equal(db.prepare('SELECT best FROM survival_scores WHERE player_id = ? AND mode = ?').get(player.id, mode).best, response.data.result.score);
    const preserved = mode === 'classic' ? db.prepare('SELECT best FROM players WHERE id = ?').get(player.id) : db.prepare('SELECT best FROM freestyle_scores WHERE player_id = ?').get(player.id);
    assert.equal(preserved.best, 99999);
    db.close();
  });
}

test('combined rankings deduplicate editions, retain earliest tie time and use the greater old or new score', () => {
  const db = openDatabase(':memory:');
  const time = 1800000000000;
  try {
    for (const [id, oldScore, newScore, oldTime, newTime] of [
      ['a', 500, 500, time + 10, time + 20],
      ['b', 500, 500, time + 5, time + 30],
      ['c', 10, 800, time, time + 40],
      ['d', 700, 100, time + 2, time + 50]
    ]) {
      db.prepare('INSERT INTO players(id,tag,name,best,best_at,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
        .run(id, id.repeat(12), `Piloto ${id}`, oldScore, oldTime, time, time + 86400000);
      db.prepare('INSERT INTO survival_scores(player_id,mode,best,best_at) VALUES(?,?,?,?)').run(id, 'classic', newScore, newTime);
    }
    const result = survivalLeaderboard(db, 'a', 'classic', time);
    assert.deepEqual(result.entries.map(row => row.name), ['Piloto c', 'Piloto d', 'Piloto b', 'Piloto a']);
    assert.deepEqual(result.entries.map(row => row.score), [800, 700, 500, 500]);
    assert.deepEqual(result.entries.map(row => row.rank), [1, 2, 3, 3]);
    assert.equal(result.totalPlayers, 4);
    assert.equal(result.me.score, 500);
    assert.equal(result.me.rank, 3);
  } finally { db.close(); }
});
