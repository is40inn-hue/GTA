'use strict';

// Executes the complete production app, exam engine, content and flow helper.
// DOM/audio/native-port adapters are deliberately minimal: this is application
// lifecycle QA, not browser layout, WebGL, sound or real native-hit verification.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const DIST = path.resolve(__dirname, '../dist');
const KEY = 'gta-ege-session-v4';
const copy = value => JSON.parse(JSON.stringify(value));

function realContent() {
  const context = { window: {} };
  for (const filename of ['exam-content.js', 'v6-radio-content.js', 'v8-practice-content.js', 'rc2-content.js', 'rc3-content.js', 'exam-engine.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(DIST, filename), 'utf8'), context, { filename });
  }
  const E = context.window.GTAExam, C = context.window.GTAExamContent;
  const original = JSON.parse(fs.readFileSync(path.join(DIST, 'questions.json'), 'utf8'));
  const bank = E.prepareBank(original, [...C.finalQuestions, ...C.russiaQuestions, ...(C.easyQuestions || []), ...context.window.GTAExamRadioQuestions, ...context.window.GTAExamPracticalQuestions, ...context.window.GTAExamRC2Questions, ...context.window.GTAExamRC3Questions]);
  return { E, original, byId: Object.fromEntries(bank.map(q => [q.id, q])) };
}
const content = realContent();

function seedAttempt({ edition = 8, index, seenFinal = true } = {}) {
  const questionIds = content.E.buildTicket('flowcheck', edition), answers = {};
  if (index === undefined) index = questionIds.length - 3;
  for (const id of questionIds.slice(0, index)) {
    const q = content.byId[id];
    const value = q.type === 'match' ? Object.fromEntries(q.pairs.map(pair => [pair.id, pair.id]))
      : q.type === 'order' ? q.answerIds.slice()
      : q.type === 'vice' ? protocolFor(q.nativeScene, undefined, edition) : q.answer;
    assert(content.E.ready(q, value), 'Seed answers must be valid real ticket answers: ' + id);
    answers[id] = { value, ...content.E.grade(q, value), seconds: 1 };
  }
  return { version: 4, contentEdition: edition, variant: 'flowcheck', questionIds, mode: 'exam', nickname: 'VM participant',
    answers, drafts: {}, caseSteps: {}, questionTimes: {}, seenStages: ['theory', 'field', ...(seenFinal ? ['final'] : [])],
    completedCheckpoints: ['theory', 'field'], index, activeSeconds: 0, phase: 'question',
    startedAt: '2026-11-12T00:00:00.000Z', finishedAt: null };
}

function protocolFor(number, hits, edition = 8) {
  const ids = content.E.buildTicket('flowcheck', edition);
  const q = content.byId[ids[ids.length - 4 + number]];
  const count = hits === undefined ? q.targetsCount : hits;
  if (q.id === 'v10-c-escape' || q.id === 'v9-c-hijack') {
    return { engine: 'vice-city-wasm', version: 3, scene: q.nativeScene, completed: true,
      outcome: count === 2 ? 'cleared' : 'timeout', ammoInitial: 0, ammoRemaining: 0, targets: [],
      milestones: { hijacked: count >= 1, driveCompleted: count === 2 } };
  }
  const destruction = number === 3 || q.id === 'v10-c-explode' || q.id === 'v9-c-explode';
  return { engine: 'vice-city-wasm', version: q.resultVersion || 2, scene: number, completed: true,
    outcome: count === q.targetsCount ? 'cleared' : 'ammo', ammoInitial: q.initialAmmo,
    ammoRemaining: count === q.targetsCount ? q.initialAmmo - Math.min(count, q.initialAmmo) : 0,
    targets: Array.from({ length: q.targetsCount }, (_, index) => ({ credited: index < count,
      destroyed: destruction && index < count, health: index < count ? destruction ? 0 : 970 : 1000 })) };
}

async function appHarness(saved = seedAttempt()) {
  let time = 0, timerId = 0;
  const timers = new Map(), timerHistory = [], nodes = new Map(), storage = new Map(saved ? [[KEY, JSON.stringify(saved)]] : []);
  const mounts = [], transitions = [], gradeCalls = [], audioContexts = [], audioStarts = [], pauses = [];
  const preloadContexts = [], preloadSubscribers = new Set(), audioClips = [];
  let preloadState = { status: 'idle', progress: 0, cacheAvailable: true }, preloadStarted = false, musicEnabled = true;
  const publishPreload = value => { preloadState = { ...preloadState, ...value }; for (const fn of preloadSubscribers) fn({ ...preloadState }); };
  class Target {
    constructor(id = '') { this.id = id; this.listeners = new Map(); this.dataset = {}; this.style = {}; this.hidden = false; this.disabled = false; this.open = false; this.value = ''; this.textContent = ''; this.isConnected = true; this.attributes = {}; this._html = ''; this.ownedIds = [];
      this.classList = { toggle() {}, add() {}, remove() {} }; }
    addEventListener(name, fn) { const list = this.listeners.get(name) || []; list.push(fn); this.listeners.set(name, list); }
    removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(value => value !== fn)); }
    dispatch(name, event = {}) { for (const fn of this.listeners.get(name) || []) fn(event); }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this._html = String(value);
      for (const id of this.ownedIds) nodes.delete(id); this.ownedIds = [];
      for (const match of this._html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const node = new Target(match[2]); node.tagName = match[1].toUpperCase(); node.hidden = /\bhidden\b/.test(match[0]);
        // Media adapters represent already decoded images and an available,
        // paused audio clip. Rendering/audio playback are outside this VM test.
        if (node.tagName === 'IMG') { node.complete = true; node.naturalWidth = 640; }
        if (node.tagName === 'AUDIO') { node.paused = true; node.ended = false; }
        node.value = /\bvalue="([^"]*)"/.exec(match[0])?.[1] || ''; nodes.set(node.id, node); this.ownedIds.push(node.id);
      }
    }
    querySelector(selector) {
      if (selector.startsWith('#')) return nodes.get(selector.slice(1)) || null;
      if (selector === '.question-title' && this._html.includes('question-title')) return new Target();
      if (selector === '[data-question-timer]' && this._html.includes('data-question-timer')) return new Target();
      if (selector === '.commission-progress > i') return new Target();
      if (selector.startsWith('.commission-') && this._html.includes('commission-')) return new Target();
      return null;
    }
    querySelectorAll() { return []; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    focus() {} scrollIntoView() {}
    appendChild(node) { node.parentNode = this; node.appendCount = (node.appendCount || 0) + 1; if (node.id) nodes.set(node.id, node); return node; }
    remove() { this.isConnected = false; if (this.id) nodes.delete(this.id); }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch('close'); }
    getBoundingClientRect() { return { left: 0, top: 0, right: 390, bottom: 700, width: 390, height: 700 }; }
  }
  const app = new Target('app'), dialog = new Target('dialog'), toast = new Target('toast');
  for (const node of [app, dialog, toast]) nodes.set(node.id, node);
  const document = new Target('document'); document.hidden = false; document.body = new Target('body'); document.documentElement = new Target('html');
  document.getElementById = id => nodes.get(id) || null;
  document.querySelector = selector => app.querySelector(selector);
  document.createElement = () => new Target();
  const windowTarget = new Target('window');
  function schedule(fn, delay = 0, interval = false) {
    const id = ++timerId, task = { id, fn, delay, next: time + Math.max(1, delay), interval };
    timers.set(id, task); timerHistory.push(task); return id;
  }
  const context = {
    document, location: { href: 'https://flow.test/', origin: 'https://flow.test', search: '', reload() {} },
    history: { replaceState() {} }, navigator: {}, crypto: webcrypto, URL, URLSearchParams, Uint32Array,
    performance: { now: () => time }, console,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [1763078400000 + time])); }
      static now() { return 1763078400000 + time; }
    },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) },
    fetch: async url => { assert.equal(url, 'questions.json'); return { ok: true, json: async () => copy(content.original) }; },
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => timers.delete(id),
    setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => schedule(() => fn(time), 16), cancelAnimationFrame: id => timers.delete(id),
    addEventListener: (...args) => windowTarget.addEventListener(...args),
    removeEventListener: (...args) => windowTarget.removeEventListener(...args), scrollTo() {},
    matchMedia: () => ({ matches: true }),
    GTAExamAudio: {
      buttonHTML: () => '<button data-action="music-toggle">Звук</button>',
      configure() {}, releaseClip() {}, pauseClip() {}, isEnabled: () => musicEnabled, toggleMusic() { musicEnabled = !musicEnabled; },
      setContext: value => audioContexts.push(value), start: value => audioStarts.push(value), setAppActive() {},
      mountClip(q, ready, buffering, options) { audioClips.push({ id: q.id, options }); ready(); }, isBuffering: () => false
    },
    GTANativePreload: {
      setContext(value) {
        preloadContexts.push(copy(value));
        if (value.active && (value.screen === 'home' && value.entryReady || ['question', 'stage'].includes(value.screen) && value.section === 'theory') && !value.mediaBusy && !preloadStarted) {
          preloadStarted = true; publishPreload({ status: 'loading' });
        }
      },
      subscribe(fn) { preloadSubscribers.add(fn); fn({ ...preloadState }); return () => preloadSubscribers.delete(fn); },
      getState: () => ({ ...preloadState }), pause() {}
    },
    GTAVicePort: { mount(host, options) {
      let scene = options.scene, stage = 'idle', destroyed = false, warmup = options.warmup === true;
      let activationCalls = 0, destroyCalls = 0;
      const pauseHistory = [], muteHistory = [options.muted];
      const port = {
        options, host, get destroyed() { return destroyed; },
        get activationCalls() { return activationCalls; }, get destroyCalls() { return destroyCalls; }, pauseHistory, muteHistory,
        getState: () => ({ scene, stage }), isWarmup: () => warmup,
        setScene(next) { if (destroyed) return false; if (next === scene) return true; if (warmup || ['playing', 'starting', 'finishing', 'paused'].includes(stage)) return false; scene = next; stage = 'preparing'; transitions.push(next); options.onState?.({ scene, stage }); return true; },
        setMuted(value) { muteHistory.push(value); }, setPaused(value) { pauses.push(value); pauseHistory.push(value); }, destroy() { destroyCalls++; destroyed = true; },
        activate() { activationCalls++; if (destroyed || !warmup) return false; warmup = false; stage = 'briefing'; options.onState?.({ scene, stage }); options.onReady?.(); return true; },
        warmReady() { if (destroyed || !warmup) return; stage = 'warmed'; options.onState?.({ scene, stage }); options.onWarmReady?.(); },
        emitState(nextStage) { if (destroyed) return; stage = nextStage; options.onState?.({ scene, stage }); },
        complete(value) { if (destroyed) return; stage = 'complete'; options.onState?.({ scene, stage }); options.onComplete?.(copy(value)); },
        error() { if (!destroyed) options.onError?.('Fixture runtime unavailable'); }
      };
      mounts.push(port); return port;
    } }
  };
  context.window = context;
  const realm = vm.createContext(context);
  for (const filename of ['boot-guard.js', 'exam-content.js', 'v6-radio-content.js', 'v8-practice-content.js', 'rc2-content.js', 'rc3-content.js', 'exam-engine.js', 'practice-flow.js', 'native-warmup.js']) {
    vm.runInContext(fs.readFileSync(path.join(DIST, filename), 'utf8'), realm, { filename, timeout: 1000 });
  }
  const grade = context.GTAExam.grade;
  context.GTAExam.grade = (q, value) => { gradeCalls.push(q.id); return grade(q, value); };
  vm.runInContext(fs.readFileSync(path.join(DIST, 'app.js'), 'utf8'), realm, { filename: 'app.js', timeout: 1000 });
  await new Promise(resolve => setImmediate(resolve));
  assert(app.innerHTML.includes(saved ? 'resume-banner' : 'home-page'), 'Whole app bootstrap must reach its normal home screen');
  function click(action, target = app, data = {}) {
    const button = { disabled: false, dataset: { action, ...data }, closest: () => button };
    document.dispatch('pointerdown', { target: button });
    target.dispatch('click', { target: button });
  }
  function advance(milliseconds) {
    const end = time + milliseconds;
    for (;;) {
      const task = Array.from(timers.values()).filter(t => t.next <= end).sort((a, b) => a.next - b.next || a.id - b.id)[0];
      if (!task) break;
      time = task.next;
      if (task.interval) task.next += Math.max(1, task.delay); else timers.delete(task.id);
      task.fn();
    }
    time = end;
  }
  return { app, dialog, nodes, mounts, transitions, gradeCalls, audioContexts, audioStarts, audioClips, pauses, timers, timerHistory,
    preloadContexts, publishPreload, get preloadStarted() { return preloadStarted; },
    click, advance, saved: () => JSON.parse(storage.get(KEY) || 'null'),
    suspendTimers(milliseconds) { time += milliseconds; for (const task of timers.values()) task.next = Math.max(task.next, time + (task.interval ? task.delay : 1)); },
    visibility(hidden) { document.hidden = hidden; document.dispatch('visibilitychange'); },
    pagehide(persisted) { windowTarget.dispatch('pagehide', { persisted }); },
    pageshow(persisted) { windowTarget.dispatch('pageshow', { persisted }); }
  };
}

