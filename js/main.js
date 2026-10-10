/* Роутер, навигация, горячие клавиши, перетаскивание, поиск */
'use strict';

const NAV = [
  { id: 'today', label: 'Сегодня', icon: 'sun', key: '1' },
  { id: 'schedule', label: 'Расписание', icon: 'calendar', key: '2' },
  { id: 'students', label: 'Ученики', icon: 'users', key: '3' },
  { id: 'money', label: 'Доходы', icon: 'wallet', key: '4' },
];

const Brand = `<span class="brand-mark" aria-hidden="true"><b>文</b><i>A</i></span>`;
const isMac = /Mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  return { name: parts[0], arg: parts[1] };
}

function renderChrome() {
  $('#sidebar').innerHTML = `
    <a class="brand" href="#/today">${Brand}<span><b>Мои уроки</b><small>планер репетитора</small></span></a>
    <button class="btn btn-primary btn-lg new-lesson-btn" data-act="new-lesson">${icon('plus', 20)} Новый урок<kbd>N</kbd></button>
    <button class="side-search" data-act="open-search">${icon('search', 17)}<span>Поиск</span><kbd>${MOD} K</kbd></button>
    <nav class="side-nav">
      ${NAV.map((n) => `<a href="#/${n.id}" data-nav-id="${n.id}">${icon(n.icon)}<span>${n.label}</span><kbd>${n.key}</kbd></a>`).join('')}
    </nav>
    <div class="side-foot">
      <a href="#/settings" data-nav-id="settings">${icon('settings')}<span>Настройки</span></a>
      <button class="side-help" data-act="show-help">${icon('keyboard', 18)}<span>Горячие клавиши</span><kbd>?</kbd></button>
    </div>`;

  const [a, b, c, d] = NAV;
  const tab = (n) => `<a href="#/${n.id}" data-nav-id="${n.id}">${icon(n.icon, 22)}<span>${n.label}</span></a>`;
  $('#tabbar').innerHTML = `${tab(a)}${tab(b)}
    <button class="fab" data-act="new-lesson" aria-label="Новый урок">${icon('plus', 26)}</button>
    ${tab(c)}${tab(d)}`;
}

