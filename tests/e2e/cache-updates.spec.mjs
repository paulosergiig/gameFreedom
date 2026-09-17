import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../server.mjs';

async function deploymentFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'freedom-cache-browser-'));
  const publicDir = path.join(directory, 'public');
  await fs.cp(path.resolve('public'), publicDir, { recursive: true });
  const options = { env: {}, publicDir, dbPath: path.join(directory, 'ranking.sqlite') };
  let app = createApp(options), legacy = false, failuresRemaining = 0, deployDuringImport = false;
  let moduleRequests = 0;
  async function upgrade() {
    await fs.appendFile(path.join(publicDir, "styles.css"), "\n:root{--cache-regression:second;}");
    await fs.appendFile(path.join(publicDir, "shared/freestyle-survival.js"), "\n// Release B.\n");
    await app.close(); app = createApp(options);
  }
  const legacyHits = new Map();
  const oldFiles = new Map([
    ['/', ['text/html', '<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"><script type="module" src="/app.js"></script><p>Versão anterior</p>']],
    ['/styles.css', ['text/css', 'body{color:red}.game-choices{display:block}']],
    ['/app.js', ['text/javascript', "import './game.js'; import './freestyle.js'; window.legacyCacheReady = true;"]],
    ['/game.js', ['text/javascript', "import './shared/classic-survival.js';"]],
    ['/freestyle.js', ['text/javascript', "import './shared/freestyle-survival.js';"]],
    ['/shared/classic-survival.js', ['text/javascript', 'export const old = true;']],
    ['/shared/freestyle-survival.js', ['text/javascript', 'export const old = true;']],
  ]);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    if (/^\/static\/[a-f0-9]{64}\/app.js$/.test(url.pathname)) {
      moduleRequests++;
      if (deployDuringImport) { deployDuringImport = false; await upgrade(); }
      if (failuresRemaining > 0) { failuresRemaining--; res.writeHead(503, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end('unavailable'); return; }
    }
    const old = legacy && oldFiles.get(url.pathname);
    if (old) {
      legacyHits.set(url.pathname, (legacyHits.get(url.pathname) || 0) + 1);
      res.writeHead(200, { 'Content-Type': old[0], 'Cache-Control': url.pathname === '/' ? 'no-cache' : 'max-age=14400' });
      res.end(old[1]);
    } else app.server.emit('request', req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    origin, legacyHits, setLegacy(value) { legacy = value; },
    upgrade, failImports(n) { failuresRemaining = n; }, interruptNextImport() { deployDuringImport = true; }, get moduleRequests() { return moduleRequests; },
    async close() {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); await app.close();
      if (!path.resolve(directory).startsWith(path.join(os.tmpdir(), 'freedom-cache-browser-'))) throw new Error('Unexpected test directory');
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
async function identity(context, origin) {
  const session = await (await context.request.get(origin + '/api/session')).json();
  const response = await context.request.post(origin + '/api/player', { headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken }, data: { name: 'Cache Piloto' } });
  expect(response.ok()).toBe(true);
  return { ...session, player: (await response.json()).player };
}
async function expectReady(page) {
  await expect(page.locator('#play-button')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fonts.check('900 20px "Freedom Display"'))).toBe(true);
  // Boot completes only after the stylesheet and complete module graph are available.
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some(e => /\/static\/[a-f0-9]{64}\/shared\/freestyle-rules.js/.test(e.name)))).toBe(true);
}

