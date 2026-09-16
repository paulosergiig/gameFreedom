import { test, expect } from '@playwright/test';

test('partida completa, falha no envio, reenvio e ranking compartilhado', async ({ page, context, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#play-button')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('01-inicio.png'), fullPage: true });

  await page.locator('#play-button').click();
  await expect(page.locator('#name-dialog')).toBeVisible();
  await page.locator('#player-name').fill('<script>');
  await page.locator('#save-name').click();
  await expect(page.locator('#name-error')).not.toBeEmpty();

  const name = testInfo.project.name === 'iphone-webkit' ? 'Piloto Safari' : 'Piloto Android';
  await page.locator('#player-name').fill(name);
  await page.locator('#save-name').click();
  await expect(page.locator('#tutorial-dialog')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('02-instrucoes.png'), fullPage: true });

  let firstFinish = true;
  await page.route('**/api/runs/*/finish', async route => {
    if (firstFinish) { firstFinish = false; await route.abort('failed'); }
    else await route.continue();
  });
  await page.locator('#start-run').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#hud-time')).not.toHaveText('60s', { timeout: 9000 });
  await page.locator('#steer-left').click();
  await page.waitForTimeout(800);
  await page.locator('#steer-right').click();
  await page.waitForTimeout(900);
  await page.locator('#steer-right').click();
  await page.screenshot({ path: testInfo.outputPath('03-pista.png'), fullPage: true });

  await expect(page.locator('#result-screen')).toBeVisible({ timeout: 75000 });
  await expect(page.locator('#retry-result')).toBeVisible();
  await page.locator('#retry-result').click();
  await expect(page.locator('#result-stats')).toBeVisible();
  await expect(page.locator('#retry-result')).toBeHidden();
  await expect(page.locator('#result-score')).toHaveText(/[0-9]/);
  await page.screenshot({ path: testInfo.outputPath('04-resultado.png'), fullPage: true });
  await page.locator('#result-screen [data-action="ranking"]').click();
  await expect(page.locator('#ranking-screen')).toBeVisible();
  await expect(page.locator('#my-ranking')).toContainText(name);
  await page.screenshot({ path: testInfo.outputPath('05-ranking.png'), fullPage: true });
  const leaderboard = await context.request.get('/api/leaderboard');
  const board = await leaderboard.json();
  expect(board.entries.some(p => p.name === name)).toBe(true);
  expect(board.me.name).toBe(name);

  // A second, unauthenticated client sees the same public results.
  const independent = await request.get('/api/leaderboard');
  expect((await independent.json()).record).toBeGreaterThanOrEqual(board.me.score);
  expect(errors).toEqual([]);
});

test('privacidade, layout estreito e cancelamento antes da partida', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.locator('footer [data-action="privacy"]').click();
  await expect(page.locator('#privacy-dialog')).toBeVisible();
  await expect(page.locator('#privacy-dialog')).toContainText('Não há premiação');
  await page.locator('#privacy-dialog [data-close]').last().click();
  await page.locator('#play-button').click();
  await expect(page.locator('#name-dialog')).toBeVisible();
  await page.locator('#name-dialog [data-close]').click();
  await expect(page.locator('#name-dialog')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('interrupção não publica resultado e tipografia local carrega', async ({ page, context }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('900 20px "Freedom Display"'))).toBe(true);
  await page.locator('#play-button').click();
  await page.locator('#player-name').fill('Piloto Interrompido');
  await page.locator('#save-name').click();
  await page.locator('#start-run').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await page.locator('#sound-button').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#interrupt-dialog')).toBeVisible();
  await page.locator('#leave-interrupted').click();
  await expect(page.locator('#home-screen')).toBeVisible();
  const response = await context.request.get('/api/leaderboard');
  expect((await response.json()).me).toBeNull();
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('06-inicio-fontes-locais.png'), fullPage: true });
});
