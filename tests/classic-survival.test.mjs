import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurvivalState, stepSurvivalState, survivalSummary, speedAtTick, distanceAtTick, VIEW_DISTANCE } from '../public/shared/classic-survival.js';

function steerSafely(state) {
  const next = state.course.find(row => row.tick >= state.tick);
  return next && state.tick - state.lastMoveTick >= 10 ? Math.sign(next.coinLane - state.lane) : 0;
}

test('classic survival loses exactly three lives and stops immediately', () => {
  for (const seed of [1, 28, 3829382]) {
    const state = createSurvivalState(seed);
    while (!state.finished && state.tick < 12000) stepSurvivalState(state);
    assert.equal(state.finished, true);
    assert.equal(state.lives, 0);
    assert.equal(state.hits, 3);
    const ended = structuredClone(state);
    stepSurvivalState(state);
    assert.deepEqual(state, ended);
  }
});

test('classic survival continues past a minute and keeps a bounded course for half an hour', () => {
  const state = createSurvivalState(1997);
  let maximumRows = 0;
  for (let tick = 0; tick < 60 * 60 * 30; tick++) {
    stepSurvivalState(state, steerSafely(state));
    maximumRows = Math.max(maximumRows, state.course.length);
  }
  assert.equal(state.finished, false);
  assert.equal(state.lives, 3);
  assert.equal(state.tick, 108000);
  assert.ok(state.score > 10000);
  assert.ok(maximumRows <= 12);
  assert.ok(JSON.stringify(state).length < 4000);
});

test('classic speed increases gradually and obstacles always leave time for two lane changes', () => {
  assert.ok(speedAtTick(3600) > speedAtTick(1800));
  assert.ok(speedAtTick(1800) > speedAtTick(0));
  assert.equal(speedAtTick(36000), 2.3);
  const state = createSurvivalState(28);
  let previous = null;
  let latestRowId = -1;
  let doubled = 0;
  for (let tick = 0; tick < 18000; tick++) {
    for (const row of state.course) {
      if (row.id <= latestRowId) continue;
      latestRowId = row.id;
      if (previous) assert.ok(row.tick - previous.tick >= 38);
      assert.ok(VIEW_DISTANCE / speedAtTick(row.tick) >= 90);
      assert.equal(row.distance, distanceAtTick(row.tick));
      assert.ok(!row.obstacles.some(item => item.lane === row.coinLane));
      doubled += row.obstacles.length === 2;
      previous = row;
    }
    stepSurvivalState(state, steerSafely(state));
  }
  assert.ok(doubled > 50);
});

test('classic chunked JSON replay equals continuous simulation', () => {
  const uninterrupted = createSurvivalState(73822);
  let resumed = createSurvivalState(73822);
  for (let tick = 0; tick < 12000; tick++) {
    const direction = steerSafely(uninterrupted);
    stepSurvivalState(uninterrupted, direction);
    stepSurvivalState(resumed, direction);
    if (tick % 317 === 0) resumed = JSON.parse(JSON.stringify(resumed));
  }
  assert.deepEqual(resumed, uninterrupted);
  assert.deepEqual(survivalSummary(resumed), survivalSummary(uninterrupted));
});

test('classic rejects impossible moves and protects against immediate repeated hits', () => {
  const state = createSurvivalState(12);
  assert.throws(() => stepSurvivalState(state, 2));
  stepSurvivalState(state, -1);
  assert.throws(() => stepSurvivalState(state, -1));
  assert.throws(() => stepSurvivalState(state, 1));
  state.course = [
    { id: 0, tick: state.tick, distance: 1, coinLane: 2, obstacles: [{ lane: 0, type: 'rock' }] },
    { id: 1, tick: state.tick + 1, distance: 2, coinLane: 2, obstacles: [{ lane: 0, type: 'rock' }] },
  ];
  stepSurvivalState(state);
  assert.equal(state.lives, 2);
  stepSurvivalState(state);
  assert.equal(state.lives, 2);
});
