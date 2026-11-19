'use strict';

// Production UI/protocol lifecycle in a VM; no WASM/GPU simulation is claimed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const E = require('../dist/exam-engine.js');
const question = { id: 'v10-c-escape', type: 'vice', nativeScene: 2, resultVersion: 3, points: 10, targetsCount: 2, pointsPerTarget: 5, initialAmmo: 0 };
const result = () => ({ engine: 'vice-city-wasm', version: 3, scene: 2, completed: true, outcome: 'cleared', ammoInitial: 0, ammoRemaining: 0, targets: [], milestones: { hijacked: true, driveCompleted: true } });
const arrivalQuestion = { id: 'v10-c-explode', type: 'vice', nativeScene: 1, resultVersion: 3, points: 12, targetsCount: 1, pointsPerTarget: 12, initialAmmo: 40 };
const arrivalResult = () => ({ engine: 'vice-city-wasm', version: 3, scene: 1, completed: true, outcome: 'cleared', ammoInitial: 40, ammoRemaining: 39, targets: [{ credited: true, destroyed: true, health: 0 }] });

function harness(options = {}) {
  const fixturePath = path.join(__dirname, 'vice-port.test.cjs');
  const source = fs.readFileSync(fixturePath, 'utf8');
  const boundary = source.indexOf("\ntest('VM contract:"); assert(boundary > 0);
  const scope = { require: createRequire(fixturePath), __dirname, Buffer, URL, URLSearchParams, TextEncoder, AbortController, Blob, console, module: { exports: {} } };
  vm.runInNewContext(source.slice(0, boundary) + '\nmodule.exports = makeHarness;', scope, { filename: fixturePath });
  return scope.module.exports({ edition: 17, continuous: true, ...options });
}
function completeDrive(h, seen = true) {
  h.setPacket({ phase: h.config.phases.complete, scene: 2, completed: 1, outcome: 1,
    ammo: 0, ammoInitial: 0, weapon: 0, targetCount: h.config.scenes[1].targetCount,
    hijacked: 1, driveCompleted: 1, cameoSeen: Number(seen), heartbeat: 8 });
  h.frame(); assert.equal(h.snapshot().stage, 'finishing');
  h.frame(700);
}
function arrivalPacket(h, seen = [true, true]) {
  return { phase: h.config.phases.complete, scene: 1, completed: 1, outcome: 1,
    ammo: 39, ammoInitial: 40, weapon: 23, currentWeapon: 23,
    targetCount: 1, target0_health: 0, target0_credited: 1, target0_destroyed: 1,
    pickupCollected: 1, arrivalPudgeSeen: Number(seen[0]), arrivalSteveSeen: Number(seen[1]), heartbeat: 8 };
}
function completeArrival(h, seen) {
  h.setPacket(arrivalPacket(h, seen));
  h.frame(); assert.equal(h.snapshot().stage, 'finishing');
  h.frame(700);
}
const completions = h => h.messages.filter(item => item.message.type === 'vice:complete');

test('legacy RC4.6 street records still accept known choices and never change driving points', () => {
  assert.equal(E.grade(question, result()).points, 10);
  for (const choice of ['local', 'steve', 'officer', 'missed']) {
    const observation = { id: E.streetObservation.id, choice };
    const protocol = { ...result(), observation };
    assert(E.ready(question, protocol));
    assert.equal(E.grade(question, protocol).points, 10);
    assert.equal(E.streetObservation.review(observation).correct, choice === 'steve');
  }
  for (const observation of [null, [], {}, { id: 'other', choice: 'steve' },
    { id: E.streetObservation.id, choice: '__proto__' }, { id: E.streetObservation.id, choice: { toString: () => 'steve' } }]) {
    assert.equal(E.streetObservation.read(observation), null);
    assert.equal(E.ready(question, { ...result(), observation }), false);
  }
});

test('arrival records accept exactly two distinct known guests or skip without changing C1 points', () => {
  for (const choices of [[], ['pudge', 'steve'], ['steve', 'pudge'], ['cj', 'dancer'], ['pudge', 'cj']]) {
    const observation = { id: E.streetObservation.arrivalId, choices };
    const protocol = { ...arrivalResult(), observation };
    assert(E.ready(arrivalQuestion, protocol));
    assert.equal(E.grade(arrivalQuestion, protocol).points, 12);
    assert.equal(E.streetObservation.review(observation).correct, choices.includes('pudge') && choices.includes('steve'));
    assert.deepEqual(E.streetObservation.read(observation).choices, [...choices].sort());
  }
  for (const choices of [null, 'pudge,steve', ['pudge'], ['pudge', 'pudge'], ['pudge', 'steve', 'cj'], ['pudge', '__proto__'], ['pudge', { toString: () => 'steve' }]]) {
    const observation = { id: E.streetObservation.arrivalId, choices };
    assert.equal(E.streetObservation.read(observation), null);
    assert.equal(E.ready(arrivalQuestion, { ...arrivalResult(), observation }), false,
      'C1 rejects malformed saved observations just as legacy C2 did');
  }
});

