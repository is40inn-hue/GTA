'use strict';

// This source is embedded into index.html so the recovery screen does not
// depend on another successful network request. The test checks both copies.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { create: factory };
  else root.GTAExamBoot = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const doc = root.document;
  const START_TIMEOUT = 20000, QUESTIONS_TIMEOUT = 12000;
  let phase = 'loading', failure = null, retrying = false;
  const fallback = '<main id="boot-panel" class="boot-panel" aria-live="polite" aria-busy="true"><p class="boot-kicker">ЕГЭ · ИСТОРИЯ GTA</p><h1 id="boot-title">Открываем экзамен</h1><p id="boot-message">Подготавливаем твой вариант.</p><p id="boot-detail" class="boot-detail" hidden></p><button id="boot-retry" class="boot-retry" type="button" onclick="window.GTAExamBoot ? window.GTAExamBoot.retry() : location.reload()">Повторить</button></main>';

  function error(code, message, detail) {
    const value = new Error(message);
    value.bootCode = code; value.bootDetail = detail || '';
    return value;
  }
  function renderFailure() {
    if (!failure || !doc) return;
    let panel = doc.getElementById('boot-panel');
    const app = doc.getElementById('app');
    if (!panel && app) { app.innerHTML = fallback; panel = doc.getElementById('boot-panel'); }
    if (!panel) return;
    panel.setAttribute('aria-busy', 'false');
    panel.classList.add('boot-failed');
    const title = doc.getElementById('boot-title'), message = doc.getElementById('boot-message'), detail = doc.getElementById('boot-detail');
    if (title) title.textContent = failure.code === 'B-FILE' ? 'Открой через локальный запуск' : 'Экзамен пока не открылся';
    if (message) message.textContent = failure.message;
    if (detail) { detail.hidden = false; detail.textContent = failure.detail || 'Код: ' + failure.code; }
  }
  function fail(value) {
    if (phase === 'ready') return false;
    phase = 'failed'; root.clearTimeout(watchdog);
    failure = { code: value && value.bootCode || 'B-START', message: value && value.bootCode ? value.message : 'Не удалось открыть экзамен. Попробуй ещё раз.', detail: value && value.bootDetail || '' };
    renderFailure();
    return false;
  }
  function ready() {
    if (phase === 'failed') return false;
    phase = 'ready'; root.clearTimeout(watchdog);
    return true;
  }
  function retry() {
    // Exactly one navigation per explicit click. Never reload automatically.
    if (retrying) return;
    retrying = true;
    const button = doc && doc.getElementById('boot-retry');
    if (button) { button.disabled = true; button.textContent = 'Открываем…'; }
    root.location.reload();
  }
  function requireModules(modules) {
    if (phase === 'failed') { renderFailure(); return false; }
    for (const item of modules) {
      const name = typeof item === 'string' ? item : item.name;
      if (!root[name]) return fail(error('B-MODULE', 'Не загрузилась часть экзамена. Проверь соединение и нажми «Повторить».', 'Не загрузился: ' + (item.label || name)));
    }
    return true;
  }
  async function loadQuestions(url) {
    let expired = false, timeout;
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    const deadline = new Promise((_, reject) => {
      timeout = root.setTimeout(() => {
        expired = true;
        reject(error('B-QUESTIONS-TIMEOUT', 'Вопросы загружаются слишком долго. Проверь соединение и попробуй ещё раз.'));
        if (controller) controller.abort();
      }, QUESTIONS_TIMEOUT);
    });
    const request = (async () => {
      let response;
      try { response = await root.fetch(url, { cache: 'no-cache', ...(controller ? { signal: controller.signal } : {}) }); }
      catch (cause) {
        if (expired) throw error('B-QUESTIONS-TIMEOUT', 'Вопросы загружаются слишком долго. Проверь соединение и попробуй ещё раз.');
        throw error('B-QUESTIONS-NETWORK', 'Не удалось загрузить вопросы. Проверь соединение и попробуй ещё раз.');
      }
      if (!response.ok) throw error('B-QUESTIONS-HTTP-' + response.status, response.status === 404 ? 'В сборке не найден файл с вопросами. Попробуй открыть экзамен ещё раз.' : 'Сервер не отдал вопросы. Попробуй ещё раз.', 'Код: B-QUESTIONS-HTTP-' + response.status);
      let questions;
      try { questions = await response.json(); }
      catch (_) { throw error('B-QUESTIONS-JSON', 'Файл с вопросами не удалось прочитать. Попробуй открыть экзамен ещё раз.'); }
      if (!Array.isArray(questions) || !questions.length) throw error('B-QUESTIONS-FORMAT', 'В сборке нет доступных вопросов. Попробуй открыть экзамен ещё раз.');
      return questions;
    })();
    try { return await Promise.race([request, deadline]); }
    finally { root.clearTimeout(timeout); }
  }
  const watchdog = root.setTimeout(() => {
    if (phase === 'loading') fail(error('B-SCRIPTS-TIMEOUT', 'Не все файлы экзамена загрузились вовремя. Проверь соединение и нажми «Повторить».'));
  }, START_TIMEOUT);
  if (doc) doc.addEventListener('DOMContentLoaded', renderFailure, { once: true });
  root.addEventListener('error', event => {
    if (phase !== 'loading') return;
    const target = event.target;
    if (target && target.tagName === 'SCRIPT' && target.getAttribute('data-boot-required') !== null) {
      const name = target.getAttribute('src') || 'скрипт запуска';
      fail(error('B-SCRIPT', 'Не загрузилась часть экзамена. Проверь соединение и нажми «Повторить».', 'Не загрузился файл: ' + name.split('?')[0]));
    } else if (event.filename) {
      const filename = String(event.filename).split(/[?#]/)[0];
      const required = doc ? Array.from(doc.querySelectorAll('script[data-boot-required]')) : [];
      if (required.some(script => String(script.src).split(/[?#]/)[0] === filename) || /(?:^|\/)app\.js$/.test(filename)) {
        fail(error('B-SCRIPT-EXEC', 'При открытии экзамена произошла ошибка. Нажми «Повторить».', 'Ошибка запуска: ' + filename.split('/').pop()));
      }
    }
  }, true);
  if (root.location && root.location.protocol === 'file:') {
    fail(error('B-FILE', 'Распакуй весь архив и запусти START-MAC.command на Mac или START-WINDOWS.cmd на Windows.', 'Экзамен открывается по адресу из окна запуска. Двойной щелчок по index.html не запускает сервер.'));
  }
  return { requireModules, loadQuestions, fail, ready, retry, error, getState: () => ({ phase, failure, retrying }) };
});
