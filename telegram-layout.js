/* RC4.4: the device inset and Telegram's content inset are separate layers.
   A host reserves both once; an embedded game keeps its own top inset at zero. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTATelegramLayout = api.create(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const sides = ['top', 'right', 'bottom', 'left'];
  const events = ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged', 'activated'];
  function px(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1000, n)) : 0; }
  function measure(tg, browserInsets) {
    const native = !!tg?.initData, system = {}, content = {}, total = {};
    const fullscreen = native && !!tg.isFullscreen;
    const mobile = native && (tg.platform === 'ios' || tg.platform === 'android');
    for (const side of sides) {
      system[side] = native ? px(tg.safeAreaInset?.[side]) : 0;
      content[side] = native ? px(tg.contentSafeAreaInset?.[side]) : 0;
    }
    // The fullscreen event can arrive before its insets. Reserve a single
    // native toolbar row during that gap; desktop/non-fullscreen add nothing.
    const topReserve = fullscreen && mobile && !content.top ? 48 : 0;
    for (const side of sides) total[side] = Math.max(px(browserInsets?.[side]), system[side]) + Math.max(content[side], side === 'top' ? topReserve : 0);
    return { native, fullscreen, system, content, topReserve, total };
  }
  function create(root) {
    let owner = null, disposed = false;
    const doc = root.document;
    function update(candidate) {
      if (disposed) return null;
      const tg = candidate && typeof candidate === 'object' && 'initData' in candidate ? candidate : owner;
      const layout = measure(tg), element = doc?.documentElement;
      for (const side of sides) {
        element?.style?.setProperty('--gta-system-safe-' + side, layout.system[side] + 'px');
        element?.style?.setProperty('--gta-content-safe-' + side, layout.content[side] + 'px');
        // Retain compatibility for old entry-point styles, without max-ing
        // Telegram's content area away into the system area.
        element?.style?.setProperty('--tg-safe-' + side, layout.total[side] + 'px');
      }
      element?.style?.setProperty('--gta-tg-top-reserve', layout.topReserve + 'px');
      element?.classList?.toggle('tg-fullscreen', layout.fullscreen);
      element?.classList?.toggle('tg-mini-app', layout.native);
      doc?.querySelectorAll?.('[data-action="fullscreen"]').forEach(button => { button.hidden = layout.fullscreen; });
      return layout;
    }
    function detach() {
      for (const event of events) { try { owner?.offEvent?.(event, update); } catch (_) {} }
      owner = null;
    }
    function connect(tg) {
      if (disposed) return null;
      if (owner !== tg) {
        detach(); owner = tg || null;
        for (const event of events) { try { owner?.onEvent?.(event, update); } catch (_) {} }
      }
      return update(owner);
    }
    function refresh() { update(owner); }
    const hostEvents = ['resize', 'orientationchange', 'pageshow'];
    for (const event of hostEvents) root.addEventListener?.(event, refresh);
    root.visualViewport?.addEventListener?.('resize', refresh);
    function destroy() {
      if (disposed) return;
      detach(); disposed = true;
      for (const event of hostEvents) root.removeEventListener?.(event, refresh);
      root.visualViewport?.removeEventListener?.('resize', refresh);
    }
    return { update, connect, destroy };
  }
  return { measure, create };
});
