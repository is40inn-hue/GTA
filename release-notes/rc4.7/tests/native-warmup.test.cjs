'use strict';

// Independent coordinator contract checks. These execute production scheduling
// and ownership code; ports are inert fixtures, not a WASM/GPU/gameplay claim.
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../dist/native-warmup.js');

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, extra = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ type, ...extra }); }
}

function fixture({ memory = 8, connection = '4g', saveData = false, idle = true, throwPrepare = false, syncError = false } = {}) {
  let time = 0, timerId = 0, pendingInput = false, idleBudget = 20, idleTimedOut = false;
  const timers = new Map(), ports = [], discarded = [], states = [], attempts = [];
  const root = new Events(), doc = new Events(), net = new Events();
  Object.assign(doc, { hidden: false, visibilityState: 'visible' });
  Object.assign(net, { effectiveType: connection, saveData });
  Object.assign(root, {
    document: doc,
    navigator: { onLine: true, deviceMemory: memory, connection: net, scheduling: { isInputPending: () => pendingInput } },
    Date: { now: () => time },
    performance: { now: () => time },
    setTimeout: (fn, delay = 0) => { const id = ++timerId; timers.set(id, { at: time + Math.max(1, delay), fn }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  if (idle) {
    root.requestIdleCallback = fn => root.setTimeout(() => fn({ didTimeout: idleTimedOut, timeRemaining: () => idleBudget }), 1);
    root.cancelIdleCallback = root.clearTimeout;
  }
  const controller = create(root, {
    prepare: options => {
      attempts.push(options);
      if (throwPrepare) throw new Error('fixture startup unavailable');
      const port = {
        options, stage: 'engine', pauses: [], activations: 0, starts: 0, destroyed: 0,
        getState() { return { stage: this.stage, scene: 1, engine: 'vice-city-wasm', version: 3 }; },
        setPaused(value) { this.pauses.push(value); },
        activate() { this.activations++; },
        startScene() { this.starts++; },
        destroy() { this.destroyed++; }
      };
      ports.push(port);
      if (syncError) options.onError('synchronous fixture error');
      return port;
    },
    discard: port => { discarded.push(port); port.destroy(); },
    onState: state => states.push(state)
  });
  const owner = { contentEdition: 14, variant: 'warm-test' };
  let context = { owner, screen: 'question', section: 'theory', active: true, mediaBusy: false, started: true };
  function setContext(changes = {}) { context = { ...context, ...changes }; controller.setContext(context); }
  function advance(ms) {
    const until = time + ms;
    for (let count = 0; count < 10000; count++) {
      const next = [...timers.entries()].filter(([, item]) => item.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) { time = until; return; }
      time = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    throw new Error('Coordinator scheduling did not yield');
  }
  function completeBytes() { controller.setPreload({ status: 'complete', cacheAvailable: true, progress: 1, loadedBytes: 100, totalBytes: 100 }); }
  function ready(port = ports[ports.length - 1]) { port.stage = 'warmed'; port.options.onWarmReady({ scene: 1 }); }
  function start() { setContext(); completeBytes(); advance(500); assert.equal(ports.length, 1); return ports[0]; }
  return { root, doc, net, controller, owner, ports, discarded, states, attempts, timers, setContext, advance, completeBytes, ready, start,
    input(value) { pendingInput = value; },
    idleDeadline(budget, timedOut) { idleBudget = budget; idleTimedOut = timedOut; },
    hide(value) { doc.hidden = value; doc.visibilityState = value ? 'hidden' : 'visible'; doc.emit('visibilitychange'); }
  };
}

test('warm coordinator waits for the first A question and verified byte completion', () => {
  const h = fixture();
  h.completeBytes(); h.setContext({ screen: 'home', started: false }); h.advance(5000);
  assert.equal(h.ports.length, 0);
  h.setContext({ screen: 'intro', started: false }); h.advance(5000);
  assert.equal(h.ports.length, 0);
  h.controller.setPreload({ status: 'loading', cacheAvailable: true, progress: .99 });
  h.setContext({ screen: 'question', started: true }); h.advance(5000);
  assert.equal(h.ports.length, 0, '99 percent of bytes is not a prepared city');
  h.completeBytes(); h.advance(500);
  assert.equal(h.ports.length, 1);
  assert.equal(h.controller.getState().status, 'preparing');
  assert.equal(h.ports[0].activations + h.ports[0].starts, 0);
  h.ready(); assert.equal(h.controller.getState().status, 'ready');
  h.controller.destroy();
});

test('entry warm waits for the painted-cover gate and transfers one preparing city to a real attempt', () => {
  const h = fixture(), entryOwner = { contentEdition: 15 };
  h.completeBytes();
  h.setContext({ owner: entryOwner, screen: 'home', section: '', started: true, entryReady: false });
  h.advance(3000); assert.equal(h.ports.length, 0);
  h.setContext({ entryReady: true }); h.advance(349); assert.equal(h.ports.length, 0);
  h.advance(10); assert.equal(h.ports.length, 1);
  const port = h.ports[0], attempt = { contentEdition: 15, variant: 'actual' };
  assert.equal(h.controller.transferOwner({ ...entryOwner }, attempt), false);
  assert.equal(h.controller.transferOwner(entryOwner, attempt), true);
  h.setContext({ owner: attempt, screen: 'intro', section: 'theory', entryReady: false });
  h.advance(500); h.ready(port);
  assert.equal(h.controller.getState().status, 'ready', 'The original onWarmReady callback survives ownership transfer');
  assert.equal(h.ports.length, 1); assert.equal(h.discarded.length, 0);
  assert.equal(h.controller.adopt(entryOwner), null);
  assert.equal(h.controller.adopt(attempt), port);
  assert.equal(h.controller.transferOwner(attempt, entryOwner), false, 'Adopted runtime belongs exclusively to the foreground');
  h.controller.destroy(); assert.equal(port.destroyed, 0);
});

test('entry failure transfers its failed lease without silently retrying in A', () => {
  const h = fixture(), entryOwner = { contentEdition: 15 };
  h.setContext({ owner: entryOwner, screen: 'home', section: '', entryReady: true }); h.completeBytes(); h.advance(500);
  const port = h.ports[0]; port.options.onError('GPU unavailable');
  assert.equal(h.controller.transferOwner(entryOwner, h.owner), true);
  h.setContext({ owner: h.owner, screen: 'question', section: 'theory', entryReady: false }); h.advance(10000);
  assert.equal(h.ports.length, 1); assert.equal(port.destroyed, 1);
  assert.equal(h.controller.getState().reason, 'warm-failed');
  assert.equal(h.controller.adopt(h.owner), null, 'Explicit C opening retains the ordinary foreground recovery path');
  h.controller.destroy();
});

test('input postpones boot, including pending input in an idle callback', () => {
  const h = fixture(); h.setContext(); h.completeBytes();
  h.advance(300); h.doc.emit('pointerdown'); h.advance(349);
  assert.equal(h.ports.length, 0);
  h.input(true); h.advance(2000);
  assert.equal(h.ports.length, 0, 'Idle timeout cannot override pending input');
  h.input(false); h.advance(1000);
  assert.equal(h.ports.length, 1);
  h.controller.destroy();
});

test('same attempt keeps one port across answer rerenders, A checkpoint and B', () => {
  const h = fixture(), port = h.start();
  h.setContext(); h.advance(500);
  h.setContext({ screen: 'checkpoint' }); h.advance(500);
  h.setContext({ screen: 'intro', section: 'field' }); h.advance(500);
  h.setContext({ screen: 'question', section: 'field' }); h.advance(500);
  assert.equal(h.ports.length, 1); assert.equal(h.discarded.length, 0);
  assert.equal(port.activations + port.starts, 0, 'Only the foreground owner may activate gameplay');
  h.controller.destroy(); assert.equal(port.destroyed, 1);
});

test('input during native preparation yields and does not resume over a media pause', () => {
  const h = fixture(), port = h.start();
  h.doc.emit('pointerdown'); assert.equal(port.pauses.at(-1), true);
  h.advance(300); h.doc.emit('keydown'); h.advance(349);
  assert.equal(port.pauses.at(-1), true, 'Each fresh input renews the quiet interval');
  h.setContext({ mediaBusy: true }); h.advance(2000);
  assert.equal(port.pauses.at(-1), true, 'Input timer cannot overrule a media pause');
  h.setContext({ mediaBusy: false }); assert.equal(port.pauses.at(-1), false);
  assert.equal(h.ports.length, 1); assert.equal(h.discarded.length, 0);
  h.controller.destroy();
});

test('window blur suspends warm even if document stays visible; focus allows a quiet return', () => {
  const h = fixture(), port = h.start();
  h.root.emit('blur'); assert.equal(h.doc.hidden, false); assert.equal(port.pauses.at(-1), true);
  h.advance(10000); assert.equal(port.pauses.at(-1), true);
  h.root.emit('focus'); h.advance(349); assert.equal(port.pauses.at(-1), true);
  h.advance(10); assert.equal(port.pauses.at(-1), false);
  h.controller.destroy();
});

test('an expired idle callback with no budget cannot force a heavy native boot', () => {
  const h = fixture(); h.idleDeadline(0, true); h.setContext(); h.completeBytes(); h.advance(5000);
  assert.equal(h.ports.length, 0);
  h.idleDeadline(15, false); h.advance(1000); assert.equal(h.ports.length, 1);
  h.controller.destroy();
});

test('question media, hidden page and inactive Telegram suspend preparation without recreation', () => {
  const h = fixture(), port = h.start();
  h.setContext({ mediaBusy: true }); assert.equal(port.pauses.at(-1), true);
  h.advance(2000); assert.equal(h.ports.length, 1);
  h.setContext({ mediaBusy: false }); assert.equal(port.pauses.at(-1), false);
  h.hide(true); assert.equal(port.pauses.at(-1), true);
  h.setContext({ active: false }); h.hide(false);
  assert.equal(port.pauses.at(-1), true, 'Visibility cannot override Telegram inactivity');
  h.setContext({ active: true }); assert.equal(port.pauses.at(-1), false);
  assert.equal(h.ports.length, 1);
  h.controller.destroy();
});

for (const [name, settings] of [
  ['low memory', { memory: 2 }], ['save data', { saveData: true }], ['2g', { connection: '2g' }]
]) test('warm coordinator defers heavy startup on ' + name, () => {
  const h = fixture(settings); h.setContext(); h.completeBytes(); h.advance(10000);
  assert.equal(h.ports.length, 0); assert.equal(h.controller.adopt(h.owner), null);
  h.controller.destroy();
});

test('offline blocks initial warm and a later connection change can resume safely', () => {
  const h = fixture(); h.root.navigator.onLine = false; h.setContext(); h.completeBytes(); h.advance(1000);
  assert.equal(h.ports.length, 0);
  h.root.navigator.onLine = true; h.root.emit('online'); h.advance(1000);
  assert.equal(h.ports.length, 1);
  h.net.saveData = true; h.net.emit('change'); assert.equal(h.ports[0].pauses.at(-1), true);
  h.controller.destroy();
});

test('owner replacement discards the former port once and ignores every stale callback', () => {
  const h = fixture(), old = h.start();
  const nextOwner = { contentEdition: 14, variant: 'replacement' };
  h.setContext({ owner: nextOwner }); h.advance(500);
  assert.equal(h.ports.length, 2); assert.equal(old.destroyed, 1);
  const current = h.ports[1], state = h.controller.getState();
  old.options.onWarmReady(); old.options.onError('late error'); old.options.onState({ stage: 'error' });
  assert.deepEqual(h.controller.getState(), state);
  assert.equal(current.destroyed, 0); assert.equal(h.discarded.length, 1);
  h.ready(current); assert.equal(h.controller.getState().status, 'ready');
  h.controller.destroy(); assert.equal(current.destroyed, 1);
});

test('adopt transfers the same preparing port and gives up every disposal or activation right', () => {
  const h = fixture(), port = h.start();
  assert.equal(h.controller.adopt({ ...h.owner }), null, 'Value-equal attempts do not own the lease');
  assert.equal(h.controller.adopt(h.owner), port);
  assert.equal(h.controller.getState().status, 'adopted');
  assert.equal(h.controller.adopt(h.owner), null);
  port.options.onWarmReady(); port.options.onError('late error'); port.options.onState({ stage: 'error' });
  h.setContext({ active: false, screen: 'home' }); h.controller.reset(); h.controller.destroy(); h.advance(10000);
  assert.equal(port.destroyed, 0); assert.equal(h.discarded.length, 0);
  assert.equal(port.activations + port.starts, 0);
});

test('warm failures are silent to the exam, dispose once and do not retry for the same owner', () => {
  const h = fixture(), port = h.start();
  port.options.onError('fixture GPU unavailable');
  assert.equal(port.destroyed, 1); assert.equal(h.controller.getState().reason, 'warm-failed');
  h.completeBytes(); h.setContext(); h.advance(10000);
  port.options.onWarmReady(); assert.equal(h.ports.length, 1);
  assert.equal(h.controller.getState().reason, 'warm-failed');
  assert.equal(h.controller.adopt(h.owner), null, 'Foreground can perform its ordinary launch/error UI');
  h.controller.destroy(); assert.equal(port.destroyed, 1);
});

test('a synchronous startup failure is contained and its partially created port is cleaned', () => {
  const h = fixture({ syncError: true });
  h.setContext(); h.completeBytes(); assert.doesNotThrow(() => h.advance(500));
  assert.equal(h.ports.length, 1); assert.equal(h.ports[0].destroyed, 1);
  h.setContext(); h.advance(5000); assert.equal(h.attempts.length, 1);
  h.controller.destroy();
  const throwing = fixture({ throwPrepare: true });
  throwing.setContext(); throwing.completeBytes(); assert.doesNotThrow(() => throwing.advance(500));
  assert.equal(throwing.controller.getState().reason, 'warm-failed');
  throwing.advance(10000); assert.equal(throwing.attempts.length, 1); throwing.controller.destroy();
});

test('reset cancels pending scheduling and stale ready cannot resurrect disposed work', () => {
  const h = fixture(); h.setContext(); h.completeBytes(); h.advance(100); h.controller.reset(); h.advance(5000);
  assert.equal(h.ports.length, 0);
  h.setContext(); h.advance(500); const port = h.ports[0]; assert(port);
  h.controller.reset(); port.options.onWarmReady(); port.options.onError('late');
  assert.equal(h.controller.getState().status, 'idle'); assert.equal(port.destroyed, 1);
  h.controller.destroy();
  h.setContext(); h.completeBytes(); h.advance(10000); assert.equal(h.ports.length, 1);
});

test('Safari-style scheduling without requestIdleCallback still honors quiet input and lifecycle', () => {
  const h = fixture({ idle: false }); delete h.root.navigator.deviceMemory; h.setContext(); h.completeBytes();
  h.advance(349); assert.equal(h.ports.length, 0);
  h.advance(100); assert.equal(h.ports.length, 1); h.ready();
  const state = h.controller.getState(); state.status = 'tampered'; assert.equal(h.controller.getState().status, 'ready');
  h.controller.destroy();
});

test('RC4.7 fully retained session bytes can prepare one city without persistent CacheStorage',()=>{
  const h=fixture({idle:false});h.setContext();
  h.controller.setPreload({status:'complete',cacheAvailable:false,preparedAvailable:true,progress:1,loadedBytes:100,totalBytes:100});
  h.advance(500);assert.equal(h.ports.length,1);
  const port=h.ports[0];h.ready();assert.equal(h.controller.getState().status,'ready');
  assert.equal(h.controller.adopt(h.owner),port);
  h.controller.destroy();assert.equal(port.destroyed,0);
});

test('RC4.7 3G can prepare the city after all bytes are retained, without bypassing save-data',()=>{
  const h=fixture({connection:'3g'});h.setContext();
  h.controller.setPreload({status:'loading',cacheAvailable:true,progress:.99});
  h.advance(3000);assert.equal(h.ports.length,0);
  h.completeBytes();h.advance(500);assert.equal(h.ports.length,1);
  h.net.saveData=true;h.net.emit('change');assert.equal(h.ports[0].pauses.at(-1),true);
  h.controller.destroy();
});