test('whole app commits C1 before its next-tick transition and ignores duplicate or late conflicting results', async () => {
  const h = await appHarness(); h.click('resume'); const port = h.mounts[0];
  assert.equal(port.options.continuous, true); assert.equal(port.options.scene, 1);
  h.advance(800); assert.equal(h.saved().questionTimes['v7-c-pistol'], undefined, 'Loading must not count as playing');
  port.emitState('playing'); h.advance(500); port.complete(protocolFor(1));
  const sealed = h.saved(); assert.equal(sealed.index, 13); assert.equal(sealed.answers['v7-c-pistol'].points, 10);
  assert.equal(sealed.answers['v7-c-pistol'].seconds, 0.5); assert.equal(sealed.drafts['v7-c-pistol'], undefined);
  port.complete(protocolFor(1, 0));
  assert.deepEqual(h.saved().answers['v7-c-pistol'], sealed.answers['v7-c-pistol']);
  assert.deepEqual(h.gradeCalls, ['v7-c-pistol']);
  h.advance(99); assert.equal(h.saved().index, 13, 'Persisted result exists before the transition callback');
  h.advance(1);
  assert.equal(h.saved().index, 14); assert.deepEqual(h.transitions, [2]); assert.equal(h.mounts.length, 1);
  assert.equal(h.saved().questionTimes['v7-c-uzi'], undefined);
  port.complete(protocolFor(1, 0)); h.advance(1000);
  assert.equal(h.saved().index, 14, 'A late C1 protocol cannot complete the new C2');
  assert.equal(h.saved().answers['v7-c-uzi'], undefined);
  assert.deepEqual(h.saved().answers['v7-c-pistol'], sealed.answers['v7-c-pistol']);
  assert.deepEqual(h.gradeCalls, ['v7-c-pistol']);
});