test('witnessing both C1 crossover guests pauses play until two choices are confirmed', async () => {
  const h = harness();
  try {
    await h.boot(); h.playing(1); completeArrival(h);
    assert.equal(h.snapshot().stage, 'observation');
    assert.equal(h.nodes.get('native-street-question').hidden, false);
    assert.equal(h.nodes.get('car-controls').hidden, true);
    assert.equal(h.nodes.get('native-pause').hidden, true);
    assert.equal(completions(h).length, 0);
    const clock = h.heap[h.packetIndex + h.config.slots.nativeTimer];
    assert.equal(h.frame(15000), false, 'Question must stop the native loop, not consume game time');
    assert.equal(h.heap[h.packetIndex + h.config.slots.nativeTimer], clock);
    h.message({ type: 'vice:scene', scene: 2 });
    assert.equal(h.snapshot().scene, 1, 'Parent cannot skip the active question');
    const confirm = h.nodes.get('arrival-confirm');
    assert.equal(confirm.disabled, true);
    confirm.onclick(); assert.equal(completions(h).length, 0);
    h.nodes.get('arrival-answer-cj').onclick();
    assert.equal(confirm.disabled, true);
    confirm.onclick(); assert.equal(completions(h).length, 0, 'A single selected guest cannot silently submit');
    h.nodes.get('arrival-answer-pudge').onclick();
    assert.equal(confirm.disabled, false);
    h.nodes.get('arrival-answer-steve').onclick();
    assert.equal(h.nodes.get('arrival-answer-steve').getAttribute('aria-pressed'), 'false', 'A third tap does not replace either choice');
    h.nodes.get('arrival-answer-cj').onclick();
    assert.equal(confirm.disabled, true, 'The user can deselect and change their mind');
    h.nodes.get('arrival-answer-steve').onclick();
    assert.equal(confirm.disabled, false);
    h.visibility(true); h.nodes.get('arrival-answer-steve').onclick(); confirm.onclick();
    assert.equal(completions(h).length, 0, 'Hidden page cannot accept an accidental answer');
    h.visibility(false); confirm.onclick();
    assert.equal(h.snapshot().stage, 'complete');
    assert.equal(completions(h).length, 1);
    const saved = completions(h)[0].message.result;
    assert.deepEqual(JSON.parse(JSON.stringify(saved.observation)), { id: E.streetObservation.arrivalId, choices: ['pudge', 'steve'] });
    assert(E.ready(arrivalQuestion, saved)); assert.equal(E.grade(arrivalQuestion, saved).points, 12);
    h.nodes.get('arrival-answer-cj').onclick(); confirm.onclick();
    assert.equal(completions(h).length, 1, 'A second tap cannot replace or duplicate the answer');
    assert.equal(h.nodes.get('complete-observation').hidden, true, 'Exam correctness is withheld until the final review');
  } finally { h.destroy(); }
});

test('C1 does not ask the question unless both required guests were witnessed', async () => {
  for (const seen of [[false, false], [true, false], [false, true]]) {
    const h = harness();
    try {
      await h.boot(); h.playing(1); completeArrival(h, seen);
      assert.equal(h.snapshot().stage, 'complete');
      assert.equal(completions(h).length, 1);
      assert.equal(completions(h)[0].message.result.observation, undefined);
      assert.equal(h.nodes.get('native-street-question').hidden, true);
    } finally { h.destroy(); }
  }
});

test('a legacy C2 cameo flag no longer interrupts the drive with the arrival question', async () => {
  const h = harness();
  try {
    await h.boot(); h.playing(2); completeDrive(h, true);
    assert.equal(h.snapshot().stage, 'complete');
    assert.equal(completions(h).length, 1);
    assert.equal(completions(h)[0].message.result.observation, undefined);
    assert.equal(h.nodes.get('native-street-question').hidden, true);
  } finally { h.destroy(); }
});

test('missing the observation answer preserves progress; a destroyed session accepts no late tap', async () => {
  const h = harness();
  await h.boot(); h.playing(1); completeArrival(h);
  h.nodes.get('street-answer-missed').onclick();
  assert.equal(completions(h).length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(completions(h)[0].message.result.observation)), { id: E.streetObservation.arrivalId, choices: [] });
  assert.equal(E.grade(arrivalQuestion, completions(h)[0].message.result).points, 12);
  h.destroy(); h.nodes.get('arrival-answer-steve').onclick(); h.nodes.get('arrival-confirm').onclick();
  assert.equal(completions(h).length, 1);
});

