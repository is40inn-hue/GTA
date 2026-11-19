'use strict';

// Runs production app.js through the existing whole-app adapters. The renderer
// is a deterministic PNG-export double: these checks cover lifecycle, ownership
// and sharing, not WebGL rendering or the visual quality of the final image.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Blob, File } = require('node:buffer');
const BASE = path.join(__dirname, 'app-practice-flow.test.cjs');
let source = fs.readFileSync(BASE, 'utf8').split('\ntest(')[0];
const signature = 'async function appHarness(saved = seedAttempt()) {';
assert(source.includes(signature), 'The read-only whole-app harness entry remains available');
source = source.replace(signature, 'async function appHarness(saved = seedAttempt(), configure = () => {}) {');
assert(source.includes('  context.window = context;'));
source = source.replace('  context.window = context;', '  configure(context, { app, dialog, nodes, document, storage, KEY });\n  context.window = context;');
const reusable = { exports: {} };
vm.runInNewContext(source + '\nmodule.exports = { appHarness, seedAttempt, protocolFor, content };', {
  require: createRequire(BASE), __dirname, module: reusable, setImmediate, console, URL, URLSearchParams,
  AbortController, Response, TextEncoder, Buffer, Blob, File
}, { filename: BASE });
const { appHarness, seedAttempt, protocolFor, content } = reusable.exports;
const clone = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); await new Promise(setImmediate); };

function completeAttempt({ score = 100, nickname = 'Иван', highlight } = {}) {
  const saved = seedAttempt({ edition: 14, index: 0 });
  for (const id of saved.questionIds) {
    const q = content.byId[id];
    const value = q.type === 'order' ? q.answerIds.slice() : q.type === 'vice' ? protocolFor(q.nativeScene, undefined, 14) : q.answer;
    saved.answers[id] = { value, ...content.E.grade(q, value), seconds: 1 };
  }
  // Boundary totals are fixtures; the production score calculation still sums
  // accepted answer points, rather than trusting a separate total-score field.
  let remove = 100 - score;
  for (const id of saved.questionIds.slice().reverse()) {
    const take = Math.min(remove, saved.answers[id].points);
    saved.answers[id].points -= take; remove -= take;
  }
  saved.index = saved.questionIds.length - 1;
  saved.nickname = nickname;
  saved.finishedAt = '2026-11-16T12:00:00.000Z';
  saved.phase = 'result';
  if (highlight) saved.nativeHighlight = highlight;
  return saved;
}

