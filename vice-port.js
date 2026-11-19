'use strict';
(function () {
  const validScene = value => Number.isInteger(value) && value >= 1 && value <= 3;
  const clone = value => JSON.parse(JSON.stringify(value));
  function verifiedHighlight(value) {
    if (!value || !validScene(value.scene) || !['explosion', 'gameplay'].includes(value.kind)) return null;
    if (!Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || value.width > 960 || value.height > 960) return null;
    if (!Number.isSafeInteger(value.capturedAt) || value.capturedAt <= 0 || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || value.sequence > 15) return null;
    const target = value.target, explosion = value.kind === 'explosion';
    if (explosion ? !Number.isInteger(target) || target < 0 || target > 2 : target !== -1) return null;
    const priority = explosion ? value.scene === 3 && target === 2 ? 100 : 50 + value.scene * 10 + target : value.scene * 10;
    if (value.priority !== priority || typeof value.dataUrl !== 'string' || value.dataUrl.length > 480000 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value.dataUrl)) return null;
    return { dataUrl: value.dataUrl, width: value.width, height: value.height, scene: value.scene,
      kind: value.kind, target: target, priority: priority, capturedAt: value.capturedAt, sequence: value.sequence };
  }
  function mount(container, options) {
    options = options || {};
    const session = crypto.randomUUID(), iframe = document.createElement('iframe'), examMode = options.examMode === true;
    const edition = options.legacy === true ? 7 : Number(options.edition || 10), resultVersion = edition >= 9 ? 3 : 2;
    const warmBoot = options.warmup === true && examMode;
    let warmup = warmBoot, activationRequested = false, warmReadyReported = false;
    let scene = validScene(options.scene) ? options.scene : 1;
    let destroyed = false, muted = !!options.muted, paused = !!options.paused;
    let highlight = null, highlightSequence = 0;
    let snapshot = { engine: 'vice-city-wasm', version: resultVersion, scene: scene, stage: 'idle', warmup: warmup, ammo: 0, ammoInitial: 0, targetCount: 0 };
    const completed = new Map();
    iframe.className = 'vice-native-frame'; iframe.title = 'Часть C: игровая практика Vice City';
    iframe.tabIndex = warmBoot ? -1 : 0;
    iframe.allow = 'autoplay; fullscreen'; iframe.referrerPolicy = 'same-origin';
    iframe.src = 'native-vc/index.html?session=' + encodeURIComponent(session) + '&scene=' + scene + '&exam=' + Number(examMode) + (edition === 7 ? '&legacy=1' : edition === 8 ? '&legacyEdition=8' : edition === 9 ? '&legacyEdition=9' : '&edition=10') + (options.continuous === true ? '&flow=1' : '') + (warmBoot ? '&warmup=1' : '');
    function send(type, extra) { if (!destroyed) iframe.contentWindow?.postMessage(Object.assign({ type: 'vice:' + type, session: session }, extra || {}), location.origin); }
    function preferences() { send('preferences', { muted: warmup || muted, paused: paused }); }
    function activate() {
      if (destroyed || snapshot.stage === 'error') return false;
      if (!warmup) return true;
      warmup = false; activationRequested = true; snapshot.warmup = false;
      iframe.tabIndex = 0;
      preferences(); send('activate'); return true;
    }
    function setScene(number) {
      number = Number(number); if (!validScene(number) || destroyed) return false;
      if (number === scene) return true;
      if (warmup) return false;
      if (['playing', 'starting', 'finishing', 'paused', 'observation'].includes(snapshot.stage)) return false;
      scene = number; snapshot = { engine: 'vice-city-wasm', version: resultVersion, scene: scene, stage: 'preparing', ammo: 0, ammoInitial: 0, targetCount: 0 };
      send('scene', { scene: scene }); options.onState?.(clone(snapshot)); return true;
    }
    function message(event) {
      if (destroyed || event.origin !== location.origin || event.source !== iframe.contentWindow || event.data?.session !== session) return;
      const data = event.data;
      if (data.type === 'vice:mounted') { preferences(); send('scene', { scene: scene }); if (activationRequested) send('activate'); }
      if (data.type === 'vice:state' && data.state?.engine === 'vice-city-wasm' && data.state.version === resultVersion && validScene(data.state.scene)) {
        if (examMode && data.state.scene !== scene) return;
        if (warmup && !['idle', 'loading', 'engine', 'preparing', 'warmed', 'error'].includes(data.state.stage)) return;
        scene = data.state.scene; snapshot = clone(data.state); options.onState?.(clone(snapshot));
      }
      if (data.type === 'vice:warmed' && warmup && !warmReadyReported && data.scene === scene && snapshot.stage === 'warmed') {
        warmReadyReported = true; options.onWarmReady?.({ scene: scene });
      }
      if (data.type === 'vice:ready' && !warmup && data.scene === scene) options.onReady?.({ scene: scene });
      if (data.type === 'vice:highlight' && !warmup && data.version === 1 && ['playing', 'finishing', 'complete', 'paused'].includes(snapshot.stage)) {
        const value = verifiedHighlight(data.highlight);
        if (value && value.scene === scene && value.sequence > highlightSequence && value.priority >= (highlight?.priority || 0)) {
          highlightSequence = value.sequence; highlight = value; options.onHighlight?.(clone(highlight));
        }
      }
      if (data.type === 'vice:error' && (!data.scene || data.scene === scene)) options.onError?.(String(data.message || 'Не удалось запустить игру'));
      if (data.type === 'vice:complete' && !warmup && data.result?.engine === 'vice-city-wasm' && data.result.version === resultVersion && data.result.scene === scene && data.result.completed === true) {
        const result = clone(data.result), previous = completed.get(scene);
        if (previous) { if (JSON.stringify(previous) !== JSON.stringify(result)) options.onError?.('Протокол завершённого задания изменился'); return; }
        completed.set(scene, result); options.onComplete?.(clone(result));
      }
      if (data.type === 'vice:restart') {
        highlight = null; highlightSequence = 0;
        completed.clear(); snapshot = { engine: 'vice-city-wasm', version: resultVersion, scene: scene, stage: 'idle', ammo: 0, ammoInitial: 0, targetCount: 0 }; options.onState?.(clone(snapshot));
      }
    }
    window.addEventListener('message', message); iframe.addEventListener('load', () => { preferences(); if (activationRequested) send('activate'); }); container.replaceChildren(iframe);
    return {
      getState: function () { return clone(snapshot); }, getHighlight: function () { return destroyed || !highlight ? null : clone(highlight); }, setScene: setScene, activate: activate,
      isWarmup: function () { return !destroyed && warmup; },
      startScene: function () { if (destroyed || warmup) return false; send('start'); return true; },
      setMuted: function (value) { muted = !!value; preferences(); },
      setPaused: function (value) { paused = !!value; preferences(); },
      destroy: function () { if (destroyed) return; send('destroy'); destroyed = true; highlight = null; window.removeEventListener('message', message); try { iframe.contentWindow?.ViceRange?.destroy(); } catch (_) {} iframe.remove(); }
    };
  }
  window.GTAVicePort = { mount: mount };
})();
