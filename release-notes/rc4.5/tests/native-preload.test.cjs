const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');

const assetSource = fs.readFileSync(require.resolve('../dist/native-assets.js'), 'utf8');
const preloadSource = fs.readFileSync(require.resolve('../dist/native-preload.js'), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await new Promise(setImmediate); };

function events(extra = {}) {
  const handlers = new Map();
  return Object.assign(extra, {
    addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
    dispatch(name, target = this) { for (const fn of handlers.get(name) || []) fn({ type: name, target }); }
  });
}
function clock() {
  let time = 0, id = 0;
  const tasks = new Map();
  return {
    now: () => time,
    setTimeout(fn, delay = 0) { const key = ++id; tasks.set(key, { fn, at: time + delay }); return key; },
    clearTimeout(key) { tasks.delete(key); },
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        time = next[1].at; tasks.delete(next[0]); next[1].fn(); await settle();
      }
      time = end; await settle();
    }
  };
}
function fixture() {
  const bytes = new Map();
  function leaf(path, raw, offset) {
    raw = Buffer.from(raw); bytes.set(path, raw);
    return Object.assign({ path, size: raw.length, sha256: sha(raw) }, offset === undefined ? {} : { offset });
  }
  function logical(path, raw, prefix, mimeType) {
    raw = Buffer.from(raw);
    return { path, size: raw.length, sha256: sha(raw), mimeType, chunks: [leaf(prefix + '-001.bin', raw.subarray(0, 4), 0), leaf(prefix + '-002.bin', raw.subarray(4), 4)] };
  }
  const manifest = { version: 1, engine: { js: leaf('index.js', '/*js*/'), wasm: logical('index.wasm', [0, 97, 115, 109, 1, 0, 0, 0], 'data-wasm', 'application/wasm') }, data: logical('index.data', 'abcdefghijk', 'data', 'application/octet-stream') };
  const model = leaf('remote/models/gta3.img/nitestick.txd', 'model-bytes');
  manifest.models = { version: 1, count: 1, size: model.size, files: [model] };
  return { manifest, bytes, leaves: [manifest.engine.js, ...manifest.engine.wasm.chunks, ...manifest.data.chunks, model] };
}
function environment(options = {}) {
  const timer = options.clock || clock();
  const document = events({ currentScript: { src: 'https://exam.test/native-assets.js' }, hidden: false, visibilityState: 'visible', querySelectorAll: () => [] });
  const navigator = { onLine: true, ...options.navigator };
  const root = events({ document, navigator, location: { href: 'https://exam.test/index.html' }, innerHeight: 800, Date: { now: timer.now }, setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout, AbortController, Response, URL, TextEncoder, crypto: webcrypto, console });
  root.window = root;
  root.WebAssembly = new Proxy({}, { get() { throw new Error('Background preparation must never access WebAssembly'); } });
  return { root, timer, context: vm.createContext(root) };
}
function cache() {
  const rows = new Map();
  let deletes = 0;
  return {
    rows,
    get deletes() { return deletes; },
    async match(key) { return rows.get(String(key))?.clone(); },
    async put(key, response) { rows.set(String(key), new Response(await response.arrayBuffer(), { headers: response.headers })); },
    async delete(key) { deletes++; return rows.delete(String(key)); }
  };
}
function assetsHarness(overrides = {}) {
  const env = environment(), data = fixture(), storage = cache(), calls = [];
  env.root.caches = { open: async name => { assert.equal(name, 'gta-ege-native-vc-1'); return storage; } };
  env.root.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const name = new URL(url).pathname.split('/native-vc/runtime/')[1];
    if (name === 'manifest.json') return new Response(JSON.stringify(data.manifest), { headers: { 'Content-Type': 'application/json' } });
    const raw = data.bytes.get(name);
    assert.ok(raw, 'only manifest or declared leaf is fetched');
    return new Response(raw);
  };
  Object.assign(env.root, overrides);
  vm.runInContext(assetSource, env.context, { filename: 'native-assets.js' });
  return { ...env, ...data, storage, calls, api: env.root.GTANativeAssets };
}
function preloadHarness(options = {}) {
  const env = environment(options), data = fixture(), calls = [], states = [];
  let retained = true;
  const api = {
    async cachedStats() { return { available: retained }; },
    async loadManifest() { calls.push({ kind: 'manifest', at: env.timer.now() }); return data.manifest; },
    async getAsset(file, settings) {
      calls.push({ kind: 'asset', file, settings, at: env.timer.now() });
      assert.equal(settings.priority, 'low'); assert.ok(!file.chunks); assert.ok(file.size <= 524288);
      settings.onBytes({ loaded: file.size, total: file.size, source: 'network', path: file.path, cached: retained });
      return new Uint8Array(file.size);
    }
  };
  if (options.assets) Object.assign(api, options.assets);
  env.root.GTANativeAssets = api;
  vm.runInContext(preloadSource, env.context, { filename: 'native-preload.js' });
  const preload = env.root.GTANativePreload;
  preload.subscribe(value => states.push(value));
  return { ...env, ...data, calls, states, api, preload, refuseCache: () => { retained = false; } };
}