async function resultHarness(options = {}) {
  const drawn = [], exports = [], shares = [], uploads = [], storyCalls = [], downloads = [], urls = new Map(), revoked = [], pendingExports = [], pendingAvatars = [];
  let inGesture = false, exportCount = 0, nextUrl = 0;
  const h = await appHarness(options.saved || completeAttempt(options), (context, ui) => {
    context.Blob = Blob; context.File = File; context.AbortController = AbortController;
    context.FormData = FormData;
    context.document.fonts = { ready: Promise.resolve() };
    const Target = ui.app.constructor;
    const html = Object.getOwnPropertyDescriptor(Target.prototype, 'innerHTML');
    Object.defineProperty(Target.prototype, 'innerHTML', {
      configurable: true,
      get: html.get,
      set(value) {
        html.set.call(this, value);
        for (const match of String(value).matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
          const node = ui.nodes.get(match[2]);
          if (!node) continue;
          for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) {
            node.attributes[attr[1]] = attr[2];
            if (attr[1].startsWith('data-')) node.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attr[2];
          }
          if (node.tagName === 'IMG' && node.attributes.src) node.src = node.attributes.src;
        }
      }
    });
    Object.defineProperty(Target.prototype, 'src', {
      configurable: true,
      get() { return this._src || this.attributes.src || ''; },
      set(value) { this._src = String(value); this.attributes.src = this._src; this.complete = true; this.naturalWidth = 1080; this.naturalHeight = 1920; Promise.resolve().then(() => this.onload?.()); }
    });
    Target.prototype.getAttribute = function (name) { return this.attributes[name] ?? null; };
    Target.prototype.removeAttribute = function (name) { delete this.attributes[name]; };
    Target.prototype.decode = () => Promise.resolve();
    const makeElement = context.document.createElement;
    context.document.createElement = tag => {
      const node = makeElement(tag); node.tagName = String(tag).toUpperCase();
      node.click = () => { if (node.tagName === 'A') downloads.push({ href: node.href, download: node.download, inGesture }); };
      return node;
    };
    context.Image = class {
      constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
      set src(value) {
        this._src = value;
        const loaded = () => {
          if (options.imageFails && String(value).startsWith('data:')) return this.onerror?.(new Error('Image decode fixture failure'));
          this.complete = true; this.naturalWidth = String(value).startsWith('data:') ? 720 : 128; this.naturalHeight = String(value).startsWith('data:') ? 1280 : 128; this.onload?.();
        };
        if (options.deferAvatar && !String(value).startsWith('data:')) pendingAvatars.push(loaded);
        else Promise.resolve().then(loaded);
      }
      get src() { return this._src; }
      decode() { return Promise.resolve(); }
    };
    context.URL = class extends URL {
      static createObjectURL(blob) { const url = 'blob:rc4-test-' + ++nextUrl; urls.set(url, blob); return url; }
      static revokeObjectURL(url) { revoked.push(url); }
    };
    context.GTAExamConfig = { botUsername: '', storyUploadEndpoint: options.endpoint || '' };
    context.GTAStory = { draw(data) {
      drawn.push(data);
      return { width: 1080, height: 1920, toBlob(callback, type) {
        exportCount++;
        const blob = options.failFirstExport && exportCount === 1 ? null : new Blob(['PNG:' + data.name + ':' + data.score + ':' + !!data.highlightImage + ':avatar=' + !!data.avatarImage], { type: type || 'image/png' });
        exports.push(blob);
        if (options.deferExport) pendingExports.push(() => callback(blob));
        else Promise.resolve().then(() => callback(blob));
      } };
    } };
    if (options.webShare) {
      context.navigator.canShare = value => value.files?.[0] instanceof File;
      context.navigator.share = value => { shares.push({ value, inGesture }); return options.shareFailure ? Promise.reject(Object.assign(new Error('share fixture'), { name: options.shareFailure })) : Promise.resolve(); };
    }
    if (options.telegram) {
      context.Telegram = { WebApp: {
        initData: 'test-only-telegram-session', initDataUnsafe: { user: { first_name: 'Иван', photo_url: 'https://photo.test/avatar.jpg' } }, isActive: true, isFullscreen: true,
        isVersionAtLeast: () => true, ready() {}, expand() {}, onEvent() {}, offEvent() {}, setHeaderColor() {}, setBackgroundColor() {}, disableVerticalSwipes() {}, enableClosingConfirmation() {}, requestFullscreen() {},
        BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} }, HapticFeedback: { impactOccurred() {} },
        shareToStory(url, params) { storyCalls.push({ url, params }); }
      } };
    }
    const baseFetch = context.fetch;
    context.fetch = async (url, settings) => {
      if (url === 'questions.json') return baseFetch(url, settings);
      uploads.push({ url, settings, inGesture });
      return { ok: true, json: async () => ({ url: 'https://media.test/result.png' }) };
    };
  });
  return Object.assign(h, { drawn, exports, shares, uploads, storyCalls, downloads, urls, revoked, pendingExports,
    gesture(action, target = h.app, data) { inGesture = true; h.click(action, target, data); inGesture = false; },
    async finishExport() { while (pendingExports.length) pendingExports.shift()(); await settle(); },
    async finishAvatar() { while (pendingAvatars.length) pendingAvatars.shift()(); await settle(); }
  });
}

function visibleResult(h) {
  assert(h.app.innerHTML.includes('result-page'));
  const image = h.nodes.get('result-story-image');
  assert(image && image.hidden === false, 'The ready PNG is already visible without opening another modal');
  assert(h.urls.has(image.src), 'Visible image refers to an exported Blob');
  assert.equal(h.nodes.get('result-card-loading').hidden, true);
  assert.equal(h.nodes.get('result-card-error').hidden, true);
  assert.equal(h.dialog.open, false);
  return { image, blob: h.urls.get(image.src), actions: h.nodes.get('result-share-actions').innerHTML };
}

const highlightFixture = (extra = {}) => ({
  dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 540, height: 960,
  scene: 3, kind: 'explosion', target: 2, priority: 100,
  capturedAt: 1763308800000, sequence: 3, ...extra
});

test('RC4 automatically exposes one result bitmap and an honest file-export action without a media endpoint', async () => {
  const h = await resultHarness({ telegram: true });
  h.click('resume'); await settle();
  const { blob, actions } = visibleResult(h);
  assert.equal(h.drawn.length, 1);
  assert.equal(h.drawn[0].score, 100);
  assert.equal(h.drawn[0].name, 'Иван');
  assert(h.drawn[0].avatarImage, 'The available Telegram avatar is passed into the bitmap renderer');
  assert.equal(h.drawn[0].highlightImage, null, 'No fictitious game frame is supplied');
  assert(actions.includes('Сохранить для сториз'));
  assert(!actions.includes('telegram-story'), 'No direct Telegram Stories promise without a configured public media endpoint');
  assert(!h.app.innerHTML.includes('id="certificate"'));
  assert(!h.app.innerHTML.includes('Скачать бланк'));
  assert.match(h.app.innerHTML, /<details class="result-review">/);
  assert.equal(h.shares.length + h.uploads.length + h.storyCalls.length + h.downloads.length, 0, 'Showing the result does not publish, upload, share or download it');
  h.gesture('story-download');
  assert.equal(h.downloads.length, 1);
  assert.equal(h.urls.get(h.downloads[0].href), blob, 'The saved image is exactly the visible Blob');
  assert.equal(h.downloads[0].download, 'gta-ege-story-100.png');
  assert.equal(h.downloads[0].inGesture, true);
});

