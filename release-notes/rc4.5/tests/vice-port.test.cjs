'use strict';

// VM contract checks for our loader/input bridge. This never compiles or runs
// WebAssembly and is not native Vice City boot, graphics or gameplay QA.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const { resolveObjectURL } = require('node:buffer');

const ROOT = path.resolve(__dirname, '../dist/native-vc');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SOURCE = fs.readFileSync(path.join(ROOT, 'native.js'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'range-v8-config.json'), 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'runtime/manifest.json'), 'utf8'));
const ORIGIN = 'https://native-contract.test';
const HREF = ORIGIN + '/native-vc/index.html?session=vm-contract&scene=1&exam=1';
const SESSION = 'vm-contract';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
// Seed only the real native definition/directory files required by startup
// installers. The remaining package, engine and physics remain unexecuted.
const BASE_FILES = (() => {
  const pack=Buffer.concat(MANIFEST.data.chunks.map(part=>fs.readFileSync(path.join(ROOT,'runtime',part.path))));
  const glue=fs.readFileSync(path.join(ROOT,'runtime/index.js'),'utf8');
  return new Map(Array.from(glue.matchAll(/\{"filename": [^}]+\}/g),m=>JSON.parse(m[0]))
    .filter(e=>e.filename.endsWith('/default.ide')||e.filename.endsWith('/gta3.dir'))
    .map(e=>[e.filename,Buffer.from(pack.subarray(e.start,e.end))]));
})();