test('verified exact-hash cache is reused and JS content type is preserved', async () => {
  const h = assetsHarness();
  const manifest = await h.api.loadManifest();
  const first = await h.api.getAsset(manifest.engine.js, { priority: 'low' });
  assert.equal(Buffer.from(first).toString(), '/*js*/');
  const request = h.calls.find(value => value.url.includes('index.js'));
  assert.equal(new URL(request.url).search, '?v=' + manifest.engine.js.sha256.slice(0, 12));
  assert.equal(h.storage.rows.get(request.url).headers.get('Content-Type'), 'text/javascript');
  const progress = [];
  await h.api.getAsset(manifest.engine.js, { onBytes: value => progress.push(value) });
  assert.equal(h.calls.filter(value => value.url.includes('index.js')).length, 1);
  assert.equal(progress[0].source, 'cache'); assert.equal(progress[0].cached, true);
});

test('corrupt cached bytes are deleted and refetched before use', async () => {
  const h = assetsHarness(), file = h.manifest.engine.js;
  const key = 'https://exam.test/native-vc/runtime/index.js?v=' + file.sha256.slice(0, 12);
  await h.storage.put(key, new Response('BAD!!!'));
  const result = await h.api.getAsset(file);
  assert.equal(Buffer.from(result).toString(), '/*js*/'); assert.equal(h.storage.deletes, 1); assert.equal(h.calls.length, 1);
  assert.equal(sha(Buffer.from(await h.storage.rows.get(key).clone().arrayBuffer())), file.sha256);
});

test('foreground assembly verifies all chunks and the full logical SHA', async () => {
  const h = assetsHarness(), progress = [];
  const bytes = await h.api.getAsset(h.manifest.data, { onBytes: value => progress.push(value.loaded) });
  assert.equal(Buffer.from(bytes).toString(), 'abcdefghijk'); assert.deepEqual(progress, [4, 11]);
  assert.ok(h.calls.every(value => !value.url.includes('index.data')));
  await assert.rejects(h.api.getAsset({ ...h.manifest.data, sha256: '0'.repeat(64) }), { name: 'IntegrityError' });
  await assert.rejects(h.api.getAsset(h.manifest.engine.wasm, { priority: 'low' }), { name: 'IntegrityError' });
  await assert.rejects(h.api.getAsset({ path: 'large.bin', size: 524289, sha256: '1'.repeat(64) }, { priority: 'low' }), { name: 'IntegrityError' });
});

test('high-priority consumer adopts the same inflight chunk when preload is cancelled', async () => {
  const h = assetsHarness();
  let resolveFetch, fetchSignal, calls = 0, lowActivity = 0, highActivity = 0;
  h.root.fetch = (_url, options) => { calls++; fetchSignal = options.signal; return new Promise(resolve => { resolveFetch = resolve; }); };
  const controller = new AbortController(), file = h.manifest.engine.js;
  const low = h.api.getAsset(file, { signal: controller.signal, priority: 'low', onActivity() { lowActivity++; } }).catch(error => error.name);
  const high = h.api.getAsset(file, { priority: 'high', onActivity(event) { assert.equal(event.path, file.path); highActivity++; throw new Error('observer must not break loading'); } });
  await settle(); controller.abort();
  assert.equal(await low, 'AbortError'); assert.equal(fetchSignal.aborted, false); assert.equal(calls, 1);
  resolveFetch(new Response(h.bytes.get('index.js')));
  assert.equal(Buffer.from(await high).toString(), '/*js*/'); assert.equal(calls, 1);
  assert.equal(lowActivity, 0, 'cancelled observers receive no later activity');
  assert.equal(highActivity, 2, 'the adopted consumer receives actual headers and the body chunk');
});

test('aborted sole preload drains before foreground refetch, with no overlapping request', async () => {
  const h = assetsHarness();
  const pending = [];
  let active = 0, peak = 0;
  h.root.fetch = (_url, options) => new Promise((resolve, reject) => {
    active++; peak = Math.max(peak, active);
    pending.push({ resolve: response => { active--; resolve(response); }, signal: options.signal });
    options.signal.addEventListener('abort', () => setImmediate(() => { active--; reject(abortError()); }), { once: true });
  });
  const controller = new AbortController(), file = h.manifest.engine.js;
  const low = h.api.getAsset(file, { signal: controller.signal, priority: 'low' }).catch(error => error.name);
  await settle(); controller.abort();
  const high = h.api.getAsset(file, { priority: 'high' });
  assert.equal(await low, 'AbortError'); await settle();
  assert.equal(pending.length, 2); assert.equal(peak, 1);
  pending[1].resolve(new Response(h.bytes.get('index.js')));
  await high; assert.equal(active, 0);
});

test('CacheStorage failure does not prevent explicit foreground loading', async () => {
  const h = assetsHarness({ caches: { open: async () => { throw new Error('private storage'); } } });
  const bytes = await h.api.getAsset(h.manifest.engine.wasm);
  assert.equal(sha(Buffer.from(bytes)), h.manifest.engine.wasm.sha256);
  const stats = await h.api.cachedStats();
  assert.equal(stats.available, false); assert.equal(stats.readable, false); assert.equal(stats.writable, false);
  assert.equal(stats.cacheFailure.operation, 'open'); assert.equal(stats.cacheFailure.name, 'Error');
});

