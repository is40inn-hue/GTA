'use strict';

/* The approved cover is shared with the home screen. This view only draws its logo
   into UI canvases; loading is optional and can never block a result forever. */
(function (root) {
  const ASSET = 'assets/brand-cover-rc45.png?release=ege-054';
  const SOURCE = { width: 1086, height: 1448 };
  const LOGO = { x: 80, y: 210, width: 930, height: 535 };
  const TIMEOUT = 1800;
  let ready = null, pending = null;

  function dimensions(image) {
    if (!image) return null;
    const width = Number(image.naturalWidth || image.width);
    const height = Number(image.naturalHeight || image.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    // A different image must never be accidentally treated as the cover atlas.
    if (Math.abs(width / height - SOURCE.width / SOURCE.height) > .002) return null;
    return { width, height };
  }

  function load() {
    if (ready) return Promise.resolve(ready);
    if (pending) return pending;
    if (typeof root.Image !== 'function' || typeof root.setTimeout !== 'function' || typeof root.clearTimeout !== 'function') return Promise.resolve(null);
    const request = new Promise(resolve => {
      let image;
      try { image = new root.Image(); }
      catch (_) { resolve(null); return; }
      let settled = false, timer;
      const finish = value => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        image.onload = image.onerror = null;
        if (value) ready = value;
        resolve(value);
      };
      timer = root.setTimeout(() => finish(null), TIMEOUT);
      image.onload = () => finish(dimensions(image) ? image : null);
      image.onerror = () => finish(null);
      image.decoding = 'async';
      image.fetchPriority = 'low';
      try { image.src = ASSET; }
      catch (_) { finish(null); }
    });
    pending = request;
    request.then(() => { if (pending === request) pending = null; });
    return request;
  }

  function draw(context, image, x, y, width, height) {
    const size = dimensions(image);
    if (!size || !context || typeof context.drawImage !== 'function' || !(width > 0 && height > 0)) return false;
    const scale = Math.min(width / LOGO.width, height / LOGO.height);
    const targetWidth = LOGO.width * scale, targetHeight = LOGO.height * scale;
    context.drawImage(image,
      LOGO.x * size.width / SOURCE.width, LOGO.y * size.height / SOURCE.height,
      LOGO.width * size.width / SOURCE.width, LOGO.height * size.height / SOURCE.height,
      x + (width - targetWidth) / 2, y + (height - targetHeight) / 2, targetWidth, targetHeight);
    return true;
  }

  root.GTAFinalBrand = Object.freeze({ load, draw });
})(typeof window !== 'undefined' ? window : globalThis);
