'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const engine = require('./load-browser-module.cjs')(require.resolve('../dist/exam-engine.js'));

const dist = path.join(__dirname, '..', 'dist');
const original = JSON.parse(fs.readFileSync(path.join(dist, 'questions.json'), 'utf8'));
const contentScope = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(dist, 'exam-content.js'), 'utf8'), contentScope, {
  filename: 'exam-content.js'
});
vm.runInNewContext(fs.readFileSync(path.join(dist, 'v6-radio-content.js'), 'utf8'), contentScope, {
  filename: 'v6-radio-content.js'
});
vm.runInNewContext(fs.readFileSync(path.join(dist, 'v8-practice-content.js'), 'utf8'), contentScope);
vm.runInNewContext(fs.readFileSync(path.join(dist, 'rc2-content.js'), 'utf8'), contentScope);
vm.runInNewContext(fs.readFileSync(path.join(dist, 'rc3-content.js'), 'utf8'), contentScope);
const practicalQuestions = contentScope.window.GTAExamPracticalQuestions || [];
const content = contentScope.window.GTAExamContent;
const radioQuestions = contentScope.window.GTAExamRadioQuestions || [];
const rc2Questions = contentScope.window.GTAExamRC2Questions || [];
const bank = engine.prepareBank(original, [...content.finalQuestions, ...content.russiaQuestions, ...(content.easyQuestions || []), ...radioQuestions, ...practicalQuestions, ...rc2Questions, ...contentScope.window.GTAExamRC3Questions]);
const byId = Object.fromEntries(bank.map(question => [question.id, question]));

function correctAnswer(question) {
  if (question.type === 'mcq' || question.type === 'image' || question.type === 'audio') return question.answer;
  if (question.type === 'rpg') return { version: 1, completed: true, shots: [{ hit: true, aimed: true }, { hit: true, aimed: true }] };
  if (question.type === 'vice') return nativeResult(question, question.targetsCount);
  if (question.type === 'order') return question.answerIds.slice();
  if (question.type === 'match') return Object.fromEntries(question.pairs.map(pair => [pair.id, pair.id]));
  if (question.type === 'classify') return Object.fromEntries(question.items.map(item => [item.id, item.answer]));
  if (question.type === 'case') return Object.fromEntries(question.steps.map(step => [step.id, correctAnswer(step)]));
  throw new Error('Unhandled question type: ' + question.type);
}

// Valid submissions with every answer wrong, not empty or malformed drafts.
function wrongAnswer(question) {
  if (question.type === 'mcq' || question.type === 'image' || question.type === 'audio') {
    return question.options.find(option => option.id !== question.answer).id;
  }
  if (question.type === 'rpg') return { version: 1, completed: true, shots: Array.from({ length: 3 }, () => ({ hit: false, aimed: false })) };
  if (question.type === 'vice') return nativeResult(question, 0);
  if (question.type === 'order') return question.answerIds.slice(1).concat(question.answerIds[0]);
  if (question.type === 'match') {
    return Object.fromEntries(question.pairs.map((pair, index, pairs) => [pair.id, pairs[(index + 1) % pairs.length].id]));
  }
  if (question.type === 'classify') {
    return Object.fromEntries(question.items.map(item => {
      const current = question.categories.findIndex(category => category.id === item.answer);
      return [item.id, question.categories[(current + 1) % question.categories.length].id];
    }));
  }
  if (question.type === 'case') return Object.fromEntries(question.steps.map(step => [step.id, wrongAnswer(step)]));
  throw new Error('Unhandled question type: ' + question.type);
}

function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [item, ...rest]));
}

test('section stars use inclusive 20/40/60/80 percent boundaries for both whole points and actual section maxima', () => {
  for (const [points, expected] of [[0, 1], [20, 1], [20.001, 2], [40, 2], [40.001, 3], [60, 3], [60.001, 4], [80, 4], [80.001, 5], [100, 5]]) {
    assert.equal(engine.sectionRating(points, 100), expected, points + '%');
  }
  for (const maximum of [24, 40, 36]) {
    for (let level = 1; level <= 5; level++) {
      const boundary = maximum * level / 5;
      assert.equal(engine.sectionRating(boundary, maximum), level, maximum + ' at boundary ' + level);
      if (level < 5) assert.equal(engine.sectionRating(boundary + 0.0001, maximum), level + 1);
    }
  }
  for (const [points, maximum] of [[undefined, 24], [NaN, 24], [Infinity, 24], [-1, 24], [0, 0], [12, 0], [24, undefined]]) {
    assert.equal(engine.sectionRating(points, maximum), 1, 'Absent or invalid progress never claims success');
  }
  assert.equal(engine.sectionRating(999, 36), 5); assert.equal(engine.PASS_SCORE, 60);
});

test('missing and technical-skip C submissions earn no section success', () => {
  const questions = engine.buildTicket('ratingcheck', 15).slice(-3).map(id => byId[id]);
  assert.equal(engine.sectionRating(0, 36), 1);
  let points = 0;
  for (const question of questions) {
    const skipped = { engine: 'vice-city-wasm', version: question.resultVersion || 2, scene: question.nativeScene,
      completed: true, skipped: true, outcome: 'unavailable', reason: 'runtime-unavailable',
      ammoInitial: question.initialAmmo, ammoRemaining: question.initialAmmo, targets: [] };
    assert.equal(engine.ready(question, skipped), true);
    const result = engine.grade(question, skipped); assert.equal(result.points, 0); points += result.points;
    assert.equal(engine.grade(question, null).points, 0);
  }
  assert.equal(engine.sectionRating(points, 36), 1);
  const partial = engine.grade(questions[0], correctAnswer(questions[0])).points;
  assert.equal(partial, 12); assert.equal(engine.sectionRating(partial, 36), 2, 'One completed scene is rated against all 36 possible C points');
});