test('whole app home cancels queued advance and restored completion is not played again', async () => {
  const h = await appHarness(); h.click('resume'); const port = h.mounts[0];
  port.complete(protocolFor(1)); const oldTick = h.timerHistory.findLast(t => t.interval && t.delay === 100).fn;
  h.click('home'); h.advance(5000); oldTick();
  assert.equal(h.saved().index, 13); assert.equal(port.destroyed, true); assert.deepEqual(h.transitions, []);
  const restored = await appHarness(h.saved()); restored.click('resume');
  assert.equal(restored.mounts.length, 0, 'Completed C1 is restored as a protocol, without an engine replay');
  restored.advance(99); assert.equal(restored.saved().index, 13);
  restored.advance(1);
  assert.equal(restored.saved().index, 14); assert.equal(restored.mounts.length, 1); assert.equal(restored.mounts[0].options.scene, 2);
  assert.deepEqual(restored.gradeCalls, []);
});

test('whole app modal, hidden tab and BFCache pause the current C3 handoff countdown', async () => {
  const edition = 13, last = content.E.buildTicket('flowcheck', edition).length - 1;
  const h = await appHarness(seedAttempt({ edition, index: last })); h.click('resume');
  h.mounts[0].complete(protocolFor(3, undefined, edition)); h.advance(500);
  const pending = () => { assert.equal(h.saved().index, last); assert.equal(h.saved().phase, 'question'); assert.equal(h.saved().finishedAt, null); };
  h.click('rules'); assert.equal(h.dialog.open, true); h.advance(60000); pending();
  h.click('close-modal', h.dialog); h.advance(400); pending();
  h.visibility(true); h.advance(60000); h.visibility(false); pending();
  h.pagehide(true); h.advance(60000); h.pageshow(true); pending();
  h.advance(600); pending(); h.advance(100);
  assert.equal(h.saved().phase, 'grading'); assert(h.saved().finishedAt);
  assert(h.app.innerHTML.includes('commission-screen'));
  assert.equal(h.saved().answers['v10-c-finale'].seconds, 0);
  assert.equal(h.saved().answers['v10-c-finale'].points, 14);
  assert.deepEqual(h.gradeCalls, ['v10-c-finale']);
});

