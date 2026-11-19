/* RC4.9: a small north-up radar, driven only by validated native coordinates.
   Artwork is extracted from this project's existing hud.txd / radar tiles.
   No timers, engine reads, extra gameplay requests or scoring live here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTAHudRadar = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const WORLD = Object.freeze({ minX: -2000, maxY: 2000, size: 4000 });
  const finite = value => Number.isFinite(value) && Math.abs(value) < 100000;
  function worldToAtlas(x, y, size = 1024) {
    return { x: (x - WORLD.minX) / WORLD.size * size, y: (WORLD.maxY - y) / WORLD.size * size };
  }
  function projectTarget(player, target, range, radius) {
    const dx = target.x - player.x, dy = player.y - target.y;
    const distance = Math.hypot(dx, dy), scale = radius / range;
    const limit = radius - 9, span = distance * scale;
    const factor = span > limit ? limit / span : 1;
    return { x: dx * scale * factor, y: dy * scale * factor,
      distance, clipped: span > limit, angle: Math.atan2(dy, dx) };
  }
  function readPacket(heap, abi, contract) {
    const slot = contract?.slots;
    if (!heap || !slot || !Number.isInteger(abi) || abi < 0 ||
        !Number.isInteger(slot.mapValid) || abi + slot.mapValid >= heap.length ||
        heap[abi] !== contract.magic?.[0] || heap[abi + 1] !== contract.magic?.[1] ||
        heap[abi + 2] !== contract.version || heap[abi + slot.mapValid] !== 1) return null;
    const names = ['playerX', 'playerY', 'playerHeading', 'mapTargetX', 'mapTargetY', 'mapTargetKind'];
    if (names.some(name => !Number.isInteger(slot[name]) || slot[name] < 0 || abi + slot[name] >= heap.length)) return null;
    const floats = new Float32Array(heap.buffer, heap.byteOffset, heap.length);
    const player = { x: floats[abi + slot.playerX], y: floats[abi + slot.playerY], heading: floats[abi + slot.playerHeading] };
    if (!Object.values(player).every(finite)) return null;
    const kind = heap[abi + slot.mapTargetKind];
    const target = kind >= 1 && kind <= 4 ? { x: floats[abi + slot.mapTargetX], y: floats[abi + slot.mapTargetY], kind } : null;
    if (target && (!finite(target.x) || !finite(target.y))) return null;
    return { player, target, driving: Number.isInteger(slot.inCar) && heap[abi + slot.inCar] === 1 };
  }
  function create(options) {
    const element = options.element, canvas = options.canvas, label = options.label;
    const context = canvas?.getContext?.('2d', { alpha: true });
    if (!context || !element) return { update() {}, hide() {}, dispose() {} };
    let stopped = false, lastTime = -Infinity, latest = null, currentLabel = '';
    const images = {}, base = options.assetsURL || '../assets/game-ui/';
    const ImageClass = options.ImageClass || (typeof Image !== 'undefined' ? Image : null);
    const dpr = Math.min(2, Math.max(1, options.pixelRatio || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)));
    const size = 112, centre = size / 2, radius = centre - 4;
    canvas.width = canvas.height = Math.round(size * dpr);
    if (ImageClass) for (const [name, file] of Object.entries({ map: 'vice-radar.webp', disc: 'radar-disc.png' })) {
      const image = new ImageClass();
      image.decoding = 'async'; image.fetchPriority = 'low';
      image.onload = () => { if (!stopped && latest) draw(latest); };
      image.onerror = () => { /* Optional art never delays native-ready. */ };
      image.src = base + file; images[name] = image;
    }
    function available(image) { return image && image.complete && image.naturalWidth > 0; }
    function draw(packet) {
      if (stopped) return;
      const ctx = context, range = packet.driving ? 150 : 90;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
      ctx.save(); ctx.beginPath(); ctx.arc(centre, centre, radius, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#25304c'; ctx.fillRect(0, 0, size, size);
      if (available(images.map)) {
        const atlas = worldToAtlas(packet.player.x, packet.player.y, images.map.naturalWidth);
        const span = range / WORLD.size * images.map.naturalWidth;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(images.map, atlas.x - span, atlas.y - span, span * 2, span * 2,
          centre - radius, centre - radius, radius * 2, radius * 2);
        ctx.fillStyle = '#26204a18'; ctx.fillRect(0, 0, size, size);
      }
      let text = 'VICE CITY';
      if (packet.target) {
        const target = projectTarget(packet.player, packet.target, range, radius);
        ctx.save(); ctx.translate(centre + target.x, centre + target.y);
        ctx.fillStyle = '#f41670'; ctx.strokeStyle = '#fff4df'; ctx.lineWidth = 2;
        ctx.beginPath();
        if (target.clipped) {
          ctx.rotate(target.angle); ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-2, 0); ctx.lineTo(-4, 5);
        } else { ctx.rect(-4, -4, 8, 8); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        const names = { 1: packet.weapon === 30 ? 'РПГ' : 'Узи', 2: 'Машина', 3: 'Маршрут', 4: 'Вертолёт' };
        text = names[packet.target.kind] + ' · ' + Math.round(target.distance) + ' м';
      }
      // GTA heading is counter-clockwise from north; canvas positive Y points down.
      ctx.save(); ctx.translate(centre, centre); ctx.rotate(-packet.player.heading * Math.PI / 180);
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath();
      ctx.fillStyle = '#fff7df'; ctx.strokeStyle = '#17123c'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.restore();
      if (available(images.disc)) ctx.drawImage(images.disc, 0, 0, size, size);
      else { ctx.beginPath(); ctx.arc(centre, centre, radius + 1, 0, Math.PI * 2); ctx.strokeStyle = '#f8e4cc'; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.fillStyle = '#fff4df'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#17123c'; ctx.strokeText('N', centre, 13); ctx.fillText('N', centre, 13);
      if (text !== currentLabel) {
        currentLabel = text;
        if (label) label.textContent = text;
        element.setAttribute('aria-label', 'Миникарта. ' + (packet.target ? text + '. Розовая метка — текущая цель.' : 'Север сверху.'));
      }
    }
    return {
      update(packet, now, weapon) {
        if (stopped) return;
        if (!packet) { latest = null; element.hidden = true; return; }
        latest = Object.assign({}, packet, { weapon });
        element.hidden = false;
        if (Number.isFinite(now) && now - lastTime < 80) return;
        lastTime = Number.isFinite(now) ? now : 0; draw(latest);
      },
      hide() { latest = null; element.hidden = true; },
      dispose() {
        stopped = true; latest = null; element.hidden = true;
        for (const image of Object.values(images)) { image.onload = image.onerror = null; }
      }
    };
  }
  return Object.freeze({ create, readPacket, worldToAtlas, projectTarget, WORLD });
});