for (const failure of ['QuotaExceededError', 'Error', 'CacheTimeoutError']) {
  test('failed cache put (' + failure + ') stops writes but foreground reuses and rechecks earlier prepared bytes', async () => {
    const h = assetsHarness(), prepared = h.manifest.engine.js, next = h.manifest.engine.wasm.chunks[0];
    await h.api.getAsset(prepared, { priority: 'low' });
    const key = h.calls.find(call => call.url.includes('index.js')).url;
    let writes = 0, reached;
    const entered = new Promise(resolve => { reached = resolve; });
    h.storage.put = () => {
      writes++; reached();
      if (failure === 'CacheTimeoutError') return new Promise(() => {});
      return Promise.reject(Object.assign(new Error('storage write failed'), { name: failure }));
    };
    const progress = [];
    const loading = h.api.getAsset(next, { priority: 'low', onBytes: value => progress.push(value) });
    await entered; await settle();
    if (failure === 'CacheTimeoutError') await h.timer.advance(1500);
    assert.equal(sha(Buffer.from(await loading)), next.sha256);
    assert.equal(progress.at(-1).cached, false);
    const stats = await h.api.cachedStats();
    assert.equal(stats.available, false, 'automatic preparation stops once it cannot retain new bytes');
    assert.equal(stats.readable, true); assert.equal(stats.writable, false);
    assert.equal(stats.verifiedBytes, prepared.size);
    assert.equal(stats.cacheFailure.operation, 'put'); assert.equal(stats.cacheFailure.name, failure);

    const sources = [], before = h.calls.length;
    const reused = await h.api.getAsset(prepared, { priority: 'high', onBytes: value => sources.push(value) });
    assert.equal(sha(Buffer.from(reused)), prepared.sha256);
    assert.equal(h.calls.length, before, 'foreground does not redownload the prepared leaf after a write failure');
    assert.equal(sources.at(-1).source, 'cache'); assert.equal(sources.at(-1).cached, true);

    // Do not trust an earlier verified marker: even a retained read-only cache
    // entry is checked against the declared SHA on every foreground use.
    h.storage.rows.set(key, new Response('BAD!!!'));
    assert.equal(sha(Buffer.from(await h.api.getAsset(prepared, { priority: 'high' }))), prepared.sha256);
    assert.equal(h.calls.length, before + 1, 'corrupt cached bytes are rejected and fetched again');
    assert.equal(h.storage.deletes, 1);
    assert.equal(writes, 1, 'neither foreground misses nor corruption repair retry failed writes');
    assert.equal((await h.api.cachedStats()).readable, true);
  });
}

test('cache diagnostics expose only an allowlisted error name and return an independent snapshot', async () => {
  const h = assetsHarness();
  h.storage.put = async () => { throw { name: '<img src=x onerror=alert(1)>', message: 'private storage detail' }; };
  await h.api.getAsset(h.manifest.engine.js);
  const stats = await h.api.cachedStats();
  assert.equal(stats.cacheFailure.name, 'Error'); assert.equal(stats.cacheFailure.operation, 'put');
  assert.deepEqual(Object.keys(stats.cacheFailure).sort(), ['name', 'operation']);
  stats.cacheFailure.operation = 'changed';
  assert.equal((await h.api.cachedStats()).cacheFailure.operation, 'put');
});

test('hung CacheStorage.open cannot trap the preload-to-C handoff', async () => {
  const h = assetsHarness({ caches: { open: () => new Promise(() => {}) } });
  vm.runInContext(preloadSource, h.context, { filename: 'native-preload.js' });
  const preload = h.root.GTANativePreload;
  preload.setContext({ screen: 'question', section: 'theory', active: true });
  await h.timer.advance(2500);
  let paused = false;
  const handoff = preload.pause().then(() => { paused = true; });
  await h.timer.advance(1499); assert.equal(paused, false);
  await h.timer.advance(1); await handoff;
  assert.equal(h.calls.length, 0, 'background work did not fall through to a download');
  assert.equal((await h.api.cachedStats()).available, false);
  const bytes = await h.api.getAsset(h.manifest.engine.wasm, { priority: 'high' });
  assert.equal(sha(Buffer.from(bytes)), h.manifest.engine.wasm.sha256);
  assert.equal(preload.getState().loadedBytes, 0);
  preload.destroy();
});

for (const operation of ['match', 'delete', 'body']) {
  test('hung cache ' + operation + ' falls back within its bound and disables further cache waits', async () => {
    const h = assetsHarness(), file = h.manifest.engine.js, progress = [];
    const key = 'https://exam.test/native-vc/runtime/index.js?v=' + file.sha256.slice(0, 12);
    let reached, cancelled = 0;
    const entered = new Promise(resolve => { reached = resolve; });
    if (operation === 'delete') await h.storage.put(key, new Response('BAD!!!'));
    if (operation === 'body') {
      h.storage.match = async () => new Response(new ReadableStream({ start() { reached(); }, cancel() { cancelled++; } }));
    } else h.storage[operation] = () => { reached(); return new Promise(() => {}); };
    const result = h.api.getAsset(file, { onBytes: value => progress.push(value) });
    await entered; await settle();
    await h.timer.advance(1500);
    assert.equal(Buffer.from(await result).toString(), '/*js*/');
    const stats = await h.api.cachedStats();
    assert.equal(stats.available, false); assert.equal(stats.readable, false); assert.equal(stats.writable, false);
    assert.equal(stats.cacheFailure.operation, operation); assert.equal(stats.cacheFailure.name, 'CacheTimeoutError');
    assert.equal(progress.at(-1).cached, false, 'unconfirmed persistence is never counted as prepared');
    const before = h.timer.now();
    assert.equal(Buffer.from(await h.api.getAsset(file)).toString(), '/*js*/');
    assert.equal(h.timer.now(), before, 'failed storage is bypassed for the rest of this helper lifetime');
    if (operation === 'body') assert.equal(cancelled, 1);
  });
}

