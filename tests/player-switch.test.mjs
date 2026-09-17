import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';

const switchPath = '/api/player/switch';
const tables = ['players', 'runs', 'freestyle_scores', 'freestyle_runs', 'survival_scores', 'survival_runs'];
const packet = (toTick = 0, end = true) => ({ version: 'survival-1', fromTick: 0, toTick, inputs: [], end, reason: 'exit' });

async function fixture(t, options = {}) {
  let clock = 1800000000000;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-switch-test-'));
  const publicDir = path.join(directory, 'public');
  const dbPath = path.join(directory, 'ranking.sqlite');
  await fs.mkdir(publicDir);
  await fs.writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>Freedom</title>');
  const failures = [];
  const app = createApp({ env: {}, dbPath, publicDir, now: () => clock, onError: e => failures.push(e), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const expectedOrigin = options.publicUrl ?? origin;
  t.after(async () => {
    await app.close();
    assert.equal(failures.length, 0, failures.map(e => e.stack).join('\n'));
    assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), 'freedom-switch-test-')));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  async function request(url, { client, body, headers = {} } = {}) {
    const requestHeaders = {
      Host: new URL(expectedOrigin).host,
      ...(client ? { Cookie: client.cookie, Origin: expectedOrigin, 'X-CSRF-Token': client.csrf } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers
    };
    for (const key of Object.keys(requestHeaders)) if (requestHeaders[key] === undefined) delete requestHeaders[key];
    return new Promise((resolve, reject) => {
      const req = http.request(origin + url, { method: body === undefined ? 'GET' : 'POST', headers: requestHeaders, agent: false }, res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text), headers: new Headers(res.headers) }));
      });
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  function fromResponse(response) {
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: response.data.csrfToken, tag: response.data.player?.tag };
  }
  async function client(name = 'Ana') {
    const session = await request('/api/session');
    const value = fromResponse(session);
    if (name) {
      const named = await request('/api/player', { client: value, body: { name } });
      assert.equal(named.status, 200);
      value.tag = named.data.player.tag;
    }
    return value;
  }
  function snapshot() {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try { return Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])); }
    finally { db.close(); }
  }
  async function switchPlayer(client, name = 'Bia') {
    return request(switchPath, { client, body: { name, previousTag: client.tag } });
  }
  return { request, client, fromResponse, switchPlayer, snapshot, advance: ms => { clock += ms; } };
}

async function finishedScores(f, client) {
  const classic = (await f.request('/api/runs', { client, body: {} })).data;
  f.advance(63000);
  assert.equal((await f.request(`/api/runs/${classic.runId}/finish`, { client, body: { version: '1', moves: [] } })).status, 200);
  const freestyle = (await f.request('/api/freestyle/runs', { client, body: {} })).data;
  f.advance(93000);
  assert.equal((await f.request(`/api/freestyle/runs/${freestyle.runId}/finish`, { client, body: { version: 'freestyle-1', inputs: [] } })).status, 200);
  const survival = [];
  for (const mode of ['classic', 'freestyle']) {
    const run = (await f.request(`/api/survival/${mode}/runs`, { client, body: {} })).data;
    f.advance(5000);
    const result = await f.request(`/api/survival/${mode}/runs/${run.runId}/sync`, { client, body: packet(120) });
    assert.equal(result.status, 200);
    assert.equal(result.data.finished, true);
    survival.push({ mode, ...run });
  }
  return { classic, freestyle, survival };
}

function assertPrivate(response) {
  for (const header of ['cache-control', 'cdn-cache-control', 'cloudflare-cdn-cache-control']) assert.equal(response.headers.get(header), 'no-store', header);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
}

