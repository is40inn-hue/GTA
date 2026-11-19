'use strict';

// Flow and persistence tests. Native outcomes below are protocol fixtures;
// they do not simulate a rocket hit or prove browser/GPU gameplay.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createCountdown, acceptProtocol } = require('./load-browser-module.cjs')(path.join(__dirname, '../dist/practice-flow.js'));

function clockHarness() {
  let time = 0, id = 0;
  const timers = new Map(), callbacks = [], delays = [];
  const flow = createCountdown({
    now: () => time,
    setInterval(fn, delay) { const next = ++id; timers.set(next, fn); callbacks.push(fn); delays.push(delay); return next; },
    clearInterval(key) { timers.delete(key); }
  });
  return {
    flow, timers, callbacks, delays,
    elapse(ms) { time += ms; },
    fire() { for (const [key, fn] of Array.from(timers)) if (timers.has(key)) fn(); },
    advance(ms) {
      assert.equal(ms % 100, 0);
      for (let elapsed = 0; elapsed < ms; elapsed += 100) {
        time += 100;
        for (const [key, fn] of Array.from(timers)) if (timers.has(key)) fn();
      }
    }
  };
}

test('one-start countdown waits for active reading time and completes only once', () => {
  const h = clockHarness(), ticks = [];
  let active = true, completed = 0;
  h.flow.start({ durationMs: 3000, isActive: () => active, onTick: tick => ticks.push(tick), onComplete: () => completed++ });
  assert.deepEqual(ticks[0], { remainingMs: 3000, seconds: 3, paused: false });
  assert.equal(completed, 0); assert.deepEqual(h.delays, [100]);
  h.advance(1200); assert.equal(h.flow.getState().remainingMs, 1800);
  active = false; h.flow.sync();
  h.elapse(90000); h.flow.sync();
  assert.equal(h.flow.getState().remainingMs, 1800); assert.equal(ticks.at(-1).paused, true);
  active = true; h.flow.sync();
  assert.equal(h.flow.getState().remainingMs, 1800, 'Returning from a suspended tab cannot consume its hidden time');
  h.advance(1700); assert.equal(completed, 0); h.advance(100);
  assert.equal(completed, 1); assert.deepEqual(h.flow.getState(), { running: false, remainingMs: 0 });
  h.callbacks[0](); h.flow.sync(); assert.equal(completed, 1); assert.equal(h.timers.size, 0);
});

test('long browser stalls are bounded and clock rollback cannot grow or instantly finish the countdown', () => {
  const h = clockHarness(); let completed = 0;
  h.flow.start({ durationMs: 1000, onComplete: () => completed++ });
  h.elapse(20000); h.fire(); assert.equal(h.flow.getState().remainingMs, 750); assert.equal(completed, 0);
  h.elapse(-10000); h.fire(); assert.equal(h.flow.getState().remainingMs, 750);
  h.advance(700); assert.equal(completed, 0); h.advance(100); assert.equal(completed, 1);
});

test('cancel, replacement and a changed question key make captured old callbacks harmless', () => {
  const h = clockHarness(); let key = 'C1', oldCompleted = 0, nextCompleted = 0;
  h.flow.start({ durationMs: 200, isCurrent: () => key === 'C1', onComplete: () => oldCompleted++ });
  const oldCallback = h.callbacks.at(-1);
  h.flow.cancel(); h.elapse(500); oldCallback();
  assert.equal(oldCompleted, 0); assert.equal(h.timers.size, 0);
  h.flow.start({ durationMs: 500, isCurrent: () => key === 'C1', onComplete: () => nextCompleted++ });
  oldCallback(); assert.equal(h.flow.getState().remainingMs, 500);
  key = 'C2'; h.flow.sync();
  h.elapse(2000); h.callbacks.forEach(callback => callback());
  assert.deepEqual([oldCompleted, nextCompleted], [0, 0]); assert.equal(h.flow.getState().running, false);
});

test('onTick may cancel immediately or replace a run at its final tick without advancing the old scene', () => {
  const h = clockHarness(); let oldCompleted = 0, replacementCompleted = 0;
  h.flow.start({ durationMs: 1000, onTick: () => h.flow.cancel(), onComplete: () => oldCompleted++ });
  assert.equal(h.timers.size, 0); h.callbacks[0](); assert.equal(oldCompleted, 0);
  h.flow.start({ durationMs: 100, onTick: tick => {
    if (tick.remainingMs === 0) h.flow.start({ durationMs: 500, onComplete: () => replacementCompleted++ });
  }, onComplete: () => oldCompleted++ });
  h.advance(100); assert.equal(oldCompleted, 0); assert.equal(h.flow.getState().remainingMs, 500);
  assert.equal(h.timers.size, 1); h.advance(500);
  assert.equal(replacementCompleted, 1); assert.equal(oldCompleted, 0);
});

test('a modal or question change opened by the final tick prevents an automatic start', () => {
  for (const boundary of ['active', 'current']) {
    const h = clockHarness(); let active = true, current = true, completed = 0;
    h.flow.start({ durationMs: 100, isActive: () => active, isCurrent: () => current,
      onTick: tick => { if (!tick.remainingMs) { if (boundary === 'active') active = false; else current = false; } },
      onComplete: () => completed++ });
    h.advance(100); assert.equal(completed, 0);
    assert.equal(h.flow.getState().running, boundary === 'active');
    h.flow.cancel();
  }
});

test('zero-duration transitions still cross an asynchronous or explicit sync boundary and respect pause', () => {
  const h = clockHarness(); let active = false, completed = 0;
  h.flow.start({ durationMs: 0, isActive: () => active, onComplete: () => completed++ });
  assert.equal(completed, 0); h.advance(1000); assert.equal(completed, 0);
  active = true; h.flow.sync(); assert.equal(completed, 1);
});