function makeHarness({ corruptScene = false, webgl2 = true, stallManifest = false, missingModel = false, legacy = false, edition = 8, continuous = false, examMode = true, warmup = false } = {}) {
  const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, legacy ? 'range-legacy-config.json' : edition === 9 ? 'range-v9-config.json' : edition >= 10 ? 'range-config.json' : 'range-v8-config.json'), 'utf8'));
  let clock = 1000, nextTimer = 0;
  const timers = new Map(), nodes = new Map(), scripts = [], messages = [], mouseEvents = [], requests = [], logs = [], graphicsRequests = [];
  let finishManifest = null, fileActivity = null;
  let windowNode;
  class FakeEvent {
    constructor(type, options = {}) { this.type = type; Object.assign(this, options); this.defaultPrevented = false; this.stopped = false; }
    preventDefault() { this.defaultPrevented = true; }
    stopImmediatePropagation() { this.stopped = true; }
    stopPropagation() { this.stopped = true; }
  }
  class Target {
    constructor(id = '', tag = '') {
      this.id = id; this.tagName = tag.toUpperCase(); this.listeners = new Map(); this.dataset = {};
      this.style = {}; this.attributes = new Map(); this.hidden = false; this.disabled = false; this.textContent = '';
    }
    addEventListener(type, fn, capture = false) {
      const list = this.listeners.get(type) || []; list.push({ fn, capture: !!capture }); this.listeners.set(type, list);
    }
    invoke(event, capture) {
      for (const listener of this.listeners.get(event.type) || []) {
        if (event.stopped) break;
        if (listener.capture === capture) listener.fn(event);
      }
    }
    dispatchEvent(event) {
      event.target ||= this;
      if (this !== windowNode) windowNode.invoke(event, true);
      if (!event.stopped) this.invoke(event, true);
      if (!event.stopped) this.invoke(event, false);
      if (this !== windowNode && event.bubbles && !event.stopped) windowNode.invoke(event, false);
      return !event.defaultPrevented;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name); }
    setPointerCapture() {}
    focus() { document.activeElement = this; }
    closest() { return this.tagName === 'BUTTON' || this.tagName === 'A' ? this : null; }
  }
  windowNode = new Target('window');
  const document = new Target('document');
  document.hidden = false;
  document.body = new Target('body', 'body');
  document.body.dataset.stateMenu = '1';
  document.body.appendChild = node => { scripts.push(node); return node; };
  for (const [, tag, id] of HTML.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bid="([^"]+)"/g)) nodes.set(id, new Target(id, tag));
  document.getElementById = id => nodes.get(id) || null;
  document.querySelector = () => new Target('route');
  document.querySelectorAll = () => [];
  document.createElement = tag => {
    const node = new Target('', tag);
    if (tag === 'canvas') node.getContext = (kind, attributes) => {
      graphicsRequests.push({ kind, attributes: copy(attributes || {}) });
      // WebGL 1 remains available so a mistaken compatibility fallback is caught.
      return kind !== 'webgl2' || webgl2 ? { getExtension: () => ({ loseContext() {} }) } : null;
    };
    return node;
  };
  for (const type of ['mousedown', 'mouseup', 'mousemove']) {
    nodes.get('canvas').addEventListener(type, event => mouseEvents.push({ type, button: event.button, buttons: event.buttons, dx: event.movementX, dy: event.movementY }));
  }
  const parent = { postMessage: (message, origin) => messages.push({ message: copy(message), origin }) };
  let interactionCount = 0;
  parent.GTAVicePortInteraction = () => { interactionCount++; };
  const location = { href: HREF, origin: ORIGIN, search: '?session=' + SESSION + '&scene=1&exam=' + Number(examMode) + (legacy ? '&legacy=1' : edition === 9 ? '&legacyEdition=9' : edition >= 10 ? '&edition=' + edition : '&legacyEdition=8')+ (continuous ? '&flow=1' : '') + (warmup ? '&warmup=1' : ''), reload() {} };
  const fetch = async input => {
    const url = new URL(String(input), HREF);
    assert.equal(url.origin, ORIGIN, 'The loader must fetch its packaged assets from its own origin');
    assert(url.pathname.startsWith('/native-vc/'));
    const relative = url.pathname.slice('/native-vc/'.length), filename = path.resolve(ROOT, relative);
    assert(filename.startsWith(ROOT + path.sep)); requests.push(relative);
    let bytes = fs.readFileSync(filename);
    if (corruptScene && relative === 'range-v8.scm') { bytes = Buffer.from(bytes); bytes[bytes.length - 1] ^= 1; }
    return {
      ok: true,
      json: async () => JSON.parse(bytes.toString('utf8')),
      text: async () => bytes.toString('utf8'),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    };
  };
  const assetRequests = [], startupOrder = [], requestPriorities = [];
  parent.GTANativePreload = { pause: async () => { startupOrder.push('preload-paused'); } };
  parent.GTANativeAssets = {
    loadManifest: async options => {
      startupOrder.push('manifest');
      fileActivity = options.onActivity;
      if (stallManifest) return new Promise(resolve => { finishManifest = async () => resolve((await fetch('runtime/manifest.json')).json()); });
      return (await fetch('runtime/manifest.json')).json();
    },
    loadDistrictManifest: async () => {
      const source = await (await fetch('runtime/vice-district/manifest.json')).json();
      return { ...source, files: source.files.map(file => {
        let offset = 0;
        return { ...file, chunks: file.chunks.map(part => { const result = { ...part, path: 'vice-district/' + part.path, offset }; offset += part.size; return result; }) };
      }) };
    },
    getAsset: async (file, options) => {
      assert(['high', ...(warmup ? ['low'] : [])].includes(options.priority)); assert.equal(startupOrder[0], 'preload-paused');
      requestPriorities.push(options.priority);
      assetRequests.push(file.path || file.fsPath);
      if (missingModel && file.path.startsWith('remote/models/')) throw new Error('Required model unavailable');
      const bytes = new Uint8Array(file.size);
      for (const part of file.chunks || [file]) {
        const chunk = new Uint8Array(await (await fetch('runtime/' + part.path)).arrayBuffer());
        assert.equal(chunk.length, part.size); assert.equal(digest(chunk), part.sha256);
        bytes.set(chunk, part.offset || 0);
      }
      assert.equal(digest(bytes), file.sha256);
      options.onBytes({ loaded: bytes.length, total: bytes.length, path: file.path || file.fsPath, source: 'network' });
      return bytes;
    }
  };
  class FakeXHR { open() {} }
  class FakeAudioContext {
    constructor() { this.state = 'running'; this.resumed = 0; this.suspended = 0; }
    suspend() { this.state = 'suspended'; this.suspended++; return Promise.resolve(); }
    resume() { this.state = 'running'; this.resumed++; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const globals = {
    document, parent, location, fetch, URL, URLSearchParams, Uint8Array, Int32Array, TextEncoder, AbortController, Blob,
    MouseEvent: FakeEvent, KeyboardEvent: FakeEvent, Event: FakeEvent, XMLHttpRequest: FakeXHR, AudioContext: FakeAudioContext,
    crypto: webcrypto, performance: { now: () => clock }, innerWidth: 390, innerHeight: 844,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    caches: { open: async () => { throw new Error('No browser cache in this VM'); } },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay, interval: false }); return id; },
    setInterval: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay, interval: true }); return id; },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    console: { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) }
  };
  Object.assign(windowNode, globals); windowNode.window = windowNode;
  const context = vm.createContext(windowNode);
  vm.runInContext(fs.readFileSync(path.join(ROOT, '../exam-engine.js'), 'utf8'), context, { filename: 'exam-engine.js', timeout: 1000 });
  vm.runInContext(fs.readFileSync(path.join(ROOT, '../practice-flow.js'), 'utf8'), context, { filename: 'practice-flow.js', timeout: 1000 });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'aim-motion.js'), 'utf8'), context, { filename: 'aim-motion.js', timeout: 1000 });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'vice-district.js'), 'utf8'), context, { filename: 'vice-district.js', timeout: 1000 });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'human-models.js'), 'utf8'), context, { filename: 'human-models.js', timeout: 1000 });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'pudge-model.js'), 'utf8'), context, { filename: 'pudge-model.js', timeout: 1000 });
  vm.runInContext(SOURCE, context, { filename: 'native.js', timeout: 1000 });
  const heap = new Int32Array(16384), packetIndex = 4096;
  const writes = [], timeline = [];
  let mainEntries = 0, pauses = 0, resumes = 0;
  function setPacket(values = {}) {
    heap[packetIndex] = CONFIG.magic[0]; heap[packetIndex + 1] = CONFIG.magic[1]; heap[packetIndex + 2] = CONFIG.version;
    for (const [name, value] of Object.entries(values)) heap[packetIndex + CONFIG.slots[name]] = value;
    context.HEAP32 = heap;
  }
  function frame(milliseconds = 17) {
    clock += milliseconds;
    if (context.Module.preMainLoop() === false) return false;
    context.Module.postMainLoop(); return true;
  }
  async function boot({ autoPrepare = false } = {}) {
    if (autoPrepare) {
      const entry = Array.from(timers.entries()).find(([, timer]) => timer.delay === 0);
      assert(entry, 'Exam entry must prepare automatically after the parent opens part C');
      timers.delete(entry[0]); await entry[1].fn();
    } else await nodes.get('native-start').onclick();
    assert.equal(context.ViceRange.snapshot().stage, 'engine', JSON.stringify(logs));
    assert.equal(scripts.length, 1, 'Exactly one engine glue script is requested');
    const module = context.Module;
    module.FS = {
      writeFile: (filename, bytes) => { writes.push({ filename, bytes: Buffer.from(bytes) }); timeline.push('write:' + filename); },
      mkdirTree() {},
      readFile: (filename,options) => { const bytes=writes.filter(entry=>entry.filename===filename).at(-1)?.bytes || BASE_FILES.get(filename); if(!bytes)throw new Error('FS file missing: '+filename);return options?.encoding ? bytes.toString(options.encoding) : new Uint8Array(bytes); }
    };
    module.pauseMainLoop = () => { pauses++; };
    module.resumeMainLoop = () => { resumes++; };
    context.MainLoop = { func() {} };
    // Execute only the small, reviewed Emscripten startup dispatcher with inert
    // init/main stubs. The rest of index.js and all WASM remain unexecuted bytes.
    const glue = fs.readFileSync(path.join(ROOT, 'runtime/index.js'), 'utf8');
    const dispatcher = glue.match(/  function doRun\(\) \{[\s\S]*?\n  \}/)?.[0];
    assert(dispatcher, 'The packaged glue must expose its synchronous doRun lifecycle');
    const originalInit = module.onRuntimeInitialized;
    module.onRuntimeInitialized = function () {
      timeline.push('runtime-initialized');
      const returned = originalInit.call(this);
      assert.equal(returned, undefined, 'SCM injection must complete synchronously, not in an unawaited Promise');
      return returned;
    };
    vm.runInNewContext(dispatcher + '\ndoRun();', {
      Module: module, ABORT: false, args: [], initRuntime() {}, preMain() {}, postRun() {},
      callMain() {
        timeline.push('main'); mainEntries++;
        assert.deepEqual(writes.find(entry => entry.filename === '/vc-assets/local/data/main.scm')?.bytes, fs.readFileSync(path.join(ROOT, legacy ? 'range-legacy.scm' : edition === 9 ? 'range-v9.scm' : edition >= 10 ? 'range.scm' : 'range-v8.scm')),
          'The exact verified SCM must already be in FS at native main entry');
        assert.deepEqual(writes.find(entry => entry.filename === '/vc-assets/local/revc.ini')?.bytes, fs.readFileSync(path.join(ROOT, 'revc.ini')));
      }
    }, { timeout: 1000 });
    return module;
  }
  function nativeReady(number = 1) {
    const config = CONFIG.scenes.find(scene => scene.scene === number);
    if (!context.HEAP32) {
      setPacket({ phase: CONFIG.phases.idle, heartbeat: 1 }); frame();
    }
    if (context.ViceRange.snapshot().scene !== number) {
      assert.equal(context.ViceRange.setScene(number), true);
    }
    setPacket({ phase: CONFIG.phases.briefing, scene: number, ackSeq: heap[packetIndex + CONFIG.slots.commandSeq],
      ammo: config.ammo, ammoInitial: config.ammo, weapon: config.weapon, currentWeapon: config.weapon,
      targetCount: config.targetCount, heartbeat: 2, completed: 0, outcome: 0 });
    for (let index = 0; index < config.targetCount; index++) setPacket({
      ['target' + index + '_health']: 1000, ['target' + index + '_credited']: 0, ['target' + index + '_destroyed']: 0 });
    frame(); assert.equal(context.ViceRange.snapshot().stage, context.ViceRange.snapshot().warmup ? 'engine' : edition >= 10 && examMode && continuous ? 'starting' : 'briefing');
  }
  function playing(number = 1) {
    nativeReady(number);
    if (context.ViceRange.snapshot().stage === 'briefing') assert.equal(context.ViceRange.startScene(), true);
    assert.equal(context.ViceRange.snapshot().stage, 'starting');
    // The command itself must not arm the exam timer before native acknowledgment.
    frame(); assert.equal(context.ViceRange.snapshot().stage, 'starting');
    setPacket({ phase: CONFIG.phases.playing, ackSeq: heap[packetIndex + CONFIG.slots.commandSeq], heartbeat: 3 });
    frame(); assert.equal(context.ViceRange.snapshot().stage, 'playing');
  }
  function nativeComplete(number, cleared = true) {
    const config = CONFIG.scenes.find(scene => scene.scene === number);
    setPacket({ phase: CONFIG.phases.complete, scene: number, completed: 1, outcome: cleared ? 1 : 2,
      ammo: cleared ? config.ammo - 1 : 0, ammoInitial: config.ammo, weapon: config.weapon, targetCount: config.targetCount, heartbeat: 5 });
    for (let index = 0; index < config.targetCount; index++) setPacket({
      ['target' + index + '_health']: cleared ? number === 3 ? 0 : 980 : 1000,
      ['target' + index + '_credited']: Number(cleared), ['target' + index + '_destroyed']: Number(cleared && number === 3) });
    frame(); assert.equal(context.ViceRange.snapshot().stage, 'finishing');
    frame(2100); assert.equal(context.ViceRange.snapshot().stage, 'complete');
  }
  function click(id) { nodes.get(id).dispatchEvent(new FakeEvent('click', { bubbles: true, detail: 0 })); }
  function message(data, overrides = {}) {
    windowNode.dispatchEvent(new FakeEvent('message', Object.assign({ origin: ORIGIN, source: parent, data: Object.assign({ session: SESSION }, data) }, overrides)));
  }
  return {
    context, document, nodes, scripts, messages, mouseEvents, requests, heap, writes, timeline, timers, assetRequests, startupOrder, requestPriorities, packetIndex, graphicsRequests, config: CONFIG,
    boot, playing, nativeReady, nativeComplete, frame, click, message, setPacket,
    rawTouch:(id,type)=>{const e=new FakeEvent(type,{bubbles:true});nodes.get(id).dispatchEvent(e);return e.stopped;},
    pointer:(id,type,options)=>nodes.get(id).dispatchEvent(new FakeEvent(type,Object.assign({bubbles:true,button:0,pointerId:1},options))),
    start: () => nodes.get('native-start').onclick(),
    finishManifest: () => finishManifest?.(),
    fileActivity: () => fileActivity?.({ path: 'manifest.json' }),
    tick: milliseconds => { for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) { clock += 100; for (const [id, timer] of Array.from(timers)) if (timer.interval && timers.has(id)) timer.fn(); } },
    snapshot: () => copy(context.ViceRange.snapshot()),
    blur: () => windowNode.dispatchEvent(new FakeEvent('blur')),
    pagehide: persisted => windowNode.dispatchEvent(new FakeEvent('pagehide', { persisted })),
    pageshow: persisted => windowNode.dispatchEvent(new FakeEvent('pageshow', { persisted })),
    visibility: hidden => { document.hidden = hidden; document.dispatchEvent(new FakeEvent('visibilitychange')); },
    counts: () => ({ mainEntries, pauses, resumes, interactionCount }),
    destroy: () => context.ViceRange.destroy()
  };
}

