/* Экраны приложения */
'use strict';

const prefs = {
  get(k, def) { try { const v = localStorage.getItem('tutor-ui-' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('tutor-ui-' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

const VS = {
  schedDate: D.today(),
  schedMode: prefs.get('schedMode', window.innerWidth < 860 ? 'day' : 'week'),
  moneyDate: D.today(),
  moneyMode: 'month',
  studentQuery: '',
  studentLang: 'all',
  showArchived: false,
  recordQuery: '',
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function pageHead(title, sub = '', actions = '') {
  return `<header class="page-head">
    <div class="page-title"><h1>${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div>
    <div class="page-actions">${actions}<a class="icon-btn head-gear" href="#/settings" aria-label="Настройки">${icon('settings')}</a></div>
  </header>`;
}

function tile(label, value, sub = '', { cls = '', attrs = '', extra = '' } = {}) {
  return `<div class="tile ${cls}" ${attrs}><div class="tile-label">${label}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}${extra}</div>`;
}

function lessonRow(l, { showDate = false, next = false } = {}) {
  const s = Store.student(l.studentId);
  if (!s) return '';
  const sub = l.topic || (l.status === 'planned' ? [s.level, fmt.dur(l.duration)].filter(Boolean).join(' · ') : fmt.dur(l.duration));
  const rel = next ? fmt.rel(l.date, l.time) : '';
  return `<div class="lrow st-${l.status} ${next ? 'is-next' : ''}" style="--c:${s.color}" data-act="open-lesson" data-id="${l.id}" tabindex="0" role="button">
    <div class="lr-time"><b>${showDate ? esc(fmt.cap(fmt.date(l.date, { weekday: 'short', day: 'numeric' }))) : l.time}</b><span>${showDate ? l.time : T.end(l.time, l.duration)}</span></div>
    <div class="lr-bar"></div>
    <div class="lr-main">
      <div class="lr-name">${esc(s.name)} ${Bits.langBadge(l.lang)}</div>
      <div class="lr-sub">${esc(sub)}</div>
    </div>
    <div class="lr-side">${rel ? `<span class="rel">${rel}</span>` : ''}${Bits.statusPill(l)}${Calc.isPayable(l) || l.status === 'planned' ? `<span class="lr-price">${Calc.money(l.price)}</span>` : ''}</div>
  </div>`;
}

const Views = {
  /* ==================== СЕГОДНЯ ==================== */
  today() {
    const t = D.today();
    const h = new Date().getHours();
    const greet = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    const todays = Store.lessonsOn(t);
    const active = todays.filter((l) => l.status !== 'canceled');
    const nowM = D.nowMinutes();
    const nextId = (todays.find((l) => l.status === 'planned' && T.toMin(l.time) + l.duration > nowM) || {}).id;
    const month = Calc.summary(Store.lessonsBetween(D.monthStart(t), D.monthEnd(t)));
    const debts = Calc.debts();
    const debtSum = debts.reduce((a, l) => a + (Number(l.price) || 0), 0);
    const needs = Store.needsMarking();
    const goal = Number(Store.settings.goal) || 0;
    const mins = active.reduce((a, l) => a + l.duration, 0);

    const upcomingDays = [1, 2, 3, 4, 5, 6].map((i) => D.add(t, i)).map((d) => ({ d, items: Store.lessonsOn(d).filter((l) => l.status !== 'canceled') })).filter((x) => x.items.length).slice(0, 4);

    const backupStale = !Store.isEmpty() && (!Store.data.meta.lastBackup || Date.now() - Store.data.meta.lastBackup > 30 * 864e5);

    const welcome = Store.isEmpty() ? `
      <div class="card welcome">
        <div class="welcome-art">${icon('sparkle', 28)}</div>
        <h2>Добро пожаловать!</h2>
        <p>Здесь будут ваше расписание, записи уроков и учёт заработка. Начните с добавления первого ученика — это займёт полминуты.</p>
        <div class="welcome-actions">
          <button class="btn btn-primary" data-act="new-student">${icon('plus', 18)} Добавить ученика</button>
          <button class="btn btn-soft" data-act="load-demo">Посмотреть на примере</button>
        </div>
      </div>` : '';

    return `
    ${pageHead(`${greet}!`, fmt.cap(fmt.long(t)), `<button class="btn btn-primary hide-mobile" data-act="new-lesson">${icon('plus', 18)} Новый урок</button>`)}
    ${welcome}
    ${backupStale ? `<div class="notice notice-info">${icon('download', 18)}<span>Данные хранятся только в этом браузере. Сохраните резервную копию, чтобы ничего не потерять.</span><a class="btn btn-soft btn-sm" href="#/settings">Сохранить копию</a></div>` : ''}
    ${Store.storageOk ? '' : `<div class="notice notice-warn">${icon('alert', 18)}<span>Браузер не даёт сохранять данные (приватный режим?). Изменения пропадут после закрытия вкладки.</span></div>`}

    <section class="tiles">
      ${tile('Сегодня', lessonsWord(active.length), active.length ? fmt.hours(mins) + ' занятий' : 'Свободный день')}
      ${tile(`Заработано · ${fmt.month(t).split(' ')[0]}`, Calc.money(month.earned), goal
        ? `Цель ${Calc.money(goal)} · ${Math.min(100, Math.round(month.earned / goal * 100))}%` : (month.plannedSum ? `ещё в планах ${Calc.money(month.plannedSum)}` : ''),
        { cls: 'tile-accent', attrs: 'data-nav="#/money"', extra: goal ? `<div class="meter"><i style="width:${Math.min(100, month.earned / goal * 100)}%"></i></div>` : '' })}
      ${tile('Ждут оплаты', Calc.money(debtSum), debts.length ? lessonsWord(debts.length) + ' без оплаты' : 'Все оплатили', { cls: debtSum ? 'tile-warn' : '', attrs: 'data-nav="#/money"' })}
    </section>

    <div class="cols">
      <div class="col-main">
        ${needs.length ? `
        <section class="block">
          <div class="block-head"><h2>Отметьте проведённые</h2><span class="badge badge-warn">${needs.length}</span></div>
          <div class="list">
            ${needs.slice(0, 6).map((l) => `
              <div class="needs">
                ${lessonRow(l, { showDate: l.date !== t })}
                <div class="needs-actions">
                  <button class="btn btn-sm btn-good" data-act="quick-done" data-id="${l.id}">${icon('check', 16)} Проведён</button>
                  <button class="btn btn-sm btn-soft" data-act="quick-cancel" data-id="${l.id}">${icon('x', 16)} Отменён</button>
                </div>
              </div>`).join('')}
            ${needs.length > 6 ? `<p class="muted center">…и ещё ${needs.length - 6}</p>` : ''}
          </div>
        </section>` : ''}

        <section class="block">
          <div class="block-head"><h2>Уроки сегодня</h2>
            <button class="btn btn-sm btn-soft" data-act="new-lesson" data-date="${t}">${icon('plus', 16)} Добавить</button></div>
          <div class="list">
            ${todays.length ? todays.map((l) => lessonRow(l, { next: l.id === nextId })).join('')
              : Bits.empty('sun', 'На сегодня уроков нет', 'Можно отдохнуть или запланировать занятие.')}
          </div>
        </section>
      </div>

      <div class="col-side">
        <section class="block">
          <div class="block-head"><h2>Ближайшие дни</h2><a href="#/schedule" class="link">Расписание</a></div>
          ${upcomingDays.length ? upcomingDays.map(({ d, items }) => `
            <div class="day-group">
              <div class="day-group-title">${esc(fmt.cap(fmt.date(d, { weekday: 'long', day: 'numeric', month: 'long' })))}<span>${lessonsWord(items.length)}</span></div>
              <div class="list">${items.map((l) => lessonRow(l)).join('')}</div>
            </div>`).join('') : '<p class="muted pad">На ближайшие дни уроков не запланировано.</p>'}
        </section>
        ${Views._debtsBlock(debts)}
      </div>
    </div>`;
  },

  _debtsBlock(debts) {
    if (!debts.length) return '';
    const byStudent = {};
    debts.forEach((l) => { (byStudent[l.studentId] = byStudent[l.studentId] || []).push(l); });
    const rows = Object.entries(byStudent).map(([sid, ls]) => ({ s: Store.student(sid), ls, sum: ls.reduce((a, l) => a + (Number(l.price) || 0), 0) }))
      .filter((r) => r.s).sort((a, b) => b.sum - a.sum);
    return `<section class="block">
      <div class="block-head"><h2>Долги учеников</h2></div>
      <div class="list">
        ${rows.map((r) => `
        <div class="debt-row">
          <a href="#/students/${r.s.id}" class="debt-who">${Bits.avatar(r.s, 34)}<span><b>${esc(r.s.name)}</b><small>${lessonsWord(r.ls.length)}</small></span></a>
          <span class="debt-sum">${Calc.money(r.sum)}</span>
          <button class="btn btn-sm btn-soft" data-act="pay-student" data-id="${r.s.id}" title="Отметить все проведённые уроки оплаченными">${icon('check', 16)} Оплатил</button>
        </div>`).join('')}
      </div>
    </section>`;
  },

  /* ==================== РАСПИСАНИЕ ==================== */
  schedule() {
    const mode = VS.schedMode;
    const t = D.today();
    const date = VS.schedDate;
    const ws = D.weekStart(date);
    const days = mode === 'week' ? Array.from({ length: 7 }, (_, i) => D.add(ws, i)) : [date];
    const weekDays = Array.from({ length: 7 }, (_, i) => D.add(ws, i));

    let label;
    if (mode === 'week') {
      const a = D.parse(ws), b = D.parse(D.add(ws, 6));
      label = a.getMonth() === b.getMonth()
        ? `${a.getDate()}–${b.getDate()} ${fmt.date(ws, { month: 'long' })} ${b.getFullYear()}`
        : `${a.getDate()} ${fmt.date(ws, { month: 'short' }).replace('.', '')} – ${b.getDate()} ${fmt.date(D.add(ws, 6), { month: 'short' }).replace('.', '')} ${b.getFullYear()}`;
    } else label = fmt.cap(fmt.long(date));

    const weekLessons = Store.lessonsBetween(ws, D.add(ws, 6));
    const ws_sum = Calc.summary(weekLessons);

    return `
    ${pageHead('Расписание', '', `<button class="btn btn-primary hide-mobile" data-act="new-lesson" data-date="${date}">${icon('plus', 18)} Новый урок</button>`)}
    <div class="sched-bar">
      <div class="sched-nav">
        <button class="icon-btn" data-act="sched-prev" aria-label="Назад">${icon('left')}</button>
        <button class="icon-btn" data-act="sched-next" aria-label="Вперёд">${icon('right')}</button>
        <button class="btn btn-soft btn-sm" data-act="sched-today">Сегодня</button>
        <h2 class="sched-label">${esc(label)}</h2>
      </div>
      <div class="seg seg-sm" role="radiogroup">
        <label><input type="radio" name="schedMode" value="day" ${mode === 'day' ? 'checked' : ''}><span>День</span></label>
        <label><input type="radio" name="schedMode" value="week" ${mode === 'week' ? 'checked' : ''}><span>Неделя</span></label>
      </div>
    </div>
    <div class="daystrip ${mode === 'week' ? 'hide-desktop' : ''}">
      ${weekDays.map((d, i) => {
        const n = Store.lessonsOn(d).filter((l) => l.status !== 'canceled').length;
        return `<button class="ds ${d === date ? 'on' : ''} ${d === t ? 'today' : ''}" data-act="go-day" data-date="${d}"><small>${WEEKDAYS[i]}</small><b>${D.parse(d).getDate()}</b><i class="${n ? 'has' : ''}">${n || ''}</i></button>`;
      }).join('')}
    </div>
    <div class="card grid-card">${Views._grid(days)}</div>
    <p class="muted sched-foot">На неделе: ${lessonsWord(ws_sum.count + ws_sum.planned)} · ${fmt.hours(ws_sum.minutes + weekLessons.filter((l) => l.status === 'planned').reduce((a, l) => a + l.duration, 0))} · ${Calc.money(ws_sum.earned + ws_sum.plannedSum)}</p>`;
  },

  _grid(days) {
    const s = Store.settings;
    const t = D.today();
    const lessons = days.flatMap((d) => Store.lessonsOn(d));
    let startH = Number(s.dayStart), endH = Number(s.dayEnd);
    lessons.forEach((l) => {
      startH = Math.min(startH, Math.floor(T.toMin(l.time) / 60));
      endH = Math.max(endH, Math.ceil((T.toMin(l.time) + l.duration) / 60));
    });
    endH = Math.min(24, endH);
    const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
    const nowM = D.nowMinutes();

    const cols = days.map((d) => {
      const items = Store.lessonsOn(d).map((l) => ({ l, s: T.toMin(l.time), e: T.toMin(l.time) + Number(l.duration) }));
      // раскладка пересекающихся уроков по колонкам
      let cluster = [], clusterEnd = -1;
      const flush = () => {
        const ends = [];
        cluster.forEach((it) => { let c = 0; while (ends[c] > it.s) c++; ends[c] = it.e; it.col = c; });
        cluster.forEach((it) => { it.n = ends.length; });
        cluster = []; clusterEnd = -1;
      };
      items.forEach((it) => { if (cluster.length && it.s >= clusterEnd) flush(); cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e); });
      flush();

      const blocks = items.map(({ l, s: st, e, col, n }) => {
        const stu = Store.student(l.studentId); if (!stu) return '';
        const top = (st - startH * 60) / 60, height = Math.max((e - st) / 60, 0.4);
        const unpaid = Calc.isPayable(l) && !l.paid;
        return `<div class="lb st-${l.status}" data-act="open-lesson" data-id="${l.id}" tabindex="0" role="button"
          style="--c:${stu.color};top:calc(${top} * var(--hh));height:calc(${height} * var(--hh) - 2px);left:calc(${col / n * 100}% + 2px);width:calc(${100 / n}% - 4px)">
          <div class="lb-time">${l.time}–${T.end(l.time, l.duration)}${unpaid ? '<i class="dot-unpaid" title="Не оплачен"></i>' : ''}${l.status === 'done' ? icon('check', 12) : ''}</div>
          <div class="lb-name">${esc(stu.name)}</div>
          <div class="lb-sub">${Bits.langBadge(l.lang)} ${esc(l.topic || '')}</div>
        </div>`;
      }).join('');

      const nowLine = d === t && nowM >= startH * 60 && nowM <= endH * 60
        ? `<div class="now-line" style="top:calc(${(nowM - startH * 60) / 60} * var(--hh))"></div>` : '';
      return `<div class="sg-col ${d === t ? 'is-today' : ''}" data-act="slot" data-date="${d}" data-start="${startH * 60}">${blocks}${nowLine}</div>`;
    }).join('');

    const head = days.map((d) => `<button class="sg-day ${d === t ? 'today' : ''}" data-act="go-day" data-date="${d}">
        <small>${WEEKDAYS[D.weekdayIdx(d)]}</small><b>${D.parse(d).getDate()}</b></button>`).join('');

    return `<div class="sg ${days.length === 1 ? 'sg-single' : ''}" style="--cols:${days.length};--rows:${hours.length}" data-first-hour="${startH}">
      <div class="sg-head"><div class="sg-corner"></div>${head}</div>
      <div class="sg-body">
        <div class="sg-times">${hours.map((h) => `<div class="sg-time"><span>${pad(h)}:00</span></div>`).join('')}</div>
        <div class="sg-cols">${cols}</div>
      </div>
    </div>`;
  },

  /* ==================== УЧЕНИКИ ==================== */
  students() {
    return `
    ${pageHead('Ученики', '', `<button class="btn btn-primary" data-act="new-student">${icon('plus', 18)}<span>Новый ученик</span></button>`)}
    ${Store.data.students.length ? `
    <div class="toolbar">
      <label class="search">${icon('search', 18)}<input type="search" id="student-search" placeholder="Поиск по имени, контакту, заметкам" value="${esc(VS.studentQuery)}"></label>
      <div class="seg seg-sm" role="radiogroup">
        ${[['all', 'Все'], ['en', 'Английский'], ['zh', 'Китайский']].map(([v, n]) => `<label><input type="radio" name="studentLang" value="${v}" ${VS.studentLang === v ? 'checked' : ''}><span>${n}</span></label>`).join('')}
      </div>
      <label class="switch switch-sm"><input type="checkbox" id="show-archived" ${VS.showArchived ? 'checked' : ''}><span class="track"></span><span class="switch-text">Архив</span></label>
    </div>` : ''}
    <div id="student-list">${Views._studentList()}</div>`;
  },

  _studentList() {
    if (!Store.data.students.length) {
      return Bits.empty('users', 'Пока нет учеников', 'Добавьте первого ученика, чтобы планировать уроки и вести записи.',
        `<button class="btn btn-primary" data-act="new-student">${icon('plus', 18)} Добавить ученика</button> <button class="btn btn-soft" data-act="load-demo">Пример данных</button>`);
    }
    const q = VS.studentQuery.trim().toLowerCase();
    const list = Store.students({ archived: VS.showArchived }).filter((s) => {
      if (VS.studentLang !== 'all' && s.lang !== VS.studentLang && s.lang !== 'both') return false;
      return !q || [s.name, s.contact, s.notes, s.level].join(' ').toLowerCase().includes(q);
    });
    if (!list.length) return Bits.empty('search', 'Никого не нашли', VS.showArchived ? 'В архиве пусто.' : 'Попробуйте изменить запрос или фильтр.');
    return `<div class="cards">${list.map((s) => {
      const ls = Store.lessonsOf(s.id);
      const sum = Calc.summary(ls);
      const next = Store.nextLesson(s.id);
      return `<a class="scard" href="#/students/${s.id}" style="--c:${s.color}">
        <div class="scard-top">${Bits.avatar(s, 46)}
          <div class="scard-name"><b>${esc(s.name)}</b>
            <span>${s.lang === 'both' ? Bits.langBadge('en') + Bits.langBadge('zh') : Bits.langBadge(s.lang)} ${s.level ? `<em>${esc(s.level)}</em>` : ''}</span></div>
          ${sum.unpaid ? `<span class="pill pill-unpaid" title="Долг">${Calc.money(sum.unpaid)}</span>` : ''}
        </div>
        <div class="scard-meta">
          <span>${icon('clock', 15)} ${next ? esc(fmt.cap(fmt.date(next.date, { weekday: 'short', day: 'numeric', month: 'short' }))) + ', ' + next.time : 'Нет записи'}</span>
          <span>${Calc.money(s.price)} / ${s.duration} мин</span>
        </div>
        <div class="scard-foot"><span>${lessonsWord(sum.count)} проведено</span><span>${Calc.money(sum.earned)}</span></div>
      </a>`;
    }).join('')}</div>`;
  },

  studentDetail(id) {
    const s = Store.student(id);
    if (!s) return `${pageHead('Ученик не найден')}${Bits.empty('users', 'Такого ученика нет', 'Возможно, он был удалён.', '<a class="btn btn-primary" href="#/students">К списку</a>')}`;
    const ls = Store.lessonsOf(id);
    const sum = Calc.summary(ls);
    const next = Store.nextLesson(id);
    const contact = s.contact ? (/^@\w+$/.test(s.contact) ? `<a href="https://t.me/${esc(s.contact.slice(1))}" target="_blank" rel="noopener">${icon('link', 15)} ${esc(s.contact)}</a>`
      : /^[+\d][\d\s()\-]{6,}$/.test(s.contact) ? `<a href="tel:${esc(s.contact.replace(/[^\d+]/g, ''))}">${icon('phone', 15)} ${esc(s.contact)}</a>` : `<span>${icon('phone', 15)} ${esc(s.contact)}</span>`) : '';

    return `
    <a href="#/students" class="back">${icon('left', 18)} Ученики</a>
    <section class="card profile" style="--c:${s.color}">
      ${Bits.avatar(s, 64)}
      <div class="profile-main">
        <h1>${esc(s.name)} ${s.archived ? '<span class="pill pill-cancel">Архив</span>' : ''}</h1>
        <div class="profile-meta">
          ${s.lang === 'both' ? Bits.langBadge('en') + Bits.langBadge('zh') : Bits.langBadge(s.lang)}
          ${s.level ? `<span class="chip-static">${esc(s.level)}</span>` : ''}
          <span>${Calc.money(s.price)} за ${s.duration} мин</span>
          ${contact}
        </div>
      </div>
      <div class="profile-actions">
        <button class="btn btn-primary" data-act="new-lesson" data-student="${s.id}">${icon('plus', 18)} Урок</button>
        <button class="btn btn-soft" data-act="edit-student" data-id="${s.id}">${icon('edit', 18)} Изменить</button>
      </div>
    </section>

    <section class="tiles tiles-4">
      ${tile('Проведено', lessonsWord(sum.count), fmt.hours(sum.minutes))}
      ${tile('Заработано', Calc.money(sum.earned), `получено ${Calc.money(sum.received)}`)}
      ${tile('К оплате', Calc.money(sum.unpaid), sum.unpaid ? `<button class="link-btn" data-act="pay-student" data-id="${s.id}">Отметить оплаченным</button>` : 'Долгов нет', { cls: sum.unpaid ? 'tile-warn' : '' })}
      ${tile('Следующий урок', next ? esc(fmt.cap(fmt.date(next.date, { weekday: 'short', day: 'numeric', month: 'short' }))) : '—', next ? `${next.time}–${T.end(next.time, next.duration)}` : 'не запланирован')}
    </section>

    ${s.notes ? `<section class="card note-card"><div class="note-title">${icon('note', 16)} Заметки об ученике</div><p>${esc(s.notes).replace(/\n/g, '<br>')}</p></section>` : ''}

    <section class="block">
      <div class="block-head"><h2>Уроки и записи</h2>
        <label class="search search-sm">${icon('search', 16)}<input type="search" id="record-search" placeholder="Поиск по записям" value="${esc(VS.recordQuery)}"></label></div>
      <div id="record-list">${Views._records(id)}</div>
    </section>`;
  },

  _records(id) {
    const ls = Store.lessonsOf(id);
    if (!ls.length) return Bits.empty('book', 'Уроков ещё нет', 'Запланируйте первый урок — записи появятся здесь.', `<button class="btn btn-primary" data-act="new-lesson" data-student="${id}">${icon('plus', 18)} Запланировать урок</button>`);
    const q = VS.recordQuery.trim().toLowerCase();
    const now = D.today() + T.fromMin(D.nowMinutes());
    const matches = (l) => !q || [l.topic, l.covered, l.words, l.homework, l.note].join(' ').toLowerCase().includes(q);
    const filtered = ls.filter(matches);
    if (!filtered.length) return '<p class="muted pad">По запросу ничего не найдено.</p>';
    const upcoming = filtered.filter((l) => l.status === 'planned' && l.date + l.time >= now).reverse();
    const history = filtered.filter((l) => !upcoming.includes(l));
    const card = (l) => {
      const rec = [['Что прошли', l.covered], ['Новые слова', l.words], ['Домашнее задание', l.homework], ['Заметка', l.note]].filter(([, v]) => v);
      return `<article class="rec st-${l.status}" data-act="open-lesson" data-id="${l.id}" tabindex="0" role="button">
        <div class="rec-head">
          <div class="rec-date"><b>${esc(fmt.cap(fmt.date(l.date, { weekday: 'short', day: 'numeric', month: 'long', year: l.date.slice(0, 4) !== D.today().slice(0, 4) ? 'numeric' : undefined })))}</b><span>${l.time}–${T.end(l.time, l.duration)}</span> ${Bits.langBadge(l.lang)}</div>
          <div class="rec-pills">${Bits.statusPill(l)}<span class="lr-price">${Calc.money(l.price)}</span></div>
        </div>
        ${l.topic ? `<div class="rec-topic">${esc(l.topic)}</div>` : ''}
        ${rec.map(([k, v]) => `<div class="rec-row ${k === 'Домашнее задание' ? 'hw' : ''}"><small>${k}</small><p>${esc(v).replace(/\n/g, '<br>')}</p></div>`).join('')}
        ${!l.topic && !rec.length && l.status === 'done' ? '<p class="muted rec-empty">Записи нет — нажмите, чтобы добавить</p>' : ''}
      </article>`;
    };
    return `${upcoming.length ? `<div class="group-title">Предстоящие</div><div class="recs">${upcoming.map(card).join('')}</div>` : ''}
      ${history.length ? `<div class="group-title">История</div><div class="recs">${history.map(card).join('')}</div>` : ''}`;
  },

  /* ==================== ДОХОДЫ ==================== */
  money() {
    const mode = VS.moneyMode, date = VS.moneyDate, t = D.today();
    const [from, to] = Views._range();
    const lessons = Store.lessonsBetween(from, to);
    const sum = Calc.summary(lessons);
    const label = mode === 'month' ? fmt.cap(fmt.month(date)) : `${date.slice(0, 4)} год`;
    const goal = Number(Store.settings.goal) || 0;

    // 12 столбцов
    const months = mode === 'month'
      ? Array.from({ length: 12 }, (_, i) => D.addMonths(D.monthStart(date), i - 11))
      : Array.from({ length: 12 }, (_, i) => `${date.slice(0, 4)}-${pad(i + 1)}-01`);
    const data = months.map((m) => ({ m, s: Calc.summary(Store.lessonsBetween(m, D.monthEnd(m))) }));
    const max = Math.max(1, ...data.map((x) => x.s.earned + x.s.plannedSum));
    const sel = D.monthStart(date);

    // по языкам и ученикам
    const byLang = {}; const byStu = {};
    lessons.forEach((l) => {
      (byLang[l.lang] = byLang[l.lang] || []).push(l);
      (byStu[l.studentId] = byStu[l.studentId] || []).push(l);
    });
    const stuRows = Object.entries(byStu).map(([sid, ls]) => ({ s: Store.student(sid), sm: Calc.summary(ls) }))
      .filter((r) => r.s && (r.sm.count || r.sm.planned)).sort((a, b) => b.sm.earned - a.sm.earned || b.sm.plannedSum - a.sm.plannedSum);
    const maxStu = Math.max(1, ...stuRows.map((r) => r.sm.earned));
    const avg = sum.count ? sum.earned / sum.count : 0;
    const perHour = sum.minutes ? sum.earned / (sum.minutes / 60) : 0;

    const debts = Calc.debts();

    return `
    ${pageHead('Доходы', '', `<button class="btn btn-soft" data-act="export-csv">${icon('download', 18)}<span class="hide-mobile">Выгрузить CSV</span></button>`)}
    <div class="sched-bar">
      <div class="sched-nav">
        <button class="icon-btn" data-act="money-prev" aria-label="Назад">${icon('left')}</button>
        <button class="icon-btn" data-act="money-next" aria-label="Вперёд">${icon('right')}</button>
        <h2 class="sched-label">${esc(label)}</h2>
      </div>
      <div class="seg seg-sm" role="radiogroup">
        <label><input type="radio" name="moneyMode" value="month" ${mode === 'month' ? 'checked' : ''}><span>Месяц</span></label>
        <label><input type="radio" name="moneyMode" value="year" ${mode === 'year' ? 'checked' : ''}><span>Год</span></label>
      </div>
    </div>

    <section class="tiles tiles-4">
      ${tile('Заработано', Calc.money(sum.earned), `${lessonsWord(sum.count)} · ${fmt.hours(sum.minutes)}`, { cls: 'tile-accent' })}
      ${tile('Получено', Calc.money(sum.received), sum.earned ? `${Math.round(sum.received / sum.earned * 100)}% от заработанного` : '', { cls: 'tile-good' })}
      ${tile('Не оплачено', Calc.money(sum.unpaid), sum.unpaid ? 'нужно напомнить' : 'всё оплачено', { cls: sum.unpaid ? 'tile-warn' : '' })}
      ${tile('В планах', Calc.money(sum.plannedSum), sum.planned ? `${lessonsWord(sum.planned)} впереди` : 'нет запланированных')}
    </section>

    ${mode === 'month' && goal ? `<section class="card goal">
      <div class="goal-row"><b>Цель на месяц</b><span>${Calc.money(sum.earned)} из ${Calc.money(goal)}</span></div>
      <div class="meter meter-lg"><i class="m-done" style="width:${Math.min(100, sum.earned / goal * 100)}%"></i><i class="m-plan" style="width:${Math.min(100 - Math.min(100, sum.earned / goal * 100), sum.plannedSum / goal * 100)}%"></i></div>
      <p class="muted">${sum.earned >= goal ? 'Цель достигнута — отличный месяц!' : `Осталось ${Calc.money(goal - sum.earned)}${sum.plannedSum ? ` · запланированные уроки закроют ${Math.min(100, Math.round((sum.earned + sum.plannedSum) / goal * 100))}% цели` : ''}`}</p>
    </section>` : ''}

    <section class="card chart-card">
      <div class="block-head"><h2>${mode === 'month' ? 'Последние 12 месяцев' : 'Помесячно'}</h2>
        <div class="legend"><span><i class="lg-rec"></i>Получено</span><span><i class="lg-unp"></i>Не оплачено</span><span><i class="lg-plan"></i>В планах</span></div></div>
      <div class="bars">
        ${data.map(({ m, s: x }) => {
          const total = x.earned + x.plannedSum;
          const h = (v) => (v / max * 100).toFixed(2);
          const isSel = mode === 'month' ? m === sel : false;
          return `<button class="bar ${isSel ? 'on' : ''} ${m.slice(0, 7) === t.slice(0, 7) ? 'cur' : ''}" data-act="pick-month" data-date="${m}" title="${esc(fmt.cap(fmt.month(m)))}: заработано ${Calc.money(x.earned)}${x.plannedSum ? ', в планах ' + Calc.money(x.plannedSum) : ''}">
            <span class="bar-val">${total ? Math.round(total / 100) / 10 + 'к' : ''}</span>
            <span class="bar-stack">
              ${x.plannedSum ? `<i class="b-plan" style="height:${h(x.plannedSum)}%"></i>` : ''}
              ${x.unpaid ? `<i class="b-unp" style="height:${h(x.unpaid)}%"></i>` : ''}
              ${x.received ? `<i class="b-rec" style="height:${h(x.received)}%"></i>` : ''}
            </span>
            <span class="bar-lbl">${esc(fmt.monthShort(m))}</span>
          </button>`;
        }).join('')}
      </div>
    </section>

    <div class="cols">
      <div class="col-main">
        <section class="block">
          <div class="block-head"><h2>По ученикам</h2></div>
          ${stuRows.length ? `<div class="card table">
            ${stuRows.map(({ s, sm }) => `
            <a class="trow" href="#/students/${s.id}" style="--c:${s.color}">
              <span class="t-who">${Bits.avatar(s, 32)}<b>${esc(s.name)}</b></span>
              <span class="t-meta">${lessonsWord(sm.count)} · ${fmt.hours(sm.minutes)}</span>
              <span class="t-sum"><b>${Calc.money(sm.earned)}</b>${sm.unpaid ? `<small class="warn-text">не оплачено ${Calc.money(sm.unpaid)}</small>` : ''}</span>
              <span class="t-bar"><i style="width:${sm.earned / maxStu * 100}%"></i></span>
            </a>`).join('')}
          </div>` : Bits.empty('wallet', 'Нет данных за период', 'Когда вы отметите проведённые уроки, здесь появится статистика.')}
        </section>
      </div>
      <div class="col-side">
        <section class="block">
          <div class="block-head"><h2>Показатели</h2></div>
          <div class="card kv">
            <div><span>Средний чек урока</span><b>${Calc.money(avg)}</b></div>
            <div><span>Доход в час</span><b>${Calc.money(perHour)}</b></div>
            <div><span>Отмен учениками</span><b>${sum.canceled}</b></div>
            ${Object.values(LANGS).map((l) => { const sm = Calc.summary(byLang[l.code] || []); return `<div><span>${Bits.langBadge(l.code)} ${l.name}</span><b>${Calc.money(sm.earned)}</b></div>`; }).join('')}
          </div>
        </section>
        ${Views._debtsBlock(debts)}
      </div>
    </div>`;
  },

  _range() {
    const d = VS.moneyDate;
    return VS.moneyMode === 'month' ? [D.monthStart(d), D.monthEnd(d)] : [`${d.slice(0, 4)}-01-01`, `${d.slice(0, 4)}-12-31`];
  },

  /* ==================== НАСТРОЙКИ ==================== */
  settings() {
    const s = Store.settings;
    const last = Store.data.meta.lastBackup;
    return `
    <a href="#/today" class="back hide-desktop">${icon('left', 18)} Назад</a>
    ${pageHead('Настройки', 'Всё сохраняется автоматически')}
    <div class="settings">
      <section class="card sblock">
        <h3>Оформление</h3>
        <div class="seg" role="radiogroup">
          ${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([v, n]) => `<label><input type="radio" name="theme" value="${v}" ${s.theme === v ? 'checked' : ''}><span>${n}</span></label>`).join('')}
        </div>
      </section>

      <section class="card sblock">
        <h3>Работа и доход</h3>
        <div class="grid2">
          <label class="field"><span class="label">Валюта</span>
            <select name="currency">${['₽', '$', '€', '¥', '₸', '₴', 'Br', '£'].map((c) => `<option ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="field"><span class="label">Длительность урока по умолчанию, мин</span><input type="number" name="duration" min="5" max="480" step="5" value="${s.duration}"></label>
          <label class="field"><span class="label">Начало дня в расписании</span>
            <select name="dayStart">${Array.from({ length: 13 }, (_, i) => `<option value="${i}" ${Number(s.dayStart) === i ? 'selected' : ''}>${pad(i)}:00</option>`).join('')}</select></label>
          <label class="field"><span class="label">Конец дня в расписании</span>
            <select name="dayEnd">${Array.from({ length: 12 }, (_, i) => i + 13).map((i) => `<option value="${i}" ${Number(s.dayEnd) === i ? 'selected' : ''}>${pad(i % 24)}:00</option>`).join('')}</select></label>
          <label class="field span2"><span class="label">Цель по доходу на месяц (0 — без цели)</span><input type="number" name="goal" min="0" step="1000" value="${s.goal}" inputmode="numeric"></label>
        </div>
      </section>

      <section class="card sblock">
        <h3>Резервная копия</h3>
        <p class="muted">Данные хранятся только в этом браузере на этом устройстве. Сохраняйте файл-копию раз в неделю-две — и восстановить всё можно будет на любом устройстве.</p>
        <p class="backup-status ${last ? '' : 'warn-text'}">${last ? `Последняя копия: ${new Date(last).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : 'Копия ещё не создавалась'}</p>
        <div class="btn-row">
          <button class="btn btn-primary" data-act="export-json">${icon('download', 18)} Скачать копию</button>
          <label class="btn btn-soft">${icon('upload', 18)} Восстановить из файла<input type="file" id="import-file" accept="application/json,.json" hidden></label>
        </div>
      </section>

      <section class="card sblock">
        <h3>Данные</h3>
        <div class="btn-row">
          <button class="btn btn-soft" data-act="load-demo">${icon('sparkle', 18)} Загрузить пример</button>
          <button class="btn btn-ghost-danger" data-act="reset-all">${icon('trash', 18)} Удалить все данные</button>
        </div>
        <p class="muted small">${lessonsWord(Store.data.lessons.length)} · учеников: ${Store.data.students.length}</p>
      </section>
    </div>`;
  },
};
