'use strict';

(function (root) {
  const $ = id => document.getElementById(id);

  function summarize(packets, elapsedMs) {
    const completed = new Map(packets.map(packet => [packet.scene, packet]));
    const spent = scene => {
      const packet = completed.get(scene);
      return packet ? packet.ammoInitial - packet.ammoRemaining : 0;
    };
    const cleared = [...completed.values()].filter(packet => packet.outcome === 'cleared').length;
    const destroyed = [...completed.values()].flatMap(packet => packet.targets)
      .filter(target => target.credited && target.destroyed).length;
    const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
    const last = packets[packets.length - 1];
    const line = cleared === 3 ? 'Разминка пройдена. Ждём GTA VI.' : ({
      ammo: 'Боезапас кончился. В следующий раз попадёшь.',
      timeout: 'Патруль свернул операцию. Вернёшься за реваншем?',
      lost: 'Выезд сорвался. Район подождёт.'
    }[last?.outcome] || 'На сегодня хватит. До встречи в городе.');
    return { line, stats: [
      ['Время в игре', Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')],
      ['Миссии', cleared + ' / 3'], ['Патроны Узи', String(spent(1))],
      ['Ракеты', String(spent(3))], ['Цели уничтожены', String(destroyed)]
    ] };
  }

  function loadImage(url, anonymous = false) {
    return new Promise(resolve => {
      if (!url) return resolve(null);
      const img = new Image();
      if (anonymous) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function makeCard(report, highlight, player, avatar) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 1080, 1920);
    bg.addColorStop(0, '#352649');
    bg.addColorStop(0.6, '#160f24');
    bg.addColorStop(1, '#25172d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1920);
    function label(text, x, y, font, color, maxWidth = 936) {
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.fillText(text, x, y, maxWidth);
    }
    label('OCEAN DRIVE  /  VICE CITY', 72, 108, '700 34px Arial', '#ffab85');
    label('Подготовка', 66, 226, '900 104px Arial', '#fff3df');
    label('к GTA VI', 66, 334, '900 112px Arial', '#ff999b');
    const picture = await loadImage(highlight?.dataUrl);
    let y = 476;
    if (picture && picture.naturalWidth && picture.naturalHeight) {
      const w = 936;
      const h = Math.min(760, w * picture.naturalHeight / picture.naturalWidth);
      const cropH = picture.naturalWidth * h / w;
      ctx.drawImage(picture, 0, (picture.naturalHeight - cropH) / 2, picture.naturalWidth, cropH, 72, 404, w, h);
      y = 404 + h + 88;
    }
    label('Сводка выезда', 72, y, '800 65px Arial', '#fff3df');
    y += 84;
    for (const [name, value] of report.stats) {
      label(name, 72, y, '500 35px Arial', '#dfcfdc');
      ctx.textAlign = 'right';
      label(value, 1008, y, '700 47px Arial', '#fff3df');
      ctx.textAlign = 'left';
      ctx.fillStyle = '#655165';
      ctx.fillRect(72, y + 20, 936, 1);
      y += 76;
    }
    label(report.line, 72, 1768, '700 43px Arial', '#ffb495');
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(100, 1840, 28, 0, Math.PI * 2);
      ctx.clip();
      const edge = Math.min(avatar.naturalWidth, avatar.naturalHeight);
      ctx.drawImage(avatar, (avatar.naturalWidth - edge) / 2, (avatar.naturalHeight - edge) / 2, edge, edge, 72, 1812, 56, 56);
      ctx.restore();
    }
    if (player) label(player, avatar ? 144 : 72, 1850, '500 32px Arial', '#ebdfe5');
    return new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('PNG')), 'image/png'));
  }

  function show(packets, elapsedMs, highlight) {
    const report = summarize(packets, elapsedMs);
    const user = root.Telegram?.WebApp?.initDataUnsafe?.user;
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || '';
    $('ride-line').textContent = report.line;
    $('ride-player').textContent = name;
    $('ride-player').hidden = !name;
    let avatar = null;
    if (name && /^https:\/\//i.test(user?.photo_url || '')) {
      loadImage(user.photo_url, true).then(image => {
        if (!image) return;
        avatar = image;
        image.width = image.height = 28;
        image.alt = '';
        $('ride-player').prepend(image);
        if (blob) prepare();
      });
    }
    const frame = $('ride-frame');
    frame.hidden = !highlight?.dataUrl;
    if (!frame.hidden) frame.src = highlight.dataUrl;
    const dl = $('ride-stats');
    dl.replaceChildren();
    for (const [key, value] of report.stats) {
      const row = document.createElement('div');
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = key;
      dd.textContent = value;
      row.append(dt, dd);
      dl.append(row);
    }
    const save = $('save-card'), share = $('share-card'), status = $('export-status');
    let blob = null;
    function download() {
      if (!blob) return;
      const link = document.createElement('a'), url = URL.createObjectURL(blob);
      link.href = url;
      link.download = 'vice-city-ride.png';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = 'Карточка PNG готова к сохранению.';
    }
    async function prepare() {
      save.disabled = share.disabled = true;
      try {
        blob = await makeCard(report, highlight, name, avatar);
        save.textContent = 'Сохранить';
        save.onclick = download;
        status.textContent = '';
      } catch (_) {
        status.textContent = 'Картинка не собралась. Сводка доступна здесь.';
        save.textContent = 'Повторить экспорт';
        save.onclick = prepare;
      } finally { save.disabled = share.disabled = false; }
    }
    share.onclick = async () => {
      const file = blob && new File([blob], 'vice-city-ride.png', { type: 'image/png' });
      const summary = report.line + '\n' + report.stats.map(pair => pair.join(' — ')).join('\n');
      try {
        if (file && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Подготовка к GTA VI' });
        } else if (navigator.share) {
          await navigator.share({ title: 'Подготовка к GTA VI', text: summary });
        } else {
          await navigator.clipboard.writeText(summary);
          status.textContent = 'Текст сводки скопирован. Кадр можно сохранить отдельно.';
        }
      } catch (error) {
        if (error.name !== 'AbortError') status.textContent = 'Отправка недоступна. Сохрани карточку и выбери чат вручную.';
      }
    };
    prepare();
  }
  if (typeof module === 'object' && module.exports) module.exports = { summarize, makeCard };
  else root.RideReport = { show };
})(globalThis);
