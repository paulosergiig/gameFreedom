import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurvivalState, stepSurvivalState, survivalSummary, BIKE_RADIUS } from '../public/shared/freestyle-survival.js';

function clearObstacles(state) {
  const obstacle = state.course.flatMap(segment => segment.obstacles).find(item => item.x >= state.x && item.x - state.x < 150);
  return 1 | (obstacle && !state.airborne && !(state.buttons & 16) && state.tick - state.lastJumpTick >= 35 ? 16 : 0);
}

test('freestyle gas alone encounters ground obstacles and loses exactly three lives', () => {
  const state = createSurvivalState(7);
  while (!state.finished && state.tick < 2700) stepSurvivalState(state, 1);
  assert.equal(state.finished, true);
  assert.equal(state.lives, 0);
  assert.equal(state.crashes, 3);
  assert.ok(state.tick < 2700);
  const ended = structuredClone(state);
  stepSurvivalState(state, 17);
  assert.deepEqual(state, ended);
});

test('freestyle a manual jump clears a ground obstacle and banks only after a safe landing', () => {
  const state = createSurvivalState(7);
  let wasAirborne = false;
  while (state.tick < 1000) {
    stepSurvivalState(state, clearObstacles(state));
    if (state.airborne) { wasAirborne = true; assert.equal(state.score, 0); }
    if (state.lastEvent?.type === 'land') break;
  }
  assert.equal(wasAirborne, true);
  assert.equal(state.crashes, 0);
  assert.equal(state.lives, 3);
  assert.ok(state.score > 0);
});

test('freestyle stays endless and bounded while speed and obstacle density increase', () => {
  const state = createSurvivalState(4);
  const initialSpacing = state.course[1].origin - state.course[0].origin;
  let earlySpeed = 0;
  let maximumRows = 0;
  for (let tick = 0; tick < 60 * 60 * 10; tick++) {
    stepSurvivalState(state, clearObstacles(state));
    if (tick === 900) earlySpeed = state.vx;
    maximumRows = Math.max(maximumRows, state.course.length);
  }
  assert.equal(state.finished, false);
  assert.equal(state.lives, 3);
  assert.equal(state.tick, 36000);
  assert.ok(state.score > 10000);
  assert.ok(state.vx > earlySpeed);
  assert.ok(state.course[1].origin - state.course[0].origin < initialSpacing);
  assert.ok(maximumRows <= 5);
  assert.ok(JSON.stringify(state).length < 6000);
});

test('freestyle stationary hops cannot farm points and jump is an edge-triggered action', () => {
  const state = createSurvivalState(1);
  for (let tick = 0; tick < 4000; tick++) stepSurvivalState(state, tick % 100 === 0 ? 16 : 0);
  assert.equal(state.score, 0);
  assert.equal(state.pending, 0);
  assert.equal(state.x, 45);
  assert.ok(state.jumps > 10);
  const held = createSurvivalState(1);
  for (let tick = 0; tick < 1000; tick++) stepSurvivalState(held, 16);
  assert.equal(held.jumps, 1);
});

test('freestyle chunked JSON replay preserves jump edges and matches continuous play', () => {
  const original = createSurvivalState(99);
  let replay = createSurvivalState(99);
  for (let tick = 0; tick < 16000; tick++) {
    const mask = clearObstacles(original);
    stepSurvivalState(original, mask);
    stepSurvivalState(replay, mask);
    if (tick % 317 === 0) replay = JSON.parse(JSON.stringify(replay));
  }
  assert.deepEqual(replay, original);
  assert.deepEqual(survivalSummary(replay), survivalSummary(original));
});

test('freestyle a crash cannot bank pending trick points and recovery prevents double damage', () => {
  const state = createSurvivalState(1);
  const obstacle = state.course[0].obstacles[0];
  Object.assign(state, { x: obstacle.x - 1, y: BIKE_RADIUS + 1, vx: 1, vy: -1, airborne: true, pending: 900, jumpEligible: true, jumpId: 0, launchX: 45, jumpTargetX: 20 });
  stepSurvivalState(state, 0);
  assert.equal(state.score, 0);
  assert.equal(state.pending, 0);
  assert.equal(state.crashes, 1);
  assert.equal(state.lives, 2);
  for (let i = 0; i < 52; i++) stepSurvivalState(state, 0);
  state.x = obstacle.x; state.y = BIKE_RADIUS;
  stepSurvivalState(state, 0);
  assert.equal(state.lives, 2);
  assert.throws(() => stepSurvivalState(state, 32));
  assert.throws(() => stepSurvivalState(state, 1.5));
});