for (const stalled of ['headers', 'body', 'manifest-body']) {
  test('idle network timeout aborts stalled ' + stalled + ' with an actionable path and permits retry', async () => {
    const h = assetsHarness(), originalFetch = h.root.fetch;
    let signal, cancelled = 0, settled = false;
    const activities = [], options = { onActivity: event => activities.push(event.path) };
    h.root.fetch = async (_url, options) => {
      signal = options.signal;
      if (stalled === 'headers') return new Promise(() => {});
      return new Response(new ReadableStream({
        start(controller) { controller.enqueue(Uint8Array.from([stalled === 'manifest-body' ? 123 : 47])); },
        cancel() { cancelled++; }
      }));
    };
    const request = (stalled === 'manifest-body' ? h.api.loadManifest(options) : h.api.getAsset(h.manifest.engine.js, options))
      .then(value => { settled = true; return value; }, error => { settled = true; return error; });
    await settle(); await h.timer.advance(34999);
    assert.equal(settled, false); assert.equal(signal.aborted, false);
    await h.timer.advance(1);
    const error = await request;
    assert.equal(error.name, 'TimeoutError'); assert.equal(error.code, 'NETWORK_TIMEOUT');
    assert.equal(error.path, stalled === 'manifest-body' ? 'manifest.json' : 'index.js');
    assert.equal(signal.aborted, true);
    assert.deepEqual(activities, stalled === 'headers' ? [] : [error.path, error.path], 'only real headers and body bytes refresh the outer watchdog');
    if (stalled !== 'headers') assert.equal(cancelled, 1);
    h.root.fetch = originalFetch;
    if (stalled === 'manifest-body') assert.equal((await h.api.loadManifest()).version, 1);
    else assert.equal(Buffer.from(await h.api.getAsset(h.manifest.engine.js)).toString(), '/*js*/');
  });
}

test('slow progressing download is allowed beyond 35 seconds and clears its idle timer', async () => {
  const h = assetsHarness(), raw = h.bytes.get('index.js');
  let stream, signal;
  h.root.fetch = async (_url, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start(controller) { stream = controller; } }));
  };
  const result = h.api.getAsset(h.manifest.engine.js);
  await settle();
  await h.timer.advance(20000); stream.enqueue(raw.subarray(0, 2)); await settle();
  await h.timer.advance(30000); stream.enqueue(raw.subarray(2, 4)); await settle();
  await h.timer.advance(30000); stream.enqueue(raw.subarray(4)); stream.close();
  assert.equal(Buffer.from(await result).toString(), '/*js*/');
  assert.equal(signal.aborted, false);
  await h.timer.advance(40000);
  assert.equal(signal.aborted, false, 'a completed request retains no live timeout');
});

test('home/media block preparation; quiet delay and Safari gap yield one small leaf at a time', async () => {
  const h = preloadHarness();
  h.preload.setContext({ screen: 'home', section: 'theory', active: true }); await h.timer.advance(10000); assert.equal(h.calls.length, 0);
  h.preload.setContext({ screen: 'question', section: 'theory', active: true, mediaBusy: true }); await h.timer.advance(5000); assert.equal(h.calls.length, 0);
  h.preload.setContext({ screen: 'question', section: 'theory', active: true, mediaBusy: false });
  await h.timer.advance(199); assert.equal(h.calls.length, 0);
  await h.timer.advance(1); assert.equal(h.calls.filter(value => value.kind === 'asset').length, 1);
  await h.timer.advance(199); assert.equal(h.calls.filter(value => value.kind === 'asset').length, 1);
  await h.timer.advance(1); assert.equal(h.calls.filter(value => value.kind === 'asset').length, 2);
  await h.timer.advance(10000);
  const state = h.preload.getState();
  assert.equal(state.status, 'complete'); assert.equal(state.progress, 1); assert.equal(state.loadedBytes, h.leaves.reduce((sum, value) => sum + value.size, 0));
  assert.ok(h.calls.filter(value => value.kind === 'asset').every(value => !value.file.chunks));
  assert.ok(h.calls.some(value => value.kind === 'asset' && value.file.path === h.manifest.models.files[0].path), 'Models are prepared as verified bytes, without parsing or engine startup');
  h.preload.destroy();
});