test('VM contract: verified shared assets and exact SCM are installed before native main', async () => {
  const h = makeHarness();
  try {
    const module = await h.boot({ autoPrepare: true });
    assert.equal(h.document.body.dataset.exam, 'true');
    assert.equal(h.counts().mainEntries, 1);
    assert(h.timeline.indexOf('write:/vc-assets/local/data/main.scm') < h.timeline.indexOf('main'));
    assert.deepEqual(h.startupOrder.slice(0, 2), ['preload-paused', 'manifest']);
    assert.equal(digest(Buffer.from(module.getPreloadedPackage())), MANIFEST.data.sha256);
    assert.equal(digest(module.wasmBinary), MANIFEST.engine.wasm.sha256, 'WASM remains bytes, never compiled here');
    const blob = resolveObjectURL(h.scripts[0].src);
    assert(blob, 'Use the verified, shared-loader JS bytes rather than making a second script download');
    assert.equal(digest(new Uint8Array(await blob.arrayBuffer())), MANIFEST.engine.js.sha256);
    assert.deepEqual(h.assetRequests.sort(), [MANIFEST.data.path, MANIFEST.engine.wasm.path, MANIFEST.engine.js.path, ...MANIFEST.models.files.map(file => file.path)].sort());
    for (const file of MANIFEST.models.files) {
      const name = '/vc-assets/local/' + file.originalPath.slice('/remote/'.length);
      const write = h.writes.find(entry => entry.filename === name);
      assert(write, 'Required model is installed');
      assert.equal(digest(write.bytes), file.sha256);
      assert(h.timeline.indexOf('write:' + name) < h.timeline.indexOf('main'), 'Models must exist before main');
    }
    assert.equal(h.snapshot().stage, 'engine');
    assert.equal(h.messages.some(event => event.message.type === 'vice:ready'), false);
    // Native readiness, not the presence of a canvas or an engine script, drives the first scene.
    h.setPacket({ phase: CONFIG.phases.idle, heartbeat: 1 });
    const before = Array.from(h.heap); h.frame();
    const changed = Array.from(h.heap).flatMap((value, index) => value === before[index] ? [] : [index]);
    assert.deepEqual(changed.sort((a,b) => a-b), ['command', 'requestedScene', 'commandSeq'].map(name => h.packetIndex + CONFIG.slots[name]).sort((a,b) => a-b));
    assert.equal(h.snapshot().stage, 'engine', 'A mailbox request does not count as native readiness');
    h.nativeReady(1);
    assert.equal(h.context.Module.preMainLoop(), false, 'Pause gameplay while instructions are visible');
    assert.equal(h.nodes.get('native-briefing').hidden, false);
  } finally { h.destroy(); }
});

test('VM startup: a WebGL 1-only browser fails before downloading the native package', async () => {
  const h = makeHarness({ webgl2: false });
  try {
    await h.start();
    assert.deepEqual(h.graphicsRequests, [{ kind: 'webgl2', attributes: { alpha: false, depth: true, stencil: true, antialias: false } }]);
    assert.equal(h.snapshot().stage, 'error'); assert.equal(h.snapshot().errorCode, 'C-GPU');
    assert.equal(h.requests.length, 0); assert.equal(h.assetRequests.length, 0); assert.equal(h.scripts.length, 0);
    assert.equal(h.nodes.get('error-browser-help').hidden, false);
    assert.equal(h.nodes.get('error-open').href, ORIGIN + '/rpg/');
    assert.match(h.nodes.get('error-diagnostic').textContent, /WebGL 2 unavailable/);
  } finally { h.destroy(); }
});

test('VM continuous practice: briefing starts once, honors read-pause and external visibility', async () => {
  const h = makeHarness({ continuous: true });
  try {
    await h.boot(); h.nativeReady(1);
    assert.equal(h.nodes.get('briefing-countdown').textContent, 'Старт через 3');
    h.tick(1000); h.nodes.get('briefing-pause').onclick(); h.tick(5000);
    assert.equal(h.snapshot().stage, 'briefing'); assert.equal(h.nodes.get('briefing-countdown').textContent, 'Старт приостановлен');
    h.nodes.get('briefing-pause').onclick(); h.visibility(true); h.tick(10000); h.visibility(false);
    assert.equal(h.snapshot().stage, 'briefing');
    h.tick(1900); assert.equal(h.snapshot().stage, 'briefing'); h.tick(200);
    assert.equal(h.snapshot().stage, 'starting');
    const sequence = h.heap[h.packetIndex + CONFIG.slots.commandSeq];
    h.tick(3000); assert.equal(h.heap[h.packetIndex + CONFIG.slots.commandSeq], sequence, 'Automatic START must not be sent twice');
    assert.equal(h.snapshot().stage, 'starting', 'The exam timer still waits for the native playing acknowledgment');
  } finally { h.destroy(); }
});

test('VM continuous practice: free C1 advances on the next active tick, preserving one engine', async () => {
  const h = makeHarness({ continuous: true, examMode: false });
  try {
    const module = await h.boot(); h.playing(1); h.nativeComplete(1);
    assert.equal(h.snapshot().scene, 1, 'The zero-delay handoff remains asynchronous');
    h.visibility(true); h.tick(10000); assert.equal(h.snapshot().scene, 1);
    h.visibility(false); h.tick(100);
    assert.equal(h.snapshot().scene, 2); assert.equal(h.snapshot().stage, 'preparing');
    assert.equal(h.context.Module, module); assert.equal(h.scripts.length, 1);
    assert.equal(h.nodes.get('mission-objective').textContent, 'Повреди три патрульные машины');
  } finally { h.destroy(); }
});

test('VM exam: C feedback stays neutral and helicopter time comes only from native slots', async () => {
  const h = makeHarness({ continuous: true });
  try {
    await h.boot(); h.playing(1);
    h.setPacket({ target0_credited: 1, target0_health: 980 }); h.frame();
    assert(!/засчитано|1\/2|балл/.test(h.nodes.get('native-toast').textContent));
    h.nativeComplete(1); h.playing(3);
    h.setPacket({ sceneDeadline: 100000, nativeTimer: 10000 }); h.frame();
    assert.equal(h.nodes.get('mission-time').textContent, 'Осталось 01:30');
    h.setPacket({ nativeTimer: 87000 }); h.frame();
    assert.equal(h.nodes.get('mission-time').textContent, 'Осталось 00:13');
    assert.equal(h.nodes.get('mission-time').dataset.urgent, 'true');
    const heapBeforePause = Buffer.from(new Uint8Array(h.heap.buffer));
    h.nodes.get('native-pause').onclick(); assert.equal(h.snapshot().stage, 'paused');
    assert.equal(h.context.ViceRange.setScene(2), false);
    assert.equal(h.frame(50000), false); assert.deepEqual(Buffer.from(h.heap.buffer), heapBeforePause);
    assert.equal(h.nodes.get('mission-time').textContent, 'Осталось 00:13');
    h.nodes.get('native-resume').onclick(); assert.equal(h.snapshot().stage, 'playing');
    h.setPacket({ phase: CONFIG.phases.complete, completed: 1, outcome: 3, ammo: 3, nativeTimer: 100000, target0_health: 1000, target0_credited: 0, target0_destroyed: 0 });
    h.frame(); h.frame(2000);
    assert.equal(h.snapshot().stage, 'complete');
    assert(!/засчитано|балл|неверно|попадание/i.test(h.nodes.get('complete-detail').textContent));
    assert.equal(h.nodes.get('complete-next-label').textContent, 'Передаём работу комиссии.');
  } finally { h.destroy(); }
});

test('VM startup: stalled file loading ends visibly and a late response cannot start the engine', async () => {
  const h = makeHarness({ stallManifest: true });
  try {
    const pending = h.start(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.snapshot().stage, 'loading');
    h.tick(46000);
    assert.equal(h.snapshot().stage, 'error'); assert.equal(h.snapshot().errorCode, 'C-FILES-TIMEOUT');
    assert.equal(h.messages.filter(event => event.message.type === 'vice:error').length, 1);
    await h.finishManifest(); await pending;
    assert.equal(h.snapshot().stage, 'error'); assert.equal(h.assetRequests.length, 0); assert.equal(h.scripts.length, 0);
    assert.equal(h.context.Module, undefined);
  } finally { h.destroy(); }
});

