/* Quiet, owner-bound handoff from verified bytes to a parked native city.
 * No UI, scores, automatic activation, or network requests live in this layer. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { create: factory };
  else root.GTANativeWarmup = { create: function (callbacks) { return factory(root, callbacks); } };
})(typeof window !== 'undefined' ? window : globalThis, function (root, callbacks) {
  'use strict';
  callbacks = callbacks || {};
  const doc = root.document || {}, nav = root.navigator || {};
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
  const QUIET_MS = 350, listeners = [];
  let context = {}, owner = null, port = null, preload = {}, timer = null, idle = null;
  let generation = 0, started = false, adopted = false, failed = false, destroyed = false, paused = null, blurred = false;
  let quietUntil = 0, state = { status: 'idle', reason: 'not-started' };
  const now = () => root.Date?.now ? root.Date.now() : Date.now();
  const snapshot = () => Object.assign({}, state);
  function update(status, reason) { state = { status: status, reason: reason || '' }; callbacks.onState?.(snapshot()); }
  function listen(target, event, fn, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(event, fn, options); listeners.push([target, event, fn, options]);
  }
  function clearSchedule() {
    if (timer !== null) { root.clearTimeout(timer); timer = null; }
    if (idle !== null && root.cancelIdleCallback) { root.cancelIdleCallback(idle); idle = null; }
  }
  function discard() {
    const previous = port; port = null; paused = null;
    if (previous) {
      if (callbacks.discard) callbacks.discard(previous);
      else previous.destroy?.();
    }
  }
  function reset() {
    generation++; clearSchedule(); discard(); owner = null; context = {};
    started = false; adopted = false; failed = false; quietUntil = 0;
    update('idle', 'not-started');
  }
  function blocked() {
    if (destroyed) return 'destroyed';
    if (!owner || !started) return 'not-started';
    if (adopted) return 'adopted';
    if (failed) return 'failed';
    if (!context.active || doc.hidden || doc.visibilityState === 'hidden' || blurred) return 'inactive';
    if (context.screen === 'home') { if (!context.entryReady) return 'screen'; }
    else if (!['question', 'checkpoint', 'intro', 'stage'].includes(context.screen) || !['theory', 'field', 'A', 'B'].includes(context.section)) return 'screen';
    if (context.mediaBusy) return 'media';
    if (nav.onLine === false) return 'offline';
    if (connection?.saveData) return 'save-data';
    if (connection && ['slow-2g', '2g'].includes(connection.effectiveType)) return 'slow-connection';
    if (nav.deviceMemory && nav.deviceMemory <= 2) return 'low-memory';
    if (preload.status !== 'complete' || preload.cacheAvailable === false && preload.preparedAvailable !== true) return 'bytes';
    return '';
  }
  function pause(value) {
    if (!port || paused === value) return;
    paused = value; port.setPaused?.(value);
  }
  function fail(current) {
    if (generation !== current || adopted || destroyed) return;
    failed = true; clearSchedule(); discard(); update('deferred', 'warm-failed');
  }
  function begin() {
    if (blocked() || port) return reconcile();
    if (nav.scheduling?.isInputPending?.()) return schedule(250);
    const current = generation, currentOwner = owner;
    update('preparing', 'native');
    try {
      const created = callbacks.prepare?.({
        owner: currentOwner,
        onState: function (value) {
          if (generation !== current || adopted || destroyed || failed) return;
          if (value?.stage === 'error') fail(current);
        },
        onWarmReady: function () {
          if (generation !== current || adopted || destroyed || failed) return;
          update('ready', 'native-frame');
        },
        onError: function () { fail(current); }
      });
      if (generation !== current || failed || destroyed || adopted) {
        if (created) { if (callbacks.discard) callbacks.discard(created); else created.destroy?.(); }
        return;
      }
      if (!created) { fail(current); return; }
      port = created; pause(!!blocked());
    } catch (_) { fail(current); }
  }
  function schedule(delay) {
    clearSchedule();
    timer = root.setTimeout(function () {
      timer = null;
      if (blocked() || port) return reconcile();
      const run = function (deadline) {
        idle = null;
        if (deadline?.didTimeout && deadline.timeRemaining?.() === 0) return schedule(500);
        begin();
      };
      if (root.requestIdleCallback) idle = root.requestIdleCallback(run, { timeout: 1500 });
      else run();
    }, Math.max(delay || 0, quietUntil - now(), 0));
  }
  function reconcile() {
    if (destroyed || adopted) { clearSchedule(); return; }
    const reason = blocked();
    if (reason) {
      clearSchedule(); pause(true);
      if (!failed) update(port ? 'paused' : reason === 'bytes' ? 'waiting' : 'deferred', reason);
      return;
    }
    if (port && now() < quietUntil) {
      pause(true); update('paused', 'input'); schedule(0);
    } else if (port) {
      pause(false);
      update(port.getState?.().stage === 'warmed' ? 'ready' : 'preparing', 'native');
    } else if (timer === null && idle === null) {
      update('waiting', 'quiet'); schedule(0);
    }
  }
  function setContext(value) {
    if (destroyed) return;
    value = value || {};
    const nextOwner = value.owner || null;
    if (nextOwner !== owner) { reset(); owner = nextOwner; quietUntil = now() + QUIET_MS; }
    const changed = ['active', 'mediaBusy', 'screen', 'section', 'entryReady'].some(key => context[key] !== value[key]);
    context = value;
    if (value.started === true) started = true;
    if (changed && !port) { clearSchedule(); quietUntil = now() + QUIET_MS; }
    reconcile();
  }
  function interaction() {
    if (destroyed || adopted || !owner) return;
    quietUntil = now() + QUIET_MS;
    // Once loaded the scene's native warm state is parked. During preparation
    // keep yielding to question input and resume through the next context sync.
    clearSchedule(); reconcile();
  }
  listen(doc, 'visibilitychange', reconcile);
  listen(root, 'blur', function () { blurred = true; reconcile(); });
  listen(root, 'focus', function () { blurred = false; quietUntil = now() + QUIET_MS; reconcile(); });
  listen(connection, 'change', reconcile); listen(root, 'online', reconcile); listen(root, 'offline', reconcile);
  listen(doc, 'pointerdown', interaction, { capture: true, passive: true });
  listen(doc, 'keydown', interaction, { capture: true, passive: true });
  return Object.freeze({
    setContext: setContext,
    setPreload: function (value) { if (!destroyed) { preload = value || {}; reconcile(); } },
    getState: snapshot,
    transferOwner: function (previous, next) {
      // Only a still-hidden warm lease can be handed from the ephemeral cover
      // owner to a real attempt. Keep its generation and callbacks intact:
      // reparenting/reloading the iframe would throw away the prepared city.
      if (destroyed || adopted || !owner || previous !== owner || !next) return false;
      owner = next; context = Object.assign({}, context, { owner: next });
      return true;
    },
    adopt: function (value) {
      if (destroyed || !owner || value !== owner || adopted) return null;
      clearSchedule(); adopted = true;
      const result = port; port = null; paused = null;
      update('adopted', result ? 'same-runtime' : 'foreground'); return result;
    },
    reset: reset,
    destroy: function () {
      if (destroyed) return;
      reset(); destroyed = true;
      for (const entry of listeners) entry[0].removeEventListener(entry[1], entry[2], entry[3]);
    }
  });
});
