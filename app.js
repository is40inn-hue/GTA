'use strict';

/* GTA EGE 0.5.1: an opt-out, silent-by-default 2.5D exam-room cinematic.
   Pure presentation: no ticket, scoring, practice or storage writes. */
(function (global) {
  'use strict';
  let current = null;
  function cancel() {
    if (!current) return;
    current.cancelled = true;
    if (current.frame) global.cancelAnimationFrame?.(current.frame);
    current = null;
  }
  function markup() {
    return `<main class="exam-cinema" data-exam-cinema data-shot="1" aria-label="Начало экзамена: катсцена">
      <div class="cinema-viewport" aria-hidden="true">
        <img class="cinema-room" src="assets/cinema/exam-room.svg" width="900" height="680" alt="" decoding="async" fetchpriority="high">
        <div class="cinema-tint"></div>
        <div class="cinema-ticket"><div class="cinema-ticket-hdr"><span>ЕГЭ · 2026</span><span>ФОРМА № 006</span></div><div class="cinema-ticket-seal">ДОПУЩЕН</div><p>Единый гангстерский экзамен</p><strong><span>ЭКЗАМЕНАЦИОННЫЙ</span><span>БИЛЕТ</span></strong><div class="cinema-ticket-line"></div><span class="cinema-ticket-part">ЧАСТЬ А</span><h2>Города и герои</h2><span class="cinema-ticket-foot">Ответы и оценки — после комиссии</span></div>
      </div>
      <div class="cinema-grain" aria-hidden="true"></div>
      <div class="cinema-wipe" aria-hidden="true"></div>
      <div class="cinema-ui">
        <div class="cinema-top"><span class="cinema-location"><span class="cinema-live-dot"></span> ЭКЗАМЕНАЦИОННЫЙ ПУНКТ №006</span><button class="cinema-skip" type="button" data-action="cinema-skip" aria-label="Пропустить катсцену и начать часть A">Пропустить <span aria-hidden="true">↗</span></button></div>
        <div class="cinema-dialogue" aria-live="off">
          <section class="cinema-beat cinema-beat-1"><span class="cinema-cue">VICE COUNTY · 2026</span><h1>Сегодня ты сдаёшь<br>не совсем обычный ЕГЭ.</h1><p>Комиссия проверит твою готовность к GTA VI.</p></section>
          <section class="cinema-beat cinema-beat-2"><span class="cinema-cue">ЭКЗАМЕНАТОР</span><h1>Телефоны и чит-коды<br>запрещены.</h1><p>Оружие получите на практической части.</p></section>
          <section class="cinema-beat cinema-beat-3"><span class="cinema-cue">БИЛЕТ №006</span><h1>Часть A.<br>Города и герои.</h1><p>Проверка базовой гангстерской грамотности.</p></section>
        </div>
        <div class="cinema-bottom"><span>ЕГЭ · ДОПУСК В GTA VI</span><span class="cinema-progress"><i></i></span><span>01 / 03</span></div>
      </div>
    </main>`;
  }
  function mount(host, onComplete) {
    cancel();
    const view = host && host.querySelector('[data-exam-cinema]');
    if (!view || typeof view.style?.setProperty !== 'function' || typeof onComplete !== 'function' || typeof global.requestAnimationFrame !== 'function') return false;
    const reduced = !!global.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const beats = reduced ? [350, 780, 1400, 1600] : [2700, 7350, 11000, 12000];
    const session = { cancelled: false, elapsed: 0, last: 0, frame: 0, done: false };
    current = session;
    function finish() {
      if (session.done || session.cancelled || current !== session) return;
      session.done = true;
      cancel();
      onComplete();
    }
    function step(now) {
      if (session.cancelled || current !== session) return;
      if (!global.document.hidden && session.last) session.elapsed += Math.min(100, Math.max(0, now - session.last));
      session.last = now;
      const shot = session.elapsed < beats[0] ? 1 : session.elapsed < beats[1] ? 2 : session.elapsed < beats[2] ? 3 : 4;
      if (view.dataset.shot !== String(shot)) view.dataset.shot = String(shot);
      view.style.setProperty('--cinema-progress', Math.min(100, session.elapsed / beats[3] * 100).toFixed(1) + '%');
      if (session.elapsed >= beats[3]) return finish();
      session.frame = global.requestAnimationFrame(step);
    }
    session.frame = global.requestAnimationFrame(step);
    return true;
  }
  global.GTAExamCinema = Object.freeze({ markup, mount, cancel });
})(window);