test('400 seeds per supported edition keep their historical question counts and exactly 100 points', () => {
  assert.equal(engine.QUESTION_COUNT, 12);
  assert.equal(engine.CONTENT_EDITION, 15);
  for (const edition of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) for (let number = 0; number < 400; number++) {
    const seed = 'exam-v' + edition + '-' + number;
    const aCount = edition >= 11 ? 4 : 8, totalCount = aCount + 8;
    const ids = engine.buildTicket(seed, edition);
    assert.deepEqual(ids, engine.buildTicket(seed, edition), 'Same edition and seed must reproduce the same ticket');
    assert.equal(ids.length, totalCount, seed);
    assert.equal(new Set(ids).size, totalCount, 'Duplicate task in ' + seed);
    assert(ids.every(id => byId[id]), 'Unknown task in ' + seed);
    const questions = ids.map(id => byId[id]);
    assert.deepEqual(questions.map(question => question.section), [
      ...Array(aCount).fill('theory'), ...Array(5).fill('field'), ...Array(3).fill('final')
    ], seed);
    assert.deepEqual(questions.slice(-3).map(question => question.points), edition >= 10 ? [12, 10, 14] : [10, 12, 14], seed);
    assert.equal(questions.reduce((total, question) => total + question.points, 0), 100, seed);
    assert(!ids.includes('q15') && !ids.includes('i03'), 'Earlier tasks must not reveal the final case');

    let fullScore = 0;
    let wrongScore = 0;
    for (const question of questions) {
      const correct = correctAnswer(question);
      const wrong = wrongAnswer(question);
      assert.equal(engine.ready(question, correct), true, 'Correct answer must be ready: ' + question.id);
      assert.equal(engine.ready(question, wrong), true, 'Wrong answer must still be a valid submission: ' + question.id);
      fullScore += engine.grade(question, correct).points;
      wrongScore += engine.grade(question, wrong).points;
    }
    assert.equal(fullScore, 100, seed);
    assert.equal(wrongScore, 0, seed);
  }
});

test('RC1 editions 3–12 retain their captured questions, answer keys, points and ticket order', () => {
  // Captured from the user-supplied RC1 before edition 13 was added, with seed rc1-preserve.
  const captured = {
    3: 'e35b58dc2d94caad2bcabc188e45aad371f37b56c369e8e88b2d28c56373c1d4',
    4: '21ad25fb7a360382db7566195447a17fd28454311b4144ef8bbb397e65f686e0',
    5: '51585e369a9639e3a52c776b2753701e8819bcfa2aae61149cc3425f26774b79',
    6: '2d59feece64a0708a7183eea868bb243ec7bed2cc69fcdbe3ef9ed360e96d780',
    7: 'c6c9a6a1f5a70dd49e57c7280cff1a90e8a31d9d67451397580f248e320a1e13',
    8: 'e24a258beb604a957e59f91746d6050abea1f22c29374980dcee4b987bb9a034',
    9: 'af73e6d28c45253dd94120831b7c15820a1428413b4aa97fb477a7486bd789e7',
    10: 'f841a94e3d3384e18f341cb1a933db29d74b5c8ad60d5736023244d8fe4c0887',
    11: 'b8bf3d585a4a047471823a7a38a35086bd55d2dbb34ee90dce249c085f0aefc6',
    12: 'b35d8e7a3fbf85cc50806743e486bf410b910ce35344ab015a943a4785745488'
  };
  for (const [edition, expected] of Object.entries(captured)) {
    const questions = engine.buildTicket('rc1-preserve', Number(edition)).map(id => byId[id]);
    const digest = crypto.createHash('sha256').update(JSON.stringify(questions)).digest('hex');
    assert.equal(digest, expected, 'Historical content changed in edition ' + edition);
  }
});

test('edition 13 has four real illustrated A tasks, unchanged audio and five logo-order cards', () => {
  const ids = engine.buildTicket('rc2-content', 13);
  const questions = ids.map(id => byId[id]);
  assert.deepEqual(ids.slice(0, 9), [
    'v13-a-homecoming', 'v13-a-vice-era', 'v13-a-bellics', 'v13-a-franklin-skill',
    'v12-b-1', 'v12-b-2', 'v13-b-city-return', 'v13-b-leonida', 'v13-b-release-order'
  ]);
  assert.deepEqual(ids.slice(9), engine.buildTicket('rc2-content', 12).slice(9));
  assert.deepEqual(questions.slice(0, 4).map(q => q.points), [6, 6, 6, 6]);
  assert.deepEqual(questions.slice(4, 9).map(q => q.points), [8, 8, 8, 8, 8]);
  assert.deepEqual(questions.filter(q => q.type === 'audio').map(q => q.id), ['v12-b-1', 'v12-b-2']);
  assert(questions.slice(0, 4).every(q => q.image && q.mediaKind === 'screenshot' && q.alt));
  assert.equal(new Set(bank.map(q => q.id)).size, bank.length, 'Every ID must identify one immutable record');

  const order = byId['v13-b-release-order'];
  assert.equal(order.type, 'order');
  assert.equal(order.items.length, 5);
  assert.deepEqual(order.answerIds, ['iii', 'vicecity', 'sanandreas', 'iv', 'v']);
  assert.match(order.prompt, /первому выходу/);
  assert.match(order.prompt, /не годы их сюжета/);
  assert(!order.image, 'The old dated archive poster must not reveal the answer');
  for (const item of order.items) {
    assert(item.image && item.alt, 'Each movable card needs its own real logo and accessible label');
    assert(!/(?:19|20)\d{2}/.test(item.text + item.alt), 'No release year in a card label');
  }
  for (const q of rc2Questions) {
    const images = [q.image, ...(q.items || []).map(item => item.image)].filter(Boolean);
    for (const asset of images) {
      assert(asset.startsWith('assets/'), 'Media must be local: ' + q.id);
      const data = fs.readFileSync(path.join(dist, asset));
      const jpeg = data[0] === 0xff && data[1] === 0xd8;
      const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert(jpeg || png, 'Expected a real downloaded raster asset: ' + asset);
      assert(data.length > 1000, 'Expected image data, not an error or placeholder: ' + asset);
    }
    assert(q.sources.length > 0, 'Every factual question needs a review source: ' + q.id);
    for (const source of q.sources) {
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:');
      assert(/(?:^|\.)(?:rockstargames\.com|take2games\.com|steampowered\.com|xboxlive\.com)$/.test(url.hostname), 'Primary fact source required: ' + source.url);
    }
  }
});

