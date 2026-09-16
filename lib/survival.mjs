import { randomBytes } from 'node:crypto';
import * as classic from '../public/shared/classic-survival.js';
import * as freestyle from '../public/shared/freestyle-survival.js';
import { survivalLeaderboard, survivalPlayerView, survivalRecord } from './store.mjs';

export const SURVIVAL_VERSION = 'survival-1';
const MODELS = { classic, freestyle };
const IDLE_MS = 30000;
const MAX_DELTA = 3600;
const MAX_INPUTS = 1200;
const END_REASONS = new Set(['manual', 'hidden', 'pagehide', 'navigation', 'interrupted', 'exit', 'disconnect', 'death', 'lives', 'connection']);
export class SurvivalError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new SurvivalError(status, code, message); };

export function survivalService(db) {
  function owned(player, mode, id) {
    const run = db.prepare('SELECT * FROM survival_runs WHERE id = ? AND player_id = ? AND mode = ?').get(id, player.id, mode);
    if (!run) fail(404, 'RUN_NOT_FOUND', 'Partida não encontrada.');
    return run;
  }
  function ack(run, state = JSON.parse(run.simulation)) {
    return { tick: state.tick, score: state.score, lives: state.lives, finished: run.state === 'finished',
      ...(run.result ? { result: JSON.parse(run.result) } : {}) };
  }
  // Called inside a transaction when part of a checkpoint, so score and replay state commit together.
  function finish(run, state, time, reason) {
    if (run.state === 'finished') return ack(run, state);
    const summary = MODELS[run.mode].survivalSummary(state);
    const current = db.prepare('SELECT best FROM survival_scores WHERE player_id = ? AND mode = ?').get(run.player_id, run.mode);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(run.player_id);
    const previousRecord = survivalRecord(db, run.mode, time);
    const previousBest = survivalPlayerView(db, player, run.mode, time)?.best ?? -1;
    const isPersonalBest = state.tick > 0 && summary.score > previousBest;
    if (state.tick > 0 && summary.score > (current?.best ?? -1)) db.prepare(`
      INSERT INTO survival_scores(player_id,mode,best,best_at) VALUES(?,?,?,?)
      ON CONFLICT(player_id,mode) DO UPDATE SET best = excluded.best, best_at = excluded.best_at
      WHERE excluded.best > survival_scores.best
    `).run(run.player_id, run.mode, summary.score, time);
    const mine = survivalPlayerView(db, player, run.mode, time);
    const result = { score: summary.score, lives: state.lives, elapsedTicks: state.tick, best: mine?.best ?? 0, rank: mine?.rank ?? null,
      isPersonalBest, isRecord: state.tick > 0 && summary.score > previousRecord, endReason: state.finished ? 'lives' : ['lives', 'death'].includes(reason) ? 'exit' : reason };
    for (const key of ['coins', 'hits', 'tricks', 'crashes', 'jumps']) {
      if (Number.isInteger(summary[key])) result[key] = summary[key];
    }
    const encoded = JSON.stringify(result);
    db.prepare("UPDATE survival_runs SET state = 'finished', simulation = ?, result = ? WHERE id = ?")
      .run(JSON.stringify(state), encoded, run.id);
    return ack({ ...run, state: 'finished', result: encoded }, state);
  }
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function finalizeStale(time) {
    // Bounded work per request. The periodic cleanup continues if a very large batch expires together.
    const stale = db.prepare(`
      SELECT r.* FROM survival_runs r JOIN players p ON p.id = r.player_id
      WHERE r.state = 'active' AND r.last_sync_at <= ? AND p.expires_at > ?
      ORDER BY r.last_sync_at LIMIT 500
    `).all(time - IDLE_MS, time);
    if (!stale.length) return;
    transaction(() => { for (const run of stale) finish(run, JSON.parse(run.simulation), time, 'disconnect'); });
  }
  function start(player, mode, time) {
    const runId = randomBytes(24).toString('base64url');
    const seed = randomBytes(4).readUInt32BE(0);
    const state = MODELS[mode].createSurvivalState(seed);
    transaction(() => {
      const previous = db.prepare("SELECT * FROM survival_runs WHERE player_id = ? AND state = 'active'").all(player.id);
      for (const run of previous) finish(run, JSON.parse(run.simulation), time, 'replaced');
      db.prepare(`INSERT INTO survival_runs(id,player_id,mode,seed,created_at,last_sync_at,simulation)
        VALUES(?,?,?,?,?,?,?)`).run(runId, player.id, mode, seed, time, time, JSON.stringify(state));
    });
    return { runId, seed, countdown: 3, version: SURVIVAL_VERSION, lives: 3 };
  }
  function status(player, mode, id, time) {
    const run = owned(player, mode, id);
    if (run.state === 'active' && time - run.last_sync_at >= IDLE_MS) {
      return transaction(() => finish(run, JSON.parse(run.simulation), time, 'disconnect'));
    }
    return ack(run);
  }
  function sync(player, mode, id, body, time) {
    const run = owned(player, mode, id);
    if (run.state === 'finished') return ack(run);
    if (time - run.last_sync_at >= IDLE_MS) return transaction(() => finish(run, JSON.parse(run.simulation), time, 'disconnect'));
    const keys = Object.keys(body);
    if (keys.some(key => !['version', 'fromTick', 'toTick', 'inputs', 'end', 'reason', 'csrfToken'].includes(key)) ||
        body.version !== SURVIVAL_VERSION || !Number.isSafeInteger(body.fromTick) || body.fromTick < 0 ||
        !Number.isSafeInteger(body.toTick) || body.toTick < body.fromTick ||
        typeof body.end !== 'boolean' || !Array.isArray(body.inputs) || body.inputs.length > MAX_INPUTS ||
        (body.reason !== undefined && !END_REASONS.has(body.reason))) {
      fail(400, 'INVALID_INPUTS', 'Os dados da partida são inválidos.');
    }
    const state = JSON.parse(run.simulation);
    if (body.fromTick > state.tick) fail(409, 'CHECKPOINT_GAP', 'Aguardando confirmar o trecho anterior da partida.');
    if (body.toTick - state.tick > MAX_DELTA) fail(400, 'CHECKPOINT_TOO_LARGE', 'O trecho da partida é muito longo.');
    // Tick zero is a valid exit during the countdown. Never accept simulated future time.
    if (body.toTick > 0 && time - run.created_at < 3000 + Math.ceil(body.toTick * 1000 / 60)) {
      fail(409, 'RUN_TOO_EARLY', 'Aguardando confirmar o tempo da partida.');
    }
    let previousTick = -1;
    for (const input of body.inputs) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2 ||
          !Number.isSafeInteger(input.tick) || input.tick < body.fromTick || input.tick >= body.toTick || input.tick <= previousTick ||
          (mode === 'classic' ? input.direction !== -1 && input.direction !== 1 :
            !Number.isInteger(input.buttons) || input.buttons < 0 || input.buttons > 31)) {
        fail(400, 'INVALID_INPUTS', 'Os controles da partida são inválidos.');
      }
      previousTick = input.tick;
    }
    let cursor = 0;
    while (cursor < body.inputs.length && body.inputs[cursor].tick < state.tick) cursor++;
    let lastMoveTick = run.last_move_tick;
    try {
      while (state.tick < body.toTick && !state.finished) {
        const input = body.inputs[cursor]?.tick === state.tick ? body.inputs[cursor++] : null;
        if (mode === 'classic') {
          if (input) {
            if (input.tick - lastMoveTick < 10) throw new RangeError('cooldown');
            lastMoveTick = input.tick;
          }
          MODELS.classic.stepSurvivalState(state, input?.direction ?? 0);
        } else {
          MODELS.freestyle.stepSurvivalState(state, input?.buttons ?? state.buttons ?? 0);
        }
      }
      if (state.finished && (state.tick < body.toTick || cursor < body.inputs.length)) throw new RangeError('inputs after finish');
    } catch { fail(400, 'INVALID_INPUTS', 'Os controles da partida são inválidos.'); }
    return transaction(() => {
      // Older retries cannot replace already confirmed state or undo an accepted score.
      db.prepare('UPDATE survival_runs SET simulation = ?, last_sync_at = ?, last_move_tick = ? WHERE id = ?')
        .run(JSON.stringify(state), time, lastMoveTick, run.id);
      if (body.end || state.finished) return finish(run, state, time, body.reason ?? 'exit');
      return ack(run, state);
    });
  }
  function board(id, mode, time) {
    finalizeStale(time);
    return survivalLeaderboard(db, id, mode, time);
  }
  return { start, sync, status, board, finalizeStale };
}