test('visitante com cache real antigo recebe ambos os jogos e próximas versões sem limpeza', async ({ page, context }) => {
  const f = await deploymentFixture();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const original = await identity(context, f.origin);
    f.setLegacy(true);
    await page.goto(f.origin);
    await page.waitForFunction(() => window.legacyCacheReady);
    const firstHits = f.legacyHits.get('/styles.css');
    await page.goto('about:blank'); await page.goto(f.origin);
    await page.waitForFunction(() => window.legacyCacheReady);
    // No routing/mocking: verify the browser really reused a fresh HTTP cache entry.
    expect(f.legacyHits.get('/styles.css')).toBe(firstHits);
    f.setLegacy(false);
    await page.goto('about:blank'); await page.goto(f.origin);
    await expectReady(page);
    const firstVersion = await page.locator('meta[name="freedom-release"]').getAttribute('content');
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname));
    for (const file of ['styles.css','app.js','game.js','freestyle.js','shared/classic-survival.js','shared/freestyle-survival.js','shared/freestyle-rules.js']) expect(resources).toContain('/static/' + firstVersion + '/' + file);
    expect(f.legacyHits.get('/styles.css')).toBe(firstHits);
    const session = await (await context.request.get(f.origin + '/api/session')).json();
    expect(session.player.tag).toBe(original.player.tag); expect(session.csrfToken).toBe(original.csrfToken);
    for (const [button, start, screen, exit] of [['#play-button','#start-run','#game-screen','#exit-game'],['#freestyle-play-button','#start-freestyle','#freestyle-screen','#exit-freestyle']]) {
      await page.locator(button).click(); await page.locator(start).click();
      await expect(page.locator(screen)).toBeVisible(); await page.locator(exit).click();
      await expect(page.locator('#result-stats')).toBeVisible();
      // Revisit the same URL without clearing cache or changing browser identity.
      await page.goto(f.origin); await expectReady(page);
    }
    await page.goto('about:blank'); await f.upgrade(); await page.goto(f.origin);
    await expectReady(page);
    const secondVersion = await page.locator('meta[name="freedom-release"]').getAttribute('content');
    expect(secondVersion).not.toBe(firstVersion);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cache-regression').trim())).toBe('second');
    expect((await (await context.request.get(f.origin + '/api/session')).json()).player.tag).toBe(original.player.tag);
    expect(errors).toEqual([]);
  } finally { await f.close(); }
});

test('aba retomada detecta versão nova e adia a troca até a partida terminar', async ({ page, context }) => {
  const f = await deploymentFixture();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const original = await identity(context, f.origin);
    await page.goto(f.origin); await expectReady(page);
    const previous = await page.locator('meta[name="freedom-release"]').getAttribute('content');
    await page.locator('#play-button').click(); await page.locator('#start-run').click();
    await expect(page.locator('#game-screen')).toBeVisible();
    await f.upgrade();
    const checked = page.waitForResponse(r => r.url().endsWith('/api/version'));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    const current = (await (await checked).json()).version;
    expect(current).not.toBe(previous);
    await expect(page.locator('#game-screen')).toBeVisible();
    await expect(page.locator('meta[name="freedom-release"]')).toHaveAttribute('content', previous);
    await page.locator('#exit-game').click();
    await expect(page.locator('meta[name="freedom-release"]')).toHaveAttribute('content', current, { timeout: 15000 });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cache-regression').trim())).toBe('second');
    const session = await (await context.request.get(f.origin + '/api/session')).json();
    expect(session.player.tag).toBe(original.player.tag);
    expect(errors).toEqual([]);
  } finally { await f.close(); }
});

for (const scenario of ['deploy', 'temporary-failure']) {
  test('carregamento recupera automaticamente: ' + scenario, async ({ page }) => {
    const f = await deploymentFixture();
    try {
      if (scenario === 'deploy') f.interruptNextImport(); else f.failImports(2);
      await page.goto(f.origin);
      await expect.poll(() => f.moduleRequests, { timeout: 35000 }).toBeGreaterThanOrEqual(scenario === 'deploy' ? 2 : 3);
      await expectReady(page);
      await page.locator('#play-button').click();
      await expect(page.locator('#name-dialog')).toBeVisible();
      if (scenario === 'deploy') expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cache-regression').trim())).toBe('second');
      expect(await page.locator('#toast').isVisible()).toBe(false);
    } finally { await f.close(); }
  });
}