test('edition 14 starts at the BMX, uses real local pictures and leaves earlier tickets intact', () => {
  const ids = engine.buildTicket('rc3-content', 14);
  assert.deepEqual(ids.slice(0, 9), [
    'v14-a-first-bmx', 'v14-a-demolition', 'v14-a-cousins-arrival', 'v14-a-ocean-view',
    'v14-b-vice-radio', 'v12-b-2', 'v14-b-tommy-voice', 'v14-b-rockstar-north', 'v13-b-release-order'
  ]);
  assert.deepEqual(ids.slice(9), engine.buildTicket('rc3-content', 13).slice(9));
  assert.equal(ids.map(id => byId[id]).reduce((sum, q) => sum + q.points, 0), 100);
  assert.equal(byId[ids[0]].answer, 'home');
  assert.equal(byId['v14-b-tommy-voice'].answer, 'liotta');
  assert.equal(byId['v14-b-rockstar-north'].answer, 'edinburgh');
  assert(ids.slice(0, 4).every(id => byId[id].mediaKind === 'screenshot' && byId[id].alt));
  for (const q of contentScope.window.GTAExamRC3Questions) {
    if (q.image) {
      assert(q.image.startsWith('assets/'), 'Illustrations ship inside the archive');
      const bytes = fs.readFileSync(path.join(dist, q.image));
      const raster = bytes[0] === 0xff && bytes[1] === 0xd8 || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert(raster && bytes.length > 1000, 'Expected a real raster image: ' + q.image);
    }
    assert(q.sources.length > 0, 'Every question includes review sources');
    for (const source of q.sources) {
      assert(source.title, 'A source or image credit is explicitly identified');
      assert.equal(new URL(source.url).protocol, 'https:');
    }
  }
  assert.match(byId['v14-b-rockstar-north'].imageCaption, /Richard Webb.*CC BY-SA 2\.0/);
});

test('RC2 logo order awards partial credit, rejects malformed drafts and survives local serialization', () => {
  const q = byId['v13-b-release-order'];
  assert.deepEqual(engine.grade(q, q.answerIds), { points: 8, correct: 5, total: 5 });
  assert.equal(engine.grade(q, ['vicecity', 'iii', 'sanandreas', 'iv', 'v']).points, 3);
  assert.equal(engine.grade(q, ['vicecity', 'sanandreas', 'iv', 'v', 'iii']).points, 0);
  let perfect = 0;
  for (const answer of permutations(q.answerIds)) {
    const correct = answer.filter((id, index) => id === q.answerIds[index]).length;
    assert.equal(engine.ready(q, answer), true);
    const score = engine.grade(q, answer);
    assert.deepEqual(score, { points: correct === 5 ? 8 : correct, correct, total: 5 });
    if (score.points === 8) perfect++;
    const restored = JSON.parse(JSON.stringify({ drafts: { [q.id]: answer }, answers: { [q.id]: { value: answer, ...score } } }));
    assert.equal(engine.ready(q, restored.drafts[q.id]), true);
    assert.deepEqual(engine.grade(q, restored.answers[q.id].value), score);
  }
  assert.equal(perfect, 1, 'Only the complete correct release sequence earns eight points');
  for (let n = 0; n < 100; n++) {
    const draft = engine.initialDraft(q, 'rc2-order-' + n);
    assert.equal(engine.ready(q, draft), true);
    assert.notDeepEqual(draft, q.answerIds, 'A fresh attempt must require a deliberate ordering decision');
  }
  for (const bad of [null, {}, [], q.answerIds.slice(1), [...q.answerIds, 'iii'], ['iii', 'iii', 'sanandreas', 'iv', 'v'], ['iii', 'vicecity', 'unknown', 'iv', 'v']]) {
    assert.equal(engine.ready(q, bad), false);
  }
});

test('every v4 and v5 ticket contains the Russia × GTA questions in A and the opening B slot', () => {
  assert.equal(engine.VERSION, 4);
  for (const edition of [4, 5]) for (let number = 0; number < 400; number++) {
    const ids = engine.buildTicket('russia-v' + edition + '-' + number, edition);
    const cheburekIndex = ids.indexOf('a-rune-cheburek');
    assert(cheburekIndex === 6 || cheburekIndex === 7, 'Cheburek must finish the A warmup');
    assert.equal(ids[8], 'b-basta-mama', 'The uploaded audio must appear in every ticket');
    assert.equal(ids.filter(id => byId[id].type === 'audio').length, 1);
    assert(!ids.includes('q02'), 'The new A question replaces London in this edition');
    assert.equal(ids.slice(0, 8).reduce((sum, id) => sum + byId[id].points, 0), 24);
    assert.equal(ids.slice(8, 13).reduce((sum, id) => sum + byId[id].points, 0), 40);
    assert.equal(ids.slice(13).reduce((sum, id) => sum + byId[id].points, 0), 36);
  }
});

test('historical edition 5 replaces only B5 with the eight-point logo archive', () => {
  assert.equal(engine.VERSION, 4);
  const logo = byId['b-logo-archive'];
  assert.equal(logo.type, 'image');
  assert.equal(logo.section, 'field');
  assert.equal(logo.points, 8);
  assert.equal(engine.grade(logo, correctAnswer(logo)).points, 8);
  assert.equal(engine.grade(logo, wrongAnswer(logo)).points, 0);
  for (let number = 0; number < 400; number++) {
    const seed = 'edition5' + number;
    const previous = engine.buildTicket(seed, 4), current = engine.buildTicket(seed, 5);
    assert.deepEqual(current, engine.buildTicket(seed, 5));
    assert.equal(current[12], 'b-logo-archive');
    assert.equal(current.filter(id => id === 'b-logo-archive').length, 1);
    assert.deepEqual(current.slice(0, 12), previous.slice(0, 12));
    assert.deepEqual(current.slice(13), previous.slice(13));
    assert(!previous.includes('b-logo-archive'));
  }
});

