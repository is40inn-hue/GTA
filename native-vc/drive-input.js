/* A calm touch bridge for the native keyboard bindings in revc.ini.
 * No invented analogue/gamepad mapping and no reads/writes into physics memory.
 * Short, time-based key pulses let the engine's own steering settle gradually. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTADriveInput = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DEAD_ZONE = 0.18, PERIOD_MS = 200, STEER_MAX = 0.78;
  const clamp = value => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
  function create(options) {
    options = options || {};
    const keys = { KeyA: false, KeyD: false, KeyW: false, KeyS: false };
    const keyboard = { KeyA: false, KeyD: false, KeyW: false, KeyS: false };
    let rawSteer = 0, smoothSteer = 0, gas = false, brake = false;
    let lastTime = null, steerStart = null, gasStart = null, lastDirection = 0;
    let reverseReady = 0, gasLevel = 0;
    function emit(code, down) {
      down = !!down;
      if (keys[code] === down) return;
      keys[code] = down; options.onKey?.(code, down);
    }
    function stopSteering() {
      smoothSteer = 0; steerStart = null; lastDirection = 0; reverseReady = 0;
      emit('KeyA', false); emit('KeyD', false);
    }
    function shape(value) {
      const amount = Math.abs(value);
      return amount <= DEAD_ZONE ? 0 : Math.sign(value) * Math.pow((amount - DEAD_ZONE) / (1 - DEAD_ZONE), 1.6);
    }
    function steer(value) {
      rawSteer = clamp(value);
      if (!shape(rawSteer) && !keyboard.KeyA && !keyboard.KeyD) stopSteering();
    }
    function releaseSteering() { rawSteer = 0; keyboard.KeyA = keyboard.KeyD = false; stopSteering(); }
    function setGas(value) {
      if (value && (brake || keyboard.KeyS)) return false;
      gas = !!value;
      if (!gas && !keyboard.KeyW) { gasStart = null; gasLevel = 0; emit('KeyW', false); }
      return true;
    }
    function setBrake(value) {
      brake = !!value;
      if (brake) {
        gas = false; keyboard.KeyW = false; gasStart = null; gasLevel = 0;
        emit('KeyW', false); emit('KeyS', true);
      } else if (!keyboard.KeyS) emit('KeyS', false);
    }
    function key(code, down) {
      if (!Object.prototype.hasOwnProperty.call(keyboard, code)) return false;
      if (code === 'KeyW' && down && (brake || keyboard.KeyS)) return true;
      keyboard[code] = !!down;
      if (code === 'KeyS') {
        if (down) { gas = false; keyboard.KeyW = false; gasStart = null; gasLevel = 0; emit('KeyW', false); emit('KeyS', true); }
        else if (!brake) emit('KeyS', false);
      }
      if (code === 'KeyW' && !down && !gas) { gasStart = null; gasLevel = 0; emit('KeyW', false); }
      if ((code === 'KeyA' || code === 'KeyD') && !keyboard.KeyA && !keyboard.KeyD && !shape(rawSteer)) stopSteering();
      return true;
    }
    function clear() {
      rawSteer = smoothSteer = gasLevel = 0; gas = brake = false;
      lastTime = steerStart = gasStart = null; lastDirection = reverseReady = 0;
      for (const code of Object.keys(keys)) { keyboard[code] = false; emit(code, false); }
    }
    function frame(time) {
      if (!Number.isFinite(time)) { clear(); return false; }
      const elapsed = lastTime === null ? 0 : time - lastTime;
      // Never replay a backlog after a hidden tab, dropped frame or clock reset.
      if (elapsed < 0 || elapsed > 250) { clear(); lastTime = time; return false; }
      const dt = Math.min(50, Math.max(0, elapsed)); lastTime = time;
      const keyboardSteer = Number(keyboard.KeyD) - Number(keyboard.KeyA);
      const target = keyboard.KeyA || keyboard.KeyD ? keyboardSteer : shape(rawSteer);
      const direction = Math.sign(target);
      if (!direction) stopSteering();
      else {
        if (lastDirection && direction !== lastDirection) {
          smoothSteer = 0; steerStart = time; reverseReady = time + 80;
          emit('KeyA', false); emit('KeyD', false);
        }
        if (steerStart === null) steerStart = time;
        lastDirection = direction;
        smoothSteer += (target - smoothSteer) * (1 - Math.exp(-dt / 95));
        // Even a small deliberate turn gets one short pulse immediately; the
        // middle of the pad remains a genuine dead zone, not alternating A/D.
        const duty = 0.10 + Math.abs(smoothSteer) * (STEER_MAX - 0.10);
        const on = time >= reverseReady && (time - steerStart) % PERIOD_MS < duty * PERIOD_MS;
        // Release the other direction before pressing a new one.
        if (direction > 0) { emit('KeyA', false); emit('KeyD', on); }
        else { emit('KeyD', false); emit('KeyA', on); }
      }
      const stopping = brake || keyboard.KeyS;
      if (stopping) { emit('KeyW', false); emit('KeyS', true); gasStart = null; gasLevel = 0; }
      else {
        emit('KeyS', false);
        if (gas || keyboard.KeyW) {
          if (gasStart === null) gasStart = time;
          // A gentle take-off reaches normal native acceleration after 450 ms.
          gasLevel = Math.min(1, 0.40 + (time - gasStart) / 750);
          emit('KeyW', gasLevel >= 1 || (time - gasStart) % PERIOD_MS < gasLevel * PERIOD_MS);
        } else { gasStart = null; gasLevel = 0; emit('KeyW', false); }
      }
      return true;
    }
    return Object.freeze({ steer, releaseSteering, setGas, setBrake, key, frame, clear,
      snapshot: () => ({ rawSteer, smoothSteer, gas, brake, gasLevel, keys: { ...keys } }) });
  }
  return Object.freeze({ create, DEAD_ZONE, PERIOD_MS, STEER_MAX });
});
