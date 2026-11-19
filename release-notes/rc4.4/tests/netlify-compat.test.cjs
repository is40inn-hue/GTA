'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const load = require('./load-browser-module.cjs');
const E = load(require.resolve('../dist/exam-engine.js'));
const Legacy = load(require.resolve('../dist/netlify-legacy-content.js'));
const dist = path.join(__dirname, '../dist');
const scope = { window: {} };
for (const filename of ['exam-content.js', 'v6-radio-content.js', 'v8-practice-content.js', 'rc2-content.js', 'rc3-content.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(dist, filename), 'utf8'), scope, { filename });
}
const W = scope.window, C = W.GTAExamContent;
const original = JSON.parse(fs.readFileSync(path.join(dist, 'questions.json'), 'utf8'));
const base = E.prepareBank(original, [...C.finalQuestions, ...C.russiaQuestions, ...C.easyQuestions,
  ...W.GTAExamRadioQuestions, ...W.GTAExamPracticalQuestions, ...W.GTAExamRC2Questions, ...W.GTAExamRC3Questions]);
const extra = Legacy.create(base), bank = base.concat(extra), byId = Object.fromEntries(bank.map(q => [q.id, q]));
const copy = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Captured on 2026-11-16 from the deployed exam-engine.js (SHA-256
// d18616e2c3c0de1d717f4cbc7d5b5f6f326c16f653ea65da135fbb0f8246edf7).
// Its four base content files matched the original RC3 ZIP byte for byte.
const legacyHashes = {
  'v13-a-1': '2f9db78dd56cf580d2a95e33b38de51733901c9eee55c2e0f29353ddd864582f',
  'v13-a-2': 'c5115b641c03a1321be1506e2e88b659d67d534198e588ef4476598b4724265f',
  'v13-a-3': 'f7d73cf02d33c3093d547080210fff34ad7a7f9244aa6def44137c39bc241ec0',
  'v13-a-4': 'dbe4b9cf4dca106c0b43c658cda3e445afcf67436f27d3eade88db3f54007fb7',
  'v13-b-1': 'ea4f33122a335e01366828e003115640a5acf6d1ab92df2885426d781f546175',
  'v13-b-2': '10d9a687b768551e0ef3d59b919c218e51645a2521094e832b615bd75c1488df',
  'v13-b-3': '2a57db688478b63a16bea69abe14da376e4188c0e7c91a995c6dd13a975c5318',
  'v13-b-4': '0beb10af85bbdab560beb68fe9aab568e3c0475ff1b0bb9099a6902548b4eda1',
  'v13-b-5': '066f57ca5d9f75724f4dc4511d338e11b29d0655757aed4078b4ab66919ed038'
};
const live13 = ['v13-a-1', 'v13-a-2', 'v13-a-3', 'v13-a-4', 'v13-b-1', 'v13-b-2', 'v13-b-3', 'v13-b-4', 'v13-b-5', 'v10-c-explode', 'v10-c-escape', 'v10-c-finale'];
const live14 = ['v14-a-release', ...live13.slice(1)];

function correctAnswer(q) {
  if (q.type === 'order') return q.answerIds.slice();
  if (q.type !== 'vice') return q.answer;
  if (q.id === 'v10-c-escape') return { engine: 'vice-city-wasm', version: 3, scene: q.nativeScene, completed: true,
    outcome: 'cleared', ammoInitial: 0, ammoRemaining: 0, targets: [], milestones: { hijacked: true, driveCompleted: true } };
  return { engine: 'vice-city-wasm', version: 3, scene: q.nativeScene, completed: true, outcome: 'cleared',
    ammoInitial: q.initialAmmo, ammoRemaining: q.initialAmmo - q.targetsCount,
    targets: Array.from({ length: q.targetsCount }, () => ({ credited: true, destroyed: true, health: 0 })) };
}

test('nine deployed legacy records keep their complete captured data and answer keys', () => {
  assert.equal(extra.length, 10);
  assert.equal(new Set(bank.map(q => q.id)).size, bank.length);
  for (const [id, expected] of Object.entries(legacyHashes)) assert.equal(digest(byId[id]), expected, id);
  const browser = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(dist, 'netlify-legacy-content.js'), 'utf8'), browser);
  assert.equal(typeof browser.window.GTAExamNetlifyLegacyQuestions.create, 'function');
});

