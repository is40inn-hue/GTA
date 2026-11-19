'use strict';
(function () {
  const $ = id => document.getElementById(id), canvas = $('canvas');
  const params = new URLSearchParams(location.search), session = params.get('session') || '';
  const legacy8 = params.get('legacyEdition') === '8';
  const legacy9 = params.get('legacyEdition') === '9' || params.get('edition') === '9';
  const sequence10 = !legacy8 && !legacy9 && params.get('legacy') !== '1';
  const examMode = params.get('exam') === '1';
  let warmup = examMode && params.get('warmup') === '1';
  const storyExam = sequence10 && examMode;
  const flow = window.GTAPracticeFlow, continuous = params.get('flow') === '1' && !!flow;
  const briefingClock = flow?.createCountdown(), transitionClock = flow?.createCountdown();
  document.body.dataset.exam = String(examMode);
  document.body.dataset.embedded = String(parent !== window);
  document.body.dataset.walkControls = String(!legacy8 && params.get('legacy') !== '1');
  document.body.dataset.continuous = String(continuous);
  const validScene = value => Number.isInteger(value) && value >= 1 && value <= 3;
  let desiredScene = validScene(Number(params.get('scene'))) ? Number(params.get('scene')) : 1;
  const screens = ['native-intro', 'native-loading', 'native-briefing', 'native-error', 'native-complete', 'native-pause-screen', 'native-street-question'];
  if(sequence10){ const route=document.querySelector('.mission-route'); route.setAttribute('aria-label','Пять действий практики'); route.innerHTML=[1,2,3,4,5].map(n=>'<span data-beat="'+n+'">'+n+'</span>').join(''); }
  const state = { engine: 'vice-city-wasm', version: legacy8 || params.get('legacy') === '1' ? 2 : 3, scene: desiredScene, stage: 'idle', warmup: warmup, ammo: 0, ammoInitial: 0, targetCount: 0, weapon: null, frames: 0 };
  let disposed = false, externalPause = false, pageSuspended = false, muted = true, aiming = false, abi = -1, contract = null;
  let started = false, nativePaused = false, firePressed = false, shotPending = false, burstStartAmmo = 0, burstSize = 1, lastShot = 0;
  let manifest, fileAbort = null, watchdog = null, statusTimer = null, toastTimer = null, keyboardTimer = null, prepareTimer = null, scriptBlobURL = null;
  let visibleWait = 0, lastTick = performance.now(), lastEnter = 0, lastScan = 0, lastReport = '', finishAt = 0;
  let pendingPrepare = true, awaitingSequence = 0, pendingResult = null;
  let streetQuestionResult = null, arrivalChoices = new Set();
  let releasePreparedSession = null;
  let seamlessHandoff = false;
  let briefingHeld = false, manualPause = false, pausedStage = null;
  let idleWait = 0;
  const launch = { build: 19, step: 'browser', graphics: 'unknown', runtime: false, main: false, frame: false, received: 0, total: 0, code: '', detail: '' };
  const launchLabels = { browser: 'Проверяем графику', cache: 'Готовимся к загрузке', files: 'Загружаем город', engine: 'Открываем город', scene: 'Готовим сцену' };
  const results = new Map(), reported = new Set(), nativeKeys = new WeakSet(), nativeMouseEvents = new WeakSet();
  const preparationWaiters = new Set();
  const warmSettle = { frames: 0, nativeStart: 0, activeMs: 0, lastFrame: 0 };
  const baseURL = new URL('runtime/', location.href);
  const clone = value => JSON.parse(JSON.stringify(value));
  const highlightCapture = window.GTAHighlightCapture?.create({ canvas: canvas,
    onHighlight: value => notify('highlight', { version: 1, highlight: value }) });
  const radar = window.GTAHudRadar?.create({ element: $('native-radar'), canvas: $('radar-canvas'), label: $('radar-caption') });
  const carKeys = new Set(), dragResets = [];
  const aimMotion = window.GTAAimMotion.create();
  const driveInput = window.GTADriveInput.create({ onKey: (code, down) => nativeKey(code, down) });
  let driveMode = false;
  const keyMap = {KeyW:['w',87],KeyA:['a',65],KeyS:['s',83],KeyD:['d',68],KeyF:['f',70],Space:[' ',32]};
  function canWalk() { return !legacy8 && params.get('legacy') !== '1'; }
  function carScene() { return sceneConfig(desiredScene)?.action === 'hijack'; }
  function nativeKey(code,down) {
    if (!keyMap[code] || (down && carKeys.has(code))) return;
    if (down) carKeys.add(code); else carKeys.delete(code);
    const [key,n] = keyMap[code], e = new KeyboardEvent(down?'keydown':'keyup',{key,code,keyCode:n,which:n,bubbles:true,cancelable:true});
    nativeKeys.add(e);document.dispatchEvent(e);
  }
  function releaseCar(movementOnly=false) {
    joyPointer=null;joyCenter=null;
    if (movementOnly && driveMode) driveInput.releaseSteering();
    else { driveInput.clear(); for (const key of [...carKeys]) if(!movementOnly || ['KeyW','KeyA','KeyS','KeyD'].includes(key))nativeKey(key,false); }
    const knob=$('drive-knob'); if(knob)knob.style.transform='translate(-50%,-50%)';
  }
  function syncDriveMode() {
    const next = carScene() && state.inCar === true;
    if (next !== driveMode) { release(); driveMode = next; }
    document.body.dataset.driving = String(next);
  }
  function sceneConfig(number) { return contract?.scenes.find(scene => scene.scene === number); }
  function snapshot() { return clone(state); }
  function notify(type, extra) { if (parent !== window) parent.postMessage(Object.assign({ type: 'vice:' + type, session: session }, extra || {}), location.origin); }
  function setStage(stage) { state.stage = stage; document.body.dataset.nativeState = stage; if (!['playing', 'finishing'].includes(stage)) radar?.hide(); notify('state', { state: snapshot() }); }
  function show(id) { screens.forEach(name => { $(name).hidden = name !== id; }); }
  function toast(message) { $('native-toast').textContent = message; $('native-toast').className = 'visible'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('native-toast').className = ''; }, 2600); }
  const examNotices = new Set();
  function examNotice(key, message) {
    const id = desiredScene + ':' + key;
    if (examNotices.has(id)) return;
    examNotices.add(id); toast(message);
  }
  function noticeNativeProgress(heap, slot, config, phase) {
    if (![contract.phases.playing, contract.phases.complete].includes(phase)) return;
    // Read confirmed native target flags only; notices never award points.
    let credited = 0;
    for (let index = 0; index < config.targetCount; index++) {
      if (heap[abi + slot['target' + index + '_credited']] === 1) credited++;
    }
    if (storyExam && phase === contract.phases.playing && state.stage === 'playing' && !inactive() && $('native-toast').className !== 'visible') {
      if (desiredScene === 1) {
        if (state.arrivalStage === 2) examNotice('crew-exit', 'Рация: к тебе гости. Смотри перед вертолётом.');
        else if (state.arrivalStage === 4) examNotice('street-brawl', 'Местный: «Ты кого привёз?!»');
        else if (state.escapeEntered && !state.pickupCollected) examNotice('pudge-bike', 'Пудж нашёл байк. Ему уже не до экзамена.');
        else if (state.pickupCollected) examNotice('pickup', 'Узи в руках. Освободи выезд.');
      }
      if (desiredScene === 2) {
        if (state.routeStage === 4) examNotice('rpg-ahead', 'Рация: РПГ впереди. Почти приехали.');
        else if (state.routeStage === 2) examNotice('seafront', 'Рация: дальше по набережной. Не останавливайся.');
        else if (slot.chaseStage !== undefined && heap[abi + slot.chaseStage] === 1 && slot.chaseHeli !== undefined && heap[abi + slot.chaseHeli] >= 0) examNotice('air-pursuit', 'Рация: воздух подключился.');
        else if (state.policeAlert) examNotice('commission-en-route', 'Рация: патруль за тобой.');
      }
    }
    if (carScene() && !storyExam) { if (slot.policeAlert !== undefined && heap[abi + slot.policeAlert] === 1) examNotice('hijacked', 'Патруль заметил угон. Выезжай со двора.'); else if(heap[abi+slot.hijacked]===1)examNotice('hijacked','За рулём. Теперь выезжай со двора.'); return; }
    if (carScene()) return;
    if (!examMode && credited > 0) examNotice('hit-' + credited, 'Цель поражена · ' + credited + '/' + config.targetCount);
    if (phase === contract.phases.playing && state.ammo === 1 && credited < config.targetCount && $('native-toast').className !== 'visible') {
      const lastTargetInAir = !sequence10 || desiredScene === 3 && [0, 1].every(index => heap[abi + slot['target' + index + '_credited']] === 1 || heap[abi + slot['target' + index + '_destroyed']] === 1) && heap[abi + slot.target2_destroyed] !== 1;
      examNotice('last-ammo', config.weapon === 30 ? (lastTargetInAir ? 'Последняя ракета. Дождись прохода.' : 'Последняя ракета. Цель у метки.') : 'Последний патрон. Выбирай цель.');
    }
  }
  function progress(message, value) {
    $('load-status').textContent = message;
    if (Number.isFinite(value)) {
      const percent = Math.min(100, Math.max(0, Math.floor(value)));
      $('load-progress').value = percent;
      if ($('load-percent')) $('load-percent').textContent = percent + '%';
    } else {
      $('load-progress').removeAttribute('value');
      if ($('load-percent')) $('load-percent').textContent = '';
    }
  }
  function launchStep(step, message, value) {
    launch.step = step; idleWait = 0;
    $('native-loading').dataset.loadStep = step;
    document.body.dataset.loadStep = step;
    $('load-step').textContent = ({ browser: 'Готовим площадку', cache: 'Продолжаем подготовку', files: 'Готовим город', engine: 'Открываем город', scene: 'Занимаем стартовую позицию' })[step];
    progress(message, step === 'files' ? value : undefined);
  }
  function safeDetail(value) {
    const file = typeof value?.path === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,120}$/.test(value.path) ? ' · файл: ' + value.path : '';
    const status = Number.isInteger(value?.status) && value.status >= 400 && value.status < 600 ? ' · HTTP ' + value.status : '';
    return String(value?.message || value || '').replace(/https?:\/\/\S+/g, '[URL]').replace(/blob:\S+/g, '[модуль]').slice(0, 240) + status + file;
  }
  function diagnosticText() {
    return ['Запуск практики · v' + launch.build, 'Код: ' + (launch.code || 'нет'), 'Этап: ' + launchLabels[launch.step],
      '3D: ' + launch.graphics, 'Файлы: ' + Math.round(launch.received / 1048576) + ' / ' + Math.ceil(launch.total / 1048576) + ' МБ',
      'Движок: ' + (launch.runtime ? 'инициализирован' : 'не инициализирован'), 'Сцена: С' + desiredScene,
      'Главный цикл: ' + (launch.frame ? 'запущен' : launch.main ? 'main запущен' : 'не запущен'),
      'Протокол сцены: ' + (abi >= 0 ? 'подключён' : 'не подключён'), launch.detail ? 'Причина: ' + launch.detail : ''].filter(Boolean).join('\n');
  }
  function checkLaunch() { if (disposed || state.stage === 'error' || fileAbort?.signal.aborted) throw Object.assign(new Error('Launch cancelled'), { name: 'AbortError' }); }
  function wakePreparation() {
    if (warmup && !pageActive() && !disposed && state.stage !== 'error') return;
    for (const resolve of preparationWaiters) resolve();
    preparationWaiters.clear();
  }
  async function preparationTurn() {
    checkLaunch();
    // Byte cache preparation belongs to the parent. Once cached, this pass may
    // assemble/compile/install it, yielding between batches if A/B media wins.
    while (warmup && !pageActive()) {
      await new Promise(resolve => preparationWaiters.add(resolve));
      checkLaunch();
    }
  }
  function startWatchdog() {
    lastTick = performance.now(); visibleWait = idleWait = 0;
    watchdog = setInterval(() => {
      const now = performance.now(), dt = Math.min(now - lastTick, 2000); lastTick = now;
      if (inactive()) return;
      if (state.stage === 'loading') {
        idleWait += dt;
        if (idleWait > 45000) fail('Загрузка остановилась. Проверь соединение и попробуй ещё раз.', { code: 'C-FILES-TIMEOUT' });
      } else if (['engine', 'preparing', 'starting'].includes(state.stage)) {
        visibleWait += dt; readNative();
        if (state.stage === 'error') return;
        if (abi < 0 && now - lastEnter > 1800 && document.body.dataset.stateMenu !== '0') { lastEnter = now; keyEnter(); }
        if (visibleWait > 100000 && ['engine', 'preparing', 'starting'].includes(state.stage)) fail('Не удалось открыть сцену. Попробуй ещё раз. Если не получится, скопируй сведения об ошибке.', { code: launch.runtime ? 'C-SCENE-TIMEOUT' : 'C-ENGINE-TIMEOUT' });
      }
    }, 500);
  }
  function pageActive() { return !disposed && !externalPause && !pageSuspended && !document.hidden; }
  function inactive() { return !pageActive() || manualPause || ['briefing', 'warmed', 'error', 'complete', 'observation'].includes(state.stage); }
  function audioInactive() { return warmup || inactive() || !['playing', 'finishing'].includes(state.stage); }
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Context = window[name]; if (!Context) continue;
    window[name] = class extends Context {
      constructor(...args) { super(...args); if (muted || audioInactive()) super.suspend().catch(() => {}); }
      resume() { return muted || audioInactive() ? Promise.resolve() : super.resume(); }
    };
  }
  function audioContexts() { return new Set([window.Module?.SDL2?.audioContext, ...Object.values(window.AL?.contexts || {}).map(c => c.audioCtx)].filter(Boolean)); }
  function syncAudio() {
    for (const context of audioContexts()) {
      if (context.state === 'closed') continue;
      try { if (muted || audioInactive()) { if (context.state === 'running') context.suspend().catch(() => {}); } else if (context.state === 'suspended') context.resume().catch(() => {}); } catch (_) {}
    }
  }
  function mouse(type, button, dx, dy) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: button || 0, buttons: (aiming ? 2 : 0) | (firePressed ? 1 : 0), clientX: innerWidth / 2, clientY: innerHeight / 2, movementX: dx || 0, movementY: dy || 0 });
    nativeMouseEvents.add(event); canvas.dispatchEvent(event);
  }
  function stopFire() { shotPending = false; if (firePressed) { firePressed = false; mouse('mouseup', 0); } }
  function setAim(value) {
    value = !warmup && !carScene() && !!value && state.stage === 'playing' && !inactive();
    if (!value) aimMotion.clear();
    if (aiming === value) return;
    aiming = value; mouse(value ? 'mousedown' : 'mouseup', 2);
    $('native-aim').setAttribute('aria-pressed', String(value));
    $('range-instruction').textContent = value ? 'Наведи прицел. Двигай пальцем по сцене.' : 'Прицел → наведи на цель → выстрел';
  }
  function release() { aimMotion.clear(); stopFire(); setAim(false); releaseCar(); for(const reset of dragResets)reset(); }
  function synchronizePause() {
    wakePreparation();
    if (inactive()) highlightCapture?.pause();
    if (warmup) warmSettle.lastFrame = 0;
    briefingClock?.sync(); transitionClock?.sync();
    if (inactive()) {
      release();
      if (!nativePaused && window.MainLoop?.func && window.Module?.pauseMainLoop) { window.Module.pauseMainLoop(); nativePaused = true; }
    } else if (nativePaused && window.Module?.resumeMainLoop) { window.Module.resumeMainLoop(); nativePaused = false; }
    lastTick = performance.now(); syncAudio();
  }
  function fail(message, details) {
    if (disposed || state.stage === 'error') return;
    briefingClock?.cancel(); transitionClock?.cancel(); manualPause = false;
    details = details || {}; launch.code = details.code || 'C-SCENE'; launch.detail = safeDetail(details.detail || launch.detail);
    state.errorCode = launch.code;
    setStage('error'); fileAbort?.abort(); release(); synchronizePause();
    $('car-controls').hidden = $('range-controls').hidden = $('range-hud').hidden = $('range-instruction').hidden = true;
    $('native-pause').hidden = true;
    $('error-detail').textContent = message;
    $('error-code').textContent = launch.code + ' · запуск v' + launch.build;
    $('error-diagnostic').textContent = diagnosticText();
    $('error-browser-help').hidden = !['C-GPU', 'C-GPU-CONTEXT'].includes(launch.code);
    $('error-open').href = new URL('../rpg/', location.href).href;
    show('native-error'); notify('error', { message: message, code: launch.code, scene: desiredScene });
    clearInterval(watchdog); clearInterval(statusTimer); clearTimeout(keyboardTimer);
  }
  function startInteraction() { if (warmup || disposed) return; canvas.focus?.({ preventScroll: true }); try { parent.GTAVicePortInteraction?.(); } catch (_) {} syncAudio(); notify('interaction'); }
  function keyEnter() {
    function send(type) { const event = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }); nativeKeys.add(event); document.dispatchEvent(event); }
    send('keydown'); keyboardTimer = setTimeout(() => send('keyup'), 220);
  }
  function move(dx, dy) { aimMotion.push(dx, dy, aiming && !inactive()); }
  function fire() {
    if (warmup) return;
    startInteraction();
    if (carScene() || sequence10 && state.pickupCollected === false || state.stage !== 'playing' || inactive() || state.ammo <= 0 || shotPending) return;
    if (!aiming) setAim(true);
    burstStartAmmo = state.ammo; burstSize = Math.min(sceneConfig(desiredScene).burst, state.ammo);
    shotPending = true; lastShot = performance.now(); $('native-fire').disabled = true;
  }
  function connectDrag(element, toggle) {
    let pointer = null, previous = null, distance = 0;
    dragResets.push(()=>{pointer=null;previous=null;distance=0;});
    element.addEventListener('pointerdown', event => {
      if (carScene() || event.button !== 0 || pointer !== null || state.stage !== 'playing' || inactive()) return;
      startInteraction(); event.preventDefault(); pointer = event.pointerId; previous = [event.clientX, event.clientY]; distance = 0; element.setPointerCapture(pointer);
    });
    element.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer || !previous) return;
      const dx = event.clientX - previous[0], dy = event.clientY - previous[1]; distance += Math.abs(dx) + Math.abs(dy); previous = [event.clientX, event.clientY];
      if (distance > 5 && !aiming) setAim(true);
      const touch = canWalk() && event.pointerType === 'touch';
      move(dx * (touch ? 0.6 : 1), dy * (touch ? 0.35 : 1));
    });
    function up(event) { if (event.pointerId !== pointer) return; if (event.type !== 'pointerup') aimMotion.clear(); const clicked = event.type === 'pointerup' && distance < 6; pointer = null; previous = null; if (clicked && toggle) setAim(!aiming); }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => element.addEventListener(type, up));
  }
  connectDrag(canvas, false); connectDrag($('native-aim'), true);
  $('native-aim').addEventListener('click', event => { if (event.detail === 0) { startInteraction(); setAim(!aiming); } });
  $('native-fire').addEventListener('click', fire);
  ['mousedown', 'mouseup', 'mousemove'].forEach(type => window.addEventListener(type, event => { if (!nativeMouseEvents.has(event)) event.stopImmediatePropagation(); }, true));
  // The pointer bridge owns gameplay touches. Do not also feed raw SDL touch input.
  ['touchstart','touchmove','touchend','touchcancel'].forEach(type=>window.addEventListener(type,event=>{
    if(event.target===canvas || event.target.closest?.('#range-controls,#car-controls'))event.stopImmediatePropagation();
  },{capture:true,passive:true}));
  window.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('keydown', event => {
    if (nativeKeys.has(event)) return;
    if (warmup) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.target.closest?.('button,a,summary') && ['Space','Enter'].includes(event.code)) { event.stopImmediatePropagation(); return; }
    if (driveMode && ['KeyW','KeyA','KeyS','KeyD'].includes(event.code)) { event.preventDefault();event.stopImmediatePropagation(); if(!inactive()&&state.stage==='playing'){startInteraction();driveInput.key(event.code,true);}return; }
    if((carScene() || (canWalk() && ['KeyW','KeyA','KeyS','KeyD'].includes(event.code))) && keyMap[event.code]) { event.preventDefault();event.stopImmediatePropagation(); if(!inactive() && state.stage==='playing') {startInteraction();nativeKey(event.code,true);} return;}
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'KeyF', 'KeyE', 'KeyQ'].includes(event.code)) {
      if (event.target.closest('button,a,summary') && ['Space', 'Enter'].includes(event.code)) { event.stopImmediatePropagation(); return; }
      event.preventDefault(); event.stopImmediatePropagation(); if (event.repeat || inactive()) return;
      if (event.code === 'Space') fire();
      if (event.code === (canWalk() ? 'KeyQ' : 'KeyA')) { startInteraction(); setAim(!aiming); }
      if (event.code === 'ArrowLeft') move(-4, 0); if (event.code === 'ArrowRight') move(4, 0);
      if (event.code === 'ArrowUp') move(0, -3); if (event.code === 'ArrowDown') move(0, 3);
    }
  }, true);
  window.addEventListener('keyup', event => { if(nativeKeys.has(event))return; if(warmup){event.stopImmediatePropagation();return;} if(driveMode&&['KeyW','KeyA','KeyS','KeyD'].includes(event.code))driveInput.key(event.code,false);else if(keyMap[event.code])nativeKey(event.code,false);event.stopImmediatePropagation(); }, true);
  const joystick=$('drive-stick'); let joyPointer=null,joyCenter=null,joyRadius=43;
  function updateJoystick(event) {
    const x=event.clientX-joyCenter[0],y=driveMode?0:event.clientY-joyCenter[1],max=joyRadius;
    const nx=Math.max(-max,Math.min(max,x)),ny=Math.max(-max,Math.min(max,y));
    $('drive-knob').style.transform=`translate(calc(-50% + ${nx}px),calc(-50% + ${ny}px))`;
    if (driveMode) { driveInput.steer(nx/max); return; }
    for(const [code,on] of Object.entries({KeyA:nx < -13,KeyD:nx>13,KeyW:ny < -13,KeyS:ny>13})) { if(on)nativeKey(code,true);else if(carKeys.has(code))nativeKey(code,false); }
  }
  joystick.addEventListener('pointerdown',e=>{if(e.button!==0||!(carScene()||canWalk())||inactive()||state.stage!=='playing'||joyPointer!==null)return;e.preventDefault();startInteraction();joyPointer=e.pointerId;const r=joystick.getBoundingClientRect();joyRadius=driveMode?Math.max(32,Math.min(50,r.width*.32)):43;joyCenter=driveMode?[e.clientX,e.clientY]:[r.x+r.width/2,r.y+r.height/2];joystick.setPointerCapture(joyPointer);updateJoystick(e);});
  joystick.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer){e.preventDefault();updateJoystick(e);}});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>joystick.addEventListener(type,e=>{if(e.pointerId===joyPointer){joyPointer=null;releaseCar(true);}}));
  const pedalOwners = { gas: null, brake: null };
  function resetPedal(name) {
    pedalOwners[name]=null; $('drive-'+name)?.setAttribute('aria-pressed','false');
    if(name==='gas')driveInput.setGas(false);else driveInput.setBrake(false);
  }
  function bindPedal(name) {
    const el=$('drive-'+name); if(!el)return;
    dragResets.push(()=>resetPedal(name));
    el.addEventListener('pointerdown',e=>{
      if(e.button!==0||pedalOwners[name]!==null||!driveMode||inactive()||state.stage!=='playing'||el.hidden)return;
      if(name==='gas'&&pedalOwners.brake!==null)return;
      e.preventDefault();startInteraction();
      if(name==='brake')resetPedal('gas');
      pedalOwners[name]=e.pointerId;el.setPointerCapture(e.pointerId);el.setAttribute('aria-pressed','true');
      if(name==='gas')driveInput.setGas(true);else driveInput.setBrake(true);
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>el.addEventListener(type,e=>{
      if(e.pointerId===pedalOwners[name])resetPedal(name);
    }));
  }
  bindPedal('gas');bindPedal('brake');
  // Enter is immediate on foot. Exiting takes a deliberate short hold so a
  // stray thumb cannot throw the player out while reaching for the pedals.
  const enterButton=$('drive-enter'); let enterOwner=null,enterHoldTimer=null,enterPulseTimer=null,enterLast=-Infinity;
  function resetEnter() {
    enterOwner=null;clearTimeout(enterHoldTimer);clearTimeout(enterPulseTimer);
    enterHoldTimer=enterPulseTimer=null;enterButton.dataset.holding='false';nativeKey('KeyF',false);
  }
  function pressEnter() {
    if(inactive()||state.stage!=='playing'||!carScene()||performance.now()-enterLast<700)return;
    enterLast=performance.now();
    releaseCar();resetPedal('gas');resetPedal('brake');nativeKey('KeyF',true);
    enterPulseTimer=setTimeout(()=>{enterPulseTimer=null;nativeKey('KeyF',false);},120);
  }
  dragResets.push(resetEnter);
  enterButton.addEventListener('pointerdown',e=>{
    if(e.button!==0||enterOwner!==null||!carScene()||inactive()||state.stage!=='playing'||enterButton.hidden)return;
    e.preventDefault();startInteraction();enterOwner=e.pointerId;enterButton.setPointerCapture(enterOwner);
    if(driveMode){enterButton.dataset.holding='true';enterHoldTimer=setTimeout(()=>{enterHoldTimer=null;pressEnter();},450);}
    else pressEnter();
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>enterButton.addEventListener(type,e=>{
    if(e.pointerId!==enterOwner)return;
    if(type==='pointerup'&&enterPulseTimer!==null){enterOwner=null;clearTimeout(enterHoldTimer);enterHoldTimer=null;enterButton.dataset.holding='false';}
    else resetEnter();
  }));
  enterButton.addEventListener('click',e=>{if(e.detail===0){startInteraction();pressEnter();}});
  canvas.requestPointerLock = () => Promise.resolve();
  function sendCommand(command, scene) {
    if (abi < 0 || !contract || !window.HEAP32 || disposed) return false;
    const heap = window.HEAP32, slot = contract.slots;
    const sequence = Math.max(heap[abi + slot.commandSeq], heap[abi + slot.ackSeq]) + 1;
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= 2147483647) { fail('Сеанс завершён. Открой практику заново.'); return false; }
    // These three mailbox slots are the only native-memory writes performed by JS.
    heap[abi + slot.requestedScene] = scene;
    heap[abi + slot.command] = command;
    heap[abi + slot.commandSeq] = sequence;
    awaitingSequence = sequence; visibleWait = 0; return true;
  }
  function updateSceneCopy() {
    document.body.dataset.scene = String(desiredScene);
    $('intro-scene').textContent = 'Практическое задание / С' + desiredScene;
    const config = sceneConfig(desiredScene); if (!config) return;
    const flying = desiredScene === 3 && params.get('legacy') !== '1';
    const patrol = desiredScene === 2 && config.targetModel === 156;
    const heading = sequence10 ? config.title : canWalk() ? ['Угон', 'Взрыв', 'Воздушная цель'][desiredScene-1] : desiredScene === 1 ? 'Пристрелка' : desiredScene === 2 ? patrol ? 'Перекрытие' : 'Контроль очереди' : flying ? 'Воздушная цель' : 'Тяжёлый билет';
    const objective = sequence10 ? config.instruction : canWalk() ? ['Забери машину и выезжай со двора', 'Взорви красную машину', 'Сбей вертолёт из РПГ'][desiredScene-1] : desiredScene === 1 ? 'Повреди две разные машины' : desiredScene === 2 ? patrol ? 'Повреди три патрульные машины' : 'Повреди три разные машины' : flying ? 'Сбей вертолёт из РПГ' : 'Уничтожь две машины';
    $('briefing-title').textContent = config.title; $('briefing-instruction').textContent = config.instruction;
    $('briefing-criterion').textContent = config.criterion;
    $('briefing-ammo').textContent = config.action === 'hijack' ? (config.timeLimitSeconds || 90) + ' секунд' : config.ammo + (desiredScene === 3 ? (config.ammo === 3 ? ' ракеты' : ' ракет') : ' патронов');
    $('briefing-targets').textContent = config.targetCount + (config.targetCount === 1 ? ' цель' : ' цели');
    $('native-scene-label').textContent = 'С' + desiredScene + ' / ' + (sequence10 ? config.title : canWalk() ? ['Забери машину','Взорви машину','Сбей вертолёт'][desiredScene-1] : config.weaponName);
    $('mission-heading').textContent = 'С' + desiredScene + ' / 3 · ' + heading;
    $('mission-objective').textContent = objective;
    const timed = flying || sequence10 && carScene(), seconds = config.timeLimitSeconds || 90;
    $('mission-time').hidden = !timed;
    if (timed) { $('mission-time').textContent = 'Осталось ' + String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); $('mission-time').setAttribute('aria-label', 'Осталось ' + seconds + ' секунд'); }
    $('fire-label').textContent = config.weapon === 23 ? 'Очередь' : 'Выстрел';
    $('fire-detail').textContent = config.weapon === 23 ? 'Тап — короткая очередь' : 'Тап — один выстрел';
  }
  function setScene(number) {
    number = Number(number); if (!validScene(number) || disposed) return false;
    if (number === desiredScene) return true;
    if (warmup) return false;
    if (['playing', 'starting', 'finishing', 'paused', 'observation'].includes(state.stage)) return false;
    briefingClock?.cancel(); transitionClock?.cancel(); briefingHeld = manualPause = false; pausedStage = null;
    seamlessHandoff = continuous && started && number === desiredScene + 1 && results.has(desiredScene);
    release(); desiredScene = number; state.scene = number; delete state.result;
    delete state.timeRemaining;
    $('native-pause').hidden = true; $('range-hud').hidden = $('range-controls').hidden = $('range-instruction').hidden = true;
    state.ammo = state.ammoInitial = state.targetCount = 0; state.weapon = null;
    pendingResult = null; streetQuestionResult = null; arrivalChoices.clear(); state.cameoSeen = false; state.arrivalPudgeSeen = state.arrivalSteveSeen = false; finishAt = 0; lastReport = ''; awaitingSequence = 0; pendingPrepare = true; updateSceneCopy();
    if (started) {
      setStage('preparing');
      if (seamlessHandoff) { show(null); $('range-hud').hidden = $('range-instruction').hidden = false; $('range-instruction').textContent = sceneConfig(number).instruction; }
      else show('native-loading');
      launchStep('scene', 'Подготавливаем задание С' + number + '…', 100);
      if (abi >= 0) pendingPrepare = !sendCommand(contract.commands.prepare, number);
      synchronizePause();
    } else { setStage('idle'); show('native-intro'); }
    notify('scene', { scene: number }); return true;
  }
  function startScene() {
    if (warmup || state.stage !== 'briefing' || disposed || externalPause || pageSuspended || document.hidden) return false;
    startInteraction();
    if (!sendCommand(contract.commands.start, desiredScene)) return false;
    briefingClock?.cancel(); briefingHeld = false;
    setStage('starting'); $('native-begin').disabled = true; synchronizePause(); return true;
  }
  function beginBriefing() {
    if (warmup) return;
    briefingHeld = false; $('briefing-pause').hidden = !continuous;
    $('briefing-pause').textContent = 'Пауза';
    $('briefing-countdown').hidden = !continuous;
    if (!continuous) return;
    if (storyExam) {
      // The city has already been prepared and visually settled behind A/B.
      // Reveal that same canvas without adding a second three-second briefing.
      show(null); $('range-hud').hidden = $('range-instruction').hidden = false;
      if (startScene()) return;
    }
    const number = desiredScene;
    briefingClock.start({ durationMs: storyExam || seamlessHandoff ? 0 : 3000,
      isCurrent: () => !disposed && state.stage === 'briefing' && desiredScene === number,
      isActive: () => pageActive() && !briefingHeld,
      onTick: value => { $('briefing-countdown').textContent = value.paused ? 'Старт приостановлен' : 'Старт через ' + value.seconds; },
      onComplete: startScene
    });
  }
  function activate() {
    if (disposed || state.stage === 'error') return false;
    if (!warmup) return true;
    warmup = false; state.warmup = false;
    if (state.stage === 'warmed') {
      setStage('briefing'); show('native-briefing'); synchronizePause(); beginBriefing();
      notify('ready', { scene: desiredScene });
    } else { synchronizePause(); notify('state', { state: snapshot() }); }
    return true;
  }
  function pauseScene() {
    if (manualPause || !['playing', 'finishing'].includes(state.stage)) return;
    pausedStage = state.stage; manualPause = true; release(); setStage('paused');
    $('car-controls').hidden = $('range-controls').hidden = $('range-instruction').hidden = $('native-pause').hidden = true;
    $('native-pause-title').textContent = 'Практика на паузе'; show('native-pause-screen'); synchronizePause();
  }
  function resumeScene() {
    if (!manualPause || !pageActive()) return;
    manualPause = false; setStage(pausedStage || 'playing'); pausedStage = null; show(null);
    $('range-instruction').hidden = $('native-pause').hidden = false; $('range-controls').hidden = carScene(); $('car-controls').hidden = !canWalk(); synchronizePause();
  }
  function readResult(heap, slot, config) {
    const value = name => heap[abi + slot[name]];
    if(config.action==='hijack') {
      if(value('completed')!==1||value('scene')!==config.scene||value('weapon')!==0||value('ammo')!==0)return null;
      const hijacked=value('hijacked'),driveCompleted=value('driveCompleted'),outcome=value('outcome');
      if(![0,1].includes(hijacked)||![0,1].includes(driveCompleted)||driveCompleted>hijacked||![1,3,4].includes(outcome)||outcome===1&&!driveCompleted||outcome!==1&&driveCompleted)return null;
      return {engine:'vice-city-wasm',version:3,scene:config.scene,completed:true,outcome:({1:'cleared',3:'timeout',4:'lost'})[outcome],ammoInitial:0,ammoRemaining:0,targets:[],milestones:{hijacked:hijacked===1,driveCompleted:driveCompleted===1}};
    }
    const flyingTarget = config.scene === 3 && params.get('legacy') !== '1';
    if (value('completed') !== 1 || value('scene') !== config.scene || value('targetCount') !== config.targetCount || value('weapon') !== config.weapon || value('ammoInitial') !== config.ammo) return null;
    const ammo = value('ammo'); if (ammo < 0 || ammo > config.ammo) return null;
    const targets = [];
    for (let index = 0; index < config.targetCount; index++) {
      const health = value('target' + index + '_health'), credited = value('target' + index + '_credited'), destroyed = value('target' + index + '_destroyed');
      if (health < -100000 || health > 1000 || ![0, 1].includes(credited) || ![0, 1].includes(destroyed)) return null;
      if (config.action === 'destroy' && credited && !destroyed) return null;
      if (config.scene < 3 && credited && health >= 1000) return null;
      if (config.scene === 3 && (flyingTarget ? credited && !destroyed : credited !== destroyed)) return null;
      targets.push({ credited: credited === 1, destroyed: destroyed === 1, health: health });
    }
    const all = targets.every(target => target.credited), outcome = value('outcome');
    if (![1, 2, ...((flyingTarget || sequence10) ? [3, 4] : [])].includes(outcome) || outcome === 1 && !all || outcome === 2 && (ammo !== 0 || all)) return null;
    if (!sequence10 && (outcome === 3 || outcome === 4) && targets.some(target => target.credited)) return null;
    if (!sequence10 && outcome === 4 && !targets.every(target => target.destroyed)) return null;
    return { engine: 'vice-city-wasm', version: contract.version, scene: config.scene, completed: true, outcome: ({ 1: 'cleared', 2: 'ammo', 3: 'timeout', 4: 'lost' })[outcome], ammoInitial: config.ammo, ammoRemaining: ammo, targets: targets };
  }
  function askStreetQuestion(result) {
    if (!sequence10 || warmup || result.scene !== 1 || !state.arrivalPudgeSeen || !state.arrivalSteveSeen ||
        result.observation || results.has(1) || !window.GTAExam?.streetObservation || !$('native-street-question')) return false;
    streetQuestionResult = clone(result);
    arrivalChoices.clear(); updateArrivalChoices();
    briefingClock?.cancel(); transitionClock?.cancel(); release();
    setStage('observation'); synchronizePause();
    clearTimeout(toastTimer); $('native-toast').className = '';
    $('native-pause').hidden = $('range-controls').hidden = $('car-controls').hidden = $('range-instruction').hidden = true;
    show('native-street-question');
    $('street-question-title').focus?.({ preventScroll: true });
    return true;
  }
  function updateArrivalChoices() {
    for (const choice of Object.keys(window.GTAExam?.streetObservation?.arrivalChoices || {})) {
      const button = $('arrival-answer-' + choice);
      if (button) button.setAttribute('aria-pressed', String(arrivalChoices.has(choice)));
    }
    const confirm = $('arrival-confirm');
    if (confirm) { confirm.disabled = arrivalChoices.size !== 2; confirm.textContent = 'Ответить · ' + arrivalChoices.size + ' / 2'; }
  }
  function selectArrivalChoice(choice) {
    if (disposed || warmup || !pageActive() || state.stage !== 'observation' || !streetQuestionResult) return;
    if (!Object.prototype.hasOwnProperty.call(window.GTAExam.streetObservation.arrivalChoices, choice)) return;
    if (arrivalChoices.has(choice)) arrivalChoices.delete(choice);
    else if (arrivalChoices.size < 2) arrivalChoices.add(choice);
    updateArrivalChoices();
  }
  function answerStreetQuestion(skip) {
    if (disposed || warmup || !pageActive() || state.stage !== 'observation' || !streetQuestionResult || !skip && arrivalChoices.size !== 2) return;
    const observation = window.GTAExam.streetObservation.read({ id: window.GTAExam.streetObservation.arrivalId, choices: skip ? [] : Array.from(arrivalChoices) });
    if (!observation) return;
    // Commit once, then hand the original native result to the usual owner.
    // No correctness feedback or additional points appear during the route.
    const result = streetQuestionResult; streetQuestionResult = null;
    result.observation = observation;
    complete(result);
  }
  function complete(result) {
    if (disposed || state.stage === 'complete' || result.scene !== desiredScene) return;
    if (state.stage === 'observation' && streetQuestionResult) return;
    if (askStreetQuestion(result)) return;
    const existing = results.get(result.scene);
    // SCM restores only native facts when revisiting a completed scene. Keep
    // its already confirmed UI answer, but still compare every native field.
    // An explicitly different observation is not replaced or accepted here.
    if (existing?.observation && result.observation === undefined) {
      result = Object.assign({}, result, { observation: clone(existing.observation) });
    }
    if (existing && JSON.stringify(existing) !== JSON.stringify(result)) { fail('Не удалось проверить результат задания. Открой практику заново.'); return; }
    results.set(result.scene, clone(result)); state.result = clone(result);
    briefingClock?.cancel(); setStage('complete'); release(); synchronizePause(); clearTimeout(toastTimer); $('native-toast').className = '';
    $('native-pause').hidden = true;
    $('complete-title').textContent = desiredScene === 3 ? 'Практика завершена.' : 'Этап С' + desiredScene + ' завершён.';
    $('complete-detail').textContent = examMode ? 'Оценку объявит комиссия.' : 'Результат сохранён.';
    const observationReview = $('complete-observation');
    if (observationReview) {
      const remembered = !examMode && desiredScene === 3 ? window.GTAExam?.streetObservation?.review(results.get(1)?.observation || results.get(2)?.observation) : null;
      observationReview.hidden = !remembered;
      observationReview.textContent = remembered ? remembered.explanation + ' Твой ответ: ' + remembered.chosen + '.' : '';
    }
    const rating = $('complete-rating');
    if (rating) {
      rating.hidden = examMode || !sequence10 || desiredScene !== 3;
      if (!rating.hidden) {
        let points = 0, maximum = 0;
        for (const config of contract.scenes) {
          maximum += config.action === 'hijack' ? config.pointsPerTarget * 2 : config.targetPoints ? config.targetPoints.reduce((sum, value) => sum + value, 0) : config.pointsPerTarget * config.targetCount;
          const earned = results.get(config.scene); if (!earned) continue;
          if (config.action === 'hijack') points += config.pointsPerTarget * (Number(earned.milestones?.hijacked === true) + Number(earned.milestones?.driveCompleted === true));
          else earned.targets.forEach((target, index) => { if (target.credited) points += config.targetPoints?.[index] ?? config.pointsPerTarget; });
        }
        const stars = window.GTAExam.sectionRating(points, maximum);
        rating.setAttribute('aria-label', 'Часть C: ' + points + ' из ' + maximum + ' баллов, ' + stars + ' из 5 звёзд');
        rating.innerHTML = '<span aria-hidden="true">' + '★'.repeat(stars) + '<i>' + '☆'.repeat(5 - stars) + '</i></span><small>' + points + ' / ' + maximum + ' · часть C</small>';
      }
    }
    $('complete-next-label').textContent = sequence10 ? (desiredScene===1?(storyExam?'Рация: за руль. РПГ дальше по набережной.':'Копы рядом. Пора за руль.'):desiredScene===2?(storyExam?'Рация: РПГ у метки. Последний рывок.':'Последний аргумент — РПГ.'):examMode?'Передаём работу комиссии.':'Заезд завершён.') : desiredScene === 1 ? params.get('legacy') === '1' ? 'Дальше — контроль очереди.' : canWalk() ? 'Следом — взрыв.' : 'Следом — перекрытие.' : desiredScene === 2 ? params.get('legacy') === '1' ? 'Финал: тяжёлый билет.' : 'Финал: воздушная цель.' : examMode ? 'Передаём работу комиссии.' : 'Заезд завершён.';
    $('complete-countdown').hidden = !continuous || (!examMode && desiredScene === 3);
    $('complete-countdown').textContent = desiredScene === 3 ? 'Подводим итог…' : 'Следующий этап начнётся автоматически.';
    if (!examMode && (result.outcome === 'timeout' || result.outcome === 'lost')) {
      const reason = sequence10 ? (result.outcome==='timeout'?'Время вышло. Выполненные действия сохранены.':'Заезд прерван. Выполненные действия сохранены.') : result.scene === 1 ? 'Поездка завершена. Выполненные действия сохранены.' : result.outcome === 'timeout' ? 'Время вышло. Попадание не засчитано.' : 'Вертолёт разбился без попадания РПГ. Не засчитано.';
      $('complete-detail').textContent = reason + ' Можно пройти практику ещё раз.';
    }
    $('native-next').hidden = examMode || desiredScene === 3; $('native-again').hidden = examMode || desiredScene !== 3;
    $('native-next').textContent = continuous ? 'Продолжить сейчас →' : 'К заданию С' + Math.min(3, desiredScene + 1) + ' →';
    $('car-controls').hidden = $('range-controls').hidden = $('range-instruction').hidden = true; show(continuous && desiredScene < 3 ? null : 'native-complete');
    if (continuous && desiredScene < 3) { $('range-hud').hidden = $('range-instruction').hidden = false; $('range-instruction').textContent = $('complete-next-label').textContent; }
    if (!reported.has(result.scene)) { reported.add(result.scene); notify('complete', { result: clone(result) }); }
    if (continuous && !examMode && desiredScene < 3) {
      const number = desiredScene;
      transitionClock.start({ durationMs: 0,
        isCurrent: () => !disposed && state.stage === 'complete' && desiredScene === number,
        isActive: pageActive,
        onTick: value => { $('complete-countdown').textContent = value.paused ? 'Переход приостановлен' : 'Следующая сцена через ' + value.seconds; },
        onComplete: () => setScene(number + 1)
      });
    }
  }
  function sequenceObjective(heap, slot, config) {
    if (desiredScene === 1) {
      if (!state.pickupReady && state.arrivalStage === 1) return 'Вертолёт садится прямо перед тобой.';
      if (!state.pickupReady && state.arrivalStage === 2) return 'Экипаж выходит. Смотри перед вертолётом.';
      if (!state.pickupReady && state.arrivalStage === 3) return 'Гости бегут к тебе. Будь начеку.';
      if (!state.pickupReady && state.arrivalStage === 4) return 'Гости не поделили дорогу. Смотри за ними.';
      if (!state.pickupReady && state.escapeEntered) return 'Пудж уезжает. Смотри на байк.';
      if (!state.pickupReady && state.escapeState > 0) return 'Пудж заметил мотоцикл. Смотри за ним.';
      return state.pickupCollected ? (config.targetModel === 217 ? 'Взорви вертолёт у красной метки.' : 'Взорви машину у красной метки.') : 'Подбери Узи у красной метки.';
    }
    if (desiredScene === 2) {
      if (!state.inCar) return state.hijacked ? 'Вернись за руль. Нажми «Сесть».' : 'Подойди к двери. Нажми «Сесть».';
      if (state.routeStage === 1) return 'Держись правее трамплина. Езжай к метке.';
      if (state.routeStage === 2) return 'Дальше по набережной. Просто держи газ.';
      if (state.routeStage === 3) return 'За поворотом — РПГ. Продолжай ехать.';
      if (state.routeStage === 4) return 'Доезжай до последней метки. РПГ там.';
      return 'По набережной к красной метке.';
    }
    if (!state.pickupCollected) return 'Подбери РПГ у красной метки.';
    // Follow native progress even if the player takes the targets out of order.
    // This is guidance only: the native packet remains the sole score source.
    const remaining = index => heap[abi + slot['target' + index + '_credited']] !== 1 && heap[abi + slot['target' + index + '_destroyed']] !== 1;
    const groundTargets = [0, 1].filter(remaining).length;
    if (groundTargets === 2) return 'Взорви машину у красной метки.';
    if (groundTargets === 1) return 'Осталась одна машина. Взорви её.';
    if (remaining(2)) return 'Теперь вверх. Сбей вертолёт.';
    return 'Практика завершена.';
  }
  function readNative(renderedFrame) {
    if (!contract || !window.HEAP32 || disposed || manualPause || state.stage === 'observation') return;
    const heap = window.HEAP32, now = performance.now(), slot = contract.slots;
    if (abi < 0 && now - lastScan > 500) {
      lastScan = now; let index = heap.indexOf(contract.magic[0]);
      while (index >= 0) {
        if (heap[index + 1] === contract.magic[1] && heap[index + 2] === contract.version && heap[index + slot.phase] >= -1 && heap[index + slot.phase] <= 4) { abi = index; break; }
        index = heap.indexOf(contract.magic[0], index + 1);
      }
    }
    if (abi < 0) return;
    if (heap[abi] !== contract.magic[0] || heap[abi + 1] !== contract.magic[1] || heap[abi + 2] !== contract.version) { fail('Игровой сеанс прерван. Открой практику заново.'); return; }
    const phase = heap[abi + slot.phase];
    if (phase === contract.phases.error) { fail('Не удалось загрузить сцену. Попробуй ещё раз.', { code: 'C-MODELS' }); return; }
    if (warmup && [contract.phases.playing, contract.phases.complete].includes(phase)) {
      fail('Не удалось подготовить сцену. Попробуй открыть её ещё раз.', { code: 'C-WARMUP' }); return;
    }
    if (launch.step !== 'scene') launchStep('scene', 'Собираем задание С' + desiredScene + '…', 99);
    if (pendingPrepare && heap[abi + slot.heartbeat] > 0) pendingPrepare = !sendCommand(contract.commands.prepare, desiredScene);
    if (pendingPrepare || heap[abi + slot.ackSeq] < awaitingSequence || heap[abi + slot.scene] !== desiredScene) return;
    const config = sceneConfig(desiredScene), ammo = heap[abi + slot.ammo];
    if (ammo < 0 || ammo > config.ammo || heap[abi + slot.targetCount] !== config.targetCount) return;
    state.ammo = ammo; state.ammoInitial = config.ammo; state.targetCount = config.targetCount;
    state.version=contract.version;state.inCar=slot.inCar!==undefined&&heap[abi+slot.inCar]===1;state.hijacked=slot.hijacked!==undefined&&heap[abi+slot.hijacked]===1;state.wanted=slot.wanted!==undefined?heap[abi+slot.wanted]:0;
    syncDriveMode();
    state.missionHeat = sequence10 && slot.missionHeat !== undefined ? Math.max(0,Math.min(5,heap[abi + slot.missionHeat])) : 0;
    const heat=$('mission-heat');heat.hidden=state.missionHeat===0;heat.setAttribute('aria-label','Тревога: '+state.missionHeat+' из 5');heat.innerHTML='★'.repeat(state.missionHeat)+'<span class=idle>'+ '★'.repeat(5-state.missionHeat)+'</span>';
    state.pickupCollected = slot.pickupCollected === undefined || heap[abi + slot.pickupCollected] === 1;
    state.policeAlert = slot.policeAlert !== undefined && heap[abi + slot.policeAlert] === 1;
    state.routeStage = sequence10 && slot.routeStage !== undefined ? Math.max(0, Math.min(4, heap[abi + slot.routeStage])) : 0;
    state.arrivalStage = sequence10 && slot.arrivalStage !== undefined ? Math.max(0, Math.min(7, heap[abi + slot.arrivalStage])) : 0;
    state.escapeState = sequence10 && desiredScene === 1 && slot.escapeState !== undefined ? Math.max(0, Math.min(7, heap[abi + slot.escapeState])) : 0;
    state.escapeEntered = sequence10 && desiredScene === 1 && slot.escapeEntered !== undefined && heap[abi + slot.escapeEntered] === 1;
    state.cameoSeen = sequence10 && desiredScene === 2 && slot.cameoSeen !== undefined && heap[abi + slot.cameoSeen] === 1;
    state.arrivalPudgeSeen = sequence10 && desiredScene === 1 && slot.arrivalPudgeSeen !== undefined && heap[abi + slot.arrivalPudgeSeen] === 1;
    state.arrivalSteveSeen = sequence10 && desiredScene === 1 && slot.arrivalSteveSeen !== undefined && heap[abi + slot.arrivalSteveSeen] === 1;
    state.pickupReady = slot.pickup === undefined || heap[abi + slot.pickup] >= 0 || state.pickupCollected;
    state.weapon = heap[abi + slot.currentWeapon]; state.frames = heap[abi + slot.heartbeat];
    if (sequence10 && !warmup && ['playing', 'finishing'].includes(state.stage) && !inactive()) radar?.update(window.GTAHudRadar.readPacket(heap, abi, contract), now, config.weapon);
    else radar?.hide();
    if (shotPending && burstStartAmmo - ammo >= burstSize) stopFire();
    if (shotPending && now - lastShot > 6000) { stopFire(); toast('Выстрел не выполнен. Наведи прицел и попробуй ещё раз.'); }
    $('native-ammo').textContent = sequence10 && desiredScene === 1 && !state.pickupReady ? (state.escapeEntered ? 'Гость уезжает' : state.escapeState > 0 ? 'Побег на байке' : 'Высадка') : sequence10 && !state.pickupCollected ? 'Подбери '+config.weaponName : carScene() ? (state.policeAlert?'Патруль рядом':state.hijacked?'За рулём':'Машина во дворе') : config.weaponName + ' · ' + ammo + ' / ' + config.ammo;
    $('car-controls').hidden=!(carScene()||canWalk())||state.stage!=='playing';
    $('drive-enter').hidden=!carScene(); $('drive-brake').hidden=!driveMode; if($('drive-gas'))$('drive-gas').hidden=!driveMode;
    joystick.setAttribute('aria-label',driveMode?'Руль: тяни влево или вправо':'Джойстик движения');
    if(!carScene()) $('range-instruction').textContent=sequence10 && desiredScene===1 && !state.pickupReady?'Смотри вперёд. Можно двигаться джойстиком.':sequence10 && state.pickupCollected===false?'Джойстик слева — шагни к метке.':canWalk()?(aiming?'Тяни прицел. Нажми «'+$('fire-label').textContent+'».':'Движение слева. Прицел и '+(config.weapon===23?'очередь':'выстрел')+' справа.'):'Прицел → наведи на цель → выстрел';
    if(carScene()) { $('native-scene-label').textContent='С'+desiredScene+(state.hijacked?' / Уходи от погони':' / Забери машину');$('range-controls').hidden=true;$('drive-enter').textContent=state.inCar?'Удержи: выйти':'Сесть';$('range-instruction').textContent=state.inCar?'Руль слева. Справа — газ и тормоз / назад.':'Подойди к водительской двери. Нажми «Сесть».'; }
    if(sequence10){
      const beat=desiredScene===1?(state.pickupCollected?2:1):desiredScene===2?(state.hijacked?4:3):5;
      const titles=[!state.pickupReady?'Нежданные гости':'Подбери оружие','Первый взрыв','Забери машину','Уходи от погони','Последний аргумент'];
      $('native-scene-label').textContent='ПРАКТИКА';$('mission-heading').textContent=beat+' / 5 · '+titles[beat-1];
      $('mission-objective').textContent=sequenceObjective(heap,slot,config);
      document.querySelectorAll('[data-beat]').forEach(el=>el.classList.toggle('active',Number(el.dataset.beat)===beat));
    }
    if ((desiredScene === 3 || sequence10 && carScene()) && params.get('legacy') !== '1' && [contract.phases.playing, contract.phases.complete].includes(phase)) {
      const remaining = Math.max(0, Math.min(config.timeLimitSeconds || 90, Math.ceil((heap[abi + slot.sceneDeadline] - heap[abi + slot.nativeTimer]) / 1000)));
      state.timeRemaining = remaining;
      $('mission-time').textContent = 'Осталось ' + String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
      $('mission-time').setAttribute('aria-label', 'Осталось ' + remaining + ' секунд');
      $('mission-time').dataset.urgent = String(remaining <= 15);
    }
    if (phase === contract.phases.briefing && (state.weapon === config.weapon || sequence10) && state.frames > 0 && !['briefing', 'warmed', 'starting'].includes(state.stage)) {
      if (warmup) {
        if (!launch.frame || renderedFrame !== true) return;
        // SCM prepare fades in for 400 ms after entering briefing. Give it 600
        // ms of real native AND active rendered time before parking the city.
        // The first two frames refresh the game-clock anchor after SCM's WAIT.
        const nativeNow = heap[abi + slot.nativeTimer];
        const elapsed = warmSettle.lastFrame ? Math.max(0, Math.min(100, now - warmSettle.lastFrame)) : 0;
        warmSettle.lastFrame = now; warmSettle.frames++;
        if (warmSettle.frames <= 2 || nativeNow < warmSettle.nativeStart) {
          warmSettle.nativeStart = nativeNow; warmSettle.activeMs = 0; return;
        }
        warmSettle.activeMs += elapsed;
        if (warmSettle.frames < 5 || warmSettle.activeMs < 600 || nativeNow - warmSettle.nativeStart < 600) return;
      }
      updateSceneCopy(); $('native-begin').disabled = false;
      setStage(warmup ? 'warmed' : 'briefing'); show(warmup || seamlessHandoff ? null : 'native-briefing'); synchronizePause();
      if (warmup) notify('warmed', { scene: desiredScene });
      else { beginBriefing(); notify('ready', { scene: desiredScene }); }
    }
    if (phase === contract.phases.playing && (state.weapon === config.weapon || sequence10) && state.frames > 0 && ['starting', 'briefing', 'preparing', 'engine'].includes(state.stage)) {
      setStage('playing'); show(null); if (!storyExam || desiredScene === 1) examNotice('start', storyExam?'Смотри вперёд. Вертолёт идёт на посадку.':sequence10?config.instruction:canWalk()?['Забери машину. Затем выезжай со двора.','Взорви красную машину. Можно подойти ближе.','Сбей вертолёт. Он пролетит снова.'][desiredScene-1]:'Комиссия наблюдает. Удачи.'); $('range-hud').hidden = $('range-instruction').hidden = false;$('range-controls').hidden=carScene();$('car-controls').hidden=!(carScene()||canWalk()); $('native-pause').hidden = false; syncAudio();
    }
    if (state.stage === 'playing' || state.stage === 'finishing') noticeNativeProgress(heap, slot, config, phase);
    $('native-fire').disabled = state.stage !== 'playing' || sequence10 && state.pickupCollected === false || ammo === 0 || shotPending;
    if (phase === contract.phases.complete) {
      const result = readResult(heap, slot, config);
      if (!result) { fail('Не удалось проверить результат. Открой практику заново.'); return; }
      if (!pendingResult) { pendingResult = result; finishAt = now + (results.has(desiredScene) ? 0 : desiredScene === 3 ? 1800 : 650); release(); setStage('finishing'); }
      if (renderedFrame === true) captureNativeHighlight(heap, slot, config);
      if (now >= finishAt) complete(pendingResult);
    } else if (renderedFrame === true && phase === contract.phases.playing) captureNativeHighlight(heap, slot, config);
    const report = JSON.stringify([state.stage, state.scene, state.ammo, state.weapon, state.result]);
    if (report !== lastReport) { lastReport = report; notify('state', { state: snapshot() }); }
  }
  function captureNativeHighlight(heap, slot, config) {
    if (!highlightCapture || disposed || warmup || !pageActive() || manualPause) return;
    // This is reached only from the validated native packet in postMainLoop.
    // Capture precedes any complete packet, so a parent may dispose immediately.
    const targets = Array.from({ length: config.action === 'hijack' ? 0 : config.targetCount }, (_, index) => ({
      credited: heap[abi + slot['target' + index + '_credited']] === 1,
      destroyed: heap[abi + slot['target' + index + '_destroyed']] === 1
    }));
    highlightCapture.frame({ rendered: true, scene: desiredScene, stage: state.stage,
      warmup: warmup, active: pageActive() && !manualPause, targets: targets });
  }
  async function sha(bytes) { const hash = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''); }
  function installAudioRouting() {
    const audioPaths = new Map(manifest.audio.files.map(file => [file.originalPath, file.path])), open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, input, ...args) {
      let url = String(input), path = null;
      if (url.startsWith('https://cdn.dos.zone/vcsky/fetched/')) path = '/remote/' + url.slice('https://cdn.dos.zone/vcsky/fetched/'.length).replaceAll('\\', '/').toLowerCase();
      else if (url.startsWith('/remote/')) path = url.split(/[?#]/, 1)[0];
      if (path?.startsWith('/remote/models/')) url = new URL(path.slice(1), baseURL).href;
      if (path?.startsWith('/remote/audio/')) url = new URL(audioPaths.get(path) || manifest.audio.fallback.path, baseURL).href;
      return open.call(this, method, url, ...args);
    };
  }
  async function begin() {
    if (started || disposed) return; started = true; startInteraction();
    setStage('loading'); show('native-loading');
    if (!examMode) { $('loading-route').hidden = true; $('load-footnote').textContent = 'Задание начнётся, когда город будет готов.'; $('load-title').innerHTML = 'Следующая остановка —<br>Vice City.'; }
    launchStep('browser', 'Сейчас продолжим.', 0);
    fileAbort = new AbortController(); startWatchdog();
    try {
      await preparationTurn();
      const probe = document.createElement('canvas');
      probe.addEventListener('webglcontextcreationerror', event => { launch.detail = safeDetail(event.statusMessage); });
      // These are the exact attributes requested by this WASM's first EGL context.
      // WebGL 1 is not a fallback supported by the packaged Vice City build.
      const gl = probe.getContext('webgl2', { alpha: false, depth: true, stencil: true, antialias: false });
      launch.graphics = gl ? 'WebGL 2' : 'WebGL 2 unavailable';
      if (!gl) {
        fail('Не удалось запустить 3D-сцену. Попробуй открыть практику в Safari или Chrome.', { code: 'C-GPU' }); return;
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      launchStep('cache', 'Проверяем, что уже готово.', 0);
      let assets = window.GTANativeAssets;
      try { await parent.GTANativePreload?.pause(); assets = parent.GTANativeAssets || assets; } catch (_) {}
      await preparationTurn();
      if (!assets) throw new Error('Native asset loader unavailable');
      launchStep('files', 'Продолжаем подготовку города.');
      const onActivity = () => { if (!disposed && state.stage === 'loading') idleWait = 0; };
      manifest = await assets.loadManifest({ signal: fileAbort.signal, onActivity: onActivity });
      await preparationTurn();
      const configResponse = await fetch(params.get('legacy') === '1' ? 'range-legacy-config.json' : legacy8 ? 'range-v8-config.json' : legacy9 ? 'range-v9-config.json' : 'range-config.json', { signal: fileAbort.signal, cache: 'no-cache', priority: warmup ? 'low' : 'high' }); if (!configResponse.ok) throw new Error('Scene config unavailable'); contract = await configResponse.json();
      if (![2,3].includes(contract.version) || contract.scenes.length !== 3 || !contract.scenes.every(scene => validScene(scene.scene))) throw new Error('Unsupported scene contract');
      const sceneFile = params.get('legacy') === '1' ? 'range-legacy.scm' : legacy8 ? 'range-v8.scm' : legacy9 ? 'range-v9.scm' : 'range.scm';
      const [sceneResponse, iniResponse] = await Promise.all([fetch(sceneFile + '?v=' + contract.sha256, { signal: fileAbort.signal, priority: warmup ? 'low' : 'high' }), fetch('revc.ini', { signal: fileAbort.signal, priority: warmup ? 'low' : 'high' })]);
      if (!sceneResponse.ok || !iniResponse.ok) throw new Error('Scene data unavailable');
      const scene = new Uint8Array(await sceneResponse.arrayBuffer()), ini = new TextEncoder().encode(await iniResponse.text());
      if (scene.length !== contract.size || await sha(scene) !== contract.sha256) throw new Error('Scene integrity check failed');
      await preparationTurn();
      const districtManifest = sequence10 ? await assets.loadDistrictManifest({signal:fileAbort.signal}) : null;
      const modelFiles = manifest.models?.files || [];
      if (!modelFiles.length) throw new Error('Native model manifest unavailable');
      const logicalFiles = [manifest.data, manifest.engine.wasm, manifest.engine.js, ...modelFiles, ...(districtManifest?.files || [])];
      const seed = assets.preparedSnapshot?.(logicalFiles);
      const total = manifest.data.size + manifest.engine.wasm.size + manifest.engine.js.size + manifest.models.size + (districtManifest?.size || 0), loaded = new Map(Object.entries(seed?.files || {}));
      launch.received = seed?.loadedBytes || 0;
      launch.total = total; idleWait = 0;
      progress('Готовим город для твоего выхода.', launch.received / total * 100);
      const onBytes = event => {
        if (disposed || state.stage === 'error') return;
        const previous = loaded.get(event.path) || 0; loaded.set(event.path, Math.max(previous, event.loaded));
        if (event.loaded > previous) idleWait = 0;
        launch.received = Array.from(loaded.values()).reduce((sum, value) => sum + value, 0);
        progress('Готовим город для твоего выхода.', launch.received / total * 100);
      };
      const options = { signal: fileAbort.signal, onBytes: onBytes, onActivity: onActivity, beforeChunk: preparationTurn,
        get priority() { return warmup ? 'low' : 'high'; }, get cacheOnly() { return warmup; } };
      releasePreparedSession = () => assets.releaseSession?.();
      const [data, wasm, glue] = await Promise.all([assets.getAsset(manifest.data, options), assets.getAsset(manifest.engine.wasm, options), assets.getAsset(manifest.engine.js, options)]);
      const modelBytes = [];
      for (let i = 0; i < modelFiles.length; i += 4) {
        await preparationTurn();
        const batch = modelFiles.slice(i, i + 4);
        modelBytes.push(...await Promise.all(batch.map(async file => ({ file, bytes: await assets.getAsset(file, options) }))));
      }
      const districtPayload = districtManifest ? {manifest:districtManifest,files:[]} : null;
      if(districtManifest) for(let i=0;i<districtManifest.files.length;i+=4){
        await preparationTurn();
        districtPayload.files.push(...await Promise.all(districtManifest.files.slice(i,i+4).map(async file=>({fsPath:file.fsPath,bytes:await assets.getAsset(file,options)}))));
      }
      await preparationTurn();
      installAudioRouting(); setStage('engine'); visibleWait = 0;
      launchStep('engine', 'Город загружен. Выходим на улицу.');
      window.Module = {
        portraitRelativeInput: true, canvas: canvas, arguments: [], wasmBinary: wasm,
        getPreloadedPackage: () => data.buffer,
        locateFile: name => new URL(name, baseURL).href,
        onRuntimeInitialized: function () {
          checkLaunch(); window.GTAExamHumans?.install(this.FS);
          if (legacy9) window.GTAExamStreet?.install(this.FS);
          for (const model of modelBytes) this.FS.writeFile('/vc-assets/local/' + model.file.originalPath.slice('/remote/'.length), model.bytes);
          if (districtPayload) { window.GTAExamViceDistrict.install(this.FS, districtPayload); window.GTAExamViceDistrict.addFinalRamp(this.FS); }
          if (sequence10) {
            if (typeof window.GTAExamPudge?.install !== 'function') throw new Error('Native Pudge model installer unavailable');
            window.GTAExamPudge.install(this.FS);
            if (typeof window.GTAExamBlockPed?.install !== 'function') throw new Error('Native street guest installer unavailable');
            window.GTAExamBlockPed.install(this.FS);
            if (typeof window.GTAExamArrivalCast?.install !== 'function') throw new Error('Native arrival cast installer unavailable');
            window.GTAExamArrivalCast.install(this.FS);
            if (typeof window.GTAExamSceneVehicles?.install !== 'function') throw new Error('Native scene vehicles unavailable');
            window.GTAExamSceneVehicles.install(this.FS);
          }
          this.FS.writeFile('/vc-assets/local/data/main.scm', scene);
          this.FS.writeFile('/vc-assets/local/revc.ini', ini);
          launch.runtime = true; progress('Расставляем всё по местам.');
        },
        mainCalled: function () { launch.main = true; this.FS.writeFile('/vc-assets/local/revc.ini', ini); }, syncRevcIni: function () {}, hotelMission: function () {},
        print: function (message) { if (/retrying to fetch/i.test(String(message))) { launch.detail = safeDetail(message); console.warn('[Vice City asset]', message); } }, printErr: function (message) { launch.detail = safeDetail(message); console.warn('[Vice City]', message); },
        onAbort: function (reason) { fail('Игра не запустилась. Попробуй ещё раз. Если ошибка повторится, скопируй её сведения.', { code: 'C-ENGINE', detail: reason }); }, setStatus: function () {},
        preMainLoop: function () { if (inactive()) { aimMotion.clear();driveInput.clear();return false; } if(driveMode&&driveInput.frame(performance.now())===false)release();const delta=aimMotion.flush(aiming); if(delta.x || delta.y) mouse('mousemove',0,delta.x,delta.y); if (shotPending && !firePressed) { firePressed = true; mouse('mousedown', 0); } syncAudio(); return true; },
        postMainLoop: function () {
          launch.frame = true; readNative(true);
          // Hidden preparation may be discarded and recreated during A/B.
          // Keep its only fallback bytes until the real city is visible.
          if (!warmup && launch.runtime && ['briefing', 'playing'].includes(state.stage) && releasePreparedSession) {
            releasePreparedSession(); releasePreparedSession = null;
          }
        }
      };
      const script = document.createElement('script'); scriptBlobURL = URL.createObjectURL(new Blob([glue], { type: 'text/javascript' })); script.src = scriptBlobURL;
      function revokeScript() { if (scriptBlobURL) { URL.revokeObjectURL(scriptBlobURL); scriptBlobURL = null; } }
      script.onload = revokeScript; script.onerror = () => { revokeScript(); fail('Не удалось открыть игру. Попробуй ещё раз.', { code: 'C-MODULE' }); }; document.body.appendChild(script);
      statusTimer = setInterval(syncAudio, 300);
    } catch (error) {
      if (!disposed && error.name !== 'AbortError') {
        console.error('[Vice City startup]', error);
        if (launch.step === 'browser') { fail('Не удалось запустить 3D-сцену. Попробуй открыть практику в Safari или Chrome.', { code: 'C-GPU', detail: error }); return; }
        const timeout = error.code === 'NETWORK_TIMEOUT' || error.name === 'TimeoutError';
        const integrity = /integrity|sha-?256|mismatch/i.test(String(error.message));
        fail(timeout ? 'Загрузка прервалась. Проверь соединение и попробуй ещё раз.' : integrity ? 'Часть игры загрузилась с ошибкой. Попробуй ещё раз.' : 'Не удалось загрузить игру. Проверь соединение и попробуй ещё раз.',
          { code: timeout ? 'C-NETWORK-TIMEOUT' : integrity ? 'C-INTEGRITY' : 'C-FILES', detail: error });
      }
    }
  }
  $('native-start').onclick = begin; $('native-begin').onclick = startScene;
  for (const choice of ['cj', 'pudge', 'steve', 'dancer']) {
    const button = $('arrival-answer-' + choice);
    if (button) button.onclick = () => selectArrivalChoice(choice);
  }
  if ($('arrival-confirm')) $('arrival-confirm').onclick = () => answerStreetQuestion(false);
  if ($('street-answer-missed')) $('street-answer-missed').onclick = () => answerStreetQuestion(true);
  $('briefing-pause').onclick = () => { briefingHeld = !briefingHeld; $('briefing-pause').textContent = briefingHeld ? 'Продолжить' : 'Пауза'; briefingClock?.sync(); };
  $('native-pause').onclick = pauseScene; $('native-resume').onclick = resumeScene;
  $('native-next').onclick = () => { startInteraction(); if (!examMode && desiredScene < 3) setScene(desiredScene + 1); };
  $('native-retry').onclick = $('native-again').onclick = () => { notify('restart'); location.reload(); };
  $('error-copy').onclick = async () => {
    const details = $('error-diagnostic-details'); details.open = true;
    try { await navigator.clipboard.writeText(diagnosticText()); $('error-copy').textContent = 'Сведения скопированы'; }
    catch (_) { $('error-copy').textContent = 'Скопируй сведения ниже'; }
  };
  function startupException(event) {
    if (!started || disposed || !['loading', 'engine', 'preparing', 'starting', 'playing', 'finishing'].includes(state.stage)) return;
    fail('Запуск игры прервался. Повтори запуск; если ошибка повторится, скопируй сведения ниже.', { code: 'C-ENGINE-ERROR', detail: event.error || event.reason || event.message });
  }
  window.addEventListener('error', startupException); window.addEventListener('unhandledrejection', startupException);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.session !== session || disposed) return;
    if (event.data.type === 'vice:preferences') { muted = !!event.data.muted; externalPause = !!event.data.paused; synchronizePause(); }
    if (event.data.type === 'vice:scene') setScene(event.data.scene);
    if (event.data.type === 'vice:activate') activate();
    if (event.data.type === 'vice:start') startScene();
    if (event.data.type === 'vice:destroy') destroy();
  });
  document.addEventListener('visibilitychange', synchronizePause); window.addEventListener('blur', release);
  // Rotation/viewport changes invalidate joystick centres and held touch ownership.
  // Require a fresh gesture rather than continuing to steer with stale coordinates.
  window.addEventListener('orientationchange', release); window.addEventListener('resize', release);
  canvas.addEventListener('webglcontextcreationerror', event => { fail('Браузер не смог создать 3D-сцену Vice City. Попробуй открыть практику в отдельном браузере.', { code: 'C-GPU-CONTEXT', detail: event.statusMessage }); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail('Браузер потерял доступ к 3D-графике. Для продолжения нужен новый запуск практики.', { code: 'C-GPU-CONTEXT' }); });
  function destroy() {
    if (disposed) return; briefingClock?.cancel(); transitionClock?.cancel(); streetQuestionResult = null; release(); disposed = true; fileAbort?.abort(); clearInterval(watchdog); clearInterval(statusTimer); clearTimeout(toastTimer); clearTimeout(keyboardTimer); clearTimeout(prepareTimer); synchronizePause();
    highlightCapture?.destroy();
    radar?.dispose();
    if (scriptBlobURL) { URL.revokeObjectURL(scriptBlobURL); scriptBlobURL = null; }
    for (const context of audioContexts()) { try { context.close().catch(() => {}); } catch (_) {} }
  }
  window.addEventListener('pagehide', event => { if (event.persisted) { pageSuspended = true; synchronizePause(); } else destroy(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { pageSuspended = false; synchronizePause(); } });
  window.ViceRange = { snapshot: snapshot, destroy: destroy, setScene: setScene, startScene: startScene, activate: activate,
    getHighlight: () => highlightCapture?.getHighlight() || null };
  updateSceneCopy(); $('intro-note').textContent = examMode ? 'Оценку объявит комиссия. Результаты заданий сохраняются.' : continuous ? 'Три сцены подряд. Пауза — вверху.' : 'Три задания в Vice City.';
  notify('mounted');
  if (examMode) prepareTimer = setTimeout(() => { prepareTimer = null; return begin(); }, 0);
})();
