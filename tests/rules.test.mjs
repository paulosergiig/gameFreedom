import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, DURATION_TICKS, generateCourse, simulateRun, stepState, validateMoves } from '../public/shared/rules.js';

test('same seed and moves reproduce exactly the same run', () => {
  assert.deepEqual(generateCourse(42), generateCourse(42));
  assert.notDeepEqual(generateCourse(42), generateCourse(43));
  const moves = [{ tick: 100, direction: -1 }, { tick: 120, direction: 1 }, { tick: 130, direction: 1 }];
  assert.deepEqual(simulateRun(42, moves), simulateRun(42, moves));
});

test('every row gives enough warning and a collectible in an unobstructed lane', () => {
  for (let seed = 0; seed < 100; seed++) {
    const course = generateCourse(seed);
    assert.ok(course.length > 25);
    assert.ok(course[0].tick >= 180);
    let previous = 0;
    for (const row of course) {
      assert.ok(row.tick - previous >= 70);
      assert.ok(row.tick < DURATION_TICKS);
      assert.ok(row.obstacles.length >= 1 && row.obstacles.length <= 2);
      assert.ok(!row.obstacles.some(obstacle => obstacle.lane === row.coinLane));
      assert.equal(new Set(row.obstacles.map(obstacle => obstacle.lane)).size, row.obstacles.length);
      previous = row.tick;
    }
  }
});

test('a legal perfect path replays identically and avoids all collisions', () => {
  for (const seed of [0, 1, 42, 4294967295]) {
    const state = createState();
    const course = generateCourse(seed);
    const moves = [];
    for (const row of course) {
      let commandTick = row.tick - 30;
      while (state.tick < row.tick + 1) {
        const direction = state.tick >= commandTick ? Math.sign(row.coinLane - state.lane) : 0;
        if (direction) { moves.push({ tick: state.tick, direction }); commandTick = state.tick + 10; }
        stepState(state, course, direction);
      }
    }
    while (state.tick < DURATION_TICKS) stepState(state, course);
    assert.equal(state.hits, 0);
    assert.equal(state.coins, course.length);
    assert.equal(state.combo, 3);
    assert.deepEqual(simulateRun(seed, moves), { score: state.score, coins: state.coins, hits: state.hits });
    assert.ok(state.score <= 600 + 300 * course.length);
  }
});

test('invalid or impossible inputs cannot be replayed', () => {
  for (const moves of [null, {}, [{ tick: -1, direction: 1 }], [{ tick: 3600, direction: 1 }], [{ tick: 1.5, direction: 1 }], [{ tick: 0, direction: 2 }], [{ tick: 30, direction: -1 }, { tick: 20, direction: 1 }], [{ tick: 10, direction: -1 }, { tick: 19, direction: 1 }]]) assert.throws(() => validateMoves(moves));
  assert.throws(() => simulateRun(42, [{ tick: 10, direction: -1 }, { tick: 20, direction: -1 }]));
  for (const seed of [-1, NaN, Infinity, 1.5, '42', 4294967296]) assert.throws(() => generateCourse(seed));
});

test('stationary run completes at exactly 3600 ticks and score never goes negative', () => {
  const state = createState();
  const course = generateCourse(42);
  for (let i = 0; i < DURATION_TICKS; i++) { stepState(state, course); assert.ok(state.score >= 0); }
  assert.equal(state.tick, DURATION_TICKS);
  const result = { ...state };
  stepState(state, course);
  assert.deepEqual(state, result);
  assert.ok(state.hits > 0);
});
