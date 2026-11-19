'use strict';

// Execute the production app through the existing whole-app adapters. Extend
// their content loading in memory only; do not modify the shared harness file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const BASE = path.join(__dirname, 'app-practice-flow.test.cjs');
let source = fs.readFileSync(BASE, 'utf8').split('\ntest(')[0];
if (!source.includes("'netlify-legacy-content.js'")) {
  source = source.replaceAll("'rc3-content.js',", "'rc3-content.js', 'netlify-legacy-content.js',");
}
const contentReturn = '  return { E, original, byId: Object.fromEntries(bank.map(q => [q.id, q])) };';
assert(source.includes(contentReturn), 'The read-only bank harness remains available');
if (!source.includes('GTAExamNetlifyLegacyQuestions.create(bank)')) {
  source = source.replace(contentReturn,
    '  bank.push(...context.window.GTAExamNetlifyLegacyQuestions.create(bank));\n' + contentReturn);
}
const reusable = { exports: {} };
vm.runInNewContext(source + '\nmodule.exports = { appHarness, seedAttempt, content };', {
  require: createRequire(BASE), __dirname, module: reusable, setImmediate, console,
  URL, URLSearchParams
}, { filename: BASE });
const { appHarness, seedAttempt, content } = reusable.exports;
const copy = value => JSON.parse(JSON.stringify(value));
const sum = answers => Object.values(answers).reduce((total, answer) => total + answer.points, 0);

function submitDisabled(h) {
  const button = /<button\b[^>]*data-action="submit"[^>]*>/.exec(h.app.innerHTML)?.[0];
  assert(button, 'The unanswered question has a submit button');
  return /\bdisabled\b/.test(button);
}
function tap(h, id) { h.click('order-tap', h.app, { id }); }

test('RC4 five-game tap order survives resume, supports undo/reselect and locks the accepted 8-point answer', async () => {
  const id = 'v15-b-release-order';
  const sequence = ['iii', 'vicecity', 'sanandreas', 'iv', 'v'];
  const question = content.byId[id];
  assert.equal(question.orderMode, 'tap');
  assert.deepEqual(copy(question.answerIds), sequence);
  const index = content.E.buildTicket('flowcheck', 15).indexOf(id);
  assert.equal(index, 8);
  let h = await appHarness(seedAttempt({ edition: 15, index }));
  h.click('resume');
  assert.equal((h.app.innerHTML.match(/data-action="order-tap"/g) || []).length, 5);
  assert.equal((h.app.innerHTML.match(/aria-pressed="true"/g) || []).length, 0);
  assert.equal(submitDisabled(h), true);
  h.click('submit');
  assert.equal(h.saved().answers[id], undefined, 'An empty order cannot be submitted');

  for (const game of sequence.slice(0, 3)) tap(h, game);
  assert.deepEqual(copy(h.saved().drafts[id]), sequence.slice(0, 3));
  assert.equal(submitDisabled(h), true);
  h.click('home'); h.click('resume');
  assert.deepEqual(copy(h.saved().drafts[id]), sequence.slice(0, 3));
  // A new app instance proves the three selections were persisted, not retained
  // only in the previous screen's closure.
  h = await appHarness(h.saved()); h.click('resume');
  assert.deepEqual(copy(h.saved().drafts[id]), sequence.slice(0, 3));
  assert.equal((h.app.innerHTML.match(/aria-pressed="true"/g) || []).length, 3);

  h.click('order-undo');
  assert.deepEqual(copy(h.saved().drafts[id]), sequence.slice(0, 2));
  tap(h, 'vicecity');
  assert.deepEqual(copy(h.saved().drafts[id]), ['iii'], 'A repeated tap removes that selection');
  tap(h, 'vicecity'); tap(h, 'sanandreas'); tap(h, 'iv');
  assert.deepEqual(copy(h.saved().drafts[id]), sequence.slice(0, 4));
  assert.equal(submitDisabled(h), true);
  h.click('submit');
  assert.equal(h.saved().answers[id], undefined, 'Four of five positions are still an incomplete answer');
  tap(h, 'v');
  assert.equal(submitDisabled(h), false);
  h.click('submit');
  const accepted = copy(h.saved().answers[id]), score = sum(h.saved().answers);
  assert.deepEqual(accepted.value, sequence);
  assert.equal(accepted.points, 8);
  assert.equal(h.saved().drafts[id], undefined);
  assert.equal(score, 64, 'The complete A+B result remains 24+40');
  assert.equal(h.app.innerHTML.includes('Ответ внесён в бланк'), true);
  assert.equal((h.app.innerHTML.match(/data-action="order-tap"[^>]*\bdisabled/g) || []).length, 5);

  tap(h, 'iii'); h.click('order-undo'); h.click('submit');
  assert.deepEqual(copy(h.saved().answers[id]), accepted);
  assert.equal(sum(h.saved().answers), score);
  assert.deepEqual(copy(h.gradeCalls), [id], 'Later taps neither rewrite nor regrade a submitted answer');
});

