'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Layout = require('../dist/telegram-layout.js');
const Gestures = require('../dist/game-gestures.js');

function emitter() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
    emit(name, value = {}) { for (const fn of [...handlers.get(name) || []]) fn(value); },
    count(name) { return handlers.get(name)?.size || 0; }
  };
}
function harness(tg) {
  const doc = emitter(), root = emitter(), vars = new Map(), classes = new Set(), fullscreen = { hidden: false };
  doc.documentElement = {
    style: { setProperty(name, value) { vars.set(name, value); } },
    classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } }
  };
  doc.querySelectorAll = () => [fullscreen];
  root.document = doc; root.visualViewport = emitter(); root.Telegram = { WebApp: tg };
  root.setTimeout = setTimeout; root.clearTimeout = clearTimeout;
  return { root, doc, vars, classes, fullscreen };
}
function telegram(overrides = {}) {
  const bus = emitter();
  return { initData: 'test-session', platform: 'ios', isFullscreen: true,
    safeAreaInset: { top: 59, right: 0, bottom: 34, left: 0 },
    contentSafeAreaInset: { top: 48, right: 0, bottom: 0, left: 0 },
    onEvent: bus.addEventListener.bind(bus), offEvent: bus.removeEventListener.bind(bus),
    emit: bus.emit.bind(bus), count: bus.count.bind(bus), ...overrides };
}
// A tiny element tree is sufficient for production's closest()-based policy;
// no WebKit input, CSS layout or native Telegram rendering is simulated here.
function element(tag, attrs = {}, parent = null) {
  return { nodeType: 1, tag, attrs, parentElement: parent,
    closest(selectors) {
      for (let node = this; node; node = node.parentElement) {
        if (selectors.split(',').some(raw => {
          const s = raw.trim();
          if (s[0] === '#') return node.attrs.id === s.slice(1);
          if (s[0] === '.') return (node.attrs.class || '').split(/\s+/).includes(s.slice(1));
          const m = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(s);
          if (m) return m[1] in node.attrs && (m[2] === undefined || node.attrs[m[1]] === m[2]);
          return node.tag === s;
        })) return node;
      }
      return null;
    }
  };
}
function attempted(doc, name, target, cancelable = true) {
  const event = { target, cancelable, prevented: false, preventDefault() { this.prevented = true; } };
  doc.emit(name, event); return event.prevented;
}

test('iPhone fullscreen reserves device + Telegram rows, not max or a duplicated notch', () => {
  const tg = telegram(), layout = Layout.measure(tg, { top: 59, bottom: 34 });
  assert.equal(layout.total.top, 107);
  assert.equal(layout.total.bottom, 34);
  assert.equal(layout.topReserve, 0);
  assert.equal(Layout.measure(tg, { top: 0 }).total.top, 107, 'TG still reports the notch if WebKit env() is zero');
  const appButtonTop = layout.total.top + 7;
  assert(appButtonTop >= tg.safeAreaInset.top + tg.contentSafeAreaInset.top, 'The sound row begins below both native layers');
});

test('fullscreen transition fallback is mobile-only, clears on exit, and does not accumulate', () => {
  const tg = telegram({ contentSafeAreaInset: {} });
  assert.equal(Layout.measure(tg).total.top, 107);
  tg.contentSafeAreaInset = { top: 54 };
  assert.equal(Layout.measure(tg).total.top, 113);
  assert.equal(Layout.measure(tg).topReserve, 0);
  tg.isFullscreen = false; tg.safeAreaInset = {}; tg.contentSafeAreaInset = {};
  assert.equal(Layout.measure(tg).total.top, 0);
  assert.equal(Layout.measure(telegram({ platform: 'tdesktop', safeAreaInset: {}, contentSafeAreaInset: {} })).total.top, 0);
  assert.equal(Layout.measure({ ...tg, initData: '', safeAreaInset: { top: 59 } }, { top: 24 }).total.top, 24, 'Ordinary browsers retain only their browser safe area');
});

test('rotation respects side insets and sanitises invalid values without doubling CSS env values', () => {
  const tg = telegram({ safeAreaInset: { top: 0, left: 59, bottom: 21, right: -5 }, contentSafeAreaInset: { top: 32, left: 8, bottom: 9, right: NaN } });
  const layout = Layout.measure(tg, { left: 59, bottom: 21 });
  assert.deepEqual(layout.total, { top: 32, right: 0, bottom: 30, left: 67 });
  assert.equal(Layout.measure(telegram({ safeAreaInset: { top: Infinity }, contentSafeAreaInset: { top: '48' } })).total.top, 48);
});

