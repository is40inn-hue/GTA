'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const physics = require('./load-browser-module.cjs')(require.resolve('../dist/rpg-scene.js'))._test;
const engine = require('./load-browser-module.cjs')(require.resolve('../dist/exam-engine.js'));

const question = { id: 'v6-c-rpg', type: 'rpg', section: 'final', points: 14 };
const clone = value => JSON.parse(JSON.stringify(value));

function activeRound(time = 0, aimed = true) {
  return physics.initialState({ version: 1, phase: 'active', time, aim: aimed });
}

function advanceUntil(state, done, seconds = 8, dt = 1 / 60) {
  const events = [];
  for (let frame = 0; !done(state) && frame < Math.ceil(seconds / dt); frame++) {
    events.push(...physics.stepState(state, dt));
  }
  assert(done(state), 'The simulation must reach the expected state within ' + seconds + ' seconds');
  return events;
}

function fireAndResolve(state, dt = 1 / 60) {
  advanceUntil(state, current => !current.projectile && current.cooldown === 0 && (!current.aim || current.lock >= 0.99), 8, dt);
  assert.equal(physics.fireState(state), true, 'An available rocket must fire');
  assert(state.projectile, 'The shot must create a travelling projectile');
  return advanceUntil(state, current => !current.projectile, 4, dt);
}

function finishRound(state, dt = 1 / 60) {
  advanceUntil(state, current => current.phase === 'complete', 3, dt);
  assert(state.result, 'Completion must produce a submitted result');
  return state.result;
}

function rocketsRemaining(state) {
  return 3 - state.shots.length - Number(!!state.projectile);
}

test('two aimed rockets hit the moving helicopter across flight phases and frame rates', () => {
  const cases = [
    { time: 0, dt: 1 / 30 }, { time: 4, dt: 1 / 60 }, { time: 8, dt: 1 / 120 },
    { time: 12, dt: 1 / 30 }, { time: 16, dt: 1 / 60 }, { time: 20, dt: 1 / 120 }
  ];
  for (const sample of cases) {
    const state = activeRound(sample.time), startingPosition = physics.heliAt(state.time).position;
    for (let shot = 0; shot < 2; shot++) {
      const events = fireAndResolve(state, sample.dt);
      assert.equal(events.filter(event => event.type === 'hit').length, 1, 'Exactly one resolved hit per rocket');
      assert.equal(events.some(event => event.type === 'miss'), false);
    }
    const result = finishRound(state, sample.dt);
    assert.notDeepEqual(physics.heliAt(state.time).position, startingPosition, 'The target must have moved during the round');
    assert.deepEqual(result.shots, [{ hit: true, aimed: true }, { hit: true, aimed: true }]);
    assert.equal(rocketsRemaining(state), 1, 'Destroying the only helicopter leaves the third rocket unused');
    assert.equal(engine.ready(question, result), true);
    assert.deepEqual(engine.grade(question, result), { points: 14, correct: 2, total: 2 });
  }
});

test('three unaimed misses finish normally and submit a valid zero-point result', () => {
  for (const time of [0, 7, 16]) {
    const state = activeRound(time, false);
    for (let shot = 0; shot < 3; shot++) {
      const events = fireAndResolve(state);
      assert.equal(events.filter(event => event.type === 'miss').length, 1);
      assert.equal(events.some(event => event.type === 'hit'), false);
    }
    const result = finishRound(state);
    assert.deepEqual(result.shots, Array.from({ length: 3 }, () => ({ hit: false, aimed: false })));
    assert.equal(rocketsRemaining(state), 0);
    assert.equal(engine.ready(question, result), true);
    assert.deepEqual(engine.grade(question, result), { points: 0, correct: 0, total: 2 });
    assert.equal(result.skipped, undefined, 'A played miss round must not be labelled a technical skip');
  }
});

