import { FreedomGame } from './game.js';
import { FreestyleGame } from './freestyle.js';

const $ = (selector) => document.querySelector(selector);
const format = (value) => new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
const modeOf = (mode) => mode === 'freestyle' ? 'freestyle' : 'classic';
const apiBase = (mode) => mode === 'freestyle' ? '/api/freestyle' : '/api';
const state = { session: null, sessionPromise: null, game: null, activeRun: null, screen: 'home', selectedMode: 'classic', resultMode: 'classic', rankingMode: 'classic', opening: false, starting: false, savingName: false, finishing: false, pending: null, sound: false, tutorialSeen: { classic: false, freestyle: false }, rankingRequest: 0, toastTimer: 0 };
const heldPointers = new Map();
const heldKeys = new Map();
const pulseTimers = new Map();
const freestyleButtons = [['#freestyle-gas', 1], ['#freestyle-brake', 2], ['#freestyle-back', 4], ['#freestyle-forward', 8]];

class ApiError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}
async function request(path, { method = 'GET', body, csrf = true, timeout = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrf && state.session) headers['X-CSRF-Token'] = state.session.csrfToken;
    const response = await fetch(path, { method, headers, credentials: 'same-origin', cache: 'no-store', signal: controller.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(data.error || 'Não conseguimos concluir agora. Tente novamente.', data.code, response.status);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('A conexão demorou um pouco. Confira sua internet e tente novamente.', 'TIMEOUT', 0);
    if (error instanceof ApiError) throw error;
    throw new ApiError('Sem conexão com a pista. Confira sua internet e tente novamente.', 'NETWORK', 0);
  } finally { clearTimeout(timer); }
}
async function ensureSession() {
  if (state.session) return state.session;
  if (!state.sessionPromise) {
    state.sessionPromise = request('/api/session', { csrf: false }).then((data) => {
      state.session = data;
      $('#retention-days').textContent = String(data.privacy?.retentionDays || 30);
      return data;
    }).finally(() => { state.sessionPromise = null; });
  }
  return state.sessionPromise;
}
function toast(message) {
  clearTimeout(state.toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  state.toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
}
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close()); }
function showDialog(id) {
  const dialog = $(id);
  if (id === '#privacy-dialog') {
    const tag = state.session?.player?.tag;
    $('#privacy-identity').hidden = !tag;
    $('#privacy-player-code').textContent = tag || '';
  }
  if (!dialog.open) dialog.showModal();
}
function showScreen(name, focus = true) {
  state.screen = name;
  document.querySelectorAll('.screen').forEach((screen) => { screen.hidden = screen.id !== `${name}-screen`; });
  const playing = name === 'game' || name === 'freestyle';
  document.body.classList.toggle('is-playing', playing);
  $('#site-header').hidden = playing;
  if (!playing) window.scrollTo({ top: 0, behavior: 'instant' });
  if (focus && !playing) {
    const title = $(`#${name}-screen h1`);
    if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
  }
}
async function play(mode = 'classic') {
  if (state.opening || state.starting || state.finishing || state.activeRun) return;
  state.opening = true;
  state.selectedMode = modeOf(mode);
  const buttons = document.querySelectorAll('[data-action="play"], [data-action="play-freestyle"]');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const session = await ensureSession();
    closeDialogs();
    if (!session.player) {
      $('#name-error').textContent = '';
      showDialog('#name-dialog');
      return;
    }
    if (state.tutorialSeen[state.selectedMode]) await startRun(state.selectedMode);
    else openTutorial(state.selectedMode);
  } catch (error) { toast(error.message); }
  finally { state.opening = false; buttons.forEach((button) => { button.disabled = false; }); }
}
function openTutorial(mode = state.selectedMode) {
  state.selectedMode = modeOf(mode);
  if (mode === 'freestyle') {
    $('#freestyle-start-error').textContent = '';
    showDialog('#freestyle-tutorial-dialog');
  } else {
    $('#tutorial-name').textContent = state.session?.player?.name || 'PILOTO';
    $('#start-error').textContent = '';
    showDialog('#tutorial-dialog');
  }
}
async function saveName(event) {
  event.preventDefault();
  if (state.savingName) return;
  const input = $('#player-name');
  const name = input.value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 20) {
    $('#name-error').textContent = 'Escolha um apelido entre 2 e 20 caracteres.';
    input.focus();
    return;
  }
  state.savingName = true;
  $('#save-name').disabled = true;
  $('#save-name').setAttribute('aria-busy', 'true');
  $('#name-error').textContent = '';
  try {
    await ensureSession();
    const response = await request('/api/player', { method: 'POST', body: { name } });
    state.session.player = response.player;
    $('#name-dialog').close();
    openTutorial();
  } catch (error) { $('#name-error').textContent = error.message; }
  finally {
    state.savingName = false;
    $('#save-name').disabled = false;
    $('#save-name').removeAttribute('aria-busy');
  }
}
async function startRun(mode = state.selectedMode) {
  if (state.starting || state.activeRun || state.finishing) return;
  mode = modeOf(mode);
  state.starting = true;
  state.selectedMode = mode;
  const freestyle = mode === 'freestyle';
  const startButton = $(freestyle ? '#start-freestyle' : '#start-run');
  const startError = $(freestyle ? '#freestyle-start-error' : '#start-error');
  const tutorial = $(freestyle ? '#freestyle-tutorial-dialog' : '#tutorial-dialog');
  startButton.disabled = true;
  startButton.setAttribute('aria-busy', 'true');
  startError.textContent = '';
  try {
    await ensureSession();
    const run = await request(`${apiBase(mode)}/runs`, { method: 'POST', body: {} });
    state.pending = null;
    state.activeRun = { ...run, mode };
    state.tutorialSeen[mode] = true;
    closeDialogs();
    $('#toast').hidden = true;
    showScreen(freestyle ? 'freestyle' : 'game', false);
    clearFreestyleControls();
    state.game?.destroy();
    const callbacks = { sound: state.sound, onTick: freestyle ? updateFreestyleHud : updateHud, onFinish: finishRun, onInterrupt: (event) => interruptRun(event?.reason === 'input-limit' ? 'Esta partida chegou ao limite de comandos. Segure os botões para controlar a moto e comece uma nova tentativa.' : 'Ao sair da tela ou interromper o navegador, a partida é encerrada. Essa tentativa não entra no ranking.') };
    if (freestyle) {
      updateFreestyleHud({ score: 0, pending: 0, remaining: run.duration || 90, combo: 1, airborne: false });
      state.game = new FreestyleGame($('#freestyle-canvas'), callbacks);
    } else {
      $('#hud-score').textContent = '0';
      updateTime(run.duration || 60);
      $('#hud-combo').hidden = true;
      $('#hud-terrain').textContent = 'ASFALTO';
      state.game = new FreedomGame($('#game-canvas'), callbacks);
    }
    updateSoundButtons();
    state.game.start({ seed: run.seed, countdown: run.countdown ?? 3 });
  } catch (error) {
    if (state.activeRun) {
      const failed = state.activeRun;
      state.activeRun = null;
      clearFreestyleControls();
      state.game?.destroy();
      state.game = null;
      request(`${apiBase(failed.mode)}/runs/${encodeURIComponent(failed.runId)}/abandon`, { method: 'POST', body: {} }).catch(() => {});
      showScreen('home');
    }
    if (tutorial.open) startError.textContent = error.message;
    else toast(error.message);
  } finally {
    state.starting = false;
    startButton.disabled = false;
    startButton.removeAttribute('aria-busy');
  }
}
function updateTime(remaining) {
  const time = $('#hud-time');
  time.replaceChildren(document.createTextNode(String(Math.max(0, Math.ceil(remaining)))));
  const suffix = document.createElement('span'); suffix.textContent = 's'; time.append(suffix);
  time.parentElement.classList.toggle('is-urgent', remaining <= 10);
}
function updateHud({ score, remaining, combo, terrain }) {
  $('#hud-score').textContent = format(score);
  updateTime(remaining);
  $('#hud-terrain').textContent = terrain === 'trilha' ? 'TRILHA' : 'ASFALTO';
  $('#hud-combo').hidden = !(combo > 1);
  $('#hud-combo').textContent = `COMBO ×${combo || 1}`;
}
function updateFreestyleHud({ score, pending, remaining, combo, airborne }) {
  $('#freestyle-score').textContent = format(score);
  $('#freestyle-time').textContent = `${Math.max(0, Math.ceil(remaining))}s`;
  $('#freestyle-time').parentElement.classList.toggle('is-urgent', remaining <= 10);
  $('#freestyle-flight-hud').hidden = !(pending > 0);
  $('#freestyle-pending').textContent = `+${format(pending)}`;
  $('#freestyle-combo').textContent = `COMBO ×${Math.max(1, combo || 1)}`;
  $('#freestyle-flight-hud').classList.toggle('is-airborne', Boolean(airborne));
}
function finishRun(result) {
  if (!state.activeRun) return;
  const run = state.activeRun;
  state.activeRun = null;
  clearFreestyleControls();
  state.game?.destroy();
  state.game = null;
  state.resultMode = run.mode;
  const freestyle = run.mode === 'freestyle';
  const inputKey = freestyle ? 'inputs' : 'moves';
  state.pending = { runId: run.runId, mode: run.mode, body: { [inputKey]: JSON.parse(JSON.stringify(result[inputKey])), version: run.version || (freestyle ? 'freestyle-1' : '1') } };
  $('#result-player').textContent = state.session?.player?.name || 'Piloto';
  $('#result-mode-label').textContent = freestyle ? 'FREEDOM FREESTYLE · 90 SEGUNDOS' : 'DESAFIO FREEDOM · 60 SEGUNDOS';
  $('#result-extra-label').textContent = freestyle ? 'MANOBRAS' : 'COLETAS';
  $('#result-score').textContent = '—';
  $('#result-stats').hidden = true;
  $('#result-eyebrow').textContent = freestyle ? 'VOCÊ LEVOU A LIBERDADE MAIS ALTO.' : 'VOCÊ FEZ SEU CAMINHO.';
  $('#result-status').classList.remove('success');
  showScreen('result');
  submitResult();
}
async function submitResult() {
  if (!state.pending || state.finishing) return;
  state.finishing = true;
  const pending = state.pending;
  $('#retry-result').hidden = true;
  $('#result-status').classList.remove('success');
  $('#result-status').textContent = 'Confirmando sua pontuação na pista…';
  $('#play-again').disabled = true;
  try {
    const result = await request(`${apiBase(pending.mode)}/runs/${encodeURIComponent(pending.runId)}/finish`, { method: 'POST', body: pending.body });
    if (state.pending !== pending) return;
    state.pending = null;
    $('#result-score').textContent = format(result.score);
    $('#result-rank').textContent = result.rank ? `${result.rank}º` : '—';
    $('#result-best').textContent = format(result.best);
    $('#result-coins').textContent = format(pending.mode === 'freestyle' ? result.tricks : result.coins);
    $('#result-stats').hidden = false;
    $('#result-status').textContent = result.isRecord ? 'Novo recorde da pista. O topo agora é seu!' : result.isPersonalBest ? 'Seu novo recorde pessoal. Boa pilotagem!' : 'Pontuação confirmada. A próxima pode ser ainda melhor.';
    $('#result-status').classList.add('success');
    if (result.isRecord) $('#result-eyebrow').textContent = 'TEM UM NOVO LÍDER NA PISTA.';
    else if (result.isPersonalBest) $('#result-eyebrow').textContent = 'VOCÊ ACABOU DE SE SUPERAR.';
    if (state.session?.player && pending.mode === 'classic') {
      state.session.player.best = result.best;
      state.session.player.rank = result.rank;
    }
  } catch (error) {
    $('#result-status').textContent = `${error.message} Sua pontuação ainda não foi confirmada.`;
    $('#retry-result').hidden = false;
  } finally {
    state.finishing = false;
    $('#play-again').disabled = false;
  }
}
function interruptRun(message) {
  if (!state.activeRun) return;
  const run = state.activeRun;
  state.selectedMode = run.mode;
  state.activeRun = null;
  clearFreestyleControls();
  state.game?.destroy();
  state.game = null;
  request(`${apiBase(run.mode)}/runs/${encodeURIComponent(run.runId)}/abandon`, { method: 'POST', body: {} }).catch(() => {});
  $('#interrupt-copy').textContent = message;
  showDialog('#interrupt-dialog');
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function rankingRow(entry) {
  const row = element('li', `ranking-row${entry.isMe ? ' is-me' : ''}`);
  row.append(element('span', 'rank-number', String(entry.rank).padStart(2, '0')));
  const person = element('span', 'rank-person');
  person.append(element('span', 'rank-name', entry.name));
  if (entry.isMe) person.append(element('span', 'me-tag', 'VOCÊ'));
  row.append(person, element('span', 'rank-score', format(entry.score)));
  return row;
}
function renderRanking(data) {
  const entries = Array.isArray(data.entries) ? data.entries.slice(0, 10) : [];
  const podium = $('#podium');
  const list = $('#ranking-list');
  const mine = $('#my-ranking');
  podium.replaceChildren(); list.replaceChildren(); mine.replaceChildren();
  $('#ranking-status').hidden = entries.length > 0;
  $('#leaderboard').hidden = entries.length === 0;
  podium.hidden = entries.length === 0;
  if (entries.length === 0) {
    const status = $('#ranking-status');
    status.replaceChildren(element('strong', '', 'A PISTA ESTÁ LIVRE.'), element('p', '', state.rankingMode === 'freestyle' ? 'Seja a primeira pessoa a marcar pontos no Freestyle.' : 'Seja a primeira pessoa a deixar seu nome no ranking.'));
  }
  entries.slice(0, 3).forEach((entry, index) => {
    const card = element('div', `podium-card ${['first', 'second', 'third'][index]}`);
    card.append(element('div', 'podium-place', `${entry.rank}º`));
    card.append(element('div', 'podium-name', entry.name));
    const points = element('div', 'podium-score', format(entry.score)); points.append(element('span', '', 'PTS'));
    card.append(points); podium.append(card);
  });
  podium.style.gridTemplateColumns = entries.length === 1 ? '1fr' : entries.length === 2 ? '1fr 1.2fr' : '';
  entries.forEach((entry) => list.append(rankingRow(entry)));
  mine.hidden = !data.me;
  if (data.me) {
    mine.append(element('h3', '', 'SEU LUGAR NA PISTA'));
    const wrapper = element('ol', 'my-rank-list'); wrapper.style.cssText = 'list-style:none;padding:0;margin:0';
    wrapper.append(rankingRow({ ...data.me, isMe: true })); mine.append(wrapper);
    if (data.me.tag) mine.append(element('span', 'rank-code', `Seu código: ${data.me.tag} · identificação neste navegador`));
  }
  const total = Number(data.totalPlayers) || 0;
  $('#ranking-total').textContent = total > 0 ? `${format(total)} ${total === 1 ? 'piloto na pista' : 'pilotos na pista'} · Recorde: ${format(data.record)} pts` : 'Seu próximo desafio começa aqui.';
}
async function loadRanking() {
  const requestId = ++state.rankingRequest;
  const mode = state.rankingMode;
  $('#refresh-ranking').disabled = true;
  $('#ranking-board').setAttribute('aria-busy', 'true');
  $('#ranking-status').hidden = false;
  $('#ranking-status').textContent = 'Carregando a classificação…';
  $('#podium').hidden = true;
  $('#leaderboard').hidden = true;
  $('#my-ranking').hidden = true;
  $('#ranking-total').textContent = '';
  try {
    await ensureSession();
    const data = await request(`${apiBase(mode)}/leaderboard`);
    if (requestId === state.rankingRequest) renderRanking(data);
  } catch (error) { if (requestId === state.rankingRequest) $('#ranking-status').textContent = error.message; }
  finally {
    if (requestId === state.rankingRequest) {
      $('#refresh-ranking').disabled = false;
      $('#ranking-board').removeAttribute('aria-busy');
    }
  }
}
function openRanking(mode = 'classic') {
  if (state.activeRun) return;
  const alreadyOpen = state.screen === 'ranking';
  state.rankingMode = modeOf(mode);
  closeDialogs();
  for (const tab of document.querySelectorAll('[data-ranking-mode]')) {
    const active = tab.dataset.rankingMode === state.rankingMode;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  $('#ranking-board').setAttribute('aria-labelledby', `ranking-${state.rankingMode}`);
  $('#ranking-mode-label').textContent = state.rankingMode === 'freestyle' ? 'FREESTYLE · GERAL DO EVENTO' : 'DESAFIO FREEDOM · GERAL DO EVENTO';
  showScreen('ranking', !alreadyOpen);
  loadRanking();
}
function contextualMode(button) {
  if (button.dataset.mode) return modeOf(button.dataset.mode);
  if (button.closest('#result-screen')) return state.resultMode;
  if (button.closest('#ranking-screen')) return state.rankingMode;
  return 'classic';
}
function updateSoundButtons() {
  for (const prefix of ['', 'freestyle-']) {
    $(`#${prefix}sound-button`).setAttribute('aria-pressed', String(state.sound));
    $(`#${prefix}sound-button`).setAttribute('aria-label', state.sound ? 'Desativar som' : 'Ativar som');
    $(`#${prefix}sound-icon`).setAttribute('href', state.sound ? '#icon-sound' : '#icon-muted');
  }
}
function applyFreestyleControls() {
  let mask = 0;
  for (const value of heldPointers.values()) mask |= value;
  for (const value of heldKeys.values()) mask |= value;
  for (const [selector, bit] of freestyleButtons) {
    $(selector).setAttribute('aria-pressed', String(Boolean(mask & bit)));
    $(selector).classList.toggle('is-held', Boolean(mask & bit));
  }
  if (state.activeRun?.mode === 'freestyle') state.game?.setControls?.(mask);
}
function clearFreestyleControls() {
  heldPointers.clear();
  heldKeys.clear();
  for (const timer of pulseTimers.values()) clearTimeout(timer);
  pulseTimers.clear();
  applyFreestyleControls();
}
function releasePointer(event) {
  if (heldPointers.delete(event.pointerId)) applyFreestyleControls();
}
for (const [selector, mask] of freestyleButtons) {
  const button = $(selector);
  button.addEventListener('pointerdown', (event) => {
    if (state.activeRun?.mode !== 'freestyle' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    heldPointers.set(event.pointerId, mask);
    try { button.setPointerCapture(event.pointerId); } catch { /* Window pointerup remains a fallback. */ }
    applyFreestyleControls();
  });
  button.addEventListener('pointerup', releasePointer);
  button.addEventListener('pointercancel', releasePointer);
  button.addEventListener('lostpointercapture', releasePointer);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('keydown', (event) => {
    if (!['Space', 'Enter'].includes(event.code) || state.activeRun?.mode !== 'freestyle') return;
    event.preventDefault();
    heldKeys.set(`${button.id}:${event.code}`, mask);
    applyFreestyleControls();
  });
  button.addEventListener('blur', () => {
    for (const key of heldKeys.keys()) if (key.startsWith(`${button.id}:`)) heldKeys.delete(key);
    applyFreestyleControls();
  });
  button.addEventListener('click', (event) => {
    // Assistive technologies may activate a button without pointer or key events.
    if (event.detail !== 0 || state.activeRun?.mode !== 'freestyle' || heldKeys.size) return;
    const key = `assistive:${button.id}`;
    clearTimeout(pulseTimers.get(key));
    heldPointers.set(key, mask);
    applyFreestyleControls();
    pulseTimers.set(key, setTimeout(() => { pulseTimers.delete(key); heldPointers.delete(key); applyFreestyleControls(); }, 350));
  });
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);
window.addEventListener('keyup', (event) => {
  if (!['Space', 'Enter'].includes(event.code)) return;
  for (const key of heldKeys.keys()) if (key.endsWith(`:${event.code}`)) heldKeys.delete(key);
  applyFreestyleControls();
});
window.addEventListener('blur', clearFreestyleControls);

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    switch (button.dataset.action) {
      case 'play': play(contextualMode(button)); break;
      case 'play-freestyle': play('freestyle'); break;
      case 'ranking': openRanking(contextualMode(button)); break;
      case 'privacy': showDialog('#privacy-dialog'); break;
      case 'home': if (!state.activeRun) { closeDialogs(); showScreen('home'); } break;
    }
  });
});
document.querySelectorAll('[data-ranking-mode]').forEach((button) => {
  button.addEventListener('click', () => openRanking(button.dataset.rankingMode));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const mode = event.key === 'Home' ? 'classic' : event.key === 'End' ? 'freestyle' : state.rankingMode === 'classic' ? 'freestyle' : 'classic';
    openRanking(mode);
    $(`#ranking-${mode}`).focus();
  });
});
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$('#name-form').addEventListener('submit', saveName);
$('#start-run').addEventListener('click', () => startRun('classic'));
$('#start-freestyle').addEventListener('click', () => startRun('freestyle'));
$('#refresh-ranking').addEventListener('click', loadRanking);
$('#retry-result').addEventListener('click', submitResult);
for (const selector of ['#exit-game', '#exit-freestyle']) $(selector).addEventListener('click', () => interruptRun('Você saiu desta partida. Essa tentativa não entra no ranking, mas uma nova pista está esperando.'));
for (const selector of ['#sound-button', '#freestyle-sound-button']) $(selector).addEventListener('click', () => {
  state.sound = !state.sound;
  state.game?.setSound(state.sound);
  updateSoundButtons();
});
for (const [selector, direction] of [['#steer-left', -1], ['#steer-right', 1]]) {
  const button = $(selector);
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); if (state.activeRun?.mode === 'classic') state.game?.move(direction); });
  button.addEventListener('click', (event) => { if (event.detail === 0 && state.activeRun?.mode === 'classic') state.game?.move(direction); });
}
$('#restart-interrupted').addEventListener('click', () => { $('#interrupt-dialog').close(); showScreen('home'); play(state.selectedMode); });
$('#leave-interrupted').addEventListener('click', () => { $('#interrupt-dialog').close(); showScreen('home'); });
$('#interrupt-dialog').addEventListener('cancel', () => { showScreen('home'); });
window.addEventListener('pagehide', () => {
  clearFreestyleControls();
  if (state.activeRun) { state.game?.destroy(); state.activeRun = null; state.game = null; }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && ['game', 'freestyle'].includes(state.screen) && !state.activeRun) { closeDialogs(); showScreen('home'); toast('A partida foi interrompida. Você pode começar uma nova.'); }
});
ensureSession().catch(() => { /* The player can retry when starting or opening the ranking. */ });

