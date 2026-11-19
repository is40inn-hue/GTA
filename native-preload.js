/* Polite byte-only preparation after the cover is painted, then through A/B.
 * No WASM execution, WebGL, model parsing or audio decode live in this layer. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { create: factory };
  else root.GTANativePreload = factory(root, root.GTANativeAssets);
})(typeof window !== 'undefined' ? window : globalThis, function (root, assets) {
  'use strict';
  const QUIET_MS = 2500, MAX_CHUNK = 512 * 1024, MAX_PREPARE_BYTES = 80 * 1024 * 1024;
  const document = root.document || {}, navigator = root.navigator || {};
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const subscribers = new Set(), completed = new Set(), listeners = [];
  let context = { screen: 'home', section: '', active: false, mediaBusy: false, eager: false, entryReady: false };
  let state = { status: 'idle', loadedBytes: 0, totalBytes: 0, progress: 0, reason: 'home', cacheAvailable: null, preparedAvailable: false, sessionBytes: 0 };
  let queue = null, timer = null, idle = null, work = null, controller = null;
  let generation = 0, quietUntil = 0, retryAfter = 0, manual = false, destroyed = false, blurred = false, unavailable = false;
  let cacheWasReadable = null;
  let lastChunkBytes = MAX_CHUNK;
  const now = () => root.Date && root.Date.now ? root.Date.now() : Date.now();
  function getState() { return Object.assign({}, state); }
  function reconcileCacheLoss(stats) {
    if (cacheWasReadable && stats.readable === false && queue && typeof assets.preparedSnapshot === 'function') {
      // Old persisted leaves have become inaccessible to this visit. Refill
      // those leaves into the session buffer instead of counting a false 100%.
      const prepared = assets.preparedSnapshot(queue);
      completed.clear();
      for (const item of queue) if (prepared.files[item.path] === item.size) completed.add(item.path + '#' + item.sha256);
      update({ loadedBytes: prepared.loadedBytes, preparedAvailable: false });
    }
    cacheWasReadable = stats.readable === true || stats.available === true;
  }
  function update(values) {
    state = Object.assign({}, state, values);
    state.progress = state.totalBytes ? Math.min(1, state.loadedBytes / state.totalBytes) : 0;
    for (const fn of subscribers) { try { fn(getState()); } catch (_) {} }
  }
  function listen(target, name, fn, options) {
    if (target && typeof target.addEventListener === 'function') { target.addEventListener(name, fn, options); listeners.push([target, name, fn, options]); }
  }
  function visibleMediaBusy() {
    if (context.mediaBusy) return true;
    if (typeof document.querySelectorAll !== 'function') return false;
    for (const image of document.querySelectorAll('main img[src], .question-media img[src]')) {
      if (image.complete) continue;
      const box = typeof image.getBoundingClientRect === 'function' ? image.getBoundingClientRect() : null;
      if (!box || box.width > 0 && box.height > 0 && box.bottom >= 0 && box.top <= (root.innerHeight || 1000)) return true;
    }
    for (const media of document.querySelectorAll('audio, video')) {
      if (media.error) continue;
      // A selected B clip gets its buffer before the next game-data request, even
      // before playback. preload=none stays inert until the user presses play.
      const selected = Boolean(media.currentSrc || media.getAttribute?.('src'));
      if (!media.ended && media.readyState < 3 && (!media.paused || selected && media.preload !== 'none')) return true;
    }
    return false;
  }
  function eligible(value) {
    return value.active && (value.screen === 'home' && value.entryReady === true ||
      ['question', 'stage', 'checkpoint'].includes(value.screen) && ['theory', 'field', 'A', 'B'].includes(value.section));
  }
  function interactionQuiet() {
    // Keep input responsive, but don't starve preparation on every answer click.
    // Slow links / low-memory devices retain a longer settling window.
    return navigator.deviceMemory && navigator.deviceMemory <= 2 || connection && connection.effectiveType === '3g' ? 750 : 200;
  }
  function blocked() {
    if (destroyed) return 'destroyed';
    if (manual) return 'manual';
    if (!context.active) return 'inactive';
    if (document.hidden || document.visibilityState === 'hidden' || blurred) return 'hidden';
    if (navigator.onLine === false) return 'offline';
    if (connection && connection.saveData) return 'save-data';
    if (connection && ['slow-2g', '2g'].includes(connection.effectiveType)) return 'slow-connection';
    if (context.screen === 'home') { if (!context.entryReady) return 'screen'; }
    else {
      if (!['question', 'stage', 'checkpoint'].includes(context.screen)) return 'screen';
      if (!['theory', 'field', 'A', 'B'].includes(context.section)) return 'section';
    }
    if (visibleMediaBusy()) return 'media';
    return '';
  }
  function gap() {
    // Hundreds of small district files must not each cost two idle seconds.
    // Constrained devices still get one request at a time, with a short yield
    // proportional to the actual leaf rather than 15 minutes of fixed gaps.
    if (navigator.deviceMemory && navigator.deviceMemory <= 2 || connection && connection.effectiveType === '3g') return Math.max(50, Math.ceil(lastChunkBytes / MAX_CHUNK * 500));
    // Still one verified small leaf at a time. Starting after the cover's first
    // paint gives a short ticket more time without competing with critical UI.
    if (context.eager) return connection && connection.effectiveType === '4g' && navigator.deviceMemory >= 4 ? 25 : 50;
    // One small leaf at a time; yield to input, but finish during A and B even on iOS (no connection API).
    return connection && connection.effectiveType === '4g' && navigator.deviceMemory >= 4 ? 100 : 200;
  }
  function initialQuiet() {
    return context.eager && !(navigator.deviceMemory && navigator.deviceMemory <= 2) && !(connection && connection.effectiveType === '3g') ? 700 : QUIET_MS;
  }
  function clearSchedule() {
    if (timer !== null) { root.clearTimeout(timer); timer = null; }
    if (idle !== null && typeof root.cancelIdleCallback === 'function') { root.cancelIdleCallback(idle); idle = null; }
  }
  function cancelWork() {
    generation++; clearSchedule();
    if (controller) controller.abort();
    return work || Promise.resolve();
  }
  function reflectBlocked(reason) {
    if (state.status === 'complete') return;
    update({ status: context.screen === 'home' && !state.loadedBytes ? 'idle' : 'paused', reason: reason });
  }
  function schedule(delay) {
    clearSchedule();
    if (destroyed || unavailable || state.status === 'complete') return;
    const reason = blocked();
    if (reason) { reflectBlocked(reason); return; }
    if (work) return;
    const wait = Math.max(delay || 0, quietUntil - now(), retryAfter - now(), 0);
    update({ status: 'waiting', reason: retryAfter > now() ? 'retry-wait' : 'quiet' });
    timer = root.setTimeout(() => {
      timer = null;
      const start = () => { idle = null; if (!blocked()) begin(); else reflectBlocked(blocked()); };
      if (typeof root.requestIdleCallback === 'function') idle = root.requestIdleCallback(start, { timeout: 1000 });
      else start();
    }, wait);
  }
  function begin() {
    if (work || destroyed || unavailable || blocked()) return;
    if (navigator.scheduling && typeof navigator.scheduling.isInputPending === 'function' && navigator.scheduling.isInputPending()) { schedule(500); return; }
    const current = generation;
    const abort = new root.AbortController();
    controller = abort;
    update({ status: 'loading', reason: 'assets' });
    work = Promise.resolve().then(async () => {
      if (!assets || typeof assets.cachedStats !== 'function' || !root.crypto || !root.crypto.subtle) {
        unavailable = true; update({ status: 'unavailable', reason: 'cache-unavailable', cacheAvailable: false }); return;
      }
      const stats = await assets.cachedStats();
      if (current !== generation || abort.signal.aborted) return;
      reconcileCacheLoss(stats);
      if (!stats.available && !stats.sessionAvailable) { unavailable = true; update({ status: 'unavailable', reason: 'cache-unavailable', cacheAvailable: false }); return; }
      update({ cacheAvailable: stats.available === true, sessionBytes: stats.sessionBytes || 0 });
      if (!queue) {
        const manifest = await assets.loadManifest({ signal: abort.signal, priority: 'low' });
        if (current !== generation || abort.signal.aborted) return;
        let district = null;
        if (typeof assets.loadDistrictManifest === 'function') district = await assets.loadDistrictManifest({ signal: abort.signal, priority: 'low' });
        if (current !== generation || abort.signal.aborted) return;
        queue = [manifest.engine.js].concat(manifest.engine.wasm.chunks || [manifest.engine.wasm], manifest.data.chunks || [manifest.data], (manifest.models?.files || []).flatMap(file => file.chunks || [file]), (district?.files || []).flatMap(file => file.chunks || [file]));
        if (queue.some(file => file.chunks || !file.path || !Number.isFinite(file.size) || file.size > MAX_CHUNK)) {
          unavailable = true; queue = null; update({ status: 'unavailable', reason: 'large-chunks' }); return;
        }
        const totalBytes = queue.reduce((sum, file) => sum + file.size, 0);
        if (totalBytes > MAX_PREPARE_BYTES || queue.length > 1024) {
          unavailable = true; queue = null; update({ status: 'unavailable', reason: 'size-limit' }); return;
        }
        update({ totalBytes: totalBytes });
      }
      const file = queue.find(value => !completed.has(value.path + '#' + value.sha256));
      if (!file) { update({ status: 'complete', reason: 'assets-prepared', preparedAvailable: true }); return; }
      if (blocked() || current !== generation) return;
      let retained = false;
      // One bounded leaf at a time. The shared helper keeps a private session
      // copy only when persistent storage cannot retain it.
      await assets.getAsset(file, { signal: abort.signal, priority: 'low', onBytes: value => { retained = value.cached === true || value.retained === true; } });
      if (current !== generation || abort.signal.aborted) return;
      const after = await assets.cachedStats();
      // A cache check may finish after navigation or input cancelled this generation.
      if (current !== generation || abort.signal.aborted || destroyed) return;
      reconcileCacheLoss(after);
      if (!retained) {
        unavailable = true; update({ status: 'unavailable', reason: after.sessionLimit ? 'session-capacity' : 'cache-unavailable', cacheAvailable: after.available === true, sessionBytes: after.sessionBytes || 0 }); return;
      }
      const key = file.path + '#' + file.sha256, alreadyCounted = completed.has(key);
      lastChunkBytes = file.size;
      completed.add(key);
      update({ loadedBytes: state.loadedBytes + (alreadyCounted ? 0 : file.size), status: completed.size === queue.length ? 'complete' : 'waiting', reason: completed.size === queue.length ? 'assets-prepared' : 'yield', preparedAvailable: completed.size === queue.length, cacheAvailable: after.available === true, sessionBytes: after.sessionBytes || 0 });
    }).catch(error => {
      if (error && error.name === 'AbortError' || current !== generation || destroyed) return;
      retryAfter = now() + 30000;
      update({ status: 'paused', reason: error && error.name === 'IntegrityError' ? 'integrity-retry' : 'network-retry' });
    }).finally(() => {
      if (controller === abort) controller = null;
      work = null;
      if (!destroyed && !unavailable && state.status !== 'complete') schedule(current === generation ? gap() : 0);
    });
  }
  function setContext(value) {
    if (destroyed) return;
    value = value || {};
    const next = { screen: String(value.screen || 'home'), section: String(value.section || ''), active: value.active === true, mediaBusy: value.mediaBusy === true, eager: value.eager === true, entryReady: value.entryReady === true };
    const changed = manual || Object.keys(next).some(key => next[key] !== context[key]);
    const continuing = !manual && eligible(context) && eligible(next);
    context = next; manual = false;
    if (!changed) { if (!work && timer === null && idle === null) schedule(0); return; }
    // A new answer or a media buffer can delay the next small request without
    // throwing away bytes already in flight. Actual hiding/offline/data saving
    // and leaving A/B still cancel immediately.
    if (continuing && (!blocked() || blocked() === 'media')) {
      clearSchedule(); quietUntil = now() + interactionQuiet();
      if (!unavailable) schedule(0);
      return;
    }
    cancelWork(); quietUntil = now() + (continuing ? interactionQuiet() : initialQuiet());
    if (!unavailable) schedule(0);
  }
  function pause() {
    manual = true;
    const pending = cancelWork(); reflectBlocked('manual');
    return Promise.resolve(pending).catch(() => {});
  }
  function refresh(shortQuiet) {
    if (destroyed || manual) return;
    const reason = blocked();
    if (reason && reason !== 'media') cancelWork();
    else clearSchedule();
    quietUntil = now() + (shortQuiet === true && eligible(context) ? interactionQuiet() : initialQuiet());
    if (!unavailable) schedule(0);
  }
  function interaction() { if (eligible(context)) refresh(true); }
  function mediaChanged(event) {
    const name = event && event.target && String(event.target.tagName).toLowerCase();
    if (['img', 'audio', 'video'].includes(name)) refresh(true);
  }
  listen(document, 'visibilitychange', refresh);
  listen(root, 'online', refresh); listen(root, 'offline', refresh); listen(connection, 'change', refresh);
  listen(root, 'blur', () => { blurred = true; refresh(); });
  listen(root, 'focus', () => { blurred = false; refresh(); });
  listen(document, 'pointerdown', interaction, { capture: true, passive: true });
  listen(document, 'keydown', interaction, { capture: true, passive: true });
  for (const event of ['load', 'error', 'loadeddata', 'canplay', 'play', 'pause', 'ended', 'seeking', 'seeked', 'waiting', 'stalled']) listen(document, event, mediaChanged, true);
  return Object.freeze({
    setContext: setContext,
    getState: getState,
    subscribe: function (fn) { if (typeof fn !== 'function') return () => {}; subscribers.add(fn); fn(getState()); return () => subscribers.delete(fn); },
    pause: pause,
    destroy: function () { if (destroyed) return; destroyed = true; manual = true; cancelWork(); for (const item of listeners) item[0].removeEventListener(item[1], item[2], item[3]); subscribers.clear(); }
  });
});