test('whole app preserves an accepted result after a late runtime error', async () => {
  const h = await appHarness(); h.click('resume'); const port = h.mounts[0];
  port.complete(protocolFor(1)); const accepted = h.saved().answers['v7-c-pistol'];
  port.error(); assert.equal(port.destroyed, true); assert.equal(h.nodes.get('native-exam-error').hidden, true);
  h.advance(100);
  assert.deepEqual(h.saved().answers['v7-c-pistol'], accepted); assert.equal(h.saved().index, 14);
  assert.equal(h.mounts.length, 2); assert.equal(h.mounts[1].options.scene, 2); assert.equal(h.gradeCalls.length, 1);
});

test('whole app excludes genuinely suspended hidden/BFCache time from the accepted scene time', async () => {
  for (const boundary of ['visibility', 'bfcache']) {
    const h = await appHarness(); h.click('resume'); const port = h.mounts[0];
    port.emitState('playing'); h.advance(500);
    if (boundary === 'visibility') h.visibility(true); else h.pagehide(true);
    h.suspendTimers(60000);
    if (boundary === 'visibility') h.visibility(false); else h.pageshow(true);
    port.complete(protocolFor(1));
    assert.equal(h.saved().answers['v7-c-pistol'].seconds, 0.5, boundary + ' must not add a capped slice of the hidden minute');
  }
});

test('whole app only charges native playing state, excluding manual pause and finishing', async () => {
  const h = await appHarness(); h.click('resume'); const port = h.mounts[0];
  port.emitState('playing'); h.advance(500); port.emitState('paused'); h.advance(5000);
  port.emitState('playing'); h.advance(500); port.emitState('finishing'); h.advance(5000);
  port.complete(protocolFor(1));
  assert.equal(h.saved().answers['v7-c-pistol'].seconds, 1);
});

test('whole app requires an explicit visible error before technical skip and never skips following scenes', async () => {
  const h = await appHarness(); h.click('resume'); const port = h.mounts[0];
  h.click('native-skip'); assert.equal(h.saved().answers['v7-c-pistol'], undefined); assert.equal(h.saved().index, 13);
  port.error(); h.advance(10000); assert.equal(h.saved().index, 13); assert.equal(h.saved().answers['v7-c-pistol'], undefined);
  h.click('native-skip');
  assert.equal(h.saved().answers['v7-c-pistol'].value.skipped, true); assert.equal(h.saved().answers['v7-c-pistol'].points, 0);
  assert.equal(h.saved().index, 14); assert.equal(h.saved().answers['v7-c-uzi'], undefined); assert.equal(port.destroyed, true);
  h.advance(10000); assert.equal(h.saved().index, 14);
});

test('whole app enters C in legacy 8 and current 13, then hands every accepted scene to commission', async () => {
  for (const edition of [8, 13]) {
    const h = await appHarness(seedAttempt({ edition, seenFinal: false })); h.click('resume');
    assert.equal(h.mounts.length, 1); assert.equal(h.saved().nativeContinuous, true);
    assert.equal(h.saved().contentEdition, edition);
    assert.equal(h.saved().questionIds.length, edition === 13 ? 12 : 16);
    assert(!h.app.innerHTML.includes('practice-opening-shell'));
    const port = h.mounts[0];
    assert.equal(port.options.edition, edition);
    for (const number of [1, 2, 3]) {
      const before = h.saved().index;
      port.emitState('playing'); h.advance(200); port.complete(protocolFor(number, undefined, edition));
      assert(!h.app.innerHTML.includes('Экзамен сдан')); assert(!h.app.innerHTML.includes('checkpoint-score'));
      assert.equal(h.saved().index, before, 'Completion must be persisted before navigating');
      h.advance(number === 3 ? 1600 : 100);
      if (number < 3) assert.equal(h.saved().index, before + 1, 'C1 and C2 have no interstitial countdown');
    }
    const saved = h.saved();
    assert.equal(saved.phase, 'grading'); assert(saved.finishedAt); assert(h.app.innerHTML.includes('commission-screen'));
    assert.equal(saved.questionIds.slice(-3).reduce((sum, id) => sum + saved.answers[id].points, 0), 36);
    assert.equal(saved.questionIds.reduce((sum, id) => sum + saved.answers[id].points, 0), 100, 'Actual A/B/C content must total 100');
    assert.equal(h.mounts.length, 1); assert.deepEqual(h.transitions, [2, 3]); assert.equal(port.destroyed, true);
    assert.equal(h.audioStarts.length, 1); assert.equal(h.audioStarts[0], false, 'Scene changes must not restart background music');
    assert.deepEqual(h.gradeCalls, saved.questionIds.slice(-3));
  }
});

function freshTheoryAttempt() {
  const saved = seedAttempt({ edition: 14, index: 0, seenFinal: false });
  saved.completedCheckpoints = [];
  return saved;
}