test('painted entry cover starts low-priority bytes without an attempt and preserves its queue through intro/A/B', async () => {
  const h = preloadHarness();
  const entry = { screen: 'home', section: '', active: true, eager: true };
  h.preload.setContext(entry); await h.timer.advance(5000); assert.equal(h.calls.length, 0);
  h.preload.setContext({ ...entry, entryReady: true, mediaBusy: true });
  await h.timer.advance(2000); assert.equal(h.calls.length, 0);
  h.preload.setContext({ ...entry, entryReady: true });
  await h.timer.advance(200);
  assert.equal(h.calls.filter(call => call.kind === 'asset').length, 1);
  const prepared = h.preload.getState().loadedBytes;
  h.preload.setContext({ screen: 'stage', section: 'theory', active: true, eager: true });
  await h.timer.advance(200); assert(h.preload.getState().loadedBytes > prepared);
  h.preload.setContext({ screen: 'question', section: 'theory', active: true, eager: true });
  await h.timer.advance(200);
  h.preload.setContext({ screen: 'question', section: 'field', active: true, eager: true });
  await h.timer.advance(2000);
  assert.equal(h.preload.getState().status, 'complete');
  const leaves = h.calls.filter(call => call.kind === 'asset').map(call => call.file.path);
  assert.equal(leaves.length, h.leaves.length); assert.equal(new Set(leaves).size, leaves.length);
  assert.equal(h.calls.filter(call => call.kind === 'manifest').length, 1);
  h.preload.destroy();
});

test('entry-to-intro context handoff retains an in-flight leaf; visible media can still interrupt it', async () => {
  const h = preloadHarness(); let resolveLeaf, signal, requests = 0, aborts = 0;
  h.api.getAsset = (file, options) => {
    requests++; signal = options.signal;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => { aborts++; reject(abortError()); }, { once: true });
      resolveLeaf = () => { options.onBytes({ cached: true }); resolve(new Uint8Array(file.size)); };
    });
  };
  h.preload.setContext({ screen: 'home', entryReady: true, active: true, eager: true });
  await h.timer.advance(700); assert.equal(requests, 1);
  h.preload.setContext({ screen: 'stage', section: 'theory', active: true, eager: true });
  await settle(); assert.equal(signal.aborted, false); assert.equal(aborts, 0);
  resolveLeaf(); await settle(); const retained = h.preload.getState().loadedBytes;
  assert.equal(retained, h.leaves[0].size);
  await h.timer.advance(200); assert.equal(requests, 2);
  h.preload.setContext({ screen: 'question', section: 'theory', active: true, eager: true, mediaBusy: true });
  await settle(); assert.equal(aborts, 1); assert.equal(h.preload.getState().loadedBytes, retained);
  await h.timer.advance(5000); assert.equal(requests, 2);
  h.preload.destroy();
});

test('entry cover yields to input, visibility and data-saving just like A/B', async () => {
  const connection = events({ effectiveType: '4g', saveData: false });
  const h = preloadHarness({ navigator: { connection } });
  h.preload.setContext({ screen: 'home', entryReady: true, active: true, eager: true });
  h.root.document.dispatch('keydown');
  await h.timer.advance(199); assert.equal(h.calls.length, 0);
  h.root.document.hidden = true; h.root.document.dispatch('visibilitychange');
  await h.timer.advance(5000); assert.equal(h.calls.length, 0);
  h.root.document.hidden = false; connection.saveData = true; h.root.document.dispatch('visibilitychange');
  await h.timer.advance(5000); assert.equal(h.calls.length, 0);
  connection.saveData = false; connection.dispatch('change'); await h.timer.advance(700);
  assert.equal(h.calls.filter(call => call.kind === 'asset').length, 1);
  h.preload.destroy();
});

test('saveData, 2g, offline, hidden and TG-inactive suppress all automatic network work', async () => {
  for (const reason of ['save-data', 'slow-connection', 'offline', 'hidden', 'inactive']) {
    const connection = events({ effectiveType: '4g', saveData: reason === 'save-data' });
    if (reason === 'slow-connection') connection.effectiveType = '2g';
    const h = preloadHarness({ navigator: { connection, onLine: reason !== 'offline' } });
    h.root.document.hidden = reason === 'hidden';
    h.preload.setContext({ screen: 'question', section: 'theory', active: reason !== 'inactive' });
    await h.timer.advance(20000);
    assert.equal(h.calls.length, 0, reason); assert.equal(h.preload.getState().reason, reason); h.preload.destroy();
  }
});

test('navigation/media and manual C handoff abort current work and cannot continue preloading C', async () => {
  const h = preloadHarness();
  let active = 0, aborted = 0;
  h.api.getAsset = (_file, options) => new Promise((_resolve, reject) => {
    active++;
    options.signal.addEventListener('abort', () => { active--; aborted++; reject(abortError()); }, { once: true });
  });
  h.preload.setContext({ screen: 'question', section: 'field', active: true }); await h.timer.advance(2500); assert.equal(active, 1);
  h.preload.setContext({ screen: 'question', section: 'field', active: true, mediaBusy: true }); await settle(); assert.equal(active, 0);
  h.preload.setContext({ screen: 'question', section: 'field', active: true, mediaBusy: false }); await h.timer.advance(2500); assert.equal(active, 1);
  await h.preload.pause(); assert.equal(active, 0); assert.equal(aborted, 2);
  h.preload.setContext({ screen: 'stage', section: 'final', active: true }); await h.timer.advance(20000); assert.equal(active, 0); assert.equal(h.preload.getState().reason, 'section');
  h.preload.destroy();
});

