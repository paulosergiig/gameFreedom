import { test, expect } from '@playwright/test';
const ORIGIN = 'http://127.0.0.1:39177';
const session = async context => (await (await context.request.get('/api/session')).json());
async function named(page, context, name = 'Piloto Original') {
  const first = await session(context);
  const response = await context.request.post('/api/player', { headers: { Origin: ORIGIN, 'X-CSRF-Token': first.csrfToken }, data: { name } });
  expect(response.ok()).toBe(true);
  await page.goto('/');
  await expect(page.locator('#current-player-name')).toHaveText(name);
  return { ...await session(context), cookie: (await context.cookies()).find(cookie => cookie.name === 'freedom_session').value };
}
async function newPlayer(page, name) {
  await page.locator('#switch-player').click();
  await expect(page.locator('#switch-player-dialog')).toBeVisible();
  await page.locator('#switch-player-name').fill(name);
  await page.locator('#confirm-player-switch').click();
  await expect(page.locator('#switch-player-dialog')).not.toBeVisible();
  await expect(page.locator('#current-player-name')).toHaveText(name);
}
async function playAndExit(page, mode) {
  await page.goto('/');
  const free = mode === 'freestyle';
  await page.locator(free ? '#freestyle-play-button' : '#play-button').click();
  await page.locator(free ? '#start-freestyle' : '#start-run').click();
  await expect(page.locator('#player-bar')).toBeHidden();
  await expect(page.locator(free ? '#freestyle-time' : '#hud-time')).not.toHaveText('0s', { timeout: 12000 });
  if (free) {
    await page.locator('#freestyle-gas').dispatchEvent('pointerdown', { pointerId: 321, pointerType: 'touch', button: 0, bubbles: true, clientX: 300, clientY: 680 });
    await page.waitForTimeout(900);
  }
  await page.locator(free ? '#exit-freestyle' : '#exit-game').click();
  await expect(page.locator('#result-stats')).toBeVisible();
  await expect(page.locator('#player-bar')).toBeVisible();
}

test('troca mantém os recordes das duas pistas, cancelar e voltar preservam o jogador', async ({ page, context }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const original = await named(page, context);
  const boards = {};
  for (const mode of ['classic', 'freestyle']) {
    await playAndExit(page, mode);
    boards[mode] = (await (await context.request.get('/api/survival/' + mode + '/leaderboard')).json()).me;
    expect(boards[mode].name).toBe('Piloto Original');
  }
  await page.locator('#switch-player').click();
  await expect(page.locator('#previous-player-name')).toHaveText('Piloto Original');
  await page.locator('#switch-player-name').fill('Nome Cancelado');
  await page.locator('#keep-player').click();
  expect((await session(context)).player.tag).toBe(original.player.tag);
  await expect(page.locator('#current-player-name')).toHaveText('Piloto Original');
  await newPlayer(page, 'Nova Pilota');
  const next = await session(context);
  expect(next.player.tag).not.toBe(original.player.tag);
  expect(next.csrfToken).not.toBe(original.csrfToken);
  for (const mode of ['classic', 'freestyle']) {
    const board = await (await context.request.get('/api/survival/' + mode + '/leaderboard')).json();
    expect(board.me).toBeNull();
    const previous = await (await context.request.get('/api/survival/' + mode + '/leaderboard', { headers: { Cookie: 'freedom_session=' + original.cookie } })).json();
    expect(previous.me.name).toBe(boards[mode].name);
    expect(previous.me.score).toBe(boards[mode].score);
    expect(previous.me.tag).toBe(original.player.tag);
    await playAndExit(page, mode);
    const after = await (await context.request.get('/api/survival/' + mode + '/leaderboard')).json();
    expect(after.me.name).toBe('Nova Pilota');
    expect(after.me.tag).toBe(next.player.tag);
  }
  await page.goto('/');
  await expect(page.locator('#current-player-name')).toHaveText('Nova Pilota');
  expect((await session(context)).player.tag).toBe(next.player.tag);
  expect(errors).toEqual([]);
});

test('pontuação pendente impede troca até a confirmação', async ({ page, context }) => {
  const original = await named(page, context, 'Pontos Pendentes');
  await page.locator('#play-button').click(); await page.locator('#start-run').click();
  await expect(page.locator('#hud-time')).not.toHaveText('0s', { timeout: 12000 });
  await page.route('**/api/survival/classic/runs/*/sync', route => route.request().postDataJSON().end ? route.abort('failed') : route.continue());
  await page.locator('#exit-game').click(); await expect(page.locator('#retry-result')).toBeVisible();
  await page.locator('#switch-player').click();
  await expect(page.locator('#toast')).toContainText('pontuação pendente');
  await expect(page.locator('#switch-player-dialog')).toBeHidden();
  expect((await session(context)).player.tag).toBe(original.player.tag);
  expect(await page.evaluate(() => localStorage.getItem('freedom-survival-pending-v1'))).not.toBeNull();
  await page.unroute('**/api/survival/classic/runs/*/sync');
  await newPlayer(page, 'Depois dos Pontos');
  expect(await page.evaluate(() => localStorage.getItem('freedom-survival-pending-v1'))).toBeNull();
});