function answerCurrentTheoryQuestion(h) {
  const saved = h.saved(), id = saved.questionIds[saved.index], q = content.byId[id];
  assert(['theory', 'field'].includes(q.section), 'This driver must not bypass the real native result protocol');
  if (q.section === 'theory') assert(h.app.innerHTML.includes('src="' + q.image + '"'), 'Every A question must display its actual image');
  if (q.type === 'order' && q.orderMode === 'tap') {
    for (const id of q.answerIds) h.click('order-tap', h.app, { id });
    assert.deepEqual(h.saved().drafts[id], copy(q.answerIds));
  } else if (q.type === 'order') {
    let order = copy(saved.drafts[id] || content.E.initialDraft(q, saved.variant));
    for (let target = 0; target < q.answerIds.length; target++) {
      let position = order.indexOf(q.answerIds[target]);
      while (position > target) {
        h.click('move', h.app, { position: String(position), direction: '-1' });
        order = h.saved().drafts[id]; position--;
      }
    }
    assert.deepEqual(order, copy(q.answerIds));
  } else {
    assert(['mcq', 'image', 'audio'].includes(q.type));
    h.click('choose', h.app, { id: q.answer });
  }
  h.click('submit');
  assert.equal(h.saved().answers[id]?.points, q.points, 'Real UI actions must persist the answer for ' + id);
  assert(h.app.innerHTML.includes('feedback ' + (q.section === 'theory' ? 'success' : 'accepted')));
  if (q.section === 'field') {
    assert(!h.app.innerHTML.includes('feedback-subtotal'), 'B must not disclose per-question scoring');
    assert(!h.app.innerHTML.includes(q.explanation), 'B explanation belongs to the final review');
  }
  return q;
}

function reachFieldCheckpoint(h) {
  for (let guard = 0; guard < 24; guard++) {
    const saved = h.saved();
    if (saved.phase === 'checkpoint' && saved.checkpointSection === 'field') return;
    if (saved.phase === 'checkpoint') h.click('checkpoint-next');
    else if (saved.phase === 'intro') h.click('stage-enter');
    else {
      assert(saved.index < 9, 'B must expose its checkpoint before opening C');
      if (!saved.answers[saved.questionIds[saved.index]]) answerCurrentTheoryQuestion(h);
      h.advance(321); h.click('next');
    }
  }
  assert.fail('Normal A/B UI did not reach the B checkpoint');
}