test('RC4 restores a deployed Netlify14 attempt with its original IDs, keys and four-game partial score', async () => {
  const ids = ['v14-a-release', 'v13-a-2', 'v13-a-3', 'v13-a-4',
    'v13-b-1', 'v13-b-2', 'v13-b-3', 'v13-b-4', 'v13-b-5',
    'v10-c-explode', 'v10-c-escape', 'v10-c-finale'];
  const oldKeys = ['r19', 'tommy', '0', '1', 'vicecity', '0', '0'];
  const oldPoints = [6, 6, 6, 6, 8, 8, 8];
  const saved = copy(seedAttempt({ edition: 14, index: 0 }));
  Object.assign(saved, { questionIds: ids, index: 7, completedCheckpoints: ['theory'] });
  for (let i = 0; i < oldKeys.length; i++) {
    const question = content.byId[ids[i]];
    assert.equal(question.answer, oldKeys[i], 'Preserve the deployed answer alphabet for ' + ids[i]);
    assert.equal(question.points, oldPoints[i]);
    const grade = copy(content.E.grade(question, oldKeys[i]));
    assert.equal(grade.points, oldPoints[i]);
    saved.answers[ids[i]] = { value: oldKeys[i], ...grade, seconds: i + 1 };
  }
  const oldOrder = content.byId['v13-b-4'], partial = ['vc', 'iii', 'sa', 'iv'];
  assert.deepEqual(copy(oldOrder.answerIds), ['iii', 'vc', 'sa', 'iv']);
  assert.equal(oldOrder.pointsPerItem, 2);
  assert.equal(content.E.grade(oldOrder, partial).points, 4);
  assert.equal(content.E.ready(content.byId['v15-b-release-order'], partial), false, 'Four-game legacy values cannot become a five-game answer');
  saved.answers[oldOrder.id] = { value: partial, ...copy(content.E.grade(oldOrder, partial)), seconds: 12 };
  const originalAnswers = copy(saved.answers);
  assert.equal(sum(originalAnswers), 52);

  const h = await appHarness(saved); h.click('resume');
  assert.equal(h.saved().contentEdition, 14);
  assert.equal(h.saved().version, 4);
  assert.deepEqual(copy(h.saved().questionIds), ids);
  assert.deepEqual(copy(h.saved().answers), originalAnswers, 'Restoring the app retains historical values, points and timing');
  assert.equal((h.app.innerHTML.match(/data-action="order-tap"/g) || []).length, 4);
  assert.equal((h.app.innerHTML.match(/data-action="order-tap"[^>]*\bdisabled/g) || []).length, 4);
  assert.deepEqual(copy(h.gradeCalls), [], 'Resume does not silently regrade old answers against another bank');
  tap(h, 'iv'); h.click('order-undo');
  assert.deepEqual(copy(h.saved().answers), originalAnswers);

  h.click('next');
  assert.equal(h.saved().questionIds[h.saved().index], 'v13-b-5');
  h.click('choose', h.app, { id: 'leonida' }); h.click('submit');
  assert.equal(h.saved().answers['v13-b-5'].points, 8);
  assert.equal(sum(h.saved().answers), 60, 'The old four-point chronology result is preserved while new work continues');
  for (const id of ids.slice(0, 8)) assert.deepEqual(copy(h.saved().answers[id]), originalAnswers[id]);
  assert.deepEqual(copy(h.gradeCalls), ['v13-b-5']);
});