test('edition 6 keeps its historical easy route and unchanged storage format', () => {
  assert.equal(engine.VERSION, 4);
  assert.equal(engine.CONTENT_EDITION, 15);
  const ids = engine.buildTicket('easyedition6', 6);
  assert.deepEqual(ids, engine.buildTicket('easyedition6', 6));
  const newQuestions = [...content.easyQuestions, ...radioQuestions];
  const newIds = new Set(newQuestions.map(question => question.id));
  const legacyIds = new Set([...original, ...content.finalQuestions, ...content.russiaQuestions].map(question => question.id));
  assert.equal(newIds.size, newQuestions.length, 'New question IDs must be unique');
  assert([...newIds].every(id => !legacyIds.has(id)), 'Revised content must not overwrite a historical question');
  assert(ids.every(id => id === 'b-basta-mama' || newIds.has(id)), 'The only reused task is the unchanged Basta audio');
  assert.equal(ids[8], 'v6-b-vice-radio');
  assert.equal(ids[9], 'b-basta-mama');
  assert.equal(ids[12], 'v6-b-logo-archive');
  assert.equal(ids.filter(id => byId[id].type === 'audio').length, 2);
  assert(!ids.includes('v6-b-map'), 'The map task stays outside the current five-question B block');
  const illustrated = ids.map(id => byId[id]).filter(question => question.image);
  assert(illustrated.length >= 11, 'At least eleven questions must have an illustration alongside the RPG scene');
  assert.equal(ids.filter(id => byId[id].type === 'rpg').length, 1);
  assert.equal(ids[15], 'v6-c-rpg');
  for (const question of newQuestions.filter(question => question.image)) {
    assert(question.image.startsWith('assets/'), 'Question images must be shipped local assets: ' + question.id);
    assert(fs.existsSync(path.join(dist, question.image)), 'Missing question image: ' + question.image);
  }
  assert.deepEqual(ids.slice(0, 8).map(id => byId[id].points), Array(8).fill(3));
  assert.deepEqual(ids.slice(8, 13).map(id => byId[id].points), Array(5).fill(8));
  assert.equal(byId[ids[12]].type, 'image');
  assert.equal(engine.ready(byId[ids[12]], correctAnswer(byId[ids[12]])), true);
  assert.equal(engine.grade(byId[ids[12]], correctAnswer(byId[ids[12]])).points, 8);
  assert.equal(engine.grade(byId[ids[12]], wrongAnswer(byId[ids[12]])).points, 0);
});

test('easy C1 and C2 retain meaningful partial credit and the 10 / 12 maxima', () => {
  const chronology = byId['v6-c-timeline'], categories = byId['v6-c-street-names'];
  const order = correctAnswer(chronology), classified = correctAnswer(categories);
  assert.equal(engine.grade(chronology, order).points, 10);
  assert.equal(engine.grade(chronology, [order[1], order[0], order[2], order[3]]).points, 4);
  assert.equal(engine.ready(chronology, [order[0], order[0], order[2], order[3]]), false);
  assert.equal(engine.grade(categories, classified).points, 12);
  const first = categories.items[0];
  const wrongCategory = categories.categories.find(category => category.id !== first.answer).id;
  const oneWrong = { ...classified, [first.id]: wrongCategory };
  assert.equal(engine.ready(categories, oneWrong), true, 'Category choices may repeat');
  assert.equal(engine.grade(categories, oneWrong).points, 10);
});

test('RPG rounds award seven per resolved hit, allow completed misses, and preserve the 14-point maximum', () => {
  const question = byId['v6-c-rpg'];
  assert.equal(question.type, 'rpg');
  assert.equal(question.section, 'final');
  assert.equal(question.points, 14);
  const cases = [
    { hits: [true, true], points: 14 },
    { hits: [false, true, true], points: 14 },
    { hits: [true, false, true], points: 14 },
    { hits: [true, false, false], points: 7 },
    { hits: [false, true, false], points: 7 },
    { hits: [false, false, true], points: 7 },
    { hits: [false, false, false], points: 0 }
  ];
  for (const sample of cases) for (const aimed of [false, true]) {
    const value = { version: 1, completed: true, shots: sample.hits.map(hit => ({ hit, aimed })) };
    const restored = JSON.parse(JSON.stringify(value));
    assert.equal(engine.ready(question, restored), true);
    assert.deepEqual(engine.grade(question, restored), { points: sample.points, correct: sample.points / 7, total: 2 });
    assert(engine.answerLabel(question, restored, false).includes('выстрелов: ' + sample.hits.length));
  }
  const forgedSummary = { ...wrongAnswer(question), hits: 999, points: 999, correct: 999 };
  assert.deepEqual(engine.grade(question, forgedSummary), { points: 0, correct: 0, total: 2 }, 'Only resolved shot records determine the score');
  assert.equal(engine.grade(question, { ...correctAnswer(question), points: 999 }).points, 14);
  assert(engine.answerLabel(question, null, true).includes('двумя попаданиями'));
});

test('RPG rejects incomplete rounds, malformed shot records and shots after the helicopter is destroyed', () => {
  const question = byId['v6-c-rpg'];
  const hit = { hit: true, aimed: true }, miss = { hit: false, aimed: false };
  const fresh = engine.initialDraft(question, 'rpg-round');
  assert.deepEqual(fresh, { version: 1, completed: false, shots: [] });
  const round = shots => ({ version: 1, completed: true, shots });
  const invalid = [
    null, undefined, false, 1, [], {}, fresh,
    { ...round([hit, hit]), version: '1' }, { ...round([hit, hit]), version: 2 },
    { ...round([hit, hit]), completed: false }, { ...round([hit, hit]), completed: 'true' },
    round([]), round([hit]), round([miss]), round([hit, miss]), round([miss, miss]),
    round([hit, hit, miss]), round([hit, hit, hit]), round([miss, miss, miss, miss]),
    round(null), round('hit'), round(new Array(3)),
    round([null, miss, miss]), round([[], miss, miss]), round([{}, miss, miss]),
    round([{ hit: 1, aimed: true }, miss, miss]), round([{ hit: 'false', aimed: false }, miss, miss]),
    round([{ hit: false }, miss, miss]), round([{ hit: false, aimed: 1 }, miss, miss]),
    { ...round([miss, miss, miss]), skipped: 'true' }
  ];
  for (const value of invalid) {
    assert.equal(engine.ready(question, value), false, JSON.stringify(value));
    assert.deepEqual(engine.grade(question, value), { points: 0, correct: 0, total: 2, invalid: true });
  }
  assert.equal(engine.answerLabel(question, fresh, false), 'Игровая практика не завершена');
});

test('RPG failure recovery accepts an explicit empty skipped round without fabricating misses', () => {
  const question = byId['v6-c-rpg'];
  const skipped = { version: 1, completed: true, skipped: true, shots: [] };
  assert.equal(engine.ready(question, skipped), true);
  assert.deepEqual(engine.grade(question, skipped), { points: 0, correct: 0, total: 2 });
  assert.equal(engine.answerLabel(question, skipped, false), 'Игровая практика пропущена');
  for (const value of [
    { ...skipped, completed: false },
    { ...skipped, skipped: false },
    { ...skipped, shots: [{ hit: false, aimed: false }] },
    { ...skipped, shots: correctAnswer(question).shots }
  ]) {
    assert.equal(engine.ready(question, value), false);
    assert.equal(engine.grade(question, value).invalid, true);
  }
});

