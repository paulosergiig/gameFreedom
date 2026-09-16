import test from 'node:test';
import assert from 'node:assert/strict';
import { BIKE_RADIUS, createFreestyleState, FREESTYLE_DURATION_TICKS, FREESTYLE_MAX_INPUTS, generateFreestyleCourse, simulateFreestyleRun, stepFreestyleState, validateFreestyleInputs } from '../public/shared/freestyle-rules.js';

function drive(choose, seed = 42) {
  const state = createFreestyleState(), course = generateFreestyleCourse(seed), inputs = [], events = [];
  let buttons = -1;
  while (state.tick < FREESTYLE_DURATION_TICKS) {
    const selected = choose(state, course);
    if (selected !== buttons) { inputs.push({ tick: state.tick, buttons: selected }); buttons = selected; }
    const score = state.score;
    stepFreestyleState(state, course, buttons);
    if (state.lastEvent) events.push({ tick: state.tick, ...state.lastEvent });
    if (state.score !== score) assert.equal(state.lastEvent?.type, 'land', 'Only a clean landing may change score.');
    if (state.lastEvent?.type === 'crash') assert.equal(state.score, score, 'A crash must never bank pending points.');
  }
  return { state, course, inputs, events };
}
const summary = state => ({ score: state.score, tricks: state.tricks, crashes: state.crashes, jumps: state.jumps });

test('competition uses identical varied courses for all seeds and a complete 90 second run', () => {
  const course = generateFreestyleCourse(42);
  assert.deepEqual(generateFreestyleCourse(0), generateFreestyleCourse(4294967295));
  assert.ok(new Set(course.map(ramp => ramp.height)).size >= 4);
  assert.ok(course.some(ramp => ramp.landing));
  assert.ok(course.every(ramp => ramp.obstacles.length >= 1));
  assert.ok(course.at(-1).end > FREESTYLE_DURATION_TICKS * 7.4);
  const result = simulateFreestyleRun(42, [{ tick: 0, buttons: 1 }]);
  assert.equal(result.crashes, 0);
  assert.equal(result.tricks, 0);
  assert.ok(result.jumps >= 25);
  assert.ok(result.score > 3000);
  assert.deepEqual(simulateFreestyleRun(0, [{ tick: 0, buttons: 1 }]), result);
});

test('front and back full flips replay exactly, bank on landing, and cap combo', () => {
  for (const direction of [4, 8]) {
    const { state, inputs, events } = drive(s => 1 | (s.airborne && s.flips === 0 ? direction : 0));
    assert.deepEqual(simulateFreestyleRun(42, inputs), summary(state));
    assert.equal(state.crashes, 0);
    assert.ok(state.tricks >= 25);
    assert.ok(state.combo <= 4);
    assert.ok(inputs.length < FREESTYLE_MAX_INPUTS);
    const flip = events.find(event => event.type === 'flip'), land = events.find(event => event.type === 'land');
    assert.ok(flip.tick < land.tick);
    assert.equal(flip.direction, direction === 4 ? 'back' : 'front');
    assert.equal(land.flips, 1);
    assert.equal(land.banked, 660);
    assert.equal(new Set(state.banked).size, state.banked.length);
  }
});

test('leaning back and forth without a full turn earns no flip', () => {
  const result = drive(s => 1 | (s.airborne ? Math.floor(s.flightTicks / 8) % 2 ? 8 : 4 : 0));
  assert.equal(result.state.tricks, 0);
  assert.equal(result.events.some(event => event.type === 'flip'), false);
});

test('partial airborne points disappear on crash and the clock continues through respawn', () => {
  const course = generateFreestyleCourse(42), state = createFreestyleState(), obstacle = course[0].obstacles[0];
  Object.assign(state, { x: obstacle.x - 2, y: BIKE_RADIUS, vx: 2, score: 500, pending: 600, combo: 4 });
  stepFreestyleState(state, course, 0);
  assert.equal(state.lastEvent.type, 'crash');
  assert.equal(state.score, 500); assert.equal(state.pending, 0); assert.equal(state.combo, 1); assert.equal(state.crashes, 1);
  for (let i = 0; i < 52; i++) stepFreestyleState(state, course, 1);
  assert.equal(state.tick, 53); assert.equal(state.respawnTicks, 0); assert.equal(state.x, course[0].checkpoint);
  assert.equal(state.score, 500); assert.equal(state.airborne, false);
});

test('regression: touching an obstacle on the landing tick does not credit points', () => {
  const inputs = [{ tick: 0, buttons: 1 }, { tick: 270, buttons: 2 }, { tick: 394, buttons: 1 }, { tick: 440, buttons: 2 }, { tick: 722, buttons: 1 }];
  let index = 0, buttons = 0;
  const result = drive(state => { if (inputs[index]?.tick === state.tick) buttons = inputs[index++].buttons; return buttons; }, 1);
  assert.ok(result.events.some(event => event.type === 'crash'));
  assert.deepEqual(simulateFreestyleRun(1, inputs), summary(result.state));
});

test('a banked jump cannot be farmed and unfinished final jumps never bank', () => {
  const course = generateFreestyleCourse(42), state = createFreestyleState();
  const landingX = course[0].lip + 540;
  Object.assign(state, { x: landingX, y: BIKE_RADIUS + 0.1, vy: -1, vx: 0, airborne: true, jumpId: 0, pending: 600, score: 123, banked: [0], angle: 0, launchAngle: 0 });
  stepFreestyleState(state, course, 0);
  assert.equal(state.lastEvent.type, 'land'); assert.equal(state.lastEvent.banked, 0); assert.equal(state.score, 123);
  Object.assign(state, { tick: FREESTYLE_DURATION_TICKS - 1, airborne: true, y: 250, vy: 1, pending: 600, jumpId: 1 });
  stepFreestyleState(state, course, 0);
  assert.equal(state.tick, FREESTYLE_DURATION_TICKS); assert.equal(state.score, 123); assert.ok(state.pending > 0);
  const final = structuredClone(state); stepFreestyleState(state, course, 1); assert.deepEqual(state, final);
});

test('replay rejects malformed masks, unordered ticks, oversized inputs and invalid seeds', () => {
  for (const inputs of [null, {}, [{ tick: -1, buttons: 1 }], [{ tick: 5400, buttons: 1 }], [{ tick: 1.1, buttons: 1 }], [{ tick: 0, buttons: 16 }], [{ tick: 0, buttons: -1 }], [{ tick: 0, buttons: 1.5 }], [{ tick: 1, buttons: 1 }, { tick: 1, buttons: 0 }], [{ tick: 2, buttons: 1 }, { tick: 1, buttons: 0 }], [{ tick: 0, buttons: 1, score: 9000 }], Array.from({ length: 721 }, (_, tick) => ({ tick, buttons: tick % 2 }))]) assert.throws(() => validateFreestyleInputs(inputs));
  for (const seed of [-1, 4294967296, NaN, Infinity, '42', 1.5]) assert.throws(() => simulateFreestyleRun(seed, []));
  assert.deepEqual(simulateFreestyleRun(42, []), { score: 0, tricks: 0, crashes: 0, jumps: 0 });
});