let lastRouteKey = '';
function render() {
  const r = route();
  const key = r.name + '/' + (r.arg || '') + '/' + VS.schedMode;
  const view = $('#view');
  const scrollY = window.scrollY;
  const gridScroll = $('.grid-card', view) ? $('.grid-card', view).scrollTop : null;

  let html;
  switch (r.name) {
    case 'schedule': html = Views.schedule(); break;
    case 'students': html = r.arg ? Views.studentDetail(r.arg) : Views.students(); break;
    case 'money': html = Views.money(); break;
    case 'settings': html = Views.settings(); break;
    default: html = Views.today();
  }
  view.innerHTML = html;
  view.className = 'view view-' + (r.name || 'today');

  const active = ['today', 'schedule', 'students', 'money', 'settings'].includes(r.name) ? r.name : 'today';
  $$('[data-nav-id]').forEach((a) => a.classList.toggle('active', a.dataset.navId === active));
  document.title = ({ today: 'Сегодня', schedule: 'Расписание', students: 'Ученики', money: 'Доходы', settings: 'Настройки' }[active] || 'Мои уроки') + ' · Мои уроки';

  if (key === lastRouteKey) window.scrollTo(0, scrollY); else window.scrollTo(0, 0);

  const gc = $('.grid-card', view);
  if (gc) {
    if (key === lastRouteKey && gridScroll !== null) gc.scrollTop = gridScroll;
    else {
      // прокрутка к ближайшему уроку или к текущему времени
      const sg = $('.sg', gc);
      const first = Number(sg.dataset.firstHour);
      const hh = parseFloat(getComputedStyle(sg).getPropertyValue('--hh')) || 56;
      const today = D.today();
      const showsToday = $$('.sg-col', gc).some((c) => c.dataset.date === today);
      const lessons = $$('.sg-col', gc).flatMap((c) => $$('.lb', c));
      let target = null;
      if (showsToday) target = Math.max(first, D.nowMinutes() / 60 - 1.5);
      else if (lessons.length) target = Math.min(...lessons.map((el) => parseFloat(el.style.top.match(/calc\(([\d.]+)/)[1]) + first)) - 0.5;
      if (target !== null) gc.scrollTop = Math.max(0, (target - first) * hh);
    }
  }
  lastRouteKey = key;
}

function applyTheme() {
  const th = Store.settings.theme;
  document.documentElement.dataset.theme = th;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = $('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#16151d' : '#f5f4f0';
}

/* ---------- Действия ---------- */
function exportCSV() {
  const [from, to] = Views._range();
  const rows = Store.lessonsBetween(from, to);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Дата', 'Время', 'Ученик', 'Язык', 'Минут', 'Стоимость', 'Статус', 'Оплачено', 'Тема'].map(q).join(';')];
  rows.forEach((l) => {
    const s = Store.student(l.studentId);
    lines.push([l.date, l.time, s ? s.name : '', LANGS[l.lang] ? LANGS[l.lang].name : '', l.duration, l.price, STATUSES[l.status].short,
      Calc.isPayable(l) ? (Store.isPaid(l) ? 'да' : 'нет') : '', l.topic].map(q).join(';'));
  });
  UI.download(`uroki-${from}_${to}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
  UI.toast(`Выгружено строк: ${rows.length}. Файл открывается в Excel.`);
}

function shiftSchedule(dir) {
  if (VS.schedMode === 'month') VS.schedDate = D.addMonths(VS.schedDate, dir);
  else VS.schedDate = D.add(VS.schedDate, (VS.schedMode === 'week' ? 7 : 1) * dir);
  render();
}
function shiftMoney(dir) {
  VS.moneyDate = D.addMonths(VS.moneyDate, (VS.moneyMode === 'month' ? 1 : 12) * dir);
  render();
}

const Actions = {
  'open-lesson': (el) => Forms.lesson({ id: el.dataset.id }),
  'new-lesson': (el) => Forms.lesson({ date: el.dataset.date || (route().name === 'schedule' ? VS.schedDate : undefined), studentId: el.dataset.student, time: el.dataset.time }),
  'new-student': () => Forms.student(),
  'edit-student': (el) => Forms.student({ id: el.dataset.id }),
  'edit-regular': (el) => Forms.student({ id: el.dataset.id, focusRegular: true }),
  'report': (el) => Forms.report(el.dataset.id),
  'open-offs': () => Forms.off(),
  'open-search': () => openSearch(),
  'show-help': () => showHelp(),

  'quick-done': (el) => {
    const id = el.dataset.id;
    Store.patchLesson(id, { status: 'done' });
    const l = Store.lesson(id);
    if (l && Store.isPaid(l)) {
      const left = Store.account(l.studentId).prepaid;
      UI.toast(`Урок проведён · списано с баланса${left ? `, осталось ${Calc.money(left)}` : ', предоплата закончилась'}`);
    }
    else UI.toast('Урок отмечен как проведённый', { action: 'Уже оплачен', ms: 6500, onAction: () => Store.setLessonPaid(id, true) });
  },
  'quick-cancel': (el) => {
    const id = el.dataset.id;
    Store.patchLesson(id, { status: 'canceled' });
    UI.toast('Урок отменён', { action: 'Вернуть', onAction: () => Store.patchLesson(id, { status: 'planned' }) });
  },
  'pay-student': (el) => Forms.payment(el.dataset.id),
  'pay-due': (el) => {
    const row = Calc.dueRows().find((r) => r.s.id === el.dataset.id);
    if (!row) return;
    const c = Store.addPayment(row.s.id, row.due, { note: 'Закрытие долга' });
    UI.toast(`${row.s.name}: оплата ${Calc.money(row.due)} принята`, { action: 'Отменить', onAction: () => Store.deletePayment(c.id), ms: 7000 });
  },
  'del-payment': (el) => {
    const undo = Store.deletePayment(el.dataset.id);
    UI.toast('Оплата удалена', { action: 'Вернуть', onAction: undo });
  },
  'toggle-history': () => { VS.showAllHistory = !VS.showAllHistory; render(); },
  'toggle-payments': () => { VS.showAllPayments = !VS.showAllPayments; render(); },
  'copy-reminder': (el) => {
    const l = Store.lesson(el.dataset.id);
    if (l) UI.copy(Texts.reminder(l), 'Напоминание скопировано — вставьте в чат с учеником');
  },

  'slot': (el, ev) => {
    const rect = el.getBoundingClientRect();
    const rows = Number(el.closest('.sg').style.getPropertyValue('--rows')) || 1;
    const minutes = Number(el.dataset.start) + ((ev.clientY - rect.top) / rect.height) * rows * 60;
    Forms.lesson({ date: el.dataset.date, time: T.fromMin(Math.floor(minutes / 30) * 30) });
  },
  'go-day': (el) => {
    VS.schedDate = el.dataset.date;
    if (el.classList.contains('sg-day') || el.dataset.openDay) { VS.schedMode = 'day'; prefs.set('schedMode2', 'day'); }
    render();
  },
  'sched-prev': () => shiftSchedule(-1),
  'sched-next': () => shiftSchedule(1),
  'sched-today': () => { VS.schedDate = D.today(); render(); },

  'money-prev': () => shiftMoney(-1),
  'money-next': () => shiftMoney(1),
  'money-today': () => { VS.moneyDate = D.today(); render(); },
  'pick-month': (el) => { VS.moneyDate = el.dataset.date; VS.moneyMode = 'month'; render(); },
  'export-csv': exportCSV,

  'export-json': () => {
    UI.download(`moi-uroki-kopiya-${D.today()}.json`, Store.exportJSON());
    Store.markBackup();
    UI.toast('Копия сохранена в загрузки');
  },
  'open-backups': () => window.desktop && window.desktop.openBackups(),
  'load-demo': async () => {
    if (!Store.isEmpty()) {
      const ok = await UI.confirm('Заменить данные примером?', 'Все ваши текущие ученики и уроки будут заменены демонстрационными. Сначала сохраните копию, если они вам нужны.', 'Заменить', true);
      if (!ok) return;
    }
    Store.loadDemo();
    location.hash = '#/today';
  },
  'reset-all': async () => {
    const demo = Store.data.meta.demo;
    const ok = await UI.confirm(demo ? 'Начать с чистого листа?' : 'Удалить все данные?',
      demo ? 'Пример данных будет удалён, и вы сможете добавить своих учеников.' : 'Будут удалены все ученики, уроки и записи. Это действие нельзя отменить — сначала сохраните копию.', demo ? 'Начать с нуля' : 'Удалить всё');
    if (!ok) return;
    Store.reset();
    location.hash = '#/today';
    UI.toast(demo ? 'Готово — добавьте первого ученика' : 'Все данные удалены');
  },
};

/* Подавляем «клик» после перетаскивания */
let suppressClick = false;
document.addEventListener('click', (e) => {
  if (suppressClick) { e.stopPropagation(); e.preventDefault(); }
}, true);

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  const act = e.target.closest('[data-act]');
  if (act && Actions[act.dataset.act]) {
    e.preventDefault();
    Actions[act.dataset.act](act, e);
    return;
  }
  if (nav) location.hash = nav.dataset.nav;
});

/* ---------- Перетаскивание и изменение длительности уроков ---------- */
let drag = null;
const snap = (m, step = 15) => Math.round(m / step) * step;

document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.pointerType === 'touch') return;
  const lb = e.target.closest('.lb[data-drag]');
  if (!lb || UI._stack.length) return;
  const col = lb.closest('.sg-col');
  const sg = lb.closest('.sg');
  const l = Store.lesson(lb.dataset.id);
  if (!l) return;
  drag = {
    mode: e.target.closest('[data-resize]') ? 'resize' : 'move', lb, l, col, sg,
    x: e.clientX, y: e.clientY, hh: parseFloat(getComputedStyle(sg).getPropertyValue('--hh')) || 60,
    startMin: T.toMin(l.time), dur: Number(l.duration), moved: false, date: l.date, min: T.toMin(l.time), newDur: Number(l.duration),
  };
});

document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  if (!drag.moved) { drag.moved = true; drag.lb.classList.add('dragging'); document.body.classList.add('is-dragging'); }
  const { lb, hh } = drag;
  if (drag.mode === 'resize') {
    drag.newDur = clamp(snap(drag.dur + (dy / hh) * 60), 15, 480);
    lb.style.height = `calc(${drag.newDur / 60} * var(--hh) - 2px)`;
    $('[data-time]', lb).textContent = `${drag.l.time}–${T.end(drag.l.time, drag.newDur)}`;
    return;
  }
  // цель: колонка под курсором
  let target = drag.col;
  lb.style.pointerEvents = 'none';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  lb.style.pointerEvents = '';
  const c = under && under.closest('.sg-col');
  if (c) target = c;
  const colStart = Number(target.dataset.start);
  const rows = Number(drag.sg.style.getPropertyValue('--rows')) || 1;
  let min = snap(drag.startMin + (dy / hh) * 60);
  min = clamp(min, colStart, colStart + rows * 60 - 15);
  drag.date = target.dataset.date; drag.min = min;
  const dxCol = target.getBoundingClientRect().left - drag.col.getBoundingClientRect().left;
  lb.style.transform = `translate(${dxCol}px, ${((min - drag.startMin) / 60) * hh}px)`;
  $('[data-time]', lb).textContent = `${T.fromMin(min)}–${T.end(T.fromMin(min), drag.dur)}`;
});

function endDrag(cancel) {
  if (!drag) return;
  const d = drag; drag = null;
  document.body.classList.remove('is-dragging');
  if (!d.moved) return;
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  if (cancel) { render(); return; }
  const l = d.l;
  if (d.mode === 'resize') {
    if (d.newDur !== Number(l.duration)) {
      const old = l.duration;
      Store.patchLesson(l.id, { duration: d.newDur });
      UI.toast(`Длительность: ${d.newDur} мин`, { action: 'Вернуть', onAction: () => Store.patchLesson(l.id, { duration: old }) });
    } else render();
    return;
  }
  const time = T.fromMin(d.min);
  if (d.date !== l.date || time !== l.time) {
    const old = { date: l.date, time: l.time };
    Store.patchLesson(l.id, { date: d.date, time });
    const s = Store.student(l.studentId);
    UI.toast(`${s ? Texts.first(s.name) + ': урок' : 'Урок'} перенесён на ${fmt.date(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`,
      { action: 'Вернуть', onAction: () => Store.patchLesson(l.id, old), ms: 6500 });
    const conflict = Store.conflicts(d.date, time, l.duration, l.id);
    if (conflict.length) setTimeout(() => UI.toast('Внимание: это время пересекается с другим уроком'), 400);
  } else render();
}
document.addEventListener('pointerup', () => endDrag(false));
document.addEventListener('pointercancel', () => endDrag(true));

/* ---------- Фильтры, поля и настройки ---------- */
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'schedMode') { VS.schedMode = t.value; prefs.set('schedMode2', t.value); render(); }
  else if (t.name === 'moneyMode') { VS.moneyMode = t.value; render(); }
  else if (t.name === 'studentLang') { VS.studentLang = t.value; $('#student-list').innerHTML = Views._studentList(); }
  else if (t.id === 'show-archived') { VS.showArchived = t.checked; $('#student-list').innerHTML = Views._studentList(); }
  else if (t.closest('.settings') && t.name) {
    let v = t.value;
    if (t.type === 'number') v = Math.max(0, Number(v) || 0);
    if (['dayStart', 'dayEnd', 'horizon'].includes(t.name)) v = Number(v);
    if (t.name === 'duration') v = Math.max(5, v);
    Store.saveSettings({ [t.name]: v });
    if (t.name === 'theme') applyTheme();
  } else if (t.id === 'import-file' && t.files[0]) {
    const file = t.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      try { JSON.parse(reader.result); } catch (err) { UI.toast('Не удалось прочитать файл — это точно копия из приложения?'); return; }
      const ok = await UI.confirm('Восстановить из копии?', 'Текущие данные в приложении будут заменены данными из файла.', 'Восстановить', true);
      if (!ok) return;
      try { Store.importJSON(reader.result); UI.toast('Данные восстановлены'); } catch (err) { UI.toast(err.message); }
    };
    reader.readAsText(file);
    t.value = '';
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'student-search') { VS.studentQuery = e.target.value; $('#student-list').innerHTML = Views._studentList(); }
  if (e.target.id === 'record-search') { VS.recordQuery = e.target.value; $('#record-list').innerHTML = Views._records(route().arg); }
});

/* ---------- Горячие клавиши ---------- */
function typing() {
  const a = document.activeElement;
  return a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable);
}

function showHelp() {
  const row = (k, t) => `<div class="help-row"><span>${t}</span><span class="keys">${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')}</span></div>`;
  UI.modal(`<div class="form">
    <div class="sheet-head"><h2>Горячие клавиши</h2><button class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
    <div class="sheet-body">
      <div class="help-group">Везде</div>
      ${row('N', 'Новый урок')}${row('S', 'Новый ученик')}${row(`${MOD} K`, 'Поиск по ученикам и записям')}${row('1 2 3 4', 'Сегодня · Расписание · Ученики · Доходы')}${row(',', 'Настройки')}${row('Esc', 'Закрыть окно')}
      <div class="help-group">Расписание и доходы</div>
      ${row('← →', 'Назад / вперёд')}${row('T', 'К сегодняшнему дню')}${row('D W M', 'День / неделя / месяц (в расписании)')}
      <div class="help-group">В окне урока или ученика</div>
      ${row(`${MOD} Enter`, 'Сохранить')}
      <div class="help-group">Мышью</div>
      ${row('Клик', 'по свободному времени — создать урок')}${row('Перетащить', 'урок — перенести, за нижний край — изменить длительность')}
    </div>
    <div class="sheet-foot"><span class="spacer"></span><button class="btn btn-primary" data-close>Понятно</button></div>
  </div>`, { onMount(sheet) { sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) UI.close(); }); } });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (drag) endDrag(true); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!UI._stack.length) openSearch(); return; }
  if (UI._stack.length || typing() || e.altKey || (mod && e.key !== '/')) return;
  const r = route().name;
  const k = e.key.toLowerCase();
  const go = (h) => { e.preventDefault(); location.hash = h; };
  if (k === 'n' || k === 'т') { e.preventDefault(); Actions['new-lesson']({ dataset: {} }); }
  else if (k === 's' || k === 'ы') { e.preventDefault(); Forms.student(); }
  else if (k === '1') go('#/today');
  else if (k === '2') go('#/schedule');
  else if (k === '3') go('#/students');
  else if (k === '4') go('#/money');
  else if (k === ',' || k === 'б') go('#/settings');
  else if (k === '?' || k === '/') { e.preventDefault(); showHelp(); }
  else if (e.key === 'ArrowLeft') { if (r === 'schedule') { e.preventDefault(); shiftSchedule(-1); } else if (r === 'money') { e.preventDefault(); shiftMoney(-1); } }
  else if (e.key === 'ArrowRight') { if (r === 'schedule') { e.preventDefault(); shiftSchedule(1); } else if (r === 'money') { e.preventDefault(); shiftMoney(1); } }
  else if (k === 't' || k === 'е') { if (r === 'schedule') { VS.schedDate = D.today(); render(); } else if (r === 'money') { VS.moneyDate = D.today(); render(); } }
  else if (r === 'schedule' && ['d', 'в', 'w', 'ц', 'm', 'ь'].includes(k)) {
    VS.schedMode = { d: 'day', в: 'day', w: 'week', ц: 'week', m: 'month', ь: 'month' }[k]; prefs.set('schedMode2', VS.schedMode); render();
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
});

/* ---------- Поиск (Ctrl+K) ---------- */
function openSearch() {
  const items = (q) => {
    const out = [];
    const nav = [
      ['Новый урок', 'plus', () => Forms.lesson({})], ['Новый ученик', 'plus', () => Forms.student()],
      ['Сегодня', 'sun', () => { location.hash = '#/today'; }], ['Расписание', 'calendar', () => { location.hash = '#/schedule'; }],
      ['Ученики', 'users', () => { location.hash = '#/students'; }], ['Доходы', 'wallet', () => { location.hash = '#/money'; }],
      ['Выходные и отпуск', 'palm', () => Forms.off()], ['Настройки', 'settings', () => { location.hash = '#/settings'; }],
    ];
    if (!q.trim()) { nav.forEach(([t, ic, run]) => out.push({ group: 'Действия', title: t, icon: ic, run })); return out; }
    const res = Store.search(q);
    res.students.forEach((s) => out.push({ group: 'Ученики', title: s.name, sub: [s.level, regularText(s)].filter(Boolean).join(' · '), avatar: s, run: () => { location.hash = `#/students/${s.id}`; } }));
    res.lessons.forEach((l) => {
      const s = Store.student(l.studentId); if (!s) return;
      const hit = [['Тема', l.topic], ['Прошли', l.covered], ['Слова', l.words], ['ДЗ', l.homework], ['Заметка', l.note]].find(([, v]) => v && v.toLowerCase().includes(q.trim().toLowerCase()));
      out.push({ group: 'Записи уроков', title: `${s.name} · ${fmt.dm(l.date)}`, sub: hit ? `${hit[0]}: ${hit[1].slice(0, 90)}` : l.topic, avatar: s, run: () => Forms.lesson({ id: l.id }) });
    });
    nav.filter(([t]) => t.toLowerCase().includes(q.trim().toLowerCase())).forEach(([t, ic, run]) => out.push({ group: 'Действия', title: t, icon: ic, run }));
    return out;
  };

  UI.modal(`<div class="palette">
    <label class="palette-input">${icon('search', 20)}<input type="search" placeholder="Имя ученика, тема урока, слово из записей…" autofocus><kbd>Esc</kbd></label>
    <div class="palette-list" role="listbox"></div>
  </div>`, {
    cls: 'sheet-palette',
    onMount(sheet) {
      const input = $('input', sheet), list = $('.palette-list', sheet);
      let cur = [], idx = 0;
      const paint = () => {
        cur = items(input.value);
        idx = Math.min(idx, Math.max(0, cur.length - 1));
        let html = '', g = '';
        cur.forEach((it, i) => {
          if (it.group !== g) { g = it.group; html += `<div class="pal-group">${g}</div>`; }
          html += `<div class="pal-item ${i === idx ? 'on' : ''}" data-i="${i}" role="option">
            ${it.avatar ? Bits.avatar(it.avatar, 30) : `<span class="pal-ic">${icon(it.icon, 18)}</span>`}
            <span class="pal-t"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></div>`;
        });
        list.innerHTML = html || '<div class="pal-empty">Ничего не найдено</div>';
        const on = $('.pal-item.on', list); if (on) on.scrollIntoView({ block: 'nearest' });
      };
      const run = (i) => { const it = cur[i]; if (!it) return; UI.close(); setTimeout(it.run, 120); };
      input.addEventListener('input', () => { idx = 0; paint(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(cur.length - 1, idx + 1); paint(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); paint(); }
        else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
      });
      list.addEventListener('click', (e) => { const it = e.target.closest('.pal-item'); if (it) run(Number(it.dataset.i)); });
      list.addEventListener('mousemove', (e) => { const it = e.target.closest('.pal-item'); if (it && Number(it.dataset.i) !== idx) { idx = Number(it.dataset.i); $$('.pal-item', list).forEach((x, i) => x.classList.toggle('on', i === idx)); } });
      paint();
    },
  });
}

/* ---------- Старт ---------- */
window.addEventListener('hashchange', () => { VS.recordQuery = ''; VS.showAllHistory = false; render(); });
Store.subscribe(() => { applyTheme(); render(); scheduleBackup(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* Автокопии в программе для компьютера */
let backupTimer = null;
function scheduleBackup() {
  if (!window.desktop || Store.isEmpty()) return;
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => { window.desktop.saveBackup(Store.exportJSON()).then((ok) => { if (ok) Store.noteBackup(); }); }, 4000);
}

/* Обновление «сейчас» и продление расписания раз в минуту */
setInterval(() => {
  Store.ensureRegular();
  const a = document.activeElement;
  if (UI._stack.length || drag || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) return;
  if (['', 'today', 'schedule'].includes(route().name)) render();
}, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !UI._stack.length) { Store.ensureRegular(); render(); } });

renderChrome();
applyTheme();
Store.ensureRegular();
render();

if (window.desktop && Store.isEmpty()) {
  window.desktop.latestBackup().then(async (b) => {
    if (!b) return;
    const ok = await UI.confirm('Найдена резервная копия', `Нашлась копия данных от ${new Date(b.mtime).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Восстановить ваших учеников и уроки?`, 'Восстановить', false);
    if (!ok) return;
    try { Store.importJSON(b.text); UI.toast('Данные восстановлены из копии'); } catch (e) { UI.toast('Не удалось восстановить копию'); }
  });
}

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
