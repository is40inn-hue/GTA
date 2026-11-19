'use strict';

// Two production-app realms share one localStorage map, like same-origin tabs.
// Native/audio adapters are unchanged from the whole-app lifecycle harness.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const BASE = path.join(__dirname, 'app-practice-flow.test.cjs');
let source = fs.readFileSync(BASE, 'utf8').split('\ntest(')[0];
const signature = 'async function appHarness(saved = seedAttempt(), { imagesReady = true } = {}) {';
assert(source.includes(signature), 'The whole-app harness retains its explicit media readiness options');
// Add a shared map without dropping the base harness's image readiness option.
source = source.replace(signature, 'async function appHarness(saved = seedAttempt(), sharedStorage, { imagesReady = true } = {}) {');
const storage = 'storage = new Map(saved ? [[KEY, JSON.stringify(saved)]] : []);';
assert(source.includes(storage));
source = source.replace(storage, 'storage = sharedStorage || new Map(saved ? [[KEY, JSON.stringify(saved)]] : []);');
const reusable = { exports: {} };
vm.runInNewContext(source + '\nmodule.exports = { appHarness, seedAttempt, protocolFor, content, KEY };', {
  require: createRequire(BASE), __dirname, module: reusable, setImmediate, console, URL, URLSearchParams
}, { filename: BASE });
const { appHarness, seedAttempt, protocolFor, content, KEY } = reusable.exports;
const copy = value => JSON.parse(JSON.stringify(value));
function fresh() { const saved = copy(seedAttempt({ edition: 16, index: 0 })); saved.completedCheckpoints = []; return saved; }
function shared(saved) { return new Map([[KEY, JSON.stringify(saved)]]); }
function score(saved) { return Object.values(saved.answers).reduce((sum, answer) => sum + answer.points, 0); }

function complete64(h) {
  for (let guard = 0; guard < 24 && h.saved().index < 9; guard++) {
    h.advance(321);
    const saved = h.saved();
    if (saved.phase === 'intro') { h.click('stage-enter'); continue; }
    if (saved.phase === 'checkpoint') { h.click('checkpoint-next'); continue; }
    const q = content.byId[saved.questionIds[saved.index]];
    if (q.type === 'order') for (const id of q.answerIds) h.click('order-tap', h.app, { id });
    else h.click('choose', h.app, { id: q.answer });
    h.click('submit');
  }
  assert.equal(h.saved().index, 9);
  for (const scene of [1, 2, 3]) {
    h.mounts.at(-1).error(); h.click('native-skip');
    assert.equal(h.saved().answers[h.saved().questionIds[8 + scene]].points, 0);
  }
  assert.equal(h.saved().phase, 'grading'); h.advance(250);
  assert.equal(h.saved().phase, 'result'); assert.equal(score(h.saved()), 64);
}

test('a stale 0/12 home tab cannot overwrite another tab’s newer finished 64/100 on pagehide or visibility save', async () => {
  const initial = fresh(), storage = shared(initial);
  const stale = await appHarness(initial, storage), active = await appHarness(initial, storage);
  active.click('start'); assert.equal(active.dialog.open, true); active.click('force-start', active.dialog);
  assert.notEqual(active.saved().variant, initial.variant);
  complete64(active); const finished = copy(active.saved());
  stale.pagehide(false); assert.deepEqual(copy(stale.saved()), finished, 'Unload must not regress the newer result');
  stale.visibility(true); stale.pageshow(true); stale.visibility(false);
  assert.deepEqual(copy(stale.saved()), finished);
  stale.advance(1);
  assert.equal(stale.dialog.open, true);
  assert(stale.dialog.innerHTML.includes('Попытка обновилась в другой вкладке'));
  assert(stale.dialog.innerHTML.includes('data-action="reload"'));
  assert(stale.app.innerHTML.includes('0 из 12 ответов'), 'Conflict does not swap the in-memory owner mid-callback');
  stale.click('resume'); stale.advance(3000);
  assert.deepEqual(copy(stale.saved()), finished, 'Old tab actions remain write-protected until an explicit resolution');
  const reloaded = await appHarness(finished, storage);
  assert(reloaded.app.innerHTML.includes('64 / 100'));
  assert.deepEqual(copy(reloaded.saved()), finished);
});