test('legacy editions match captured tickets from their historical source revisions', () => {
  // Fixed outputs captured with git show, not a second copy of the generator:
  // edition 3: f4cf7d9; edition 4: 59137e35c97edd4a29c1fd71268dc0cc385a5b15.
  // edition 5: 1fdcc66c64effe7314c875a865beba4316c1351c.
  const golden = [
    { edition: 3, seed: 'alpha1', ids: ['q22','q19','q16','q14','q09','q07','q02','q08','visual-sanandreas','i04','visual-v','i02','visual-online','i01','c02-universes','c03-museum'] },
    { edition: 3, seed: 'visualpatch5', ids: ['q07','q22','q09','q14','q19','q16','q02','q08','visual-sanandreas','i04','visual-iv','i02','visual-online','i01','c02-universes','c03-museum'] },
    { edition: 3, seed: 'exam2026', ids: ['q19','q07','q09','q22','q16','q14','q08','q02','visual-sanandreas','i04','visual-v','i02','visual-iii','i01','c02-universes','c03-museum'] },
    { edition: 3, seed: '2026', ids: ['q09','q07','q16','q19','q22','q14','q08','q02','visual-vicecity','i04','visual-v','i02','visual-iii','i01','c02-universes','c03-museum'] },
    { edition: 4, seed: 'alpha1', ids: ['q22','q19','q16','q14','q09','q07','a-rune-cheburek','q08','b-basta-mama','i04','visual-v','i02','visual-sanandreas','i01','c02-universes','c03-museum'] },
    { edition: 4, seed: 'visualpatch5', ids: ['q07','q22','q09','q14','q19','q16','a-rune-cheburek','q08','b-basta-mama','i04','visual-iv','i02','visual-vicecity','i01','c02-universes','c03-museum'] },
    { edition: 4, seed: 'exam2026', ids: ['q19','q07','q09','q22','q16','q14','q08','a-rune-cheburek','b-basta-mama','i04','visual-v','i02','visual-online','i01','c02-universes','c03-museum'] },
    { edition: 4, seed: '2026', ids: ['q09','q07','q16','q19','q22','q14','q08','a-rune-cheburek','b-basta-mama','i04','visual-v','i02','visual-online','i01','c02-universes','c03-museum'] },
    { edition: 5, seed: 'alpha1', ids: ['q22','q19','q16','q14','q09','q07','a-rune-cheburek','q08','b-basta-mama','i04','visual-v','i02','b-logo-archive','i01','c02-universes','c03-museum'] },
    { edition: 5, seed: 'visualpatch5', ids: ['q07','q22','q09','q14','q19','q16','a-rune-cheburek','q08','b-basta-mama','i04','visual-iv','i02','b-logo-archive','i01','c02-universes','c03-museum'] },
    { edition: 5, seed: 'exam2026', ids: ['q19','q07','q09','q22','q16','q14','q08','a-rune-cheburek','b-basta-mama','i04','visual-v','i02','b-logo-archive','i01','c02-universes','c03-museum'] },
    { edition: 5, seed: '2026', ids: ['q09','q07','q16','q19','q22','q14','q08','a-rune-cheburek','b-basta-mama','i04','visual-v','i02','b-logo-archive','i01','c02-universes','c03-museum'] }
  ];
  for (const fixture of golden) assert.deepEqual(engine.buildTicket(fixture.seed, fixture.edition), fixture.ids, 'Historical ticket v' + fixture.edition + '_' + fixture.seed);
});

test('launch references round-trip through Telegram and web URLs without changing the ticket', () => {
  for (const edition of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) for (const variant of ['a', 'visualpatch5', '0123456789abcdefghij']) {
    const telegram = new URL('https://t.me/example?startapp=v' + edition + '_' + variant);
    const fromTelegram = engine.parseLaunchReference(telegram.searchParams.get('startapp'));
    const website = new URL('https://example.test/?variant=' + variant + '&edition=' + edition);
    const fromWebsite = engine.parseLaunchReference(website.searchParams.get('variant'), website.searchParams.get('edition'));
    assert.deepEqual(fromTelegram, { variant, edition });
    assert.deepEqual(fromWebsite, fromTelegram);
    assert.deepEqual(engine.buildTicket(fromTelegram.variant, fromTelegram.edition), engine.buildTicket(variant, edition));
    assert.deepEqual(engine.parseLaunchReference('V' + edition + '_' + variant.toUpperCase(), String(edition)), fromTelegram);
  }
  assert.deepEqual(engine.parseLaunchReference('OLDSEED'), { variant: 'oldseed', edition: 4 });
  assert.deepEqual(engine.parseLaunchReference('OLDSEED', 5), { variant: 'oldseed', edition: 5 });
  assert.deepEqual(engine.parseLaunchReference('OLDSEED', '6'), { variant: 'oldseed', edition: 6 });
  assert.deepEqual(engine.parseLaunchReference('v3_OLDSEED', null), { variant: 'oldseed', edition: 3 });
  for (const raw of [undefined, null, '']) assert.equal(engine.parseLaunchReference(raw), null);
  assert.equal(engine.parseLaunchReference('', 99), null);
});

test('invalid or conflicting launch references fail explicitly instead of producing a new variant', () => {
  for (const raw of ['v2_seed', 'v16_seed', 'v99_seed', 'v05_seed']) assert.deepEqual(engine.parseLaunchReference(raw), { error: 'unsupported-edition' });
  for (const edition of ['', 'latest', '03', 2, 16, 5.5, NaN, true, {}]) assert.deepEqual(engine.parseLaunchReference('seed', edition), { error: 'unsupported-edition' });
  assert.deepEqual(engine.parseLaunchReference('v4_seed', 5), { error: 'unsupported-edition' });
  assert.deepEqual(engine.parseLaunchReference('v5_seed', '3'), { error: 'unsupported-edition' });
  for (const raw of ['v5_', 'has_space', 'has-dash', 'has space', ' seed', 'seed ', 'кириллица', 'a'.repeat(21), 123, {}]) assert.deepEqual(engine.parseLaunchReference(raw), { error: 'invalid-variant' });
  for (const edition of [2, 16, 99, null, 'unknown', '']) assert.throws(() => engine.buildTicket('seed', edition), RangeError);
});