test('nome inválido e falha de rede mantêm a participação atual; nome igual cria outra', async ({ page, context }) => {
  const original = await named(page, context, 'Mesmo Apelido');
  await page.locator('#switch-player').click(); await page.locator('#switch-player-name').fill('<script>');
  await page.locator('#confirm-player-switch').click();
  await expect(page.locator('#switch-player-error')).not.toBeEmpty();
  expect((await session(context)).player.tag).toBe(original.player.tag);
  await page.route('**/api/player/switch', route => route.abort('failed'));
  await page.locator('#switch-player-name').fill('Outro Piloto'); await page.locator('#confirm-player-switch').click();
  await expect(page.locator('#switch-player-error')).toContainText('conexão');
  expect((await session(context)).player.tag).toBe(original.player.tag);
  await page.unroute('**/api/player/switch');
  await page.locator('#switch-player-name').fill('Mesmo Apelido'); await page.locator('#confirm-player-switch').click();
  await expect(page.locator('#switch-player-dialog')).toBeHidden();
  expect((await session(context)).player.tag).not.toBe(original.player.tag);
});

test('resposta perdida após instalar o cookie é recuperada sem repetir a troca', async ({ page, context }) => {
  const original = await named(page, context, 'Antes da Resposta');
  let posts = 0;
  await page.route('**/api/player/switch', async route => {
    posts++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort('failed');
  });
  await newPlayer(page, 'Resposta Recuperada');
  expect(posts).toBe(1);
  expect((await session(context)).player.tag).not.toBe(original.player.tag);
});

test('outra aba atualiza a identidade e partida ativa bloqueia troca', async ({ page, context }) => {
  await named(page, context, 'Piloto Duas Abas');
  const other = await context.newPage();
  await other.goto('/'); await expect(other.locator('#current-player-name')).toHaveText('Piloto Duas Abas');
  await newPlayer(page, 'Nova Identidade');
  await expect(other.locator('#current-player-name')).toHaveText('Nova Identidade');
  const next = await session(context);
  const active = await context.request.post('/api/survival/freestyle/runs', { headers: { Origin: ORIGIN, 'X-CSRF-Token': next.csrfToken }, data: {} });
  expect(active.status()).toBe(201);
  const run = await active.json();
  await other.locator('#switch-player').click(); await other.locator('#switch-player-name').fill('Partida em Andamento');
  await other.locator('#confirm-player-switch').click();
  await expect(other.locator('#switch-player-error')).toContainText('partida');
  expect((await session(context)).player.tag).toBe(next.player.tag);
  const finish = await context.request.post('/api/survival/freestyle/runs/' + run.runId + '/sync', { headers: { Origin: ORIGIN, 'X-CSRF-Token': next.csrfToken }, data: { version: run.version, fromTick: 0, toTick: 0, inputs: [], end: true, reason: 'exit' } });
  expect(finish.ok()).toBe(true);
  await other.locator('#confirm-player-switch').click(); await expect(other.locator('#switch-player-dialog')).toBeHidden();
  await expect(page.locator('#current-player-name')).toHaveText('Partida em Andamento');
  await other.close();
});

test('troca é utilizável em celular, tablet e computador', async ({ page, context }, info) => {
  await named(page, context, 'Piloto Nome Comprido');
  for (const [width, height] of [[360, 740], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('#player-bar')).toBeVisible();
    const box = await page.locator('#switch-player').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#switch-player').click();
    await expect(page.locator('#switch-player-name')).toBeFocused();
    await page.screenshot({ path: info.outputPath('trocar-jogador-' + width + '.png') });
    await page.locator('#keep-player').click();
    await expect(page.locator('#current-player-name')).toHaveText('Piloto Nome Comprido');
  }
});


test('checkpoint de outra janela ativa não é encerrado ao abrir a troca', async ({ page, context }) => {
  await named(page, context, 'Janelas Separadas');
  const playing = await context.newPage();
  await playing.goto('/');
  // Model two visible windows: focusing the switch UI must not imply hiding the playing window.
  await playing.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }));
  const starting = playing.waitForResponse(r => r.url().endsWith('/api/survival/freestyle/runs') && r.request().method() === 'POST');
  await playing.locator('#freestyle-play-button').click(); await playing.locator('#start-freestyle').click();
  const run = await (await starting).json();
  await expect.poll(async () => JSON.parse(await page.evaluate(() => localStorage.getItem('freedom-survival-pending-v1')))?.inProgress).toBe(true);
  await page.locator('#switch-player').click();
  await page.locator('#switch-player-name').fill('Outra Pessoa'); await page.locator('#confirm-player-switch').click();
  await expect(page.locator('#switch-player-error')).toContainText('partida');
  expect((await (await context.request.get('/api/survival/freestyle/runs/' + run.runId)).json()).finished).toBe(false);
  await expect(playing.locator('#freestyle-screen')).toBeVisible();
  // A newly opened document must also leave that live checkpoint alone.
  const arriving = await context.newPage(); await arriving.goto('/');
  await expect(arriving.locator('#current-player-name')).toHaveText('Janelas Separadas');
  await expect(arriving.locator('#home-screen')).toBeVisible();
  expect((await (await context.request.get('/api/survival/freestyle/runs/' + run.runId)).json()).finished).toBe(false);
  await playing.locator('#exit-freestyle').click(); await expect(playing.locator('#result-stats')).toBeVisible();
  await page.locator('#confirm-player-switch').click(); await expect(page.locator('#switch-player-dialog')).toBeHidden();
  await expect(page.locator('#current-player-name')).toHaveText('Outra Pessoa');
  await arriving.close(); await playing.close();
});
