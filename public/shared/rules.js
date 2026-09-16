export const RULES_VERSION = '1';
export const TICK_RATE = 60;
export const DURATION_TICKS = 3600;
export const MOVE_COOLDOWN_TICKS = 10;
export const MAX_MOVES = 360;

function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCourse(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('Semente inválida.');
  const random = randomSource(seed);
  const course = [];
  let tick = 240;
  while (tick < DURATION_TICKS - 60) {
    const safeLane = Math.floor(random() * 3);
    const candidates = [0, 1, 2].filter(lane => lane !== safeLane);
    const blockedLane = candidates[Math.floor(random() * 2)];
    const obstacles = [{ lane: blockedLane, type: tick >= 1800 ? 'rock' : 'cone' }];
    if (tick > 900 && random() > 0.65) obstacles.push({ lane: candidates.find(lane => lane !== blockedLane), type: tick >= 1800 ? 'rock' : 'barrier' });
    course.push({ id: course.length, tick, obstacles, coinLane: safeLane });
    tick += 100 - Math.floor(tick / 450) * 3 + Math.floor(random() * 17);
  }
  return course;
}

export function createState() {
  return { tick: 0, lane: 1, score: 0, coins: 0, hits: 0, streak: 0, combo: 1, courseIndex: 0, lastEvent: null };
}

// All scored rules use integer ticks; drawing and real elapsed time never enter this state.
export function stepState(state, course, direction = 0) {
  if (state.tick >= DURATION_TICKS) return state;
  state.lastEvent = null;
  if (direction) {
    const nextLane = state.lane + direction;
    if ((direction !== -1 && direction !== 1) || nextLane < 0 || nextLane > 2) throw new RangeError('Movimento impossível.');
    state.lane = nextLane;
  }
  const row = course[state.courseIndex];
  if (row && row.tick === state.tick) {
    if (row.obstacles.some(obstacle => obstacle.lane === state.lane)) {
      state.hits++;
      state.streak = 0;
      state.combo = 1;
      state.score = Math.max(0, state.score - 80);
      state.lastEvent = 'hit';
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
    state.courseIndex++;
  }
  state.tick++;
  if (state.tick % TICK_RATE === 0) state.score += 10;
  return state;
}

export function validateMoves(moves) {
  if (!Array.isArray(moves) || moves.length > MAX_MOVES) throw new TypeError('Sequência de movimentos inválida.');
  let previous = -MOVE_COOLDOWN_TICKS;
  for (const move of moves) {
    if (!move || typeof move !== 'object' || Array.isArray(move) || !Number.isInteger(move.tick) || move.tick < 0 || move.tick >= DURATION_TICKS || move.tick - previous < MOVE_COOLDOWN_TICKS || (move.direction !== -1 && move.direction !== 1)) throw new TypeError('Movimento inválido.');
    previous = move.tick;
  }
  return moves;
}

export function simulateRun(seed, moves) {
  validateMoves(moves);
  const course = generateCourse(seed);
  const state = createState();
  let index = 0;
  while (state.tick < DURATION_TICKS) {
    const direction = moves[index]?.tick === state.tick ? moves[index++].direction : 0;
    stepState(state, course, direction);
  }
  return { score: state.score, coins: state.coins, hits: state.hits };
}