test('saved edition 14 warms from the painted cover and retains one hidden runtime through resume/A/B/C', async () => {
  const initial = freshTheoryAttempt(); initial.seenStages = [];
  const h = await appHarness(initial);
  assert.equal(h.mounts.length, 0); assert.equal(h.preloadStarted, false, 'Critical cover UI paints before optional loading');
  assert(!/Готовим город|Открыть полигон|\/rpg|ПРАКТИЧЕСКАЯ ЧАСТЬ/.test(h.app.innerHTML));
  h.advance(31); assert.equal(h.preloadStarted, false);
  h.advance(1); assert.equal(h.preloadStarted, true);
  assert(h.preloadContexts.some(value => value.screen === 'home' && value.entryReady && value.active && value.eager));
  assert.deepEqual(h.saved(), copy(initial), 'Preparing a saved city must not mutate its answer sheet');
  h.publishPreload({ status: 'loading', progress: 0.99 }); h.advance(1000);
  assert.equal(h.mounts.length, 0, 'A partial byte cache cannot claim a ready city');
  h.publishPreload({ status: 'complete', progress: 1 }); h.advance(350);
  assert.equal(h.mounts.length, 1);
  const port = h.mounts[0], host = port.host;
  assert.equal(port.options.warmup, true); assert.equal(port.options.muted, true); assert.equal(port.options.paused, false);
  assert.equal(host.inert, true); assert.equal(host.attributes['aria-hidden'], 'true');
  assert.equal(host.hidden, false, 'Warm renderer must retain a drawable surface');
  assert.equal(host.style.opacity, '0'); assert.equal(host.style.pointerEvents, 'none');
  assert(!/Готовим город|Город готов|data-practice-preload/.test(h.app.innerHTML));
  port.warmReady(); h.advance(1000);
  h.click('resume');
  assert.equal(h.saved().phase, 'intro'); assert.equal(h.preloadContexts.at(-1).screen, 'stage');
  assert.equal(h.preloadContexts.at(-1).section, 'theory');
  h.advance(1000); assert.equal(h.mounts.length, 1); h.click('stage-enter');
  assert.equal(h.saved().questionIds[0], 'v14-a-first-bmx');
  assert(h.preloadContexts.some(value => value.screen === 'question' && value.section === 'theory' && value.eager && value.active && !value.mediaBusy));
  assert.equal(port.activationCalls, 0); assert.equal(h.saved().answers['v10-c-explode'], undefined);
  assert.equal(h.saved().questionTimes['v10-c-explode'], undefined, 'Warm city must not run the C clock');
  answerCurrentTheoryQuestion(h);
  assert.equal(h.mounts.length, 1); assert.equal(h.nodes.get('native-exam-persistent'), host);
  assert.equal(port.destroyed, false); assert.equal(host.appendCount, 1);
  h.click('rules'); assert.equal(h.dialog.open, true); assert.equal(port.pauseHistory.at(-1), true);
  h.advance(2000); assert.equal(port.destroyed, false); assert.equal(port.activationCalls, 0);
  h.click('close-modal', h.dialog); h.advance(350);
  assert.equal(port.pauseHistory.at(-1), false);
  for (let index = 1; index <= 3; index++) {
    h.advance(321); h.click('next'); assert.equal(h.saved().index, index); answerCurrentTheoryQuestion(h);
  }
  h.advance(321); h.click('next');
  assert.equal(h.saved().checkpointSection, 'theory');
  assert(h.app.innerHTML.includes('aria-label="Часть A: 5 из 5 звёзд"'));
  assert.equal((h.app.innerHTML.match(/class="section-star" data-filled="true"/g) || []).length, 5);
  h.click('checkpoint-next');
  assert.equal(h.saved().index, 4); assert.equal(h.saved().phase, 'intro');
  const introBytes = h.preloadContexts.at(-1);
  assert.equal(introBytes.screen, 'stage', 'The B introduction must remain eligible for the real byte preloader');
  assert.equal(introBytes.section, 'field'); assert.equal(introBytes.active, true);
  assert.equal(introBytes.eager, true); assert.equal(introBytes.mediaBusy, false);
  h.advance(1000);
  assert.equal(h.mounts.length, 1); assert.equal(port.destroyed, false); assert.equal(port.activationCalls, 0);
  assert.equal(port.pauseHistory.at(-1), false, 'Reading B instructions must not suspend the prepared runtime');
  assert.equal(host.inert, true); assert.equal(host.style.opacity, '0');
  h.click('stage-enter');
  assert.equal(h.preloadContexts.at(-1).screen, 'question'); assert.equal(h.preloadContexts.at(-1).section, 'field');
  reachFieldCheckpoint(h);
  assert.equal(h.saved().index, 8); assert.equal(h.saved().checkpointSection, 'field');
  assert(h.app.innerHTML.includes('40 из 40 баллов за часть B'));
  assert(h.app.innerHTML.includes('aria-label="Часть B: 5 из 5 звёзд"'));
  assert(h.app.innerHTML.includes('64 / 64')); assert(h.app.innerHTML.includes('Открыть часть C'));
  assert(!/Открыть полигон|Готовим город|Взрыв|РПГ|\/rpg/.test(h.app.innerHTML));
  assert.equal(h.mounts.length, 1); assert.equal(port.activationCalls, 0); assert.equal(port.destroyed, false);
  assert.deepEqual(h.audioClips.filter(clip => clip.options.autoplay).map(clip => clip.id), ['v14-b-vice-radio', 'v12-b-2']);
  h.click('checkpoint-next');
  assert.equal(h.saved().index, 9); assert.equal(h.saved().nativeContinuous, true);
  assert.equal(h.mounts.length, 1); assert.equal(port.activationCalls, 1);
  assert.equal(h.nodes.get('native-exam-persistent'), host); assert.equal(host.appendCount, 1, 'No iframe reparent on reveal');
  assert.equal(host.inert, false); assert.equal(host.style.opacity, '1'); assert.equal(host.style.pointerEvents, 'auto');
  assert.equal(port.destroyCalls, 0); h.advance(500);
  assert.equal(h.saved().questionTimes['v10-c-explode'], undefined, 'Briefing is not gameplay time');
  port.emitState('playing'); h.advance(500); port.complete(protocolFor(1, undefined, 14)); h.advance(100);
  assert.equal(h.saved().answers['v10-c-explode'].points, content.byId['v10-c-explode'].points); assert.equal(h.saved().answers['v10-c-explode'].seconds, 0.5);
  assert.equal(h.saved().index, 10); assert.equal(h.mounts.length, 1); assert.equal(port.activationCalls, 1);
  for (const number of [2, 3]) {
    port.emitState('playing'); h.advance(200); port.complete(protocolFor(number, undefined, 14));
    assert(!h.app.innerHTML.includes('checkpoint-score'), 'C scores stay sealed through all three scenes');
    assert(!h.app.innerHTML.includes('section-rating'), 'No C rating leaks between native scenes');
    h.advance(number === 3 ? 1600 : 100);
  }
  const completed = h.saved();
  assert.equal(completed.phase, 'grading'); assert(completed.finishedAt); assert(h.app.innerHTML.includes('commission-screen'));
  assert.equal(completed.questionIds.reduce((sum, id) => sum + completed.answers[id].points, 0), 100);
  assert.equal(h.mounts.length, 1); assert.equal(port.activationCalls, 1); assert.equal(port.destroyCalls, 1);
  assert.deepEqual(h.transitions, [2, 3]);
  assert(!h.app.innerHTML.includes('result-section-ratings'), 'The commission must finish before showing C stars');
  h.advance(250);
  assert(h.app.innerHTML.includes('result-section-ratings'));
  assert(h.app.innerHTML.includes('Часть C: 5 из 5 звёзд'));
});

test('A/B checkpoint stars use the full section maximum even when saved answers are incomplete', async () => {
  for (const [section, letter, index, points] of [['theory', 'A', 3, 18], ['field', 'B', 8, 32]]) {
    for (const empty of [false, true]) {
      const saved = seedAttempt({ edition: 15, index });
      saved.phase = 'checkpoint'; saved.checkpointSection = section;
      if (empty) for (const id of saved.questionIds.filter(id => content.byId[id].section === section)) delete saved.answers[id];
      const before = copy(saved.answers), h = await appHarness(saved); h.click('resume');
      const expected = empty ? 1 : 4;
      assert(h.app.innerHTML.includes('aria-label="Часть ' + letter + ': ' + expected + ' из 5 звёзд"'));
      assert.equal((h.app.innerHTML.match(/class="section-star" data-filled="true"/g) || []).length, expected);
      assert.equal((h.app.innerHTML.match(/class="section-star" data-filled="false"/g) || []).length, 5 - expected);
      assert(h.app.innerHTML.includes((empty ? 0 : points) + ' из ' + content.E.sections[section].max + ' баллов'));
      assert.deepEqual(h.saved().answers, before, 'Rating is a view of saved points, never a score mutation');
      assert.equal((h.app.innerHTML.match(/data-action="checkpoint-next"/g) || []).length, 1);
    }
  }
});

