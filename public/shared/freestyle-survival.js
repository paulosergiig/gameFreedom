import { BIKE_RADIUS, freestyleGround, levelAngle } from './freestyle-rules.js';
export { BIKE_RADIUS, freestyleGround, levelAngle };
export const RULES_VERSION = 'survival-1';
export const TICK_RATE = 60;
export const FREESTYLE_TICK_RATE = TICK_RATE;
export const FREESTYLE_BUTTONS = Object.freeze({ GAS: 1, BRAKE: 2, BACK: 4, FORWARD: 8, JUMP: 16 });
export const JUMP_COOLDOWN_TICKS = 35;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const quantize = value => Math.round(value * 1000000) / 1000000;

function extendCourse(state) {
  while (state.nextOrigin < state.x + 2700) {
    const id = state.nextSegmentId++;
    const difficulty = Math.min(1, id / 18);
    const origin = state.nextOrigin;
    const start = origin + 920 - Math.round(difficulty * 160);
    const width = 184;
    const height = [92, 100, 108, 96, 104, 112][id % 6];
    const lip = start + width;
    const obstacles = [
      { id: id * 3, x: start - 300, width: 44 + (id % 3) * 4, height: 29 + (id % 3) * 3, type: id % 2 ? 'rock' : 'log' },
      { id: id * 3 + 2, x: lip + 170, width: 42, height: 28, type: id % 2 ? 'log' : 'rock' },
    ];
    state.course.push({ id, origin, start, lip, width, height, slope: height / width, checkpoint: lip + 520, end: lip + 620, landing: null, obstacles });
    state.nextOrigin = lip + 680 - Math.round(difficulty * 60);
  }
  state.course = state.course.filter(segment => segment.end >= state.x - 1000);
}

export function createSurvivalState(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('Semente inválida.');
  const state = {
    tick: 0, lives: 3, finished: false, x: 45, y: BIKE_RADIUS,
    vx: 0, vy: 0, angle: 0, omega: 0, buttons: 0, airborne: false,
    score: 0, pending: 0, combo: 1, tricks: 0, crashes: 0, jumps: 0,
    flips: 0, launchAngle: 0, launchX: 45, flightTicks: 0, jumpId: -1,
    jumpTargetX: 0, jumpEligible: false, lastBankedTarget: -1, lastJumpTick: -JUMP_COOLDOWN_TICKS,
    checkpointX: 45, respawnTicks: 0, invulnerableUntil: 0, lastEvent: null,
    nextSegmentId: 0, nextOrigin: 0, course: [],
  };
  extendCourse(state);
  return state;
}

function beginJump(state, { velocity, angle, target = -1, targetX = 0 }) {
  state.airborne = true; state.jumps++; state.flips = 0; state.flightTicks = 0;
  state.vy = quantize(velocity); state.angle = quantize(angle); state.omega = 0;
  state.launchAngle = state.angle; state.launchX = state.x; state.lastJumpTick = state.tick;
  state.jumpId = target; state.jumpTargetX = targetX;
  state.jumpEligible = target > state.lastBankedTarget && state.vx >= 2;
  state.pending = state.jumpEligible ? 100 : 0;
  state.lastEvent = { type: 'jump' };
}

function crash(state, obstacle = null) {
  if (state.tick < state.invulnerableUntil) return false;
  state.crashes++; state.lives--; state.finished = state.lives === 0;
  state.pending = 0; state.combo = 1; state.jumpEligible = false;
  state.respawnTicks = state.finished ? 0 : 52;
  state.invulnerableUntil = state.tick + 52 + 60;
  let checkpoint = obstacle ? obstacle.x + obstacle.width / 2 + 85 : state.x + 85;
  if (freestyleGround(state.course, checkpoint).height > 0) {
    checkpoint = state.course.find(segment => checkpoint >= segment.start && checkpoint <= segment.lip)?.checkpoint ?? checkpoint;
  }
  state.checkpointX = Math.max(state.checkpointX, checkpoint);
  state.lastEvent = { type: 'crash' };
  return true;
}

function obstacleAt(state) {
  for (const segment of state.course) {
    for (const obstacle of segment.obstacles) {
      if (Math.abs(state.x - obstacle.x) < obstacle.width / 2 + 14 && state.y - BIKE_RADIUS < obstacle.height) return obstacle;
    }
  }
  return null;
}

