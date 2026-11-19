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

function harness(options = {}) {
  const fixturePath = path.join(__dirname, 'vice-port.test.cjs');
  const source = fs.readFileSync(fixturePath, 'utf8');
  const boundary = source.indexOf("\ntest('VM contract:"); assert(boundary > 0);
  const scope = { require: createRequire(fixturePath), __dirname, Buffer, URL, URLSearchParams, TextEncoder, AbortController, Blob, console, module: { exports: {} } };
  vm.runInNewContext(source.slice(0, boundary) + '\nmodule.exports = makeHarness;', scope, { filename: fixturePath });
  return scope.module.exports({ edition: 16, continuous: true, ...options });
}
function completeDrive(h, seen = true) {
  h.setPacket({ phase: h.config.phases.complete, scene: 2, completed: 1, outcome: 1,
    ammo: 0, ammoInitial: 0, weapon: 0, targetCount: h.config.scenes[1].targetCount,
    hijacked: 1, driveCompleted: 1, cameoSeen: Number(seen), heartbeat: 8 });
  h.frame(); assert.equal(h.snapshot().stage, 'finishing');
  h.frame(700);
}
const completions = h => h.messages.filter(item => item.message.type === 'vice:complete');

test('street memory question accepts only known choices and never changes driving points', () => {
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

test('a witnessed C2 cameo pauses the game and holds the native result until one answer', async () => {
  const h = harness();
  try {
    await h.boot(); h.playing(2); completeDrive(h);
    assert.equal(h.snapshot().stage, 'observation');
    assert.equal(h.nodes.get('native-street-question').hidden, false);
    assert.equal(h.nodes.get('car-controls').hidden, true);
    assert.equal(h.nodes.get('native-pause').hidden, true);
    assert.equal(completions(h).length, 0);
    const clock = h.heap[h.packetIndex + h.config.slots.nativeTimer];
    assert.equal(h.frame(15000), false, 'Question must stop the native loop, not consume game time');
    assert.equal(h.heap[h.packetIndex + h.config.slots.nativeTimer], clock);
    h.message({ type: 'vice:scene', scene: 3 });
    assert.equal(h.snapshot().scene, 2, 'Parent cannot skip the active question');
    h.visibility(true); h.nodes.get('street-answer-steve').onclick();
    assert.equal(completions(h).length, 0, 'Hidden page cannot accept an accidental answer');
    h.visibility(false); h.nodes.get('street-answer-steve').onclick();
    assert.equal(h.snapshot().stage, 'complete');
    assert.equal(completions(h).length, 1);
    const saved = completions(h)[0].message.result;
    assert.deepEqual(JSON.parse(JSON.stringify(saved.observation)), { id: E.streetObservation.id, choice: 'steve' });
    assert(E.ready(question, saved)); assert.equal(E.grade(question, saved).points, 10);
    h.nodes.get('street-answer-local').onclick();
    assert.equal(completions(h).length, 1, 'A second tap cannot replace or duplicate the answer');
    assert.equal(h.nodes.get('complete-observation').hidden, true, 'Exam correctness is withheld until the final review');
  } finally { h.destroy(); }
});

test('an unseen cameo does not ask an unfair question or delay the C2 result', async () => {
  const h = harness();
  try {
    await h.boot(); h.playing(2); completeDrive(h, false);
    assert.equal(h.snapshot().stage, 'complete');
    assert.equal(completions(h).length, 1);
    assert.equal(completions(h)[0].message.result.observation, undefined);
    assert.equal(h.nodes.get('native-street-question').hidden, true);
  } finally { h.destroy(); }
});

test('missing the observation answer preserves progress; a destroyed session accepts no late tap', async () => {
  const h = harness();
  await h.boot(); h.playing(2); completeDrive(h);
  h.nodes.get('street-answer-missed').onclick();
  assert.equal(completions(h).length, 1);
  assert.equal(completions(h)[0].message.result.observation.choice, 'missed');
  assert.equal(E.grade(question, completions(h)[0].message.result).points, 10);
  h.destroy(); h.nodes.get('street-answer-steve').onclick();
  assert.equal(completions(h).length, 1);
});

test('the final review derives the revealed answer rather than trusting a supplied correct flag', () => {
  const review = E.streetObservation.review({ id: E.streetObservation.id, choice: 'officer', correct: true });
  assert.equal(review.correct, false);
  assert.equal(review.chosen, 'Полицейский');
  assert.equal(review.answer, 'Стив из Minecraft');
});

test('revisiting completed C2 retains its answer once while rejecting changed native driving facts', async () => {
  for (const changedNativeResult of [false, true]) {
    const h = harness();
    try {
      await h.boot(); h.playing(2); completeDrive(h);
      h.nodes.get('street-answer-steve').onclick();
      const original = completions(h).find(item => item.message.result.scene === 2).message.result;
      const questionsBefore = h.messages.filter(item => item.message.type === 'vice:state' && item.message.state.stage === 'observation').length;
      h.playing(3); h.nativeComplete(3);
      assert.equal(h.context.ViceRange.setScene(2), true);
      // A restored SCM record has native fields only: no JavaScript observation.
      h.setPacket({ phase: h.config.phases.complete, scene: 2, completed: 1,
        outcome: changedNativeResult ? 3 : 1, ammo: 0, ammoInitial: 0, weapon: 0, currentWeapon: 0,
        targetCount: h.config.scenes[1].targetCount, hijacked: 1,
        driveCompleted: changedNativeResult ? 0 : 1, cameoSeen: 1, heartbeat: 12,
        ackSeq: h.heap[h.packetIndex + h.config.slots.commandSeq] });
      h.frame();
      assert.equal(h.snapshot().stage, changedNativeResult ? 'error' : 'complete');
      assert.equal(completions(h).filter(item => item.message.result.scene === 2).length, 1,
        'Restoring a result must not emit C2 completion twice');
      assert.equal(h.messages.filter(item => item.message.type === 'vice:state' && item.message.state.stage === 'observation').length, questionsBefore,
        'A committed question must not be asked a second time');
      if (changedNativeResult) {
        assert.equal(h.nodes.get('native-error').hidden, false,
          'The old observation must not hide a change from full driving credit to timeout');
      } else {
        assert.deepEqual(h.snapshot().result, original);
        assert.equal(h.snapshot().result.observation.choice, 'steve');
        assert.equal(h.nodes.get('complete-observation').hidden, true);
      }
    } finally { h.destroy(); }
  }
});

test('the parent bridge keeps C2 ownership while the observation question is open', () => {
  const listeners = new Map(), received = [], sent = [];
  const frame = { contentWindow: { postMessage: value => sent.push(value) }, addEventListener() {}, remove() {} };
  const root = { document: { createElement: () => frame }, crypto: { randomUUID: () => 'street-session' },
    location: { origin: 'https://exam.test' }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  root.window = root;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/vice-port.js'), 'utf8'), root);
  const port = root.GTAVicePort.mount({ replaceChildren() {} }, { edition: 16, scene: 2, examMode: true, onComplete: value => received.push(value) });
  const message = data => listeners.get('message')({ origin: root.location.origin, source: frame.contentWindow, data: { session: 'street-session', ...data } });
  message({ type: 'vice:state', state: { engine: 'vice-city-wasm', version: 3, scene: 2, stage: 'observation' } });
  const sentBefore = sent.length;
  assert.equal(port.setScene(3), false);
  assert.equal(sent.length, sentBefore, 'No rejected scene command is sent to the native owner');
  assert.equal(port.getState().scene, 2);
  const protocol = { ...result(), observation: { id: E.streetObservation.id, choice: 'steve' } };
  message({ type: 'vice:state', state: { engine: 'vice-city-wasm', version: 3, scene: 2, stage: 'complete' } });
  message({ type: 'vice:complete', result: protocol });
  assert.equal(received.length, 1, 'The pending C2 result still belongs to the parent');
  assert.equal(received[0].observation.choice, 'steve');
  assert.equal(port.setScene(3), true);
  port.destroy();
});