test('one ordinary standalone-C link resolves under root or a nested base without starting an attempt', async () => {
  const h = await appHarness(null);
  const links = [...h.app.innerHTML.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>Практика C отдельно<\/a>/g)];
  assert.equal(links.length, 1); const href = links[0][1];
  assert.equal(href, 'rpg/'); assert(!links[0][0].includes('data-action'));
  for (const [base, expected] of [['https://flow.test/', '/rpg/'], ['https://flow.test/dist/index.html', '/dist/rpg/'], ['https://flow.test/exam/', '/exam/rpg/']]) {
    assert.equal(new URL(href, base).pathname, expected);
  }
  const standalone = fs.readFileSync(path.join(DIST, href, 'index.html'), 'utf8');
  assert(standalone.includes('vice-playtest.js')); assert(!/src="app\.js/.test(standalone));
  h.advance(32); h.publishPreload({ status: 'complete', progress: 1 }); h.advance(350);
  assert.equal(h.mounts.length, 1); assert.equal(h.saved(), null);
  h.click('mode', h.app, { mode: 'exam' }); h.advance(350);
  assert.equal(h.mounts.length, 1, 'Adding the standalone link must not disturb the existing entry warm host');
  h.pagehide(false); assert.equal(h.mounts[0].destroyCalls, 1); assert.equal(h.saved(), null);
});

test('fresh edition 15 entry has no attempt, stays muted and transfers the same host through Start and real A/B into C', async () => {
  const h = await appHarness(null);
  assert.equal(h.saved(), null); assert.equal(h.preloadStarted, false);
  h.advance(32); assert.equal(h.preloadStarted, true);
  h.publishPreload({ status: 'complete', progress: 1 }); h.advance(350);
  assert.equal(h.mounts.length, 1); const port = h.mounts[0], host = port.host;
  assert.equal(port.options.edition, 15); assert.equal(port.options.scene, 1);
  assert.equal(port.options.warmup, true); assert.equal(port.options.muted, true);
  assert.equal(h.saved(), null, 'Entry warming must never create an exam attempt or a score');
  assert.equal(h.audioStarts.length, 0, 'Silent cover preparation must not trigger user music');
  assert.equal(host.style.opacity, '0'); assert.equal(host.inert, true); assert.equal(host.appendCount, 1);
  assert(!/Готовим город|Город готов|data-practice-preload|Открыть полигон|Взрыв|РПГ/.test(h.app.innerHTML));
  h.click('mode', h.app, { mode: 'exam' });
  h.click('music-toggle'); h.click('music-toggle');
  assert(port.muteHistory.every(Boolean), 'Changing background music must not unmute the hidden game');
  assert.equal(h.saved(), null); assert.equal(h.mounts.length, 1);
  h.visibility(true); assert.equal(port.pauseHistory.at(-1), true);
  h.advance(2000); assert.equal(port.activationCalls, 0);
  h.visibility(false); h.advance(350); assert.equal(port.pauseHistory.at(-1), false);
  h.pagehide(true); assert.equal(port.pauseHistory.at(-1), true);
  h.pageshow(true); h.advance(350); assert.equal(port.destroyCalls, 0);
  h.click('start'); assert.equal(h.saved().contentEdition, 15); assert.equal(h.saved().phase, 'intro');
  assert.equal(h.mounts.length, 1); assert.equal(h.nodes.get('native-exam-persistent'), host);
  port.warmReady(); h.advance(1000);
  assert.equal(port.destroyCalls, 0); assert.equal(port.activationCalls, 0);
  h.click('stage-enter'); reachFieldCheckpoint(h);
  assert.equal(h.saved().questionIds.slice(0, 9).reduce((sum, id) => sum + h.saved().answers[id].points, 0), 64);
  assert.equal(h.mounts.length, 1); assert.equal(host.appendCount, 1); assert.equal(port.activationCalls, 0);
  h.click('checkpoint-next');
  assert.equal(h.saved().index, 9); assert.equal(h.mounts.length, 1); assert.equal(port.activationCalls, 1);
  assert.equal(h.nodes.get('native-exam-persistent'), host); assert.equal(host.appendCount, 1);
  assert.equal(host.style.opacity, '1'); assert.equal(host.inert, false);
  assert.equal(port.muteHistory.at(-1), false, 'Only explicit C activation may restore the enabled game sound');
  assert.equal(h.saved().answers['v10-c-explode'], undefined, 'Warming cannot award gameplay points');
});

test('completed results, legacy A/B and saved C do not start an unnecessary entry city', async () => {
  const completed = seedAttempt({ edition: 15, index: 11 });
  completed.finishedAt = '2026-11-16T00:00:00.000Z'; completed.phase = 'result';
  const legacy = seedAttempt({ edition: 13, index: 0 });
  const savedC = seedAttempt({ edition: 15, index: 9 });
  for (const saved of [completed, legacy, savedC]) {
    const h = await appHarness(saved); h.publishPreload({ status: 'complete', progress: 1 }); h.advance(5000);
    assert.equal(h.mounts.length, 0); assert.equal(h.preloadStarted, false);
    assert.deepEqual(h.saved(), copy(saved), 'Entry must not rewrite the restored answer sheet');
  }
});

test('an entry warm error stays invisible and transfers to one explicit foreground recovery after A/B', async () => {
  const h = await appHarness(null); h.advance(32); h.publishPreload({ status: 'complete', progress: 1 }); h.advance(350);
  const warm = h.mounts[0], cover = h.app.innerHTML;
  warm.error(); assert.equal(warm.destroyCalls, 1); assert.equal(h.saved(), null);
  assert.equal(h.app.innerHTML, cover); assert.equal(h.nodes.has('native-exam-persistent'), false);
  h.click('start'); h.advance(3000); assert.equal(h.mounts.length, 1, 'A failed entry lease must not retry during the first introduction');
  h.click('stage-enter'); reachFieldCheckpoint(h);
  assert.equal(h.mounts.length, 1); assert.equal(h.saved().questionIds.slice(0, 9).reduce((sum, id) => sum + h.saved().answers[id].points, 0), 64);
  h.click('checkpoint-next'); assert.equal(h.mounts.length, 2);
  const foreground = h.mounts[1]; assert.notEqual(foreground.options.warmup, true);
  assert.equal(foreground.options.scene, 1); assert.equal(h.nodes.get('native-exam-error').hidden, true);
  warm.options.onWarmReady(); warm.options.onError('late entry callback');
  assert.equal(foreground.destroyed, false);
});

