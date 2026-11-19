'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { create } = require('../dist/boot-guard.js');
const dist = path.resolve(__dirname, '../dist');

function harness({ protocol = 'https:', fetch } = {}) {
  let now = 0, next = 0, reloads = 0;
  const timers = new Map(), listeners = new Map(), nodes = new Map();
  function node(id) {
    const element = { id, hidden: false, textContent: '', disabled: false, classList: { add() {} }, setAttribute() {} };
    nodes.set(id, element); return element;
  }
  const app = node('app');
  Object.defineProperty(app, 'innerHTML', { set(value) { for (const match of String(value).matchAll(/\bid="([^"]+)"/g)) node(match[1]); } });
  for (const id of ['boot-panel', 'boot-title', 'boot-message', 'boot-detail', 'boot-retry']) node(id);
  const storage = new Map([['gta-ege-session-v4', 'existing answers']]);
  const root = {
    document: { getElementById: id => nodes.get(id), addEventListener(name, fn) { listeners.set('document:' + name, fn); }, querySelectorAll: () => [] },
    location: { protocol, href: protocol + '//exam.test/?variant=v15_ticket#saved', reload() { reloads++; } },
    AbortController,
    fetch: fetch || (async () => ({ ok: true, status: 200, json: async () => [{ id: 'q1' }] })),
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    setTimeout(fn, delay) { const id = ++next; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { listeners.set(name, fn); }
  };
  const boot = create(root);
  return { boot, root, nodes, timers, storage, get reloads() { return reloads; },
    event(name, value) { listeners.get(name)?.(value); },
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        const entry = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        now = entry[1].at; timers.delete(entry[0]); entry[1].fn();
        await Promise.resolve();
      }
      now = until; await Promise.resolve();
    }
  };
}

test('the visible static boot screen and inline recovery need no extra successful script request', () => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const inline = /<script id="ege-boot-guard">\s*([\s\S]*?)\s*<\/script>/.exec(html);
  assert(inline, 'Recovery runs inline before the application dependencies');
  assert.equal(inline[1].trim(), fs.readFileSync(path.join(dist, 'boot-guard.js'), 'utf8').trim());
  assert(html.includes('<div id="app"><main id="boot-panel"'));
  assert(html.includes('id="boot-retry"'));
  assert(html.indexOf('id="ege-boot-guard"') < html.indexOf('<script defer'));
  const scripts = [...html.matchAll(/<script defer[^>]*>/g)];
  assert(scripts.length > 10);
  assert(scripts.every(([tag]) => tag.includes('data-boot-required') && tag.includes('?release=rc4.1-20261117')));
});

test('a missing required module produces a named visible error and preserves the session', () => {
  const h = harness();
  assert.equal(h.boot.requireModules([{ name: 'GTAExam', label: 'модуль вопросов' }]), false);
  assert.equal(h.boot.getState().phase, 'failed');
  assert.match(h.nodes.get('boot-detail').textContent, /модуль вопросов/);
  assert.equal(h.storage.get('gta-ege-session-v4'), 'existing answers');
  assert.equal(h.reloads, 0);
});

test('a required script load error is visible while an optional Telegram script is ignored', () => {
  const h = harness();
  h.event('error', { target: { tagName: 'SCRIPT', getAttribute: () => null } });
  assert.equal(h.boot.getState().phase, 'loading');
  h.event('error', { target: { tagName: 'SCRIPT', getAttribute: name => name === 'data-boot-required' ? '' : 'exam-engine.js?release=rc4.1-20261117' } });
  assert.equal(h.boot.getState().failure.code, 'B-SCRIPT');
  assert.equal(h.nodes.get('boot-detail').textContent, 'Не загрузился файл: exam-engine.js');
});

test('file URLs show the local launcher instruction before app bootstrap', () => {
  const h = harness({ protocol: 'file:' });
  assert.equal(h.boot.getState().failure.code, 'B-FILE');
  assert.match(h.nodes.get('boot-message').textContent, /START-MAC\.command/);
  assert.match(h.nodes.get('boot-message').textContent, /START-WINDOWS\.cmd/);
  assert.equal(h.boot.requireModules([]), false);
});

test('a required local script exception is visible without masking a third-party SDK error', () => {
  const h = harness();
  h.root.document.querySelectorAll = () => [{ src: 'https://exam.test/exam-engine.js?release=rc4.1-20261117' }];
  h.event('error', { filename: 'https://telegram.org/js/telegram-web-app.js', message: 'External SDK fixture' });
  assert.equal(h.boot.getState().phase, 'loading');
  h.event('error', { filename: 'https://exam.test/exam-engine.js?release=rc4.1-20261117', message: 'Syntax fixture' });
  assert.equal(h.boot.getState().failure.code, 'B-SCRIPT-EXEC');
  assert.equal(h.nodes.get('boot-detail').textContent, 'Ошибка запуска: exam-engine.js');
});

test('a 404 for questions reports that the content file is missing', async () => {
  const h = harness({ fetch: async () => ({ ok: false, status: 404 }) });
  await assert.rejects(h.boot.loadQuestions('questions.json'), e => { h.boot.fail(e); return e.bootCode === 'B-QUESTIONS-HTTP-404'; });
  assert.match(h.nodes.get('boot-message').textContent, /не найден файл/);
  assert.match(h.nodes.get('boot-detail').textContent, /404/);
});

test('invalid question JSON and wrong schema have distinct failures', async () => {
  for (const [json, code] of [
    [async () => { throw new SyntaxError('Unexpected <'); }, 'B-QUESTIONS-JSON'],
    [async () => ({ html: 'not a question array' }), 'B-QUESTIONS-FORMAT'],
    [async () => [], 'B-QUESTIONS-FORMAT']
  ]) {
    const h = harness({ fetch: async () => ({ ok: true, status: 200, json }) });
    await assert.rejects(h.boot.loadQuestions('questions.json'), e => e.bootCode === code);
  }
});

test('network failure is reported without clearing answers or automatic reload', async () => {
  const h = harness({ fetch: async () => { throw new TypeError('NetworkError'); } });
  await assert.rejects(h.boot.loadQuestions('questions.json'), e => { h.boot.fail(e); return e.bootCode === 'B-QUESTIONS-NETWORK'; });
  assert.equal(h.storage.get('gta-ege-session-v4'), 'existing answers');
  assert.equal(h.reloads, 0);
});

test('a hanging questions request is bounded to 12 seconds and aborted', async () => {
  let signal;
  const h = harness({ fetch: (_, options) => { signal = options.signal; return new Promise(() => {}); } });
  const rejection = assert.rejects(h.boot.loadQuestions('questions.json'), e => { h.boot.fail(e); return e.bootCode === 'B-QUESTIONS-TIMEOUT'; });
  await h.advance(12000); await rejection;
  assert.equal(signal.aborted, true);
  assert.equal(h.boot.getState().phase, 'failed');
  assert.equal(h.reloads, 0);
});

test('the same deadline also covers a response body that never finishes', async () => {
  let signal;
  const h = harness({ fetch: async (_, options) => { signal = options.signal; return { ok: true, status: 200, json: () => new Promise(() => {}) }; } });
  const rejection = assert.rejects(h.boot.loadQuestions('questions.json'), e => e.bootCode === 'B-QUESTIONS-TIMEOUT');
  await Promise.resolve(); await h.advance(12000); await rejection;
  assert.equal(signal.aborted, true);
});

test('normal bootstrap loads the questions, clears the watchdog, and stays ready', async () => {
  let received;
  const h = harness({ fetch: async (url, options) => { received = { url, options }; return { ok: true, status: 200, json: async () => [{ id: 'question' }] }; } });
  h.root.GTAExam = {};
  assert.equal(h.boot.requireModules(['GTAExam']), true);
  assert.deepEqual(await h.boot.loadQuestions('questions.json'), [{ id: 'question' }]);
  assert.equal(received.url, 'questions.json');
  assert.equal(received.options.cache, 'no-cache');
  assert.equal(h.boot.ready(), true);
  await h.advance(60000);
  assert.equal(h.boot.getState().phase, 'ready');
  assert.equal(h.timers.size, 0);
  assert.equal(h.reloads, 0);
});

test('a stalled script sequence shows an error at 20 seconds and never loops', async () => {
  const h = harness();
  await h.advance(20000);
  assert.equal(h.boot.getState().failure.code, 'B-SCRIPTS-TIMEOUT');
  await h.advance(120000);
  assert.equal(h.reloads, 0);
});

test('retry performs one manual reload preserving the variant URL and saved answers', () => {
  const h = harness();
  const href = h.root.location.href;
  h.boot.fail(h.boot.error('B-START', 'Retry fixture'));
  h.boot.retry(); h.boot.retry();
  assert.equal(h.reloads, 1);
  assert.equal(h.root.location.href, href);
  assert.equal(h.nodes.get('boot-retry').disabled, true);
  assert.equal(h.storage.get('gta-ege-session-v4'), 'existing answers');
});
