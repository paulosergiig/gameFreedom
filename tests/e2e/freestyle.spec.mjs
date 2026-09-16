import { test, expect } from '@playwright/test';
import { simulateFreestyleRun } from '../../public/shared/freestyle-rules.js';

const number = value => Number(value.replace(/\D/g, ''));

test('Freestyle: pilotagem, replay consistente, reenvio e ranking separado', async ({ page, context }, testInfo) => {
  test.setTimeout(145000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.locator('#freestyle-play-button').click();
  await page.locator('#player-name').fill(testInfo.project.name === 'iphone-webkit' ? 'Freestyle Safari' : 'Freestyle Android');
  await page.locator('#save-name').click();
  await expect(page.locator('#freestyle-tutorial-dialog')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('freestyle-instrucoes.png'), fullPage: true });
  const starting = page.waitForResponse(response => response.url().endsWith('/api/freestyle/runs') && response.request().method() === 'POST');
  let payload, lastDisplayedScore;
  let firstFinish = true;
  await page.route('**/api/freestyle/runs/*/finish', async route => {
    payload = route.request().postDataJSON();
    if (firstFinish) {
      firstFinish = false;
      lastDisplayedScore = number(await page.locator('#freestyle-score').textContent());
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#start-freestyle').click();
  const run = await (await starting).json();
  await expect(page.locator('#freestyle-screen')).toBeVisible();
  await expect(page.locator('#freestyle-time')).not.toHaveText('90s', { timeout: 10000 });
  const gas = await page.locator('#freestyle-gas').boundingBox();
  await page.mouse.move(gas.x + gas.width / 2, gas.y + gas.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(9000);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(1700);
  await page.screenshot({ path: testInfo.outputPath('freestyle-pista.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Releasing beyond the button must still release its captured pointer.
  await page.mouse.move(420, 90);
  await page.mouse.up();
  await expect(page.locator('#freestyle-gas')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(3000);
  await page.keyboard.up('ArrowDown');
  await expect(page.locator('#result-screen')).toBeVisible({ timeout: 105000 });
  await expect(page.locator('#retry-result')).toBeVisible();
  expect(payload.version).toBe('freestyle-1');
  expect(payload.inputs.length).toBeGreaterThanOrEqual(4);
  const replay = simulateFreestyleRun(run.seed, payload.inputs);
  expect(lastDisplayedScore).toBe(replay.score);
  await page.locator('#retry-result').click();
  await expect(page.locator('#result-stats')).toBeVisible();
  expect(number(await page.locator('#result-score').textContent())).toBe(replay.score);
  await page.locator('#result-screen [data-action="ranking"]').click();
  await expect(page.locator('#ranking-screen')).toBeVisible();
  await expect(page.locator('#my-ranking')).toContainText('Freestyle');
  const freestyle = await (await context.request.get('/api/freestyle/leaderboard')).json();
  const classic = await (await context.request.get('/api/leaderboard')).json();
  expect(freestyle.me.score).toBe(replay.score);
  expect(classic.me).toBeNull();
  await page.locator('#ranking-classic').click();
  await expect(page.locator('#my-ranking')).toBeHidden();
  await page.locator('#ranking-freestyle').click();
  await expect(page.locator('#my-ranking')).toContainText('Freestyle');
  await page.screenshot({ path: testInfo.outputPath('freestyle-ranking.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('Freestyle: rotação mantém a partida e interrupção não publica pontos', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#freestyle-play-button').click();
  await page.locator('#player-name').fill('Freestyle Rotacao');
  await page.locator('#save-name').click();
  await expect(page.locator('#freestyle-tutorial-dialog')).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('#start-freestyle').click();
  await expect(page.locator('#freestyle-screen')).toBeVisible();
  // Independent touches release independently, including browser cancellations.
  await page.locator('#freestyle-gas').dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', button: 0, bubbles: true });
  await page.locator('#freestyle-back').dispatchEvent('pointerdown', { pointerId: 42, pointerType: 'touch', button: 0, bubbles: true });
  await expect(page.locator('#freestyle-gas')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#freestyle-back')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#freestyle-back').dispatchEvent('pointercancel', { pointerId: 42, pointerType: 'touch', bubbles: true });
  await expect(page.locator('#freestyle-back')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#freestyle-gas')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#freestyle-gas').dispatchEvent('lostpointercapture', { pointerId: 41, pointerType: 'touch', bubbles: true });
  await expect(page.locator('#freestyle-gas')).toHaveAttribute('aria-pressed', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#interrupt-dialog')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#interrupt-dialog')).toBeVisible();
  await page.locator('#leave-interrupted').click();
  await expect(page.locator('#home-screen')).toBeVisible();
  const board = await (await context.request.get('/api/freestyle/leaderboard')).json();
  expect(board.me).toBeNull();
  expect(errors).toEqual([]);
});
