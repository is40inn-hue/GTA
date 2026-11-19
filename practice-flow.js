'use strict';

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTAPracticeFlow = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);

  // Each run owns its timer and callbacks. A replaced run can never advance a
  // newer scene, including when onTick itself cancels or starts a countdown.
  function createCountdown(dependencies) {
    dependencies = dependencies || {};
    const now = dependencies.now || (() => root.performance ? root.performance.now() : Date.now());
    const schedule = dependencies.setInterval || ((fn, delay) => root.setInterval(fn, delay));
    const unschedule = dependencies.clearInterval || (id => root.clearInterval(id));
    let generation = 0, current = null;

    function live(run) { return current === run && run.generation === generation; }
    function state() { return { running: !!current, remainingMs: current ? current.remainingMs : 0 }; }
    function stop(run) {
      if (!live(run)) return;
      current = null; generation++;
      if (run.timer !== null) unschedule(run.timer);
    }
    function cancel() { if (current) stop(current); return state(); }
    function tick(run) {
      if (!live(run)) return;
      run.onTick({ remainingMs: run.remainingMs, seconds: Math.ceil(run.remainingMs / 1000), paused: !run.active });
    }
    function step(run) {
      if (!live(run)) return;
      try {
        const isCurrent = !!run.isCurrent();
        if (!live(run)) return;
        if (!isCurrent) { stop(run); return; }
        const active = !!run.isActive();
        if (!live(run)) return;
        const time = now(), delta = Number.isFinite(time) ? Math.min(250, Math.max(0, time - run.lastTime)) : 0;
        if (Number.isFinite(time)) run.lastTime = time;
        // A boundary sync never charges hidden time to the next visible scene.
        // Both samples must be active before their interval can be consumed.
        if (active && run.active) run.remainingMs = Math.max(0, run.remainingMs - delta);
        run.active = active;
        tick(run);
        if (!live(run) || run.remainingMs > 0 || !run.active) return;
        // The last onTick may synchronously open a dialog or change the scene.
        const stillCurrent = !!run.isCurrent();
        if (!live(run)) return;
        if (!stillCurrent) { stop(run); return; }
        const stillActive = !!run.isActive();
        if (!live(run)) return;
        if (!stillActive) { run.active = false; return; }
        stop(run);
        run.onComplete();
      } catch (error) { stop(run); throw error; }
    }
    function start(options) {
      options = options || {};
      if (!Number.isFinite(options.durationMs) || options.durationMs < 0) throw new RangeError('Countdown duration must be a non-negative finite number');
      cancel();
      const run = {
        generation: ++generation, timer: null, remainingMs: options.durationMs,
        lastTime: now(), active: false,
        isCurrent: typeof options.isCurrent === 'function' ? options.isCurrent : () => true,
        isActive: typeof options.isActive === 'function' ? options.isActive : () => true,
        onTick: typeof options.onTick === 'function' ? options.onTick : () => {},
        onComplete: typeof options.onComplete === 'function' ? options.onComplete : () => {}
      };
      current = run;
      try {
        const isCurrent = !!run.isCurrent();
        if (!live(run)) return state();
        if (!isCurrent) { stop(run); return state(); }
        const active = !!run.isActive();
        if (!live(run)) return state();
        run.active = active;
        run.timer = schedule(() => step(run), 100);
        // Keep the initial notification synchronous, without completing inside
        // start(). Even a zero-duration run crosses a subsequent timer/sync.
        tick(run);
      } catch (error) { stop(run); throw error; }
      return state();
    }
    function sync() { if (current) step(current); return state(); }
    return { start: start, cancel: cancel, sync: sync, getState: state };
  }

  // This commits only validated native outcomes. Persistence and navigation are
  // the caller's responsibility, after this function has returned "accepted".
  function acceptProtocol(options) {
    options = options || {};
    const { attempt, question, protocol, ready, grade } = options;
    const id = question && question.id;
    if (!record(attempt) || !record(question) || typeof id !== 'string' || !id || ['__proto__', 'prototype', 'constructor'].includes(id)) return { status: 'invalid' };
    if (attempt.answers !== undefined && !record(attempt.answers)) return { status: 'invalid' };
    if (attempt.answers && owns(attempt.answers, id)) {
      try { return { status: 'existing', answer: clone(attempt.answers[id]) }; }
      catch (_) { return { status: 'existing' }; }
    }
    if (typeof ready !== 'function' || typeof grade !== 'function') return { status: 'invalid' };
    try {
      const value = clone(protocol);
      if (!ready(question, value)) return { status: 'invalid' };
      const assessment = clone(grade(question, value));
      if (!record(assessment)) return { status: 'invalid' };
      const elapsed = attempt.questionTimes && attempt.questionTimes[id];
      const seconds = Math.round((Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0) * 10) / 10;
      const answer = Object.assign({}, assessment, { value: clone(value), seconds: seconds });
      // No state is mutated before validation, grading and cloning succeed.
      if (!attempt.answers) attempt.answers = {};
      attempt.answers[id] = answer;
      if (record(attempt.drafts)) delete attempt.drafts[id];
      return { status: 'accepted', answer: clone(answer) };
    } catch (_) { return { status: 'invalid' }; }
  }

  return { createCountdown: createCountdown, acceptProtocol: acceptProtocol };
});
