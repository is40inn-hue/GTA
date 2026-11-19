/* Shared verified byte cache. This module never compiles or starts the game. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { create: factory };
  else root.GTANativeAssets = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const CACHE = 'gta-ege-native-vc-1', MAX_PREFETCH = 512 * 1024;
  // A first visit must not depend on persistent storage being writable. Keep
  // only leaves that could not be persisted, and never exceed a fixed budget.
  // The parent-owned helper is reused by the warm/foreground iframe.
  const SESSION_LIMIT = root.navigator?.deviceMemory && root.navigator.deviceMemory <= 2 ? 16 * 1024 * 1024 : 80 * 1024 * 1024;
  const CACHE_WAIT_MS = 1500, NETWORK_IDLE_MS = 35000, MAX_MANIFEST_BYTES = 1024 * 1024;
  const script = root.document && root.document.currentScript;
  const anchor = script && script.src || root.location && root.location.href || 'https://localhost/native-assets.js';
  const baseURL = new URL('native-vc/runtime/', new URL('.', anchor));
  const jobs = new Map(), verified = new Map(), session = new Map();
  let sessionBytes = 0;
  const CACHE_ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'AbortError', 'CacheTimeoutError', 'QuotaExceededError', 'SecurityError', 'InvalidStateError', 'NotSupportedError', 'NotAllowedError', 'NotFoundError', 'UnknownError', 'DataError', 'NetworkError', 'OperationError']);
  let manifest = null, districtManifest = null, cachePromise = null;
  let cacheReadable = null, cacheWritable = null, cacheFailure = null;

  function aborted() { const error = new Error('Asset request cancelled'); error.name = 'AbortError'; return error; }
  function checkSignal(signal) { if (signal && signal.aborted) throw aborted(); }
  function integrity(message) { const error = new Error(message); error.name = 'IntegrityError'; return error; }
  function cacheMiss(file) { const error = new Error('Prepared asset is no longer cached'); error.name = 'CacheMissError'; error.path = file.path; return error; }
  function retainSession(url, bytes) {
    if (session.has(url)) return true;
    if (sessionBytes + bytes.byteLength > SESSION_LIMIT) return false;
    // Consumers may mutate their result. The retained verified copy is private.
    session.set(url, bytes.slice()); sessionBytes += bytes.byteLength;
    return true;
  }
  function releaseSession() { session.clear(); sessionBytes = 0; }
  function degradeCache(operation, error) {
    // Retain reads after a failed write: quota exhaustion does not invalidate
    // the SHA-verified leaves already prepared during A and B.
    let name;
    try { name = error && error.name; } catch (_) {}
    cacheFailure = { operation: operation, name: CACHE_ERROR_NAMES.has(name) ? name : 'Error' };
    cacheWritable = false;
    if (operation !== 'put') { cacheReadable = false; verified.clear(); }
  }
  function validate(file) {
    if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 256 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(file.sha256 || '')) throw integrity('Invalid runtime asset metadata');
    if (file.path && (!/^[a-zA-Z0-9_./+-]+$/.test(file.path) || file.path.startsWith('/') || file.path.split('/').includes('..'))) throw integrity('Invalid runtime asset path');
    if (file.chunks) {
      if (!Array.isArray(file.chunks) || !file.chunks.length || file.chunks.length > 1024) throw integrity('Invalid runtime chunks');
      let offset = 0;
      for (const part of file.chunks) {
        validate(part);
        if (part.chunks || !part.path || part.offset !== offset) throw integrity('Invalid runtime chunk order');
        offset += part.size;
      }
      if (offset !== file.size) throw integrity('Runtime chunks do not match the logical size');
    } else if (!file.path) throw integrity('Runtime leaf has no path');
    return file;
  }
  function urlFor(file) {
    const url = new URL(file.path, baseURL);
    url.searchParams.set('v', file.sha256.toLowerCase().slice(0, 12));
    return url.href;
  }
  function identity(file) { return urlFor(file) + '#' + file.size + '#' + file.sha256.toLowerCase(); }
  function mime(file) {
    if (['text/javascript', 'application/wasm', 'application/octet-stream'].includes(file.mimeType)) return file.mimeType;
    return file.path.endsWith('.js') ? 'text/javascript' : file.path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
  }
  async function hash(bytes) {
    if (!root.crypto || !root.crypto.subtle) throw integrity('Secure digest is unavailable');
    const result = await root.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(result), value => value.toString(16).padStart(2, '0')).join('');
  }
  function cacheTask(operation, onTimeout) {
    // CacheStorage has no AbortSignal. A stuck storage service must not block
    // explicit loading or the handoff from background preparation to part C.
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = root.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (onTimeout) onTimeout();
        const error = new Error('Runtime cache did not respond'); error.name = 'CacheTimeoutError';
        reject(error);
      }, CACHE_WAIT_MS);
      function finish(fn, value) { if (settled) return; settled = true; root.clearTimeout(timer); fn(value); }
      Promise.resolve().then(operation).then(value => finish(resolve, value), error => finish(reject, error));
    });
  }
  function getCache() {
    if (cacheReadable === false) return Promise.resolve(null);
    if (!cachePromise) {
      cachePromise = Promise.resolve().then(() => {
        if (!root.caches || typeof root.caches.open !== 'function') return null;
        return cacheTask(() => root.caches.open(CACHE));
      }).then(cache => {
        if (cache) { cacheReadable = true; cacheWritable = true; }
        else degradeCache('open', { name: 'NotSupportedError' });
        return cache;
      }, error => { degradeCache('open', error); return null; });
    }
    return cachePromise;
  }

  async function network(url, options, consume) {
    const signal = options.signal, controller = new root.AbortController();
    checkSignal(signal);
    let timer = null, done = false, timeoutError = null, expire;
    const expired = new Promise((_resolve, reject) => { expire = reject; });
    const relayAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', relayAbort, { once: true });
    function armIdleTimer() {
      if (done) return;
      if (timer !== null) root.clearTimeout(timer);
      timer = root.setTimeout(() => {
        timeoutError = new Error('No runtime bytes received for 35 seconds');
        timeoutError.name = 'TimeoutError'; timeoutError.code = 'NETWORK_TIMEOUT'; timeoutError.path = options.path;
        controller.abort(); expire(timeoutError);
      }, NETWORK_IDLE_MS);
    }
    function activity() {
      if (done) return;
      armIdleTimer();
      if (typeof options.onActivity === 'function') options.onActivity({ path: options.path });
    }
    armIdleTimer();
    const request = Promise.resolve().then(async () => {
      checkSignal(controller.signal);
      const response = await root.fetch(url, { signal: controller.signal, credentials: 'same-origin', priority: options.priority(), ...(options.cache ? { cache: options.cache } : {}) });
      checkSignal(controller.signal); activity();
      return consume(response, controller.signal, activity);
    });
    try { return await Promise.race([request, expired]); }
    catch (error) {
      if (signal && signal.aborted) throw aborted();
      const failure = timeoutError || error;
      try { if (failure && typeof failure === 'object' && !failure.path) failure.path = options.path; } catch (_) {}
      throw failure;
    } finally {
      done = true; if (timer !== null) root.clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', relayAbort);
    }
  }

  // Each caller owns one subscription. Cancelling a preloader must not abort a
  // request already adopted by the foreground loader. An aborting request is
  // awaited before a replacement starts, including across the C handoff.
  async function shared(key, loader, signal, priority, onActivity) {
    checkSignal(signal);
    let job = jobs.get(key);
    if (job && job.aborting) { await job.done; checkSignal(signal); return shared(key, loader, signal, priority, onActivity); }
    if (!job) {
      job = { controller: new root.AbortController(), consumers: new Set(), priority: priority || 'high', settled: false, aborting: false };
      jobs.set(key, job);
      job.promise = Promise.resolve().then(() => loader(job.controller.signal, () => job.priority, event => {
        for (const consumer of job.consumers) {
          try { if (typeof consumer.onActivity === 'function') consumer.onActivity(event); } catch (_) {}
        }
      }));
      const finish = () => { job.settled = true; if (jobs.get(key) === job) jobs.delete(key); };
      job.done = job.promise.then(finish, finish);
    } else if (priority === 'high') job.priority = 'high';
    return new Promise((resolve, reject) => {
      const consumer = { onActivity: onActivity };
      let active = true;
      job.consumers.add(consumer);
      function cleanup() { job.consumers.delete(consumer); if (signal) signal.removeEventListener('abort', cancel); }
      function cancel() {
        if (!active) return;
        active = false; cleanup();
        if (!job.settled && job.consumers.size === 0) { job.aborting = true; job.controller.abort(); job.done.then(() => reject(aborted())); }
        else reject(aborted());
      }
      if (signal) signal.addEventListener('abort', cancel, { once: true });
      if (signal && signal.aborted) { cancel(); return; }
      job.promise.then(value => {
        if (!active) return;
        if (signal && signal.aborted) { cancel(); return; }
        active = false; cleanup(); resolve(value);
      }, error => { if (active) { active = false; cleanup(); reject(error); } });
    });
  }

  async function readBody(response, signal, receive, activity) {
    checkSignal(signal);
    if (!response || !response.ok) {
      const error = new Error('Runtime asset is unavailable'); error.status = response && response.status;
      throw error;
    }
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const cancel = () => { reader.cancel().catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        for (;;) {
          checkSignal(signal);
          const item = await reader.read();
          checkSignal(signal);
          if (item.done) break;
          if (item.value.byteLength && activity) activity();
          try { receive(item.value); } catch (error) { await reader.cancel(); throw error; }
        }
      } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
    } else {
      const buffer = await response.arrayBuffer();
      checkSignal(signal); if (buffer.byteLength && activity) activity(); receive(new Uint8Array(buffer));
    }
  }
  async function readBytes(response, file, signal, activity) {
    const bytes = new Uint8Array(file.size);
    let received = 0;
    await readBody(response, signal, part => {
      if (received + part.byteLength > file.size) throw integrity('Runtime asset exceeds its declared size');
      bytes.set(part, received); received += part.byteLength;
    }, activity);
    if (received !== file.size || await hash(bytes) !== file.sha256.toLowerCase()) throw integrity('Runtime integrity check failed');
    checkSignal(signal);
    return bytes;
  }
  async function readManifest(response, signal, activity) {
    const parts = []; let received = 0;
    await readBody(response, signal, part => {
      received += part.byteLength;
      if (received > MAX_MANIFEST_BYTES) throw integrity('Runtime manifest exceeds its size limit');
      parts.push(part);
    }, activity);
    const bytes = new Uint8Array(received); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return new root.Response(bytes).json();
  }

  async function leaf(file, options) {
    validate(file);
    const cacheOnly = options.cacheOnly === true;
    const priority = options.priority === 'low' ? 'low' : 'high';
    if (priority === 'low' && file.size > MAX_PREFETCH) throw integrity('Background preparation requires small chunks');
    const url = urlFor(file);
    const preparedKey = identity(file);
    return shared((cacheOnly ? 'cache-only:' : '') + url, async (signal, currentPriority, onActivity) => {
      checkSignal(signal);
      const prepared = session.get(preparedKey);
      if (prepared) return { data: prepared.slice(), source: 'session', cached: false, retained: true };
      const cache = await getCache();
      checkSignal(signal);
      if (cache && cacheReadable === true) {
        let response;
        try { response = await cacheTask(() => cache.match(url)); } catch (error) { degradeCache('match', error); }
        if (response) {
          const cachedAbort = new root.AbortController(), relayAbort = () => cachedAbort.abort();
          signal.addEventListener('abort', relayAbort, { once: true });
          try {
            checkSignal(signal);
            const data = await cacheTask(() => readBytes(response, file, cachedAbort.signal), () => cachedAbort.abort());
            checkSignal(signal);
            verified.set(preparedKey, file.size);
            return { data: data, source: 'cache', cached: true, retained: true };
          } catch (error) {
            if (error.name === 'AbortError') throw error;
            verified.delete(preparedKey);
            if (error.name !== 'IntegrityError') degradeCache('body', error);
            else try { await cacheTask(() => cache.delete(url)); } catch (failure) { degradeCache('delete', failure); }
          } finally { signal.removeEventListener('abort', relayAbort); }
        }
      }
      checkSignal(signal);
      // Hidden native warm-up may assemble verified cached leaves, but must
      // never turn eviction/storage failure into a competing network download.
      if (cacheOnly) throw cacheMiss(file);
      const data = await network(url, { signal: signal, priority: currentPriority, path: file.path, onActivity: onActivity }, (response, requestSignal, activity) => readBytes(response, file, requestSignal, activity));
      let cached = false;
      if (cache && cacheWritable === true) {
        try {
          await cacheTask(() => cache.put(url, new root.Response(data, { headers: { 'Content-Type': mime(file), 'Content-Length': String(file.size), 'X-GTA-Asset-SHA256': file.sha256.toLowerCase() } })));
          cached = true; verified.set(preparedKey, file.size);
        } catch (error) { degradeCache('put', error); }
      }
      checkSignal(signal);
      return { data: data, source: 'network', cached: cached, retained: cached || retainSession(preparedKey, data) };
    }, options.signal, priority, options.onActivity);
  }

  async function loadManifest(options) {
    options = options || {};
    checkSignal(options.signal);
    if (manifest) return manifest;
    return shared('manifest', async (signal, priority, onActivity) => {
      const result = await network(new URL('manifest.json', baseURL).href, { signal: signal, priority: priority, path: 'manifest.json', cache: 'no-store', onActivity: onActivity }, readManifest);
      checkSignal(signal);
      if (!result || result.version !== 1 || !result.engine) throw integrity('Invalid native manifest');
      validate(result.engine.js); validate(result.engine.wasm); validate(result.data);
      manifest = result;
      return manifest;
    }, options.signal, options.priority === 'low' ? 'low' : 'high', options.onActivity);
  }

  async function loadDistrictManifest(options) {
    options = options || {}; checkSignal(options.signal);
    if (districtManifest) return districtManifest;
    return shared('vice-district-manifest', async (signal, priority, onActivity) => {
      const path = 'vice-district/manifest.json';
      const source = await network(new URL(path, baseURL).href, { signal, priority, path, cache: 'no-store', onActivity }, readManifest);
      checkSignal(signal);
      if (!source || source.version !== 1 || !Array.isArray(source.files) || !source.files.length || source.files.length > 1024 || !Number.isSafeInteger(source.size) || source.size > 24 * 1024 * 1024) throw integrity('Invalid district manifest');
      const seen = new Set(); let total = 0;
      const files = source.files.map(file => {
        if (!file || typeof file.fsPath !== 'string' || !/^\/vc-assets\/local\/(?:data|models)\/[a-zA-Z0-9_./+-]+$/.test(file.fsPath) || file.fsPath.split('/').includes('..') || seen.has(file.fsPath) || !Array.isArray(file.chunks)) throw integrity('Invalid district destination');
        seen.add(file.fsPath); let offset = 0;
        const chunks = file.chunks.map(chunk => {
          if (!chunk || !/^[a-zA-Z0-9_.+-]+$/.test(chunk.path || '') || chunk.size > MAX_PREFETCH) throw integrity('Invalid district chunk');
          const part = { ...chunk, path: 'vice-district/' + chunk.path, offset }; offset += chunk.size; return part;
        });
        const normalized = { ...file, chunks }; validate(normalized); total += file.size; return normalized;
      });
      if (total !== source.size) throw integrity('District size mismatch');
      districtManifest = { ...source, files }; return districtManifest;
    }, options.signal, options.priority === 'low' ? 'low' : 'high', options.onActivity);
  }

  async function getAsset(file, options) {
    options = options || {};
    validate(file); checkSignal(options.signal);
    const path = file.path || file.fsPath || 'index.data';
    function progress(loaded, result) {
      if (typeof options.onBytes === 'function') { try { options.onBytes({ loaded: loaded, total: file.size, source: result.source, path: path, cached: result.cached, retained: result.retained === true }); } catch (_) {} }
    }
    if (!file.chunks) {
      const result = await leaf(file, options);
      checkSignal(options.signal); progress(file.size, result); return result.data;
    }
    if (options.priority === 'low' && options.cacheOnly !== true) throw integrity('Background preparation must request one leaf chunk at a time');
    // Full allocation is foreground-only unless native warm-up explicitly
    // requests a cache-only assembly. That path is forbidden from networking.
    const bytes = new Uint8Array(file.size);
    let loaded = 0;
    for (const part of file.chunks) {
      if (typeof options.beforeChunk === 'function') await options.beforeChunk();
      checkSignal(options.signal);
      const result = await leaf(part, options);
      checkSignal(options.signal); bytes.set(result.data, part.offset); loaded += result.data.byteLength; progress(loaded, result);
    }
    if (await hash(bytes) !== file.sha256.toLowerCase()) throw integrity('Combined runtime integrity check failed');
    checkSignal(options.signal);
    return bytes;
  }
  async function cachedStats() {
    await getCache();
    return { available: cacheReadable === true && cacheWritable === true, readable: cacheReadable === true, writable: cacheWritable === true,
      cacheFailure: cacheFailure && { ...cacheFailure }, verifiedBytes: Array.from(verified.values()).reduce((sum, value) => sum + value, 0), verifiedFiles: verified.size, inFlight: jobs.size,
      sessionAvailable: sessionBytes < SESSION_LIMIT, sessionBytes: sessionBytes, sessionFiles: session.size, sessionLimit: SESSION_LIMIT };
  }
  function preparedSnapshot(files) {
    // Last verified retained bytes, by the same logical keys emitted by onBytes.
    // Cache-only reads still revalidate storage before the engine can use it.
    const progress = {}; let loadedBytes = 0, totalBytes = 0;
    for (const file of files || []) {
      validate(file); let bytes = 0;
      for (const part of file.chunks || [file]) {
        const key = identity(part);
        if (verified.has(key) || session.has(key)) bytes += part.size;
      }
      progress[file.path || file.fsPath || 'index.data'] = bytes;
      loadedBytes += bytes; totalBytes += file.size;
    }
    return { loadedBytes: loadedBytes, totalBytes: totalBytes, files: progress };
  }
  return Object.freeze({ loadManifest: loadManifest, loadDistrictManifest: loadDistrictManifest, getAsset: getAsset, cachedStats: cachedStats, releaseSession: releaseSession, preparedSnapshot: preparedSnapshot });
});
