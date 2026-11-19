'use strict';

(function (scope) {
  // Storage compatibility and ticket content evolve independently.
  const PASS_SCORE = 60, QUESTION_COUNT = 12, VERSION = 4, CONTENT_EDITION = 16;
  // Optional observation, outside the scored ticket. Preserve RC4.6 saved
  // street answers while the new arrival scene asks about two crossover guests.
  const STREET_QUESTION = 'seafront-outsider-v1';
  const STREET_CHOICES = Object.freeze({ local: 'Местный в белой рубашке', steve: 'Стив из Minecraft', officer: 'Полицейский', missed: 'Не заметил' });
  const ARRIVAL_QUESTION = 'arrival-guests-v2';
  const ARRIVAL_CHOICES = Object.freeze({ cj: 'Парень в белом', pudge: 'Пудж', steve: 'Кубический парень', dancer: 'Девушка из клуба' });
  function readStreetObservation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.id === ARRIVAL_QUESTION) {
      if (!Array.isArray(value.choices) || ![0, 2].includes(value.choices.length) ||
          new Set(value.choices).size !== value.choices.length || value.choices.some(choice => typeof choice !== 'string' || !Object.prototype.hasOwnProperty.call(ARRIVAL_CHOICES, choice))) return null;
      return { id: ARRIVAL_QUESTION, choices: value.choices.slice().sort() };
    }
    if (value.id !== STREET_QUESTION || typeof value.choice !== 'string' ||
        !Object.prototype.hasOwnProperty.call(STREET_CHOICES, value.choice)) return null;
    return { id: STREET_QUESTION, choice: value.choice };
  }
  function streetObservationReview(value) {
    const answer = readStreetObservation(value);
    if (!answer) return null;
    if (answer.id === ARRIVAL_QUESTION) return {
      title: 'Кто здесь не из GTA?', chosen: answer.choices.length ? answer.choices.map(choice => ARRIVAL_CHOICES[choice]).join(' и ') : 'Не заметил',
      correct: answer.choices.join(',') === 'pudge,steve', answer: 'Пудж и Стив',
      explanation: 'Пудж — из Dota 2, Стив — из Minecraft. Два гостя из других игровых миров.'
    };
    return { title: 'Кто здесь был лишним?', chosen: STREET_CHOICES[answer.choice], correct: answer.choice === 'steve',
      answer: 'Стив из Minecraft', explanation: 'Кубический прохожий на набережной — гость из Minecraft.' };
  }
  const streetObservation = Object.freeze({ id: STREET_QUESTION, choices: STREET_CHOICES, arrivalId: ARRIVAL_QUESTION, arrivalChoices: ARRIVAL_CHOICES, read: readStreetObservation, review: streetObservationReview });
  const sections = {
    theory: { letter: 'A', title: 'Базовые знания', max: 24, count: 4, heat: 1, time: '1 минута', description: 'Герои, города и знакомые ситуации. Выберите один ответ в каждом из четырёх коротких заданий.', hint: 'Один ответ из четырёх. Каждый верный ответ — 6 баллов.' },
    field: { letter: 'B', title: 'Работа с материалами', max: 40, count: 5, heat: 3, time: '2–3 минуты', description: 'Рассмотрите материалы и сопоставьте знакомые детали серии. За каждое задание — до 8 баллов.', hint: 'Время ответа учитывается после загрузки материала. Оно не влияет на баллы.' },
    final: { letter: 'C', title: 'Финальная часть', max: 36, count: 3, heat: 5, time: '2–3 минуты', description: 'Оружие, взрыв, побег и финальный залп. Один маршрут по городу.', hint: 'До 36 баллов. Результат покажем в финале.' }
  };
  function hash(value) { let n = 2166136261; for (const c of String(value)) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619); } return n >>> 0; }
  function shuffled(items, seed) {
    let n = hash(seed); const out = items.slice();
    const random = () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function prepareBank(original, extra) {
    const bank = original.map(q => {
      const copy = JSON.parse(JSON.stringify(q));
      if (copy.type === 'mcq') Object.assign(copy, { section: 'theory', points: 3 });
      if (copy.type === 'image') Object.assign(copy, { section: 'field', points: 8 });
      if (copy.id === 'i02') Object.assign(copy, { section: 'field', points: 8, pointsPerItem: 1, perfectBonus: 3 });
      if (copy.id === 'i04') Object.assign(copy, { section: 'field', points: 8, pointsPerItem: 2, perfectBonus: 2 });
      if (copy.id === 'i01') Object.assign(copy, { section: 'final', points: 10, pointsPerItem: 2, perfectBonus: 2, title: 'Разные времена', stageTitle: 'C1 · Восстановите хронологию' });
      return copy;
    }).concat(JSON.parse(JSON.stringify(extra || [])));
    for (const id of ['cj', 'tommy', 'liberty', 'bmx']) {
      const source = bank.find(q => q.id === 'v6-a-' + id);
      if (source) bank.push({...JSON.parse(JSON.stringify(source)), id: 'v11-a-' + id, points: 6});
    }
    // New editorial edition clones old records: saved answers remain immutable.
    for (const item of [{"source": "v6-a-bmx", "patch": {"id": "v12-a-1", "title": "Первый транспорт", "prompt": "На чём герой перепрыгивает препятствие?", "alt": "Герой преодолевает препятствие на городской улице.", "options": [{"id": "0", "text": "BMX"}, {"id": "1", "text": "Мотоцикл"}, {"id": "2", "text": "Квадроцикл"}, {"id": "3", "text": "Скейтборд"}], "answer": "0", "points": 6}}, {"source": "q14", "patch": {"id": "v12-a-2", "title": "Семейные связи", "prompt": "Роман зовёт Нико в Либерти-Сити. Кем они друг другу приходятся?", "options": [{"id": "0", "text": "Двоюродные братья"}, {"id": "1", "text": "Родные братья"}, {"id": "2", "text": "Дядя и племянник"}, {"id": "3", "text": "Друзья детства"}], "answer": "0", "points": 6}}, {"source": "q19", "patch": {"id": "v12-a-3", "title": "За рулём", "prompt": "Кто из героев GTA V замедляет время именно за рулём?", "options": [{"id": "0", "text": "Майкл"}, {"id": "1", "text": "Франклин"}, {"id": "2", "text": "Тревор"}, {"id": "3", "text": "Никто"}], "answer": "1", "points": 6}}, {"source": "q03", "patch": {"id": "v12-a-4", "title": "Репутация", "prompt": "В GTA 2 банда не даёт тебе новое задание. Что нужно повысить?", "options": [{"id": "0", "text": "Уважение этой банды"}, {"id": "1", "text": "Уровень розыска"}, {"id": "2", "text": "Сумму на счёте"}, {"id": "3", "text": "Максимальную скорость машины"}], "answer": "0", "points": 6}}, {"source": "v6-b-vice-radio", "patch": {"id": "v12-b-1", "title": "Знакомый трейлер", "prompt": "В трейлере какой игры звучал этот трек?", "explanation": "I Ran (So Far Away) группы A Flock of Seagulls звучит в трейлере GTA: Vice City.", "points": 8}}, {"source": "b-basta-mama", "patch": {"id": "v12-b-2", "title": "На своей волне", "prompt": "На какой станции GTA IV звучала «Мама» Басты в первоначальном саундтреке?", "options": [{"id": "0", "text": "Vladivostok FM"}, {"id": "1", "text": "Radio Broker"}, {"id": "2", "text": "The Beat 102.7"}, {"id": "3", "text": "Liberty Rock Radio"}], "answer": "0", "explanation": "«Мама» Басты входила в первоначальный плейлист Vladivostok FM в GTA IV. Позже часть музыки заменили.", "points": 8}}, {"source": "v6-b-ride", "patch": {"id": "v12-b-3", "title": "Другой берег", "prompt": "Маршрут упирается в воду. Что эта машина умеет в GTA Online?", "options": [{"id": "0", "text": "Переплыть на другой берег"}, {"id": "1", "text": "Нырнуть как подлодка"}, {"id": "2", "text": "Взлететь как самолёт"}, {"id": "3", "text": "Ехать только по суше"}], "answer": "0", "points": 8}}, {"source": "v6-b-grove", "patch": {"id": "v12-b-4", "prompt": "Сопоставь банды San Andreas с цветами.", "points": 8}}, {"source": "v6-b-logo-archive", "patch": {"id": "v12-b-5", "title": "Две отметки", "prompt": "На плакате две игры с отметкой 2004. Какие?", "options": [{"id": "0", "text": "San Andreas и Advance"}, {"id": "1", "text": "Vice City и San Andreas"}, {"id": "2", "text": "Advance и Liberty City Stories"}, {"id": "3", "text": "GTA IV и Chinatown Wars"}], "answer": "0", "explanation": "На плакате 2004 год указан у GTA: San Andreas и GTA Advance.", "points": 8}}]) {
      const source = bank.find(q => q.id === item.source);
      if (source) bank.push({...JSON.parse(JSON.stringify(source)), ...item.patch});
    }
    // A distinct ID preserves every saved four/five-game ordering answer.
    const orderSource = bank.find(question => question.id === 'v13-b-release-order');
    if (orderSource && !bank.some(question => question.id === 'v15-b-release-order')) {
      bank.push({ ...JSON.parse(JSON.stringify(orderSource)), id: 'v15-b-release-order', orderMode: 'tap',
        instruction: 'Нажимайте на игры в порядке выхода. Повторное нажатие отменяет выбор.' });
    }
    // Edition 16 adds its own record. Existing tickets keep their original
    // question IDs, keys, explanations and persisted grades.
    if (!bank.some(question => question.id === 'v16-b-hesoyam')) bank.push({
      id: 'v16-b-hesoyam', type: 'image', section: 'field', points: 8,
      title: 'Семь букв из детства',
      prompt: 'San Andreas на ПК. Вводишь HESOYAM — что получает Си-Джей?',
      game: 'GTA: San Andreas', era: '3d', difficulty: 'medium',
      image: 'assets/scene-03.jpg',
      alt: 'Си-Джей прыгает на велосипеде у городской стены в San Andreas.',
      mediaKind: 'screenshot', imageCaption: 'San Andreas · ПК',
      options: [
        { id: 'restore', text: 'Здоровье, броню и $250 000' },
        { id: 'jetpack', text: 'Реактивный ранец' },
        { id: 'weapons', text: 'Набор оружия' },
        { id: 'wanted', text: 'Снятие всех звёзд розыска' }
      ],
      answer: 'restore',
      explanation: 'HESOYAM восстанавливает здоровье и броню Си-Джея и добавляет $250 000. Вопрос относится к PC-версии San Andreas.',
      sources: [
        { title: 'PC Gamer — San Andreas, таблица Player cheats: HESOYAM', url: 'https://www.pcgamer.com/games/grand-theft-auto/san-andreas-cheats/' },
        { title: 'Rockstar Games в Steam — официальный кадр San Andreas', url: 'https://store.steampowered.com/app/12120/' }
      ], spoiler: false
    });
    return bank;
  }
  function supportedEdition(value) {
    if (typeof value === 'number') return Number.isInteger(value) && value >= 3 && value <= 16 ? value : null;
    return typeof value === 'string' && /^(?:[3-9]|10|11|12|13|14|15|16)$/.test(value) ? Number(value) : null;
  }
  function parseLaunchReference(raw, explicitEdition) {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw !== 'string') return { error: 'invalid-variant' };
    const hasExplicitEdition = explicitEdition !== undefined && explicitEdition !== null;
    const requestedEdition = hasExplicitEdition ? supportedEdition(explicitEdition) : null;
    if (hasExplicitEdition && requestedEdition === null) return { error: 'unsupported-edition' };
    const prefixed = /^v(\d+)_(.*)$/i.exec(raw);
    const prefixEdition = prefixed ? supportedEdition(prefixed[1]) : null;
    if (prefixed && (prefixEdition === null || (hasExplicitEdition && prefixEdition !== requestedEdition))) return { error: 'unsupported-edition' };
    const variant = prefixed ? prefixed[2] : raw;
    if (!/^[a-z0-9]{1,20}$/i.test(variant)) return { error: 'invalid-variant' };
    // Unversioned links created before content editions belong to edition 4.
    return { variant: variant.toLowerCase(), edition: prefixEdition || requestedEdition || 4 };
  }
  function buildTicket(seed, edition = CONTENT_EDITION) {
    edition = supportedEdition(edition);
    if (edition === null) throw new RangeError('Unsupported content edition');
    // Keep the easy edition's visual introduction in a deliberate order.
    // Answer choices and interactive drafts still use the attempt's seed.
    if (edition === 16) return buildTicket(seed, 15).map(id => id === 'v14-b-rockstar-north' ? 'v16-b-hesoyam' : id);
    if (edition === 15) return buildTicket(seed, 14).map(id => id === 'v13-b-release-order' ? 'v15-b-release-order' : id);
    if (edition === 14) return [
      'v14-a-first-bmx', 'v14-a-demolition', 'v14-a-cousins-arrival', 'v14-a-ocean-view',
      'v14-b-vice-radio', 'v12-b-2', 'v14-b-tommy-voice', 'v14-b-rockstar-north', 'v13-b-release-order',
      ...buildTicket(seed, 13).slice(9)
    ];
    if (edition === 13) return [
      'v13-a-homecoming', 'v13-a-vice-era', 'v13-a-bellics', 'v13-a-franklin-skill',
      'v12-b-1', 'v12-b-2', 'v13-b-city-return', 'v13-b-leonida', 'v13-b-release-order',
      ...buildTicket(seed, 12).slice(9)
    ];
    if (edition === 12) return ['v12-a-1','v12-a-2','v12-a-3','v12-a-4','v12-b-1','v12-b-2','v12-b-3','v12-b-4','v12-b-5', ...buildTicket(seed, 10).slice(13)];
    if (edition === 11) return ['v11-a-cj', 'v11-a-tommy', 'v11-a-liberty', 'v11-a-bmx', ...buildTicket(seed, 10).slice(8)];
    if (edition >= 6) return [
      'v6-a-cj', 'v6-a-tommy', 'v6-a-niko', 'v6-a-franklin',
      'v6-a-liberty', 'v6-a-bmx', 'v6-a-crew', 'v6-a-chop',
      'v6-b-vice-radio', 'b-basta-mama', 'v6-b-ride', 'v6-b-grove', 'v6-b-logo-archive',
      ...(edition === 10 ? ['v10-c-explode', 'v10-c-escape', 'v10-c-finale'] : edition >= 9 ? ['v9-c-hijack', 'v9-c-explode', 'v9-c-heli'] : edition >= 7 ? ['v7-c-pistol', 'v7-c-uzi', edition === 8 ? 'v8-c-native-heli' : 'v7-c-native-rpg'] : ['v6-c-timeline', 'v6-c-street-names', 'v6-c-rpg'])
    ];
    const pick = (ids, key) => shuffled(ids, seed + key)[0];
    const warmup = shuffled(['q07', 'q09', 'q14', 'q16', 'q19', pick(['q22', 'q23'], 'vi')], seed + 'warmup');
    return warmup.concat(
      shuffled([edition === 3 ? 'q02' : 'a-rune-cheburek', 'q08'], seed + 'warmup-last'),
      [edition === 3 ? pick(['visual-vicecity', 'visual-sanandreas'], 'image3d') : 'b-basta-mama', 'i04', pick(['visual-iv', 'visual-v'], 'imagehd'), 'i02', edition === 5 ? 'b-logo-archive' : pick(edition === 3 ? ['visual-iii', 'visual-online'] : ['visual-iii', 'visual-online', 'visual-vicecity', 'visual-sanandreas'], 'image-last')],
      ['i01', 'c02-universes', 'c03-museum']
    );
  }
  function initialDraft(q, variant) {
    if (q.type === 'mcq' || q.type === 'image' || q.type === 'audio') return null;
    if (q.type === 'rpg') return { version: 1, completed: false, shots: [] };
    if (q.type === 'vice') return null;
    if (q.type === 'match') return Object.fromEntries(q.pairs.map(p => [p.id, '']));
    if (q.type === 'classify') return Object.fromEntries(q.items.map(p => [p.id, '']));
    if (q.type === 'case') return Object.fromEntries(q.steps.map(step => [step.id, initialDraft(step, variant + q.id)]));
    if (q.type === 'order' && q.orderMode === 'tap') return [];
    let order = shuffled(q.items.map(item => item.id), variant + q.id);
    if (order.every((id, i) => id === q.answerIds[i])) order = order.slice(1).concat(order[0]);
    return order;
  }
  function rpgResult(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.completed !== true || !Array.isArray(value.shots)) return null;
    if (value.skipped !== undefined && typeof value.skipped !== 'boolean') return null;
    if (value.skipped) return value.shots.length === 0 ? { hits: 0, skipped: true } : null;
    if (value.shots.length < 1 || value.shots.length > 3) return null;
    let hits = 0;
    for (const shot of value.shots) {
      if (hits === 2 || !shot || typeof shot !== 'object' || Array.isArray(shot) || typeof shot.hit !== 'boolean' || typeof shot.aimed !== 'boolean') return null;
      if (shot.hit) hits++;
    }
    if (hits !== 2 && value.shots.length !== 3) return null;
    return { hits, skipped: false };
  }
  function nativeResult(q, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.engine !== 'vice-city-wasm' || value.version !== (q.resultVersion || 2) || value.scene !== q.nativeScene || value.completed !== true) return null;
    if (value.ammoInitial !== q.initialAmmo || !Number.isInteger(value.ammoRemaining) || value.ammoRemaining < 0 || value.ammoRemaining > q.initialAmmo || !Array.isArray(value.targets)) return null;
    if (value.skipped === true) return value.outcome === 'unavailable' && value.reason === 'runtime-unavailable' && value.ammoRemaining === q.initialAmmo && value.targets.length === 0 ? { correct: 0, skipped: true } : null;
    if (value.skipped !== undefined && value.skipped !== false) return null;
    if (value.observation !== undefined && !readStreetObservation(value.observation)) return null;
    if ((q.id === 'v9-c-hijack' || q.id === 'v10-c-escape')) {
      const m = value.milestones;
      if (!m || typeof m !== 'object' || typeof m.hijacked !== 'boolean' || typeof m.driveCompleted !== 'boolean' || value.targets.length !== 0) return null;
      if (!['cleared', 'timeout', 'lost'].includes(value.outcome) || m.driveCompleted && !m.hijacked) return null;
      if ((value.outcome === 'cleared') !== m.driveCompleted) return null;
      return { correct: Number(m.hijacked) + Number(m.driveCompleted), skipped: false };
    }
    const finale = q.id === 'v10-c-finale';
    const opening = q.id === 'v10-c-explode';
    const helicopter = finale || q.id === 'v8-c-native-heli' || q.id === 'v9-c-heli';
    const destruction = q.id === 'v9-c-explode' || q.id === 'v10-c-explode';
    const noCreditEnd = (helicopter || opening) && ['timeout', 'lost'].includes(value.outcome);
    if (!((helicopter || opening) ? ['cleared', 'ammo', 'timeout', 'lost'] : ['cleared', 'ammo']).includes(value.outcome) || value.targets.length !== q.targetsCount || (!noCreditEnd && value.ammoRemaining === q.initialAmmo)) return null;
    for (const target of value.targets) {
      if (!target || typeof target !== 'object' || Array.isArray(target) || typeof target.credited !== 'boolean' || typeof target.destroyed !== 'boolean' || !Number.isFinite(target.health) || target.health < -100000 || target.health > 1000) return null;
      if (q.nativeScene === 3 && (helicopter ? target.credited && !target.destroyed : target.credited !== target.destroyed)) return null;
      if (destruction && target.credited && !target.destroyed) return null;
      if (q.nativeScene !== 3 && target.credited && target.health >= 1000) return null;
    }
    const correct = value.targets.filter(target => target.credited).length;
    if ((finale || opening) && correct > 0 && value.ammoRemaining === q.initialAmmo) return null;
    if (noCreditEnd ? (!finale && !opening && correct !== 0) || (finale && correct === q.targetsCount) : value.outcome === 'cleared' ? correct !== q.targetsCount : value.ammoRemaining !== 0 || correct === q.targetsCount) return null;
    return { correct: correct, skipped: false };
  }
  function ready(q, value) {
    if (q.type === 'mcq' || q.type === 'image' || q.type === 'audio') return !!value && q.options.some(option => option.id === value);
    if (q.type === 'rpg') return rpgResult(value) !== null;
    if (q.type === 'vice') return nativeResult(q, value) !== null;
    if (q.type === 'order') return Array.isArray(value) && value.length === q.items.length && new Set(value).size === q.items.length && value.every(id => q.items.some(item => item.id === id));
    if (q.type === 'match') return !!value && q.pairs.every(p => q.pairs.some(v => v.id === value[p.id])) && new Set(q.pairs.map(p => value[p.id])).size === q.pairs.length;
    if (q.type === 'classify') return !!value && q.items.every(p => q.categories.some(category => category.id === value[p.id]));
    if (q.type === 'case') return !!value && q.steps.every(step => ready(step, value[step.id]));
    return false;
  }
  function grade(q, value) {
    if (q.type === 'mcq' || q.type === 'image' || q.type === 'audio') return { points: value === q.answer ? q.points : 0, correct: value === q.answer ? 1 : 0, total: 1 };
    if (q.type === 'rpg') {
      const result = rpgResult(value);
      if (!result) return { points: 0, correct: 0, total: 2, invalid: true };
      return { points: Math.min(q.points, result.hits * 7), correct: result.hits, total: 2 };
    }
    if (q.type === 'vice') {
      const result = nativeResult(q, value);
      if (!result) return { points: 0, correct: 0, total: q.targetsCount, invalid: true };
      const points = q.id === 'v10-c-finale' ? (result.skipped ? 0 : value.targets.reduce((sum, target, index) => sum + (target.credited ? q.targetPoints[index] : 0), 0)) : result.correct * q.pointsPerTarget;
      return { points: Math.min(q.points, points), correct: result.correct, total: q.targetsCount };
    }
    if (q.type === 'case') {
      const parts = q.steps.map(step => ({ id: step.id, ...grade(step, value && value[step.id]) }));
      return { points: parts.reduce((n, part) => n + part.points, 0), correct: parts.reduce((n, part) => n + part.correct, 0), total: parts.reduce((n, part) => n + part.total, 0), parts };
    }
    let total = 0, correct = 0;
    if (q.type === 'order') { total = q.answerIds.length; correct = q.answerIds.filter((id, i) => Array.isArray(value) && value[i] === id).length; }
    if (q.type === 'match') { total = q.pairs.length; correct = q.pairs.filter(p => value && value[p.id] === p.id).length; }
    if (q.type === 'classify') { total = q.items.length; correct = q.items.filter(p => value && value[p.id] === p.answer).length; }
    const points = Math.min(q.points, correct * (q.pointsPerItem || 1) + (correct === total ? q.perfectBonus || 0 : 0));
    return { points, correct, total };
  }
  function answerLabel(q, value, correctAnswer) {
    if (q.type === 'mcq' || q.type === 'image' || q.type === 'audio') return (q.options.find(o => o.id === (correctAnswer ? q.answer : value)) || {}).text || 'Не выбрано';
    if (q.type === 'rpg') {
      if (correctAnswer) return 'Сбить вертолёт двумя попаданиями за три выстрела.';
      const result = rpgResult(value);
      if (!result) return 'Игровая практика не завершена';
      if (result.skipped) return 'Игровая практика пропущена';
      return (result.hits === 2 ? 'Вертолёт сбит' : result.hits === 1 ? 'Вертолёт повреждён' : 'Без попаданий') + ' · ' + result.hits + ' из 2 попаданий · выстрелов: ' + value.shots.length;
    }
    if (q.type === 'vice') {
      if (correctAnswer) return q.goal + ' · ' + q.ammoLabel.toLowerCase() + '.';
      const result = nativeResult(q, value);
      if (!result) return 'Протокол сцены не завершён';
      if (result.skipped) return 'Сцена пропущена: игровой движок недоступен на устройстве';
      if ((q.id === 'v9-c-hijack' || q.id === 'v10-c-escape')) return (value.milestones.hijacked ? 'Машина угнана' : 'Машина не угнана') + ' · ' + (value.milestones.driveCompleted ? 'Поездка выполнена' : 'Поездка не завершена');
      return (q.nativeScene === 3 || q.id === 'v9-c-explode' || q.id === 'v10-c-explode' ? 'Уничтожено целей: ' : 'Повреждено разных целей: ') + result.correct + ' / ' + q.targetsCount + '. Израсходовано: ' + (q.initialAmmo - value.ammoRemaining) + ' / ' + q.initialAmmo + '.';
    }
    if (q.type === 'order') return (correctAnswer ? q.answerIds : value || []).map(id => (q.items.find(i => i.id === id) || {}).text || '?').join(' → ');
    if (q.type === 'match') return q.pairs.map(p => p.left + ' — ' + ((q.pairs.find(v => v.id === (correctAnswer ? p.id : value && value[p.id])) || {}).right || 'Не выбрано')).join('; ');
    if (q.type === 'classify') return q.items.map(p => p.text + ' — ' + ((q.categories.find(c => c.id === (correctAnswer ? p.answer : value && value[p.id])) || {}).text || 'Не выбрано')).join('; ');
    if (q.type === 'case') return q.steps.map(step => step.title + ': ' + answerLabel(step, value && value[step.id], correctAnswer)).join(' • ');
    return '';
  }
  function rank(score) {
    if (score === 100) return { name: 'Стобалльник Grove Street', stars: 5, line: 'Комиссии нечего добавить.' };
    if (score >= 90) return { name: 'Легенда GTA', stars: 5, line: 'Тебя здесь знают даже NPC.' };
    if (score >= 75) return { name: 'Авторитет', stars: 4, line: 'Лор знаешь. Район уважает.' };
    if (score >= PASS_SCORE) return { name: 'Знаток улиц', stars: 3, line: 'Экзамен сдан. Улицы помнишь.' };
    if (score >= 35) return { name: 'Свой на районе', stars: 2, line: 'Ещё одна попытка — и допуск твой.' };
    return { name: 'Новый в городе', stars: 1, line: 'Каждая легенда с чего-то начинала.' };
  }
  function sectionRating(points, maximum) {
    let earned = Number(points), possible = Number(maximum);
    if (!Number.isFinite(earned) || !Number.isFinite(possible) || possible <= 0 || earned <= 0) return 1;
    if (earned >= possible) return 5;
    // Inclusive upper boundaries: 20% → 1, 40% → 2, …, 100% → 5.
    // Compare actual earned points; never round a percentage or promote an
    // unanswered / technically skipped task into a completed achievement.
    if (possible > Number.MAX_VALUE / 5) { earned /= possible; possible = 1; }
    for (let stars = 1; stars < 5; stars++) if (earned * 5 <= possible * stars) return stars;
    return 5;
  }
  function elapsedDelta(previous, now, active) { return active ? Math.max(0, Math.min((now - previous) / 1000, 2)) : 0; }
  const api = { VERSION, CONTENT_EDITION, PASS_SCORE, QUESTION_COUNT, sections, prepareBank, buildTicket, parseLaunchReference, initialDraft, ready, grade, answerLabel, rank, sectionRating, shuffled, elapsedDelta, streetObservation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.GTAExam = api;
})(typeof window === 'undefined' ? globalThis : window);
