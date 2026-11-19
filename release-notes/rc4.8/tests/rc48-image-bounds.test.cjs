'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Bounds = require('../dist/image-content-bounds.js');
const Capture = require('../dist/native-vc/highlight-capture.js');

function pixels(width = 54, height = 96, options = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  const { top = 12, bottom = 12, left = 0, right = 0, band = 0, dark = false, flat = false, transparent = false } = options;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bar = y < top || y >= height - bottom || x < left || x >= width - right;
    const gray = bar ? band : flat ? 100 : dark ? (x + y) % 2 ? 3 : 12 : (x + y) % 2 ? 52 : 126;
    data.set([gray, gray, gray, transparent && bar ? 0 : 255], (y * width + x) * 4);
  }
  return data;
}
const full = { x: 0, y: 0, width: 1080, height: 1920 };

test('paired black source letterboxing is trimmed using source coordinates', () => {
  assert.deepEqual(Bounds.fromPixels(pixels(), 54, 96, 1080, 1920), { x: 0, y: 240, width: 1080, height: 1440 });
  assert.deepEqual(Bounds.fromPixels(pixels(54, 96, { band: 7 }), 54, 96, 1080, 1920), { x: 0, y: 240, width: 1080, height: 1440 });
});

test('paired pillarbox and letterbox padding produce a bounded real content rectangle', () => {
  assert.deepEqual(Bounds.fromPixels(pixels(54, 96, { left: 6, right: 6 }), 54, 96, 1080, 1920), { x: 120, y: 240, width: 840, height: 1440 });
});

test('fully dark, low-light, uniform and transparent scenes are not cropped', () => {
  for (const options of [{ top: 96, bottom: 0 }, { dark: true }, { flat: true }, { transparent: true }]) {
    assert.deepEqual(Bounds.fromPixels(pixels(54, 96, options), 54, 96, 1080, 1920), full);
  }
});

test('a one-sided shadow, substantial asymmetry and excessive borders keep full content', () => {
  for (const options of [{ top: 12, bottom: 0 }, { top: 0, bottom: 12 }, { top: 12, bottom: 4 }, { top: 30, bottom: 30 }]) {
    assert.deepEqual(Bounds.fromPixels(pixels(54, 96, options), 54, 96, 1080, 1920), full);
  }
});

test('dark texture across the edge is not classified as a padding band', () => {
  const data = pixels();
  for (let y = 0; y < 12; y++) data.set([12, 14, 13, 255], (y * 54 + 27) * 4);
  assert.deepEqual(Bounds.fromPixels(data, 54, 96, 1080, 1920), full);
});

test('uncertain soft transition into dark scene keeps full image', () => {
  const data = pixels();
  for (let y = 12; y < 15; y++) for (let x = 0; x < 54; x++) data.set([10, 10, 10, 255], (y * 54 + x) * 4);
  assert.deepEqual(Bounds.fromPixels(data, 54, 96, 1080, 1920), full);
});

test('normal uncropped frames and invalid pixel input are safe no-ops', () => {
  assert.deepEqual(Bounds.fromPixels(pixels(54, 96, { top: 0, bottom: 0 }), 54, 96, 1080, 1920), full);
  assert.deepEqual(Bounds.fromPixels(new Uint8Array(4), 54, 96, 1080, 1920), full);
  assert.deepEqual(Bounds.fromPixels(pixels(12, 96), 12, 96, 1080, 1920), full);
});

test('image detector does one bounded readback, releases its canvas, and falls back on read errors', () => {
  const image = { naturalWidth: 1080, naturalHeight: 1920 };
  const probe = { width: 0, height: 0 }; let reads = 0;
  probe.getContext = () => ({ drawImage(source) { assert.equal(source, image); }, getImageData(x, y, w, h) {
    reads++; assert.equal(Math.max(w, h), 96); return { data: pixels(w, h) };
  } });
  assert.deepEqual(Bounds.detect(image, { createCanvas: () => probe }), { x: 0, y: 240, width: 1080, height: 1440 });
  assert.equal(reads, 1); assert.equal(probe.width, 1); assert.equal(probe.height, 1);
  assert.deepEqual(Bounds.detect(image, { createCanvas: () => { throw new Error('unavailable'); } }), full);
  assert.deepEqual(Bounds.detect(image, { createCanvas: () => ({ getContext() { return { drawImage() {}, getImageData() { throw new Error('tainted'); } }; } }) }), full);
  assert.equal(Bounds.detect({ width: 0, height: 0 }), null);
});

test('native confirmed explosion JPEG is encoded from cropped source without a second probe', () => {
  const source = { width: 1080, height: 1920 }, surfaces = [], draws = [];
  const capture = Capture.create({ canvas: source, now: () => 1000, timestamp: () => 1800000000000,
    createCanvas() {
      const surface = { width: 0, height: 0 };
      surfaces.push(surface);
      surface.getContext = () => ({
        drawImage(...args) { draws.push(args); },
        getImageData(x, y, w, h) {
          const data = pixels(w, h);
          for (let x = 24; x < 29; x++) data.set([255, 125, 15, 255], (40 * w + x) * 4);
          return { data };
        }
      });
      surface.toDataURL = () => 'data:image/jpeg;base64,/9j/AAAA';
      return surface;
    }
  });
  capture.frame({ rendered: true, scene: 3, stage: 'playing', active: true, targets: [{}, {}, { credited: true, destroyed: true }] });
  const shot = capture.getHighlight();
  assert(shot); assert.equal(shot.scene, 3); assert.equal(shot.target, 2); assert.equal(shot.kind, 'explosion');
  assert.equal(shot.width, 720); assert.equal(shot.height, 960);
  assert.equal(draws.length, 2, 'Existing probe + one exported image, no extra native readback');
  assert.deepEqual(draws[1], [source, 0, 240, 1080, 1440, 0, 0, 720, 960]);
});