test('VM startup: hidden time does not consume the foreground launch watchdog', async () => {
  const h = makeHarness({ stallManifest: true });
  try {
    const pending = h.start(); await new Promise(resolve => setImmediate(resolve));
    h.visibility(true); h.tick(120000); assert.equal(h.snapshot().stage, 'loading');
    h.visibility(false); h.tick(44000); assert.equal(h.snapshot().stage, 'loading');
    h.tick(2000); assert.equal(h.snapshot().errorCode, 'C-FILES-TIMEOUT');
    await h.finishManifest(); await pending;
  } finally { h.destroy(); }
});

test('VM startup: slow but active downloads keep the launch watchdog alive', async () => {
  const h = makeHarness({ stallManifest: true });
  try {
    const pending = h.start(); await new Promise(resolve => setImmediate(resolve));
    for (let part = 0; part < 4; part++) { h.tick(30000); h.fileActivity(); assert.equal(h.snapshot().stage, 'loading'); }
    h.tick(46000); assert.equal(h.snapshot().errorCode, 'C-FILES-TIMEOUT');
    await h.finishManifest(); await pending;
  } finally { h.destroy(); }
});

test('VM startup: runtime failure exposes a bounded local diagnostic without URL credentials', async () => {
  const h = makeHarness();
  try {
    await h.boot();
    h.context.Module.onAbort('RuntimeError loading https://assets.test/native?token=do-not-copy');
    assert.equal(h.snapshot().errorCode, 'C-ENGINE');
    const diagnostic = h.nodes.get('error-diagnostic').textContent;
    assert.match(diagnostic, /RuntimeError/); assert(!diagnostic.includes('do-not-copy')); assert(!diagnostic.includes('https://'));
    assert.equal(h.messages.some(event => event.message.type === 'vice:ready' || event.message.type === 'vice:complete'), false);
    h.tick(200000); assert.equal(h.messages.filter(event => event.message.type === 'vice:error').length, 1);
  } finally { h.destroy(); }
});

test('VM contract: pistol/Uzi input never writes native damage; ammo acknowledgment ends the burst', async () => {
  const h = makeHarness();
  try {
    await h.boot(); h.playing(1);
    const beforeHeap = Buffer.from(new Uint8Array(h.heap.buffer));
    h.click('native-fire'); h.frame(); h.frame(1300);
    assert.deepEqual(Buffer.from(h.heap.buffer), beforeHeap);
    assert.equal(h.snapshot().ammo, 6);
    assert.equal(h.mouseEvents.filter(event => event.type === 'mouseup' && event.button === 0).length, 0);
    h.setPacket({ ammo: 5 }); h.frame();
    assert.equal(h.mouseEvents.filter(event => event.type === 'mouseup' && event.button === 0).length, 1);
    h.click('native-fire'); h.frame(); h.frame(6100);
    assert.equal(h.snapshot().ammo, 5);
    assert.equal(h.mouseEvents.filter(event => event.type === 'mouseup' && event.button === 0).length, 2);
    assert(h.nodes.get('native-toast').textContent.length > 0);
    assert.equal(h.messages.some(event => event.message.type === 'vice:complete'), false);
    h.nativeComplete(1);
    h.playing(2);
    const releases = h.mouseEvents.filter(event => event.type === 'mouseup' && event.button === 0).length;
    h.click('native-fire'); h.frame();
    h.setPacket({ ammo: 14 }); h.frame(); h.setPacket({ ammo: 13 }); h.frame();
    assert.equal(h.mouseEvents.filter(event => event.type === 'mouseup' && event.button === 0).length, releases,
      'A short Uzi burst waits for three actual native rounds; JS must not subtract them');
    h.setPacket({ ammo: 12 }); h.frame();
    assert.equal(h.mouseEvents.filter(event => event.type === 'mouseup' && event.button === 0).length, releases + 1);
    assert.equal(h.snapshot().ammo, 12);
  } finally { h.destroy(); }
});

test('VM contract: all three scene protocols share one engine and remain distinct and neutral', async () => {
  const h = makeHarness();
  try {
    const module = await h.boot();
    for (const number of [1, 2, 3]) {
      h.playing(number); h.nativeComplete(number, number !== 3);
      assert.equal(h.nodes.get('complete-title').textContent, number === 3 ? 'Практика завершена.' : 'Этап С' + number + ' завершён.');
      assert.equal(h.nodes.get('native-next').hidden, true, 'Exam navigation belongs to the parent, not the game');
      assert.equal(h.context.Module.preMainLoop(), false);
      assert.equal(h.context.Module, module); assert.equal(h.scripts.length, 1);
    }
    const completed = h.messages.filter(event => event.message.type === 'vice:complete').map(event => event.message.result);
    assert.deepEqual(completed.map(result => [result.version, result.scene, result.targets.length, result.ammoInitial]), [[2, 1, 2, 6], [2, 2, 3, 15], [2, 3, 1, 3]]);
    assert.deepEqual(completed.map(result => result.outcome), ['cleared', 'cleared', 'ammo']);
    assert.equal(completed[0].targets.every(target => target.credited && target.health < 1000), true);
    assert.equal(completed[2].ammoRemaining, 0);
    assert.equal(completed[2].targets.some(target => target.credited || target.destroyed), false);
    assert(completed.every(result => !('points' in result) && !('score' in result)));
    assert.equal(h.counts().mainEntries, 1);
    assert.equal(h.assetRequests.length, 3 + MANIFEST.models.files.length, 'Transitions must not download another engine, data package or models');
    assert.equal(h.writes.filter(entry => entry.filename.endsWith('main.scm')).length, 1);
    const returned = h.context.ViceRange.snapshot(); returned.result.targets[0].credited = true;
    assert.equal(h.snapshot().result.targets[0].credited, false, 'Callers cannot mutate the stored protocol through a snapshot');
  } finally { h.destroy(); }
});

test('VM contract: source-bound pause, blur, BFCache and disposal release native input', async () => {
  const h = makeHarness();
  try {
    await h.boot(); h.playing(1);
    const preferences = { type: 'vice:preferences', paused: true, muted: true }, initialPauses = h.counts().pauses;
    h.message(preferences, { origin: 'https://another.test' }); h.message(preferences, { source: {} });
    h.message(Object.assign({}, preferences, { session: 'another-session' }));
    assert.equal(h.counts().pauses, initialPauses);
    h.click('native-fire'); assert.equal(h.context.Module.preMainLoop(), true);
    h.message(preferences);
    assert.equal(h.counts().pauses, initialPauses + 1);
    assert.equal(h.context.Module.preMainLoop(), false);
    assert.deepEqual(h.mouseEvents.slice(-2).map(event => [event.type, event.button]), [['mouseup', 0], ['mouseup', 2]]);
    const pausedInputs = h.mouseEvents.length;
    h.click('native-fire'); assert.equal(h.context.Module.preMainLoop(), false); assert.equal(h.mouseEvents.length, pausedInputs);
    h.message({ type: 'vice:preferences', paused: false, muted: true });
    h.click('native-aim'); h.blur(); assert.deepEqual([h.mouseEvents.at(-1).type, h.mouseEvents.at(-1).button], ['mouseup', 2]);
    h.click('native-fire'); h.context.Module.preMainLoop(); h.pagehide(true);
    assert.deepEqual(h.mouseEvents.slice(-2).map(event => [event.type, event.button]), [['mouseup', 0], ['mouseup', 2]]);
    assert.equal(h.context.Module.preMainLoop(), false); assert(h.timers.size > 0);
    h.pageshow(true); assert.equal(h.context.Module.preMainLoop(), true); assert.equal(h.snapshot().scene, 1);
    h.click('native-fire'); h.context.Module.preMainLoop(); h.destroy();
    assert.deepEqual(h.mouseEvents.slice(-2).map(event => [event.type, event.button]), [['mouseup', 0], ['mouseup', 2]]);
    assert.equal(h.context.Module.preMainLoop(), false); assert.equal(h.timers.size, 0);
    const resumes = h.counts().resumes;
    h.message({ type: 'vice:preferences', paused: false, muted: false }); assert.equal(h.counts().resumes, resumes);
  } finally { h.destroy(); }
});

test('VM contract: a changed SCM is rejected before any engine/data asset is requested', async () => {
  const h = makeHarness({ corruptScene: true });
  try {
    await h.start(); assert.equal(h.snapshot().stage, 'error');
    assert.equal(h.scripts.length, 0); assert.equal(h.context.Module, undefined); assert.equal(h.assetRequests.length, 0);
    assert.equal(h.messages.some(event => event.message.type === 'vice:ready' || event.message.type === 'vice:complete'), false);
    assert.equal(h.messages.filter(event => event.message.type === 'vice:error').length, 1);
    assert.equal(h.nodes.get('native-error').hidden, false);
  } finally { h.destroy(); }
});

