'use strict';

// Compatibility for the independently deployed edition 13/14. These IDs are
// historical answer bindings, not aliases for the differently worded RC3 bank.
(function (scope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.GTAExamNetlifyLegacyQuestions = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const clone = value => JSON.parse(JSON.stringify(value));
  function create(bank) {
    if (!Array.isArray(bank)) throw new TypeError('A prepared question bank is required');
    const existing = new Map(bank.map(question => [question.id, question]));
    function source(id) {
      const question = existing.get(id);
      if (!question) throw new Error('Missing legacy source: ' + id);
      return question;
    }
    function copied(id, original, patch) {
      return Object.assign(clone(source(original)), patch || {}, { id: id });
    }
    function visual(id) {
      const question = source('v6-a-' + id);
      return { image: question.image, alt: question.alt, mediaKind: question.mediaKind, imageCaption: question.imageCaption };
    }
    const records = [
      copied('v13-a-1', 'v12-a-1', { prompt: 'На чём герой делает трюк?', alt: 'Герой выполняет трюк на переднем плане.' }),
      copied('v13-a-2', 'v6-a-tommy', { points: 6 }),
      copied('v13-a-3', 'v12-a-2', visual('niko')),
      copied('v13-a-4', 'v12-a-3', visual('franklin')),
      copied('v13-b-1', 'v12-b-1'),
      copied('v13-b-2', 'v12-b-2'),
      copied('v13-b-3', 'v12-b-3'),
      {
        id: 'v13-b-4', section: 'field', type: 'order', orderMode: 'tap', points: 8, pointsPerItem: 2,
        title: 'Четыре эпохи', prompt: 'В каком порядке вышли эти игры? От ранней к поздней.',
        image: 'assets/rc2-cities.svg', alt: 'Четыре условных городских силуэта: пляж, магистраль и два деловых квартала.', mediaKind: 'art', imageCaption: 'Иллюстрация к заданию.',
        items: [{ id: 'iii', text: 'GTA III' }, { id: 'vc', text: 'Vice City' }, { id: 'sa', text: 'San Andreas' }, { id: 'iv', text: 'GTA IV' }],
        answerIds: ['iii', 'vc', 'sa', 'iv'], explanation: 'GTA III (2001), Vice City (2002), San Andreas (2004), GTA IV (2008).',
        sources: [{ title: 'Rockstar Games — каталог игр', url: 'https://www.rockstargames.com/games' }]
      },
      {
        id: 'v13-b-5', section: 'field', type: 'mcq', points: 8, title: 'За пределами города',
        prompt: 'В каком штате GTA VI находятся Вайс-Сити и архипелаг Keys?',
        options: [{ id: 'leonida', text: 'Леонида' }, { id: 'andreas', text: 'Сан-Андреас' }, { id: 'liberty', text: 'Либерти' }, { id: 'alderney', text: 'Олдерни' }],
        answer: 'leonida', explanation: 'Rockstar назвала штат Леонидой. Вайс-Сити — только одна из его локаций.',
        sources: [{ title: 'Rockstar Games — Leonida Keys', url: 'https://www.rockstargames.com/VI/only-in-leonida/leonida-keys' }]
      },
      {
        id: 'v14-a-release', section: 'theory', type: 'mcq', points: 6, title: 'День премьеры',
        // Preserve the saved answer key while making the old, date-sensitive
        // question historical. No clock changes this question into a claim of release.
        prompt: 'По анонсу, использованному в этом билете, на какую дату был назначен выход GTA VI?',
        image: 'assets/rc3-release.svg', mediaKind: 'art', alt: 'Силуэт пальмы над набережной на закате.',
        imageCaption: 'Иллюстрация к заданию.',
        options: [{ id: 'r12', text: '12 ноября 2026' }, { id: 'r19', text: '19 ноября 2026' }, { id: 'r26', text: '26 ноября 2026' }, { id: 'r03', text: '3 декабря 2026' }],
        answer: 'r19', explanation: 'Сохранённый ключ этого билета — 19 ноября 2026 года: такая дата была указана в использованном анонсе для PS5 и Xbox Series X|S.',
        sources: [{ title: 'Rockstar Games — GTA VI', url: 'https://www.rockstargames.com/VI' }]
      }
    ];
    return records.filter(question => {
      const prior = existing.get(question.id);
      if (!prior) return true;
      if (JSON.stringify(prior) !== JSON.stringify(question)) throw new Error('Legacy question ID collision: ' + question.id);
      return false;
    });
  }
  return Object.freeze({ create: create });
});
