import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { configuration } from './lib/config.mjs';
import { createStaticRelease, cacheHeaders } from './lib/static-release.mjs';
import { openDatabase, prune, playerView, leaderboard, freestylePlayerView, freestyleLeaderboard } from './lib/store.mjs';
import { cookieName, cookieToken, csrfFor, equalToken, hash, clientAddress, RateLimiter, cleanName, validateMoves } from './lib/security.mjs';
import { simulateRun } from './public/shared/rules.js';
import { survivalService, SurvivalError } from './lib/survival.mjs';
import { simulateFreestyleRun, FREESTYLE_VERSION, FREESTYLE_DURATION_TICKS, FREESTYLE_MAX_INPUTS } from './public/shared/freestyle-rules.js';

const EVENT = Object.freeze({ title: 'Desafio Freedom', id: 'motonordeste-2026' });
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const error = (status, code, message) => { throw new ApiError(status, code, message); };
function json(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' });
  res.end(data);
}
async function readJson(req, maxBytes = 24576) {
  if ((req.headers['content-type'] ?? '').split(';')[0].trim() !== 'application/json') error(415, 'JSON_REQUIRED', 'Envie os dados como JSON.');
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) error(413, 'BODY_TOO_LARGE', 'Dados da partida muito grandes.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) error(413, 'BODY_TOO_LARGE', 'Dados da partida muito grandes.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { error(400, 'INVALID_JSON', 'Não foi possível ler os dados enviados.'); }
}
function securityHeaders(res, secure) {
  cacheHeaders(res);
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; manifest-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
function originFor(req, config) {
  const host = req.headers.host;
  if (typeof host !== 'string' || !host || /[\s,/@\\]/.test(host)) error(400, 'INVALID_HOST', 'Endereço inválido.');
  if (config.publicUrl) {
    if (host.toLowerCase() !== config.publicUrl.host.toLowerCase()) error(421, 'INVALID_HOST', 'Este endereço não está configurado.');
    return config.publicUrl.origin;
  }
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) error(421, 'INVALID_HOST', 'Configure PUBLIC_URL para acessar por este endereço.');
  return `http://${host}`;
}
function resourcePath(req) {
  let value;
  try { value = decodeURIComponent((req.url ?? '').split('?')[0]); } catch { error(400, 'INVALID_PATH', 'Endereço inválido.'); }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('\0') || value.split('/').some(p => p === '.' || p === '..')) error(400, 'INVALID_PATH', 'Endereço inválido.');
  return value;
}
export function createApp(options = {}) {
  const config = configuration(options);
  const release = createStaticRelease(config.publicDir);
  const now = options.now ?? Date.now;
  const db = openDatabase(config.dbPath);
  const limiter = new RateLimiter();
  const survival = survivalService(db);
  const secure = config.publicUrl?.protocol === 'https:';
  prune(db, now());
  survival.finalizeStale(now());
  let lastPrune = now();
  const cleanupTimer = setInterval(() => {
    try {
      survival.finalizeStale(now());
      if (now() - lastPrune >= 60000) { prune(db, now()); lastPrune = now(); }
    }
    catch { console.error('Não foi possível executar a limpeza periódica.'); }
  }, 10000);
  cleanupTimer.unref();
  function rate(key, cap, window, time) {
    if (!limiter.allow(key, cap, window, time)) error(429, 'RATE_LIMIT', 'Muitas tentativas. Aguarde um pouco e tente novamente.');
  }
  function findSession(req, time) {
    const token = cookieToken(req);
    if (!token) return null;
    const player = db.prepare('SELECT * FROM players WHERE id = ? AND expires_at > ?').get(hash(token), time);
    return player ? { token, player } : null;
  }
  function createSession(res, time, ip, name = null) {
    rate(`new:${ip}`, 180, 600000, time);
    rate('new:global', 3000, 600000, time);
    if (db.prepare('SELECT count(*) AS n FROM players').get().n >= 100000) error(503, 'CAPACITY', 'O jogo está cheio agora. Tente novamente em breve.');
    const token = randomBytes(32).toString('base64url');
    const id = hash(token);
    const tag = randomBytes(6).toString('hex').toUpperCase();
    const age = config.retentionDays * 86400;
    db.prepare('INSERT INTO players(id,tag,name,created_at,expires_at) VALUES(?,?,?,?,?)').run(id, tag, name, time, time + age * 1000);
    res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`);
    return { token, player: db.prepare('SELECT * FROM players WHERE id = ?').get(id) };
  }
  function makeSession(req, res, time, ip) {
    return findSession(req, time) ?? createSession(res, time, ip);
  }
  function sessionView(session, time) {
    return { player: playerView(db, session.player, time), csrfToken: csrfFor(session.token), event: EVENT, privacy: { retentionDays: config.retentionDays } };
  }
  function startRun(player, time) {
    const runId = randomBytes(24).toString('base64url');
    const seed = randomBytes(4).readUInt32BE(0);
    const expiresAt = time + 180000;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE runs SET state = 'abandoned' WHERE player_id = ? AND state = 'active'").run(player.id);
      db.prepare("UPDATE freestyle_runs SET state = 'abandoned' WHERE player_id = ? AND state = 'active'").run(player.id);
      db.prepare('INSERT INTO runs(id,player_id,seed,created_at,expires_at) VALUES(?,?,?,?,?)').run(runId, player.id, seed, time, expiresAt);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { runId, seed, duration: 60, countdown: 3, version: '1', expiresAt };
  }
  function finishRun(player, id, body, time) {
    const run = db.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ?').get(id, player.id);
    if (!run) error(404, 'RUN_NOT_FOUND', 'Partida não encontrada.');
    // Successful retries return the original result, even if a different payload is sent.
    if (run.state === 'finished') return JSON.parse(run.result);
    if (run.state !== 'active') error(409, 'RUN_ABANDONED', 'Esta partida foi encerrada. Comece outra.');
    if (run.expires_at <= time) error(410, 'RUN_EXPIRED', 'Esta partida expirou. Comece outra.');
    if (time - run.created_at < 63000) error(409, 'RUN_TOO_EARLY', 'A partida ainda não terminou. Aguarde o cronômetro.');
    if (!validateMoves(body)) error(400, 'INVALID_MOVES', 'Os dados da partida são inválidos.');
    let scored;
    try { scored = simulateRun(run.seed, body.moves); } catch { error(400, 'INVALID_MOVES', 'Os movimentos da partida são inválidos.'); }
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id);
      const previousRecord = db.prepare('SELECT max(best) AS best FROM players WHERE expires_at > ?').get(time).best ?? -1;
      const isPersonalBest = scored.score > current.best;
      if (isPersonalBest) db.prepare('UPDATE players SET best = ?, best_at = ? WHERE id = ? AND best < ?').run(scored.score, time, player.id, scored.score);
      const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id);
      const result = { score: scored.score, coins: scored.coins, hits: scored.hits, best: updated.best, rank: playerView(db, updated, time).rank, isPersonalBest, isRecord: scored.score > previousRecord };
      db.prepare("UPDATE runs SET state = 'finished', result = ? WHERE id = ?").run(JSON.stringify(result), id);
      db.exec('COMMIT');
      return result;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function startFreestyleRun(player, time) {
    const runId = randomBytes(24).toString('base64url');
    const seed = randomBytes(4).readUInt32BE(0);
    const expiresAt = time + 240000;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE runs SET state = 'abandoned' WHERE player_id = ? AND state = 'active'").run(player.id);
      db.prepare("UPDATE freestyle_runs SET state = 'abandoned' WHERE player_id = ? AND state = 'active'").run(player.id);
      db.prepare('INSERT INTO freestyle_runs(id,player_id,seed,created_at,expires_at) VALUES(?,?,?,?,?)').run(runId, player.id, seed, time, expiresAt);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { runId, seed, duration: 90, countdown: 3, version: FREESTYLE_VERSION, expiresAt };
  }
  function finishFreestyleRun(player, id, body, time) {
    const run = db.prepare('SELECT * FROM freestyle_runs WHERE id = ? AND player_id = ?').get(id, player.id);
    if (!run) error(404, 'RUN_NOT_FOUND', 'Partida não encontrada.');
    if (run.state === 'finished') return JSON.parse(run.result);
    if (run.state !== 'active') error(409, 'RUN_ABANDONED', 'Esta partida foi encerrada. Comece outra.');
    if (run.expires_at <= time) error(410, 'RUN_EXPIRED', 'Esta partida expirou. Comece outra.');
    if (time - run.created_at < 93000) error(409, 'RUN_TOO_EARLY', 'A partida ainda não terminou. Aguarde o cronômetro.');
    // Only transitions are accepted. Neither scores nor physics state come from the client.
    if (Object.keys(body).length !== 2 || body.version !== FREESTYLE_VERSION || !Array.isArray(body.inputs) || body.inputs.length > FREESTYLE_MAX_INPUTS) {
      error(400, 'INVALID_INPUTS', 'Os dados da partida são inválidos.');
    }
    let previousTick = -1;
    for (const input of body.inputs) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2 ||
          !Number.isInteger(input.tick) || input.tick <= previousTick || input.tick < 0 || input.tick >= FREESTYLE_DURATION_TICKS ||
          !Number.isInteger(input.buttons) || input.buttons < 0 || input.buttons > 15) {
        error(400, 'INVALID_INPUTS', 'Os controles da partida são inválidos.');
      }
      previousTick = input.tick;
    }
    let scored;
    try { scored = simulateFreestyleRun(run.seed, body.inputs); }
    catch { error(400, 'INVALID_INPUTS', 'Os controles da partida são inválidos.'); }
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = db.prepare('SELECT best FROM freestyle_scores WHERE player_id = ?').get(player.id);
      const previousRecord = db.prepare(`
        SELECT max(s.best) AS best FROM freestyle_scores s JOIN players p ON p.id = s.player_id
        WHERE p.name IS NOT NULL AND p.expires_at > ?
      `).get(time).best ?? -1;
      const isPersonalBest = scored.score > (current?.best ?? -1);
      if (isPersonalBest) db.prepare(`
        INSERT INTO freestyle_scores(player_id,best,best_at) VALUES(?,?,?)
        ON CONFLICT(player_id) DO UPDATE SET best = excluded.best, best_at = excluded.best_at
        WHERE excluded.best > freestyle_scores.best
      `).run(player.id, scored.score, time);
      const mine = freestylePlayerView(db, player, time);
      const result = { score: scored.score, tricks: scored.tricks, crashes: scored.crashes, jumps: scored.jumps, best: mine.best, rank: mine.rank, isPersonalBest, isRecord: scored.score > previousRecord };
      db.prepare("UPDATE freestyle_runs SET state = 'finished', result = ? WHERE id = ?").run(JSON.stringify(result), id);
      db.exec('COMMIT');
      return result;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function serveStatic(req, res, pathname) {
    const file = release.resolve(pathname);
    if (!file) error(404, 'NOT_FOUND', 'Página não encontrada.');
    cacheHeaders(res, file.cache);
    res.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.body.length });
    res.end(req.method === 'HEAD' ? undefined : file.body);
  }
  const server = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    securityHeaders(res, secure);
    try {
      const time = now();
      const expectedOrigin = originFor(req, config);
      const pathname = resourcePath(req);
      const ip = clientAddress(req, config.trustProxy);
      rate('requests:global', 20000, 60000, time);
      rate(`requests:${ip}`, 1800, 60000, time);
      if (time - lastPrune > 60000) { prune(db, time); lastPrune = time; }
      if (!pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) error(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
        await serveStatic(req, res, pathname);
        return;
      }
      if (req.headers['sec-fetch-site'] === 'cross-site') error(403, 'CROSS_SITE', 'Abra o jogo pelo endereço oficial.');
      if (req.method === 'GET') {
        if (pathname === '/api/version') { json(res, 200, { version: release.version }); return; }
        if (pathname === '/api/health') { json(res, 200, { ok: true }); return; }
        if (pathname === '/api/session') {
          const session = makeSession(req, res, time, ip);
          json(res, 200, sessionView(session, time));
          return;
        }
        const survivalBoard = /^\/api\/survival\/(classic|freestyle)\/leaderboard$/.exec(pathname);
        if (survivalBoard) {
          json(res, 200, survival.board(findSession(req, time)?.player.id, survivalBoard[1], time));
          return;
        }
        const survivalStatus = /^\/api\/survival\/(classic|freestyle)\/runs\/([A-Za-z0-9_-]{32})$/.exec(pathname);
        if (survivalStatus) {
          const session = findSession(req, time);
          if (!session) error(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Recarregue a página para começar.');
          json(res, 200, survival.status(session.player, survivalStatus[1], survivalStatus[2], time));
          return;
        }
        if (pathname === '/api/freestyle/leaderboard') {
          json(res, 200, freestyleLeaderboard(db, findSession(req, time)?.player.id, time));
          return;
        }
        if (pathname === '/api/leaderboard') {
          json(res, 200, leaderboard(db, findSession(req, time)?.player.id, time));
          return;
        }
        error(404, 'NOT_FOUND', 'Endereço não encontrado.');
      }
      if (req.method !== 'POST') error(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
      const session = findSession(req, time);
      if (!session) error(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Recarregue a página para começar.');
      if (req.headers.origin !== expectedOrigin) error(403, 'CSRF', 'Não foi possível validar o acesso. Recarregue a página.');
      const survivalSync = /^\/api\/survival\/(classic|freestyle)\/runs\/([A-Za-z0-9_-]{32})\/sync$/.exec(pathname);
      // Beacon cannot set a custom header. Its JSON token is accepted only on this same-origin endpoint.
      if (!survivalSync && !equalToken(req.headers['x-csrf-token'], csrfFor(session.token))) error(403, 'CSRF', 'Não foi possível validar o acesso. Recarregue a página.');
      rate(survivalSync ? `sync:${session.player.id}` : `write:${session.player.id}`, survivalSync ? 90 : 30, 60000, time);
      const body = await readJson(req, survivalSync ? 49152 : 24576);
      if (survivalSync && !equalToken(req.headers['x-csrf-token'] ?? body.csrfToken, csrfFor(session.token))) error(403, 'CSRF', 'Não foi possível validar o acesso. Recarregue a página.');
      if (pathname === '/api/player') {
        if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'name')) error(400, 'INVALID_NAME', 'Informe somente seu apelido.');
        const name = cleanName(body.name);
        if (!name) error(400, 'INVALID_NAME', 'Use um apelido de 2 a 20 letras ou números, sem marcas ou palavras ofensivas.');
        rate(`name:${session.player.id}`, 6, 60000, time);
        db.prepare('UPDATE players SET name = ? WHERE id = ?').run(name, session.player.id);
        json(res, 200, { player: playerView(db, { ...session.player, name }, time) });
        return;
      }
      if (!session.player.name) error(409, 'NAME_REQUIRED', 'Escolha seu apelido antes de jogar.');
      if (pathname === '/api/player/switch') {
        if (Object.keys(body).length !== 2 || !Object.hasOwn(body, 'name') || !Object.hasOwn(body, 'previousTag') || typeof body.previousTag !== 'string') {
          error(400, 'INVALID_BODY', 'Informe o apelido e o participante atual.');
        }
        if (body.previousTag !== session.player.tag) error(409, 'PLAYER_CHANGED', 'O participante mudou em outra aba. Confira quem vai jogar.');
        const name = cleanName(body.name);
        if (!name) error(400, 'INVALID_NAME', 'Use um apelido de 2 a 20 letras ou números, sem marcas ou palavras ofensivas.');
        survival.finalizeStale(time);
        const active = db.prepare(`
          SELECT 1 FROM survival_runs WHERE player_id = ? AND state = 'active'
          UNION ALL SELECT 1 FROM runs WHERE player_id = ? AND state = 'active' AND expires_at > ?
          UNION ALL SELECT 1 FROM freestyle_runs WHERE player_id = ? AND state = 'active' AND expires_at > ?
          LIMIT 1
        `).get(session.player.id, session.player.id, time, session.player.id, time);
        if (active) error(409, 'RUN_ACTIVE', 'Encerre a partida atual antes de trocar de participante.');
        // A shared device selects a new identity; previous scores and their names stay intact.
        json(res, 201, sessionView(createSession(res, time, ip, name), time));
        return;
      }
      const survivalStart = /^\/api\/survival\/(classic|freestyle)\/runs$/.exec(pathname);
      if (survivalStart) {
        if (Object.keys(body).length) error(400, 'INVALID_BODY', 'Dados inválidos para iniciar a partida.');
        rate(`start:${session.player.id}`, 12, 600000, time);
        json(res, 201, survival.start(session.player, survivalStart[1], time));
        return;
      }
      if (survivalSync) {
        json(res, 200, survival.sync(session.player, survivalSync[1], survivalSync[2], body, time));
        return;
      }
      if (pathname === '/api/freestyle/runs') {
        if (Object.keys(body).length) error(400, 'INVALID_BODY', 'Dados inválidos para iniciar a partida.');
        rate(`start:${session.player.id}`, 12, 600000, time);
        json(res, 201, startFreestyleRun(session.player, time));
        return;
      }
      const freestyleMatch = /^\/api\/freestyle\/runs\/([A-Za-z0-9_-]{32})\/(finish|abandon)$/.exec(pathname);
      if (freestyleMatch?.[2] === 'finish') {
        json(res, 200, finishFreestyleRun(session.player, freestyleMatch[1], body, time));
        return;
      }
      if (freestyleMatch?.[2] === 'abandon') {
        if (Object.keys(body).length) error(400, 'INVALID_BODY', 'Dados inválidos para encerrar a partida.');
        const run = db.prepare('SELECT state FROM freestyle_runs WHERE id = ? AND player_id = ?').get(freestyleMatch[1], session.player.id);
        if (!run) error(404, 'RUN_NOT_FOUND', 'Partida não encontrada.');
        db.prepare("UPDATE freestyle_runs SET state = 'abandoned' WHERE id = ? AND player_id = ? AND state = 'active'").run(freestyleMatch[1], session.player.id);
        json(res, 200, { ok: true });
        return;
      }
      if (pathname === '/api/runs') {
        if (Object.keys(body).length) error(400, 'INVALID_BODY', 'Dados inválidos para iniciar a partida.');
        rate(`start:${session.player.id}`, 12, 600000, time);
        json(res, 201, startRun(session.player, time));
        return;
      }
      const match = /^\/api\/runs\/([A-Za-z0-9_-]{32})\/(finish|abandon)$/.exec(pathname);
      if (match?.[2] === 'finish') {
        json(res, 200, finishRun(session.player, match[1], body, time));
        return;
      }
      if (match?.[2] === 'abandon') {
        if (Object.keys(body).length) error(400, 'INVALID_BODY', 'Dados inválidos para encerrar a partida.');
        const run = db.prepare('SELECT state FROM runs WHERE id = ? AND player_id = ?').get(match[1], session.player.id);
        if (!run) error(404, 'RUN_NOT_FOUND', 'Partida não encontrada.');
        db.prepare("UPDATE runs SET state = 'abandoned' WHERE id = ? AND player_id = ? AND state = 'active'").run(match[1], session.player.id);
        json(res, 200, { ok: true });
        return;
      }
      error(404, 'NOT_FOUND', 'Endereço não encontrado.');
    } catch (e) {
      req.resume();
      if (e instanceof ApiError || e instanceof SurvivalError) {
        if (e.status === 429) res.setHeader('Retry-After', '60');
        json(res, e.status, { error: e.message, code: e.code });
      } else {
        // Do not log cookies, names, replay data, paths, or database details.
        if (options.onError) options.onError(e);
        else console.error('Erro interno ao processar requisição.');
        json(res, 500, { error: 'Não foi possível concluir agora. Tente novamente.', code: 'INTERNAL_ERROR' });
      }
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.maxHeadersCount = 100;
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    clearInterval(cleanupTimer);
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
  return { server, close, config };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const app = createApp();
    app.server.on('error', err => {
      console.error(err.code === 'EADDRINUSE' ? 'A porta está ocupada. Defina outra PORT no .env.' : 'Não foi possível iniciar o servidor.');
      process.exitCode = 1;
      app.close();
    });
    app.server.listen(app.config.port, app.config.host, () => {
      console.log(`Desafio Freedom disponível em ${app.config.publicUrl?.origin ?? `http://${app.config.host}:${app.server.address().port}`}`);
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); });
  } catch (err) { console.error(`Falha na configuração: ${err.message}`); process.exitCode = 1; }
}