test('RC4 Web Share receives the already visible image synchronously from the user gesture', async () => {
  const h = await resultHarness({ webShare: true, score: 60 });
  h.click('resume'); await settle();
  const { blob, actions } = visibleResult(h);
  assert(actions.includes('data-action="share"'));
  assert.equal(h.shares.length, 0);
  h.gesture('share');
  assert.equal(h.shares.length, 1);
  assert.equal(h.shares[0].inGesture, true, 'No await may separate the gesture from navigator.share');
  const file = h.shares[0].value.files[0];
  assert.equal(file.name, 'gta-ege-story-60.png');
  assert.equal(file.type, 'image/png');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from(await blob.arrayBuffer()));
  assert.equal(h.uploads.length + h.storyCalls.length, 0);
});

test('RC4 score boundaries remain correct in the bitmap data and accessible result', async () => {
  for (const score of [0, 59, 60, 100]) {
    const h = await resultHarness({ score }); h.click('resume'); await settle();
    visibleResult(h);
    assert.equal(h.drawn[0].score, score);
    assert.equal(h.drawn[0].passScore, 60);
    assert.equal(h.drawn[0].sections.reduce((sum, part) => sum + part.points, 0), score);
    for (const part of h.drawn[0].sections) {
      assert.equal(part.stars, content.E.sectionRating(part.points, part.max));
      assert(h.app.innerHTML.includes('Часть ' + part.letter + ': ' + part.stars + ' из 5 звёзд'));
    }
    assert(h.app.innerHTML.includes(score < 60 ? 'Нужна пересдача' : 'Экзамен сдан'));
  }
});

test('final section ratings keep skipped or missing C at one star and review wording does not rewrite historical questions', async () => {
  const original = clone(content.byId['v10-c-explode']);
  for (const missing of [false, true]) {
    const saved = completeAttempt();
    for (const id of saved.questionIds.slice(-3)) {
      const q = content.byId[id];
      if (missing) { delete saved.answers[id]; continue; }
      const value = { engine: 'vice-city-wasm', version: q.resultVersion || 2, scene: q.nativeScene, completed: true,
        skipped: true, outcome: 'unavailable', reason: 'runtime-unavailable', ammoInitial: q.initialAmmo, ammoRemaining: q.initialAmmo, targets: [] };
      assert(content.E.ready(q, value)); saved.answers[id] = { value, ...content.E.grade(q, value), seconds: 0 };
    }
    const h = await resultHarness({ saved }); h.click('resume'); await settle();
    const result = visibleResult(h), c = h.drawn[0].sections.find(part => part.key === 'final');
    assert.equal(h.drawn[0].score, 64); assert.equal(c.points, 0); assert.equal(c.max, 36); assert.equal(c.stars, 1);
    assert(result.image.getAttribute('alt').includes('Часть C: 1 из 5 звёзд'));
    assert(h.app.innerHTML.includes('Часть A: 5 из 5 звёзд')); assert(h.app.innerHTML.includes('Часть B: 5 из 5 звёзд'));
    assert(h.app.innerHTML.includes('Уничтожить отмеченную цель'));
    assert(h.app.innerHTML.includes('12 баллов за уничтоженную цель после попаданий Узи. Одного повреждения недостаточно.'));
    assert.deepEqual(clone(content.byId['v10-c-explode']), original);
  }
});

test('RC4 native C3 frame survives engine disposal and is used by the automatically prepared final bitmap', async () => {
  const saved = seedAttempt({ edition: 14, index: 11 }); saved.nickname = 'Иван';
  const h = await resultHarness({ saved }); h.click('resume');
  const port = h.mounts[0], highlight = highlightFixture();
  port.getHighlight = () => { assert.equal(port.destroyed, false, 'Read the frame before destroying the engine'); return clone(highlight); };
  port.emitState('playing'); h.advance(500);
  port.options.onHighlight(clone(highlight));
  port.complete(protocolFor(3, undefined, 14));
  h.advance(2000); await settle();
  const { blob } = visibleResult(h);
  assert.equal(port.destroyed, true);
  assert.equal(h.saved().nativeHighlight.dataUrl, highlight.dataUrl);
  assert.equal(h.drawn[0].score, 100);
  assert.equal(h.drawn[0].highlight.kind, 'explosion');
  assert.equal(h.drawn[0].highlight.scene, 3);
  assert.equal(h.drawn[0].highlightImage.src, highlight.dataUrl);
  assert(blob.size > 0);
  assert.equal(h.gradeCalls.length, 1, 'Capture does not grade or complete the scene twice');
});