test('cache refusal stays quiet and never counts unretained downloads as prepared', async () => {
  const h = preloadHarness(); h.refuseCache();
  h.preload.setContext({ screen: 'question', section: 'theory', active: true }); await h.timer.advance(10000);
  assert.equal(h.calls.length, 0); assert.equal(h.preload.getState().status, 'unavailable'); assert.equal(h.preload.getState().loadedBytes, 0);
  h.preload.destroy();
});

test('A to B preserves verified progress; foreground C pauses background downloads', async () => {
  const h = preloadHarness();
  h.preload.setContext({ screen: 'question', section: 'A', active: true });
  await h.timer.advance(2500);
  const prepared = h.preload.getState().loadedBytes;
  assert.ok(prepared > 0);
  h.preload.setContext({ screen: 'question', section: 'B', active: true });
  await h.timer.advance(199);
  assert.equal(h.preload.getState().loadedBytes, prepared);
  await h.timer.advance(10000);
  assert.equal(h.preload.getState().status, 'complete');
  const paths = h.calls.filter(x => x.kind === 'asset').map(x => x.file.path);
  assert.equal(new Set(paths).size, paths.length, 'retained chunks are not fetched again after A/B navigation');
  await h.preload.pause();
  h.preload.setContext({ screen: 'question', section: 'final', active: true });
  await h.timer.advance(20000);
  assert.equal(h.calls.filter(x => x.kind === 'asset').length, paths.length);
  h.preload.destroy();
});

for (const trigger of ['pointerdown', 'keydown', 'offline', 'visibilitychange', 'blur', 'save-data']) {
  test(trigger + ' aborts inflight preparation and resumes only after a quiet interval', async () => {
    const connection = events({ effectiveType: '4g', saveData: false });
    const h = preloadHarness({ navigator: { connection } });
    const original = h.api.getAsset;
    let aborted = 0;
    h.api.getAsset = (_file, settings) => new Promise((_resolve, reject) => {
      settings.signal.addEventListener('abort', () => { aborted++; reject(abortError()); }, { once: true });
    });
    h.preload.setContext({ screen: 'question', section: 'A', active: true });
    await h.timer.advance(2500);
    if (trigger === 'offline') { h.root.navigator.onLine = false; h.root.dispatch('offline'); }
    else if (trigger === 'visibilitychange') { h.root.document.hidden = true; h.root.document.dispatch(trigger); }
    else if (trigger === 'blur') h.root.dispatch('blur');
    else if (trigger === 'save-data') { connection.saveData = true; connection.dispatch('change'); }
    else h.root.document.dispatch(trigger);
    await settle(); assert.equal(aborted, 1);
    h.api.getAsset = original;
    if (['offline', 'visibilitychange', 'blur', 'save-data'].includes(trigger)) {
      await h.timer.advance(10000);
      assert.equal(h.calls.filter(x => x.kind === 'asset').length, 0);
      if (trigger === 'offline') { h.root.navigator.onLine = true; h.root.dispatch('online'); }
      if (trigger === 'visibilitychange') { h.root.document.hidden = false; h.root.document.dispatch(trigger); }
      if (trigger === 'blur') h.root.dispatch('focus');
      if (trigger === 'save-data') { connection.saveData = false; connection.dispatch('change'); }
    }
    await h.timer.advance(['pointerdown', 'keydown'].includes(trigger) ? 199 : 2499); assert.equal(h.calls.filter(x => x.kind === 'asset').length, 0);
    await h.timer.advance(1); assert.equal(h.calls.filter(x => x.kind === 'asset').length, 1);
    h.preload.destroy();
  });
}

test('buffered media recovery and ended event resume preparation without another app context change', async () => {
  const h = preloadHarness();
  const media = { tagName: 'AUDIO', paused: false, ended: false, readyState: 1 };
  h.root.document.querySelectorAll = selector => selector === 'audio, video' ? [media] : [];
  h.preload.setContext({ screen: 'question', section: 'B', active: true });
  await h.timer.advance(10000); assert.equal(h.calls.length, 0);
  media.ended = true; h.root.document.dispatch('ended', media);
  await h.timer.advance(199); assert.equal(h.calls.length, 0);
  await h.timer.advance(1); assert.equal(h.calls.filter(x => x.kind === 'asset').length, 1);
  h.preload.destroy();
});

test('cancelled generation cannot report progress after a delayed cache confirmation', async () => {
  const h = preloadHarness();
  let checks = 0, release;
  h.api.cachedStats = async () => ++checks === 2 ? new Promise(resolve => { release = resolve; }) : { available: true };
  h.preload.setContext({ screen: 'question', section: 'A', active: true });
  await h.timer.advance(2500); assert.equal(typeof release, 'function');
  const paused = h.preload.pause(); release({ available: true }); await paused;
  assert.equal(h.preload.getState().status, 'paused');
  assert.equal(h.preload.getState().loadedBytes, 0);
  h.preload.destroy();
});

test('temporary network failure backs off and resumes without losing already prepared bytes', async () => {
  const h = preloadHarness(), original = h.api.getAsset;
  let requests = 0;
  h.api.getAsset = async (...args) => { if (++requests === 2) throw new Error('offline mid chunk'); return original(...args); };
  h.preload.setContext({ screen: 'question', section: 'A', active: true });
  await h.timer.advance(2700);
  const prepared = h.preload.getState().loadedBytes;
  assert.ok(prepared > 0); assert.equal(h.preload.getState().reason, 'retry-wait');
  await h.timer.advance(29999); assert.equal(requests, 2);
  await h.timer.advance(10000); assert.equal(h.preload.getState().status, 'complete');
  assert.ok(h.preload.getState().loadedBytes > prepared);
  h.preload.destroy();
});

