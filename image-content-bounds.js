/* Remove only unmistakable paired black padding from a real captured frame.
 * It is optional: a dark scene, unreadable canvas or uncertainty keeps the image. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GTAImageContentBounds = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const PROBE_EDGE = 96;
  function sizeOf(image) {
    const width = Number(image?.naturalWidth || image?.videoWidth || image?.width);
    const height = Number(image?.naturalHeight || image?.videoHeight || image?.height);
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
  }
  function full(width, height) { return { x: 0, y: 0, width: width, height: height }; }
  function fromPixels(data, width, height, sourceWidth, sourceHeight) {
    const original = full(sourceWidth, sourceHeight);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 ||
        !data || data.length !== width * height * 4 || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) return original;
    const black = (x, y) => {
      const at = (y * width + x) * 4;
      return data[at + 3] >= 250 && Math.max(data[at], data[at + 1], data[at + 2]) <= 8;
    };
    function lineBlack(axis, at, start, end) {
      for (let k = start; k < end; k++) if (!(axis === 'y' ? black(k, at) : black(at, k))) return false;
      return true;
    }
    function sceneEdge(axis, at, direction, start, end) {
      // A sharp edge into visible content distinguishes padding from a natural
      // dark gradient. Two nearby sample lines tolerate scaling/JPEG boundaries.
      for (let step = 0; step < 2; step++) {
        const line = at + direction * step; let lit = 0;
        if (line < 0 || line >= (axis === 'y' ? height : width)) continue;
        for (let k = start; k < end; k++) {
          const offset = (axis === 'y' ? line * width + k : k * width + line) * 4;
          if (data[offset + 3] >= 250 && Math.max(data[offset], data[offset + 1], data[offset + 2]) > 24) lit++;
        }
        if (lit >= (end - start) * .35) return true;
      }
      return false;
    }
    function paired(axis, size, start, end) {
      let before = 0, after = 0;
      while (before < size && lineBlack(axis, before, start, end)) before++;
      while (after < size - before && lineBlack(axis, size - 1 - after, start, end)) after++;
      if (before < 2 || after < 2 || before > size * .24 || after > size * .24 || before + after > size * .40 ||
          Math.abs(before - after) > Math.max(2, Math.min(before, after) * .2) ||
          !sceneEdge(axis, before, 1, start, end) || !sceneEdge(axis, size - after - 1, -1, start, end)) return [0, 0];
      return [before, after];
    }
    const [top, bottom] = paired('y', height, 0, width);
    const [left, right] = paired('x', width, top, height - bottom);
    if (!(top || left)) return original;
    let lit = 0, count = 0, low = 255, high = 0;
    for (let y = top; y < height - bottom; y++) for (let x = left; x < width - right; x++) {
      const at = (y * width + x) * 4;
      const light = (data[at] * 3 + data[at + 1] * 6 + data[at + 2]) / 10;
      low = Math.min(low, light); high = Math.max(high, light); count++;
      if (data[at + 3] >= 250 && light > 24) lit++;
    }
    // Never trim a fully dark/faded frame or a flat colour card as gameplay.
    if (!count || lit < count * .2 || high - low < 24) return original;
    const x = Math.ceil(left / width * sourceWidth), y = Math.ceil(top / height * sourceHeight);
    const rightEdge = Math.floor((width - right) / width * sourceWidth);
    const bottomEdge = Math.floor((height - bottom) / height * sourceHeight);
    return { x: x, y: y, width: Math.max(1, rightEdge - x), height: Math.max(1, bottomEdge - y) };
  }
  function detect(image, options) {
    const source = sizeOf(image);
    if (!source) return null;
    const original = full(source.width, source.height);
    let probe;
    try {
      const makeCanvas = options?.createCanvas || (() => document.createElement('canvas'));
      probe = makeCanvas();
      const ratio = Math.min(1, PROBE_EDGE / Math.max(source.width, source.height));
      probe.width = Math.max(1, Math.round(source.width * ratio));
      probe.height = Math.max(1, Math.round(source.height * ratio));
      const context = probe.getContext('2d', { willReadFrequently: true });
      if (!context?.drawImage || !context?.getImageData) return original;
      context.drawImage(image, 0, 0, probe.width, probe.height);
      return fromPixels(context.getImageData(0, 0, probe.width, probe.height).data, probe.width, probe.height, source.width, source.height);
    } catch (_) { return original; }
    finally { if (probe) probe.width = probe.height = 1; }
  }
  return Object.freeze({ detect: detect, fromPixels: fromPixels, PROBE_EDGE: PROBE_EDGE });
});
