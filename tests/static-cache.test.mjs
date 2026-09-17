import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createApp } from '../server.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-cache-test-'));
  const publicDir = path.join(root, 'public');
  await fs.mkdir(path.join(publicDir, 'assets'), { recursive: true });
  await fs.mkdir(path.join(publicDir, 'shared'));
  const sources = {
    'index.html': '<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><link rel="icon" href="/favicon.svg"><script type="module" src="/boot.js"></script></head><body><img src="/assets/logo.png"><svg><use href="#local"/></svg></body></html>',
    'styles.css': '@font-face{src:url("/assets/font.ttf")}body{background:url(/assets/hero.webp)}i{background:url("data:image/svg+xml,a")}b{fill:url(#local)}',
    'boot.js': '// boot', 'app.js': "import './game.js'; import './freestyle.js';",
    'game.js': "import './shared/classic-survival.js';",
    'freestyle.js': "import './shared/freestyle-survival.js';",
    'shared/classic-survival.js': 'export const rule = 1;',
    'shared/freestyle-survival.js': "import './freestyle-rules.js';",
    'shared/freestyle-rules.js': 'export const rule = 2;',
    'assets/logo.png': 'logo', 'assets/hero.webp': 'hero', 'assets/font.ttf': 'font',
    'favicon.svg': '<svg/>', '.env': 'private', 'secret.sqlite': 'private',
  };
  await Promise.all(Object.entries(sources).map(([name, value]) => fs.writeFile(path.join(publicDir, name), value)));
  const apps = new Set();
  async function start() {
    const app = createApp({ env: {}, publicDir, dbPath: ':memory:' }); apps.add(app);
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + app.server.address().port;
    const get = (url, options) => fetch(origin + url, options);
    const { version } = await (await get('/api/version')).json();
    return { app, origin, version, get };
  }
  t.after(async () => {
    for (const app of apps) await app.close();
    assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(), 'freedom-cache-test-')));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { root, publicDir, sources, start };
}
function noStore(response) {
  for (const name of ['cache-control', 'cdn-cache-control', 'cloudflare-cdn-cache-control']) assert.equal(response.headers.get(name), 'no-store', name);
}

test('HTML, legacy resources, APIs and errors cannot be cached by browser or CDN', async t => {
  const f = await fixture(t); const server = await f.start();
  for (const url of ['/', '/index.html', '/?v=old', '/styles.css', '/app.js', '/boot.js', '/assets/logo.png', '/api/version', '/api/health', '/api/session', '/api/survival/classic/leaderboard', '/api/survival/freestyle/leaderboard', '/missing.css', '/api/missing']) {
    const response = await server.get(url); noStore(response); await response.arrayBuffer();
  }
  const versionResponse = await server.get('/api/version');
  assert.equal(versionResponse.headers.get('set-cookie'), null);
  assert.deepEqual(await versionResponse.json(), { version: server.version });
  assert.match(server.version, /^[a-f0-9]{64}$/);
  const html = await server.get('/', { headers: { 'If-None-Match': '*', 'If-Modified-Since': new Date().toUTCString() } });
  assert.equal(html.status, 200); assert.ok((await html.text()).includes('<html>'));
});

