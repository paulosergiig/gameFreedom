import { test, expect } from '@playwright/test';
async function enter(page, name) {
  await page.goto('/');
  await page.locator('#freestyle-play-button').click();
  await page.locator('#player-name').fill(name);
  await page.locator('#save-name').click();
  await page.locator('#start-freestyle').click();
  await expect(page.locator('#freestyle-screen')).toBeVisible();
}

test('Freestyle: acelerar sozinho perde vidas, encerra e publica o resultado', async ({ page, context }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await enter(page, info.project.name === 'iphone-webkit' ? 'Freestyle Safari' : 'Freestyle Android');
  await expect(page.locator('#freestyle-lives')).toHaveAttribute('aria-label', '3 vidas');
  await expect(page.locator('#freestyle-time')).not.toHaveText('0s', { timeout: 10000 });
  await page.locator('#freestyle-gas').dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', button: 0, bubbles: true, clientX: 770, clientY: 350 });
  await expect(page.locator('#freestyle-lives')).not.toHaveAttribute('aria-label', '3 vidas', { timeout: 14000 });
  await page.screenshot({ path: info.outputPath('freestyle-obstaculos.png') });
  await expect(page.locator('#result-screen')).toBeVisible({ timeout: 22000 });
  await expect(page.locator('#result-stats')).toBeVisible();
  const current = await (await context.request.get('/api/survival/freestyle/leaderboard')).json();
  expect(current.me).not.toBeNull();
  expect((await (await context.request.get('/api/survival/classic/leaderboard')).json()).me).toBeNull();
  await page.locator('#result-screen [data-action="ranking"]').click();
  await expect(page.locator('#my-ranking')).toContainText('Freestyle');
  await page.locator('#ranking-classic').click();
  await expect(page.locator('#my-ranking')).toBeHidden();
  await page.locator('#ranking-freestyle').click();
  await expect(page.locator('#my-ranking')).toContainText('Freestyle');
  expect(errors).toEqual([]);
});

test('Freestyle: gesto de salto mantém acelerador e controles cabem com barras do Safari', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 844, height: 260 });
  await enter(page, 'Salto e Rotacao');
  const canvas = await page.locator('#freestyle-canvas').boundingBox();
  expect(canvas.height).toBeGreaterThanOrEqual(240);
  for (const id of ['#freestyle-gas','#freestyle-brake','#freestyle-back','#freestyle-forward','#freestyle-jump']) {
    const box = await page.locator(id).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(260);
  }
  await expect(page.locator('#freestyle-time')).not.toHaveText('0s', { timeout: 10000 });
  const payloads = [];
  page.on('request', req => { if (req.url().includes('/api/survival/freestyle/') && req.url().endsWith('/sync')) payloads.push(req.postDataJSON()); });
  const gas = page.locator('#freestyle-gas');
  await gas.dispatchEvent('pointerdown', { pointerId: 81, pointerType: 'touch', button: 0, bubbles: true, clientX: 770, clientY: 225 });
  await page.waitForTimeout(650);
  await gas.dispatchEvent('pointermove', { pointerId: 81, pointerType: 'touch', bubbles: true, clientX: 770, clientY: 175 });
  await expect(gas).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(250);
  await page.screenshot({ path: info.outputPath('iphone-paisagem-compacta-salto.png') });
  await page.locator('#freestyle-back').dispatchEvent('pointerdown', { pointerId: 82, pointerType: 'touch', button: 0, bubbles: true });
  await page.locator('#freestyle-back').dispatchEvent('pointercancel', { pointerId: 82, pointerType: 'touch', bubbles: true });
  await expect(gas).toHaveAttribute('aria-pressed', 'true');
  await gas.dispatchEvent('lostpointercapture', { pointerId: 81, pointerType: 'touch', bubbles: true });
  await expect(gas).toHaveAttribute('aria-pressed', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#freestyle-screen')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('freestyle-retrato.png') });
  await page.locator('#exit-freestyle').click();
  await expect(page.locator('#result-stats')).toBeVisible();
  expect(payloads.some(p => p.inputs.some(i => (i.buttons & 17) === 17))).toBe(true);
  expect(payloads.some(p => p.inputs.some(i => i.buttons === 0))).toBe(true);
  expect(errors).toEqual([]);
});