test('restoring a rocket in flight preserves ammunition, its collision and the final result', () => {
  const uninterrupted = activeRound(6.7);
  advanceUntil(uninterrupted, current => current.lock >= 0.99);
  assert.equal(physics.fireState(uninterrupted), true);
  for (let frame = 0; frame < 12; frame++) physics.stepState(uninterrupted, 1 / 60);
  assert(uninterrupted.projectile, 'Save while the rocket is still travelling');

  const saved = clone(uninterrupted), persisted = JSON.stringify(saved), restored = physics.initialState(saved);
  assert.equal(rocketsRemaining(restored), rocketsRemaining(uninterrupted));
  assert.equal(rocketsRemaining(restored), 2);
  assert.deepEqual(restored.projectile, uninterrupted.projectile);
  assert.equal(restored.time, uninterrupted.time);

  const originalEvents = advanceUntil(uninterrupted, current => !current.projectile);
  const restoredEvents = advanceUntil(restored, current => !current.projectile);
  assert.deepEqual(restoredEvents, originalEvents);
  assert.deepEqual(restored.shots, [{ hit: true, aimed: true }]);
  assert.deepEqual(restored.shots, uninterrupted.shots);
  assert.equal(rocketsRemaining(restored), rocketsRemaining(uninterrupted));

  fireAndResolve(uninterrupted); fireAndResolve(restored);
  assert.deepEqual(finishRound(restored), finishRound(uninterrupted));
  assert.equal(engine.grade(question, restored.result).points, 14);
  assert.equal(JSON.stringify(saved), persisted, 'Restoring and continuing must not mutate the saved snapshot');
});

test('fire is blocked in flight, after the third rocket, and after destroying the only helicopter', () => {
  const misses = activeRound(3, false);
  assert.equal(physics.fireState(misses), true);
  const flying = clone(misses.projectile);
  assert.equal(physics.fireState(misses), false, 'A second rocket cannot launch while one is in flight');
  assert.deepEqual(misses.projectile, flying);
  advanceUntil(misses, current => !current.projectile);
  fireAndResolve(misses); fireAndResolve(misses); finishRound(misses);
  const exhausted = clone(misses);
  assert.equal(physics.fireState(misses), false, 'There is no fourth rocket');
  assert.deepEqual(misses, exhausted);

  const hitRound = activeRound(11);
  fireAndResolve(hitRound); fireAndResolve(hitRound); finishRound(hitRound);
  const destroyed = clone(hitRound);
  assert.equal(rocketsRemaining(hitRound), 1);
  assert.equal(physics.fireState(hitRound), false, 'No additional shot after the only target is destroyed');
  for (let frame = 0; frame < 180; frame++) assert.deepEqual(physics.stepState(hitRound, 1 / 60), []);
  assert.deepEqual(hitRound, destroyed, 'A completed round cannot produce extra damage or another completion');
});

test('a submitted completed result overrides a stale active snapshot and cannot be replayed', () => {
  const stale = activeRound(9);
  advanceUntil(stale, current => current.lock >= 0.99);
  assert.equal(physics.fireState(stale), true);
  physics.stepState(stale, 1 / 60);
  const saved = clone(stale);
  const results = [
    { version: 1, completed: true, shots: [{ hit: true, aimed: true }, { hit: true, aimed: true }] },
    { version: 1, completed: true, shots: [{ hit: true, aimed: true }, { hit: false, aimed: false }, { hit: false, aimed: false }] },
    { version: 1, completed: true, skipped: true, shots: [] }
  ];
  for (const result of results) {
    const restored = physics.initialState(saved, result);
    assert.equal(restored.phase, 'complete');
    assert.equal(restored.projectile, null);
    assert.deepEqual(restored.result, result);
    assert.deepEqual(restored.shots, result.shots);
    assert.equal(engine.ready(question, restored.result), true);
    assert.equal(physics.fireState(restored), false);
    assert.deepEqual(physics.stepState(restored, 1 / 30), []);
    assert.deepEqual(restored.result, result);
  }
  assert(saved.projectile, 'Restoring the submitted result must not mutate the supplied snapshot');
});