test('one release identity covers HTML, CSS, both module graphs, image and fonts', async t => {
  const f = await fixture(t); const s = await f.start(); const prefix = '/static/' + s.version;
  const html = await (await s.get('/')).text();
  assert.ok(html.includes('name="freedom-release" content="' + s.version + '"'));
  for (const file of ['styles.css', 'assets/logo.png', 'favicon.svg']) assert.ok(html.includes(prefix + '/' + file));
  assert.ok(html.includes('src="/boot.js"'));
  assert.ok(html.includes('href="#local"'));
  const cssResponse = await s.get(prefix + '/styles.css');
  assert.equal(cssResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const css = await cssResponse.text();
  assert.ok(css.includes(prefix + '/assets/font.ttf')); assert.ok(css.includes(prefix + '/assets/hero.webp'));
  assert.ok(css.includes('data:image/svg+xml,a')); assert.ok(css.includes('url(#local)'));
  const queue = [prefix + '/app.js']; const seen = new Set();
  while (queue.length) {
    const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
    const response = await s.get(url); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    const code = await response.text();
    for (const match of code.matchAll(/import\s+['"]([^'"]+)['"]/g)) {
      const dep = new URL(match[1], s.origin + url).pathname;
      assert.ok(dep.startsWith(prefix + '/')); queue.push(dep);
    }
  }
  assert.equal(seen.size, 6);
  for (const asset of ['assets/logo.png', 'assets/font.ttf', 'favicon.svg']) {
    const response = await s.get(prefix + '/' + asset);
    assert.equal(response.status, 200); assert.equal(await response.text(), f.sources[asset]);
    assert.equal(response.headers.get('cdn-cache-control'), 'public, max-age=31536000, immutable');
  }
});

test('release hash is stable on restart and changes for every public dependency type', async t => {
  const f = await fixture(t); let previous = await f.start();
  assert.equal((await f.start()).version, previous.version);
  for (const file of ['index.html', 'styles.css', 'app.js', 'boot.js', 'shared/freestyle-survival.js', 'assets/font.ttf', 'assets/logo.png']) {
    await fs.appendFile(path.join(f.publicDir, file), '\nchanged');
    const next = await f.start(); assert.notEqual(next.version, previous.version, file); previous = next;
  }
  await fs.appendFile(path.join(f.publicDir, '.env'), 'never exposed');
  assert.equal((await f.start()).version, previous.version);
});

test('a running process serves an immutable snapshot and never returns new bytes for an old release URL', async t => {
  const f = await fixture(t); const first = await f.start();
  const oldUrl = '/static/' + first.version + '/styles.css';
  const oldCss = await (await first.get(oldUrl)).text();
  await fs.writeFile(path.join(f.publicDir, 'styles.css'), 'body{color:gold}');
  assert.equal(await (await first.get(oldUrl)).text(), oldCss);
  assert.equal(await (await first.get('/styles.css')).text(), oldCss);
  const second = await f.start(); assert.notEqual(first.version, second.version);
  const missing = await second.get(oldUrl); assert.equal(missing.status, 404); noStore(missing);
  assert.equal(await (await second.get('/static/' + second.version + '/styles.css')).text(), 'body{color:gold}');
});

test('versioned paths preserve allowlist, traversal, Host checks and exact HEAD lengths', async t => {
  const f = await fixture(t); const s = await f.start(); const prefix = '/static/' + s.version;
  for (const name of ['/.env', '/.git/config', '/secret.sqlite', '/data/freedom.sqlite', '/server.mjs', '/index.html', '/%2e%2e%2fserver.mjs', '/assets/%2e%2e%5c.env']) {
    const response = await s.get(prefix + name);
    assert.ok([400, 404].includes(response.status), name); noStore(response);
  }
  const falseVersion = await s.get('/static/' + '0'.repeat(64) + '/styles.css');
  assert.equal(falseVersion.status, 404); noStore(falseVersion);
  const badHost = await new Promise((resolve, reject) => {
    http.get(s.origin + '/api/version', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve({ status: res.statusCode, headers: new Headers(res.headers) }); }).on('error', reject);
  });
  assert.equal(badHost.status, 421); noStore(badHost);
  for (const url of ['/', '/styles.css', prefix + '/styles.css', prefix + '/assets/logo.png']) {
    const get = await s.get(url); const bytes = await get.arrayBuffer();
    const head = await s.get(url, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), bytes.byteLength);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(head.headers.get('content-type'), get.headers.get('content-type'));
    assert.match(head.headers.get('content-security-policy'), /script-src 'self'/);
  }
});