test('VM contract: parent setScene reuses its iframe and rejects stale scene results', () => {
  const listeners = new Map(), sent = [], states = [], completed = [], errors = [];
  let created = 0, mounted = 0, removed = false;
  const frame = { contentWindow: { postMessage: message => sent.push(copy(message)) }, addEventListener() {}, remove() { removed = true; } };
  const context = { location: { origin: ORIGIN }, crypto: { randomUUID: () => SESSION },
    document: { createElement: tag => { assert.equal(tag, 'iframe'); created++; return frame; } },
    addEventListener: (type, callback) => listeners.set(type, callback), removeEventListener: type => listeners.delete(type) };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, '../vice-port.js'), 'utf8'), context, { timeout: 1000 });
  const port = context.GTAVicePort.mount({ replaceChildren: node => { assert.equal(node, frame); mounted++; } },
    { scene: 1, edition: 8, examMode: true, onState: state => states.push(copy(state)), onComplete: result => completed.push(copy(result)), onError: message => errors.push(message) });
  function deliver(type, extra, overrides = {}) {
    listeners.get('message')?.(Object.assign({ origin: ORIGIN, source: frame.contentWindow, data: Object.assign({ type: 'vice:' + type, session: SESSION }, extra) }, overrides));
  }
  const result = { engine: 'vice-city-wasm', version: 2, scene: 1, completed: true, outcome: 'cleared', ammoInitial: 6, ammoRemaining: 4,
    targets: [{ credited: true, destroyed: false, health: 980 }, { credited: true, destroyed: false, health: 980 }] };
  deliver('mounted');
  deliver('state', { state: { engine: 'vice-city-wasm', version: 2, scene: 1, stage: 'playing' } });
  assert.equal(port.setScene(2), false, 'The active native attempt cannot be replaced before completion');
  deliver('state', { state: { engine: 'vice-city-wasm', version: 2, scene: 1, stage: 'complete' } });
  deliver('complete', { result }); assert.equal(completed.length, 1);
  assert.equal(port.setScene(2), true);
  deliver('complete', { result }); assert.equal(completed.length, 1, 'A delayed C1 result must not be submitted for C2');
  deliver('state', { state: { engine: 'vice-city-wasm', version: 2, scene: 2, stage: 'playing' } }, { source: {} });
  assert.equal(port.getState().stage, 'preparing');
  deliver('state', { state: { engine: 'vice-city-wasm', version: 2, scene: 2, stage: 'briefing' } });
  port.startScene(); assert.equal(sent.at(-1).type, 'vice:start');
  assert.equal(created, 1); assert.equal(mounted, 1); assert.equal(errors.length, 0);
  assert(sent.some(message => message.type === 'vice:scene' && message.scene === 2));
  port.destroy(); assert.equal(removed, true); assert.equal(listeners.has('message'), false);
});


test('packaged model registry is complete, verified and fits polite preload limits', () => {
  const models = MANIFEST.models;
  assert.equal(models.count, 92); assert.equal(models.files.length, 92);
  assert.equal(new Set(models.files.map(file => file.path)).size, 92);
  for (const file of models.files) {
    assert.match(file.path, /^remote\/models\/gta3\.img\/[a-z0-9_.-]+$/);
    assert.equal(file.originalPath, '/' + file.path);
    const bytes = fs.readFileSync(path.join(ROOT, 'runtime', file.path));
    assert.equal(bytes.length, file.size); assert.equal(digest(bytes), file.sha256);
    if(file.chunks) { const parts=file.chunks.map(part=>{const bytes=fs.readFileSync(path.join(ROOT,'runtime',part.path));assert.equal(bytes.length,part.size);assert.equal(digest(bytes),part.sha256);return bytes;});assert.deepEqual(Buffer.concat(parts),bytes); }
  }
  assert.equal(models.size, models.files.reduce((sum, file) => sum + file.size, 0));
  const queue = [MANIFEST.engine.js, ...MANIFEST.engine.wasm.chunks, ...MANIFEST.data.chunks, ...models.files.flatMap(file => file.chunks || [file])];
  assert(queue.length <= 256); assert(queue.every(file => file.size <= 512 * 1024));
  assert(queue.reduce((sum, file) => sum + file.size, 0) <= 64 * 1024 * 1024);
});

test('VM startup: missing required model fails visibly before engine main', async () => {
  const h = makeHarness({ missingModel: true });
  try {
    await h.start();
    assert.equal(h.snapshot().stage, 'error');
    assert.equal(h.scripts.length, 0); assert.equal(h.counts().mainEntries, 0);
    assert.equal(h.messages.filter(event => event.message.type === 'vice:error').length, 1);
    assert.equal(h.messages.some(event => event.message.type === 'vice:ready'), false);
  } finally { h.destroy(); }
});


test('legacy native route loads fixed historical SCM and keeps the two-car C3 protocol', async () => {
  const h = makeHarness({ legacy: true });
  try {
    await h.boot();
    assert(h.requests.includes('range-legacy-config.json'));
    assert(h.requests.includes('range-legacy.scm'));
    assert(!h.requests.includes('range-config.json'));
    assert(!h.requests.includes('range.scm'));
    const historical = fs.readFileSync(path.join(ROOT, 'range-legacy.scm'));
    const installed = h.writes.find(entry => entry.filename.endsWith('/main.scm'));
    assert.equal(digest(installed.bytes), digest(historical));
    h.playing(3); h.nativeComplete(3);
    const result = h.messages.find(event => event.message.type === 'vice:complete').message.result;
    assert.equal(result.scene, 3); assert.equal(result.targets.length, 2); assert.equal(result.ammoInitial, 3);
  } finally { h.destroy(); }
});

test('parent native router explicitly preserves legacy flag and omits it for the new edition', () => {
  for (const legacy of [false, true]) {
    const frame = { contentWindow: { postMessage() {} }, addEventListener() {}, remove() {} };
    const context = { location: { origin: ORIGIN }, crypto: { randomUUID: () => SESSION },
      document: { createElement: () => frame }, addEventListener() {}, removeEventListener() {} };
    context.window = context;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, '../vice-port.js'), 'utf8'), context);
    const port = context.GTAVicePort.mount({ replaceChildren() {} }, { scene: 3, examMode: true, legacy });
    const url = new URL(frame.src, ORIGIN + '/');
    assert.equal(url.pathname, '/native-vc/index.html');
    assert.equal(url.searchParams.get('scene'), '3');
    assert.equal(url.searchParams.get('legacy'), legacy ? '1' : null);
    port.destroy();
  }
});

// Static emitted-SCM guard, not a substitute for a real native rocket-hit test.
test('C3 SCM credits native explosion damage 41 only after a spent rocket and health loss', () => {
  const listing = fs.readFileSync(path.resolve(ROOT, '../../scripts/native-scm/native-exam-main.listing.txt'), 'utf8');
  const emitted = fs.readFileSync(path.resolve(ROOT, '../../scripts/native-scm/native-exam-main.scm'));
  assert.deepEqual(emitted, fs.readFileSync(path.join(ROOT, 'range.scm')), 'deployed SCM must match the reviewed build');
  assert.match(listing, /02AA: SET_CAR_ONLY_DAMAGED_BY_PLAYER \$target0_handle 1/);
  assert.match(listing, /02AC: SET_CAR_PROOFS \$target0_handle 1 1 0 1 1/);
  assert.doesNotMatch(listing, /031E: HAS_CAR_BEEN_DAMAGED_BY_WEAPON \$target\d_handle 30/);
  for (let i = 0; i < 3; i++) {
    const start = listing.indexOf(`031E: HAS_CAR_BEEN_DAMAGED_BY_WEAPON $target${i}_handle 41`);
    assert(start >= 0, 'RPG explosion is damage enum 41, not launcher enum 30');
    const block = listing.slice(start, listing.indexOf(`:target_${i}_bullet`, start));
    assert(block.includes('IS_INT_VAR_GREATER_THAN_INT_VAR $ammoInitial $ammo'));
    assert(block.includes(`IS_INT_VAR_GREATER_THAN_INT_VAR $target${i}_baseline $target${i}_health`));
    assert(block.includes(`SET_VAR_INT $target${i}_rpgHit 1`));
    assert(block.includes(`IS_INT_VAR_EQUAL_TO_NUMBER $target${i}_rpgHit 1`));
    assert(block.includes(`SET_VAR_INT_TO_VAR_INT $target${i}_credited $target${i}_destroyed`));
  }
});

// Version 3 packet/bridge checks only, not native gameplay proof.
test('v3 C1 emits two native milestones without fictional shooting targets', async () => {
 const h=makeHarness({edition:9});
 try {await h.boot();h.playing(1);
 h.setPacket({phase:JSON.parse(fs.readFileSync(path.join(ROOT,'range-v9-config.json'))).phases.complete,completed:1,outcome:1,hijacked:1,driveCompleted:1,ammo:0,ammoInitial:0});h.frame();h.frame(700);
 const result=h.messages.find(x=>x.message.type==='vice:complete')?.message.result;
 assert(result);assert.equal(result.version,3);assert.deepEqual(result.milestones,{hijacked:true,driveCompleted:true});assert.deepEqual(result.targets,[]);assert.equal(result.ammoRemaining,0);
 }finally{h.destroy();}
});