(function () {
  const Boot = window.GTAExamBoot;
  if (!Boot) {
    const container = document.getElementById('app');
    if (container) container.innerHTML = '<main class="empty-state"><h1>Открой экзамен заново</h1><p>Страница и файлы экзамена обновились. Нажми «Повторить», чтобы загрузить одну версию.</p><button class="primary" type="button" onclick="location.reload()">Повторить</button></main>';
    return;
  }
  if (!Boot.requireModules([
    { name: 'GTAExam', label: 'модуль вопросов' }, { name: 'GTAExamAudio', label: 'звуковой модуль' },
    { name: 'GTAExamContent', label: 'материалы экзамена' }, { name: 'GTAExamRadioQuestions', label: 'музыкальные вопросы' },
    { name: 'GTAExamPracticalQuestions', label: 'практические задания' }, { name: 'GTAExamRC2Questions', label: 'банк вопросов' },
    { name: 'GTAExamRC3Questions', label: 'актуальный вариант' }
  ])) return;
  const E = window.GTAExam, A = window.GTAExamAudio, P = window.GTAPracticeFlow;
  const nativeAdvance = P?.createCountdown();
  const CONFIG = window.GTAExamConfig || {};
  const SESSION_KEY = 'gta-ege-session-v' + E.VERSION, PROFILE_KEY = 'gta-ege-profile-v' + E.VERSION;
  const VERSION = E.VERSION, COUNT = E.QUESTION_COUNT, PASS = E.PASS_SCORE, sections = E.sections;
  const root = document.getElementById('app'), dialog = document.getElementById('dialog'), toastElement = document.getElementById('toast');
  let bank = [], byId = {}, attempt = null, draft = null, screen = 'home', homeMode = 'exam', profile = {}, tg = null;
  let caseStep = 0, readyQuestionId = null, lastTick = performance.now(), toastTimer, commissionRun = 0;
  let imageLoadTimer = null, imageLoadRun = 0;
  let telegramUser = { name: '', photoUrl: '' }, avatarImage = null, storyCache = null, storyPromise = null, storyKey = '', storyGeneration = 0, resultImageRequest = 0, ignoreLaunchVariant = false;
  let rpgScene = null, rpgOwner = null, rpgQuestionId = null, appActive = true;
  let nativeScene = null, nativeOwner = null, nativeHost = null, nativeObserver = null, nativeVisible = false;
  let nativeCallbacks = null, preloadContext = '';
  let entryReady = false, entryWarmOwner = null, warmContextOwner = null;
  let acceptedTapUntil = 0;
  let storageConflict = false, storageConflictTimer = null;
  const nativeWarm = window.GTANativeWarmup?.create({ prepare: prepareNativeWarm, discard: discardWarmNative });
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const shuffled = E.shuffled, rank = E.rank;
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function seed() { return Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(36)).join('').slice(0, 10); }
  function toast(message) { clearTimeout(toastTimer); toastElement.textContent = message; toastElement.className = 'toast show'; toastTimer = setTimeout(() => { toastElement.className = 'toast'; }, 3200); }
  function haptic(type) { try { if (tg && tg.isVersionAtLeast('6.1')) tg.HapticFeedback.impactOccurred(type || 'light'); } catch (_) {} }
  function recoverStorageConflict() {
    if (storageConflictTimer !== null) return;
    // Never replace the active attempt inside a native callback or a render.
    // A reload explicitly adopts the other tab's already persisted attempt.
    storageConflictTimer = setTimeout(() => {
      storageConflictTimer = null;
      if (!storageConflict) return;
      modal('<h2>Попытка обновилась в другой вкладке</h2><p>Последние ответы сохранены. Открой актуальную попытку, чтобы продолжить.</p><div class="modal-actions"><button class="primary" data-action="reload">Открыть актуальную попытку</button><button class="secondary" data-action="force-start">Начать заново</button></div>');
    }, 0);
  }
  function save(replaceAttempt) {
    if (!attempt) return false;
    if (replaceAttempt === true) {
      storageConflict = false; clearTimeout(storageConflictTimer); storageConflictTimer = null;
    } else {
      if (storageConflict) return false;
      const stored = read(SESSION_KEY);
      if (stored && stored.version === VERSION && Array.isArray(stored.questionIds) && stored.questionIds.every(id => byId[id]) && stored.answers && typeof stored.answers === 'object') {
        const same = stored.startedAt === attempt.startedAt && stored.variant === attempt.variant && JSON.stringify(stored.questionIds) === JSON.stringify(attempt.questionIds);
        const sealedAnswerChanged = same && Object.keys(stored.answers).some(id => JSON.stringify(stored.answers[id]) !== JSON.stringify(attempt.answers[id]));
        const finishedRegressed = same && stored.finishedAt && (!attempt.finishedAt || stored.phase === 'result' && attempt.phase !== 'result');
        if (!same || sealedAnswerChanged || finishedRegressed) {
          storageConflict = true; readyQuestionId = null; nativeAdvance?.cancel();
          nativeScene?.setPaused(true); rpgScene?.setPaused(true);
          recoverStorageConflict();
          return false;
        }
        // A late avatar/visibility save must not discard the better C frame.
        if (same && validHighlight(stored.nativeHighlight) && (!validHighlight(attempt.nativeHighlight) || Number(stored.nativeHighlight.priority || 0) > Number(attempt.nativeHighlight.priority || 0))) attempt.nativeHighlight = clone(stored.nativeHighlight);
      }
    }
    if (write(SESSION_KEY, attempt)) return true;
    // Keep scores even if the optional screenshot exceeds local storage quota.
    const { nativeHighlight, ...smallAttempt } = attempt;
    return write(SESSION_KEY, smallAttempt);
  }
  function validHighlight(value) {
    if (!value || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl || '') || value.dataUrl.length > 480000) return false;
    return [1, 2, 3].includes(value.scene) && ['explosion', 'gameplay'].includes(value.kind) &&
      Number.isInteger(value.width) && Number.isInteger(value.height) && value.width > 0 && value.height > 0 &&
      value.width <= 960 && value.height <= 960 && Number.isFinite(value.capturedAt);
  }
  function rememberHighlight(value, owner) {
    if (owner !== attempt || !validHighlight(value)) return;
    const previous = owner.nativeHighlight;
    if (previous?.dataUrl === value.dataUrl || previous && Number(previous.priority || 0) > Number(value.priority || 0)) return;
    owner.nativeHighlight = { dataUrl: value.dataUrl, width: value.width, height: value.height, scene: value.scene,
      kind: value.kind, target: value.target, priority: Number(value.priority || 0), capturedAt: value.capturedAt, sequence: value.sequence };
    save();
    if (screen === 'result') showResultImage();
  }
  function progress() { return attempt ? attempt.questionIds.filter(id => attempt.answers[id]).length : 0; }
  function totalScore() { return attempt ? Math.min(100, attempt.questionIds.reduce((sum, id) => sum + (attempt.answers[id] ? attempt.answers[id].points : 0), 0)) : 0; }
  function activeQuestion() { return byId[attempt.questionIds[attempt.index]]; }
  function isReady(q) { return E.ready(q, draft); }
  function correctLabel(q) { return E.answerLabel(q, null, true); }
  function answerLabel(q, value) { return E.answerLabel(q, value, false); }
  function formatTime(seconds) { const n = Math.max(0, Math.floor(seconds || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }
  function wordForm(n, forms) { const tail = n % 100, digit = n % 10; return forms[tail >= 11 && tail <= 14 ? 2 : digit === 1 ? 0 : digit >= 2 && digit <= 4 ? 1 : 2]; }
  function tasksLabel(n) { return n + ' ' + wordForm(n, ['задание', 'задания', 'заданий']); }
  function isTelegram() { return !!(tg && tg.initData); }
  function hasVersion(version) { try { return isTelegram() && tg.isVersionAtLeast(version); } catch (_) { return false; } }
  function safeHttps(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; } }
  function displayName() { return telegramUser.name || profile.nickname || 'Участник'; }
  function cells(value, label) { return '<span class="code-cells" role="img" aria-label="' + escape(label || value) + '">' + Array.from(String(value)).map(c => '<span aria-hidden="true">' + escape(c) + '</span>').join('') + '</span>'; }
  function barcode() { return '<span class="barcode" aria-hidden="true"></span>'; }
  function avatarHTML(name) {
    const photo = name === telegramUser.name ? telegramUser.photoUrl : '';
    return '<span class="candidate-avatar">' + (photo ? '<img data-avatar="true" src="' + escape(photo) + '" alt="" referrerpolicy="no-referrer">' : '<span class="candidate-initial" aria-hidden="true">' + escape(Array.from(name || 'У')[0]) + '</span>') + '</span>';
  }
  function candidateHTML(name, compact) {
    return '<div class="' + (compact ? 'header-user' : 'candidate-card') + '">' + avatarHTML(name) + '<span class="candidate-name"><strong>' + escape(name) + '</strong>' + (compact ? '' : '<small class="candidate-source">' + (telegramUser.name ? 'Участник из Telegram' : 'Гостевой участник') + '</small>') + '</span></div>';
  }

  function header() {
    const compact = screen !== 'home';
    return '<header class="topbar' + (compact ? ' is-compact' : '') + '"><button class="brand" data-action="home" aria-label="На главную"><span class="brand-mark">ЕГЭ</span><span class="brand-copy"><strong>ИСТОРИЯ GTA</strong></span></button><div class="top-actions">' + A.buttonHTML() + (hasVersion('8.0') ? '<button class="fullscreen-button" data-action="fullscreen" aria-label="На весь экран" ' + (tg.isFullscreen ? 'hidden' : '') + '>↗</button>' : '') + '<button class="icon-button" data-action="rules" aria-label="Правила экзамена">?</button></div></header>';
  }
  function footer() {
    return screen === 'home' ? '<footer class="footer"><span>Фанатский экзамен · © Rockstar Games</span><button class="ghost" data-action="about">О проекте</button></footer>' : '';
  }
  function releaseRpg() {
    if (!rpgScene) return;
    if (rpgOwner) { rpgOwner.rpgStates = rpgOwner.rpgStates || {}; rpgOwner.rpgStates[rpgQuestionId] = rpgScene.getState(); if (rpgOwner === attempt) save(); }
    rpgScene.destroy(); rpgScene = null; rpgOwner = null; rpgQuestionId = null;
  }
  function releaseNative() {
    window.GTAGameGestures?.setActive(false);
    if (nativeOwner === attempt) rememberHighlight(nativeScene?.getHighlight?.(), nativeOwner);
    nativeWarm?.reset(); warmContextOwner = null;
    nativeAdvance?.cancel();
    nativeObserver?.disconnect(); nativeObserver = null;
    nativeScene?.destroy(); nativeScene = null; nativeOwner = null; nativeCallbacks = null;
    nativeHost?.remove(); nativeHost = null; nativeVisible = false;
  }
  function discardWarmNative(port) {
    port?.destroy();
    if (nativeScene !== port) return;
    nativeObserver?.disconnect(); nativeObserver = null;
    nativeScene = null; nativeOwner = null; nativeCallbacks = null;
    nativeHost?.remove(); nativeHost = null; nativeVisible = false;
  }
  function warmPlan() {
    if (!bank.length || !['home', 'question', 'checkpoint', 'intro'].includes(screen)) return null;
    if (attempt) {
      if (attemptEdition() < 14 || attempt.finishedAt || attempt.phase === 'grading') return null;
      // Opening an old result or a saved C scene must not launch a new city in
      // the background. A/B resume uses its existing attempt owner directly.
      if (screen === 'home' && !['theory', 'field'].includes(activeQuestion()?.section)) return null;
      const question = attempt.questionIds.map(id => byId[id]).find(q => q.type === 'vice' && !attempt.answers[q.id]);
      return question ? { owner: attempt, edition: attemptEdition(), question } : null;
    }
    if (screen !== 'home') return null;
    const launch = launchReference(), edition = launch ? launch.edition : E.CONTENT_EDITION;
    if (launch?.error || edition < 14) return null;
    if (!entryWarmOwner || entryWarmOwner.contentEdition !== edition) entryWarmOwner = { contentEdition: edition };
    // This lease is deliberately not an attempt: no variant, scores, clock or
    // localStorage entry exists until the participant presses Start.
    const question = E.buildTicket('entrywarm', edition).map(id => byId[id]).find(q => q?.type === 'vice');
    return question ? { owner: entryWarmOwner, edition, question } : null;
  }
  function preserveWarm() {
    const plan = warmPlan();
    return !!plan && (screen === 'home' || ['theory', 'field'].includes(activeQuestion()?.section)) &&
      (!nativeOwner || nativeOwner === plan.owner) && (!nativeScene || nativeScene.isWarmup?.());
  }
  function prepareNativeWarm(events) {
    const plan = warmPlan();
    if (!plan || plan.owner !== events.owner || !preserveWarm() || !window.GTAVicePort) return null;
    nativeHost = document.createElement('div'); nativeHost.id = 'native-exam-persistent'; nativeHost.className = 'native-persistent-host';
    document.body.appendChild(nativeHost); nativeOwner = events.owner; nativeVisible = false;
    positionNative();
    try {
      nativeScene = window.GTAVicePort.mount(nativeHost, {
        scene: plan.question.nativeScene, examMode: true, edition: plan.edition, continuous: true, warmup: true, muted: true, paused: false,
        onState: value => { events.onState(value); if (nativeVisible) nativeCallbacks?.onState(value); },
        onWarmReady: events.onWarmReady,
        onHighlight: value => { if (nativeVisible) nativeCallbacks?.onHighlight(value); },
        onComplete: value => { if (nativeVisible) nativeCallbacks?.onComplete(value); },
        onReady: () => { if (nativeVisible) nativeCallbacks?.onReady(); },
        onError: message => { if (nativeVisible) nativeCallbacks?.onError(message); else events.onError(message); }
      });
      return nativeScene;
    } catch (error) {
      nativeHost?.remove(); nativeHost = null; nativeOwner = null; throw error;
    }
  }
  function positionNative() {
    const anchor = document.getElementById('native-exam-anchor');
    if (!nativeHost) return;
    const warming = !nativeVisible && !!nativeOwner && (nativeScene?.isWarmup?.() || preserveWarm());
    nativeHost.hidden = !warming && (!nativeVisible || !anchor);
    nativeHost.inert = warming;
    nativeHost.setAttribute('aria-hidden', warming ? 'true' : 'false');
    if (warming) {
      Object.assign(nativeHost.style, { left: '0px', top: '0px', width: Math.max(320, window.innerWidth || 390) + 'px', height: Math.max(400, window.innerHeight || 720) + 'px', opacity: '0', pointerEvents: 'none', zIndex: '-1' });
      return;
    }
    if (nativeHost.hidden) return;
    const r = anchor.getBoundingClientRect();
    Object.assign(nativeHost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', opacity: '1', pointerEvents: 'auto', zIndex: '' });
  }
  function syncPreload() {
    const q = attempt && activeQuestion(), plan = warmPlan();
    const entry = screen === 'home' && !!plan && entryReady;
    const modern = !!attempt && attemptEdition() >= 14;
    const byteScreen = screen === 'intro' && modern ? 'stage' : screen;
    const active = (screen === 'home' ? entry : !!attempt && attemptEdition() >= 7 && !attempt.finishedAt) &&
      appActive && !storageConflict && (!isTelegram() || tg.isActive !== false) && !document.hidden && !dialog.open;
    const state = { screen: byteScreen, section: q?.section || (entry ? 'theory' : ''), entryReady: entry,
      eager: !!plan || modern, active: !!active,
      mediaBusy: !!q && (screen === 'question' && readyQuestionId !== q.id) || !!A.isBuffering?.() };
    const signature = JSON.stringify(state);
    if (signature !== preloadContext) { preloadContext = signature; window.GTANativePreload?.setContext(state); }
    const clip = document.getElementById('exam-audio');
    warmContextOwner = plan?.owner || null;
    nativeWarm?.setContext({ owner: warmContextOwner,
      screen: screen, section: q?.section || (entry ? 'theory' : ''), entryReady: entry, active: state.active,
      mediaBusy: state.mediaBusy || !!(clip && !clip.paused && !clip.ended),
      started: entry || !!plan && screen !== 'home' });
  }
  function preloadMarkup() {
    return '<div class="practice-preload" data-practice-preload><img class="practice-preload-icon" src="assets/game-ui/phone.png" width="24" height="24" alt="" aria-hidden="true"><span data-preload-label>Готовим город</span><progress data-preload-progress max="1" value="0" aria-label="Подготовка материалов практики"></progress></div>';
  }
  function updatePreload(state) {
    state = state || window.GTANativePreload?.getState(); if (!state) return;
    const percent = Math.min(100, Math.round((state.progress || 0) * 100));
    const deferred = ['error', 'unavailable'].includes(state.status) || ['retry-wait', 'network-retry', 'integrity-retry'].includes(state.reason) || (state.status === 'paused' && ['save-data', 'slow-connection', 'offline', 'saveData', 'slow-network'].includes(state.reason));
    const text = state.status === 'complete' ? (nativeWarm?.getState().status === 'ready' ? 'Город готов' : 'Материалы готовы') : deferred ? (percent ? 'Подготовлено ' + percent + '% · пауза' : 'Практика загрузится при открытии') : percent ? 'Город · ' + percent + '%' : 'Готовим город';
    root.querySelectorAll('[data-practice-preload]').forEach(node => { node.dataset.state = state.status; node.querySelector('[data-preload-label]').textContent = text; node.querySelector('[data-preload-progress]').value = state.progress || 0; });
  }
  function pauseRpg() {
    const paused = storageConflict || document.hidden || dialog.open || !appActive || (isTelegram() && tg.isActive === false);
    if (rpgScene) rpgScene.setPaused(paused);
    if (nativeScene && !nativeScene.isWarmup?.()) nativeScene.setPaused(paused || !nativeVisible);
    nativeAdvance?.sync();
    syncPreload();
  }
  function page(html, extra) {
    clearTimeout(imageLoadTimer); imageLoadTimer = null; imageLoadRun++;
    window.GTAExamCinema?.cancel();
    nativeAdvance?.cancel();
    releaseRpg(); const native = !!extra && extra.includes('native-exam-shell');
    if (!native) window.GTAGameGestures?.setActive(false);
    if (!native && !preserveWarm()) releaseNative();
    if (!native && nativeScene?.isWarmup?.()) { nativeVisible = false; positionNative(); }
    A.releaseClip(); document.body.classList.toggle('rpg-page-active', !!extra && extra.includes('rpg-exam-shell'));
    // Preparation is invisible through A/B, including restored old editions.
    root.innerHTML = '<div class="shell ' + (extra || '') + '">' + header() + html + footer() + '</div>';
    syncBackButton(); A.setContext(native ? 'native-exam' : screen); syncPreload(); updatePreload();
  }
  function launchReference() {
    if (ignoreLaunchVariant) return null;
    const query = new URLSearchParams(location.search);
    const raw = query.get('variant') || query.get('tgWebAppStartParam') || (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
    return E.parseLaunchReference(raw, query.get('edition'));
  }
  function publicVariant() { const ref = launchReference(); return ref && !ref.error ? ref.variant : null; }
  function launchError(ref) { return ref.error === 'unsupported-edition' ? 'Этот выпуск экзамена пока недоступен.' : 'В ссылке указан некорректный номер варианта.'; }
  function clearLaunch() {
    const url = new URL(location.href);
    ['variant', 'edition', 'tgWebAppStartParam'].forEach(key => url.searchParams.delete(key));
    history.replaceState({}, '', url); ignoreLaunchVariant = true;
  }
  function questionCount() { return attempt?.questionIds?.length || COUNT; }
  function sectionInfo(key) {
    // This is presentation only. Accepted ticket data and section maxima stay
    // with the exam engine; the current edition reads like one short journey.
    if (attempt && attemptEdition() >= 16) {
      const titles = { theory: 'Города и герои', field: 'Архив GTA', final: 'Выездная проверка' };
      return { ...sections[key], title: titles[key] || sections[key].title };
    }
    if (key === 'theory' && attempt && attemptEdition() < 11) return {...sections.theory, count: 8, time: '2 минуты', description: 'Восемь коротких вопросов.', hint: 'Каждый верный ответ — 3 балла.'};
    if (key === 'field' && attempt && attemptEdition() >= 14) return {...sections.field, description: 'Знакомые треки, история студии и игры по порядку выхода.', hint: 'До 8 баллов за задание. Время не влияет на оценку.'};
    if (key === 'field' && attempt && attemptEdition() >= 13) return {...sections.field, description: 'Два трека, знакомые города и пять игр по порядку выхода. За каждое задание — до 8 баллов.'};
    return sections[key];
  }
  function attemptEdition() {
    if (attempt && [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].includes(Number(attempt.contentEdition))) return Number(attempt.contentEdition);
    const ids = attempt && attempt.questionIds || [];
    return ids.some(id => id.startsWith('v16-')) ? 16 : ids.some(id => id.startsWith('v15-')) ? 15 : ids.some(id => id.startsWith('v14-')) ? 14 : ids.some(id => id.startsWith('v13-')) ? 13 : ids.some(id => id.startsWith('v12-')) ? 12 : ids.some(id => id.startsWith('v11-')) ? 11 : ids.some(id => id.startsWith('v10-')) ? 10 : ids.some(id => id.startsWith('v9-')) ? 9 : ids.some(id => id.startsWith('v8-')) ? 8 : ids.some(id => id.startsWith('v7-')) ? 7 : ids.some(id => id.startsWith('v6-')) ? 6 : ids.includes('b-logo-archive') ? 5 : ids.includes('b-basta-mama') ? 4 : 3;
  }

  function renderHome() {
    commissionRun++; screen = 'home'; readyQuestionId = null;
    const gradingPending = attempt && attempt.phase === 'grading';
    const resume = attempt ? '<div class="resume-banner"><div><strong>' + (gradingPending ? 'Работа на проверке' : attempt.finishedAt ? 'Твой результат' : 'Бланк сохранён') + '</strong><small>' + (gradingPending ? '' : attempt.finishedAt ? totalScore() + ' / 100' : progress() + ' из ' + questionCount() + ' ответов') + '</small></div><button class="secondary" data-action="resume">' + (attempt.finishedAt && !gradingPending ? 'Открыть' : 'Продолжить') + ' →</button></div>' : '';
    const launch = launchReference();
    const challenge = launch?.error ? '<div class="daily-banner launch-error" role="alert"><span>' + launchError(launch) + '</span><button class="secondary" data-action="new-current-ticket">Новый вариант</button></div>' : '';
    page(`<main class="home-page home-clean final-home">${resume}${challenge}<div class="home-grid">
      <figure class="final-cover" aria-labelledby="exam-brand-title"><h1 id="exam-brand-title" class="visually-hidden">Единый гангстерский экзамен — История GTA</h1><img class="final-cover-image" src="assets/brand-cover-rc45.png" width="1086" height="1448" fetchpriority="high" decoding="async" alt="Обложка ЕГЭ по истории GTA: пальмы внутри букв, подготовка к GTA VI и Сиджей с учебником. 12 заданий, 100 баллов."></figure>
      <aside class="exam-pass final-pass" aria-label="Бланк регистрации участника"><div class="form-heading"><span class="form-title-line">Экзаменационный билет · 2026</span>${barcode()}</div><h2 class="pass-title">Бланк участника</h2>
        ${telegramUser.name ? '<div class="candidate-card">' + avatarHTML(telegramUser.name) + '<strong class="candidate-name">' + escape(telegramUser.name) + '</strong></div>' : '<label class="field-label" for="nickname">Имя для результата</label><input class="text-input" id="nickname" maxlength="28" autocomplete="nickname" placeholder="Имя или ник" value="' + escape(profile.nickname || '') + '">'}
        <button class="primary" data-action="start">${homeMode === 'exam' ? 'Начать экзамен' : 'Начать тренировку'}<span aria-hidden="true">→</span></button><p class="home-duration">6–8 минут <span aria-hidden="true">·</span> Зачёт от ${PASS}</p>
        <div class="final-home-links"><a class="ghost practice-entry-link" href="rpg/">Практика C отдельно</a><details class="home-options"><summary>${homeMode === 'exam' ? 'Режим: экзамен' : 'Режим: тренировка'}</summary><div class="mode-tabs" role="group" aria-label="Режим прохождения"><button data-action="mode" data-mode="exam" class="${homeMode === 'exam' ? 'active' : ''}" aria-pressed="${homeMode === 'exam'}">Экзамен</button><button data-action="mode" data-mode="practice" class="${homeMode === 'practice' ? 'active' : ''}" aria-pressed="${homeMode === 'practice'}">Тренировка</button></div></details></div>
      </aside></div></main>`, 'clean-shell final-home-shell');
    window.scrollTo({ top: 0 });
  }
  function begin(force) {
    const launch = launchReference();
    if (launch && launch.error) return modal('<h2>Проверьте ссылку на вариант</h2><p>' + launchError(launch) + '</p><button class="primary" data-action="new-current-ticket">Начать актуальный выпуск →</button>');
    requestFullscreen(false);
    const field = document.getElementById('nickname');
    if (field) { profile.nickname = field.value.trim().slice(0, 28); write(PROFILE_KEY, profile); }
    if (!force && attempt && !attempt.finishedAt) return modal('<h2>Новый вариант?</h2><p>Текущая попытка сохранена. Можно продолжить её или начать заново.</p><div class="modal-actions"><button class="primary" data-action="resume-close">Продолжить попытку</button><button class="secondary" data-action="force-start">Начать заново</button></div>');
    releaseRpg();
    const variant = launch ? launch.variant : seed(), contentEdition = launch ? launch.edition : E.CONTENT_EDITION;
    const nextAttempt = { version: VERSION, contentEdition, variant, questionIds: E.buildTicket(variant, contentEdition), mode: homeMode, nickname: displayName(), answers: {}, drafts: {}, caseSteps: {}, questionTimes: {}, seenStages: [], completedCheckpoints: [], index: 0, activeSeconds: 0, phase: 'intro', startedAt: new Date().toISOString(), finishedAt: null };
    const preparedEdition = warmContextOwner === attempt ? attemptEdition() : entryWarmOwner?.contentEdition;
    if (warmContextOwner && preparedEdition === contentEdition && (!nativeScene || nativeScene.isWarmup?.()) && nativeWarm?.transferOwner?.(warmContextOwner, nextAttempt)) {
      if (nativeOwner === warmContextOwner) nativeOwner = nextAttempt;
      warmContextOwner = nextAttempt;
    } else if (nativeScene || warmContextOwner) releaseNative();
    attempt = nextAttempt; acceptedTapUntil = 0;
    A.start(true); draft = null; caseStep = 0; lastTick = performance.now(); resetStory(); save(true); renderOpeningCinema();
  }

  function finishOpeningCinema() {
    if (!attempt || screen !== 'intro' || !root.querySelector('[data-exam-cinema]')) return;
    window.GTAExamCinema?.cancel();
    // The ticket becomes the real first question; do not add a second gate.
    attempt.seenStages = Array.from(new Set([...(attempt.seenStages || []), 'theory']));
    attempt.phase = 'question'; lastTick = performance.now(); save();
    renderQuestion();
  }
  function renderOpeningCinema() {
    // Editions linked from older tickets retain exactly their existing intro.
    if (!window.GTAExamCinema || attemptEdition() < 16) return renderStageIntro();
    screen = 'intro'; readyQuestionId = null; lastTick = performance.now();
    attempt.phase = 'intro'; attempt.introFilmPlayed = true; save();
    const owner = attempt;
    page(window.GTAExamCinema.markup(), 'exam-cinema-shell');
    if (!window.GTAExamCinema.mount(root, () => { if (attempt === owner) finishOpeningCinema(); })) return renderStageIntro();
    window.scrollTo({ top: 0 });
  }

  function renderStageIntro() {
    screen = 'intro'; readyQuestionId = null; lastTick = performance.now(); attempt.phase = 'intro'; save();
    const key = activeQuestion().section, part = sectionInfo(key);
    if (key === 'final' && activeQuestion().type === 'vice') {
      if (attemptEdition() >= 8 && P) {
        attempt.seenStages = Array.from(new Set([...attempt.seenStages, 'final']));
        attempt.nativeContinuous = true; attempt.phase = 'question'; save(); return renderQuestion();
      }
      return renderPracticeOpening();
    }
    page(`<main class="stage-intro stage-clean"><section class="stage-intro-card"><div class="stage-kicker">Часть ${part.letter} · ${tasksLabel(part.count)}</div><div class="stage-letter" aria-hidden="true">${part.letter}</div><h1 class="stage-title">${part.title}</h1><p class="stage-desc">${key === 'theory' ? 'Вспомни знакомые города. Начнём с героев и мест.' : key === 'field' ? 'Радио, голоса и те самые коды. Подними записи из памяти.' : part.description}</p><p class="stage-disclosure">${disclosureText(key)}</p><button class="primary stage-cta" data-action="stage-enter">${key === 'theory' ? 'Приступить к части A' : key === 'field' ? 'Приступить к части B' : 'Начать'}<span aria-hidden="true">→</span></button></section></main>`, 'clean-shell');
    window.scrollTo({ top: 0 });
  }
  function sourcesHTML(q) { return '<div class="source-links">' + (q.sources || []).filter(source => /^https:\/\//.test(source.url)).map(source => '<a href="' + escape(source.url) + '" target="_blank" rel="noopener noreferrer">' + escape(source.title) + ' →</a>').join('') + '</div>'; }
  function mediaHTML(q) {
    if (!q.image) return '';
    const kind = q.mediaKind === 'archive' ? ' is-archive' : q.mediaKind === 'art' || q.mediaKind === 'artwork' ? ' is-art' : '';
    return '<div class="question-media"><div class="screenshot-wrap' + kind + '"><img id="exam-image" src="' + escape(q.image) + '" alt="' + escape(q.alt || 'Изображение к заданию') + '" decoding="async"><button class="image-zoom" data-action="zoom" aria-label="Увеличить изображение">↗</button></div><p class="image-load-state" hidden></p>' + (q.imageCaption ? '<p class="image-caption">' + escape(q.imageCaption) + '</p>' : '') + '</div>';
  }
  function disclosureText() {
    return 'Все ответы и оценки — после финала.';
  }
  function optionsHTML(q, answered, reveal, value, stepId) {
    const current = value === undefined ? draft : value;
    return '<div class="choices" role="group" aria-label="Варианты ответа">' + shuffled(q.options, attempt.variant + activeQuestion().id + (stepId || '') + 'options').map((option, i) => {
      const selected = current === option.id, cls = (selected ? ' selected' : '') + (reveal && option.id === q.answer ? ' correct' : '') + (reveal && selected && option.id !== q.answer ? ' incorrect' : '');
      return '<button class="choice' + cls + '" data-action="' + (stepId ? 'case-choose' : 'choose') + '" data-step="' + escape(stepId || '') + '" data-id="' + escape(option.id) + '" aria-pressed="' + selected + '" ' + (answered ? 'disabled' : '') + '><span class="choice-letter">' + (i + 1) + '</span><span class="choice-text">' + escape(option.text) + '</span><span class="choice-indicator" aria-hidden="true">' + (reveal && option.id === q.answer ? '✓' : selected ? '●' : '') + '</span></button>';
    }).join('') + '</div>';
  }
  function orderHTML(q, answered) {
    if (q.orderMode === 'tap') {
      const selected = Array.isArray(draft) ? draft : [];
      return '<div class="tap-order" role="group" aria-label="Выберите игры в порядке выхода">' + shuffled(q.items, attempt.variant + q.id + 'tap-order').map(item => {
        const index = selected.indexOf(item.id);
        return '<button class="tap-order-card' + (index >= 0 ? ' is-selected' : '') + (item.image ? ' has-image' : '') + '" data-action="order-tap" data-id="' + escape(item.id) + '" aria-pressed="' + (index >= 0) + '" ' + (answered ? 'disabled' : '') + '><span class="tap-order-number" aria-hidden="true">' + (index >= 0 ? index + 1 : '·') + '</span>' + (item.image ? '<img class="order-thumb" src="' + escape(item.image) + '" alt="' + escape(item.alt || item.text) + '" decoding="async">' : '') + '<span class="tap-order-text">' + escape(item.text) + '<span class="visually-hidden">' + (index >= 0 ? ', место ' + (index + 1) : ', ещё не выбрана') + '</span></span></button>';
      }).join('') + '</div><div class="tap-order-toolbar"><span data-order-status aria-live="polite">Выбрано ' + selected.length + ' из ' + q.items.length + '</span>' + (!answered ? '<button class="ghost tap-order-undo" data-action="order-undo" ' + (!selected.length ? 'disabled' : '') + '>Отменить последний</button>' : '') + '</div><p class="image-load-state" hidden></p>';
    }

    return '<ol class="order-list' + (q.items.some(item => item.image) ? ' order-visual' : '') + '" aria-label="Игры от самой ранней к самой новой">' + draft.map((id, i) => {
      const item = q.items.find(item => item.id === id);
      return '<li class="order-row"><span class="order-index">' + String(i + 1).padStart(2, '0') + '</span>' + (item.image ? '<img class="order-thumb" src="' + escape(item.image) + '" alt="' + escape(item.alt || item.text) + '" decoding="async">' : '') + '<span class="order-text">' + escape(item.text) + '</span><span class="order-actions"><button class="mini-button" data-action="move" data-position="' + i + '" data-direction="-1" aria-label="Поднять ' + escape(item.text) + '" ' + (answered || i === 0 ? 'disabled' : '') + '>↑</button><button class="mini-button" data-action="move" data-position="' + i + '" data-direction="1" aria-label="Опустить ' + escape(item.text) + '" ' + (answered || i === draft.length - 1 ? 'disabled' : '') + '>↓</button></span></li>';
    }).join('') + '</ol><p class="image-load-state" hidden></p>';
  }
  function matchHTML(q, answered, value, stepId) {
    const current = value || draft;
    return '<div class="match-list">' + q.pairs.map(pair => '<div class="match-row"><label for="match-' + (stepId || '') + '-' + pair.id + '">' + escape(pair.left) + '</label><select id="match-' + (stepId || '') + '-' + pair.id + '" data-match="' + pair.id + '" data-case="' + (stepId || '') + '" ' + (answered ? 'disabled' : '') + '><option value="">Выберите пару</option>' + shuffled(q.pairs, attempt.variant + activeQuestion().id + (stepId || '') + 'pairs').map(v => '<option value="' + escape(v.id) + '" ' + (current[pair.id] === v.id ? 'selected' : '') + '>' + escape(v.right) + '</option>').join('') + '</select></div>').join('') + '</div>';
  }
  function classifyHTML(q, answered) { return '<div class="universe-grid">' + q.items.map(item => '<div class="match-row"><label for="category-' + item.id + '">' + escape(item.text) + '</label><select id="category-' + item.id + '" data-category="' + item.id + '" ' + (answered ? 'disabled' : '') + '><option value="">' + escape(q.categoryLabel || 'Выберите группу') + '</option>' + q.categories.map(category => '<option value="' + escape(category.id) + '" ' + (draft[item.id] === category.id ? 'selected' : '') + '>' + escape(category.text) + '</option>').join('') + '</select></div>').join('') + '</div>'; }
  function caseHTML(q, answered, reveal) {
    const step = q.steps[caseStep];
    const tabs = q.steps.map((item, i) => '<button data-action="case-step" data-step-index="' + i + '" class="' + (i === caseStep ? 'active' : E.ready(item, draft[item.id]) ? 'done' : '') + '" aria-pressed="' + (i === caseStep) + '" ' + (!answered && i > 0 && !q.steps.slice(0, i).every(s => E.ready(s, draft[s.id])) ? 'disabled' : '') + '><strong>' + (i + 1) + '</strong>' + escape(item.title) + '</button>').join('');
    const content = step.presentation === 'evidence-scope' && window.GTAEvidenceScope
      ? window.GTAEvidenceScope.render(step, draft[step.id], { locked: answered, reveal, options: shuffled(step.options, attempt.variant + q.id + step.id + 'options') })
      : step.type === 'mcq' ? optionsHTML(step, answered, reveal, draft[step.id], step.id) : matchHTML(step, answered, draft[step.id], step.id);
    return '<div class="case-evidence" role="group" aria-label="Этапы финального дела">' + tabs + '</div><div class="case-progress">Этап ' + (caseStep + 1) + ' из 3</div><fieldset class="case-page"><legend>' + escape(step.title) + '</legend><p class="case-clue">' + escape(step.prompt) + '</p>' + content + '</fieldset>';
  }
  function audioHTML(q, answered) {
    const duration = Number(q.audioDuration) || 20;
    const sourceUrl = safeHttps(q.audioSourceUrl);
    if (answered) return '<div class="audio-answered"><strong>' + escape(q.audioTitle) + '</strong>' + (sourceUrl ? '<a class="audio-source" href="' + escape(sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + escape(q.audioSourceLabel || 'Источник фрагмента') + ' ↗</a>' : '') + '</div>';
    return '<section class="audio-exhibit is-loading" aria-label="Музыкальный фрагмент"><h2 class="audio-track-title">' + escape(q.audioTitle) + '</h2><div class="audio-console"><button class="audio-toggle" data-action="audio-toggle" aria-label="Слушать отрывок" aria-pressed="false"><span class="audio-toggle-icon" aria-hidden="true">▶</span></button><div class="audio-display"><div class="audio-waveform" aria-hidden="true">' + q.audioWaveform.map(value => '<span style="--wave:' + Number(value) + '"></span>').join('') + '</div><div class="audio-wave-progress" style="width:0%"></div><input class="audio-seek" type="range" min="0" max="' + duration + '" step="0.1" value="0" disabled aria-label="Позиция в отрывке"><div class="audio-time"><span data-audio-current>0:00</span><span>' + formatTime(duration) + '</span></div></div></div><p class="audio-status" role="status">Загружаем фрагмент… Время ответа на паузе.</p>' + (sourceUrl ? '<a class="audio-source" href="' + escape(sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + escape(q.audioSourceLabel || 'Источник фрагмента') + ' ↗</a>' : '') + '<audio id="exam-audio" preload="auto" src="' + escape(q.audio) + '" playsinline hidden></audio></section>';
  }
  function updateAudioChoice(q) {
    root.querySelectorAll('.choices [data-action="choose"]').forEach(button => {
      const selected = button.dataset.id === draft;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
      button.querySelector('.choice-indicator').textContent = selected ? '●' : '';
    });
    const submitButton = root.querySelector('[data-action="submit"]');
    if (submitButton) submitButton.disabled = !isReady(q) || readyQuestionId !== q.id;
  }
  function updateOrderChoice(q) {
    const selected = Array.isArray(draft) ? draft : [];
    root.querySelectorAll('.tap-order-card').forEach(button => {
      const index = selected.indexOf(button.dataset.id);
      button.classList.toggle('is-selected', index >= 0);
      button.setAttribute('aria-pressed', String(index >= 0));
      button.querySelector('.tap-order-number').textContent = index >= 0 ? String(index + 1) : '·';
      button.querySelector('.visually-hidden').textContent = index >= 0 ? ', место ' + (index + 1) : ', ещё не выбрана';
    });
    const status = root.querySelector('[data-order-status]');
    if (status) status.textContent = 'Выбрано ' + selected.length + ' из ' + q.items.length;
    const undo = root.querySelector('[data-action="order-undo"]');
    if (undo) undo.disabled = !selected.length;
    const submitButton = root.querySelector('[data-action="submit"]');
    if (submitButton) submitButton.disabled = !isReady(q) || readyQuestionId !== q.id;
  }
  function questionHint(q) {
    if (q.type === 'order' && q.orderMode === 'tap') return 'Первые релизы, от ранней к поздней. Нажимай на обложки.';
    if (q.type === 'order' || q.type === 'match') return q.type === 'order' ? 'Меняйте порядок стрелками.' : 'Установите соответствие.';
    if (q.type === 'audio') return '';
    if (q.type === 'classify') return 'Категории могут повторяться.';
    if (q.type === 'case') return 'Пройдите три этапа. Ответ можно изменить до передачи всего дела комиссии.';
    return '';
  }
  function renderQuestion(keepScroll) {
    if (!attempt) return renderHome();
    const pending = pendingCheckpoint(attempt.index);
    if (pending) { attempt.index = lastIndexOfSection(pending); attempt.checkpointSection = pending; draft = null; caseStep = 0; return renderCheckpoint(); }
    tick();
    const q = activeQuestion(); if (!attempt.seenStages.includes(q.section)) return renderStageIntro();
    screen = 'question'; attempt.phase = 'question'; readyQuestionId = null;
    const answer = attempt.answers[q.id], part = sectionInfo(q.section), reveal = false;
    if (answer) draft = clone(answer.value);
    else if (draft === null) { draft = clone(attempt.drafts[q.id] === undefined ? E.initialDraft(q, attempt.variant) : attempt.drafts[q.id]); caseStep = attempt.caseSteps[q.id] || 0; }
    if (q.type === 'rpg') return renderRpgQuestion(q, answer);
    if (q.type === 'vice') return renderNativeQuestion(q, answer);
    const number = String(attempt.index + 1).padStart(2, '0');
    // Shorten presentation only; historical ticket data and grading stay intact.
    const heading = q.id === 'v15-b-release-order' ? 'Расставь эти GTA по порядку выхода.' : q.type === 'case' ? q.title : q.prompt;
    const content = q.type === 'mcq' || q.type === 'image' || q.type === 'audio' ? optionsHTML(q, !!answer, reveal) : q.type === 'order' ? orderHTML(q, !!answer) : q.type === 'match' ? matchHTML(q, !!answer) : q.type === 'classify' ? classifyHTML(q, !!answer) : caseHTML(q, !!answer, reveal);
    // Only a neutral receipt is shown when revisiting an accepted answer.
    // Correctness, explanations and grades stay sealed until the final card.
    const feedback = answer ? '<p class="feedback accepted" role="status">Ответ внесён в бланк</p>' : '';
    const stepContinue = !answer && q.type === 'case' && caseStep < q.steps.length - 1;
    const atSectionEnd = attempt.index < questionCount() - 1 && byId[attempt.questionIds[attempt.index + 1]].section !== q.section;
    const actionLabel = attempt.index === questionCount() - 1 ? 'К результату' : atSectionEnd ? 'Завершить часть ' + part.letter : 'Дальше';
    const action = answer ? '<button class="primary" data-action="next">' + actionLabel + '<span aria-hidden="true">→</span></button>' : stepContinue ? '<button class="primary" data-action="case-next" ' + (!E.ready(q.steps[caseStep], draft[q.steps[caseStep].id]) ? 'disabled' : '') + '>' + (q.steps[caseStep].presentation === 'evidence-scope' ? 'Приобщить к делу' : 'Следующий этап') + '<span aria-hidden="true">→</span></button>' : '<button class="primary" data-action="submit" ' + (!isReady(q) ? 'disabled' : '') + '>' + actionLabel + '<span aria-hidden="true">→</span></button>';
    page(`<main class="exam-layout"><aside class="exam-sidebar"><div class="eyebrow">Контрольные материалы</div><h2>Вариант № ${escape(attempt.variant.slice(0, 6).toUpperCase())}</h2><p class="muted">${escape(attempt.nickname)}<br>${attempt.mode === 'exam' ? 'Основной экзамен' : 'Тренировочная работа'}</p><div class="section-summary">${Object.keys(sections).map(key => [key, sectionInfo(key)]).map(([key, s]) => '<div class="section-divider ' + (key === q.section ? 'active' : '') + '"><span>' + s.letter + '</span><strong>' + s.title + '</strong><small>' + attempt.questionIds.filter(id => byId[id].section === key && attempt.answers[id]).length + ' / ' + s.count + '</small></div>').join('')}</div><div class="answer-register"><span class="eyebrow">Бланк ответов участника</span><div class="question-navigation" aria-label="Навигация по билету">${attempt.questionIds.map((id, i) => '<button data-action="goto" data-index="' + i + '" class="' + (attempt.answers[id] ? 'done ' : '') + (i === attempt.index ? 'current' : '') + '" aria-label="Задание ' + (i + 1) + '" ' + (!attempt.answers[id] && i > progress() ? 'disabled' : '') + '>' + (i + 1) + '</button>').join('')}</div></div></aside>
      <section class="question-main"><div class="exam-meta"><span class="pill">Часть ${part.letter} · ${part.title}</span><span class="question-count">${number} <span class="muted">/ ${questionCount()}</span></span></div><div class="progress-track" role="progressbar" aria-label="Принято ответов" aria-valuemin="0" aria-valuemax="${questionCount()}" aria-valuenow="${progress()}"><div class="progress-fill" style="width:${progress() / questionCount() * 100}%"></div></div>
      ${q.section === 'field' ? '<div class="time-strip"><span class="timer-value" data-question-timer aria-label="Время ответа">' + formatTime(answer ? answer.seconds : attempt.questionTimes[q.id]) + '</span><span>' + 'На баллы не влияет' + '</span></div>' : ''}
      ${q.section === 'final' ? '<div class="challenge-level"><span>' + escape(q.stageTitle) + '</span></div>' : ''}
      <article class="question-card"><h1 class="question-title" tabindex="-1">${escape(heading)}</h1>${q.type === 'case' ? '<p class="question-hint">' + escape(q.prompt) + '</p>' : ''}
      ${q.type === 'audio' ? audioHTML(q, !!answer) : ''}${mediaHTML(q)}${questionHint(q) ? '<p class="question-hint">' + questionHint(q) + '</p>' : ''}${content}${feedback}<div class="question-actions">${action}</div></article></section></main>`, 'exam-shell');
    armQuestion(q); save();
    if (!keepScroll) { window.scrollTo({ top: 0 }); document.querySelector('.question-title').focus({ preventScroll: true }); }
  }
  function renderPracticeOpening() {
    const scenes = attempt.questionIds.map(id => byId[id]).filter(q => q.type === 'vice');
    page(`<main class="practice-opening"><div class="stage-route" aria-label="Этапы экзамена"><span class="done">A · принята</span><span class="done">B · принята</span><span class="current">C · практика</span></div><section class="practice-dossier"><div class="practice-dossier-top"><span>БЛАНК № 2 · ПРАКТИЧЕСКАЯ ЧАСТЬ</span>${barcode()}</div><div class="practice-opening-grid"><div class="practice-opening-copy"><span class="practice-stamp">ДОПУСК ПОЛУЧЕН</span><p class="practice-eyebrow">${attemptEdition() >= 10 ? 'Теория позади. Город впереди.' : 'Теория завершена. Выезд на полигон.'}</p><h1>Теперь —<br>на практике.</h1><p>${attemptEdition() >= 9 ? 'Двигайся по городу, садись за руль и стреляй.' : 'Три задания в Vice City. Управляй прицелом и огнём.'}</p><div class="practice-controls-guide"><span><b>01</b> Прицел</span><span><b>02</b> Огонь</span></div><p class="practice-opening-note">${attemptEdition() >= 9 ? 'Слева движение. Справа прицел и огонь.' : 'Наводи прицел пальцем.'}</p></div><ol class="practice-scene-list">${scenes.map(q => '<li><span class="practice-scene-number">C' + q.nativeScene + '</span><div><small>' + escape(q.weaponLabel) + ' · ' + escape(q.ammoLabel) + '</small><h2>' + escape(q.title) + '</h2><p>' + escape(q.goal) + '</p></div></li>').join('')}</ol></div><div class="practice-opening-bottom">${preloadMarkup()}<p><strong>Баллы — в итогах экзамена.</strong> Результат сохраняется после каждого задания.</p><button class="primary" data-action="stage-enter">Открыть полигон <span aria-hidden="true">→</span></button></div></section></main>`, 'practice-opening-shell');
    updatePreload(); window.scrollTo({ top: 0 });
  }
  function renderNativeQuestion(q, answer) {
    const owner = attempt, id = q.id;
    const continuous = attemptEdition() >= 8 && !!P;
    const title = continuous && attemptEdition() === 8 && q.nativeScene === 2 ? 'Перекрытие' : q.title;
    let transitionArmed = false, nativePlayed = false;
    const usedWarmRuntime = !!nativeScene?.isWarmup?.();
    if (nativeOwner && nativeOwner !== owner) releaseNative();
    nativeVisible = false;
    if (nativeHost) {
      if (nativeScene?.isWarmup?.()) positionNative();
      else nativeHost.hidden = true;
    }
    page('<main class="rpg-exam-main"><div class="rpg-exam-strip"><div><span>Часть C · Сцена ' + q.nativeScene + ' из 3</span><h1 class="question-title" tabindex="-1">' + escape(title) + '</h1></div><strong>' + (attempt.index + 1) + ' / ' + questionCount() + '</strong></div><div class="native-route" aria-label="Сцены практики">' + (attemptEdition() >= 16 ? ['Встреча', 'Заезд', 'Последний залп'] : attemptEdition() >= 10 ? ['Взрыв', 'Погоня', 'Финал'] : attemptEdition() >= 9 ? ['Угон', 'Взрыв', 'РПГ'] : continuous ? ['Пристрелка', 'Перекрытие', 'Вертолёт'] : ['Пистолет', 'Uzi', 'РПГ']).map((label, i) => '<span class="' + (i + 1 < q.nativeScene ? 'done' : i + 1 === q.nativeScene ? 'current' : '') + '">C' + (i + 1) + ' · ' + label + '</span>').join('') + '</div><div id="native-exam-anchor" class="rpg-scene-host"></div><div class="rpg-exam-finish" id="native-exam-finish" hidden><p>Этап C' + q.nativeScene + ' завершён. Оценка — после комиссии.</p><p class="native-auto-note" id="native-auto-status" role="status"></p><button class="primary" data-action="native-finish">' + (q.nativeScene === 3 ? 'Передать работу комиссии' : 'Следующая сцена') + '<span aria-hidden="true">→</span></button></div><div class="rpg-exam-error" id="native-exam-error" hidden><p>Не удалось открыть практику. Ответы A и B сохранены.</p><button class="secondary" data-action="native-reload">Повторить запуск</button><button class="ghost" data-action="native-skip">Пропустить сцену</button></div></main>', 'rpg-exam-shell native-exam-shell' + (continuous ? ' native-continuous-shell' : ''));
    function current() { return attempt === owner && screen === 'question' && activeQuestion().id === id; }
    function completed(value) {
      if (!current() || !E.ready(q, value)) return;
      tick(); readyQuestionId = null;
      if (continuous) {
        const accepted = P.acceptProtocol({ attempt: owner, question: q, protocol: value, ready: E.ready, grade: E.grade });
        if (accepted.status === 'invalid') return;
        draft = clone(accepted.answer.value); save();
        if (accepted.status === 'accepted') haptic('medium');
      } else if (!owner.answers[id]) { draft = clone(value); rememberDraft(); }
      document.getElementById('native-exam-finish').hidden = continuous && nativeVisible;
      document.getElementById('native-exam-error').hidden = true;
      requestAnimationFrame(positionNative);
      if (continuous && !transitionArmed) {
        transitionArmed = true;
        nativeAdvance.start({ durationMs: q.nativeScene === 3 ? 1600 : 0,
          isCurrent: () => current() && owner.phase === 'question' && !!owner.answers[id],
          isActive: () => !document.hidden && !dialog.open && appActive && (!isTelegram() || tg.isActive !== false),
          onTick: status => {
            const label = document.getElementById('native-auto-status');
            if (label) label.textContent = status.paused ? 'Переход приостановлен' : q.nativeScene === 3 ? 'Передаём работу комиссии…' : 'Следующая сцена через ' + status.seconds;
          },
          onComplete: () => { if (current() && owner.answers[id]) next(); }
        });
      }
    }
    function failure() {
      if (!current()) return; tick(); readyQuestionId = null;
      const saved = owner.answers[id]?.value || owner.drafts[id];
      if (E.ready(q, saved)) { draft = clone(saved); releaseNative(); renderNativeQuestion(q, owner.answers[id]); return; }
      if (usedWarmRuntime && !nativePlayed) { releaseNative(); renderNativeQuestion(q, owner.answers[id]); return; }
      document.getElementById('native-exam-error').hidden = false;
      requestAnimationFrame(positionNative);
    }
    nativeCallbacks = {
      onState: state => {
        if (!current() || state.scene !== q.nativeScene) return;
        if (state.stage === 'playing') nativePlayed = true;
        tick(); readyQuestionId = state.stage === 'playing' && !owner.answers[id] ? id : null; lastTick = performance.now();
      },
      onComplete: completed, onError: failure,
      onHighlight: value => { if (current()) rememberHighlight(value, owner); },
      onReady: () => { if (!current()) return; document.getElementById('native-exam-error').hidden = true; if (!continuous && !owner.answers[id] && !E.ready(q, owner.drafts[id]) && !document.hidden && !dialog.open) nativeScene?.startScene(); }
    };
    const stored = answer ? answer.value : E.ready(q, draft) ? draft : null;
    if (stored) {
      nativeScene?.setPaused(true);
      document.getElementById('native-exam-anchor').innerHTML = '<div class="native-saved-protocol"><span class="practice-stamp">ПРОТОКОЛ ПРИНЯТ</span><span class="native-saved-code">C' + q.nativeScene + '</span><h2>Сцена завершена</h2><p>Результат сохранён в бланке.<br>Оценку объявит комиссия.</p></div>';
      completed(stored);
    } else {
      nativeVisible = true;
      window.GTAGameGestures?.setActive(true);
      try {
        if (!window.GTAVicePort) throw new Error('native-port-unavailable');
        window.GTANativePreload?.pause();
        const prepared = nativeWarm?.adopt(owner);
        if (prepared && prepared !== nativeScene) { prepared.destroy(); throw new Error('native-warm-owner-mismatch'); }
        if (!nativeScene) {
          nativeHost = document.createElement('div'); nativeHost.id = 'native-exam-persistent'; nativeHost.className = 'native-persistent-host'; document.body.appendChild(nativeHost);
          nativeOwner = owner;
          nativeScene = window.GTAVicePort.mount(nativeHost, {
            scene: q.nativeScene, examMode: true, legacy: attemptEdition() === 7, edition: attemptEdition(), continuous: continuous, muted: !A.isEnabled(),
            onState: value => nativeCallbacks?.onState(value), onComplete: value => nativeCallbacks?.onComplete(value),
            onHighlight: value => nativeCallbacks?.onHighlight(value),
            onReady: () => nativeCallbacks?.onReady(), onError: message => nativeCallbacks?.onError(message)
          });
        } else if (!nativeScene.setScene(q.nativeScene)) throw new Error('native-scene-transition-rejected');
        nativeScene.setMuted(!A.isEnabled());
        if (nativeScene.isWarmup?.()) {
          nativeScene.setPaused(document.hidden || dialog.open || !appActive || (isTelegram() && tg.isActive === false));
          if (nativeScene.activate() === false) throw new Error('native-warm-activation-rejected');
        }
        pauseRpg();
      } catch (_) { failure(); }
      nativeObserver?.disconnect();
      if (window.ResizeObserver) { nativeObserver = new ResizeObserver(positionNative); nativeObserver.observe(document.getElementById('native-exam-anchor')); }
      positionNative(); requestAnimationFrame(positionNative);
    }
    save(); window.scrollTo({ top: 0 }); root.querySelector('.question-title').focus({ preventScroll: true });
  }
  function finishNative(skip) {
    if (!attempt || screen !== 'question') return;
    const q = activeQuestion(); if (q.type !== 'vice') return;
    if (!attempt.answers[q.id]) {
      if (skip && !E.ready(q, draft)) {
        const error = document.getElementById('native-exam-error'); if (!error || error.hidden) return;
        draft = { engine: 'vice-city-wasm', version: q.resultVersion || 2, scene: q.nativeScene, completed: true, skipped: true, outcome: 'unavailable', reason: 'runtime-unavailable', ammoInitial: q.initialAmmo, ammoRemaining: q.initialAmmo, targets: [] };
      }
      if (!E.ready(q, draft)) return;
      tick();
      if (P) {
        const accepted = P.acceptProtocol({ attempt: attempt, question: q, protocol: draft, ready: E.ready, grade: E.grade });
        if (accepted.status === 'invalid') return;
      } else { attempt.answers[q.id] = { value: clone(draft), ...E.grade(q, draft), seconds: Math.round((attempt.questionTimes[q.id] || 0) * 10) / 10 }; delete attempt.drafts[q.id]; }
      save(); haptic('medium');
    }
    nativeAdvance?.cancel();
    if (skip) releaseNative();
    next();
  }
  function renderRpgQuestion(q, answer) {
    const owner = attempt, id = q.id;
    page('<main class="rpg-exam-main"><div class="rpg-exam-strip"><div><span>C3 · Игровая практика</span><h1 class="question-title" tabindex="-1">Воздушная цель</h1></div><strong>16 / 16</strong></div><div id="rpg-exam-scene" class="rpg-scene-host" aria-label="Полигон: герой с РПГ и пролетающий вертолёт"></div><div class="rpg-exam-finish" id="rpg-exam-finish" hidden><p>Практика завершена. Оценка — после комиссии.</p><button class="primary" data-action="rpg-finish">Передать работу комиссии <span aria-hidden="true">→</span></button></div><div class="rpg-exam-error" id="rpg-exam-error" hidden><p>Не удалось запустить 3D-сцену на этом устройстве.</p><button class="secondary" data-action="rpg-reload">Попробовать ещё раз</button><button class="ghost" data-action="rpg-skip">Завершить без практики</button></div></main>', 'rpg-exam-shell');
    readyQuestionId = id; lastTick = performance.now();
    function current() { return attempt === owner && screen === 'question' && activeQuestion().id === id; }
    function completed(value) {
      if (!current() || !E.ready(q, value)) return;
      if (!owner.answers[id]) { draft = clone(value); rememberDraft(); }
      const finish = document.getElementById('rpg-exam-finish'); if (finish) finish.hidden = false;
    }
    function failure() { if (!current()) return; const message = document.getElementById('rpg-exam-error'); if (message) message.hidden = false; }
    rpgOwner = owner; rpgQuestionId = id;
    try {
      if (!window.GTARPGScene) throw new Error('scene-module-unavailable');
      rpgScene = window.GTARPGScene.mount(document.getElementById('rpg-exam-scene'), {
        state: owner.rpgStates && owner.rpgStates[id], result: answer ? answer.value : E.ready(q, draft) ? draft : null,
        examMode: true, muted: !A.isEnabled(),
        onState: state => { if (!current()) return; owner.rpgStates = owner.rpgStates || {}; owner.rpgStates[id] = state; save(); },
        onComplete: completed, onError: failure,
        onReady: () => { if (!current()) return; const message = document.getElementById('rpg-exam-error'); if (message) message.hidden = true; }
      });
      pauseRpg();
    } catch (_) { failure(); }
    if (answer || E.ready(q, draft)) completed(answer ? answer.value : draft);
    save(); window.scrollTo({ top: 0 }); root.querySelector('.question-title').focus({ preventScroll: true });
  }
  function finishRpg(skip) {
    if (!attempt || screen !== 'question') return;
    const q = activeQuestion(); if (q.type !== 'rpg') return;
    if (!attempt.answers[q.id]) {
      if (skip) {
        const error = document.getElementById('rpg-exam-error'); if (!error || error.hidden) return;
        draft = { version: 1, completed: true, skipped: true, shots: [] };
      }
      if (!isReady(q)) return;
      tick(); attempt.answers[q.id] = { value: clone(draft), ...E.grade(q, draft), seconds: Math.round((attempt.questionTimes[q.id] || 0) * 10) / 10 };
      delete attempt.drafts[q.id]; save(); haptic('medium');
    }
    next();
  }
  function armQuestion(q) {
    lastTick = performance.now();
    const loadRun = imageLoadRun;
    const current = () => loadRun === imageLoadRun && screen === 'question' && attempt && activeQuestion().id === q.id;
    const image = document.getElementById('exam-image');
    const images = [...(image ? [image] : []), ...root.querySelectorAll('.order-thumb')];
    const ready = () => { if (!current()) return; clearTimeout(imageLoadTimer); imageLoadTimer = null; readyQuestionId = q.id; lastTick = performance.now(); const button = root.querySelector('[data-action="submit"]'); if (button && !attempt.answers[q.id]) button.disabled = !isReady(q); const state = root.querySelector('.image-load-state'); if (state) state.hidden = true; syncPreload(); };
    if (attempt.answers[q.id]) return ready();
    if (q.type === 'audio') return A.mountClip(q, ready, () => { tick(); readyQuestionId = null; lastTick = performance.now(); const button = root.querySelector('[data-action="submit"]'); if (button && !attempt.answers[q.id]) button.disabled = true; }, { autoplay: !attempt.answers[q.id] });
    if (!images.length || images.every(item => item.complete && item.naturalWidth > 0)) return ready();
    const button = root.querySelector('[data-action="submit"]'); if (button) button.disabled = true;
    const loadingState = root.querySelector('.image-load-state');
    if (loadingState) { loadingState.hidden = false; loadingState.textContent = images.length > 1 ? 'Загружаем обложки…' : 'Загружаем кадр…'; loadingState.setAttribute('role', 'status'); }
    const checkReady = () => { if (images.every(item => item.complete && item.naturalWidth > 0)) ready(); };
    images.forEach(item => item.addEventListener('load', checkReady, { once: true }));
    const fail = () => { if (!current() || readyQuestionId === q.id) return; clearTimeout(imageLoadTimer); imageLoadTimer = null; const state = root.querySelector('.image-load-state'); if (state) { state.hidden = false; state.innerHTML = 'Картинка задерживается. <button class="ghost" data-action="retry-image">Загрузить ещё раз</button>'; } };
    imageLoadTimer = setTimeout(fail, 9000);
    images.forEach(item => { item.addEventListener('error', fail, { once: true }); if (item.complete && !item.naturalWidth) fail(); });
  }
  function rememberDraft() { if (!attempt || screen !== 'question') return; const q = activeQuestion(); attempt.drafts[q.id] = clone(draft); if (q.type === 'case') attempt.caseSteps[q.id] = caseStep; save(); }
  function submit() {
    if (!attempt || screen !== 'question') return;
    const q = activeQuestion(); if (attempt.answers[q.id] || !isReady(q) || readyQuestionId !== q.id) return;
    tick(); attempt.answers[q.id] = { value: clone(draft), ...E.grade(q, draft), seconds: Math.round((attempt.questionTimes[q.id] || 0) * 10) / 10 };
    delete attempt.drafts[q.id]; save(); haptic();
    // Commit and move once. A duplicate tap must not act on the next screen.
    acceptedTapUntil = performance.now() + 320;
    if (attemptEdition() >= 11 && attemptEdition() < 14 && q.section === 'field' && byId[attempt.questionIds[attempt.index + 1]]?.section === 'final') {
      attempt.completedCheckpoints = Array.from(new Set([...(attempt.completedCheckpoints || []), 'field']));
      attempt.index++; attempt.phase = 'question'; draft = null; caseStep = 0; save(); return renderQuestion();
    }
    next();
  }
  function next() {
    if (storageConflict || !attempt || screen !== 'question' || !attempt.answers[activeQuestion().id]) return;
    // Also validate a restored accepted answer before advancing/finalizing it.
    save(); if (storageConflict) return;
    if (attempt.index === questionCount() - 1) {
      const missing = attempt.questionIds.findIndex(id => !attempt.answers[id]);
      if (missing >= 0) { attempt.index = missing; draft = null; caseStep = 0; save(); return renderQuestion(); }
      tick(); attempt.finishedAt = new Date().toISOString(); attempt.phase = 'grading';
      if (attempt.mode === 'exam') { profile.best = Math.max(profile.best || 0, totalScore()); profile.passes = (profile.passes || 0) + 1; write(PROFILE_KEY, profile); }
      save(); return renderCommission();
    }
    const section = activeQuestion().section;
    if (section !== 'final' && !(attempt.completedCheckpoints || []).includes(section) && byId[attempt.questionIds[attempt.index + 1]].section !== section) {
      attempt.phase = 'checkpoint'; attempt.checkpointSection = section; save(); return renderCheckpoint();
    }
    attempt.index++; draft = null; caseStep = 0; save(); renderQuestion();
  }
  function lastIndexOfSection(section) { return attempt.questionIds.reduce((last, id, index) => byId[id].section === section ? index : last, -1); }
  function pendingCheckpoint(index) {
    return ['theory', 'field'].find(section => index > lastIndexOfSection(section) && !(attempt.completedCheckpoints || []).includes(section) && attempt.questionIds.filter(id => byId[id].section === section).every(id => attempt.answers[id]));
  }

  function renderCheckpoint() {
    const key = attempt.checkpointSection || activeQuestion().section, part = sectionInfo(key);
    const missing = attempt.questionIds.findIndex(id => byId[id].section === key && !attempt.answers[id]);
    if (missing >= 0) { attempt.index = missing; delete attempt.checkpointSection; draft = null; caseStep = 0; save(); return renderQuestion(); }
    screen = 'checkpoint'; readyQuestionId = null; attempt.phase = 'checkpoint'; save();
    const continuousPractice = key === 'field' && attempt.questionIds.some(id => byId[id].type === 'vice') && attemptEdition() >= 8;
    page(`<main class="checkpoint-screen"><section class="checkpoint-card checkpoint-clean" aria-label="Часть ${part.letter} принята"><span class="checkpoint-receipt" aria-hidden="true">${part.letter}<img class="receipt-game-icon" src="assets/game-ui/${key === 'theory' ? 'radio' : 'phone'}.png" width="32" height="32" alt=""></span><h1>Часть ${part.letter} принята</h1><p class="checkpoint-next-copy">${key === 'theory' ? 'Лица и адреса — в бланке. Теперь вспомни радио и коды.' : 'Бланк заполнен. Осталась проверка на улицах.'}</p><div class="checkpoint-actions"><button class="primary" data-action="checkpoint-next">${continuousPractice ? 'Открыть часть C' : key === 'theory' ? 'К части B' : 'К части C'}<span aria-hidden="true">→</span></button></div></section></main>`, 'clean-shell');
    window.scrollTo({ top: 0 });
  }
  function continueCheckpoint() {
    if (!attempt || screen !== 'checkpoint' || attempt.index >= questionCount() - 1) return;
    attempt.completedCheckpoints = Array.from(new Set([...(attempt.completedCheckpoints || []), attempt.checkpointSection]));
    // This short receipt already introduces B; avoid a second interstitial.
    if (attempt.checkpointSection === 'theory' && !attempt.seenStages.includes('field')) attempt.seenStages.push('field');
    attempt.index++; delete attempt.checkpointSection; attempt.phase = 'question'; draft = null; caseStep = 0; save(); renderQuestion();
  }
  function breakdown() {
    return Object.entries(sections).map(([key, part]) => {
      const points = attempt.questionIds.filter(id => byId[id].section === key).reduce((sum, id) => sum + (attempt.answers[id]?.points || 0), 0);
      return { key, letter: part.letter, title: part.title, max: part.max, points, stars: E.sectionRating(points, part.max) };
    });
  }
  function sectionRatingText(part) { return 'Часть ' + part.letter + ': ' + part.stars + ' из 5 звёзд'; }
  function fieldSeconds() { return attempt.questionIds.filter(id => byId[id].section === 'field').reduce((sum, id) => sum + (attempt.answers[id] ? attempt.answers[id].seconds || 0 : 0), 0); }
  function renderCommission() {
    screen = 'grading'; readyQuestionId = null; const run = ++commissionRun;
    page(`<main class="commission-screen"><section class="commission-card"><div class="commission-mark">ЭКЗАМЕНАЦИОННАЯ КОМИССИЯ</div><h1>Комиссия проверяет</h1><div class="commission-sheet" aria-hidden="true"><span class="commission-code"></span><span class="commission-sheet-label">Бланк ${escape(attempt.variant.slice(0, 6).toUpperCase())}</span><div class="scan-line"></div></div><div class="commission-status" role="status">Проверяем часть A…</div><div class="commission-progress" role="progressbar" aria-label="Проверка комиссией" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:0%"></i></div></section></main>`);
    window.scrollTo({ top: 0 });
    prepareStory().catch(() => {});
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const moments = reduced ? [80, 150, 250] : [800, 1700, 2800];
    moments.forEach((delay, index) => setTimeout(() => {
      if (run !== commissionRun || screen !== 'grading') return;
      if (index === 2) { haptic('medium'); return renderResult(true); }
      const fill = root.querySelector('.commission-progress > i'); if (fill) fill.style.width = (index === 0 ? 42 : 86) + '%';
      root.querySelector('.commission-progress').setAttribute('aria-valuenow', index === 0 ? '42' : '86');
      root.querySelector('.commission-status').textContent = index === 0 ? 'Проверяем часть B…' : 'Проверяем часть C…';

    }, delay));
  }
  function verdict() { return attempt.mode === 'practice' ? { cls: 'training', title: 'Тренировка завершена', detail: 'Учебный результат. В основном экзамене проходной балл — ' + PASS + '.' } : totalScore() >= PASS ? { cls: 'pass', title: 'Экзамен сдан', detail: 'Проходной балл — ' + PASS + '. Комиссия выдаёт допуск.' } : { cls: 'retry', title: 'Нужна пересдача', detail: 'Проходной балл — ' + PASS + '. До порога: +' + (PASS - totalScore()) + '.' }; }

  function renderResult(animate) {
    screen = 'result'; commissionRun++; attempt.phase = 'result'; save();
    const score = totalScore(), state = verdict(), ratingSummary = breakdown().map(sectionRatingText).join('. ') + '.';
    const review = attempt.questionIds.map((id, index) => {
      const source = byId[id], q = id === 'v10-c-explode'
        ? { ...source, goal: 'Уничтожить отмеченную цель', explanation: '12 баллов за уничтоженную цель после попаданий Узи. Одного повреждения недостаточно.' }
        : id === 'v10-c-escape' && attemptEdition() >= 16
          ? { ...source, goal: 'Угнать машину и доехать до РПГ', ammoLabel: '150 секунд', explanation: '5 баллов за угон, ещё 5 — за проезд по меткам до РПГ.' }
          : source;
      const a = attempt.answers[id] || { points: 0, value: null, seconds: 0 };
      const observation = E.streetObservation?.review(a.value?.observation);
      const observationHTML = observation ? '<div class="street-answer-review"><strong>' + escape(observation.title) + '</strong><p>Твой ответ: ' + escape(observation.chosen) + '</p><p>' + escape(observation.explanation) + '</p></div>' : '';
      return '<details class="review-item"><summary><span class="review-icon ' + (a.points === q.points ? 'good' : a.points ? 'partial' : 'bad') + '">' + (a.points === q.points ? '✓' : a.points ? '~' : '×') + '</span><span class="review-question"><small>' + (index + 1) + ' · ' + escape(q.game) + '</small><strong>' + escape(q.title || q.prompt) + '</strong></span><span class="review-points">' + a.points + '/' + q.points + '</span></summary><div class="review-body">' + (q.image ? '<img class="review-image" src="' + escape(q.image) + '" alt="' + escape(q.alt) + '" loading="lazy">' : '') + '<p><span class="muted">Твой ответ:</span> ' + escape(answerLabel(q, a.value)) + '</p><p class="correct-answer">' + (['rpg', 'vice'].includes(q.type) ? 'Цель: ' : 'Правильный ответ: ') + escape(correctLabel(q)) + '</p><p>' + escape(q.explanation) + '</p>' + observationHTML + sourcesHTML(q) + '</div></details>';
    }).join('');
    page(`<main class="result-page ${animate ? 'result-reveal' : ''}"><h1 class="visually-hidden">${state.title}: ${score} из 100</h1><p id="result-section-ratings" class="visually-hidden">${ratingSummary}</p><figure class="result-picture" aria-describedby="result-section-ratings"><div id="result-card-loading" class="result-card-loading" role="status"><span class="result-loading-seal result-save-seal" aria-hidden="true"><img src="assets/game-ui/save.png" width="48" height="48" alt=""></span><span>Готовим карточку…</span></div><img id="result-story-image" class="result-story-image" width="1080" height="1920" alt="${escape(attempt.nickname)} — ${score} из 100. ${state.title}. ${ratingSummary}" hidden><div id="result-card-error" class="result-card-error" hidden><p>Не удалось собрать карточку.</p><button class="secondary" data-action="story-retry">Попробовать ещё раз</button></div></figure><div id="result-share-actions" class="result-share-actions" aria-label="Поделиться результатом"></div><details class="result-review"><summary>Разбор ответов</summary><div class="review-list">${review}</div></details><button class="ghost result-again" data-action="new-ticket">${score >= PASS ? 'Сдать ещё раз' : 'Пересдать'} →</button></main>`, 'result-shell clean-shell');
    window.scrollTo({ top: 0 });
    showResultImage();
  }
  function resultShareActions() {
    const actions = document.getElementById('result-share-actions');
    if (!actions || screen !== 'result' || !storyCache) return;
    const telegram = nativeStoriesAvailable(), sharing = canShareStory();
    // Use a real, already-ready download link. Its href is the exact Blob
    // shown above; saving remains a direct browser gesture on mobile.
    const download = '<a class="' + (telegram || sharing ? 'secondary' : 'primary') + '" href="' + escape(storyCache.url) + '" download="' + escape(storyCache.file.name) + '">' + (telegram || sharing ? 'Сохранить карточку ↓' : 'Сохранить для сториз ↓') + '</a>';
    actions.innerHTML = (telegram ? '<button class="primary" data-action="telegram-story">В сториз Telegram →</button>' : sharing ? '<button class="primary" data-action="share">Поделиться →</button>' : '') + download;
  }
  function showResultImage() {
    if (screen !== 'result' || !attempt?.finishedAt) return Promise.resolve();
    const owner = attempt, request = ++resultImageRequest;
    const loading = document.getElementById('result-card-loading'), error = document.getElementById('result-card-error');
    if (error) error.hidden = true;
    if (!storyCache) {
      if (loading) loading.hidden = false;
      const image = document.getElementById('result-story-image'), actions = document.getElementById('result-share-actions');
      if (image) image.hidden = true;
      if (actions) actions.innerHTML = '';
    }
    return prepareStory().then(story => {
      if (attempt !== owner || screen !== 'result' || request !== resultImageRequest || story !== storyCache) return;
      const image = document.getElementById('result-story-image');
      if (!image) return;
      image.src = story.url; image.hidden = false;
      if (loading) loading.hidden = true;
      resultShareActions();
    }).catch(() => {
      if (attempt !== owner || screen !== 'result' || request !== resultImageRequest) return;
      if (loading) loading.hidden = true;
      if (error) error.hidden = false;
    });
  }
  function modal(html) { tick(); A.pauseClip(); if (rpgScene) rpgScene.setPaused(true); if (nativeScene) nativeScene.setPaused(true); dialog.innerHTML = '<div class="modal-content"><div class="modal-top"><span class="eyebrow">ЕГЭ / GTA</span><button class="icon-button" data-action="close-modal" aria-label="Закрыть окно">×</button></div>' + html + '</div>'; if (!dialog.open) dialog.showModal(); nativeAdvance?.sync(); syncPreload(); }
  function rules() { modal('<h2>Порядок проведения</h2><p><strong>' + questionCount() + ' заданий. Максимум 100. Проходной балл — ' + PASS + '.</strong></p><div class="sections">' + Object.keys(sections).map(key => sectionInfo(key)).map(part => '<div class="section-row"><span class="section-letter">' + part.letter + '</span><span class="section-copy"><strong>' + part.title + '</strong><small>' + tasksLabel(part.count) + '</small></span><strong>' + part.max + '</strong></div>').join('') + '</div><p>A — знакомые города и герои. B — радио, голоса, коды и игры по порядку. C откроется после теста.</p><p>Ответы принимаются по ходу экзамена. Правильность, баллы и звёзды за все части откроются после финала.</p><p>В интерактивных заданиях возможны частичные баллы. Записанный ответ изменить нельзя.</p><p>Время ответа в B не влияет на баллы. Ответы сохраняются. Музыку можно выключить кнопкой вверху. Правила части C откроются перед её началом.</p><p class="muted">Вопросы затрагивают сюжеты выпущенных игр. В заданиях на порядок указано, сравниваем события или выход игр.</p><button class="primary" data-action="close-modal">Порядок понятен →</button>'); }
  function about() { modal('<h2>ЕГЭ × GTA</h2><p>Фанатский экзамен о героях, местах и историях Grand Theft Auto. Вспоминаем любимые игры, знакомую музыку и истории создания серии.</p><p>Вопросы используют официальные материалы Rockstar и справочники серии. В разборе каждого задания есть источники. Источники кадров и фотографий указаны в разборе.</p><p>Из Telegram для оформления берём только имя и доступное фото профиля. Если фото скрыто, показываем инициал. Баллы, имя и черновик сохраняются в этом браузере.</p><p>Карточка 9:16 подходит для сториз. Её публикацию вы выбираете сами. Общего рейтинга в этой версии нет.</p><p class="muted">Проект не связан с Rockstar Games или государственным экзаменом. Игровые изображения принадлежат правообладателям.</p>'); }
  async function copy(text, message) { try { await navigator.clipboard.writeText(text); toast(message || 'Скопировано'); } catch (_) { modal('<h2>Ваш результат</h2><textarea class="copy-fallback" readonly>' + escape(text) + '</textarea><p>Выделите и скопируйте текст.</p>'); } }
  function resultText() {
    const line = window.GTAStory.resultLine?.({ score: totalScore(), passScore: PASS, sections: breakdown(), mode: attempt.mode });
    return attempt.nickname + ' — ' + totalScore() + '/100 на ЕГЭ по GTA. ' + (line || (attempt.mode === 'practice' ? 'Тренировка завершена.' : totalScore() >= PASS ? 'Экзамен сдан!' : 'Иду на пересдачу.')) + ' А ты сдашь лучше?';
  }
  function challengeURL() {
    const edition = attemptEdition();
    if (/^[a-z][a-z0-9_]{4,31}$/i.test(CONFIG.botUsername || '')) return 'https://t.me/' + CONFIG.botUsername + '?startapp=v' + edition + '_' + attempt.variant + '&mode=fullscreen';
    const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('variant', attempt.variant); url.searchParams.set('edition', edition); return url.toString();
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.hidden = true;
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }

  function resetStory() {
    if (storyCache) URL.revokeObjectURL(storyCache.url);
    storyCache = null; storyPromise = null; storyKey = ''; storyGeneration++; resultImageRequest++;
  }
  function decodeHighlight(value) {
    if (!validHighlight(value)) return Promise.resolve(null);
    return new Promise(resolve => {
      const image = new Image();
      let done = false;
      const finish = result => { if (done) return; done = true; clearTimeout(timeout); image.onload = image.onerror = null; resolve(result); };
      const timeout = setTimeout(() => finish(null), 1800);
      image.onload = () => finish(image.naturalWidth > 0 ? image : null);
      image.onerror = () => finish(null);
      image.src = value.dataUrl;
    });
  }
  function prepareStory() {
    if (!attempt || !attempt.finishedAt) return Promise.reject(new Error('No result'));
    const owner = attempt, highlight = validHighlight(owner.nativeHighlight) ? owner.nativeHighlight : null;
    const parts = breakdown();
    const key = [owner.startedAt, owner.finishedAt, owner.variant, owner.mode, totalScore(), parts.map(part => part.points + '/' + part.max).join(','), owner.nickname, telegramUser.photoUrl, !!avatarImage, highlight?.dataUrl || ''].join('|');
    if (storyCache?.key === key) return Promise.resolve(storyCache);
    if (storyPromise && storyKey === key) return storyPromise;
    storyKey = key;
    const generation = ++storyGeneration;
    const data = { name: owner.nickname, avatarImage: owner.nickname === telegramUser.name ? avatarImage : null, score: totalScore(), mode: owner.mode,
      sections: parts, passScore: PASS, botUsername: CONFIG.botUsername || '', highlight: highlight };
    const brand = window.GTAFinalBrand?.load?.() || Promise.resolve(null);
    const request = Promise.all([decodeHighlight(highlight), brand]).then(([highlightImage, brandImage]) => new Promise((resolve, reject) => {
      if (attempt !== owner || storyKey !== key || generation !== storyGeneration) return reject(new Error('Result changed'));
      try {
        const canvas = window.GTAStory.draw({ ...data, highlightImage, brandImage });
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('No story image'));
          if (attempt !== owner || storyKey !== key || generation !== storyGeneration) return reject(new Error('Result changed'));
          const previousURL = storyCache?.url;
          storyCache = { key, blob, file: new File([blob], 'gta-ege-story-' + data.score + '.png', { type: 'image/png' }), url: URL.createObjectURL(blob) };
          if (previousURL) setTimeout(() => URL.revokeObjectURL(previousURL), 1000);
          resolve(storyCache);
        }, 'image/png');
      } catch (error) { reject(error); }
    }));
    storyPromise = request.finally(() => { if (generation === storyGeneration) storyPromise = null; });
    return storyPromise;
  }
  function nativeStoriesAvailable() { return hasVersion('7.8') && typeof tg?.shareToStory === 'function' && !!safeHttps(CONFIG.storyUploadEndpoint); }
  function canShareStory() {
    try { return !!storyCache && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [storyCache.file] }); }
    catch (_) { return false; }
  }
  function openStory() {
    if (screen === 'result') return showResultImage();
    if (attempt?.finishedAt) renderResult(false);
  }
  function downloadStory() {
    // The picture is prepared before this tap: export the exact visible bytes.
    if (storyCache) { saveBlob(storyCache.blob, storyCache.file.name); return; }
    showResultImage();
  }
  function share() {
    if (!canShareStory()) return downloadStory();
    try {
      // No await before navigator.share: preserve the user's iOS activation.
      Promise.resolve(navigator.share({ files: [storyCache.file], title: 'ЕГЭ по GTA', text: resultText() })).catch(error => {
        if (error?.name !== 'AbortError') toast('Не получилось отправить. Картинку можно сохранить.');
      });
    } catch (_) { toast('Не получилось отправить. Картинку можно сохранить.'); }
  }
  async function telegramStory() {
    if (!nativeStoriesAvailable()) return share();
    if (!storyCache) return showResultImage();
    const button = root.querySelector('[data-action="telegram-story"]');
    if (button?.disabled) return;
    if (button) button.disabled = true;
    const owner = attempt, story = storyCache;
    try {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
      let response;
      try { response = await fetch(CONFIG.storyUploadEndpoint, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: story.blob, credentials: 'omit', signal: controller.signal }); }
      finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json(), url = safeHttps(data.url);
      if (!url) throw new Error('Missing HTTPS media');
      if (attempt !== owner || screen !== 'result' || story !== storyCache) return;
      tg.shareToStory(url, { text: resultText().slice(0, 200) });
    } catch (_) { if (attempt === owner && screen === 'result') toast('Редактор не открылся. Сохрани картинку для сториз.'); }
    finally { if (button?.isConnected) button.disabled = false; }
  }
  function tick() {
    syncPreload();
    const now = performance.now(), active = !storageConflict && !!attempt && !attempt.finishedAt && screen === 'question' && !document.hidden && !dialog.open && appActive && (!isTelegram() || tg.isActive !== false) && readyQuestionId === activeQuestion().id;
    const delta = E.elapsedDelta(lastTick, now, active); lastTick = now;
    if (active) { attempt.activeSeconds += delta; const q = activeQuestion(); if (!attempt.answers[q.id]) attempt.questionTimes[q.id] = (attempt.questionTimes[q.id] || 0) + delta; }
    if (screen === 'question' && attempt) { const q = activeQuestion(), timer = root.querySelector('[data-question-timer]'); if (timer) timer.textContent = formatTime(attempt.answers[q.id] ? attempt.answers[q.id].seconds : attempt.questionTimes[q.id]); }
  }
  function syncBackButton() { try { if (!hasVersion('6.1')) return; if (screen === 'home' || screen === 'grading') tg.BackButton.hide(); else tg.BackButton.show(); } catch (_) {} }
  function requestFullscreen(report) { try { if (!isTelegram()) return; tg.expand(); if (hasVersion('8.0') && !tg.isFullscreen) tg.requestFullscreen(); else if (report && !hasVersion('8.0')) toast('Этот клиент Telegram открывает расширенный режим'); } catch (_) { if (report) toast('Полный экран недоступен в этом клиенте'); } }
  function updateInsets() {
    if (!tg) return;
    if (window.GTATelegramLayout) window.GTATelegramLayout.update(tg);
    else {
      const safe = tg.safeAreaInset || {}, content = tg.contentSafeAreaInset || {};
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const systemInset = Math.max(0, Number(safe[side]) || 0), contentInset = Math.max(0, Number(content[side]) || 0);
        document.documentElement.style.setProperty('--gta-system-safe-' + side, systemInset + 'px');
        document.documentElement.style.setProperty('--gta-content-safe-' + side, contentInset + 'px');
        document.documentElement.style.setProperty('--tg-safe-' + side, (systemInset + contentInset) + 'px');
      }
    }
    const button = root.querySelector('[data-action="fullscreen"]'); if (button) button.hidden = !!tg.isFullscreen;
    document.documentElement.classList.toggle('tg-fullscreen', !!tg.isFullscreen);
  }
  function initTelegram() {
    const candidate = window.Telegram && window.Telegram.WebApp; if (!candidate || candidate === tg) return; tg = candidate;
    const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (user && isTelegram()) { telegramUser.name = typeof user.first_name === 'string' ? user.first_name.trim().slice(0, 28) : ''; telegramUser.photoUrl = safeHttps(user.photo_url); }
    if (telegramUser.photoUrl) { const image = new Image(); image.crossOrigin = 'anonymous'; image.referrerPolicy = 'no-referrer'; image.onload = () => { avatarImage = image; if (screen === 'result') showResultImage(); }; image.onerror = () => { avatarImage = null; }; image.src = telegramUser.photoUrl; }
    try {
      tg.ready(); if (isTelegram()) tg.expand();
      if (hasVersion('6.1')) { tg.setHeaderColor(hasVersion('6.9') ? '#fff0d8' : 'bg_color'); tg.setBackgroundColor('#fff0d8'); tg.BackButton.onClick(() => { tick(); save(); renderHome(); }); }
      if (window.GTATelegramLayout) window.GTATelegramLayout.connect(tg);
      else for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) tg.onEvent(event, updateInsets);
      updateInsets();
      tg.onEvent('fullscreenFailed', event => { if (!event || event.error !== 'ALREADY_FULLSCREEN') toast('Продолжайте в текущем окне Telegram'); updateInsets(); });
      tg.onEvent('activated', () => { appActive = true; lastTick = performance.now(); A.setAppActive(true); pauseRpg(); }); tg.onEvent('deactivated', () => { appActive = false; tick(); save(); A.setAppActive(false); pauseRpg(); }); syncBackButton();
    } catch (_) {}
    if (bank.length && screen === 'home') renderHome();
  }
  function resume() { if (!attempt) return; if (!attempt.finishedAt || attempt.phase === 'grading') A.start(false); if (dialog.open) dialog.close(); draft = null; caseStep = 0; if (attempt.phase === 'grading') renderCommission(); else if (attempt.finishedAt) renderResult(false); else if (attempt.phase === 'checkpoint') renderCheckpoint(); else if (attempt.phase === 'intro' || attempt.phase === 'cinematic') renderStageIntro(); else renderQuestion(); }
  function onClick(event) {
    const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (storageConflict && !['reload', 'force-start', 'close-modal', 'home', 'music-toggle', 'rules', 'about'].includes(action)) { recoverStorageConflict(); return; }
    if (performance.now() < acceptedTapUntil && ['choose', 'case-choose', 'case-next', 'case-step', 'submit', 'next', 'checkpoint-next', 'stage-enter', 'order-tap', 'order-undo', 'move'].includes(action)) return;
    if (action === 'home') { tick(); save(); renderHome(); }
    else if (action === 'mode') { const input = document.getElementById('nickname'); if (input) profile.nickname = input.value.trim(); homeMode = button.dataset.mode; renderHome(); }
    else if (action === 'start') begin(false);
    else if (action === 'force-start') { dialog.close(); begin(true); }
    else if (action === 'resume' || action === 'resume-close') resume();
    else if (action === 'cinema-skip') finishOpeningCinema();
    else if (action === 'stage-enter') { const stage = activeQuestion().section; if (!attempt.seenStages.includes(stage)) attempt.seenStages.push(stage); attempt.phase = 'question'; save(); renderQuestion(); }
    else if (action === 'choose') {
      if (!attempt || screen !== 'question') return;
      const q = activeQuestion();
      if (attempt.answers[q.id] || !q.options?.some(option => option.id === button.dataset.id)) return;
      draft = button.dataset.id; rememberDraft(); haptic();
      updateAudioChoice(q);
    }
    else if (action === 'case-choose') {
      if (screen !== 'question' || !attempt) return;
      const q = activeQuestion(), step = q.steps && q.steps.find(item => item.id === button.dataset.step);
      if (attempt.answers[q.id] || !step || !step.options.some(option => option.id === button.dataset.id)) return;
      tick(); draft[step.id] = button.dataset.id; rememberDraft(); haptic();
      if (step.presentation === 'evidence-scope' && window.GTAEvidenceScope && window.GTAEvidenceScope.update(root, step, draft[step.id], { locked: false, reveal: false })) {
        const nextButton = root.querySelector('[data-action="case-next"]');
        if (nextButton) nextButton.disabled = !E.ready(step, draft[step.id]);
        root.querySelectorAll('[data-action="case-step"]').forEach(tab => {
          const i = Number(tab.dataset.stepIndex), current = i === caseStep;
          tab.classList.toggle('active', current); tab.classList.toggle('done', !current && E.ready(q.steps[i], draft[q.steps[i].id]));
          tab.disabled = i > 0 && !q.steps.slice(0, i).every(item => E.ready(item, draft[item.id]));
        });
      } else renderQuestion(true);
    }
    else if (action === 'case-next' || action === 'case-step') { const q = activeQuestion(); const nextStep = action === 'case-next' ? caseStep + 1 : Number(button.dataset.stepIndex); if (nextStep >= 0 && nextStep < q.steps.length && (attempt.answers[q.id] || q.steps.slice(0, nextStep).every(step => E.ready(step, draft[step.id])))) { caseStep = nextStep; rememberDraft(); renderQuestion(true); root.querySelector('.case-page').scrollIntoView({ behavior: 'auto', block: 'nearest' }); } }
    else if (action === 'submit') submit();
    else if (action === 'next') { if (performance.now() >= acceptedTapUntil) next(); }
    else if (action === 'checkpoint-next') continueCheckpoint();
    else if (action === 'order-tap' || action === 'order-undo') {
      if (screen !== 'question' || !attempt) return;
      const q = activeQuestion();
      if (q.type !== 'order' || q.orderMode !== 'tap' || attempt.answers[q.id]) return;
      if (!Array.isArray(draft)) draft = [];
      if (action === 'order-undo') draft = draft.slice(0, -1);
      else {
        const id = button.dataset.id;
        if (!q.items.some(item => item.id === id)) return;
        draft = draft.includes(id) ? draft.filter(value => value !== id) : draft.concat(id);
      }
      rememberDraft(); haptic(); updateOrderChoice(q);
    }
    else if (action === 'move') { const from = Number(button.dataset.position), to = from + Number(button.dataset.direction); if (to >= 0 && to < draft.length) { [draft[from], draft[to]] = [draft[to], draft[from]]; rememberDraft(); haptic(); renderQuestion(true); } }
    else if (action === 'goto') { tick(); attempt.index = Number(button.dataset.index); draft = null; caseStep = 0; save(); renderQuestion(); }
    else if (action === 'music-toggle') { A.toggleMusic(); if (rpgScene) rpgScene.setMuted(!A.isEnabled()); if (nativeScene) nativeScene.setMuted(!!nativeScene.isWarmup?.() || !A.isEnabled()); }
    else if (action === 'native-finish') finishNative(false);
    else if (action === 'native-skip') finishNative(true);
    else if (action === 'native-reload') { releaseNative(); renderQuestion(); }
    else if (action === 'rpg-finish') finishRpg(false);
    else if (action === 'rpg-skip') finishRpg(true);
    else if (action === 'rpg-reload') renderQuestion();
    else if (action === 'audio-toggle') A.playClip(false);
    else if (action === 'audio-restart') A.playClip(true);
    else if (action === 'audio-retry') renderQuestion(true);
    else if (action === 'audio-memory') A.answerFromMemory();
    else if (action === 'rules') rules();
    else if (action === 'about') about();
    else if (action === 'view-cover') modal('<h2>Единый гангстерский экзамен</h2><img class="brand-cover-full" src="assets/brand-cover-rc45.png" width="1086" height="1448" alt="ЕГЭ по истории GTA — Сиджей с учебником"><div class="brand-downloads"><a class="secondary" href="assets/brand-cover-rc45.png" download="gta-ege-cover-final.png">Скачать обложку PNG</a></div>');
    else if (action === 'close-modal') dialog.close();
    else if (action === 'zoom') { const q = activeQuestion(); modal('<img class="image-full" src="' + escape(q.image) + '" alt="' + escape(q.alt) + '"><p class="fine-print">' + escape(q.imageCaption || 'Реальный игровой скриншот · © Rockstar Games') + '</p>'); }
    else if (action === 'retry-image') renderQuestion(true);
    else if (action === 'download') downloadStory();
    else if (action === 'share') share();
    else if (action === 'story') openStory();
    else if (action === 'story-retry') { resetStory(); showResultImage(); }
    else if (action === 'story-download') downloadStory();
    else if (action === 'telegram-story') telegramStory();
    else if (action === 'fullscreen') requestFullscreen(true);
    else if (action === 'copy-challenge') copy(resultText() + '\nТот же вариант: ' + challengeURL(), 'Вызов и ссылка на тот же вариант скопированы');
    else if (action === 'new-ticket') { clearLaunch(); homeMode = attempt.mode; begin(true); }
    else if (action === 'new-current-ticket') { if (dialog.open) dialog.close(); clearLaunch(); begin(false); }
    else if (action === 'expand-review') { const list = Array.from(root.querySelectorAll('.review-item')), open = list.some(el => !el.open); list.forEach(el => { el.open = open; }); button.textContent = open ? 'Свернуть всё' : 'Раскрыть всё'; }
    else if (action === 'reload') location.reload();
  }
  root.addEventListener('click', onClick); dialog.addEventListener('click', onClick);
  dialog.addEventListener('close', pauseRpg);
  root.addEventListener('change', event => {
    const control = event.target; if (!attempt || screen !== 'question' || attempt.answers[activeQuestion().id]) return;
    if (control.dataset.category) draft[control.dataset.category] = control.value;
    else if (control.dataset.match) { const value = control.value, key = control.dataset.match, target = control.dataset.case ? draft[control.dataset.case] : draft; if (value) { const other = Object.keys(target).find(k => k !== key && target[k] === value); if (other) target[other] = ''; } target[key] = value; }
    else return;
    const id = control.id; rememberDraft(); haptic(); renderQuestion(true); const next = document.getElementById(id); if (next) next.focus({ preventScroll: true });
  });
  root.addEventListener('error', event => { const image = event.target; if (image.dataset && image.dataset.avatar) { const fallback = document.createElement('span'); fallback.className = 'candidate-initial'; fallback.textContent = Array.from(telegramUser.name || 'У')[0]; image.replaceWith(fallback); } }, true);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  document.addEventListener('keydown', event => { if (screen !== 'question' || dialog.open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return; const q = activeQuestion(); if (attempt.answers[q.id]) return; if ((q.type === 'mcq' || q.type === 'image' || q.type === 'audio') && /^[1-4]$/.test(event.key)) { const option = shuffled(q.options, attempt.variant + q.id + 'options')[Number(event.key) - 1]; if (option) { draft = option.id; rememberDraft(); if (q.type === 'audio') updateAudioChoice(q); else renderQuestion(true); } } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastTick = performance.now(); tick(); save(); lastTick = performance.now(); pauseRpg(); }); window.addEventListener('pagehide', event => { if (event.persisted) { appActive = false; pauseRpg(); } else releaseNative(); window.GTANativePreload?.pause(); tick(); if (rpgScene && rpgOwner) { rpgOwner.rpgStates = rpgOwner.rpgStates || {}; rpgOwner.rpgStates[rpgQuestionId] = rpgScene.getState(); } save(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { lastTick = performance.now(); appActive = true; pauseRpg(); positionNative(); } });
  setInterval(tick, 250); setInterval(() => { if (attempt && !attempt.finishedAt && screen === 'question') save(); }, 3000);
  window.addEventListener('load', initTelegram);
  window.addEventListener('resize', positionNative); window.visualViewport?.addEventListener('resize', positionNative);
  window.GTAVicePortInteraction = () => requestFullscreen(false);
  window.GTANativePreload?.subscribe(state => { updatePreload(state); nativeWarm?.setPreload(state); });
  A.configure({ notice: toast });
  async function boot() {
    try {
      const questions = await Boot.loadQuestions('questions.json');
      if (Boot.getState().phase === 'failed') return;
      bank = E.prepareBank(questions, [...window.GTAExamContent.finalQuestions, ...window.GTAExamContent.russiaQuestions, ...(window.GTAExamContent.easyQuestions || []), ...(window.GTAExamRadioQuestions || []), ...(window.GTAExamPracticalQuestions || []), ...(window.GTAExamRC2Questions || []), ...(window.GTAExamRC3Questions || [])]);
      if (window.GTAExamNetlifyLegacyQuestions) bank.push(...window.GTAExamNetlifyLegacyQuestions.create(bank));
      byId = Object.fromEntries(bank.map(q => [q.id, q]));
      profile = read(PROFILE_KEY) || {}; const saved = read(SESSION_KEY);
      if (saved && saved.version === VERSION && saved.questionIds && [12, 16].includes(saved.questionIds.length) && saved.questionIds.every(id => byId[id]) && saved.answers && saved.questionTimes && saved.drafts && saved.caseSteps && Array.isArray(saved.seenStages) && typeof saved.index === 'number' && saved.index >= 0 && saved.index < saved.questionIds.length) attempt = saved;
      if (attempt && !Array.isArray(attempt.completedCheckpoints)) attempt.completedCheckpoints = ['theory', 'field'].filter(section => attempt.index > lastIndexOfSection(section));
      initTelegram(); renderHome(); Boot.ready();
      // Two frames leave one visible cover paint before optional work can be
      // scheduled. The loaders then honor media, input, visibility and network.
      requestAnimationFrame(() => requestAnimationFrame(() => { entryReady = true; syncPreload(); }));
    } catch (error) {
      console.error('GTA exam bootstrap failed:', error);
      Boot.fail(error);
    }
  }
  boot();
})();
