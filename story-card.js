'use strict';

/* One local 9:16 result image. The caller supplies decoded images; this renderer
   never fetches a URL or creates a substitute game scene. */
(function () {
  const WIDTH = 1080, HEIGHT = 1920;
  const COLORS = {
    blue: '#1736b6', blueDark: '#17123c', yellow: '#ffd18a', red: '#df145b',
    peach: '#ffe2bb', paper: '#fff0d8', white: '#fff9ef', ink: '#17123c',
    brown: '#66516a', line: '#d4b99a'
  };
  const HERO = { x: 72, y: 610, width: 936, height: 800 };

  function finite(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function clean(value, fallback, limit) {
    const text = String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return Array.from(text || fallback).slice(0, limit).join('');
  }
  function imageSize(image) {
    if (!image) return null;
    const width = finite(image.naturalWidth || image.videoWidth || image.width, 0);
    const height = finite(image.naturalHeight || image.videoHeight || image.height, 0);
    return width > 0 && height > 0 ? { image: image, width: width, height: height } : null;
  }
  function readableImage(image) {
    const source = imageSize(image);
    if (!source) return null;
    // A rejected avatar must not taint the final card and prevent sharing.
    try {
      const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      const ctx = probe.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0, 1, 1);
      ctx.getImageData(0, 0, 1, 1);
      return source;
    } catch (_) { return null; }
  }
  function initial(name) {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      const first = new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(name)[Symbol.iterator]().next().value;
      if (first) return first.segment.toUpperCase();
    }
    return Array.from(name)[0].toUpperCase();
  }

  function sectionData(data) {
    return Array.isArray(data.sections) && data.sections.length >= 3 && data.sections.slice(0, 3).every(s =>
      s && Number.isFinite(Number(s.points)) && Number.isFinite(Number(s.max)) && Number(s.max) > 0)
      ? data.sections.slice(0, 3).map(s => ({ max: Number(s.max), points: Math.max(0, Math.min(Number(s.max), Number(s.points))) })) : null;
  }
  function resultLine(data) {
    data = data || {};
    const score = Math.max(0, Math.min(100, Math.round(finite(data.score, 0))));
    const passScore = Math.max(0, Math.min(100, Math.round(finite(data.passScore, 60))));
    const sections = sectionData(data);
    if (data.mode === 'practice') return 'Пробный заезд. До встречи на экзамене.';
    if (score >= 90) return 'Комиссия просит автограф.';
    // A stale or partial breakdown must not make a claim about the player's
    // theory or practical performance. Use the same earned points as the card.
    if (sections && sections.reduce((sum, s) => sum + s.max, 0) === 100 &&
        Math.abs(sections.reduce((sum, s) => sum + s.points, 0) - score) <= 0.5) {
      const theory = (sections[0].points + sections[1].points) / (sections[0].max + sections[1].max);
      const practical = sections[2].points / sections[2].max;
      if (theory < 0.6 && practical >= 0.7) return 'Теорию завалил. Практику вывез.';
      if (theory >= 0.8 && practical < 0.5) return 'Лор знаю. За руль не пускайте.';
    }
    return score >= passScore ? 'Экзамен сдан. Ностальгия подтверждена.' : 'Есть что вспомнить. Есть что пересдать.';
  }
  function contentBounds(source) {
    const full = { x: 0, y: 0, width: source.width, height: source.height };
    try {
      const bounds = window.GTAImageContentBounds?.detect(source.image);
      if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
          bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0 ||
          bounds.x + bounds.width > source.width || bounds.y + bounds.height > source.height) return full;
      return bounds;
    } catch (_) { return full; }
  }
  function coverCrop(bounds, width, height) {
    const scale = Math.max(width / bounds.width, height / bounds.height);
    const sourceWidth = width / scale, sourceHeight = height / scale;
    return { x: bounds.x + (bounds.width - sourceWidth) / 2,
      y: bounds.y + (bounds.height - sourceHeight) / 2, width: sourceWidth, height: sourceHeight };
  }

  function draw(data) {
    data = data || {};
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Canvas 2D is not available');
    const name = clean(data.name, 'Участник', 96);
    const score = Math.max(0, Math.min(100, Math.round(finite(data.score, 0))));
    const passScore = Math.max(0, Math.min(100, Math.round(finite(data.passScore, 60))));
    const practice = data.mode === 'practice', passed = score >= passScore;
    const statusColor = practice || passed ? COLORS.blue : COLORS.red;
    const verdict = practice ? 'ТРЕНИРОВКА' : passed ? 'ЗАЧЁТ' : 'ПЕРЕСДАЧА';
    const shot = readableImage(data.highlightImage);
    const portrait = readableImage(data.avatarImage);
    const brand = readableImage(data.brandImage);
    const sections = sectionData(data);

    function text(value, x, y, font, color, align) {
      c.font = font; c.fillStyle = color || COLORS.ink;
      c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
      c.fillText(String(value), x, y);
    }
    function fit(value, x, y, maxWidth, start, min, family, color, weight, align) {
      let label = String(value), size = start;
      const font = () => (weight || 'normal') + ' ' + size + 'px ' + family;
      c.font = font();
      while (size > min && c.measureText(label).width > maxWidth) { size--; c.font = font(); }
      if (c.measureText(label).width > maxWidth) {
        const letters = Array.from(label);
        while (letters.length && c.measureText(letters.join('') + '…').width > maxWidth) letters.pop();
        label = letters.join('') + '…';
      }
      text(label, x, y, font(), color, align);
      return label;
    }
    function box(x, y, width, height, fill, stroke) {
      c.fillStyle = fill; c.fillRect(x, y, width, height);
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.strokeRect(x, y, width, height); }
    }
    function line(x1, y1, x2, y2, color, width) {
      c.strokeStyle = color; c.lineWidth = width || 2;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    }
    function ratingStar(cx, cy, filled) {
      // Geometry is stable in exported PNGs even when a device's selected font
      // lacks the Unicode star glyph.
      c.beginPath();
      for (let point = 0; point < 10; point++) {
        const radius = point % 2 ? 8 : 18, angle = -Math.PI / 2 + point * Math.PI / 5;
        const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
        if (point) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.closePath(); c.fillStyle = filled ? '#a9782e' : '#d3c9b8'; c.fill();
    }
    function avatar(cx, cy, radius) {
      c.save(); c.beginPath(); c.arc(cx, cy, radius, 0, Math.PI * 2); c.clip();
      box(cx - radius, cy - radius, radius * 2, radius * 2, COLORS.blue);
      if (portrait) {
        const side = Math.min(portrait.width, portrait.height);
        c.drawImage(portrait.image, (portrait.width - side) / 2, (portrait.height - side) / 2, side, side,
          cx - radius, cy - radius, radius * 2, radius * 2);
      } else {
        fit(initial(name), cx, cy + 21, radius * 1.5, 57, 30, 'Arial, sans-serif', COLORS.white, 'bold', 'center');
      }
      c.restore(); c.strokeStyle = COLORS.yellow; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, radius + 3, 0, Math.PI * 2); c.stroke();
    }
    function hero() {
      const h = HERO;
      c.save(); c.beginPath(); c.rect(h.x, h.y, h.width, h.height); c.clip();
      const gradient = c.createLinearGradient(h.x, h.y, h.x + h.width, h.y + h.height);
      gradient.addColorStop(0, COLORS.blueDark); gradient.addColorStop(1, '#70238a');
      box(h.x, h.y, h.width, h.height, gradient);
      if (shot) {
        // One photograph, one frame. The centered crop preserves the native
        // crosshair/explosion region without stretching or a second backdrop.
        // Legacy captures may contain actual black padding; the shared bounded
        // detector removes only verified symmetric bands, never guessed scenery.
        const crop = coverCrop(contentBounds(shot), h.width, h.height);
        c.drawImage(shot.image, crop.x, crop.y, crop.width, crop.height, h.x, h.y, h.width, h.height);
      } else {
        // This is a typographic exam cover, never a made-up gameplay screenshot.
        c.save(); c.globalAlpha = 0.06;
        for (let y = h.y + 30; y < h.y + h.height; y += 42) line(h.x, y, h.x + h.width, y, COLORS.white, 1);
        c.restore();
        fit('ЕГЭ', h.x + h.width / 2, h.y + 360, h.width - 100, 252, 200, '"Arial Black", Arial, sans-serif', COLORS.white, '900', 'center');
        box(h.x + 70, h.y + 410, h.width - 128, 108, COLORS.ink);
        box(h.x + 64, h.y + 402, h.width - 128, 108, COLORS.yellow);
        fit('ИСТОРИЯ GTA', h.x + h.width / 2, h.y + 477, h.width - 180, 69, 45, 'Arial, sans-serif', COLORS.ink, '900', 'center');
        fit('БЛАНК РЕЗУЛЬТАТОВ', h.x + h.width / 2, h.y + 575, h.width - 140, 25, 21, 'Arial, sans-serif', COLORS.white, 'bold', 'center');
      }
      c.restore();
      c.strokeStyle = COLORS.ink; c.lineWidth = 6; c.strokeRect(h.x, h.y, h.width, h.height);
      box(h.x, h.y + h.height, h.width, 52, COLORS.peach, COLORS.ink);
      const finalSalvo = shot && data.highlight?.scene === 3 && data.highlight?.kind === 'explosion';
      text(shot ? finalSalvo ? 'ПОСЛЕДНИЙ ЗАЛП' : 'КАДР ИЗ ПРАКТИКИ' : 'ЕДИНЫЙ ГАНГСТЕРСКИЙ ЭКЗАМЕН', h.x + 22, h.y + h.height + 34,
        'bold 24px Arial, sans-serif', COLORS.brown);
    }

    // Meaningful content stays between y=140 and y=1740 for story controls.
    box(0, 0, WIDTH, HEIGHT, COLORS.paper);
    box(0, 0, WIDTH, 26, COLORS.white);
    const blueAccent = c.createLinearGradient(0, 0, WIDTH, 0);
    blueAccent.addColorStop(0, COLORS.blue); blueAccent.addColorStop(1, '#6b28bc');
    box(0, 26, WIDTH, 26, blueAccent);
    const redAccent = c.createLinearGradient(0, 0, WIDTH, 0);
    redAccent.addColorStop(0, COLORS.red); redAccent.addColorStop(1, '#ff8554');
    box(0, 52, WIDTH, 26, redAccent);
    const cover = c.createLinearGradient(0, 120, WIDTH, 1760);
    cover.addColorStop(0, COLORS.blue); cover.addColorStop(.48, '#492399'); cover.addColorStop(1, COLORS.red);
    box(48, 128, 984, 1634, COLORS.ink);
    box(42, 120, 984, 1634, cover);
    c.save(); c.globalAlpha = .04;
    for (let y = 124; y < 1754; y += 6) line(42, y, 1026, y, COLORS.white, 1);
    c.restore();

    // The cover's gold subject ribbon and exact logo create one visual edition.
    const titleBand = c.createLinearGradient(72, 140, 1008, 204);
    titleBand.addColorStop(0, COLORS.paper); titleBand.addColorStop(1, COLORS.yellow);
    box(79, 148, 936, 64, COLORS.ink);
    box(72, 140, 936, 64, titleBand);
    fit('ИСТОРИЯ GTA', 540, 185, 860, 43, 36, '"Arial Black", Arial, sans-serif', COLORS.ink, '900', 'center');
    const branded = brand && window.GTAFinalBrand && window.GTAFinalBrand.draw(c, brand.image, 72, 218, 552, 320);
    if (!branded) {
      if (window.GTAClassicBrand) window.GTAClassicBrand.draw(c, 82, 257, 532, 222);
      else {
        fit('ЕГЭ', 348, 377, 500, 158, 130, '"Arial Black", Arial, sans-serif', COLORS.white, '900', 'center');
        fit('ЕДИНЫЙ ГАНГСТЕРСКИЙ ЭКЗАМЕН', 348, 435, 490, 22, 16, 'Arial, sans-serif', COLORS.white, 'bold', 'center');
      }
    }
    box(665, 226, 351, 320, COLORS.ink);
    box(657, 218, 351, 320, COLORS.paper);
    box(657, 218, 351, 64, statusColor);
    fit(verdict, 832, 261, 307, 35, 28, 'Arial, sans-serif', COLORS.white, '900', 'center');
    fit(score, 832, 464, 307, 170, 130, '"Arial Black", Arial, sans-serif', statusColor, '900', 'center');
    text('/ 100', 832, 519, 'bold 47px Arial, sans-serif', COLORS.ink, 'center');
    // A single short note gives the truthful result its own voice.
    box(72, 552, 936, 44, COLORS.paper);
    fit(resultLine(data), 540, 583, 884, 31, 27,
      'Arial, sans-serif', COLORS.ink, 'bold', 'center');
    hero();
    box(72, 1482, 936, 100, COLORS.paper);
    avatar(134, 1532, 46);
    fit(name, 212, 1548, 770, 46, 32, 'Arial, sans-serif', COLORS.ink, 'bold');

    if (sections) {
      box(72, 1602, 936, 122, COLORS.white, COLORS.ink);
      for (let i = 0; i < 3; i++) {
        if (i) line(72 + i * 312, 1602, 72 + i * 312, 1724, COLORS.line);
        fit(['A', 'B', 'C'][i] + '  ' + sections[i].points + '/' + sections[i].max,
          228 + i * 312, 1653, 284, 38, 29, '"Courier New", monospace', COLORS.blueDark, 'bold', 'center');
        const rating = window.GTAExam.sectionRating(sections[i].points, sections[i].max);
        for (let star = 0; star < 5; star++) ratingStar(148 + i * 312 + star * 40, 1691, star < rating);
      }
    }
    box(0, 1776, WIDTH, 48, COLORS.white);
    box(0, 1824, WIDTH, 48, blueAccent);
    box(0, 1872, WIDTH, 48, redAccent);
    return canvas;
  }

  window.GTAStory = Object.freeze({ draw: draw, resultLine: resultLine });
})();
