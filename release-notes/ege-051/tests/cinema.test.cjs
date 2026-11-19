'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../../..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const cinemaCode = app.slice(0, app.indexOf('\n(function () {\n  const Boot'));
assert(cinemaCode.includes('GTAExamCinema'), 'Cinema is part of the production app; no extra JS request');
function harness(reduced = false) {
  const frameMap = new Map(); let id = 0, time = 0;
  const view = { dataset: { shot: '1' }, style: { setProperty(key, value) { this[key] = value; } } };
  const win = { document: { hidden: false }, matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame(fn) { const next = ++id; frameMap.set(next, fn); return next; },
    cancelAnimationFrame(value) { frameMap.delete(value); } };
  vm.runInNewContext(cinemaCode, { window: win, console });
  const scene = win.GTAExamCinema;
  function tick(ms = 100) {
    time += ms;
    const current = Array.from(frameMap.entries()); frameMap.clear();
    current.forEach(([, fn]) => fn(time));
  }
  return { scene, win, view, tick, pending: () => frameMap.size, host: { querySelector: () => view } };
}
test('cinema uses zero additional script fetches and offers a real skip action', () => {
  const h = harness(); const html = h.scene.markup();
  assert.match(html, /data-action="cinema-skip"/);
  assert.match(html, /Телефоны и чит-коды/);
  assert.match(html, /Оружие получите на практической части/);
  assert.match(html, /Города и герои/);
  assert.match(html, /assets\/cinema\/exam-room.svg/);
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(index, /exam-cinema.css/);
  assert(!index.includes('exam-cinema.js'), 'No extra blocking/optional JS request');
});
test('cinema plays three beats and completes exactly once', () => {
  const h = harness(); let finished = 0;
  assert.equal(h.scene.mount(h.host, () => finished++), true);
  for (let i = 0; i < 33; i++) h.tick();
  assert.equal(h.view.dataset.shot, '2');
  for (let i = 0; i < 53; i++) h.tick();
  assert.equal(h.view.dataset.shot, '3');
  for (let i = 0; i < 48; i++) h.tick();
  assert.equal(finished, 1); assert.equal(h.pending(), 0);
  h.tick(); assert.equal(finished, 1);
});
test('paused/backgrounded scenes do not burn elapsed time', () => {
  const h = harness(); let finished = 0;
  h.scene.mount(h.host, () => finished++);
  for (let i = 0; i < 10; i++) h.tick();
  h.win.document.hidden = true;
  for (let i = 0; i < 180; i++) h.tick();
  assert.equal(h.view.dataset.shot, '1'); assert.equal(finished, 0);
  h.win.document.hidden = false;
  for (let i = 0; i < 110; i++) h.tick();
  assert.equal(finished, 0);
  for (let i = 0; i < 20; i++) h.tick();
  assert.equal(finished, 1);
});
test('cancel prevents stale completion after navigation', () => {
  const h = harness(); let finished = 0;
  h.scene.mount(h.host, () => finished++);
  h.tick(); h.scene.cancel();
  for (let i = 0; i < 150; i++) h.tick();
  assert.equal(finished, 0); assert.equal(h.pending(), 0);
});
test('reduced motion shortens presentation to 1.6 seconds', () => {
  const h = harness(true); let finished = 0;
  h.scene.mount(h.host, () => finished++);
  for (let i = 0; i < 19; i++) h.tick();
  assert.equal(finished, 1);
});
test('minimal or broken preview environments fall back without a timer', () => {
  const h = harness();
  assert.equal(h.scene.mount({ querySelector: () => ({ dataset: {}, style: {} }) }, () => {}), false);
  assert.equal(h.pending(), 0);
});
