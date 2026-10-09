/* Роутер, навигация, обработчики действий */
'use strict';

const NAV = [
  { id: 'today', label: 'Сегодня', icon: 'sun' },
  { id: 'schedule', label: 'Расписание', icon: 'calendar' },
  { id: 'students', label: 'Ученики', icon: 'users' },
  { id: 'money', label: 'Доходы', icon: 'wallet' },
];

const Brand = `<span class="brand-mark" aria-hidden="true"><b>文</b><i>A</i></span>`;

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  return { name: parts[0], arg: parts[1] };
}

function renderChrome() {
  $('#sidebar').innerHTML = `
    <a class="brand" href="#/today">${Brand}<span><b>Мои уроки</b><small>планер репетитора</small></span></a>
    <button class="btn btn-primary btn-lg new-lesson-btn" data-act="new-lesson">${icon('plus', 20)} Новый урок</button>
    <nav class="side-nav">
      ${NAV.map((n) => `<a href="#/${n.id}" data-nav-id="${n.id}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
    </nav>
    <div class="side-foot"><a href="#/settings" data-nav-id="settings">${icon('settings')}<span>Настройки</span></a></div>`;

  const [a, b, c, d] = NAV;
  const tab = (n) => `<a href="#/${n.id}" data-nav-id="${n.id}">${icon(n.icon, 22)}<span>${n.label}</span></a>`;
  $('#tabbar').innerHTML = `${tab(a)}${tab(b)}
    <button class="fab" data-act="new-lesson" aria-label="Новый урок">${icon('plus', 26)}</button>
    ${tab(c)}${tab(d)}`;
}

let lastRouteKey = '';
function render() {
  const r = route();
  const key = r.name + '/' + (r.arg || '');
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
function markPaidForStudent(studentId) {
  const lessons = Calc.debts().filter((l) => l.studentId === studentId);
  if (!lessons.length) return;
  const ids = lessons.map((l) => l.id);
  Store.saveLessons(lessons.map((l) => ({ ...l, paid: true })));
  const s = Store.student(studentId);
  UI.toast(`${s ? s.name : 'Ученик'}: ${lessonsWord(ids.length)} отмечено оплаченными`, {
    action: 'Отменить',
    onAction: () => Store.saveLessons(ids.map((id) => ({ ...Store.lesson(id), paid: false }))),
  });
}

function exportCSV() {
  const [from, to] = Views._range();
  const rows = Store.lessonsBetween(from, to);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Дата', 'Время', 'Ученик', 'Язык', 'Минут', 'Стоимость', 'Статус', 'Оплачено', 'Тема'].map(q).join(';')];
  rows.forEach((l) => {
    const s = Store.student(l.studentId);
    lines.push([l.date, l.time, s ? s.name : '', LANGS[l.lang] ? LANGS[l.lang].name : '', l.duration, l.price, STATUSES[l.status].short,
      Calc.isPayable(l) ? (l.paid ? 'да' : 'нет') : '', l.topic].map(q).join(';'));
  });
  UI.download(`uroki-${from}_${to}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
  UI.toast(`Выгружено строк: ${rows.length}`);
}

