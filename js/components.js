/* Общие UI-компоненты: модальные окна, диалоги, уведомления */
'use strict';

const UI = {
  _stack: [],

  /* Открыть модальное окно (на телефоне — нижняя «шторка») */
  modal(html, { onMount, onClose, wide = false, dismissable = true } = {}) {
    const root = $('#modal-root');
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `<div class="sheet ${wide ? 'sheet-wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    root.appendChild(el);
    document.body.classList.add('modal-open');
    const entry = { el, onClose, dismissable };
    UI._stack.push(entry);
    requestAnimationFrame(() => el.classList.add('show'));
    el.addEventListener('mousedown', (e) => {
      if (e.target === el && dismissable) UI.close();
    });
    if (onMount) onMount($('.sheet', el));
    const focusable = $('[autofocus], input:not([type=hidden]), textarea, select', el);
    if (focusable && window.innerWidth > 700) focusable.focus();
    return entry;
  },

  close(result) {
    const entry = UI._stack.pop();
    if (!entry) return;
    entry.el.classList.remove('show');
    setTimeout(() => entry.el.remove(), 180);
    if (!UI._stack.length) document.body.classList.remove('modal-open');
    if (entry.onClose) entry.onClose(result);
  },

  /* Диалог с выбором вариантов. Возвращает Promise со значением выбранной кнопки или null */
  choice(title, text, options) {
    return new Promise((resolve) => {
      let answered = false;
      const html = `
        <div class="dialog">
          <h3>${esc(title)}</h3>
          ${text ? `<p class="muted">${esc(text)}</p>` : ''}
          <div class="dialog-actions">
            ${options.map((o, i) => `<button class="btn ${o.danger ? 'btn-danger' : o.primary ? 'btn-primary' : 'btn-soft'}" data-choice="${i}">${esc(o.label)}</button>`).join('')}
            <button class="btn btn-ghost" data-choice="-1">Отмена</button>
          </div>
        </div>`;
      UI.modal(html, {
        onMount(sheet) {
          sheet.addEventListener('click', (e) => {
            const b = e.target.closest('[data-choice]');
            if (!b) return;
            answered = true;
            const i = Number(b.dataset.choice);
            UI.close();
            resolve(i >= 0 ? options[i].value : null);
          });
        },
        onClose() { if (!answered) resolve(null); },
      });
    });
  },

  confirm(title, text, okLabel = 'Удалить', danger = true) {
    return UI.choice(title, text, [{ label: okLabel, value: true, danger, primary: !danger }]).then((v) => !!v);
  },

  toast(message, { action, onAction, ms = 5000 } = {}) {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(message)}</span>${action ? `<button class="toast-btn">${esc(action)}</button>` : ''}`;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const remove = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 200); };
    const timer = setTimeout(remove, ms);
    if (action) {
      $('.toast-btn', el).addEventListener('click', () => { clearTimeout(timer); remove(); onAction && onAction(); });
    }
  },

  download(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && UI._stack.length) UI.close();
});

/* ---------- Мелкие HTML-блоки ---------- */
const Bits = {
  langBadge(lang) {
    const l = LANGS[lang]; if (!l) return '';
    return `<span class="lang lang-${lang}" title="${l.name}">${l.mark}</span>`;
  },
  avatar(student, size = 40) {
    const name = student ? student.name : '?';
    const letter = (name.trim()[0] || '?').toUpperCase();
    return `<span class="avatar" style="--c:${student ? student.color : '#999'};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">${esc(letter)}</span>`;
  },
  statusPill(l) {
    if (l.status === 'planned') return '<span class="pill pill-plan">В плане</span>';
    if (l.status === 'canceled') return '<span class="pill pill-cancel">Отменён</span>';
    const base = l.status === 'late' ? '<span class="pill pill-late">Поздняя отмена</span>' : '<span class="pill pill-done">Проведён</span>';
    return base + (l.paid ? '<span class="pill pill-paid">Оплачен</span>' : '<span class="pill pill-unpaid">Не оплачен</span>');
  },
  empty(iconName, title, text, action = '') {
    return `<div class="empty">${icon(iconName, 34)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  },
};