test('live inset, fullscreen, viewport and restore events update one owner without duplicate listeners', () => {
  const tg = telegram(), h = harness(tg), controller = Layout.create(h.root);
  controller.connect(tg); controller.connect(tg);
  assert.equal(tg.count('contentSafeAreaChanged'), 1);
  assert.equal(h.vars.get('--tg-safe-top'), '107px');
  assert.equal(h.vars.get('--gta-system-safe-top'), '59px');
  assert.equal(h.vars.get('--gta-content-safe-top'), '48px');
  assert.equal(h.fullscreen.hidden, true);
  tg.contentSafeAreaInset.top = 52; tg.emit('contentSafeAreaChanged');
  assert.equal(h.vars.get('--tg-safe-top'), '111px');
  tg.safeAreaInset.top = 0; tg.safeAreaInset.left = 59; tg.emit('safeAreaChanged');
  assert.equal(h.vars.get('--tg-safe-left'), '59px');
  tg.contentSafeAreaInset.top = 32; h.root.emit('orientationchange');
  assert.equal(h.vars.get('--tg-safe-top'), '32px');
  tg.contentSafeAreaInset.top = 36; h.root.visualViewport.emit('resize');
  assert.equal(h.vars.get('--tg-safe-top'), '36px');
  tg.isFullscreen = false; tg.contentSafeAreaInset.top = 0; tg.emit('fullscreenChanged', { isFullscreen: false });
  assert.equal(h.fullscreen.hidden, false); assert(!h.classes.has('tg-fullscreen'));
  tg.safeAreaInset.top = 24; tg.emit('viewportChanged', { isStateStable: true });
  assert.equal(h.vars.get('--tg-safe-top'), '24px');
  tg.safeAreaInset.top = 26; h.root.emit('pageshow', { persisted: true });
  assert.equal(h.vars.get('--tg-safe-top'), '26px');
  const next = telegram({ safeAreaInset: { top: 10 } }); controller.connect(next);
  assert.equal(tg.count('safeAreaChanged'), 0); assert.equal(next.count('safeAreaChanged'), 1);
  controller.destroy(); assert.equal(next.count('safeAreaChanged'), 0);
  assert.equal(h.root.count('resize'), 0); assert.equal(h.root.visualViewport.count('resize'), 0);
});

test('nested brake/fire labels reject iOS selection, context menus and drag without consuming input gestures', () => {
  const h = harness(), guards = Gestures.create(h.root);
  const controls = element('div', { id: 'car-controls' }), button = element('button', {}, controls), label = element('span', {}, button);
  for (const event of ['selectstart', 'contextmenu', 'dragstart']) assert.equal(attempted(h.doc, event, label), true, event);
  assert.equal(attempted(h.doc, 'selectstart', { nodeType: 3, parentElement: label }), true, 'A native label text node is covered');
  assert.equal(attempted(h.doc, 'contextmenu', element('canvas', { id: 'canvas' })), true);
  for (const event of ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'click']) assert.equal(h.doc.count(event), 0, event + ' is untouched, including two-thumb control');
  assert.equal(attempted(h.doc, 'contextmenu', label, false), false);
  guards.destroy(); assert.equal(h.doc.count('selectstart'), 0);
});

test('name editing, final PNG save, review text and error copying keep their native menus', () => {
  const h = harness(), guards = Gestures.create(h.root), app = element('main', { id: 'app' });
  guards.setActive(true);
  const targets = [element('input', { id: 'nickname' }, app), element('textarea', {}, app),
    element('span', {}, element('div', { contenteditable: 'true' }, app)),
    element('img', { id: 'result-story-image' }, app),
    element('span', {}, element('div', { class: 'review-body' }, app)),
    element('span', {}, element('pre', { id: 'error-diagnostic' })),
    element('span', {}, element('div', { 'data-native-selection': '' }, app))];
  for (const target of targets) for (const event of ['selectstart', 'contextmenu', 'dragstart']) assert.equal(attempted(h.doc, event, target), false, target.tag + ' / ' + event);
  guards.setActive(false);
  assert.equal(attempted(h.doc, 'selectstart', element('p')), false, 'Unrelated document content is not captured');
  assert.equal(attempted(h.doc, 'selectstart', element('button', {}, app)), true, 'A/B answer controls remain protected without locking scrolling');
  h.root.emit('pagehide'); assert.equal(attempted(h.doc, 'selectstart', element('button', {}, app)), false);
  h.root.emit('pageshow'); assert.equal(attempted(h.doc, 'selectstart', element('button', {}, app)), true);
  guards.destroy();
});

test('native Telegram swipe ownership still restores on game exit and BFCache hide', () => {
  let disabled = 0, enabled = 0;
  const tg = telegram({ isVerticalSwipesEnabled: true, isVersionAtLeast: () => true,
    disableVerticalSwipes() { disabled++; this.isVerticalSwipesEnabled = false; },
    enableVerticalSwipes() { enabled++; this.isVerticalSwipesEnabled = true; } });
  const h = harness(tg), guards = Gestures.create(h.root);
  guards.setActive(true); guards.setActive(true); assert.equal(disabled, 1);
  h.root.emit('pagehide'); assert.equal(enabled, 1);
  h.root.emit('pageshow'); assert.equal(disabled, 2);
  guards.setActive(false); assert.equal(enabled, 2);
  guards.destroy(); assert.equal(enabled, 2);
});