test('the audio question accepts one valid option, awards 0 or 8, and has usable clip metadata', () => {
  const question = byId['b-basta-mama'];
  assert.equal(question.type, 'audio');
  assert.equal(engine.initialDraft(question, 'fresh-audio'), null);
  assert.equal(engine.ready(question, null), false);
  assert.equal(engine.ready(question, ''), false);
  assert.equal(engine.ready(question, 'unknown-option'), false);
  for (const option of question.options) {
    assert.equal(engine.ready(question, option.id), true);
    assert.deepEqual(engine.grade(question, option.id), {
      points: option.id === question.answer ? 8 : 0,
      correct: option.id === question.answer ? 1 : 0,
      total: 1
    });
    assert.equal(engine.answerLabel(question, option.id, false), option.text);
  }
  assert.equal(engine.answerLabel(question, null, true), 'GTA IV');
  assert.equal(engine.answerLabel(question, null, false), 'Не выбрано');
  assert.equal(question.audio, 'assets/audio/radio-fragment-01.mp3');
  assert.equal(question.audioDuration, 20);
  assert.equal(question.audioTitle, 'Баста — «Мама»');
  assert.equal(question.audioWaveform.length, 64);
  assert(question.audioWaveform.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
});

test('the pass boundary and rank change are both at 60 points', () => {
  assert.equal(engine.PASS_SCORE, 60);
  assert.equal(59 >= engine.PASS_SCORE, false);
  assert.equal(60 >= engine.PASS_SCORE, true);
  assert.equal(engine.rank(59).name, 'Свой на районе');
  assert.equal(engine.rank(59).stars, 2);
  assert.equal(engine.rank(60).name, 'Знаток улиц');
  assert.equal(engine.rank(60).stars, 3);
  assert.equal(engine.rank(100).name, 'Стобалльник Grove Street');
});

test('C1 gives two points per correct position and its perfect bonus only once', () => {
  const question = byId.i01;
  const key = question.answerIds;
  assert.equal(question.points, 10);
  assert.equal(engine.grade(question, [key[1], key[0], key[2], key[3]]).points, 4);
  assert.equal(engine.grade(question, key.slice(1).concat(key[0])).points, 0);
  for (const answer of permutations(key)) {
    const expectedCorrect = answer.filter((id, index) => id === key[index]).length;
    const expectedPoints = expectedCorrect === 4 ? 10 : expectedCorrect * 2;
    assert.equal(engine.ready(question, answer), true);
    assert.deepEqual(engine.grade(question, answer), { points: expectedPoints, correct: expectedCorrect, total: 4 });
  }
});

test('C2 permits repeated categories and awards 12 only for all six correct games', () => {
  const question = byId['c02-universes'];
  const all2D = Object.fromEntries(question.items.map(item => [item.id, '2d']));
  assert.equal(engine.ready(question, all2D), true, 'Classification is many-to-one');
  assert.deepEqual(engine.grade(question, all2D), { points: 4, correct: 2, total: 6 });
  assert.deepEqual(engine.grade(question, correctAnswer(question)), { points: 12, correct: 6, total: 6 });
  assert.equal(engine.ready(question, { ...all2D, advance: 'unknown' }), false);
  assert.equal(engine.ready(question, { ...all2D, advance: '' }), false);
});

test('C3 combines its 2 / 6 / 6 stages, including valid partial totals of 2 and 8', () => {
  const question = byId['c03-museum'];
  const right = correctAnswer(question);
  const wrong = wrongAnswer(question);
  assert.deepEqual(question.steps.map(step => [step.id, step.points]), [['object', 2], ['games', 6], ['missions', 6]]);
  assert.equal(engine.grade(question, right).points, 14);
  assert.equal(engine.grade(question, wrong).points, 0);

  const onlyObject = { ...wrong, object: right.object };
  const objectAndGames = { ...wrong, object: right.object, games: right.games };
  assert.equal(engine.ready(question, onlyObject), true);
  assert.equal(engine.ready(question, objectAndGames), true);
  assert.equal(engine.grade(question, onlyObject).points, 2);
  assert.equal(engine.grade(question, objectAndGames).points, 8);
  assert.deepEqual(engine.grade(question, objectAndGames).parts.map(part => [part.id, part.points]), [
    ['object', 2], ['games', 6], ['missions', 0]
  ]);
});

test('matching requires a complete one-to-one assignment, including inside the final case', () => {
  const question = byId['c03-museum'];
  const games = question.steps.find(step => step.id === 'games');
  const valid = correctAnswer(games);
  const duplicate = { ...valid, johnny: 'niko' };
  assert.equal(engine.ready(games, valid), true);
  assert.equal(engine.ready(games, duplicate), false);
  assert.equal(engine.ready(games, { ...valid, johnny: 'not-a-pair' }), false);
  assert.equal(engine.ready(games, { ...valid, johnny: '' }), false);
  assert.equal(engine.ready(question, { ...correctAnswer(question), games: duplicate }), false);
  assert.equal(engine.ready(question, engine.initialDraft(question, 'fresh-ticket')), false);
});

test('answer time ignores hidden work and clamps suspension gaps and clock regressions', () => {
  assert.equal(engine.elapsedDelta(1000, 1750, true), 0.75);
  assert.equal(engine.elapsedDelta(1000, 1750, false), 0);
  assert.equal(engine.elapsedDelta(1000, 60000, false), 0);
  assert.equal(engine.elapsedDelta(1000, 60000, true), 2);
  assert.equal(engine.elapsedDelta(1000, 1000, true), 0);
  assert.equal(engine.elapsedDelta(1000, 500, true), 0);
});


function nativeResult(q, count) {
  if (q.id === 'v9-c-hijack' || q.id === 'v10-c-escape') return {engine:'vice-city-wasm',version:3,scene:q.nativeScene,completed:true,outcome:count===2?'cleared':'timeout',ammoInitial:0,ammoRemaining:0,targets:[],milestones:{hijacked:count>=1,driveCompleted:count===2}};
  const destroyed = q.nativeScene === 3 || q.id === 'v9-c-explode' || q.id === 'v10-c-explode';
  return { engine: 'vice-city-wasm', version: q.resultVersion || 2, scene: q.nativeScene, completed: true,
    outcome: count === q.targetsCount ? 'cleared' : 'ammo', ammoInitial: q.initialAmmo,
    ammoRemaining: count === q.targetsCount ? q.initialAmmo - count : 0,
    targets: Array.from({ length: q.targetsCount }, (_, i) => ({ credited: i < count,
      destroyed: destroyed && i < count, health: i < count ? destroyed ? 0 : 970 : 1000 })) };
}

test('edition 7 changes only C to the three native scenes; old links retain their tickets', () => {
  const before = engine.buildTicket('nativefinal', 6), current = engine.buildTicket('nativefinal', 7);
  assert.deepEqual(current.slice(0, 13), before.slice(0, 13));
  assert.deepEqual(current.slice(13), ['v7-c-pistol', 'v7-c-uzi', 'v7-c-native-rpg']);
  assert.equal(engine.PASS_SCORE, 60);
  assert.deepEqual(engine.parseLaunchReference('v7_nativefinal'), { variant: 'nativefinal', edition: 7 });
  assert.deepEqual(engine.parseLaunchReference('nativefinal'), { variant: 'nativefinal', edition: 4 });
});

test('native C scores partial targets, ignores claimed points and rejects wrong or incomplete protocols', () => {
  for (const q of practicalQuestions.filter(q => !q.resultVersion)) {
    assert.equal(engine.ready(q, engine.initialDraft(q, 'native')), false);
    for (let correct = 0; correct <= q.targetsCount; correct++) {
      const value = nativeResult(q, correct);
      assert.equal(engine.ready(q, value), true);
      assert.equal(engine.grade(q, { ...value, points: 1000 }).points, correct * q.pointsPerTarget);
      assert.match(engine.answerLabel(q, value), /цел/);
    }
    const good = nativeResult(q, q.targetsCount);
    const invalid = [null, [], { ...good, scene: 4 }, { ...good, completed: false },
      { ...good, engine: 'canvas-simulation' }, { ...good, ammoRemaining: q.initialAmmo },
      { ...good, ammoRemaining: -1 }, { ...good, ammoInitial: 1000 },
      { ...good, targets: good.targets.slice(1) }, { ...good, outcome: 'ammo' },
      { ...nativeResult(q, 0), ammoRemaining: 1 }, { ...nativeResult(q, 0), outcome: 'cleared' },
      { ...good, targets: good.targets.map(t => ({ ...t, health: 1001 })) }];
    if (q.nativeScene === 3) invalid.push({ ...good, targets: good.targets.map(t => ({ ...t, destroyed: false })) });
    else invalid.push({ ...good, targets: good.targets.map(t => ({ ...t, health: 1000 })) });
    for (const value of invalid) {
      assert.equal(engine.ready(q, value), false, q.id + ': ' + JSON.stringify(value));
      assert.equal(engine.grade(q, value).points, 0);
    }
    const skipped = { engine: 'vice-city-wasm', version: 2, scene: q.nativeScene, completed: true,
      skipped: true, outcome: 'unavailable', reason: 'runtime-unavailable', ammoInitial: q.initialAmmo,
      ammoRemaining: q.initialAmmo, targets: [] };
    assert.equal(engine.ready(q, skipped), true);
    assert.equal(engine.grade(q, skipped).points, 0);
    assert.equal(engine.ready(q, { ...skipped, targets: good.targets }), false);
    assert.equal(engine.ready(q, { ...skipped, reason: 'give-me-points' }), false);
  }
});


test('edition 8 changes only C3 to one native helicopter and preserves saved edition 7 results', () => {
  const legacyIds = engine.buildTicket('heli', 7), ids = engine.buildTicket('heli', 8);
  assert.equal(engine.CONTENT_EDITION, 15);
  assert.deepEqual(ids.slice(0, 15), legacyIds.slice(0, 15));
  assert.equal(legacyIds[15], 'v7-c-native-rpg');
  assert.equal(ids[15], 'v8-c-native-heli');
  assert.deepEqual(engine.parseLaunchReference('v8_heli'), { variant: 'heli', edition: 8 });
  const legacy = byId[legacyIds[15]], current = byId[ids[15]];
  assert.equal(legacy.targetsCount, 2); assert.equal(legacy.pointsPerTarget, 7);
  assert.equal(current.targetsCount, 1); assert.equal(current.initialAmmo, 3);
  for (const count of [0, 1, 2]) {
    const saved = nativeResult(legacy, count);
    assert.equal(engine.ready(legacy, saved), true);
    assert.equal(engine.grade(legacy, saved).points, count * 7);
    assert.equal(engine.ready(current, saved), false);
  }
  const destroyed = nativeResult(current, 1);
  assert.equal(engine.ready(current, destroyed), true);
  assert.equal(engine.grade(current, destroyed).points, 14);
  assert.equal(engine.ready(legacy, destroyed), false);
  const damaged = nativeResult(current, 0);
  damaged.targets[0].health = 100;
  assert.equal(engine.ready(current, damaged), true);
  assert.equal(engine.grade(current, damaged).points, 0, 'Damage without native destruction earns no points');
  damaged.targets[0].credited = true;
  assert.equal(engine.ready(current, damaged), false, 'Claimed credit without destruction is rejected');
});


test('edition 8 native helicopter cannot earn points from a crash and ends lost/timeout honestly', () => {
  const q = byId['v8-c-native-heli'], old = byId['v7-c-native-rpg'];
  for (const outcome of ['timeout', 'lost']) for (const ammoRemaining of [0, 1, 3]) for (const destroyed of [false, true]) {
    const value = { ...nativeResult(q, 0), outcome, ammoRemaining,
      targets: [{ credited: false, destroyed, health: destroyed ? 0 : 1000 }] };
    assert.equal(engine.ready(q, value), true);
    assert.equal(engine.grade(q, value).points, 0);
    assert.equal(engine.ready(q, { ...value, targets: [{ credited: true, destroyed: true, health: 0 }] }), false);
    assert.equal(engine.ready(old, { ...value, targets: [value.targets[0], value.targets[0]] }), false);
  }
  const crashed = { ...nativeResult(q, 0), targets: [{ credited: false, destroyed: true, health: 0 }] };
  assert.equal(engine.ready(q, crashed), true); assert.equal(engine.grade(q, crashed).points, 0);
  assert.equal(engine.ready(q, { ...nativeResult(q, 1), targets: [{ credited: true, destroyed: false, health: 10 }] }), false);
});

 test('edition 9 uses native action milestones and keeps old tickets',()=>{
   assert.deepEqual(engine.buildTicket('new',9).slice(-3),['v9-c-hijack','v9-c-explode','v9-c-heli']);
   const q=byId['v9-c-hijack'];
   for(let n=0;n<=2;n++){const v=nativeResult(q,n); assert(engine.ready(q,v));assert.equal(engine.grade(q,v).points,n*5);}
   const good=nativeResult(q,2);
   for(const bad of [{...good,version:2},{...good,milestones:{hijacked:false,driveCompleted:true}},{...good,outcome:'timeout'},{...good,ammoInitial:1},{...good,targets:[{}]}]) assert.equal(engine.ready(q,bad),false);
   const explosion=byId['v9-c-explode'],hit=nativeResult(explosion,1); assert.equal(engine.grade(explosion,hit).points,12);
   assert.equal(engine.ready(explosion,{...hit,targets:[{credited:true,destroyed:false,health:100}]}),false);
 });

test('app saved-attempt restore keeps old/new question IDs and infers missing edition', () => {
 const source=fs.readFileSync(path.join(dist,'app.js'),'utf8');
 const restore=source.match(/      if \(saved && saved.version[^\n]+attempt = saved;/)[0];
 const infer=source.match(/  function attemptEdition\(\) \{[\s\S]*?\n  \}/)[0];
 const final10=['v10-c-explode','v10-c-escape','v10-c-finale'];
 const endings={7:['v7-c-pistol','v7-c-uzi','v7-c-native-rpg'],8:['v7-c-pistol','v7-c-uzi','v8-c-native-heli'],9:['v9-c-hijack','v9-c-explode','v9-c-heli'],10:final10,11:final10,12:final10,13:final10,14:final10};
 for(const edition of [7,8,9,10,11,12,13,14]) {
  const ids=engine.buildTicket('savedroundtrip',edition);assert.deepEqual(ids.slice(-3),endings[edition]);
  const saved=JSON.parse(JSON.stringify({version:engine.VERSION,contentEdition:edition,questionIds:ids,index:ids.length-3,answers:{},drafts:{},questionTimes:{},caseSteps:{},seenStages:['theory','field'],phase:'question'}));
  const c={saved,VERSION:engine.VERSION,COUNT:engine.QUESTION_COUNT,byId,attempt:null};vm.createContext(c);
  vm.runInContext(restore+'\n'+infer+'\nactualEdition=attemptEdition();',c);
  assert.deepEqual(c.attempt.questionIds,ids);assert.equal(c.actualEdition,edition);
  delete saved.contentEdition;c.attempt=null;vm.runInContext(restore+'\nactualEdition=attemptEdition();',c);assert.equal(c.actualEdition,edition);
 }
});


test('edition 10 keeps A/B and historical nine, with three ordered action checkpoints', () => {
  assert.deepEqual(engine.buildTicket('same',10).slice(0,13),engine.buildTicket('same',9).slice(0,13));
  assert.deepEqual(engine.buildTicket('same',9).slice(-3),['v9-c-hijack','v9-c-explode','v9-c-heli']);
  assert.deepEqual(engine.buildTicket('same',10).slice(-3),['v10-c-explode','v10-c-escape','v10-c-finale']);
  const q=byId['v10-c-escape'];
  for(let n=0;n<=2;n++)assert.equal(engine.grade(q,nativeResult(q,n)).points,n*5);
  const wrongScene=nativeResult(q,2);wrongScene.scene=1;assert.equal(engine.ready(q,wrongScene),false);
});

test('edition 10 finale credits each destroyed native target, with 4/4/6 weighting', () => {
  const q=byId['v10-c-finale'];
  for(let mask=0;mask<8;mask++){
    const r=nativeResult(q,0);r.targets=r.targets.map((t,i)=>({...t,credited:!!(mask&(1<<i)),destroyed:!!(mask&(1<<i)),health:mask&(1<<i)?0:1000}));
    if(mask===7)r.outcome='cleared';
    assert.equal(engine.ready(q,r),true);
    assert.equal(engine.grade(q,r).points, (mask&1?4:0)+(mask&2?4:0)+(mask&4?6:0));
    if(mask!==7){r.outcome='timeout';r.ammoRemaining=2;assert.equal(engine.ready(q,r),true);}
  }
  const accidental=nativeResult(q,0);accidental.targets.forEach(t=>{t.destroyed=true;t.health=0;});
  assert.equal(engine.grade(q,accidental).points,0);
  const invalid=nativeResult(q,3);invalid.targets[2].destroyed=false;assert.equal(engine.ready(q,invalid),false);
  invalid.targets[2].destroyed=true;invalid.ammoRemaining=6;assert.equal(engine.ready(q,invalid),false);
  const impossible=nativeResult(q,1);impossible.outcome='timeout';impossible.ammoRemaining=6;assert.equal(engine.ready(q,impossible),false);
  const zero={engine:'vice-city-wasm',version:3,scene:3,completed:true,skipped:true,outcome:'unavailable',reason:'runtime-unavailable',ammoInitial:6,ammoRemaining:6,targets:[]};
  assert.equal(engine.grade(q,zero).points,0);
});


test('edition10 opening timeout or loss preserves only real credited destruction',()=>{
  const q=byId['v10-c-explode'];
  for(const outcome of ['timeout','lost']){
    const r=nativeResult(q,0);r.outcome=outcome;r.ammoRemaining=40;
    assert.equal(engine.ready(q,r),true);assert.equal(engine.grade(q,r).points,0);
    r.targets[0]={credited:true,destroyed:true,health:0};assert.equal(engine.ready(q,r),false);
    r.ammoRemaining=35;assert.equal(engine.ready(q,r),true);assert.equal(engine.grade(q,r).points,12);
    r.targets[0].destroyed=false;assert.equal(engine.ready(q,r),false);
    const legacy=nativeResult(byId['v9-c-explode'],0);legacy.outcome=outcome;assert.equal(engine.ready(byId['v9-c-explode'],legacy),false);
  }
});
