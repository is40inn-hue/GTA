const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../dist/story-card.js'), 'utf8');
const engine = require('./load-browser-module.cjs')(require.resolve('../dist/exam-engine.js'));

function harness() {
  const canvases = [], ratingCalls = [];
  const methods = ['fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'rect', 'fill', 'stroke', 'clip', 'save', 'restore', 'translate', 'scale'];
  const document = {
    createElement(tag) {
      assert.equal(tag, 'canvas', 'Renderer only creates local canvases');
      const canvas = { width: 0, height: 0, texts: [], images: [], operations: [] };
      const c = { font: '10px sans-serif', fillStyle: '', textAlign: 'left', filter: 'none', globalAlpha: 1, tainted: false };
      for (const name of methods) c[name] = (...args) => canvas.operations.push({ name, args, fillStyle: c.fillStyle });
      c.createLinearGradient = () => ({ addColorStop() {} });
      c.measureText = text => ({ width: Array.from(String(text)).length * Number(c.font.match(/(\d+)px/)?.[1] || 10) * 0.58 });
      c.fillText = (text, x, y) => canvas.texts.push({ text: String(text), x, y, font: c.font, color: c.fillStyle, align: c.textAlign, width: c.measureText(text).width });
      c.drawImage = (image, ...args) => {
        if (image.unusable) throw new Error('Undecoded image');
        c.tainted ||= !!image.tainted;
        canvas.images.push({ image, args });
      };
      c.getImageData = () => {
        if (c.tainted) throw Object.assign(new Error('Cross-origin'), { name: 'SecurityError' });
        return { data: new Uint8ClampedArray(4) };
      };
      canvas.getContext = () => c;
      canvas.toDataURL = () => { if (c.tainted) throw new Error('Tainted output'); return 'data:image/png;base64,AA=='; };
      canvas.context = c;
      canvases.push(canvas);
      return canvas;
    }
  };
  const scope = { document, window: { GTAExam: { sectionRating(points, maximum) { ratingCalls.push([points, maximum]); return engine.sectionRating(points, maximum); } } }, Intl, fetch() { throw new Error('Renderer must not fetch'); }, Image() { throw new Error('Renderer must not load remote images'); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/classic-brand.js'), 'utf8'), scope, { filename: 'classic-brand.js' });
  vm.runInNewContext(source, scope, { filename: 'story-card.js' });
  return { draw: scope.window.GTAStory.draw, canvases, ratingCalls };
}
const base = { name: 'Участник', score: 60, passScore: 60, sections: [{ points: 24, max: 24 }, { points: 24, max: 40 }, { points: 12, max: 36 }] };
const texts = canvas => canvas.texts.map(t => t.text);

test('the final card is synchronous 1080×1920 and carries exactly one total score', () => {
  const { draw } = harness();
  const result = draw(base);
  assert.equal(result.width, 1080); assert.equal(result.height, 1920);
  assert.equal(typeof result.then, 'undefined');
  assert.equal(texts(result).filter(t => t === '60').length, 1);
  assert(texts(result).includes('/ 100'));
  assert(texts(result).includes('Участник'));
  assert.equal(result.toDataURL(), 'data:image/png;base64,AA==');
});

for (const [score, expected] of [[59, 'ПЕРЕСДАЧА'], [60, 'ЗАЧЁТ'], [100, 'ЗАЧЁТ']]) {
  test(`score ${score} has a threshold-consistent verdict even when an old passed flag disagrees`, () => {
    const result = harness().draw({ ...base, score, passed: score < 60 });
    assert(texts(result).includes(String(score)));
    assert(texts(result).includes(expected));
    assert(!texts(result).includes(expected === 'ЗАЧЁТ' ? 'ПЕРЕСДАЧА' : 'ЗАЧЁТ'));
  });
}

test('practice stays visibly a practice result and numeric scores stay bounded', () => {
  for (const [raw, label] of [[-5, '0'], [Infinity, '0'], ['bad', '0'], [125, '100']]) {
    const result = harness().draw({ ...base, score: raw, mode: 'practice' });
    assert(texts(result).includes(label));
    assert(texts(result).includes('ТРЕНИРОВКА'));
    assert(!texts(result).includes('ЗАЧЁТ'));
  }
});

for (const [name, width, height] of [['portrait', 540, 960], ['landscape', 960, 540]]) {
  test(`${name} game frame is retained in full within the photo area`, () => {
    const image = { width, height, id: name };
    const result = harness().draw({ ...base, highlightImage: image, highlight: { scene: 3, kind: 'explosion' } });
    const foreground = result.images.find(call => call.image === image && call.args.length === 8);
    assert(foreground, 'There is a full-frame foreground image, not only a cropped backdrop');
    assert.deepEqual(foreground.args.slice(0, 4), [0, 0, width, height]);
    const [x, y, w, h] = foreground.args.slice(4);
    assert(x >= 72 && y >= 590 && x + w <= 1008 && y + h <= 1482);
    assert(Math.abs(w / h - width / height) < 0.003, 'No stretched game geometry');
    assert(texts(result).includes('ЧАСТЬ C · ПРАКТИКА'));
    assert(!texts(result).includes('ТВОЙ МОМЕНТ'));
  });
}

test('an absent, broken or tainted frame gives an honest typographic card', () => {
  for (const image of [undefined, { width: 0, height: 0 }, { width: 960, height: 540, unusable: true }, { width: 960, height: 540, tainted: true }]) {
    const result = harness().draw({ ...base, highlightImage: image, highlight: { kind: 'explosion' } });
    assert(texts(result).includes('БЛАНК РЕЗУЛЬТАТОВ'));
    assert(!texts(result).includes('ЧАСТЬ C · ПРАКТИКА'));
    assert(!texts(result).includes('ТВОЙ МОМЕНТ'));
    assert.equal(result.images.length, 0, 'No invented scene or unsafe frame is painted');
    assert.doesNotThrow(() => result.toDataURL());
  }
});

test('avatar failures fall back to a readable initial without breaking image export', () => {
  const unsafe = { width: 300, height: 300, tainted: true };
  const result = harness().draw({ ...base, name: 'Гость', avatarImage: unsafe });
  assert(texts(result).includes('Г'));
  assert.equal(result.images.some(call => call.image === unsafe), false);
  assert.doesNotThrow(() => result.toDataURL());
  const valid = { width: 500, height: 300 };
  const withAvatar = harness().draw({ ...base, avatarImage: valid });
  assert(withAvatar.images.some(call => call.image === valid && call.args.length === 8));
});

test('long Cyrillic names fit the name row at a readable size and controls are removed', () => {
  const result = harness().draw({ ...base, name: 'Александр Очень Длинное Имя Участника '.repeat(4) + '\u202e\n' });
  const name = result.texts.find(t => t.text.startsWith('Александр'));
  assert(name); assert(name.width <= 780);
  assert(Number(name.font.match(/(\d+)px/)[1]) >= 32);
  assert(name.text.endsWith('…'));
  assert(!name.text.includes('\u202e') && !name.text.includes('\n'));
  assert(name.x >= 72 && name.y <= 1740);
});

test('all meaningful text remains in the story-safe area and old technical rows are gone', () => {
  const result = harness().draw({ ...base, variant: 'v14-long-variant', fieldSeconds: 119, totalQuestions: 12 });
  assert(result.texts.every(t => t.y >= 140 && t.y <= 1740));
  const content = texts(result).join('\n');
  assert(!/ВАРИАНТ|ПРОХОДНОЙ|00:|Часть B:|2026|ПОРОГ|КОМИССИЯ|12 заданий|ТВОЙ РЕЗУЛЬТАТ|ТВОЙ МОМЕНТ/.test(content));
  assert(content.includes('A  24/24') && content.includes('B  24/40') && content.includes('C  12/36'));
});

test('missing section data never invents earned points', () => {
  const result = harness().draw({ name: 'Участник', score: 88 });
  assert(!texts(result).some(text => /^[ABC]  /.test(text)));
  assert(texts(result).includes('88'));
  assert(!result.operations.some(item => item.name === 'fill' && ['#a9782e', '#d3c9b8'].includes(item.fillStyle)), 'A total score alone cannot invent section ratings');
});

test('PNG uses the shared rating helper and draws exactly five slots per section without rounding across a threshold', () => {
  for (const [points, stars] of [[0, 1], [20, 1], [20.001, 2], [40, 2], [40.001, 3], [60, 3], [60.001, 4], [80, 4], [80.001, 5], [100, 5]]) {
    const h = harness();
    const sections = [0, 1, 2].map(() => ({ points, max: 100, stars: 5 }));
    const result = h.draw({ ...base, sections });
    assert.deepEqual(h.ratingCalls, [[points, 100], [points, 100], [points, 100]], 'Canvas calls the same exported helper with unrounded earned points');
    const symbols = result.operations.filter(item => item.name === 'fill' && ['#a9782e', '#d3c9b8'].includes(item.fillStyle));
    assert.equal(symbols.length, 15);
    assert.equal(symbols.filter(item => item.fillStyle === '#a9782e').length, stars * 3, 'Caller-supplied stars cannot override earned points');
    const starPoints = result.operations.filter(item => ['moveTo', 'lineTo'].includes(item.name) && item.args[1] > 1705 && item.args[1] < 1735);
    assert.equal(starPoints.length, 150); assert(starPoints.every(item => item.args[0] >= 72 && item.args[0] <= 1008));
    assert(!texts(result).includes('★'), 'Exported ratings do not depend on the installed font having a star glyph');
    assert(texts(result).includes('Участник')); assert(texts(result).includes('/ 100'));
  }
});