test('v3 C2 and C3 use one runtime and transport native destroyed targets', async () => {
 const h=makeHarness({edition:9});
 const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'range-v9-config.json')));
 try {await h.boot();
 for(const scene of [2,3]) {
  h.playing(scene);const c=cfg.scenes.find(x=>x.scene===scene);
  h.setPacket({phase:cfg.phases.complete,scene,completed:1,outcome:1,ammo:c.ammo-1,ammoInitial:c.ammo,weapon:c.weapon,targetCount:1,target0_health:0,target0_credited:1,target0_destroyed:1});
  h.frame();h.frame(1900);
 }
 const results=h.messages.filter(x=>x.message.type==='vice:complete').map(x=>x.message.result);
 assert.deepEqual(results.map(x=>[x.version,x.scene,x.targets[0].destroyed]),[[3,2,true],[3,3,true]]);
 assert.equal(h.counts().mainEntries,1);assert.equal(h.scripts.length,1);
 }finally{h.destroy();}
});

test('v3 C3 ammo failure stays uncredited and defers exam verdict to commission', async()=>{
 const h=makeHarness({edition:9}); const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'range-v9-config.json')));
 try{await h.boot();h.playing(3);h.setPacket({phase:cfg.phases.complete,scene:3,completed:1,outcome:2,ammo:0,ammoInitial:3,weapon:30,targetCount:1,target0_health:450,target0_credited:0,target0_destroyed:0});h.frame();h.frame(2100);
 assert.equal(h.snapshot().result.outcome,'ammo');assert.equal(h.snapshot().result.targets[0].credited,false);assert.match(h.nodes.get('complete-detail').textContent,/Оценку объявит комиссия/);
 }finally{h.destroy();}
});
test('v3 C1 timeout preserves partial hijack but not unperformed drive',async()=>{
 const h=makeHarness({edition:9}); const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'range-v9-config.json')));
 try{await h.boot();h.playing(1);h.setPacket({phase:cfg.phases.complete,completed:1,outcome:3,hijacked:1,driveCompleted:0,ammo:0,ammoInitial:0});h.frame();h.frame(2100);
 assert.equal(h.snapshot().result.outcome,'timeout');assert.deepEqual(h.snapshot().result.milestones,{hijacked:true,driveCompleted:false});
 }finally{h.destroy();}
});

test('v3 C2/C3 expose movement without vehicle actions and keep shooting controls',async()=>{
 for(const scene of [2,3]){const h=makeHarness({edition:9});try{await h.boot();h.playing(scene);h.frame();
 assert.equal(h.nodes.get('car-controls').hidden,false);assert.equal(h.nodes.get('drive-enter').hidden,true);assert.equal(h.nodes.get('drive-brake').hidden,true);assert.equal(h.nodes.get('range-controls').hidden,false);
 }finally{h.destroy();}}
});
test('movement SCM never freezes the actor; historical SCM stays separate',()=>{
 const listing=fs.readFileSync(path.resolve(ROOT,'../../scripts/native-scm/native-exam-main.listing.txt'),'utf8');
 assert.doesNotMatch(listing,/04D7: FREEZE_CHAR_POSITION \$ped 1/);
 assert.match(listing,/04D7: FREEZE_CHAR_POSITION \$ped 0/);
});


test('native interaction takes keyboard focus inside the game iframe',async()=>{
 const h=makeHarness({edition:9});try{await h.boot();h.playing(2);h.click('native-fire');assert.equal(h.document.activeElement,h.nodes.get('canvas'));}finally{h.destroy();}
});


test('current touch aim is steadier vertically; desktop and legacy inputs remain unchanged',async()=>{
 for(const [edition,pointerType,x,y] of [[9,'touch',12,7],[9,'mouse',20,20],[8,'touch',20,20]]){
  const h=makeHarness({edition});try{await h.boot();h.playing(2);
  h.pointer('canvas','pointerdown',{pointerType,clientX:100,clientY:100});h.pointer('canvas','pointermove',{pointerType,clientX:120,clientY:120});
  h.frame();const move=h.mouseEvents.filter(e=>e.type==='mousemove').at(-1);assert.equal(move.dx,x);assert.equal(move.dy,y);
  h.pointer('canvas','pointercancel',{pointerType,clientX:120,clientY:120});
  }finally{h.destroy();}
 }
});


test('losing focus cancels an aim drag and a fresh touch can aim again',async()=>{
 const h=makeHarness({edition:9});try{await h.boot();h.playing(2);
 const send=(type,x,y)=>h.pointer('canvas',type,{pointerType:'touch',clientX:x,clientY:y});
 send('pointerdown',100,100);send('pointermove',120,120);h.blur();const count=h.mouseEvents.length;
 send('pointermove',140,140);assert.equal(h.mouseEvents.length,count);
 send('pointerdown',100,100);send('pointermove',120,120);assert(h.mouseEvents.length>count);assert.equal(h.nodes.get('native-aim').getAttribute('aria-pressed'),'true');
 }finally{h.destroy();}
});


test('gameplay uses one pointer bridge and does not also feed raw SDL touches',async()=>{
 const h=makeHarness({edition:9});try{await h.boot();h.playing(2);for(const type of ['touchstart','touchmove','touchend','touchcancel'])assert.equal(h.rawTouch('canvas',type),true);assert.equal(h.rawTouch('native-intro','touchstart'),false);}finally{h.destroy();}
});

test('edition9 continuous car scene pauses and resumes movement without exposing shooting controls', async()=>{
 const h=makeHarness({edition:9,continuous:true});
 try{await h.boot();h.playing(1);h.nodes.get('native-pause').onclick();assert.equal(h.snapshot().stage,'paused');assert.equal(h.nodes.get('car-controls').hidden,true);h.nodes.get('native-resume').onclick();assert.equal(h.snapshot().stage,'playing');assert.equal(h.nodes.get('car-controls').hidden,false);assert.equal(h.nodes.get('range-controls').hidden,true);assert.match(h.nodes.get('mission-objective').textContent,/Забери машину/);}finally{h.destroy();}
});

function finishWarmFade(h, start = 0) {
  for (let step = 1; step <= 10 && h.snapshot().stage !== 'warmed'; step++) {
    h.setPacket({ nativeTimer: start + step * 100, heartbeat: 2 + step }); h.frame(100);
  }
  assert.equal(h.snapshot().stage, 'warmed');
}

test('warm current Ocean Drive prepares native briefing and fade, then parks silently until activation', async () => {
  const h = makeHarness({ edition: 14, warmup: true, continuous: true });
  try {
    await h.boot({ autoPrepare: true });
    assert.equal(h.counts().interactionCount, 0); assert.equal(h.document.activeElement, undefined);
    assert(h.requestPriorities.every(priority => priority === 'low'));
    assert(h.writes.some(entry => entry.filename.includes('oceandrv.ipl')));
    h.nativeReady(); assert.equal(h.snapshot().stage, 'engine', 'first prepared frame is not the completed fade');
    finishWarmFade(h);
    const command = h.heap[h.packetIndex + h.config.slots.commandSeq];
    const audio = new h.context.AudioContext(); h.context.Module.SDL2 = { audioContext: audio };
    h.message({ type: 'vice:preferences', muted: false, paused: false });
    h.message({ type: 'vice:start' }); h.click('native-fire'); await audio.resume();
    h.tick(60000); assert.equal(h.frame(60000), false);
    assert.equal(h.snapshot().stage, 'warmed'); assert.equal(h.counts().interactionCount, 0);
    assert.equal(h.heap[h.packetIndex + h.config.slots.commandSeq], command);
    assert.equal(h.heap[h.packetIndex + h.config.slots.sceneDeadline], 0);
    assert.equal(audio.resumed, 0); assert.equal(audio.state, 'suspended');
    assert.equal(h.messages.filter(row => row.message.type === 'vice:warmed').length, 1);
    assert.equal(h.messages.filter(row => row.message.type === 'vice:ready' || row.message.type === 'vice:complete').length, 0);
    const before = h.scripts[0];
    assert.equal(h.context.ViceRange.activate(), true); assert.equal(h.snapshot().stage, 'starting', 'A warm exam city starts immediately, without a second briefing countdown');
    const timerCount = h.timers.size;
    assert.equal(h.context.ViceRange.activate(), true); assert.equal(h.timers.size, timerCount);
    assert.equal(h.messages.filter(row => row.message.type === 'vice:ready').length, 1);
    assert.equal(h.nodes.get('native-loading').hidden, true, 'No loading screen after adopting the prepared city');
    assert.equal(h.nodes.get('native-briefing').hidden, true, 'No extra briefing over the prepared city');
    assert.equal(h.heap[h.packetIndex + h.config.slots.commandSeq], command + 1, 'Activation only issues start, not another prepare');
    assert.equal(h.snapshot().stage, 'starting');
    assert.equal(h.counts().mainEntries, 1); assert.equal(h.scripts.length, 1); assert.equal(h.scripts[0], before);
    assert.equal(h.counts().interactionCount, 1); assert.equal(h.document.activeElement, h.nodes.get('canvas'));
    h.setPacket({ phase: h.config.phases.playing, ackSeq: h.heap[h.packetIndex + h.config.slots.commandSeq], heartbeat: 20 });
    h.frame(); assert.equal(h.snapshot().stage, 'playing');
  } finally { h.destroy(); }
});