test('historical release record preserves grading data without a clock or release claim', () => {
  const question = byId['v14-a-release'], stable = copy(question);
  delete stable.prompt; delete stable.explanation; delete stable.releasedPrompt;
  assert.equal(digest(stable), 'ae178b30b5faae22f88a81413643caf824ad1b990f6a3e28f31b434c14e7f950');
  assert.match(question.prompt, /По анонсу, использованному в этом билете/);
  assert.equal(question.releasedPrompt, undefined);
  assert.equal(question.answer, 'r19');
  assert.equal(E.grade(question, 'r19').points, 6);
  assert.equal(E.grade(question, 'r12').points, 0);
  const code = fs.readFileSync(path.join(dist, 'netlify-legacy-content.js'), 'utf8');
  assert.doesNotMatch(code, /Date\.now|setInterval|setTimeout|GTAReleaseClock/);
});

test('legacy factories never mutate sources, duplicate IDs, or overwrite a conflicting key', () => {
  const before = JSON.stringify(base), created = Legacy.create(base);
  assert.deepEqual(Legacy.create(base.concat(created)), []);
  created[0].options[0].text = 'changed by a caller';
  created[0].answer = 'wrong';
  assert.equal(JSON.stringify(base), before, 'No source records are aliased');
  assert.throws(() => Legacy.create(base.concat(created)), /Legacy question ID collision: v13-a-1/);
  assert.throws(() => Legacy.create([]), /Missing legacy source/);
  assert.throws(() => Legacy.create(null), /prepared question bank/);
});

test('similar old and current questions retain their distinct answer alphabets', () => {
  assert.equal(byId['v13-a-3'].answer, '0');
  assert.equal(byId['v13-a-bellics'].answer, 'cousins');
  assert.equal(E.ready(byId['v13-a-3'], 'cousins'), false);
  assert.equal(E.ready(byId['v13-a-bellics'], '0'), false);
  assert.equal(byId['v13-a-4'].answer, '1');
  assert.equal(byId['v13-a-franklin-skill'].answer, 'driving');
  assert.equal(E.ready(byId['v13-a-4'], 'driving'), false);
  assert.equal(E.ready(byId['v13-a-franklin-skill'], '1'), false);
});

test('saved live edition 13 and 14 IDs and answers survive serialization with the same 100-point result', () => {
  for (const [edition, ids] of [[13, live13], [14, live14]]) {
    const saved = { version: 4, contentEdition: edition, questionIds: ids.slice(), answers: {}, drafts: {} };
    for (const id of ids) {
      const q = byId[id], value = correctAnswer(q);
      assert(E.ready(q, value), id);
      saved.answers[id] = { value, ...E.grade(q, value) };
      saved.drafts[id] = value;
    }
    const restored = copy(saved);
    assert(restored.questionIds.every(id => byId[id]));
    assert.deepEqual(restored.questionIds, ids);
    assert.equal(restored.contentEdition, edition);
    assert.equal(restored.questionIds.reduce((n, id) => n + restored.answers[id].points, 0), 100);
    for (const id of restored.questionIds) {
      assert(E.ready(byId[id], restored.drafts[id]));
      assert.deepEqual(E.grade(byId[id], restored.answers[id].value), E.grade(byId[id], saved.answers[id].value));
    }
  }
});