export function stepSurvivalState(state, buttons = state.buttons) {
  if (state.finished) return state;
  if (!Number.isInteger(buttons) || buttons < 0 || buttons > 31) throw new TypeError('Comando inválido.');
  const jumpPressed = Boolean(buttons & 16) && !(state.buttons & 16);
  state.buttons = buttons; state.lastEvent = null; state.tick++;
  extendCourse(state);
  if (state.respawnTicks > 0) {
    state.respawnTicks--;
    if (!state.respawnTicks) {
      state.x = state.checkpointX; state.y = BIKE_RADIUS; state.angle = 0;
      state.omega = 0; state.vy = 0; state.vx = buttons & 1 ? 2.8 : 0;
      state.airborne = false; state.lastEvent = { type: 'respawn' };
      extendCourse(state);
    }
    return state;
  }
  const gas = Boolean(buttons & 1), brake = Boolean(buttons & 2);
  const lean = ((buttons & 4) ? 1 : 0) - ((buttons & 8) ? 1 : 0);
  const maxSpeed = 6.3 + Math.min(1, state.tick / 10800) * 1.9;
  if (!state.airborne) {
    state.vx = quantize(clamp(state.vx + (brake ? -0.20 : gas ? 0.059 : -0.026), 0, maxSpeed));
    const previousX = state.x;
    state.x = quantize(state.x + state.vx);
    const ramp = state.course.find(segment => previousX <= segment.lip && state.x > segment.lip);
    if (jumpPressed && state.tick - state.lastJumpTick >= JUMP_COOLDOWN_TICKS) {
      const target = state.course.flatMap(segment => segment.obstacles).find(obstacle => obstacle.id > state.lastBankedTarget && obstacle.x >= state.x && obstacle.x - state.x < state.vx * 76);
      const ground = freestyleGround(state.course, state.x);
      state.y = quantize(ground.height + BIKE_RADIUS);
      beginJump(state, { velocity: 6.3, angle: Math.atan(ground.slope), target: target?.id ?? -1, targetX: target?.x ?? 0 });
    } else if (ramp && state.vx > 0.15) {
      state.y = ramp.height + BIKE_RADIUS;
      beginJump(state, { velocity: state.vx * ramp.slope + 1.15, angle: Math.atan(ramp.slope), target: ramp.id * 3 + 1, targetX: ramp.lip + 70 });
      state.checkpointX = ramp.checkpoint;
    } else {
      const ground = freestyleGround(state.course, state.x);
      state.y = quantize(ground.height + BIKE_RADIUS);
      const target = Math.atan(ground.slope) + lean * (state.vx > 1 ? 0.22 : 0.08);
      state.angle = quantize(state.angle + levelAngle(target - state.angle) * 0.22); state.omega = 0;
    }
  } else {
    state.x = quantize(state.x + state.vx);
    state.vy = quantize(state.vy - 0.17); state.y = quantize(state.y + state.vy); state.flightTicks++;
    if (lean) state.omega = quantize(clamp(state.omega + lean * 0.012, -0.155, 0.155));
    else state.omega = quantize((state.omega - levelAngle(state.angle) * 0.012) * 0.84);
    state.angle = quantize(state.angle + state.omega);
    const oldFlips = state.flips;
    state.flips = Math.max(state.flips, Math.min(4, Math.floor(Math.abs(state.angle - state.launchAngle) / TAU)));
    state.pending = state.jumpEligible ? 100 + Math.min(100, Math.floor(state.flightTicks / 12) * 10) + state.flips * 500 : 0;
    if (state.flips > oldFlips) state.lastEvent = { type: 'flip', direction: state.angle > 0 ? 'back' : 'front', count: state.flips };
    const ground = freestyleGround(state.course, state.x);
    if (state.vy <= 0 && state.y <= ground.height + BIKE_RADIUS) {
      const obstacle = obstacleAt(state);
      if (obstacle || Math.abs(levelAngle(state.angle - Math.atan(ground.slope))) > 0.92 || state.vy < -10.5) {
        if (crash(state, obstacle)) return state;
      }
      let banked = 0;
      if (!obstacle && state.jumpEligible && state.jumpId > state.lastBankedTarget && state.x >= state.jumpTargetX + 25 && state.x - state.launchX >= 80) {
        banked = state.pending * state.combo; state.score += banked;
        state.tricks += state.flips; state.lastBankedTarget = state.jumpId;
      }
      state.combo = banked > 0 && state.flips > 0 ? Math.min(4, state.combo + 1) : 1;
      state.pending = 0; state.airborne = false; state.y = quantize(ground.height + BIKE_RADIUS);
      state.vy = 0; state.omega = 0; state.angle = quantize(Math.atan(ground.slope));
      state.lastEvent = { type: 'land', banked, flips: state.flips };
    }
  }
  const obstacle = obstacleAt(state);
  if (obstacle) crash(state, obstacle);
  return state;
}

export function survivalSummary(state) {
  return {
    score: state.score, lives: state.lives, finished: state.finished,
    elapsedTicks: state.tick, elapsed: state.tick / TICK_RATE,
    level: 1 + Math.min(5, Math.floor(state.tick / 1800)),
    pending: state.pending, combo: state.combo, tricks: state.tricks,
    crashes: state.crashes, jumps: state.jumps, speed: Math.round(state.vx * 12),
    airborne: state.airborne && state.respawnTicks === 0,
  };
}