test('the final review derives the revealed answer rather than trusting a supplied correct flag', () => {
  const review = E.streetObservation.review({ id: E.streetObservation.id, choice: 'officer', correct: true });
  assert.equal(review.correct, false);
  assert.equal(review.chosen, 'Полицейский');
  assert.equal(review.answer, 'Стив из Minecraft');
  const arrivalReview = E.streetObservation.review({ id: E.streetObservation.arrivalId, choices: ['cj', 'dancer'], correct: true });
  assert.equal(arrivalReview.correct, false);
  assert.equal(arrivalReview.answer, 'Пудж и Стив');
});

test('revisiting completed C1 retains both choices once while rejecting changed native results', async () => {
  for (const changedNativeResult of [false, true]) {
    const h = harness();
    try {
      await h.boot(); h.playing(1); completeArrival(h);
      h.nodes.get('arrival-answer-pudge').onclick(); h.nodes.get('arrival-answer-steve').onclick(); h.nodes.get('arrival-confirm').onclick();
      const original = completions(h).find(item => item.message.result.scene === 1).message.result;
      const questionsBefore = h.messages.filter(item => item.message.type === 'vice:state' && item.message.state.stage === 'observation').length;
      h.playing(2); completeDrive(h, false);
      assert.equal(h.context.ViceRange.setScene(1), true);
      // A restored SCM record has native fields only: no JavaScript observation.
      h.setPacket({ ...arrivalPacket(h),
        outcome: changedNativeResult ? 3 : 1,
        target0_credited: changedNativeResult ? 0 : 1,
        target0_destroyed: changedNativeResult ? 0 : 1,
        target0_health: changedNativeResult ? 1000 : 0, heartbeat: 12,
        ackSeq: h.heap[h.packetIndex + h.config.slots.commandSeq] });
      h.frame();
      assert.equal(h.snapshot().stage, changedNativeResult ? 'error' : 'complete');
      assert.equal(completions(h).filter(item => item.message.result.scene === 1).length, 1,
        'Restoring a result must not emit C1 completion twice');
      assert.equal(h.messages.filter(item => item.message.type === 'vice:state' && item.message.state.stage === 'observation').length, questionsBefore,
        'A committed question must not be asked a second time');
      if (changedNativeResult) {
        assert.equal(h.nodes.get('native-error').hidden, false,
          'The old observation must not hide a change from a destroyed target to timeout');
      } else {
        assert.deepEqual(h.snapshot().result, original);
        assert.deepEqual(JSON.parse(JSON.stringify(h.snapshot().result.observation.choices)), ['pudge', 'steve']);
        assert.equal(h.nodes.get('complete-observation').hidden, true);
      }
    } finally { h.destroy(); }
  }
});

test('the parent bridge keeps C1 ownership while the two-choice question is open', () => {
  const listeners = new Map(), received = [], sent = [];
  const frame = { contentWindow: { postMessage: value => sent.push(value) }, addEventListener() {}, remove() {} };
  const root = { document: { createElement: () => frame }, crypto: { randomUUID: () => 'street-session' },
    location: { origin: 'https://exam.test' }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  root.window = root;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/vice-port.js'), 'utf8'), root);
  const port = root.GTAVicePort.mount({ replaceChildren() {} }, { edition: 17, scene: 1, examMode: true, onComplete: value => received.push(value) });
  const message = data => listeners.get('message')({ origin: root.location.origin, source: frame.contentWindow, data: { session: 'street-session', ...data } });
  message({ type: 'vice:state', state: { engine: 'vice-city-wasm', version: 3, scene: 1, stage: 'observation' } });
  const sentBefore = sent.length;
  assert.equal(port.setScene(2), false);
  assert.equal(sent.length, sentBefore, 'No rejected scene command is sent to the native owner');
  assert.equal(port.getState().scene, 1);
  const protocol = { ...arrivalResult(), observation: { id: E.streetObservation.arrivalId, choices: ['pudge', 'steve'] } };
  message({ type: 'vice:state', state: { engine: 'vice-city-wasm', version: 3, scene: 1, stage: 'complete' } });
  message({ type: 'vice:complete', result: protocol });
  assert.equal(received.length, 1, 'The pending C1 result still belongs to the parent');
  assert.deepEqual(Array.from(received[0].observation.choices), ['pudge', 'steve']);
  assert.equal(port.setScene(2), true);
  port.destroy();
});