const Actions = {
  'open-lesson': (el) => Forms.lesson({ id: el.dataset.id }),
  'new-lesson': (el) => Forms.lesson({ date: el.dataset.date, studentId: el.dataset.student, time: el.dataset.time }),
  'new-student': () => Forms.student(),
  'edit-student': (el) => Forms.student({ id: el.dataset.id }),

  'quick-done': (el) => {
    const id = el.dataset.id;
    Store.patchLesson(id, { status: 'done' });
    UI.toast('Урок отмечен как проведённый', { action: 'Уже оплачен', ms: 6000, onAction: () => Store.patchLesson(id, { paid: true }) });
  },
  'quick-cancel': (el) => {
    const id = el.dataset.id;
    Store.patchLesson(id, { status: 'canceled', paid: false });
    UI.toast('Урок отменён', { action: 'Вернуть', onAction: () => Store.patchLesson(id, { status: 'planned' }) });
  },
  'pay-student': (el) => markPaidForStudent(el.dataset.id),

  'slot': (el, ev) => {
    const rect = el.getBoundingClientRect();
    const rows = Number(el.closest('.sg').style.getPropertyValue('--rows')) || 1;
    const minutes = Number(el.dataset.start) + ((ev.clientY - rect.top) / rect.height) * rows * 60;
    Forms.lesson({ date: el.dataset.date, time: T.fromMin(Math.floor(minutes / 30) * 30) });
  },
  'go-day': (el) => {
    VS.schedDate = el.dataset.date;
    if (el.classList.contains('sg-day')) { VS.schedMode = 'day'; prefs.set('schedMode', 'day'); }
    render();
  },
  'sched-prev': () => { VS.schedDate = D.add(VS.schedDate, VS.schedMode === 'week' ? -7 : -1); render(); },
  'sched-next': () => { VS.schedDate = D.add(VS.schedDate, VS.schedMode === 'week' ? 7 : 1); render(); },
  'sched-today': () => { VS.schedDate = D.today(); render(); },

  'money-prev': () => { VS.moneyDate = VS.moneyMode === 'month' ? D.addMonths(VS.moneyDate, -1) : D.addMonths(VS.moneyDate, -12); render(); },
  'money-next': () => { VS.moneyDate = VS.moneyMode === 'month' ? D.addMonths(VS.moneyDate, 1) : D.addMonths(VS.moneyDate, 12); render(); },
  'pick-month': (el) => { VS.moneyDate = el.dataset.date; VS.moneyMode = 'month'; render(); },
  'export-csv': exportCSV,

  'export-json': () => {
    UI.download(`moi-uroki-kopiya-${D.today()}.json`, Store.exportJSON());
    Store.markBackup();
    UI.toast('Копия сохранена в загрузки');
  },
  'load-demo': async () => {
    if (!Store.isEmpty()) {
      const ok = await UI.confirm('Заменить данные примером?', 'Все ваши текущие ученики и уроки будут заменены демонстрационными. Сначала сохраните копию, если они вам нужны.', 'Заменить', true);
      if (!ok) return;
    }
    Store.loadDemo();
    location.hash = '#/today';
    UI.toast('Загружен пример данных. Удалить его можно в настройках.');
  },
  'reset-all': async () => {
    const ok = await UI.confirm('Удалить все данные?', 'Будут удалены все ученики, уроки и записи. Это действие нельзя отменить — сначала сохраните копию.', 'Удалить всё');
    if (!ok) return;
    Store.reset();
    UI.toast('Все данные удалены');
  },
};

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

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-act]')) {
    e.preventDefault();
    e.target.click();
  }
});

/* Фильтры, поля и настройки */
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'schedMode') { VS.schedMode = t.value; prefs.set('schedMode', t.value); render(); }
  else if (t.name === 'moneyMode') { VS.moneyMode = t.value; render(); }
  else if (t.name === 'studentLang') { VS.studentLang = t.value; $('#student-list').innerHTML = Views._studentList(); }
  else if (t.id === 'show-archived') { VS.showArchived = t.checked; $('#student-list').innerHTML = Views._studentList(); }
  else if (t.closest('.settings') && t.name) {
    let v = t.value;
    if (t.type === 'number') v = Math.max(0, Number(v) || 0);
    if (['dayStart', 'dayEnd'].includes(t.name)) v = Number(v);
    if (t.name === 'duration') v = Math.max(5, v);
    Store.saveSettings({ [t.name]: v });
    if (t.name === 'theme') applyTheme();
  } else if (t.id === 'import-file' && t.files[0]) {
    const file = t.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        JSON.parse(reader.result);
      } catch (err) { UI.toast('Не удалось прочитать файл — это точно копия из приложения?'); return; }
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

window.addEventListener('hashchange', () => { VS.recordQuery = ''; render(); });
Store.subscribe(() => { applyTheme(); render(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* Обновление «сейчас» раз в минуту */
setInterval(() => {
  const a = document.activeElement;
  if (UI._stack.length || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) return;
  if (['', 'today', 'schedule'].includes(route().name)) render();
}, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !UI._stack.length) render(); });

/* ---------- Старт ---------- */
renderChrome();
applyTheme();
render();

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