test('warm fade settling excludes media pause, hidden time and stale game-clock jumps', async () => {
  const h = makeHarness({ warmup: true, continuous: true });
  try {
    await h.boot(); h.nativeReady();
    for (let n = 1; n <= 3; n++) { h.setPacket({ nativeTimer: n * 100, heartbeat: n + 2 }); h.frame(100); }
    h.message({ type: 'vice:preferences', paused: true, muted: false }); h.visibility(true);
    h.tick(60000); assert.equal(h.frame(60000), false); assert.notEqual(h.snapshot().stage, 'warmed');
    h.visibility(false); h.message({ type: 'vice:preferences', paused: false, muted: false });
    h.setPacket({ nativeTimer: 90000, heartbeat: 7 }); h.frame(60000);
    assert.notEqual(h.snapshot().stage, 'warmed', 'a clock jump cannot finish the visual settle by itself');
    finishWarmFade(h, 90000);
    assert.equal(h.counts().interactionCount, 0);
  } finally { h.destroy(); }
});

test('warm native rejects an unsolicited playing or completion packet without credit or focus', async () => {
  for (const phaseName of ['playing', 'complete']) {
    const h = makeHarness({ warmup: true });
    try {
      await h.boot(); h.nativeReady();
      h.setPacket({ phase: h.config.phases[phaseName] }); h.frame();
      assert.equal(h.snapshot().stage, 'error'); assert.equal(h.snapshot().errorCode, 'C-WARMUP');
      assert.equal(h.messages.some(row => row.message.type === 'vice:complete'), false);
      assert.equal(h.context.ViceRange.activate(), false); assert.equal(h.counts().interactionCount, 0);
    } finally { h.destroy(); }
  }
});

test('warm assembly yields to parent media pause and disposal cancels the held continuation', async () => {
  const h = makeHarness({ warmup: true, stallManifest: true });
  try {
    const pending = h.start(); await new Promise(setImmediate);
    h.message({ type: 'vice:preferences', paused: true, muted: false });
    await h.finishManifest(); await new Promise(setImmediate);
    assert.equal(h.assetRequests.length, 0); assert.equal(h.scripts.length, 0);
    h.destroy(); await pending;
    assert.equal(h.scripts.length, 0); assert.equal(h.timers.size, 0);
    assert.equal(h.context.ViceRange.activate(), false);
  } finally { h.destroy(); }
});

test('activation while warm boot is still loading continues one runtime and rejects wrong senders', async () => {
  const h = makeHarness({ warmup: true, stallManifest: true, continuous: true });
  try {
    const pending = h.start(); await new Promise(setImmediate);
    h.message({ type: 'vice:activate' }, { source: {} }); assert.equal(h.snapshot().warmup, true);
    h.message({ type: 'vice:activate', session: 'stale' }); assert.equal(h.snapshot().warmup, true);
    h.message({ type: 'vice:activate' }); assert.equal(h.snapshot().warmup, false);
    await h.finishManifest(); await pending; await h.boot();
    assert(h.requestPriorities.every(priority => priority === 'high'));
    h.nativeReady(); assert.equal(h.snapshot().stage, 'briefing');
    assert.equal(h.scripts.length, 1); assert.equal(h.counts().mainEntries, 1);
    assert.equal(h.messages.filter(row => row.message.type === 'vice:ready').length, 1);
    assert.equal(h.messages.some(row => row.message.type === 'vice:warmed'), false);
  } finally { h.destroy(); }
});

test('warm parent bridge keeps one iframe, suppresses background results and activates idempotently', () => {
  const listeners = new Map(), sent = [], completed = [], ready = [], warmReady = [];
  let created = 0, mounted = 0, removed = false;
  const frame = { contentWindow: { postMessage: value => sent.push(copy(value)) }, addEventListener() {}, remove() { removed = true; } };
  const context = { location: { origin: ORIGIN }, crypto: { randomUUID: () => SESSION },
    document: { createElement: () => { created++; return frame; } },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, '../vice-port.js'), 'utf8'), context);
  const port = context.GTAVicePort.mount({ replaceChildren: () => { mounted++; } }, { edition: 14, examMode: true, warmup: true,
    onReady: value => ready.push(value), onWarmReady: value => warmReady.push(value), onComplete: value => completed.push(value) });
  const deliver = (type, extra = {}, overrides = {}) => listeners.get('message')?.(Object.assign({ origin: ORIGIN, source: frame.contentWindow, data: { type: 'vice:' + type, session: SESSION, ...extra } }, overrides));
  const result = { engine: 'vice-city-wasm', version: 3, scene: 1, completed: true };
  assert.equal(frame.tabIndex, -1); assert.match(frame.src, /warmup=1/); assert.equal(port.startScene(), false);
  deliver('complete', { result }); deliver('ready', { scene: 1 }); assert.equal(completed.length, 0); assert.equal(ready.length, 0);
  deliver('state', { state: { engine: 'vice-city-wasm', version: 3, scene: 1, stage: 'warmed' } });
  deliver('warmed', { scene: 1 }, { source: {} }); assert.equal(warmReady.length, 0);
  deliver('warmed', { scene: 1 }); deliver('warmed', { scene: 1 }); assert.equal(warmReady.length, 1);
  assert.equal(port.setScene(2), false); assert.equal(port.activate(), true); assert.equal(frame.tabIndex, 0);
  const count = sent.length; assert.equal(port.activate(), true); assert.equal(sent.length, count);
  deliver('mounted'); assert(sent.filter(item => item.type === 'vice:activate').length >= 2, 'early activation is replayed on native mount');
  deliver('ready', { scene: 1 }); assert.equal(ready.length, 1);
  deliver('complete', { result }); assert.equal(completed.length, 1);
  assert.equal(created, 1); assert.equal(mounted, 1);
  const late = listeners.get('message'); port.destroy();
  late({ origin: ORIGIN, source: frame.contentWindow, data: { type: 'vice:complete', session: SESSION, result } });
  assert.equal(completed.length, 1); assert.equal(removed, true); assert.equal(port.activate(), false);
});

test('warm GPU failure stays silent and exposes a current-version error for foreground fallback', async () => {
  const h = makeHarness({ edition: 14, warmup: true, webgl2: false });
  try {
    await h.start();
    assert.equal(h.snapshot().stage, 'error'); assert.equal(h.snapshot().version, 3);
    assert.equal(h.snapshot().errorCode, 'C-GPU'); assert.equal(h.assetRequests.length, 0);
    assert.equal(h.counts().interactionCount, 0); assert.equal(h.document.activeElement, undefined);
    assert.equal(h.context.ViceRange.activate(), false);
    assert.equal(h.messages.some(row => row.message.type === 'vice:ready' || row.message.type === 'vice:warmed' || row.message.type === 'vice:complete'), false);
    assert(h.messages.some(row => row.message.type === 'vice:state' && row.message.state.stage === 'error' && row.message.state.version === 3));
  } finally { h.destroy(); }
});

test('RC4.2 C1 guides to the actual parked helicopter after the Uzi pickup', async () => {
  const h = makeHarness({ edition: 15, continuous: true });
  try {
    await h.boot(); h.playing(1);
    assert.equal(h.config.scenes[0].targetModel, 217, 'The copy must describe a real packaged Maverick');
    assert.equal(h.nodes.get('mission-objective').textContent, 'Подбери Узи у красной метки.');
    h.setPacket({ pickupCollected: 1 }); h.frame();
    assert.equal(h.nodes.get('mission-objective').textContent, 'Взорви вертолёт у красной метки.');
    assert.equal(h.nodes.get('fire-label').textContent, 'Очередь');
    assert.equal(h.messages.some(row => row.message.type === 'vice:complete'), false);
  } finally { h.destroy(); }
});

