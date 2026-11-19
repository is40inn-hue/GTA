'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Capture = require('../dist/native-vc/highlight-capture.js');

// The encoder and pixels are controlled fixtures. These tests prove scheduling,
// packet ownership and safeguards, not real GPU output or visual explosion QA.
function canvasFixture() {
  const state = { pattern: 'fire', denied: false, oversized: false, png: false, copies: 0, encodes: 0, canvases: [] };
  const source = { width: 1080, height: 1920 };
  function createCanvas() {
    const node = { width: 0, height: 0 };
    state.canvases.push(node);
    node.getContext = () => ({
      drawImage(input) { assert.equal(input, source); state.copies++; if (state.denied) throw Object.assign(new Error('Tainted'), { name: 'SecurityError' }); },
      getImageData(x, y, width, height) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
          const n = i / 4;
          const gray = state.pattern === 'black' ? 0 : state.pattern === 'white' ? 255 : n % 2 ? 42 : 118;
          const flame = state.pattern === 'fire' ? n < 8 : state.pattern === 'larger-fire' ? n < 30 : false;
          data.set(flame ? [255, 125, 15, 255] : [gray, gray, gray, 255], i);
        }
        return { data };
      }
    });
    node.toDataURL = (mime, quality) => {
      assert.equal(mime, 'image/jpeg'); assert(quality <= .8); state.encodes++;
      return state.png ? 'data:image/png;base64,AAAA' : 'data:image/jpeg;base64,/9j/' + (state.oversized ? 'A'.repeat(480000) : 'A'.repeat(state.pattern === 'larger-fire' ? 108 : 104));
    };
    return node;
  }
  return { state, source, createCanvas };
}
function harness() {
  const fixture = canvasFixture(), emitted = [];
  let clock = 1000;
  const capture = Capture.create({ canvas: fixture.source, createCanvas: fixture.createCanvas,
    now: () => clock, timestamp: () => 1800000000000 + clock, onHighlight: value => emitted.push(value) });
  function frame(value = {}, ms = 17) {
    clock += ms;
    capture.frame({ rendered: true, scene: 1, stage: 'playing', active: true, warmup: false, targets: [], ...value });
  }
  return { ...fixture, emitted, capture, frame };
}

test('capture waits for rendered active gameplay, never warmup or a timer/briefing', () => {
  const h = harness(), destroyed = [{ credited: true, destroyed: true }];
  for (const condition of [{ warmup: true }, { active: false }, { stage: 'briefing' }, { stage: 'preparing' }, { rendered: false }]) {
    h.frame({ ...condition, targets: destroyed }, 5000);
  }
  assert.equal(h.state.copies, 0); assert.equal(h.capture.getHighlight(), null);
  h.frame({ targets: [{ credited: false, destroyed: true }] });
  assert.equal(h.state.copies, 0, 'Uncredited damage does not schedule an explosion');
  h.frame({ targets: destroyed });
  assert.equal(h.emitted.length, 1); assert.equal(h.emitted[0].kind, 'explosion');
  assert.equal(h.emitted[0].priority, 60); assert.equal(h.emitted[0].target, 0);
  assert.equal(h.emitted[0].width, 540); assert.equal(h.emitted[0].height, 960);
});

test('one destruction schedules only three sampled frames and picks the brighter actual blast', () => {
  const h = harness(), payload = { targets: [{ credited: true, destroyed: true }] };
  h.frame(payload); const first = h.capture.getHighlight();
  assert.equal(h.state.copies, 2, 'First candidate is the actual destruction frame');
  h.state.pattern = 'larger-fire'; h.frame(payload, 100); h.frame(payload, 39);
  assert.equal(h.state.copies, 2, 'No second readback before 140 active ms');
  h.frame(payload, 1);
  assert.equal(h.emitted.length, 2); assert(h.capture.getHighlight().sequence > first.sequence);
  assert.equal(h.state.copies, 4, 'Second candidate samples at 140 active ms');
  const winner = h.capture.getHighlight();
  h.state.pattern = 'black';
  h.capture.pause(); h.frame(payload, 30000);
  assert.equal(h.state.copies, 4, 'A long pause does not consume the capture window');
  h.frame(payload, 100); h.frame(payload, 79);
  assert.equal(h.state.copies, 4, 'No third readback before 320 active ms');
  h.frame(payload, 1);
  assert.equal(h.state.copies, 5, 'Third candidate is probed at 320 ms; black is not exported');
  for (let i = 0; i < 20; i++) h.frame(payload, 100);
  assert.deepEqual(h.capture.getHighlight(), winner);
  assert(h.state.copies <= 5, 'Three probes and at most two selected image copies');
  assert.equal(h.state.encodes, 2, 'No continuous screenshot encoding');
  winner.dataUrl = 'changed'; assert.notEqual(h.capture.getHighlight().dataUrl, 'changed');
});