test('edition 14 contains a warm failure during A and starts C normally after the same completed test', async () => {
  const h = await appHarness(freshTheoryAttempt()); h.click('resume');
  h.publishPreload({ status: 'complete', progress: 1 }); h.advance(350);
  const warm = h.mounts[0], before = h.app.innerHTML;
  warm.error();
  assert.equal(warm.destroyCalls, 1); assert.equal(h.nodes.has('native-exam-persistent'), false);
  assert.equal(h.app.innerHTML, before, 'A background startup error must not replace or interrupt the test UI');
  assert.equal(h.saved().index, 0); assert.deepEqual(h.saved().answers, {});
  warm.options.onWarmReady(); warm.options.onState({ scene: 1, stage: 'warmed' });
  h.advance(3000); assert.equal(h.mounts.length, 1, 'Failed warmup does not loop in the same attempt');
  reachFieldCheckpoint(h); h.click('checkpoint-next');
  assert.equal(h.mounts.length, 2); const cold = h.mounts[1];
  assert.notEqual(cold.options.warmup, true); assert.equal(cold.options.edition, 14);
  assert.equal(cold.activationCalls, 0); assert.equal(h.nodes.get('native-exam-error').hidden, true);
  assert.equal(h.saved().questionIds.slice(0, 9).reduce((sum, id) => sum + h.saved().answers[id].points, 0), 64);
  assert.equal(h.saved().answers['v10-c-explode'], undefined, 'Failure must never fabricate a C result');
});

test('A/B home return preserves its parked city; restarting a different edition gets a fresh isolated owner', async () => {
  const h = await appHarness(freshTheoryAttempt()); h.click('resume');
  h.publishPreload({ status: 'complete', progress: 1 }); h.advance(350);
  const old = h.mounts[0]; old.warmReady();
  h.click('home');
  assert.equal(old.destroyCalls, 0); assert.equal(h.nodes.get('native-exam-persistent'), old.host);
  h.advance(2000); assert.equal(h.mounts.length, 1); assert(h.app.innerHTML.includes('home-page'));
  h.click('start'); assert.equal(h.dialog.open, true); h.click('force-start', h.dialog);
  const next = h.saved(); assert.notEqual(next.variant, 'flowcheck'); assert.equal(next.contentEdition, 15);
  assert.equal(next.phase, 'intro'); assert.equal(old.destroyCalls, 1); h.advance(1000);
  assert.equal(h.mounts.length, 2); const fresh = h.mounts[1];
  assert.notEqual(fresh.host, old.host); assert.equal(fresh.destroyed, false); assert.equal(fresh.activationCalls, 0);
  old.options.onWarmReady(); old.options.onState({ scene: 1, stage: 'error' }); old.options.onError('late old error');
  assert.equal(fresh.destroyed, false); assert.equal(h.saved().index, 0); assert.deepEqual(h.saved().answers, {});
  assert.equal(h.nodes.get('native-exam-persistent'), fresh.host); assert.equal(old.destroyCalls, 1);
});

test('edition 14 can reach C before cache completion without blocking the test or pretending warm readiness', async () => {
  const h = await appHarness(freshTheoryAttempt()); h.click('resume');
  h.publishPreload({ status: 'loading', progress: 0.4 });
  reachFieldCheckpoint(h);
  assert.equal(h.mounts.length, 0); assert(!/Готовим город|40%|data-practice-preload/.test(h.app.innerHTML));
  h.click('checkpoint-next');
  assert.equal(h.mounts.length, 1); assert.notEqual(h.mounts[0].options.warmup, true);
  assert.equal(h.mounts[0].options.scene, 1); assert.equal(h.saved().index, 9);
  h.publishPreload({ status: 'complete', progress: 1 }); h.advance(2000);
  assert.equal(h.mounts.length, 1, 'Late cache completion cannot mount a second hidden runtime over C');
  assert.equal(h.saved().answers['v10-c-explode'], undefined);
});

test('edition 14 retries a failed warm handoff once, preserving A/B before exposing an ordinary foreground error', async () => {
  const h = await appHarness(freshTheoryAttempt()); h.click('resume');
  h.publishPreload({ status: 'complete', progress: 1 }); h.advance(350);
  const warm = h.mounts[0]; warm.warmReady();
  reachFieldCheckpoint(h); h.click('checkpoint-next');
  assert.equal(warm.activationCalls, 1); assert.equal(h.mounts.length, 1);
  warm.error();
  assert.equal(warm.destroyCalls, 1); assert.equal(h.mounts.length, 2);
  const cold = h.mounts[1]; assert.notEqual(cold.options.warmup, true);
  assert.equal(h.saved().index, 9); assert.equal(h.nodes.get('native-exam-error').hidden, true);
  cold.error(); h.advance(2000);
  assert.equal(h.mounts.length, 2, 'A foreground failure must not cause an infinite hidden retry loop');
  assert.equal(h.nodes.get('native-exam-error').hidden, false);
  assert.equal(h.saved().questionIds.slice(0, 9).reduce((sum, id) => sum + h.saved().answers[id].points, 0), 64);
  assert.equal(h.saved().answers['v10-c-explode'], undefined);
});