test('RC4.2 RPG guidance follows remaining native targets, including out-of-order hits', async () => {
  const h = makeHarness({ edition: 15, continuous: true });
  try {
    await h.boot(); h.playing(3);
    const objective = () => h.nodes.get('mission-objective').textContent;
    assert.equal(objective(), 'Подбери РПГ у красной метки.');
    h.setPacket({ pickupCollected: 1 }); h.frame();
    assert.equal(objective(), 'Взорви машину у красной метки.');
    h.setPacket({ target1_credited: 1, target1_destroyed: 1, target1_health: 0 }); h.frame();
    assert.equal(objective(), 'Осталась одна машина. Взорви её.');
    h.setPacket({ target2_credited: 1, target2_destroyed: 1, target2_health: 0 }); h.frame();
    assert.equal(objective(), 'Осталась одна машина. Взорви её.', 'An early helicopter hit must not hide the remaining ground target');
    h.setPacket({ target0_credited: 1, target0_destroyed: 1, target0_health: 0 });
    const heapBefore = Array.from(h.heap); h.frame();
    assert.equal(objective(), 'Практика завершена.');
    assert.deepEqual(Array.from(h.heap), heapBefore, 'HUD guidance must not write its own native score or outcome');
    assert.equal(h.messages.some(row => row.message.type === 'vice:complete'), false, 'Only a native completion packet can finish the scene');
  } finally { h.destroy(); }
});

test('RC4.2 RPG guidance skips a destroyed uncredited target and reveals the airborne finale', async () => {
  const h = makeHarness({ edition: 15 });
  try {
    await h.boot(); h.playing(3);
    h.setPacket({ pickupCollected: 1, target0_destroyed: 1, target0_credited: 0, target0_health: 0 }); h.frame();
    assert.equal(h.nodes.get('mission-objective').textContent, 'Осталась одна машина. Взорви её.');
    h.setPacket({ target1_destroyed: 1, target1_credited: 1, target1_health: 0 }); h.frame();
    assert.equal(h.nodes.get('mission-objective').textContent, 'Теперь вверх. Сбей вертолёт.');
    assert.equal(h.heap[h.packetIndex + h.config.slots.target0_credited], 0, 'Skipping a destroyed objective must not grant credit');
  } finally { h.destroy(); }
});

test('RC4.2 chase guidance returns to the car when the player exits and uses actual helicopter activation', async () => {
  const h = makeHarness({ edition: 15, continuous: true });
  try {
    await h.boot(); h.playing(2);
    assert.equal(h.nodes.get('mission-objective').textContent, 'Подойди к двери. Нажми «Сесть».');
    h.setPacket({ hijacked: 1, inCar: 1, chaseActivated: 1 }); h.frame();
    assert.equal(h.nodes.get('mission-objective').textContent, 'По набережной к красной метке.');
    assert.notEqual(h.nodes.get('native-toast').textContent, 'Рация: воздух подключился.', 'Hijack alone does not mean the chase helicopter has spawned');
    h.setPacket({ chaseStage: 1, chaseHeli: 42 }); h.frame();
    assert.equal(h.nodes.get('native-toast').textContent, 'Рация: воздух подключился.');
    h.setPacket({ inCar: 0 }); h.frame();
    assert.equal(h.nodes.get('mission-objective').textContent, 'Вернись за руль. Нажми «Сесть».');
    assert.equal(h.nodes.get('drive-enter').textContent, 'Сесть');
  } finally { h.destroy(); }
});

test('RC4.4 direct-driving guidance reads native route facts and never asks for a courier or stop', async () => {
  const h=makeHarness({edition:16,continuous:true});
  try {
    await h.boot();h.playing(2);
    h.setPacket({hijacked:1,inCar:1,routeStage:1,sceneDeadline:155000,nativeTimer:5000});h.frame();
    assert.equal(h.nodes.get('mission-objective').textContent,'Держись правее трамплина. Езжай к метке.');
    assert.equal(h.nodes.get('mission-time').textContent,'Осталось 02:30');
    const expected=['Дальше по набережной. Просто держи газ.','За поворотом — РПГ. Продолжай ехать.','Доезжай до последней метки. РПГ там.'];
    for(let stage=2;stage<=4;stage++){
      h.setPacket({routeStage:stage});h.frame();assert.equal(h.nodes.get('mission-objective').textContent,expected[stage-2]);
      assert.equal(h.nodes.get('range-instruction').textContent,'Джойстик: вверх — газ, в стороны — руль.');
      assert.equal(h.heap[h.packetIndex+h.config.slots.driveCompleted],0);
    }
    h.setPacket({inCar:0});h.frame();assert.equal(h.nodes.get('mission-objective').textContent,'Вернись за руль. Нажми «Сесть».');
    const before=Array.from(h.heap);h.frame();assert.deepEqual(Array.from(h.heap),before);
    assert.equal(h.messages.some(row=>row.message.type==='vice:complete'),false);
  } finally {h.destroy();}
});

test('RC4.4 arrival guidance never points at an unreleased pickup or enables early firing', async () => {
  const h=makeHarness({edition:16,continuous:true});
  try {
    await h.boot();h.playing(1);h.setPacket({pickupCollected:0,pickup:-1,arrivalStage:1});h.frame();
    assert.equal(h.nodes.get('mission-objective').textContent,'Вертолёт садится прямо перед тобой.');
    assert.equal(h.nodes.get('native-ammo').textContent,'Высадка');assert.equal(h.nodes.get('native-fire').disabled,true);
    for(const [arrivalStage,text] of [[2,'Экипаж выходит. Смотри перед вертолётом.'],[3,'Гости идут сюда. Сейчас начнётся.']]){
      h.setPacket({arrivalStage});h.frame();assert.equal(h.nodes.get('mission-objective').textContent,text);
    }
    h.setPacket({arrivalStage:4,pickup:50});h.frame();assert.equal(h.nodes.get('mission-objective').textContent,'Подбери Узи у красной метки.');
    assert.equal(h.nodes.get('native-fire').disabled,true);
    h.setPacket({pickupCollected:1});h.frame();assert.equal(h.nodes.get('mission-objective').textContent,'Взорви вертолёт у красной метки.');
    assert.equal(h.nodes.get('native-fire').disabled,false);
  } finally {h.destroy();}
});

test('RC4.3 embedded C finale uses identical neutral completion text for clear and failure before the commission', async () => {
  const visible=[];
  for(const cleared of [true,false]) {
    const h=makeHarness({edition:16,continuous:true});
    try {
      await h.boot();h.playing(3);h.nativeComplete(3,cleared);
      visible.push(['complete-title','complete-detail','complete-next-label','complete-countdown'].map(id=>h.nodes.get(id).textContent));
      assert.equal(h.nodes.get('complete-rating').hidden,true);assert.equal(h.nodes.get('native-again').hidden,true);
      assert.equal(h.nodes.get('native-next').hidden,true);assert.equal(h.nodes.get('native-toast').className,'');
      assert.equal(h.nodes.get('complete-title').textContent,'Практика завершена.');
    } finally {h.destroy();}
  }
  assert.deepEqual(visible[0],visible[1]);
});

test('RC4.2 standalone shows one C rating after all scenes using actual partial native results', async () => {
  const h = makeHarness({ edition: 15, continuous: true, examMode: false });
  try {
    await h.boot(); h.playing(1);
    h.setPacket({ phase: h.config.phases.complete, completed: 1, outcome: 1, ammo: 39, target0_health: 0, target0_credited: 1, target0_destroyed: 1 }); h.frame(); h.frame(700);
    assert.equal(h.nodes.get('complete-rating').hidden, true);
    h.playing(2);
    h.setPacket({ phase: h.config.phases.complete, completed: 1, outcome: 3, hijacked: 1, driveCompleted: 0 }); h.frame(); h.frame(700);
    assert.equal(h.nodes.get('complete-rating').hidden, true);
    h.playing(3);
    h.setPacket({ phase: h.config.phases.complete, completed: 1, outcome: 2, ammo: 0, target0_health: 0, target0_credited: 1, target0_destroyed: 1 }); h.frame(); h.frame(1900);
    const rating = h.nodes.get('complete-rating');
    assert.equal(rating.hidden, false);
    assert.equal(rating.getAttribute('aria-label'), 'Часть C: 21 из 36 баллов, 3 из 5 звёзд');
    assert.match(rating.innerHTML, /21 \/ 36/);
    assert.equal(h.messages.filter(row => row.message.type === 'vice:complete').length, 3);
  } finally { h.destroy(); }
});

test('RC4.2 embedded C leaves its rating to the final exam commission', async () => {
  const h = makeHarness({ edition: 15 });
  try {
    await h.boot(); h.playing(3); h.nativeComplete(3);
    assert.equal(h.nodes.get('complete-rating').hidden, true);
    assert.equal(h.nodes.get('complete-detail').textContent, 'Оценку объявит комиссия.');
  } finally { h.destroy(); }
});
