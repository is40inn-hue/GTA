'use strict';

// A presentation layer for one existing MCQ. Selection and scoring remain in app.js.
(function (scope) {
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const art = {
    car: '<path d="M18 45l7-20h46l7 20M12 45h72v26H12zM23 71v9M73 71v9M26 32h44M48 26v18"/><circle cx="26" cy="58" r="5"/><circle cx="70" cy="58" r="5"/><path d="M38 59h20M12 46l-5-6M84 46l5-6"/>',
    diamonds: '<path d="M31 26h34l13 17-30 30-30-30z"/><path d="M18 43h60M31 26l-1 17 18 30 18-30-1-17M31 26l17 17 17-17"/>',
    sword: '<path d="M69 17l10 1-1 10-34 34-10-10z"/><path d="M73 23L39 57M29 48l20 20M25 52l20 20M32 62L21 73l-5-5 11-11M17 68l-4 7 7 7 7-4"/>',
    film: '<circle cx="43" cy="43" r="26"/><circle cx="43" cy="43" r="5"/><circle cx="43" cy="28" r="5"/><circle cx="58" cy="43" r="5"/><circle cx="43" cy="58" r="5"/><circle cx="28" cy="43" r="5"/><path d="M43 69h33V54H65M49 69v8h27M56 72v3M64 72v3M72 72v3"/>',
    gold: '<path d="M22 46h22l8 17H14zM52 46h22l8 17H44zM38 26h22l8 17H30z"/><path d="M14 63v10h38V63M44 63v10h38V63M30 43v10h38V43M22 46l-2 17M52 46l-2 17M38 26l-2 17"/>'
  };
  const reticle = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M30 14H14v16M70 14h16v16M14 70v16h16M86 70v16H70M50 6v16M50 78v16M6 50h16M78 50h16"/><circle cx="50" cy="50" r="21"/><path d="M45 50h10M50 45v10"/></svg>';

  function optionsFor(step, config) {
    // Pass the app's seeded order in config.options, or a step whose options are
    // already shuffled. This module never introduces a second random shuffle.
    const supplied = config && config.options;
    if (Array.isArray(supplied) && supplied.length === step.options.length && new Set(supplied.map(o => o.id)).size === step.options.length && supplied.every(o => step.options.some(item => item.id === o.id))) {
      return supplied.map(o => step.options.find(item => item.id === o.id));
    }
    return step.options;
  }

  function stateFor(step, value, config) {
    const selected = step.options.find(option => option.id === value);
    const correct = step.options.find(option => option.id === step.answer);
    const locked = !!config.locked, reveal = !!config.reveal;
    let message = 'Выберите один предмет.';
    if (selected) message = 'Выбрано: ' + selected.text + '. ' + (locked ? 'Ответ внесён в бланк.' : 'Ответ можно изменить.');
    if (reveal && correct) message = 'Ваш ответ: ' + (selected ? selected.text : 'не выбран') + '. Правильный ответ: ' + correct.text + '.';
    return { selected, correct, locked, reveal, message };
  }

  function classFor(option, state) {
    return 'evidence-option' + (state.selected && option.id === state.selected.id ? ' is-selected' : '') + (state.reveal && state.correct && option.id === state.correct.id ? ' is-correct' : '') + (state.reveal && state.selected && option.id === state.selected.id && (!state.correct || option.id !== state.correct.id) ? ' is-incorrect' : '');
  }

  function tagFor(option, state) {
    if (state.reveal && state.correct && option.id === state.correct.id) return 'ВЕРНО';
    if (state.reveal && state.selected && option.id === state.selected.id) return 'ОШИБКА';
    return state.selected && option.id === state.selected.id ? 'ВЫБРАНО' : '';
  }

  function render(step, value, config) {
    config = config || {};
    const state = stateFor(step, value, config);
    const options = optionsFor(step, config);
    return '<section class="evidence-scope' + (state.selected ? ' has-selection' : '') + '" data-evidence-scope="' + escape(step.id) + '" aria-label="Осмотр материалов задания">' +
      '<div class="evidence-caption"><span>МАТЕРИАЛЫ ЗАДАНИЯ</span><span>ОСМОТР</span></div>' +
      '<p class="evidence-instruction">Наведите прицел: нажмите на выбранный предмет.</p>' +
      '<div class="evidence-board" role="group" aria-label="Варианты ответа">' + options.map((option, index) => {
        const selected = !!state.selected && option.id === state.selected.id;
        return '<button type="button" class="' + classFor(option, state) + '" data-action="case-choose" data-step="' + escape(step.id) + '" data-id="' + escape(option.id) + '" aria-pressed="' + selected + '"' + (state.locked ? ' disabled' : '') + '>' +
          '<span class="evidence-option-number" aria-hidden="true">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<span class="evidence-art" aria-hidden="true"><svg viewBox="0 0 96 96" focusable="false">' + (art[option.id] || '<rect x="23" y="23" width="50" height="50"/><path d="M33 48h30M48 33v30"/>') + '</svg><span class="evidence-reticle">' + reticle + '</span></span>' +
          '<span class="evidence-option-label">' + escape(option.text) + '</span><span class="evidence-option-tag" aria-hidden="true">' + tagFor(option, state) + '</span></button>';
      }).join('') + '<span class="evidence-neutral-reticle" aria-hidden="true">' + reticle + '</span></div>' +
      '<p class="evidence-status" role="status" aria-live="polite" aria-atomic="true">' + escape(state.message) + '</p></section>';
  }

  function update(container, step, value, config) {
    config = config || {};
    if (!container || !step) return false;
    const root = container.matches && container.matches('.evidence-scope') && container.getAttribute('data-evidence-scope') === step.id ? container : Array.from(container.querySelectorAll('.evidence-scope')).find(node => node.getAttribute('data-evidence-scope') === step.id);
    if (!root) return false;
    const state = stateFor(step, value, config);
    root.classList.toggle('has-selection', !!state.selected);
    root.querySelectorAll('.evidence-option').forEach(button => {
      const option = step.options.find(item => item.id === button.dataset.id);
      if (!option) return;
      button.className = classFor(option, state);
      button.setAttribute('aria-pressed', String(!!state.selected && option.id === state.selected.id));
      button.disabled = state.locked;
      const tag = button.querySelector('.evidence-option-tag');
      if (tag) tag.textContent = tagFor(option, state);
    });
    const status = root.querySelector('.evidence-status');
    if (status && status.textContent !== state.message) status.textContent = state.message;
    return true;
  }

  scope.GTAEvidenceScope = Object.freeze({ render, update });
})(window);
