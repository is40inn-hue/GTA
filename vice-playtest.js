'use strict';
(function () {
  const A = window.GTAExamAudio, host = document.getElementById('rpg-playtest-scene');
  let scene = null, tg = null, active = true;
  function pause() { scene?.setPaused(document.hidden || !active || (tg?.initData && tg.isActive === false)); }
  function insets() {
    if (!tg?.initData) return;
    if (window.GTATelegramLayout) { window.GTATelegramLayout.update(tg); return; }
    const safe = tg.safeAreaInset || {}, content = tg.contentSafeAreaInset || {};
    ['top', 'bottom', 'left', 'right'].forEach(side => {
      const systemInset = Math.max(0, Number(safe[side]) || 0), contentInset = Math.max(0, Number(content[side]) || 0);
      document.documentElement.style.setProperty('--gta-system-safe-' + side, systemInset + 'px');
      document.documentElement.style.setProperty('--gta-content-safe-' + side, contentInset + 'px');
      document.documentElement.style.setProperty('--tg-safe-' + side, (systemInset + contentInset) + 'px');
    });
  }
  function fullscreen() { try { if (tg?.initData) { tg.expand(); if (tg.isVersionAtLeast('8.0') && !tg.isFullscreen) tg.requestFullscreen(); } } catch (_) {} }
  function initTelegram() {
    const candidate = window.Telegram?.WebApp;
    if (!candidate?.initData || candidate === tg) return; tg = candidate;
    try {
      tg.ready(); tg.expand(); insets();
      if (window.GTATelegramLayout) window.GTATelegramLayout.connect(tg);
      else for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) tg.onEvent(event, insets);
      tg.onEvent('activated', function () { active = true; pause(); }); tg.onEvent('deactivated', function () { active = false; pause(); });
      if (tg.isVersionAtLeast('6.1')) { tg.BackButton.show(); tg.BackButton.onClick(function () { location.href = './'; }); }
    } catch (_) {}
  }
  window.GTAVicePortInteraction = fullscreen;
  document.getElementById('rpg-playtest-audio').innerHTML = A.buttonHTML();
  A.setContext('native-playtest');
  document.addEventListener('click', function (event) { if (event.target.closest('[data-action="music-toggle"]')) { A.toggleMusic(); scene?.setMuted(!A.isEnabled()); } });
  scene = window.GTAVicePort.mount(host, { muted: !A.isEnabled(), continuous: true });
  document.addEventListener('visibilitychange', pause);
  window.addEventListener('pagehide', function (event) { if (event.persisted) { active = false; pause(); } else scene?.destroy(); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) { active = true; pause(); } });
  window.addEventListener('load', initTelegram); initTelegram(); pause();
})();
