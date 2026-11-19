'use strict';

// Runs the real legacy RPG mount and its software renderer against a small
// canvas/DOM adapter. This checks disclosure and restored protocols, not GPU,
// mobile layout or native Vice City physics.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filename = path.resolve(__dirname, '../dist/rpg-scene.js');
const copy = value => JSON.parse(JSON.stringify(value));

async function mount(result, options = {}) {
  const nodes = new Map(), errors = [], accepted = [];
  class Node {
    constructor() { this.dataset = {}; this.attributes = {}; this.hidden = false; this.textContent = ''; this.innerHTML = ''; this.style = { setProperty() {} }; this.classes = new Set(); this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name) }; }
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Node()); return nodes.get(selector); }
    querySelectorAll(selector) { return selector === '.rpg-flight-health i' ? [this.querySelector('health-one'), this.querySelector('health-two')] : []; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getBoundingClientRect() { return { width: 24, height: 40 }; }
    addEventListener() {} removeEventListener() {} contains() { return true; }
    getContext(kind) { return kind === '2d' ? { createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData() {} } : null; }
  }
  const container = new Node(), document = new Node(); document.hidden = false;
  const context = { document, AbortController, performance: { now: () => 1000 }, console: { error: (...args) => errors.push(args), warn: (...args) => errors.push(args) }, setTimeout, clearTimeout,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener() {}, matchMedia: () => ({ matches: true }) };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const port = context.GTARPGScene.mount(container, { ...options, result: copy(result), muted: true, onComplete: value => accepted.push(copy(value)), onError: error => errors.push(error) });
  await Promise.resolve();
  assert.deepEqual(errors, [], 'The real legacy scene must render its restored result');
  assert.equal(nodes.get('.rpg-canvas').dataset.renderer, 'canvas');
  assert.deepEqual(accepted, [result], 'Presentation changes cannot rewrite or suppress the result protocol');
  return { nodes, port };
}

const won = { version: 1, completed: true, shots: [{ hit: true, aimed: true }, { hit: true, aimed: true }] };
const missed = { version: 1, completed: true, shots: Array.from({ length: 3 }, () => ({ hit: false, aimed: false })) };
const skipped = { version: 1, completed: true, skipped: true, shots: [] };

test('embedded legacy RPG completion is neutral for hits, misses and restored technical skips', async () => {
  for (const result of [won, missed, skipped]) for (const options of [{ examMode: true }, { revealResult: false }]) {
    const { nodes, port } = await mount(result, options);
    assert.equal(nodes.get('h2').textContent, 'Практика завершена');
    assert.equal(nodes.get('p').textContent, 'Оценку объявит комиссия.');
    assert.equal(nodes.get('.rpg-flight-health').hidden, true);
    assert.equal(nodes.get('.rpg-flight-health').attributes['aria-label'], 'Цель');
    assert.equal(nodes.get('.rpg-hint').hidden, true);
    assert.deepEqual(copy(port.getState().result), result);
    port.setPaused(true); port.setPaused(false);
    assert.equal(nodes.get('h2').textContent, 'Практика завершена');
    port.destroy();
  }
});

test('standalone legacy RPG keeps its existing result feedback by default', async () => {
  for (const [result, title, hits] of [[won, 'Цель сбита', 2], [missed, 'Боезапас исчерпан', 0], [skipped, 'Практика пропущена', 0]]) {
    const { nodes, port } = await mount(result);
    assert.equal(nodes.get('h2').textContent, title);
    assert.equal(nodes.get('p').textContent, 'Попадания: ' + hits + ' из 2. Раунд завершён.');
    assert.equal(nodes.get('.rpg-flight-health').hidden, false);
    port.destroy();
  }
});