test('switch creates a new identity without changing either game or historical records', async t => {
  const f = await fixture(t);
  const previous = await f.client();
  const runs = await finishedScores(f, previous);
  const before = f.snapshot();
  const changed = await f.switchPlayer(previous, '  Joa\u0303o   Silva  ');
  assert.equal(changed.status, 201);
  assertPrivate(changed);
  assert.match(changed.headers.get('set-cookie'), /Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000/);
  const current = f.fromResponse(changed);
  assert.notEqual(current.cookie, previous.cookie);
  assert.notEqual(current.csrf, previous.csrf);
  assert.notEqual(current.tag, previous.tag);
  assert.deepEqual(changed.data.player, { name: 'João Silva', best: 0, rank: null, tag: current.tag });
  const session = await f.request('/api/session', { client: current });
  assert.deepEqual(session.data, changed.data);
  assert.equal(session.headers.get('set-cookie'), null, 'returning visitors keep their chosen participant');
  const after = f.snapshot();
  assert.equal(after.players.length, 2);
  assert.deepEqual(after.players[0], before.players[0]);
  for (const table of tables.slice(1)) assert.deepEqual(after[table], before[table], table);
  for (const route of ['/api/leaderboard', '/api/freestyle/leaderboard', '/api/survival/classic/leaderboard', '/api/survival/freestyle/leaderboard']) {
    const board = (await f.request(route, { client: current })).data;
    assert.equal(board.totalPlayers, 1);
    assert.equal(board.me, null);
    assert.equal(board.entries[0].tag, previous.tag);
    assert.equal(board.entries[0].name, 'Ana');
    assert.equal(board.entries[0].isMe, false);
  }
  for (const run of runs.survival) {
    const url = `/api/survival/${run.mode}/runs/${run.runId}`;
    assert.equal((await f.request(url, { client: current })).data.code, 'RUN_NOT_FOUND');
    assert.equal((await f.request(url + '/sync', { client: current, body: packet() })).data.code, 'RUN_NOT_FOUND');
  }
  assert.equal((await f.request(`/api/runs/${runs.classic.runId}/finish`, { client: current, body: { version: '1', moves: [] } })).status, 404);
  assert.equal((await f.request(`/api/freestyle/runs/${runs.freestyle.runId}/finish`, { client: current, body: { version: 'freestyle-1', inputs: [] } })).status, 404);
});