test('C3 helicopter wins over car explosions, future shots and empty frames', () => {
  const h = harness();
  h.frame({ targets: [{ credited: true, destroyed: true }] });
  h.frame({ scene: 3, targets: [{ credited: true, destroyed: true }] });
  assert.equal(h.capture.getHighlight().priority, 80);
  h.frame({ scene: 3, targets: [{ credited: true, destroyed: true }, {}, { credited: true, destroyed: true }] });
  const helicopter = h.capture.getHighlight();
  assert.equal(helicopter.priority, 100); assert.equal(helicopter.target, 2);
  h.state.pattern = 'black';
  for (let i = 0; i < 8; i++) h.frame({ scene: 3, targets: [{ credited: true, destroyed: true }, { credited: true, destroyed: true }, { credited: true, destroyed: true }] }, 100);
  assert.deepEqual(h.capture.getHighlight(), helicopter);
});

test('missing fire stays honest gameplay; a real earlier explosion is retained', () => {
  const h = harness();
  h.frame({ targets: [{ credited: true, destroyed: true }] });
  const explosion = h.capture.getHighlight(); h.state.pattern = 'scene';
  for (let i = 0; i < 12; i++) h.frame({ scene: 3, targets: [{ credited: true, destroyed: true }, {}, { credited: true, destroyed: true }] }, 100);
  assert.deepEqual(h.capture.getHighlight(), explosion);
  const other = harness(); other.state.pattern = 'scene';
  other.frame({ targets: [{ credited: true, destroyed: true }] });
  assert.equal(other.capture.getHighlight().kind, 'gameplay');
  assert.equal(other.capture.getHighlight().target, -1);
});

test('scene fallback has no fake explosion and pauses cannot advance capture time', () => {
  const h = harness(); h.state.pattern = 'scene';
  h.frame(); h.frame({}, 100);
  h.frame({ active: false }, 30000); h.frame({}, 30000);
  assert.equal(h.capture.getHighlight(), null);
  for (let i = 0; i < 8; i++) h.frame({}, 100);
  assert.equal(h.capture.getHighlight().kind, 'gameplay');
  assert.equal(h.capture.getHighlight().priority, 10);
});

test('black, uniform, unsupported, oversized and denied canvases fail without interrupting play', () => {
  for (const pattern of ['black', 'white']) {
    const h = harness(); h.state.pattern = pattern;
    assert.doesNotThrow(() => h.frame({ targets: [{ credited: true, destroyed: true }] }));
    assert.equal(h.capture.getHighlight(), null); assert.equal(h.state.encodes, 0);
  }
  for (const key of ['oversized', 'png', 'denied']) {
    const h = harness(); h.state[key] = true;
    assert.doesNotThrow(() => h.frame({ targets: [{ credited: true, destroyed: true }] }));
    assert.equal(h.capture.getHighlight(), null); assert(h.state.encodes <= 2);
  }
});

test('destroy clears resources and no further frames or callbacks survive', () => {
  const h = harness(); h.frame({ targets: [{ credited: true, destroyed: true }] });
  h.capture.destroy(); const copied = h.state.copies, emitted = h.emitted.length;
  h.frame({ scene: 3, targets: [{ credited: true, destroyed: true }] }, 1000);
  assert.equal(h.capture.getHighlight(), null); assert.equal(h.state.copies, copied); assert.equal(h.emitted.length, emitted);
  assert(h.state.canvases.every(canvas => canvas.width === 1 && canvas.height === 1));
});

