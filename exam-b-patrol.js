/* Optional exam exhibit. Reuses C's radar renderer and the original Vice City
   radar tiles. Scripted playback runs locally; nothing enters exam scoring. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTAExamPatrol = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const path = [[288,-1085],[285,-1125],[275,-1163],[270,-1200],[253,-1227],[235,-1235]];
  const duration = 3400;
  function sample(progress) {
    const p = Math.min(1,Math.max(0, Number.isFinite(progress) ? progress : 0));
    const i = Math.min(path.length-2,Math.floor(p*(path.length-1)));
    const local = p*(path.length-1)-i, a = path[i], b = path[i+1];
    const [dx,dy] = [b[0]-a[0],b[1]-a[1]];
    return {
      player: {x:a[0]+dx*local, y:a[1]+dy*local, heading: Math.atan2(-dx,dy) * 180/Math.PI},
      target: {x:a[0]+dx*local+16+22*p, y:a[1]+dy*local+48-15*p, kind:3},
      driving:true
    };
  }
  function mount(el) {
    if (!el || !root.GTAHudRadar) return;
    const radarElement = el.querySelector('[data-patrol-radar]');
    const canvas = el.querySelector('canvas');
    const button = el.querySelector('button');
    const caption = el.querySelector('[data-patrol-status]');
    const stars = el.querySelector('[data-patrol-stars]');
    if (!radarElement || !canvas || !button || !caption || !stars) return;
    const radar = root.GTAHudRadar.create({element:radarElement,canvas,assetsURL:'assets/game-ui/'});
    let frame = 0, start, stopped = false;
    function update(p,now) {
      radar.update(sample(p),now);
      stars.dataset.level = p === 0 ? '0' : p < .49 ? '1' : '2';
    }
    function finish() {
      update(1);
      el.dataset.playing='false'; button.textContent='↻ Повторить запись';
      caption.textContent='Экипаж проехал перекрёсток.';
    }
    function tick(now) {
      if (stopped || !el.isConnected) return;
      if (start === undefined) start = now;
      const p = Math.min((now-start)/duration,1);
      update(p,now);
      if (p < 1) frame = root.requestAnimationFrame(tick);
      else finish();
    }
    function play() {
      root.cancelAnimationFrame(frame); start = undefined;
      if (root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return finish();
      update(0); el.dataset.playing='true';
      button.textContent='↻ Сначала';
      caption.textContent='На радаре патруль. Смотри, как меняется обстановка.';
      frame = root.requestAnimationFrame(tick);
    }
    function visibility() {
      if (root.document.hidden && el.dataset.playing==='true') {
        root.cancelAnimationFrame(frame);
        finish();
      }
    }
    update(0);
    button.addEventListener('click',play);
    root.document.addEventListener('visibilitychange',visibility);
    el.dataset.ready='true';
    return () => {
      stopped=true; root.cancelAnimationFrame(frame); radar.dispose();
      button.removeEventListener('click',play);
      root.document.removeEventListener('visibilitychange',visibility);
    };
  }
  return { mount, sample, duration };
});
