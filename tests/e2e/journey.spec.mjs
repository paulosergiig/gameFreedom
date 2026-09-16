import { test, expect } from '@playwright/test';
import { createSurvivalState, stepSurvivalState } from '../../public/shared/classic-survival.js';
const numeric = value => Number(value.replace(/\D/g, ''));
async function enter(page, name = 'Piloto Novo') {
  await page.goto('/');
  await page.locator('#play-button').click();
  await page.locator('#player-name').fill(name);
  await page.locator('#save-name').click();
  await page.locator('#start-run').click();
  await expect(page.locator('#game-screen')).toBeVisible();
}

test('dois jogos visíveis na entrada estreita, privacidade e fontes locais', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('900 20px "Freedom Display"'))).toBe(true);
  for (const id of ['#play-button', '#freestyle-play-button']) {
    const box = await page.locator(id).boundingBox();
    expect(box.y + box.height).toBeLessThan(740);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#home-screen')).not.toContainText('NOVO JOGO');
  await page.screenshot({ path: info.outputPath('inicio-dois-jogos.png'), fullPage: true });
  await page.locator('footer [data-action="privacy"]').click();
  await expect(page.locator('#privacy-dialog')).toContainText('Não há premiação');
  await page.locator('#privacy-dialog [data-close]').last().click();
  await page.locator('#play-button').click();
  await page.locator('#player-name').fill('<script>');
  await page.locator('#save-name').click();
  await expect(page.locator('#name-error')).not.toBeEmpty();
  await page.locator('#name-dialog [data-close]').click();
});

test('saída salva pontos, falha e recuperação após recarregar, ranking público', async ({ page, context, request }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const name = info.project.name === 'iphone-webkit' ? 'Saida Safari' : 'Saida Android';
  const checkpoints = [];
  page.on('request', req => { if (req.url().includes('/api/survival/classic/') && req.url().endsWith('/sync')) checkpoints.push(req.postDataJSON()); });
  const starting = page.waitForResponse(r => r.url().endsWith('/api/survival/classic/runs') && r.request().method() === 'POST');
  await enter(page, name);
  const run = await (await starting).json();
  await expect(page.locator('#classic-lives')).toHaveAttribute('aria-label', '3 vidas');
  await expect(page.locator('#hud-time')).not.toHaveText('0s', { timeout: 10000 });
  await page.locator('#steer-left').click();
  await page.waitForTimeout(1100);
  await page.locator('#steer-right').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath('desafio-vidas.png') });
  let dropped = false;
  await page.route('**/api/survival/classic/runs/*/sync', async route => {
    if (route.request().postDataJSON().end) { dropped = true; await route.abort('failed'); }
    else await route.continue();
  });
  await page.locator('#exit-game').click();
  await expect(page.locator('#result-screen')).toBeVisible();
  await expect(page.locator('#retry-result')).toBeVisible();
  expect(dropped).toBe(true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('freedom-survival-pending-v1')));
  const inputs = new Map(checkpoints.flatMap(p => p.inputs).map(i => [i.tick, i.direction]));
  const replay = createSurvivalState(run.seed);
  while (replay.tick < saved.body.toTick) stepSurvivalState(replay, inputs.get(replay.tick) || 0);
  await page.unroute('**/api/survival/classic/runs/*/sync');
  await page.reload();
  await expect(page.locator('#result-stats')).toBeVisible();
  expect(numeric(await page.locator('#result-score').textContent())).toBe(replay.score);
  expect(await page.evaluate(() => localStorage.getItem('freedom-survival-pending-v1'))).toBeNull();
  await page.locator('#result-screen [data-action="ranking"]').click();
  await expect(page.locator('#my-ranking')).toContainText(name);
  const board = await (await context.request.get('/api/survival/classic/leaderboard')).json();
  expect(board.me.name).toBe(name);
  expect((await (await request.get('/api/survival/classic/leaderboard')).json()).record).toBeGreaterThanOrEqual(board.me.score);
  await page.screenshot({ path: info.outputPath('ranking-preservado.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('ocultar salva a partida e sair antes da largada não cria recorde', async ({ page, context }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await enter(page, 'Saida Antes Largada');
  await page.locator('#exit-game').click();
  await expect(page.locator('#result-stats')).toBeVisible();
  await expect(page.locator('#result-status')).toContainText('antes da largada');
  expect((await (await context.request.get('/api/survival/classic/leaderboard')).json()).me).toBeNull();
  await page.locator('#play-again').click();
  await expect(page.locator('#hud-time')).not.toHaveText('0s', { timeout: 10000 });
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#result-stats')).toBeVisible();
  const board = await (await context.request.get('/api/survival/classic/leaderboard')).json();
  expect(board.me.score).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('navegação real para outra página encerra e preserva o checkpoint confirmado', async ({ page, context }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const starting = page.waitForResponse(r => r.url().endsWith('/api/survival/classic/runs') && r.request().method() === 'POST');
  await enter(page, 'Navegacao Real');
  const run = await (await starting).json();
  // Wait for an actual server checkpoint before leaving the game document.
  await expect.poll(async () => (await (await context.request.get('/api/survival/classic/runs/' + run.runId)).json()).tick, { timeout: 12000 }).toBeGreaterThan(0);
  const before = await (await context.request.get('/api/survival/classic/runs/' + run.runId)).json();
  await page.goto('about:blank');
  await page.goto('/');
  await expect.poll(async () => (await (await context.request.get('/api/survival/classic/runs/' + run.runId)).json()).finished, { timeout: 10000 }).toBe(true);
  const after = await (await context.request.get('/api/survival/classic/runs/' + run.runId)).json();
  expect(after.tick).toBeGreaterThanOrEqual(before.tick);
  expect(after.result).toBeDefined();
  const board = await (await context.request.get('/api/survival/classic/leaderboard')).json();
  expect(board.me).not.toBeNull();
  expect(board.me.score).toBe(after.result.best);
  expect(errors).toEqual([]);
});