test('original RC3 edition 13/14 ticket data remains byte-identical after adding the legacy bank', () => {
  const captured = { 13: 'ca16c5274d3e436515bd487ecfbbeec57720737b3576d4c54d6bd4e7586168a5',
    14: 'e2eb4aca53b08d6b2080624bc2bd19aa3c499f7d3d059ffff92b527c411e897a' };
  for (const [edition, expected] of Object.entries(captured)) {
    assert.equal(digest(E.buildTicket('rc4-compat', Number(edition)).map(id => byId[id])), expected);
  }
  assert.deepEqual(E.buildTicket('rc4-compat', 14), E.buildTicket('other-seed', 14));
  assert.notDeepEqual(E.buildTicket('rc4-compat', 14), live14, 'An edition-only old link cannot distinguish the two historical branches');
});

test('new default 16 is versioned distinctly and still totals 100 with the 60-point pass line', () => {
  assert.equal(E.CONTENT_EDITION, 16); assert.equal(E.VERSION, 4);
  assert.equal(E.PASS_SCORE, 60); assert.equal(E.QUESTION_COUNT, 12);
  const current = E.buildTicket('rc4-default'), old = E.buildTicket('rc4-default', 15);
  assert.deepEqual(current, old.map(id => id === 'v14-b-rockstar-north' ? 'v16-b-hesoyam' : id));
  assert.equal(new Set(current).size, 12);
  const questions = current.map(id => byId[id]);
  assert.deepEqual(['theory', 'field', 'final'].map(section => questions.filter(q => q.section === section).reduce((n, q) => n + q.points, 0)), [24, 40, 36]);
  assert.equal(questions.reduce((n, q) => n + E.grade(q, correctAnswer(q)).points, 0), 100);
  assert.deepEqual(E.parseLaunchReference('v15_abc'), { variant: 'abc', edition: 15 });
  assert.deepEqual(E.parseLaunchReference('abc', '15'), { variant: 'abc', edition: 15 });
  assert.deepEqual(E.parseLaunchReference('v14_abc'), { variant: 'abc', edition: 14 });
  assert.deepEqual(E.parseLaunchReference('v16_abc'), { variant: 'abc', edition: 16 });
  assert.deepEqual(E.parseLaunchReference('abc', '16'), { variant: 'abc', edition: 16 });
  assert.equal(E.parseLaunchReference('v17_abc').error, 'unsupported-edition');
  assert.equal(E.rank(60).name, 'Знаток улиц'); assert.equal(E.rank(59).name, 'Свой на районе');
});

test('four-game legacy and five-game current tap orders start empty and preserve their different grading', () => {
  for (const id of ['v13-b-4', 'v15-b-release-order']) {
    const q = byId[id];
    assert.equal(q.orderMode, 'tap'); assert.deepEqual(E.initialDraft(q, 'tap'), []);
    for (const value of [[], q.answerIds.slice(1), q.answerIds.concat(q.answerIds[0]), q.answerIds.map(() => q.answerIds[0]), q.answerIds.map((x, i) => i ? x : 'unknown')]) {
      assert.equal(E.ready(q, value), false, id);
    }
    assert.equal(E.ready(q, q.answerIds), true); assert.equal(E.grade(q, q.answerIds).points, 8);
    const moved = [q.answerIds[1], q.answerIds[0], ...q.answerIds.slice(2)];
    assert.equal(E.grade(q, moved).points, id === 'v13-b-4' ? 4 : 3);
    const restored = copy({ drafts: { [id]: moved } });
    assert.equal(E.ready(q, restored.drafts[id]), true);
    assert.deepEqual(E.grade(q, restored.drafts[id]), E.grade(q, moved));
  }
  const old = byId['v13-b-release-order'], next = byId['v15-b-release-order'];
  assert.equal(old.orderMode, undefined);
  assert.equal(E.initialDraft(old, 'retained').length, 5);
  assert.deepEqual(next.items, old.items); assert.deepEqual(next.answerIds, old.answerIds);
  assert.equal(next.pointsPerItem, 1); assert.equal(next.perfectBonus, 3);
  assert.equal(byId['v13-b-4'].items.length, 4); assert.equal(next.items.length, 5);
});
