'use strict';
(function () {
  const A = window.GTAExamAudio, KEY = 'gta-ege-rpg-playtest-v1';
  const host = document.getElementById('rpg-playtest-scene'), finish = document.getElementById('rpg-playtest-finish'), error = document.getElementById('rpg-playtest-error');
  let scene = null, tg = null, active = true;
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } }
  function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
  function pause() { if (scene) scene.setPaused(document.hidden || !active); }
  function mount(state) {
    if (scene) scene.destroy(); scene = null; finish.hidden = true; error.hidden = true;
    try {
      scene = window.GTARPGScene.mount(host, { state: state, muted: !A.isEnabled(), onState: save, onComplete: function () { finish.hidden = false; }, onError: function () { error.hidden = false; }, onReady: function () { error.hidden = true; } });
      pause();
    } catch (_) { error.hidden = false; }
  }
  function insets() {
    if (!tg || !tg.initData) return;
    if (window.GTATelegramLayout) { window.GTATelegramLayout.update(tg); return; }
    const safe = tg.safeAreaInset || {}, content = tg.contentSafeAreaInset || {};
    ['top', 'bottom', 'left', 'right'].forEach(side => {
      const systemInset = Math.max(0, Number(safe[side]) || 0), contentInset = Math.max(0, Number(content[side]) || 0);
      document.documentElement.style.setProperty('--gta-system-safe-' + side, systemInset + 'px');
      document.documentElement.style.setProperty('--gta-content-safe-' + side, contentInset + 'px');
      document.documentElement.style.setProperty('--tg-safe-' + side, (systemInset + contentInset) + 'px');
    });
  }
  function fullscreen() {
    try { if (!tg || !tg.initData) return; tg.expand(); if (tg.isVersionAtLeast('8.0') && !tg.isFullscreen) tg.requestFullscreen(); } catch (_) {}
  }
  function initTelegram() {
    const candidate = window.Telegram && window.Telegram.WebApp;
    if (!candidate || !candidate.initData || candidate === tg) return; tg = candidate;
    try {
      tg.ready(); tg.expand(); insets();
      if (window.GTATelegramLayout) window.GTATelegramLayout.connect(tg);
      else for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) tg.onEvent(event, insets);
      tg.onEvent('activated', function () { active = true; A.setAppActive(true); pause(); });
      tg.onEvent('deactivated', function () { active = false; A.setAppActive(false); pause(); if (scene) save(scene.getState()); });
      if (tg.isVersionAtLeast('6.1')) { tg.BackButton.show(); tg.BackButton.onClick(function () { location.href = './'; }); }
    } catch (_) {}
  }
  document.getElementById('rpg-playtest-audio').innerHTML = A.buttonHTML();
  A.configure({ notice: function (message) { const node = document.getElementById('toast'); node.textContent = message; node.className = 'toast show'; setTimeout(function () { node.className = 'toast'; }, 3200); } });
  A.setContext('question');
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-action="music-toggle"]')) { A.toggleMusic(); if (scene) scene.setMuted(!A.isEnabled()); return; }
    if (host.contains(event.target)) { A.start(false); fullscreen(); }
  });
  document.getElementById('rpg-playtest-retry').addEventListener('click', function () { save(null); mount(null); A.start(false); });
  document.getElementById('rpg-playtest-reload').addEventListener('click', function () { mount(read()); });
  document.addEventListener('visibilitychange', pause);
  window.addEventListener('pagehide', function () { if (scene) save(scene.getState()); });
  window.addEventListener('load', initTelegram);
  initTelegram(); mount(read());
})();
