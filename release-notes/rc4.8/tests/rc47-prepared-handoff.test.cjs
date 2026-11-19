'use strict';

// Executes the production native JS bridge against packaged manifests/bytes.
// RAM retention and progress are observed at the parent service boundary; the
// WASM, GPU and native game are deliberately not run in this VM contract test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function harness(options = {}) {
  const fixturePath = path.join(__dirname, 'vice-port.test.cjs');
  const source = fs.readFileSync(fixturePath, 'utf8');
  const boundary = source.indexOf("\ntest('VM contract:");
  assert(boundary > 0);
  const scope = { require: createRequire(fixturePath), __dirname, Buffer, URL, URLSearchParams, TextEncoder, AbortController, Blob, console, module: { exports: {} } };
  vm.runInNewContext(source.slice(0, boundary) + '\nmodule.exports = makeHarness;', scope, { filename: fixturePath });
  return scope.module.exports({ edition: 17, continuous: true, preparedFraction: 1, reportEachLeaf: true, ...options });
}

function warmCity(h) {
  h.nativeReady();
  for (let step = 1; step <= 10 && h.snapshot().stage !== 'warmed'; step++) {
    h.setPacket({ nativeTimer: step * 100, heartbeat: 2 + step });
    h.frame(100);
  }
  assert.equal(h.snapshot().stage, 'warmed');
}

test('native handoff seeds all prepared logical bytes and never rolls back during leaf assembly', async () => {
  const h = harness({ preparedFraction: 0.65 });
  const percentages = [];
  Object.defineProperty(h.nodes.get('load-progress'), 'value', {
    set(value) { percentages.push(value); }, get() { return percentages.at(-1); }
  });
  try {
    await h.boot();
    assert.equal(h.preparedCalls.length, 1);
    const seed = h.preparedCalls[0];
    assert(seed.loadedBytes > 0 && seed.loadedBytes < seed.totalBytes);
    assert.equal(Object.keys(seed.files).length, h.assetRequests.length,
      'The seed must include data, both engine resources, models and every district resource');
    assert.deepEqual(Object.keys(seed.files).sort(), [...h.assetRequests].sort());
    assert.equal(percentages[0], Math.floor(seed.loadedBytes / seed.totalBytes * 100),
      'The first known byte percentage starts from retained parent bytes, not zero');
    assert(percentages.length > h.assetRequests.length,
      'Multiple leaves of already prepared logical resources exercise the lower per-file callbacks');
    assert(percentages.every((value, index) => index === 0 || value >= percentages[index - 1]),
      'Assembling early leaves must not subtract already prepared later leaves');
    assert.equal(percentages.at(-1), 100);
    assert.equal(h.nodes.get('load-percent').textContent, '',
      'After verified bytes reach 100%, engine initialization is honestly indeterminate');
    assert.equal(h.nodes.get('native-loading').dataset.loadStep, 'engine');
    assert.equal(h.sessionReleases.length, 0, 'Installing FS files is not yet a usable foreground frame');
  } finally { h.destroy(); }
});

test('hidden warm city retains parent fallback until its first acknowledged foreground frame', async () => {
  const h = harness({ warmup: true });
  try {
    await h.boot();
    assert(h.writes.length > 0);
    assert.equal(h.sessionReleases.length, 0, 'Warm runtime init must not release fallback needed if this iframe is discarded');
    warmCity(h);
    assert.equal(h.sessionReleases.length, 0, 'Settled warm briefing keeps its only fallback bytes');
    h.visibility(true);
    assert.equal(h.frame(60000), false);
    h.visibility(false);
    assert.equal(h.sessionReleases.length, 0);
    const before = { assets: h.assetRequests.length, requests: h.requests.length, script: h.scripts[0] };
    assert.equal(h.context.ViceRange.activate(), true);
    assert.equal(h.snapshot().stage, 'starting');
    assert.equal(h.sessionReleases.length, 0, 'Activation alone is not proof that the city has started');
    h.frame();
    assert.equal(h.sessionReleases.length, 0, 'The native start command still needs acknowledgment');
    h.setPacket({ phase: h.config.phases.playing, ackSeq: h.heap[h.packetIndex + h.config.slots.commandSeq], heartbeat: 20 });
    h.frame();
    assert.equal(h.snapshot().stage, 'playing');
    assert.equal(h.sessionReleases.length, 1);
    assert.equal(h.sessionReleases[0].state.warmup, false);
    assert.equal(h.sessionReleases[0].state.stage, 'playing');
    assert(h.sessionReleases[0].writes > 0);
    assert.equal(h.sessionReleases[0].mainEntries, 1);
    assert(h.timeline.indexOf('prepared-session-released') > h.timeline.indexOf('main'));
    h.frame(); h.frame();
    assert.equal(h.sessionReleases.length, 1, 'Ongoing frames do not repeatedly clear newly prepared session bytes');
    assert.equal(h.assetRequests.length, before.assets);
    assert.equal(h.requests.length, before.requests);
    assert.equal(h.scripts.length, 1);
    assert.equal(h.scripts[0], before.script);
    assert.equal(h.counts().mainEntries, 1, 'Foreground activation adopts the existing runtime');
  } finally { h.destroy(); }
});

test('discarding a prepared hidden iframe does not clear the parent RAM needed to recreate it', async () => {
  const h = harness({ warmup: true });
  try {
    await h.boot(); warmCity(h);
    h.destroy();
    assert.equal(h.sessionReleases.length, 0);
    assert.equal(h.context.ViceRange.activate(), false);
  } finally { h.destroy(); }
});

test('foreground direct launch releases once after an acknowledged frame, never on FS install or an error', async () => {
  const h = harness();
  try {
    await h.boot();
    assert.equal(h.sessionReleases.length, 0);
    h.nativeReady();
    assert.equal(h.snapshot().stage, 'starting');
    assert.equal(h.sessionReleases.length, 0);
    h.setPacket({ phase: h.config.phases.playing, ackSeq: h.heap[h.packetIndex + h.config.slots.commandSeq], heartbeat: 20 });
    h.frame(); h.frame();
    assert.equal(h.sessionReleases.length, 1);
  } finally { h.destroy(); }
  const failed = harness();
  try {
    await failed.boot();
    failed.context.Module.onAbort('Synthetic engine abort before any usable frame');
    failed.frame();
    assert.equal(failed.snapshot().stage, 'error');
    assert.equal(failed.sessionReleases.length, 0, 'An unsuccessful engine must leave prepared parent bytes available for retry');
  } finally { failed.destroy(); }
});