function bridgeHarness(warmup = false) {
  const listeners = new Map(), updates = [], sent = [];
  const frame = { contentWindow: { postMessage: value => sent.push(value) }, addEventListener() {}, remove() {} };
  const root = { document: { createElement: () => frame }, crypto: { randomUUID: () => 'capture-session' }, location: { origin: 'https://exam.test' },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  root.window = root;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/vice-port.js'), 'utf8'), root);
  const port = root.GTAVicePort.mount({ replaceChildren() {} }, { edition: 14, examMode: true, warmup, onHighlight: value => updates.push(value) });
  function message(data, override = {}) {
    listeners.get('message')?.({ origin: root.location.origin, source: frame.contentWindow, data: { session: 'capture-session', ...data }, ...override });
  }
  const state = stage => message({ type: 'vice:state', state: { engine: 'vice-city-wasm', version: 3, scene: 1, stage } });
  return { root, port, message, state, updates, frame };
}
function payload() {
  return { dataUrl: 'data:image/jpeg;base64,/9j/AAAA', width: 540, height: 960, scene: 1,
    kind: 'explosion', target: 0, priority: 60, capturedAt: 1800000000000, sequence: 1 };
}

test('bridge accepts only authenticated current-scene bounded JPEG highlights, once per sequence', () => {
  const h = bridgeHarness(); h.state('playing');
  const event = { type: 'vice:highlight', version: 1, highlight: payload() };
  h.message(event, { origin: 'https://elsewhere.test' }); h.message(event, { source: {} });
  h.message({ ...event, session: 'another-session' });
  for (const invalid of [{ dataUrl: 'https://remote.test/image.jpg' }, { dataUrl: 'data:image/svg+xml,script' },
    { dataUrl: 'data:image/jpeg;base64,/9j/' + 'A'.repeat(480000) }, { scene: 2 }, { width: 961 }, { height: 0 },
    { sequence: 0 }, { sequence: 16 }, { priority: 100 }, { capturedAt: 0 }, { target: 5 }]) {
    h.message({ ...event, highlight: { ...payload(), ...invalid } });
  }
  assert.equal(h.updates.length, 0); assert.equal(h.port.getHighlight(), null);
  h.message(event); h.message(event);
  assert.equal(h.updates.length, 1); assert.equal(h.port.getHighlight().priority, 60);
  const copy = h.port.getHighlight(); copy.dataUrl = 'mutated'; assert.notEqual(h.port.getHighlight().dataUrl, 'mutated');
  h.message({ ...event, highlight: { ...payload(), sequence: 2, kind: 'gameplay', target: -1, priority: 10 } });
  assert.equal(h.updates.length, 1, 'A later weak frame cannot replace an explosion');
  h.port.destroy(); h.message({ ...event, highlight: { ...payload(), sequence: 3 } });
  assert.equal(h.port.getHighlight(), null); assert.equal(h.updates.length, 1);
});

test('bridge refuses warm/preparing capture and resets image ownership on explicit restart', () => {
  const h = bridgeHarness(true), event = { type: 'vice:highlight', version: 1, highlight: payload() };
  h.message(event); assert.equal(h.port.getHighlight(), null);
  h.port.activate(); h.state('preparing'); h.message(event); assert.equal(h.port.getHighlight(), null);
  h.state('playing'); h.message(event); assert(h.port.getHighlight());
  h.message({ type: 'vice:restart' }); assert.equal(h.port.getHighlight(), null);
});

// Reuse the already-reviewed native fixture definitions without registering its
// separate test cases. The real native.js, config/SCM and readNative are run in VM.
function nativeHarness() {
  const fixturePath = path.join(__dirname, 'vice-port.test.cjs');
  const fixture = fs.readFileSync(fixturePath, 'utf8');
  const boundary = fixture.indexOf("\ntest('VM contract:"); assert(boundary > 0);
  const hook = "  vm.runInContext(SOURCE, context, { filename: 'native.js', timeout: 1000 });";
  let definitions = fixture.slice(0, boundary); assert.equal(definitions.split(hook).length, 2);
  definitions = definitions.replace(hook, "  vm.runInContext(fs.readFileSync(path.join(ROOT, 'highlight-capture.js'), 'utf8'), context, { filename: 'highlight-capture.js' });\n" + hook);
  const scope = { require: createRequire(fixturePath), __dirname, Buffer, URL, URLSearchParams, TextEncoder, AbortController, Blob, console, module: { exports: {} } };
  vm.runInNewContext(definitions + '\nmodule.exports.makeHarness = makeHarness;', scope, { filename: fixturePath });
  return scope.module.exports.makeHarness({ edition: 14, continuous: true });
}

test('native destruction emits the real-frame packet before complete; gameplay result is unchanged', async () => {
  const h = nativeHarness(), f = canvasFixture();
  try {
    await h.boot();
    const source = h.nodes.get('canvas'); source.width = f.source.width; source.height = f.source.height;
    const originalCreate = h.document.createElement;
    h.document.createElement = tag => {
      if (tag !== 'canvas') return originalCreate(tag);
      const node = f.createCanvas(), original = node.getContext;
      node.getContext = (...args) => { const ctx = original(...args), draw = ctx.drawImage; ctx.drawImage = (value, ...rest) => { assert.equal(value, source); return draw(f.source, ...rest); }; return ctx; };
      return node;
    };
    h.playing(1);
    h.setPacket({ phase: h.config.phases.complete, completed: 1, outcome: 1, ammo: 39,
      target0_health: 0, target0_credited: 1, target0_destroyed: 1 });
    h.frame(); assert.equal(h.snapshot().stage, 'finishing');
    assert.equal(h.context.ViceRange.getHighlight().kind, 'explosion');
    h.frame(700); assert.equal(h.snapshot().stage, 'complete');
    const messages = h.messages.map(value => value.message);
    assert(messages.findIndex(value => value.type === 'vice:highlight') < messages.findIndex(value => value.type === 'vice:complete'));
    const result = messages.find(value => value.type === 'vice:complete').result;
    assert.equal(result.targets[0].credited, true); assert.equal(result.targets[0].destroyed, true);
    assert.equal(result.ammoRemaining, 39);
    assert.equal(messages.find(value => value.type === 'vice:highlight').highlight.priority, 60);
    assert.equal(f.state.encodes, 1);
  } finally { h.destroy(); }
});
