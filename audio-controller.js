'use strict';

(function () {
  // Keep the existing preference: an earlier "music off" also means quiet radio questions.
  const PREF_KEY = 'gta-ege-music-v1';
  let enabled = true, context = 'home', started = false, appActive = true;
  let background = null, backgroundPending = false, blocked = false, foreground = null;
  let notice = function () {};
  try { enabled = localStorage.getItem(PREF_KEY) !== 'off'; } catch (_) {}

  function clock(seconds) { const n = Math.max(0, Math.floor(seconds || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }
  function persist() { try { localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off'); } catch (_) {} }
  function musicIcon(on) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/>' + (on ? '<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>' : '<path d="m16 9 6 6m0-6-6 6"/>') + '</svg>'; }
  function clipActive() { return !!(foreground && (foreground.playIntent || (!foreground.audio.paused && !foreground.audio.ended))); }
  function musicAllowed() { return started && enabled && !blocked && appActive && !document.hidden && ['intro', 'question', 'checkpoint', 'grading', 'native-exam'].includes(context) && !clipActive(); }
  function musicState() { return !enabled ? 'off' : clipActive() ? 'fragment' : blocked ? 'blocked' : background && !background.paused ? 'playing' : 'ready'; }
  function syncButtons() {
    const state = musicState();
    document.querySelectorAll('[data-action="music-toggle"]').forEach(button => {
      button.classList.toggle('is-muted', !enabled); button.dataset.musicState = state;
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', enabled ? 'Выключить весь звук' : 'Включить звук');
      button.title = enabled ? 'Фоновая музыка и аудиозадания. Выключить звук' : 'Включить звук';
      const label = button.querySelector('.music-label'); if (label) label.textContent = enabled ? 'Звук вкл' : 'Звук выкл';
      const icon = button.querySelector('.music-icon'); if (icon) icon.innerHTML = musicIcon(enabled);
    });
  }
  function ensureBackground() {
    if (background) return background;
    background = document.createElement('audio'); background.id = 'exam-background-music';
    background.src = 'assets/audio/exam-theme.mp3'; background.preload = 'none'; background.loop = true;
    background.volume = 1; background.hidden = true; background.setAttribute('playsinline', '');
    document.body.appendChild(background);
    background.addEventListener('play', function () { if (!musicAllowed()) background.pause(); syncButtons(); });
    background.addEventListener('pause', syncButtons);
    background.addEventListener('error', function () { blocked = true; backgroundPending = false; syncButtons(); notice('Фон не загрузился. Экзамен можно продолжить, а звук включить позже.'); });
    return background;
  }
  function syncMusic() {
    if (!musicAllowed()) { if (background && !background.paused) background.pause(); syncButtons(); return; }
    const track = ensureBackground();
    if (track.paused && !backgroundPending) {
      backgroundPending = true;
      let result;
      try { result = track.play(); } catch (error) { backgroundPending = false; blocked = true; syncButtons(); return; }
      Promise.resolve(result).then(function () { backgroundPending = false; syncMusic(); }).catch(function (error) {
        backgroundPending = false;
        if (error.name !== 'AbortError') blocked = true;
        syncMusic();
      });
    }
    syncButtons();
  }
  function clearLimit(item) { if (item && item.limitTimer) { clearTimeout(item.limitTimer); item.limitTimer = null; } }
  function scheduleLimit(item) {
    clearLimit(item);
    if (foreground !== item || item.audio.paused || !item.playIntent) return;
    const remaining = item.duration() - item.audio.currentTime;
    if (remaining <= 0) return item.finish();
    item.limitTimer = setTimeout(function () {
      if (foreground !== item || item.audio.paused) return;
      if (item.audio.currentTime >= item.duration() - 0.03) item.finish();
      else scheduleLimit(item);
    }, remaining * 1000 / (item.audio.playbackRate || 1));
  }
  function pauseClip() {
    const item = foreground; if (!item) return;
    item.playIntent = false; item.resumeOnUnmute = false; item.playToken++;
    clearLimit(item); item.audio.pause(); item.refresh(); item.update(); syncMusic();
  }
  function toggleMusic() {
    enabled = !enabled; persist();
    const item = foreground;
    if (!enabled) {
      const resume = item && (clipActive() || item.resumeOnUnmute);
      pauseClip();
      if (item) { item.resumeOnUnmute = !!resume; item.refresh(); }
    } else {
      blocked = false;
      if (background && background.error) background.load();
      if (item && item.resumeOnUnmute && context === 'question') requestClip(item, false, false);
      else syncMusic();
      if (item) item.refresh();
    }
    syncMusic();
  }
  function start(restart) {
    started = true; blocked = false;
    if (restart && background) { try { background.currentTime = 0; } catch (_) {} }
    syncMusic();
  }
  function setContext(value) { context = value; if (value !== 'question' && foreground) pauseClip(); syncMusic(); }
  function setAppActive(value) { appActive = !!value; if (!appActive) pauseClip(); syncMusic(); }
  function releaseClip() {
    const previous = foreground; foreground = null;
    if (previous) {
      previous.playIntent = false; previous.playToken++; clearLimit(previous);
      previous.abort.abort(); previous.audio.pause(); previous.audio.removeAttribute('src'); previous.audio.load();
    }
    syncMusic();
  }
  function requestClip(item, restart, manual) {
    if (foreground !== item || !item.audio.isConnected) return;
    if (manual) { enabled = true; blocked = false; persist(); }
    if (!enabled || !appActive || document.hidden) { item.refresh(); syncMusic(); return; }
    const audio = item.audio;
    if (audio.error) audio.load();
    if (restart || audio.ended || item.finished || audio.currentTime >= item.duration()) { try { audio.currentTime = 0; } catch (_) {} }
    item.finished = false; item.autoplayBlocked = false; item.failed = false;
    item.resumeOnUnmute = false; item.playIntent = true;
    const token = ++item.playToken;
    // Suppress background audio synchronously, before foreground play().
    syncMusic(); item.refresh();
    function rejected(error) {
      if (foreground !== item || token !== item.playToken) return;
      item.playIntent = false; clearLimit(item);
      if (error.name !== 'AbortError') item.autoplayBlocked = true;
      item.refresh(); item.update(); syncMusic();
    }
    let result;
    try { result = audio.play(); } catch (error) { rejected(error); return; }
    Promise.resolve(result).then(function () {
      if (foreground !== item) { audio.pause(); return; }
      if (token !== item.playToken) return;
      if (!enabled || !appActive || document.hidden || !item.playIntent) { audio.pause(); return; }
      scheduleLimit(item); item.update();
    }).catch(rejected);
  }
  function mountClip(question, onReady, onWaiting, options) {
    const audio = document.getElementById('exam-audio'), box = document.querySelector('.audio-exhibit');
    if (!audio || !box) return;
    if (foreground && foreground.audio === audio) {
      foreground.onReady = onReady; foreground.onWaiting = onWaiting;
      if (foreground.ready) onReady();
      return;
    }
    if (foreground) releaseClip();
    options = options || {};
    const abort = new AbortController();
    const item = foreground = { audio: audio, box: box, abort: abort, ready: false, playIntent: false, byMemory: false, failed: false, finished: false, autoplayBlocked: false, resumeOnUnmute: false, playToken: 0, limitTimer: null, onReady: onReady, onWaiting: onWaiting };
    const status = box.querySelector('.audio-status'), seek = box.querySelector('.audio-seek');
    const toggle = box.querySelector('.audio-toggle'), icon = box.querySelector('.audio-toggle-icon');
    function alive() { return foreground === item && audio.isConnected; }
    function duration() {
      const declared = Number(question.audioDuration), actual = Number(audio.duration);
      const limit = Number.isFinite(declared) && declared > 0 ? declared : 20;
      return Number.isFinite(actual) && actual > 0 ? Math.min(actual, limit) : limit;
    }
    function refresh() {
      if (!alive() || !status) return;
      if (item.byMemory) status.textContent = 'Можно ответить по памяти. Баллы начисляются по тем же правилам.';
      else if (item.failed) status.innerHTML = 'Фрагмент не загрузился. <button class="ghost" data-action="audio-retry">Повторить</button> <button class="ghost" data-action="audio-memory">Отвечу по памяти</button>';
      else if (!enabled) status.innerHTML = 'Звук выключен. <button class="ghost" data-action="audio-toggle">Включить и слушать</button> <button class="ghost" data-action="audio-memory">Отвечу по памяти</button>';
      else if (item.autoplayBlocked) status.innerHTML = 'Нажмите, чтобы включить фрагмент. <button class="ghost" data-action="audio-toggle">Слушать отрывок</button> <button class="ghost" data-action="audio-memory">Отвечу по памяти</button>';
      else if (item.finished) status.textContent = 'Отрывок окончен.';
      else if (!item.ready) status.innerHTML = 'Загружаем фрагмент… Время ответа на паузе. <button class="ghost" data-action="audio-memory">Отвечу по памяти</button>';
      else status.textContent = '';
    }
    function update() {
      if (!alive()) return;
      const limit = duration(), current = Math.min(Math.max(0, audio.currentTime || 0), limit);
      const playing = !audio.paused && !audio.ended;
      box.classList.toggle('is-playing', playing);
      if (toggle) { toggle.setAttribute('aria-pressed', String(playing)); toggle.setAttribute('aria-label', playing ? 'Пауза отрывка' : item.finished || audio.ended ? 'Послушать отрывок ещё раз' : 'Слушать отрывок'); }
      if (icon) icon.textContent = playing ? 'Ⅱ' : '▶';
      if (seek) { seek.max = limit; seek.value = current; seek.setAttribute('aria-valuetext', clock(current) + ' из ' + clock(Math.round(limit))); }
      const currentLabel = box.querySelector('[data-audio-current]'); if (currentLabel) currentLabel.textContent = clock(current);
      const totalLabel = box.querySelector('[data-audio-duration]') || box.querySelector('[data-audio-total]') || box.querySelector('.audio-time > span:last-child'); if (totalLabel) totalLabel.textContent = clock(Math.round(limit));
      const progress = box.querySelector('.audio-wave-progress'); if (progress) progress.style.width = Math.min(100, current / limit * 100) + '%';
    }
    function ready() {
      if (!alive()) return;
      const changed = !item.ready;
      item.ready = true; item.failed = false; if (seek) seek.disabled = false; box.classList.remove('is-loading');
      if (changed) item.onReady();
      refresh(); update();
    }
    function waiting() {
      if (!alive() || item.byMemory) return;
      clearLimit(item); item.ready = false; box.classList.add('is-loading'); refresh(); item.onWaiting();
    }
    function fail() {
      if (!alive()) return;
      item.playIntent = false; item.failed = true; item.ready = item.byMemory; item.playToken++;
      clearLimit(item); audio.pause(); box.classList.remove('is-loading', 'is-playing');
      if (!item.byMemory) item.onWaiting();
      refresh(); update(); syncMusic();
    }
    function finish() {
      if (!alive() || item.finished) return;
      item.finished = true; item.playIntent = false; item.resumeOnUnmute = false; item.playToken++;
      clearLimit(item); audio.pause(); refresh(); update(); syncMusic();
    }
    item.duration = duration; item.finish = finish; item.refresh = refresh; item.update = update;
    function listen(event, handler) { audio.addEventListener(event, handler, { signal: abort.signal }); }
    listen('loadedmetadata', function () { refresh(); update(); }); listen('loadeddata', ready); listen('canplay', ready);
    listen('waiting', waiting); listen('stalled', function () { if (item.playIntent && audio.readyState < 2) waiting(); });
    listen('error', fail);
    listen('timeupdate', function () { if (audio.currentTime >= duration()) finish(); else update(); });
    listen('seeked', function () { if (audio.currentTime >= duration()) finish(); else { update(); scheduleLimit(item); } });
    listen('ratechange', function () { scheduleLimit(item); });
    listen('play', function () {
      if (!alive() || !enabled || !appActive || document.hidden || !item.playIntent) { audio.pause(); return; }
      syncMusic(); update();
    });
    listen('playing', function () {
      if (!alive()) return;
      if (!enabled || !appActive || document.hidden || !item.playIntent) { pauseClip(); return; }
      ready(); scheduleLimit(item);
    });
    listen('pause', function () { if (!audio.paused) return; item.playIntent = false; clearLimit(item); refresh(); update(); syncMusic(); });
    listen('ended', function () { if (audio.ended || audio.currentTime >= duration()) finish(); });
    if (seek) seek.addEventListener('input', function () {
      if (!Number.isFinite(audio.duration)) return;
      const next = Math.max(0, Math.min(Number(seek.value) || 0, duration()));
      if (next < duration()) item.finished = false;
      audio.currentTime = next; refresh(); update(); scheduleLimit(item);
    }, { signal: abort.signal });
    update(); if (audio.readyState >= 2) ready(); else waiting();
    // This request stays in the user's question transition, never in loadeddata.
    if (options.autoplay) {
      if (enabled) requestClip(item, false, false);
      else { item.resumeOnUnmute = true; refresh(); }
    }
    syncButtons();
  }
  function playClip(restart) {
    const item = foreground; if (!item) return;
    if (!restart && !item.audio.paused && !item.audio.ended) { pauseClip(); return; }
    requestClip(item, !!restart, true);
  }
  function answerFromMemory() {
    const item = foreground; if (!item) return;
    pauseClip(); item.byMemory = true; item.ready = true; item.box.classList.remove('is-loading');
    item.onReady(); item.refresh(); item.update();
  }
  function buttonHTML() {
    return '<button class="music-button' + (enabled ? '' : ' is-muted') + '" data-action="music-toggle" aria-label="' + (enabled ? 'Выключить весь звук' : 'Включить звук') + '" aria-pressed="' + enabled + '"><span class="music-icon" aria-hidden="true">' + musicIcon(enabled) + '</span><span class="music-label">' + (enabled ? 'Звук вкл' : 'Звук выкл') + '</span></button>';
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseClip(); syncMusic(); });
  window.addEventListener('pagehide', function () { appActive = false; pauseClip(); syncMusic(); });
  window.addEventListener('pageshow', function () { appActive = true; syncMusic(); });
  window.GTAExamAudio = { configure: function (options) { notice = options.notice || notice; }, isEnabled: function () { return enabled; }, isBuffering: function () { return !!(musicAllowed() && background && !background.error && (backgroundPending || background.readyState < 3)); }, start: start, setContext: setContext, setAppActive: setAppActive, buttonHTML: buttonHTML, toggleMusic: toggleMusic, releaseClip: releaseClip, mountClip: mountClip, playClip: playClip, pauseClip: pauseClip, answerFromMemory: answerFromMemory };
})();