test('fast answer clicks leave a small quiet window for verified bytes, without starting during input', async () => {
  const h = preloadHarness();
  h.preload.setContext({ screen: 'question', section: 'A', active: true });
  for (let i = 0; i < 6; i++) {
    h.root.document.dispatch('pointerdown');
    const before = h.calls.filter(x => x.kind === 'asset').length;
    await h.timer.advance(199);
    assert.equal(h.calls.filter(x => x.kind === 'asset').length, before);
    await h.timer.advance(151);
    assert.equal(h.calls.filter(x => x.kind === 'asset').length, before + 1);
  }
  assert.equal(h.preload.getState().status, 'complete');
  h.preload.destroy();
});

for (const navigator of [{ deviceMemory: 2 }, { connection: { effectiveType: '3g' } }]) {
  test('low-memory/3g input keeps a longer 750ms quiet window', async () => {
    const h = preloadHarness({ navigator });
    h.preload.setContext({ screen: 'question', section: 'A', active: true });
    h.root.document.dispatch('pointerdown');
    await h.timer.advance(749); assert.equal(h.calls.length, 0);
    await h.timer.advance(1); assert.equal(h.calls.filter(x => x.kind === 'asset').length, 1);
    h.preload.destroy();
  });
}

test('continuous input, pending input and media still win over adaptive preload', async () => {
  let pending = true;
  const h = preloadHarness({ navigator: { scheduling: { isInputPending: () => pending } } });
  h.preload.setContext({ screen: 'question', section: 'A', active: true });
  for (let i = 0; i < 20; i++) { h.root.document.dispatch('keydown'); await h.timer.advance(100); }
  assert.equal(h.calls.length, 0);
  await h.timer.advance(1000); assert.equal(h.calls.length, 0);
  pending = false;
  h.preload.setContext({ screen: 'question', section: 'B', active: true, mediaBusy: true });
  h.root.document.dispatch('pointerdown');
  await h.timer.advance(5000); assert.equal(h.calls.length, 0);
  h.preload.setContext({ screen: 'question', section: 'B', active: true, mediaBusy: false });
  await h.timer.advance(200); assert.equal(h.calls.filter(x => x.kind === 'asset').length, 1);
  h.preload.destroy();
});

test('district chunks share verified cache between background and foreground', async () => {
  const h=assetsHarness(), raw=Buffer.from('ocean-drive'), part={path:'district.bin',size:raw.length,sha256:sha(raw)};
  const district={version:1,size:raw.length,files:[{fsPath:'/vc-assets/local/data/ocean.ipl',size:raw.length,sha256:sha(raw),chunks:[part]}]};
  const network=h.root.fetch;let requests=0;
  h.root.fetch=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/vice-district/manifest.json'))return new Response(JSON.stringify(district));
    if(path.endsWith('/vice-district/district.bin')){requests++;return new Response(raw);}
    return network(url,options);
  };
  const m=await h.api.loadDistrictManifest({priority:'low'});
  assert.equal(m.files[0].chunks[0].path,'vice-district/district.bin');
  assert.equal(m.files[0].chunks[0].offset,0);
  await h.api.getAsset(m.files[0].chunks[0],{priority:'low'});
  assert.equal(Buffer.from(await h.api.getAsset(m.files[0])).toString(),'ocean-drive');
  assert.equal(requests,1,'foreground reuses the background cached bytes');
});

test('district metadata rejects unsafe destinations, size mismatch and oversized chunks',async()=>{
  for(const flaw of ['path','size','chunk']){
    const h=assetsHarness(), raw=Buffer.from('a');
    const district={version:1,size:1,files:[{fsPath:'/vc-assets/local/data/ocean.ipl',size:1,sha256:sha(raw),chunks:[{path:'a.bin',size:1,sha256:sha(raw)}]}]};
    if(flaw==='path')district.files[0].fsPath='/vc-assets/local/data/../../main.scm';
    if(flaw==='size')district.size=2;
    if(flaw==='chunk')district.files[0].chunks[0].size=524289;
    h.root.fetch=async()=>new Response(JSON.stringify(district));
    await assert.rejects(h.api.loadDistrictManifest(),{name:'IntegrityError'});
  }
});

test('district byte leaves join polite queue without game initialization',async()=>{
  const extra={path:'vice-district/ocean.bin',size:4,sha256:'a'.repeat(64)};
  const h=preloadHarness({assets:{async loadDistrictManifest(options){assert.equal(options.priority,'low');return {files:[{chunks:[extra]}]};}}});
  h.preload.setContext({screen:'question',section:'theory',active:true});
  await h.timer.advance(20000);
  assert.equal(h.preload.getState().status,'complete');
  assert.equal(h.preload.getState().loadedBytes,h.leaves.reduce((n,f)=>n+f.size,0)+4);
  assert.equal(h.calls.filter(c=>c.file?.path===extra.path).length,1);
  h.preload.destroy();
});


