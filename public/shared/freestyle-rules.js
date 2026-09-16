export const FREESTYLE_VERSION = 'freestyle-1';
export const FREESTYLE_TICK_RATE = 60;
export const FREESTYLE_DURATION_TICKS = 5400;
export const FREESTYLE_MAX_INPUTS = 720;
export const FREESTYLE_BUTTONS = Object.freeze({ GAS: 1, BRAKE: 2, BACK: 4, FORWARD: 8 });
export const BIKE_RADIUS = 13;
const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const quantize = n => Math.round(n * 1000000) / 1000000;
export const levelAngle = angle => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generateFreestyleCourse(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('Semente inválida.');
  const random = rng(17092026); // Identical competitive course; run seed is reserved for scenery.
  const course = [];
  let origin = 0;
  for (let id = 0; id < 64; id++) {
    const start = origin + (id % 5 === 4 ? 155 : 330) + Math.floor(random() * 45);
    const width = [174, 185, 183, 170, 188, 177][id % 6];
    const height = [92, 109, 120, 95, 106, 114][id % 6];
    const lip = start + width;
    const landing = id % 3 === 1 ? { start: lip + 420, end: lip + 660, height: 38 } : null;
    const obstacles = [{ x: lip + 185, width: 44, height: id % 2 ? 30 : 27, type: id % 2 ? 'rock' : 'log' }];
    if (id % 4 === 2) obstacles.push({ x: lip + 310, width: 36, height: 24, type: 'rock' });
    course.push({ id, start, lip, width, height, slope: height / width, checkpoint: lip + 690, end: lip + 770, landing, obstacles });
    origin = lip + 750 + Math.floor(random() * 90);
  }
  return course;
}
export function freestyleGround(course, x) {
  for (const ramp of course) {
    if (x < ramp.start) break;
    if (x <= ramp.lip) return { height: (x - ramp.start) * ramp.slope, slope: ramp.slope, rampId: ramp.id };
    if (ramp.landing && x >= ramp.landing.start && x <= ramp.landing.end) {
      const slope = -ramp.landing.height / (ramp.landing.end - ramp.landing.start);
      return { height: ramp.landing.height + (x - ramp.landing.start) * slope, slope, rampId: -1 };
    }
  }
  return { height: 0, slope: 0, rampId: -1 };
}
export function createFreestyleState() {
  return { tick: 0, x: 45, y: BIKE_RADIUS, vx: 0, vy: 0, angle: 0, omega: 0, buttons: 0, airborne: false, score: 0, pending: 0, combo: 1, tricks: 0, crashes: 0, jumps: 0, flips: 0, launchAngle: 0, flightTicks: 0, rampIndex: 0, jumpId: -1, checkpointX: 45, respawnTicks: 0, banked: [], lastEvent: null };
}
export function stepFreestyleState(state, course, buttons = state.buttons) {
  if (state.tick >= FREESTYLE_DURATION_TICKS) return state;
  state.buttons = buttons;
  state.lastEvent = null;
  state.tick++;
  if (state.respawnTicks > 0) {
    state.respawnTicks--;
    if (state.respawnTicks === 0) {
      state.x = state.checkpointX; state.y = BIKE_RADIUS; state.angle = 0; state.omega = 0; state.vy = 0; state.vx = buttons & 1 ? 2.8 : 0; state.airborne = false;
      state.lastEvent = { type: 'respawn' };
    }
    return state;
  }
  const gas = Boolean(buttons & 1), brake = Boolean(buttons & 2);
  const lean = ((buttons & 4) ? 1 : 0) - ((buttons & 8) ? 1 : 0);
  if (!state.airborne) {
    state.vx = quantize(clamp(state.vx + (brake ? -0.17 : gas ? 0.055 : -0.022), 0, 7.4));
    const previousX = state.x;
    state.x = quantize(state.x + state.vx);
    while (course[state.rampIndex] && course[state.rampIndex].lip < previousX) state.rampIndex++;
    const ramp = course[state.rampIndex];
    if (ramp && previousX <= ramp.lip && state.x > ramp.lip && state.vx > 0.15) {
      state.airborne = true; state.jumpId = ramp.id; state.jumps++; state.flips = 0; state.flightTicks = 0;
      state.y = ramp.height + BIKE_RADIUS; state.vy = quantize(state.vx * ramp.slope + 1.15); state.angle = quantize(Math.atan(ramp.slope)); state.omega = 0;
      state.launchAngle = state.angle; state.pending = 100; state.checkpointX = ramp.checkpoint;
      state.lastEvent = { type: 'jump' };
    } else {
      const ground = freestyleGround(course, state.x);
      state.y = quantize(ground.height + BIKE_RADIUS);
      const target = Math.atan(ground.slope) + lean * (state.vx > 1 ? 0.22 : 0.08);
      state.angle = quantize(state.angle + levelAngle(target - state.angle) * 0.22);
      state.omega = 0;
    }
  } else {
    // Forward momentum persists in the air; braking cannot stop time or farm a ramp.
    state.x = quantize(state.x + state.vx);
    state.vy = quantize(state.vy - 0.17);
    state.y = quantize(state.y + state.vy);
    state.flightTicks++;
    if (lean) state.omega = quantize(clamp(state.omega + lean * 0.012, -0.155, 0.155));
    else state.omega = quantize((state.omega - levelAngle(state.angle) * 0.012) * 0.84);
    state.angle = quantize(state.angle + state.omega);
    const oldFlips = state.flips;
    state.flips = Math.max(state.flips, Math.min(4, Math.floor(Math.abs(state.angle - state.launchAngle) / TAU)));
    state.pending = 100 + Math.min(100, Math.floor(state.flightTicks / 12) * 10) + state.flips * 500;
    if (state.flips > oldFlips) state.lastEvent = { type: 'flip', direction: state.angle > 0 ? 'back' : 'front', count: state.flips };
    const ground = freestyleGround(course, state.x);
    if (state.vy <= 0 && state.y <= ground.height + BIKE_RADIUS) {
      if (Math.abs(levelAngle(state.angle - Math.atan(ground.slope))) > 0.92 || state.vy < -10.5 || course.some(ramp => ramp.obstacles.some(obstacle => Math.abs(state.x - obstacle.x) < obstacle.width / 2 + 10 && state.y - BIKE_RADIUS < obstacle.height))) {
        state.crashes++; state.pending = 0; state.combo = 1; state.respawnTicks = 52;
        state.lastEvent = { type: 'crash' };
      } else {
        let banked = 0;
        if (!state.banked.includes(state.jumpId)) {
          banked = state.pending * state.combo;
          state.score += banked; state.tricks += state.flips; state.banked.push(state.jumpId);
        }
        state.combo = state.flips > 0 ? Math.min(4, state.combo + 1) : 1;
        state.pending = 0; state.airborne = false; state.y = quantize(ground.height + BIKE_RADIUS); state.vy = 0; state.omega = 0; state.angle = quantize(Math.atan(ground.slope));
        state.lastEvent = { type: 'land', banked, flips: state.flips };
      }
    }
  }
  if (state.respawnTicks === 0) {
    for (const ramp of course) {
      if (ramp.start > state.x + 60) break;
      if (ramp.end < state.x - 60) continue;
      if (ramp.obstacles.some(obstacle => Math.abs(state.x - obstacle.x) < obstacle.width / 2 + 10 && state.y - BIKE_RADIUS < obstacle.height)) {
        state.crashes++; state.pending = 0; state.combo = 1; state.respawnTicks = 52; state.checkpointX = ramp.checkpoint;
        state.lastEvent = { type: 'crash' };
        break;
      }
    }
  }
  return state;
}
export function validateFreestyleInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length > FREESTYLE_MAX_INPUTS) throw new TypeError('Comandos inválidos.');
  let previous = -1;
  for (const input of inputs) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'tick') || !Object.hasOwn(input, 'buttons') || !Number.isInteger(input.tick) || input.tick <= previous || input.tick >= FREESTYLE_DURATION_TICKS || !Number.isInteger(input.buttons) || input.buttons < 0 || input.buttons > 15) throw new TypeError('Comando inválido.');
    previous = input.tick;
  }
  return inputs;
}
export function simulateFreestyleRun(seed, inputs) {
  validateFreestyleInputs(inputs);
  const course = generateFreestyleCourse(seed), state = createFreestyleState();
  let index = 0;
  while (state.tick < FREESTYLE_DURATION_TICKS) {
    if (inputs[index]?.tick === state.tick) state.buttons = inputs[index++].buttons;
    stepFreestyleState(state, course);
  }
  return { score: state.score, tricks: state.tricks, crashes: state.crashes, jumps: state.jumps };
}