test('a completed run can start the next countdown without losing its timer', () => {
  const h = clockHarness(), order = [];
  h.flow.start({ durationMs: 100, onComplete() {
    order.push('C1'); h.flow.start({ durationMs: 100, onComplete: () => order.push('C2') });
  } });
  h.advance(100); assert.deepEqual(order, ['C1']); assert.equal(h.timers.size, 1);
  h.advance(100); assert.deepEqual(order, ['C1', 'C2']); assert.equal(h.timers.size, 0);
});

test('the first valid protocol is committed once and snapshots cannot mutate the accepted answer', () => {
  const question = { id: 'C1', points: 10 }, protocol = { completed: true, targets: [{ credited: true }] };
  const attempt = { answers: {}, drafts: { C1: { pending: true }, C2: { pending: true } }, questionTimes: { C1: 12.34 } };
  let gradeCalls = 0;
  const options = { attempt, question, protocol, ready: (_q, value) => value.completed === true,
    grade: () => { gradeCalls++; return { points: 10, correct: 1, total: 1 }; } };
  const first = acceptProtocol(options);
  assert.equal(first.status, 'accepted'); assert.equal(first.answer.seconds, 12.3);
  assert.equal(attempt.drafts.C1, undefined); assert.deepEqual(attempt.drafts.C2, { pending: true });
  protocol.targets[0].credited = false; first.answer.value.targets[0].credited = false; first.answer.points = 0;
  assert.equal(attempt.answers.C1.value.targets[0].credited, true); assert.equal(attempt.answers.C1.points, 10);
  const second = acceptProtocol({ ...options, protocol: { completed: false, targets: [] } });
  assert.equal(second.status, 'existing'); assert.equal(second.answer.points, 10); assert.equal(gradeCalls, 1);
  second.answer.value.targets.length = 0; assert.equal(attempt.answers.C1.value.targets.length, 1);
});

test('invalid, nonserializable and failed grading submissions leave answers and drafts intact', () => {
  const question = { id: 'C1' }, attempt = { answers: {}, drafts: { C1: { pending: true } }, questionTimes: { C1: 9 } };
  const before = JSON.stringify(attempt); let gradeCalls = 0;
  const options = { attempt, question, ready: (_q, value) => value.completed === true,
    grade: () => { gradeCalls++; return { points: 10 }; } };
  assert.equal(acceptProtocol({ ...options, protocol: { completed: false } }).status, 'invalid');
  const circular = { completed: true }; circular.self = circular;
  assert.equal(acceptProtocol({ ...options, protocol: circular }).status, 'invalid'); assert.equal(gradeCalls, 0);
  assert.equal(acceptProtocol({ ...options, protocol: { completed: true }, grade: () => { throw new Error('No grade'); } }).status, 'invalid');
  assert.equal(JSON.stringify(attempt), before);
});

test('accepted time is finite and nonnegative even when a stored time is absent or malformed', () => {
  for (const seconds of [undefined, NaN, Infinity, -8]) {
    const attempt = { answers: {}, questionTimes: { C1: seconds } };
    const result = acceptProtocol({ attempt, question: { id: 'C1' }, protocol: {}, ready: () => true, grade: () => ({ points: 0 }) });
    assert.equal(result.status, 'accepted'); assert.equal(result.answer.seconds, 0);
  }
});

test('real exam validation awards exactly 36 for three accepted native protocols and preserves them on replay', () => {
  const engine = require('./load-browser-module.cjs')(require.resolve('../dist/exam-engine.js'));
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/v8-practice-content.js'), 'utf8'), scope);
  const questions = Object.fromEntries(scope.window.GTAExamPracticalQuestions.map(q => [q.id, q]));
  const attempt = { answers: {}, drafts: {}, questionTimes: {} };
  let gradeCalls = 0;
  const grade = (question, value) => { gradeCalls++; return engine.grade(question, value); };
  for (const id of engine.buildTicket('continuous', 8).slice(-3)) {
    const question = questions[id]; assert(question);
    const protocol = { engine: 'vice-city-wasm', version: 2, scene: question.nativeScene, completed: true, outcome: 'cleared',
      ammoInitial: question.initialAmmo, ammoRemaining: question.initialAmmo - Math.min(question.targetsCount, question.initialAmmo),
      targets: Array.from({ length: question.targetsCount }, () => ({ credited: true, destroyed: question.nativeScene === 3, health: question.nativeScene === 3 ? 0 : 970 })) };
    assert.equal(acceptProtocol({ attempt, question, protocol: { ...protocol, scene: 99 }, ready: engine.ready, grade }).status, 'invalid');
    assert.equal(acceptProtocol({ attempt, question, protocol, ready: engine.ready, grade }).status, 'accepted');
    const skip = { engine: 'vice-city-wasm', version: 2, scene: question.nativeScene, completed: true, skipped: true,
      outcome: 'unavailable', reason: 'runtime-unavailable', ammoInitial: question.initialAmmo, ammoRemaining: question.initialAmmo, targets: [] };
    assert.equal(acceptProtocol({ attempt, question, protocol: skip, ready: engine.ready, grade }).status, 'existing');
  }
  assert.equal(Object.values(attempt.answers).reduce((sum, answer) => sum + answer.points, 0), 36);
  assert.equal(gradeCalls, 3);
});

test('browser script exports the same public API without requiring a module loader', () => {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/practice-flow.js'), 'utf8'), scope);
  assert.deepEqual(Object.keys(scope.window.GTAPracticeFlow).sort(), ['acceptProtocol', 'createCountdown']);
});