test('actual Ocean Drive manifest validates every destination and chunk, including literal plus', async () => {
  const manifest=JSON.parse(fs.readFileSync(require.resolve('../dist/native-vc/runtime/vice-district/manifest.json'),'utf8'));
  const h=assetsHarness();
  h.root.fetch=async()=>new Response(JSON.stringify(manifest));
  const result=await h.api.loadDistrictManifest();
  assert.equal(result.files.length,manifest.files.length);
  assert.equal(result.files.reduce((n,f)=>n+f.size,0),manifest.size);
  for(const file of result.files){
    let offset=0;
    for(const chunk of file.chunks){
      assert.equal(chunk.offset,offset);offset+=chunk.size;
      assert.ok(chunk.path.startsWith('vice-district/'));assert.ok(chunk.size<=524288);
    }
    assert.equal(offset,file.size);
  }
  const plus=result.files.find(f=>f.fsPath.includes('+'));
  assert.ok(plus,'actual Vice City model has a literal plus filename');
  const chunk=plus.chunks[0], bytes=fs.readFileSync(require.resolve('../dist/native-vc/runtime/'+chunk.path));
  h.root.fetch=async(url)=>{assert.equal(new URL(url).pathname.split('/').at(-1),chunk.path.split('/').at(-1));return new Response(bytes);};
  assert.equal(sha(Buffer.from(await h.api.getAsset(plus))),plus.sha256);
});


test('district logical progress has unique stable fsPath keys and exact monotonic aggregate bytes',async()=>{
  const h=assetsHarness(), raw=[Buffer.from('ocean'),Buffer.from('drive')];
  const files=raw.map((bytes,i)=>({fsPath:'/vc-assets/local/data/street'+i+'.ipl',size:bytes.length,sha256:sha(bytes),chunks:[{path:'part'+i+'.bin',offset:0,size:bytes.length,sha256:sha(bytes)}]}));
  h.root.fetch=async url=>new Response(raw[Number(new URL(url).pathname.match(/part(\d)/)[1])]);
  const progress=new Map();let previous=0;
  for(const file of files)await h.api.getAsset(file,{onBytes(event){
    assert.equal(event.path,file.fsPath);progress.set(event.path,event.loaded);
    const sum=[...progress.values()].reduce((a,b)=>a+b,0);assert(sum>=previous);previous=sum;
  }});
  assert.equal(progress.size,files.length);assert.equal(previous,raw.reduce((n,b)=>n+b.length,0));
});

test('RC3 eager preparation starts at A1 after visible media is ready and yields between small requests', async () => {
  for (const profile of [
    { navigator: { deviceMemory: 8, connection: { effectiveType: '4g' } }, gap: 25 },
    { navigator: {}, gap: 50 }
  ]) {
    const h = preloadHarness(profile);
    const context = { screen: 'question', section: 'theory', active: true, eager: true };
    h.preload.setContext({ ...context, mediaBusy: true });
    await h.timer.advance(3000);
    assert.equal(h.calls.length, 0, 'The first screenshot has priority over game files');
    h.preload.setContext(context);
    await h.timer.advance(200);
    const first = h.calls.find(call => call.kind === 'asset');
    assert(first, 'Preparation begins on the first A screen');
    await h.timer.advance(profile.gap - 1);
    assert.equal(h.calls.filter(call => call.kind === 'asset').length, 1);
    await h.timer.advance(1);
    const second = h.calls.filter(call => call.kind === 'asset')[1];
    assert.equal(second.at - first.at, profile.gap);
    h.preload.setContext({ ...context, section: 'field', mediaBusy: true });
    const count = h.calls.length;
    await h.timer.advance(4000);
    assert.equal(h.calls.length, count, 'A B audio clip stops new background requests');
    h.preload.destroy();
  }
});

test('eager mode shortens only the ordinary first quiet window and retains constrained-device protections', async () => {
  const fast = preloadHarness();
  fast.preload.setContext({ screen: 'question', section: 'theory', active: true, eager: true });
  await fast.timer.advance(699);
  assert.equal(fast.calls.length, 0);
  await fast.timer.advance(1);
  assert.equal(fast.calls.filter(call => call.kind === 'asset').length, 1);
  fast.preload.destroy();
  for (const navigator of [{ deviceMemory: 2 }, { connection: { effectiveType: '3g' } }]) {
    const slow = preloadHarness({ navigator });
    slow.preload.setContext({ screen: 'question', section: 'theory', active: true, eager: true });
    await slow.timer.advance(2499);
    assert.equal(slow.calls.length, 0);
    await slow.timer.advance(1);
    assert.equal(slow.calls.filter(call => call.kind === 'asset').length, 1);
    await slow.timer.advance(1999);
    assert.equal(slow.calls.filter(call => call.kind === 'asset').length, 1);
    await slow.timer.advance(1);
    assert.equal(slow.calls.filter(call => call.kind === 'asset').length, 2);
    slow.preload.destroy();
  }
  for (const connection of [{ saveData: true, effectiveType: '4g' }, { effectiveType: '2g' }]) {
    const blocked = preloadHarness({ navigator: { connection } });
    blocked.preload.setContext({ screen: 'question', section: 'theory', active: true, eager: true });
    await blocked.timer.advance(20000);
    assert.equal(blocked.calls.length, 0, 'Eager mode never overrides data-saving or slow-connection policy');
    blocked.preload.destroy();
  }
});
