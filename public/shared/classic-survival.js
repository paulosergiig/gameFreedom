export const RULES_VERSION = 'survival-1';
export const TICK_RATE = 60;
export const MOVE_COOLDOWN_TICKS = 10;
export const STARTING_LIVES = 3;
export const RECOVERY_TICKS = 60;
export const VIEW_DISTANCE = 220;
const GENERATION_DISTANCE = VIEW_DISTANCE + 80;
const ACCELERATION_TICKS = 9000;
const MAX_SPEED_BONUS = 1.3;

export function speedAtTick(tick) {
  return 1 + MAX_SPEED_BONUS * Math.min(1, tick / ACCELERATION_TICKS);
}

// Integral of speed: scenery and obstacles share the same accelerating road.
export function distanceAtTick(tick) {
  const accelerating = Math.min(tick, ACCELERATION_TICKS);
  return accelerating + MAX_SPEED_BONUS * accelerating * accelerating / (2 * ACCELERATION_TICKS)
    + Math.max(0, tick - ACCELERATION_TICKS) * (1 + MAX_SPEED_BONUS);
}

function random(state) {
  state.prng = (state.prng + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state.prng ^ (state.prng >>> 15), 1 | state.prng);
  value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function extendCourse(state) {
  while (distanceAtTick(state.nextRowTick) - state.distance <= GENERATION_DISTANCE) {
    const tick = state.nextRowTick;
    const difficulty = Math.min(1, tick / ACCELERATION_TICKS);
    const safeLane = Math.floor(random(state) * 3);
    const candidates = [0, 1, 2].filter(lane => lane !== safeLane);
    const blockedLane = candidates[Math.floor(random(state) * 2)];
    const obstacles = [{ lane: blockedLane, type: tick >= 1800 ? 'rock' : 'cone' }];
    if (tick >= 1200 && random(state) < Math.min(0.9, 0.2 + difficulty * 0.85)) {
      obstacles.push({ lane: candidates.find(lane => lane !== blockedLane), type: tick >= 1800 ? 'rock' : 'barrier' });
    }
    state.course.push({ id: state.nextRowId++, tick, distance: distanceAtTick(tick), obstacles, coinLane: safeLane });
    // Even at maximum difficulty a row leaves at least 38 ticks to change two lanes.
    state.nextRowTick += Math.round(100 - difficulty * 62) + Math.floor(random(state) * 13);
  }
}

export function createSurvivalState(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('Semente inválida.');
  const state = {
    tick: 0, lane: 1, lives: STARTING_LIVES, finished: false,
    score: 0, coins: 0, hits: 0, streak: 0, combo: 1,
    lastMoveTick: -MOVE_COOLDOWN_TICKS, lastEvent: null, invulnerableUntil: 0,
    prng: seed >>> 0, nextRowTick: 240, nextRowId: 0, distance: 0, course: [],
  };
  extendCourse(state);
  return state;
}

// Pure tick-based replay. No clock, drawing or input sampling enters these rules.
export function stepSurvivalState(state, direction = 0) {
  if (state.finished) return state;
  if (direction !== 0 && direction !== -1 && direction !== 1) throw new RangeError('Movimento inválido.');
  state.lastEvent = null;
  if (direction) {
    const nextLane = state.lane + direction;
    if (state.tick - state.lastMoveTick < MOVE_COOLDOWN_TICKS || nextLane < 0 || nextLane > 2) {
      throw new RangeError('Movimento impossível.');
    }
    state.lane = nextLane;
    state.lastMoveTick = state.tick;
  }
  const row = state.course.find(item => item.tick === state.tick);
  if (row) {
    if (row.obstacles.some(obstacle => obstacle.lane === state.lane)) {
      if (state.tick >= state.invulnerableUntil) {
        state.hits++;
        state.lives--;
        state.streak = 0;
        state.combo = 1;
        state.score = Math.max(0, state.score - 80);
        state.invulnerableUntil = state.tick + RECOVERY_TICKS;
        state.lastEvent = 'hit';
        state.finished = state.lives === 0;
      }
    } else if (row.coinLane === state.lane) {
      state.coins++;
      state.streak++;
      state.combo = 1 + Math.min(2, Math.floor((state.streak - 1) / 5));
      state.score += 100 * state.combo;
      state.lastEvent = 'coin';
    } else {
      state.streak = 0;
      state.combo = 1;
    }
  }
  state.tick++;
  state.distance = distanceAtTick(state.tick);
  if (state.tick % TICK_RATE === 0) state.score += 10;
  state.course = state.course.filter(item => item.tick >= state.tick - 16);
  if (!state.finished) extendCourse(state);
  return state;
}

export function survivalSummary(state) {
  return {
    score: state.score, lives: state.lives, finished: state.finished,
    elapsedTicks: state.tick, elapsed: state.tick / TICK_RATE,
    level: 1 + Math.min(5, Math.floor(state.tick / 1800)),
    coins: state.coins, hits: state.hits, combo: state.combo,
    terrain: state.tick < 1800 ? 'asfalto' : 'trilha',
    speed: speedAtTick(state.tick),
  };
}
