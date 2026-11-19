/* Real, bounded post-render keepsakes. Does not alter the game or award points. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../image-content-bounds.js'));
  else root.GTAHighlightCapture = factory(root.GTAImageContentBounds);
})(typeof window !== 'undefined' ? window : globalThis, function (contentBounds) {
  'use strict';
  const MAX_EDGE = 960, MAX_DATA_URL_LENGTH = 480000, MAX_SAMPLES = 15;
  const validScene = value => Number.isInteger(value) && value >= 1 && value <= 3;
  const copy = value => value ? Object.assign({}, value) : null;
  function priorityOf(scene, kind, target) {
    if (kind !== 'explosion') return scene * 10;
    return scene === 3 && target === 2 ? 100 : 50 + scene * 10 + target;
  }
  function validDataURL(value) {
    return typeof value === 'string' && value.length <= MAX_DATA_URL_LENGTH &&
      /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value);
  }
  function create(options) {
    options = options || {};
    const source = options.canvas;
    const makeCanvas = options.createCanvas || (() => document.createElement('canvas'));
    const now = options.now || (() => performance.now());
    const timestamp = options.timestamp || (() => Date.now());
    const seen = new Set(), fallbackScenes = new Set();
    let best = null, bestQuality = -Infinity, sequence = 0, samples = 0;
    let scene = 0, activeMs = 0, lastFrame = null, pending = [], disabled = false, disposed = false;
    let probe = null, image = null;

    function metrics() {
      if (!probe) probe = makeCanvas();
      const ratio = Math.min(1, 96 / Math.max(source.width, source.height));
      probe.width = Math.max(1, Math.round(source.width * ratio));
      probe.height = Math.max(1, Math.round(source.height * ratio));
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      if (!ctx?.drawImage || !ctx?.getImageData) return null;
      ctx.drawImage(source, 0, 0, probe.width, probe.height);
      const bytes = ctx.getImageData(0, 0, probe.width, probe.height).data;
      let low = 255, high = 0, lit = 0, opaque = 0, fire = 0, sum = 0;
      for (let i = 0; i < bytes.length; i += 4) {
        const r = bytes[i], g = bytes[i + 1], b = bytes[i + 2], alpha = bytes[i + 3];
        const light = (r * 3 + g * 6 + b) / 10;
        low = Math.min(low, light); high = Math.max(high, light); sum += light;
        if (alpha > 240) opaque++;
        if (alpha > 240 && light > 12) lit++;
        // Only a quality hint AFTER a native-confirmed destruction, never a
        // claim that colour alone proves a kill or an explosion.
        if (alpha > 240 && r > 175 && g > 55 && g < 235 && b < 115 && r > g * 1.12 && g > b * 1.2) fire++;
      }
      const pixels = bytes.length / 4;
      if (!pixels || opaque < pixels * .9 || lit < pixels * .02 || high - low < 12) return null;
      const bounds = contentBounds?.fromPixels(bytes, probe.width, probe.height, source.width, source.height) ||
        { x: 0, y: 0, width: source.width, height: source.height };
      return { fire: fire, quality: fire / pixels * 100000 + sum / pixels, bounds: bounds };
    }

    function capture(candidate) {
      if (samples >= MAX_SAMPLES || candidate.priority < (best?.priority || 0)) return;
      if (!source || !Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width < 16 || source.height < 16) return;
      samples++;
      try {
        const measure = metrics();
        if (!measure) return; // Never replace a good frame with black/empty/faded content.
        const kind = candidate.kind === 'explosion' && measure.fire >= 2 ? 'explosion' : 'gameplay';
        const target = kind === 'explosion' ? candidate.target : -1;
        const priority = priorityOf(candidate.scene, kind, target);
        if (best && (priority < best.priority || priority === best.priority && measure.quality <= bestQuality)) return;
        if (!image) image = makeCanvas();
        const bounds = measure.bounds;
        const ratio = Math.min(1, MAX_EDGE / Math.max(bounds.width, bounds.height));
        image.width = Math.max(1, Math.round(bounds.width * ratio));
        image.height = Math.max(1, Math.round(bounds.height * ratio));
        const ctx = image.getContext('2d');
        if (!ctx?.drawImage) return;
        // Called in postMainLoop, while the actual WebGL drawing buffer exists.
        // No preserveDrawingBuffer, overlays, stock imagery, or invented fire.
        // The native buffer can contain paired black cinematic padding. Trim
        // only verified padding; never stretch the real scene or invent pixels.
        ctx.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, image.width, image.height);
        let dataUrl = image.toDataURL('image/jpeg', .8);
        if (typeof dataUrl === 'string' && dataUrl.length > MAX_DATA_URL_LENGTH) dataUrl = image.toDataURL('image/jpeg', .62);
        if (!validDataURL(dataUrl)) return;
        const capturedAt = timestamp();
        if (!Number.isSafeInteger(capturedAt) || capturedAt <= 0) return;
        best = { dataUrl: dataUrl, width: image.width, height: image.height, scene: candidate.scene,
          kind: kind, target: target, priority: priority, capturedAt: capturedAt, sequence: ++sequence };
        bestQuality = measure.quality;
        try { options.onHighlight?.(copy(best)); } catch (_) {}
      } catch (_) {
        // Canvas export can be denied or tainted. The exam and native loop keep
        // running; another capture attempt cannot fix that for this runtime.
        disabled = true; pending = [];
      }
    }

    function frame(value) {
      if (disposed || disabled) return;
      value = value || {};
      if (value.rendered !== true || value.warmup || value.active !== true || !validScene(value.scene) ||
          !['playing', 'finishing', 'complete'].includes(value.stage)) { lastFrame = null; return; }
      const clock = now();
      if (!Number.isFinite(clock)) return;
      if (scene !== value.scene) { scene = value.scene; activeMs = 0; lastFrame = null; pending = []; }
      if (lastFrame !== null) activeMs += Math.max(0, Math.min(100, clock - lastFrame));
      lastFrame = clock;
      let event = null;
      for (let target = 0; target < Math.min(3, value.targets?.length || 0); target++) {
        const flags = value.targets[target], key = scene + ':' + target;
        if (flags?.destroyed !== true || flags?.credited !== true || seen.has(key)) continue;
        seen.add(key);
        const candidate = { scene: scene, target: target, kind: 'explosion', priority: priorityOf(scene, 'explosion', target) };
        if (!event || candidate.priority > event.priority) event = candidate;
      }
      if (event && event.priority >= (pending[0]?.priority || 0) && event.priority >= (best?.priority || 0)) {
        // Three nearby rendered frames catch the blast growing and fading.
        // A newly destroyed helicopter supersedes pending car snapshots.
        pending = [0, 140, 320].map(delay => Object.assign({ at: activeMs + delay }, event));
      }
      if (!pending.length && !fallbackScenes.has(scene) && (activeMs >= 900 || value.stage !== 'playing')) {
        fallbackScenes.add(scene);
        pending.push({ at: activeMs, scene: scene, target: -1, kind: 'gameplay', priority: priorityOf(scene, 'gameplay', -1) });
      }
      if (pending.length && pending[0].at <= activeMs) capture(pending.shift());
    }

    function pause() { lastFrame = null; }
    function destroy() {
      if (disposed) return;
      disposed = true; pending = []; best = null; seen.clear(); fallbackScenes.clear();
      for (const surface of [probe, image]) if (surface) { surface.width = surface.height = 1; }
      probe = image = null;
    }
    return Object.freeze({ frame: frame, pause: pause, getHighlight: () => copy(best), destroy: destroy });
  }
  return Object.freeze({ create: create, priorityOf: priorityOf, validDataURL: validDataURL,
    MAX_EDGE: MAX_EDGE, MAX_DATA_URL_LENGTH: MAX_DATA_URL_LENGTH, MAX_SAMPLES: MAX_SAMPLES });
});