test('RC4 a failed screenshot decode keeps the honest result card available', async () => {
  const h = await resultHarness({ highlight: highlightFixture(), imageFails: true });
  h.click('resume'); await settle();
  visibleResult(h);
  assert.equal(h.drawn[0].highlightImage, null);
  assert.equal(h.drawn[0].score, 100);
  assert.equal(h.uploads.length + h.storyCalls.length, 0);
});

test('RC4 failed PNG export exposes retry and never shares an absent image', async () => {
  const h = await resultHarness({ failFirstExport: true, webShare: true });
  h.click('resume'); await settle();
  assert.equal(h.nodes.get('result-story-image').hidden, true);
  assert.equal(h.nodes.get('result-card-error').hidden, false);
  assert.equal(h.nodes.get('result-share-actions').innerHTML, '');
  assert.equal(h.shares.length, 0);
  h.click('story-retry'); await settle();
  visibleResult(h);
  assert.equal(h.drawn.length, 2);
});

test('RC4 a late image export cannot overwrite a new attempt', async () => {
  const h = await resultHarness({ deferExport: true });
  h.click('resume'); await settle();
  assert.equal(h.pendingExports.length, 1);
  h.click('new-ticket');
  assert.equal(h.saved().finishedAt, null);
  await h.finishExport();
  assert(!h.app.innerHTML.includes('result-page'));
  assert.equal(h.nodes.has('result-story-image'), false);
  assert.equal(h.urls.size, 0, 'A stale completed export does not acquire an object URL');
  assert.equal(h.uploads.length + h.shares.length + h.storyCalls.length, 0);
});

test('RC4 a concurrent card refresh waits for the new avatar export instead of reusing the previous cache', async () => {
  const h = await resultHarness({ telegram: true, webShare: true, deferAvatar: true, deferExport: true });
  h.click('resume'); await settle();
  await h.finishExport();
  const first = visibleResult(h);
  assert.equal(h.drawn[0].avatarImage, null, 'The first result may use the initial while the avatar loads');

  await h.finishAvatar();
  assert.equal(h.pendingExports.length, 1, 'The late avatar starts a new PNG generation');
  assert.equal(h.drawn.length, 2);
  assert(h.drawn[1].avatarImage);
  // Re-entering the result while its replacement is encoding invokes the same
  // public showResultImage path again. Its promise must join the new generation.
  h.click('resume'); await settle();
  assert.equal(h.pendingExports.length, 1, 'Concurrent callers share the pending replacement export');
  assert.equal(h.drawn.length, 2);
  assert.equal(h.nodes.get('result-story-image').hidden, true, 'The old image must not be returned under the new cache key');
  assert.equal(h.nodes.get('result-share-actions').innerHTML, '');

  await h.finishExport();
  const refreshed = visibleResult(h);
  assert.notEqual(refreshed.image.src, first.image.src);
  assert.notEqual(refreshed.blob, first.blob);
  h.gesture('share');
  assert.equal(h.shares.length, 1);
  assert.equal(h.shares[0].inGesture, true);
  assert.deepEqual(Buffer.from(await h.shares[0].value.files[0].arrayBuffer()), Buffer.from(await refreshed.blob.arrayBuffer()));
  assert.notDeepEqual(Buffer.from(await refreshed.blob.arrayBuffer()), Buffer.from(await first.blob.arrayBuffer()), 'The refreshed bitmap really contains the newly available avatar');
});

test('RC4 native Telegram Stories only uploads the visible PNG after a deliberate click', async () => {
  const h = await resultHarness({ telegram: true, endpoint: 'https://upload.test/story' });
  h.click('resume'); await settle();
  const { blob, actions } = visibleResult(h);
  assert(actions.includes('data-action="telegram-story"'));
  assert.equal(h.uploads.length + h.storyCalls.length, 0);
  h.gesture('telegram-story'); await settle();
  assert.equal(h.uploads.length, 1);
  assert.equal(h.uploads[0].settings.body, blob);
  assert.equal(h.uploads[0].settings.credentials, 'omit');
  assert.equal(h.uploads[0].settings.headers['Content-Type'], 'image/png');
  assert.equal(h.storyCalls.length, 1);
  assert.equal(h.storyCalls[0].url, 'https://media.test/result.png');
  assert(!JSON.stringify(h.uploads[0].settings.headers).includes('telegram-session'), 'No Telegram initData is attached to the media upload');
});