test('two copies of the same attempt cannot replace an accepted answer with a stale different answer', async () => {
  const initial = fresh(), storage = shared(initial);
  const active = await appHarness(initial, storage), stale = await appHarness(initial, storage);
  active.click('resume'); stale.click('resume');
  const q = content.byId[initial.questionIds[0]], wrong = q.options.find(option => option.id !== q.answer).id;
  active.click('choose', active.app, { id: q.answer }); active.click('submit');
  const accepted = copy(active.saved()); assert.equal(accepted.answers[q.id].points, 6);
  stale.click('choose', stale.app, { id: wrong }); stale.click('submit');
  stale.advance(1); assert.equal(stale.dialog.open, true);
  assert.deepEqual(copy(stale.saved()), accepted);
  stale.pagehide(false); stale.visibility(true);
  assert.deepEqual(copy(stale.saved()), accepted, 'The accepted value, points and time remain immutable');
});

test('same-attempt completion and result phase cannot regress to the stale zero-answer or grading view', async () => {
  const initial = fresh(), storage = shared(initial);
  const stale = await appHarness(initial, storage), active = await appHarness(initial, storage);
  active.click('resume'); complete64(active);
  const finished = copy(active.saved());
  assert.equal(finished.variant, initial.variant);
  stale.pagehide(false); assert.deepEqual(copy(stale.saved()), finished);

  const grading = copy(finished); grading.phase = 'grading';
  const gradingStorage = shared(grading), oldGrading = await appHarness(grading, gradingStorage), latest = await appHarness(grading, gradingStorage);
  latest.click('resume'); latest.advance(250); assert.equal(latest.saved().phase, 'result');
  const result = copy(latest.saved()); oldGrading.pagehide(false);
  assert.deepEqual(copy(oldGrading.saved()), result, 'A late saved grading screen cannot put a finished attempt back on the commission');
});

test('explicit force-start resolves a conflict and intentionally creates a new attempt without later stale callback restoration', async () => {
  const initial = fresh(), storage = shared(initial);
  const stale = await appHarness(initial, storage), active = await appHarness(initial, storage);
  active.click('resume'); complete64(active); const finished = copy(active.saved());
  stale.pagehide(false); stale.advance(1); assert.equal(stale.dialog.open, true);
  stale.click('force-start', stale.dialog);
  const next = copy(stale.saved());
  assert.notEqual(next.variant, finished.variant); assert.equal(next.contentEdition, 16);
  assert.equal(next.finishedAt, null); assert.deepEqual(next.answers, {});
  assert.equal(stale.dialog.open, false); assert.equal(next.phase, 'intro');
  stale.advance(3500); stale.visibility(true); stale.visibility(false);
  assert.equal(stale.saved().variant, next.variant); assert.equal(stale.saved().finishedAt, null);
  active.pagehide(false); assert.equal(stale.saved().variant, next.variant, 'Even a previously finished tab must honor the user’s explicit new start');
});

test('a late native completion in the stale tab cannot replace a finalized protocol or adopt a new owner mid-callback', async () => {
  const initial = copy(seedAttempt({ edition: 16, index: 9 })), storage = shared(initial);
  const stale = await appHarness(initial, storage), active = await appHarness(initial, storage);
  stale.click('resume'); const oldPort = stale.mounts[0]; active.click('resume'); complete64(active);
  const finished = copy(active.saved());
  oldPort.emitState('playing'); oldPort.complete(protocolFor(1, undefined, 16));
  assert.deepEqual(copy(stale.saved()), finished, 'Native hit credit cannot replace a protocol already finalized in another tab');
  assert.equal(oldPort.destroyed, false, 'The conflict does not swap or dispose the owner inside onComplete');
  stale.advance(1000); assert.equal(stale.dialog.open, true); assert.deepEqual(copy(stale.transitions), []);
  stale.click('force-start', stale.dialog); const next = copy(stale.saved());
  assert.equal(oldPort.destroyed, true); assert.notEqual(next.variant, finished.variant);
  oldPort.options.onComplete(protocolFor(2, undefined, 16));
  stale.advance(1000);
  assert.equal(stale.saved().variant, next.variant); assert.deepEqual(copy(stale.saved().answers), {});
});