test('equal names create distinct participants and legacy rename remains compatible', async t => {
  const f = await fixture(t);
  const previous = await f.client('Ana');
  const changed = await f.switchPlayer(previous, 'Ana');
  assert.equal(changed.status, 201);
  const current = f.fromResponse(changed);
  assert.notEqual(current.tag, previous.tag);
  const renamed = await f.request('/api/player', { client: current, body: { name: 'Ana Silva' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.player.tag, current.tag);
  assert.equal(renamed.headers.get('set-cookie'), null);
  assert.deepEqual(f.snapshot().players.map(player => [player.tag, player.name]), [[previous.tag, 'Ana'], [current.tag, 'Ana Silva']]);
});

test('validation and a stale participant tag cannot change session or database', async t => {
  const f = await fixture(t);
  const c = await f.client();
  const before = f.snapshot();
  for (const [body, code] of [
    [{}, 'INVALID_BODY'], [{ name: 'Bia' }, 'INVALID_BODY'], [{ previousTag: c.tag }, 'INVALID_BODY'],
    [{ name: 'Bia', previousTag: c.tag, best: 1000 }, 'INVALID_BODY'], [{ name: 'Bia', previousTag: 1 }, 'INVALID_BODY'],
    [{ name: 'Bia', previousTag: '000000000000' }, 'PLAYER_CHANGED'],
    ...['', 'x', 'a'.repeat(21), '<b>Ana</b>', 'Honda', '😈', null].map(name => [{ name, previousTag: c.tag }, 'INVALID_NAME'])
  ]) {
    const response = await f.request(switchPath, { client: c, body });
    assert.equal(response.status, code === 'PLAYER_CHANGED' ? 409 : 400);
    assert.equal(response.data.code, code);
    assert.equal(response.headers.get('set-cookie'), null);
    assertPrivate(response);
    assert.deepEqual(f.snapshot(), before);
  }
  const changed = await f.switchPlayer(c);
  const current = f.fromResponse(changed);
  const stale = await f.request(switchPath, { client: current, body: { name: 'Caio', previousTag: c.tag } });
  assert.equal(stale.data.code, 'PLAYER_CHANGED');
  assert.equal(f.snapshot().players.length, 2);
});

test('switch enforces named session, Host, Origin, CSRF and cross-site protections with Secure cookies', async t => {
  const f = await fixture(t, { publicUrl: 'https://game.freedom.dev.br' });
  const unnamed = await f.client(null);
  const noName = await f.request(switchPath, { client: unnamed, body: { name: 'Bia', previousTag: '000000000000' } });
  assert.equal(noName.data.code, 'NAME_REQUIRED');
  const c = await f.client('Ana');
  const body = { name: 'Bia', previousTag: c.tag };
  const before = f.snapshot();
  assert.equal((await f.request(switchPath, { body })).status, 401);
  for (const [headers, status] of [
    [{ Host: 'evil.example' }, 421], [{ Origin: 'https://evil.example' }, 403], [{ Origin: undefined }, 403],
    [{ 'X-CSRF-Token': undefined }, 403], [{ 'X-CSRF-Token': 'invalid' }, 403],
    [{ 'Sec-Fetch-Site': 'cross-site' }, 403], [{ 'Content-Type': 'text/plain' }, 415]
  ]) {
    const response = await f.request(switchPath, { client: c, body, headers });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('set-cookie'), null);
    assertPrivate(response);
  }
  assert.deepEqual(f.snapshot(), before);
  const changed = await f.switchPlayer(c);
  assert.equal(changed.status, 201);
  assert.match(changed.headers.get('set-cookie'), /; Secure$/);
  assert.equal(changed.headers.get('strict-transport-security'), 'max-age=31536000');
  const current = f.fromResponse(changed);
  assert.equal((await f.request('/api/player', { client: current, body: { name: 'Caio' }, headers: { 'X-CSRF-Token': c.csrf } })).status, 403);
  assert.equal((await f.request('/api/player', { client: c, body: { name: 'Caio' }, headers: { 'X-CSRF-Token': current.csrf } })).status, 403);
  assert.equal(f.snapshot().players.at(-1).name, 'Bia');
});

for (const [label, route, duration] of [
  ['classic survival', '/api/survival/classic/runs', 30000], ['freestyle survival', '/api/survival/freestyle/runs', 30000],
  ['classic legacy', '/api/runs', 180000], ['freestyle legacy', '/api/freestyle/runs', 240000]
]) {
  test(`${label} blocks a switch while active and permits it after safe finalization or expiry`, async t => {
    const f = await fixture(t);
    const c = await f.client();
    const run = await f.request(route, { client: c, body: {} });
    assert.equal(run.status, 201);
    const before = f.snapshot();
    const response = await f.switchPlayer(c);
    assert.equal(response.status, 409);
    assert.equal(response.data.code, 'RUN_ACTIVE');
    assert.match(response.data.error, /Encerre a partida/);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(f.snapshot(), before);
    if (route.includes('survival')) {
      f.advance(5000);
      assert.equal((await f.request(`${route}/${run.data.runId}/sync`, { client: c, body: packet(120, false) })).status, 200);
    }
    f.advance(duration);
    const changed = await f.switchPlayer(c);
    assert.equal(changed.status, 201, JSON.stringify(changed.data));
    assert.equal(f.snapshot().players.length, 2);
    if (route.includes('survival')) {
      const saved = (await f.request(`${route}/${run.data.runId}`, { client: c })).data;
      assert.equal(saved.finished, true);
      assert.equal(saved.result.elapsedTicks, 120);
      assert.equal(saved.result.endReason, 'disconnect');
      assert.equal(f.snapshot().survival_scores.length, 1);
    }
  });
}

test('switch shares the existing IP creation budget and cannot bypass it with fresh identities', async t => {
  const f = await fixture(t);
  let current = await f.client();
  for (let i = 0; i < 100; i++) {
    const result = await f.switchPlayer(current, 'Visitante');
    assert.equal(result.status, 201, `switch ${i}`);
    current = f.fromResponse(result);
  }
  for (let i = 0; i < 79; i++) assert.equal((await f.request('/api/session')).status, 200);
  const before = f.snapshot();
  assert.equal(before.players.length, 180);
  const limited = await f.switchPlayer(current);
  assert.equal(limited.status, 429);
  assert.equal(limited.data.code, 'RATE_LIMIT');
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(limited.headers.get('set-cookie'), null);
  assert.deepEqual(f.snapshot(), before);
  assert.equal((await f.request('/api/session', { client: current })).status, 200);
  f.advance(600000);
  assert.equal((await f.switchPlayer(current)).status, 201);
  assert.equal(f.snapshot().players.length, 181);
});
