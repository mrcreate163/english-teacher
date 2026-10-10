/* Экраны приложения */
'use strict';

const prefs = {
  get(k, def) { try { const v = localStorage.getItem('tutor-ui-' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('tutor-ui-' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

const VS = {
  schedDate: D.today(),
  schedMode: prefs.get('schedMode2', window.innerWidth < 860 ? 'day' : 'week'),
  moneyDate: D.today(),
  moneyMode: 'month',
  studentQuery: '',
  studentLang: 'all',
  showArchived: false,
  recordQuery: '',
  showAllPayments: false,
  showAllHistory: false,
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

function regularText(s) {
  return (s.regular || []).map((r) => `${WEEKDAYS[r.wd]} ${r.time}`).join(', ');
}

function lessonRow(l, { showDate = false, next = false, remind = false } = {}) {
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
    ${remind && l.status === 'planned' ? `<button class="icon-btn mini" data-act="copy-reminder" data-id="${l.id}" title="Скопировать напоминание ученику" aria-label="Скопировать напоминание">${icon('copy', 17)}</button>` : ''}
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
    const dues = Calc.dueRows();
    const dueSum = dues.reduce((a, r) => a + r.due, 0);
    const needs = Store.needsMarking();
    const goal = Number(Store.settings.goal) || 0;
    const mins = active.reduce((a, l) => a + l.duration, 0);
    const off = Store.offOn(t);
    const hero = Store.upcoming(1)[0];
    const shownNeeds = new Set(needs.slice(0, 6).map((l) => l.id));
    const todayList = todays.filter((l) => !shownNeeds.has(l.id));

    const upcomingDays = [1, 2, 3, 4, 5, 6].map((i) => D.add(t, i)).map((d) => ({ d, items: Store.lessonsOn(d).filter((l) => l.status !== 'canceled') })).filter((x) => x.items.length).slice(0, 4);
    const backupStale = !Store.isEmpty() && !Store.data.meta.demo && !window.desktop && (!Store.data.meta.lastBackup || Date.now() - Store.data.meta.lastBackup > 30 * 864e5);

    if (Store.isEmpty()) return Views._welcome(greet, t);

    return `
    ${pageHead(`${greet}!`, fmt.cap(fmt.long(t)), `<button class="btn btn-primary hide-mobile" data-act="new-lesson">${icon('plus', 18)} Новый урок</button>`)}
    ${Store.data.meta.demo ? `<div class="notice notice-info">${icon('sparkle', 18)}<span><b>Это пример данных</b> — потрогайте всё что угодно. Когда будете готовы, начните с чистого листа.</span><button class="btn btn-primary btn-sm" data-act="reset-all">Начать с нуля</button></div>` : ''}
    ${backupStale ? `<div class="notice notice-info">${icon('download', 18)}<span>Данные хранятся только в этом браузере. Сохраните резервную копию, чтобы ничего не потерять.</span><a class="btn btn-soft btn-sm" href="#/settings">Сохранить копию</a></div>` : ''}
    ${Store.storageOk ? '' : `<div class="notice notice-warn">${icon('alert', 18)}<span>Не удаётся сохранять данные (приватный режим браузера?). Изменения пропадут после закрытия.</span></div>`}
    ${off ? `<div class="notice notice-info">${icon('palm', 18)}<span>Сегодня у вас выходной${off.note ? ` — ${esc(off.note)}` : ''}</span></div>` : ''}

    <section class="tiles">
      ${tile('Сегодня', lessonsWord(active.length), active.length ? fmt.hours(mins) + ' занятий' : 'Свободный день')}
      ${tile(`Заработано · ${fmt.month(t).split(' ')[0]}`, Calc.money(month.earned), goal
        ? `Цель ${Calc.money(goal)} · ${Math.min(100, Math.round(month.earned / goal * 100))}%` : (month.plannedSum ? `ещё в планах ${Calc.money(month.plannedSum)}` : 'проведённые уроки'),
        { cls: 'tile-accent', attrs: 'data-nav="#/money"', extra: goal ? `<div class="meter"><i style="width:${Math.min(100, month.earned / goal * 100)}%"></i></div>` : '' })}
      ${tile('Ждут оплаты', Calc.money(dueSum), dues.length ? `${dues.length} ${plural(dues.length, ['ученик', 'ученика', 'учеников'])}` : 'Все оплатили', { cls: dueSum ? 'tile-warn' : '', attrs: 'data-nav="#/money"' })}
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
                  <button class="btn btn-sm btn-ghost" data-act="open-lesson" data-id="${l.id}">Записать итоги</button>
                </div>
              </div>`).join('')}
            ${needs.length > 6 ? `<p class="muted center">…и ещё ${needs.length - 6}</p>` : ''}
          </div>
        </section>` : ''}

        ${hero ? Views._hero(hero) : ''}

        <section class="block">
          <div class="block-head"><h2>Уроки сегодня</h2>
            <button class="btn btn-sm btn-soft" data-act="new-lesson" data-date="${t}">${icon('plus', 16)} Добавить</button></div>
          <div class="list">
            ${todayList.length ? todayList.map((l) => lessonRow(l, { next: l.id === nextId, remind: false })).join('')
              : todays.length ? '<p class="muted pad">Остальных уроков на сегодня нет.</p>' : Bits.empty('sun', 'На сегодня уроков нет', 'Можно отдохнуть или запланировать занятие.')}
          </div>
        </section>
      </div>

      <div class="col-side">
        <section class="block">
          <div class="block-head"><h2>Ближайшие дни</h2><a href="#/schedule" class="link">Расписание</a></div>
          ${upcomingDays.length ? upcomingDays.map(({ d, items }) => `
            <div class="day-group">
              <div class="day-group-title">${esc(fmt.cap(fmt.date(d, { weekday: 'long', day: 'numeric', month: 'long' })))}<span>${lessonsWord(items.length)}</span></div>
              <div class="list">${items.map((l) => lessonRow(l, { remind: true })).join('')}</div>
            </div>`).join('') : '<p class="muted pad">На ближайшие дни уроков не запланировано.</p>'}
        </section>
        ${Views._debtsBlock(dues)}
      </div>
    </div>`;
  },

  _welcome(greet, t) {
    return `
    ${pageHead(`${greet}!`, fmt.cap(fmt.long(t)))}
    <section class="card welcome">
      <div class="welcome-art">${icon('sparkle', 28)}</div>
      <h2>Добро пожаловать в «Мои уроки»</h2>
      <p>Расписание, записи занятий и заработок — в одном месте. Всё делается в три шага:</p>
      <ol class="steps">
        <li><span>1</span><div><b>Добавьте ученика</b><small>Имя, язык и стоимость урока — больше ничего не нужно.</small></div></li>
        <li><span>2</span><div><b>Укажите дни занятий</b><small>Например, «Пн 16:00, Чт 16:00» — уроки сами появятся в расписании на недели вперёд.</small></div></li>
        <li><span>3</span><div><b>После урока нажмите «Проведён»</b><small>Тема и домашнее задание сохранятся, а доход и долги посчитаются сами.</small></div></li>
      </ol>
      <div class="welcome-actions">
        <button class="btn btn-primary btn-lg" data-act="new-student">${icon('plus', 20)} Добавить первого ученика</button>
        <button class="btn btn-soft btn-lg" data-act="load-demo">Посмотреть на примере</button>
      </div>
      <p class="muted small welcome-foot"><span>${icon('keyboard', 16)} Подсказка: нажмите <kbd>?</kbd>, чтобы увидеть горячие клавиши.</span><span>Все данные хранятся только на вашем компьютере.</span></p>
    </section>`;
  },

  _hero(l) {
    const s = Store.student(l.studentId);
    if (!s) return '';
    const t = D.today();
    const last = Store.lastLessonBefore(s.id, l.date, l.time, l.id);
    const now = l.date === t && T.toMin(l.time) <= D.nowMinutes();
    const when = now ? 'Идёт сейчас' : l.date === t ? 'Следующий урок' : l.date === D.add(t, 1) ? 'Следующий урок · завтра' : 'Следующий урок · ' + fmt.date(l.date, { weekday: 'long', day: 'numeric', month: 'long' });
    const rel = l.date === t ? fmt.rel(l.date, l.time) : '';
    const hw = last && last.homework;
    const prevText = last ? [last.topic, last.covered].filter(Boolean).join(' — ') : '';
    const bal = Store.account(s.id).prepaid;
    return `
    <section class="hero" style="--c:${s.color}">
      <div class="hero-top"><span class="hero-label">${esc(when)}</span>${rel ? `<span class="rel">${rel}</span>` : ''}</div>
      <div class="hero-main">
        ${Bits.avatar(s, 52)}
        <div class="hero-who"><h2>${esc(s.name)} ${Bits.langBadge(l.lang)}</h2>
          <span class="muted">${l.time}–${T.end(l.time, l.duration)} · ${fmt.dur(l.duration)}${s.level ? ' · ' + esc(s.level) : ''}</span></div>
        <div class="hero-price">${Calc.money(l.price)}${bal > 0 ? `<small>на балансе ${Calc.money(bal)}</small>` : ''}</div>
      </div>
      ${last ? `
      <div class="hero-cols">
        <div><small>Прошлый раз · ${esc(fmt.dm(last.date))}</small><p>${esc(prevText || 'Записи нет')}</p></div>
        <div class="${hw ? 'hw' : ''}"><small>Проверить домашнее задание</small><p>${esc(hw || 'Задания не было')}</p></div>
      </div>` : `<p class="muted hero-first">Первый урок с этим учеником — запись появится здесь после занятия.</p>`}
      ${s.notes ? `<div class="hero-note">${icon('note', 15)} <span>${esc(s.notes.length > 140 ? s.notes.slice(0, 140) + '…' : s.notes)}</span></div>` : ''}
      <div class="hero-actions">
        <button class="btn btn-primary" data-act="open-lesson" data-id="${l.id}">${now ? 'Записать итоги' : 'Открыть урок'}</button>
        <button class="btn btn-soft" data-act="copy-reminder" data-id="${l.id}">${icon('copy', 17)} Напомнить ученику</button>
        <a class="btn btn-ghost" href="#/students/${s.id}">Карточка ученика</a>
      </div>
    </section>`;
  },

  _debtsBlock(rows) {
    if (!rows.length) return '';
    return `<section class="block">
      <div class="block-head"><h2>Ждут оплаты</h2></div>
      <div class="list">
        ${rows.map((r) => `
        <div class="debt-row">
          <a href="#/students/${r.s.id}" class="debt-who">${Bits.avatar(r.s, 34)}<span><b>${esc(r.s.name)}</b><small>${lessonsWord(r.ls.length)}${r.balance ? ` · предоплата ${Calc.money(r.balance)}` : ''}</small></span></a>
          <span class="debt-sum">${Calc.money(r.due)}</span>
          <button class="btn btn-sm btn-soft" data-act="pay-due" data-id="${r.s.id}" title="Ученик заплатил всю сумму">${icon('check', 16)} Оплатил</button>
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
    const weekDays = Array.from({ length: 7 }, (_, i) => D.add(ws, i));
    const days = mode === 'week' ? weekDays : [date];

    let label;
    if (mode === 'month') label = fmt.cap(fmt.month(date));
    else if (mode === 'week') {
      const a = D.parse(ws), b = D.parse(D.add(ws, 6));
      label = a.getMonth() === b.getMonth()
        ? `${a.getDate()}–${b.getDate()} ${fmt.date(ws, { month: 'long' })} ${b.getFullYear()}`
        : `${a.getDate()} ${fmt.date(ws, { month: 'short' }).replace('.', '')} – ${b.getDate()} ${fmt.date(D.add(ws, 6), { month: 'short' }).replace('.', '')} ${b.getFullYear()}`;
    } else label = fmt.cap(fmt.long(date));

    const range = mode === 'month' ? [D.monthStart(date), D.monthEnd(date)] : [ws, D.add(ws, 6)];
    const rangeLessons = Store.lessonsBetween(...range);
    const sm = Calc.summary(rangeLessons);
    const planMin = rangeLessons.filter((l) => l.status === 'planned').reduce((a, l) => a + l.duration, 0);

    return `
    ${pageHead('Расписание', '', `<button class="btn btn-soft" data-act="open-offs" title="Отпуск, болезнь, праздники">${icon('palm', 18)}<span class="hide-mobile">Выходные</span></button>
      <button class="btn btn-primary hide-mobile" data-act="new-lesson" data-date="${date}">${icon('plus', 18)} Новый урок</button>`)}
    <div class="sched-bar">
      <div class="sched-nav">
        <button class="icon-btn" data-act="sched-prev" aria-label="Назад" title="Назад (←)">${icon('left')}</button>
        <button class="icon-btn" data-act="sched-next" aria-label="Вперёд" title="Вперёд (→)">${icon('right')}</button>
        <button class="btn btn-soft btn-sm" data-act="sched-today" title="К сегодняшнему дню (T)">Сегодня</button>
        <h2 class="sched-label">${esc(label)}</h2>
      </div>
      <div class="seg seg-sm" role="radiogroup">
        <label><input type="radio" name="schedMode" value="day" ${mode === 'day' ? 'checked' : ''}><span>День</span></label>
        <label><input type="radio" name="schedMode" value="week" ${mode === 'week' ? 'checked' : ''}><span>Неделя</span></label>
        <label><input type="radio" name="schedMode" value="month" ${mode === 'month' ? 'checked' : ''}><span>Месяц</span></label>
      </div>
    </div>
    ${mode === 'month' ? '' : `<div class="daystrip ${mode === 'week' ? 'hide-desktop' : ''}">
      ${weekDays.map((d, i) => {
        const n = Store.lessonsOn(d).filter((l) => l.status !== 'canceled').length;
        return `<button class="ds ${d === date ? 'on' : ''} ${d === t ? 'today' : ''}" data-act="go-day" data-date="${d}"><small>${WEEKDAYS[i]}</small><b>${D.parse(d).getDate()}</b><i class="${n ? 'has' : ''}">${n || ''}</i></button>`;
      }).join('')}
    </div>`}
    ${mode === 'month' ? Views._month(date) : `<div class="card grid-card">${Views._grid(days)}</div>`}
    <div class="sched-foot">
      <span>${mode === 'month' ? 'В месяце' : 'На неделе'}: <b>${lessonsWord(sm.count + sm.planned)}</b> · ${fmt.hours(sm.minutes + planMin)} · ${Calc.money(sm.earned + sm.plannedSum)}</span>
      <span class="muted">${mode === 'month' ? 'Нажмите на день, чтобы открыть его' : 'Нажмите на свободное время, чтобы добавить урок. Урок можно перетащить, чтобы перенести.'}</span>
    </div>`;
  },

  _month(date) {
    const t = D.today();
    const first = D.weekStart(D.monthStart(date));
    const cells = Array.from({ length: 42 }, (_, i) => D.add(first, i));
    const rows = cells.length / 7;
    const curMonth = date.slice(0, 7);
    return `<div class="card month">
      <div class="month-head">${WEEKDAYS.map((w) => `<div>${w}</div>`).join('')}</div>
      <div class="month-grid" style="--rows:${rows}">
        ${cells.map((d) => {
          const ls = Store.lessonsOn(d).filter((l) => l.status !== 'canceled');
          const off = Store.offOn(d);
          const shown = ls.slice(0, 3);
          return `<div class="mc ${d.slice(0, 7) !== curMonth ? 'other' : ''} ${d === t ? 'today' : ''} ${off ? 'is-off' : ''}" data-act="go-day" data-date="${d}" data-open-day="1" title="${off ? esc(off.note || 'Выходной') : ''}">
            <div class="mc-top"><b>${D.parse(d).getDate()}</b>${off ? `<span class="mc-off">${icon('palm', 13)}</span>` : ''}${ls.length ? `<span class="mc-n">${ls.length}</span>` : ''}</div>
            ${shown.map((l) => { const s = Store.student(l.studentId); return s ? `<span class="mchip st-${l.status}" style="--c:${s.color}" data-act="open-lesson" data-id="${l.id}"><i>${l.time}</i> ${esc(Texts.first(s.name))}</span>` : ''; }).join('')}
            ${ls.length > 3 ? `<span class="mc-more">ещё ${ls.length - 3}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
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
        const unpaid = Calc.isPayable(l) && !Store.isPaid(l) && l.price > 0;
        return `<div class="lb st-${l.status}" data-act="open-lesson" data-id="${l.id}" data-drag="1" tabindex="0" role="button"
          title="${esc(stu.name)} · ${l.time}–${T.end(l.time, l.duration)}${l.topic ? ' · ' + esc(l.topic) : ''}"
          style="--c:${stu.color};top:calc(${top} * var(--hh));height:calc(${height} * var(--hh) - 2px);left:calc(${col / n * 100}% + 2px);width:calc(${100 / n}% - 4px)">
          <div class="lb-time"><span data-time>${l.time}–${T.end(l.time, l.duration)}</span>${unpaid ? '<i class="dot-unpaid" title="Не оплачен"></i>' : ''}${l.status === 'done' ? icon('check', 12) : ''}</div>
          <div class="lb-name">${esc(stu.name)}</div>
          <div class="lb-sub">${Bits.langBadge(l.lang)} ${esc(l.topic || '')}</div>
          <i class="lb-resize" data-resize title="Потяните, чтобы изменить длительность"></i>
        </div>`;
      }).join('');

      const nowLine = d === t && nowM >= startH * 60 && nowM <= endH * 60
        ? `<div class="now-line" style="top:calc(${(nowM - startH * 60) / 60} * var(--hh))"></div>` : '';
      const off = Store.offOn(d);
      return `<div class="sg-col ${d === t ? 'is-today' : ''} ${off ? 'is-off' : ''}" data-act="slot" data-date="${d}" data-start="${startH * 60}">${off ? `<div class="off-label">${icon('palm', 14)} ${esc(off.note || 'Выходной')}</div>` : ''}${blocks}${nowLine}</div>`;
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
      return Bits.empty('users', 'Пока нет учеников', 'Добавьте первого ученика — расписание и учёт дохода заработают сами.',
        `<div class="btn-row center-row"><button class="btn btn-primary" data-act="new-student">${icon('plus', 18)} Добавить ученика</button> <button class="btn btn-soft" data-act="load-demo">Пример данных</button></div>`);
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
      const acc = Store.account(s.id);
      const bal = acc.prepaid, due = acc.due;
      return `<a class="scard" href="#/students/${s.id}" style="--c:${s.color}">
        <div class="scard-top">${Bits.avatar(s, 46)}
          <div class="scard-name"><b>${esc(s.name)}</b>
            <span>${s.lang === 'both' ? Bits.langBadge('en') + Bits.langBadge('zh') : Bits.langBadge(s.lang)} ${s.level ? `<em>${esc(s.level)}</em>` : ''}</span></div>
          ${due > 0 ? `<span class="pill pill-unpaid" title="Долг">${Calc.money(due)}</span>` : bal > 0 ? `<span class="pill pill-paid" title="Предоплата">+${Calc.money(bal)}</span>` : ''}
        </div>
        <div class="scard-meta">
          <span>${icon('clock', 15)} ${next ? esc(fmt.cap(fmt.date(next.date, { weekday: 'short', day: 'numeric', month: 'short' }))) + ', ' + next.time : 'Нет записи'}</span>
          <span>${Calc.money(s.price)} / ${s.duration} мин</span>
        </div>
        ${(s.regular || []).length ? `<div class="scard-reg">${icon('repeat', 14)} ${esc(regularText(s))}</div>` : ''}
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
    const acc = Store.account(id);
    const bal = acc.prepaid, due = acc.due;
    const pays = Store.payments(id);
    const shownPays = VS.showAllPayments ? pays : pays.slice(0, 3);
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
      ${due > 0
        ? tile('К оплате', Calc.money(due), `<button class="link-btn" data-act="pay-student" data-id="${s.id}">Принять оплату</button>`, { cls: 'tile-warn' })
        : bal > 0
          ? tile('Предоплата', Calc.money(bal), `${s.price ? `хватит на ${lessonsWord(Math.floor(bal / s.price))} · ` : ''}<button class="link-btn" data-act="pay-student" data-id="${s.id}">Пополнить</button>`, { cls: 'tile-good' })
          : tile('Баланс', Calc.money(0), `расчёты в порядке · <button class="link-btn" data-act="pay-student" data-id="${s.id}">Принять оплату</button>`)}
      ${tile('Следующий урок', next ? esc(fmt.cap(fmt.date(next.date, { weekday: 'short', day: 'numeric', month: 'short' }))) : '—', next ? `${next.time}–${T.end(next.time, next.duration)}` : 'не запланирован')}
    </section>

    <div class="cols cols-student">
      <div class="col-main">
        <section class="block">
          <div class="block-head"><h2>Уроки и записи</h2>
            <label class="search search-sm">${icon('search', 16)}<input type="search" id="record-search" placeholder="Поиск по записям" value="${esc(VS.recordQuery)}"></label></div>
          <div id="record-list">${Views._records(id)}</div>
        </section>
      </div>
      <div class="col-side">
        <section class="block">
          <div class="block-head"><h2>Регулярные занятия</h2><button class="link-btn-plain" data-act="edit-regular" data-id="${s.id}">${(s.regular || []).length ? 'Изменить' : 'Настроить'}</button></div>
          <div class="card side-card">
            ${(s.regular || []).length ? `<div class="reg-chips">${s.regular.map((r) => `<span class="reg-chip">${WEEKDAYS[r.wd]} <b>${r.time}</b></span>`).join('')}</div>
              <p class="muted small">Уроки создаются автоматически на ${Store.settings.horizon} нед. вперёд.</p>`
              : `<p class="muted">Укажите дни и время — уроки появятся в расписании сами и будут продлеваться.</p>`}
          </div>
        </section>
        <section class="block">
          <div class="block-head"><h2>Оплаты</h2><button class="link-btn-plain" data-act="pay-student" data-id="${s.id}">+ Принять</button></div>
          <div class="card side-card">
            <p class="muted small pay-explain">Оплаты пополняют баланс ученика. Когда вы отмечаете урок проведённым, его стоимость сразу списывается с баланса.</p>
            ${pays.length ? shownPays.map((c) => { const pl = c.lessonId ? Store.lesson(c.lessonId) : null; return `<div class="pay-row"><div><b>${Calc.money(c.amount)}</b><small>${esc(fmt.date(c.date, { day: 'numeric', month: 'long' }))}${pl ? ' · за урок ' + esc(fmt.dm(pl.date)) : c.note ? ' · ' + esc(c.note) : ''}</small></div>
              <button class="icon-btn mini" data-act="del-payment" data-id="${c.id}" aria-label="Удалить оплату" title="Удалить оплату">${icon('trash', 16)}</button></div>`; }).join('')
              + (pays.length > 3 ? `<button class="link-btn-plain" data-act="toggle-payments">${VS.showAllPayments ? 'Свернуть' : `Показать все (${pays.length})`}</button>` : '')
              : '<p class="muted">Пока оплат нет.</p>'}
            <button class="btn btn-soft btn-sm full" data-act="report" data-id="${s.id}">${icon('note', 16)} Отчёт за месяц</button>
          </div>
        </section>
        ${s.notes ? `<section class="block"><div class="block-head"><h2>Заметки</h2></div><div class="card side-card note-text"><p>${esc(s.notes).replace(/\n/g, '<br>')}</p></div></section>` : ''}
      </div>
    </div>`;
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
    const limitU = q ? upcoming : upcoming.slice(0, 4);
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
    return `${limitU.length ? `<div class="group-title">Предстоящие${upcoming.length > limitU.length ? ` · ближайшие ${limitU.length} из ${upcoming.length}` : ''}</div><div class="recs">${limitU.map(card).join('')}</div>` : ''}
      ${history.length ? `<div class="group-title">История · ${history.length}</div><div class="recs">${(q || VS.showAllHistory ? history : history.slice(0, 8)).map(card).join('')}</div>${!q && history.length > 8 ? `<button class="btn btn-soft full" data-act="toggle-history">${VS.showAllHistory ? 'Свернуть историю' : `Показать всю историю (${history.length})`}</button>` : ''}` : ''}`;
  },

  /* ==================== ДОХОДЫ ==================== */
  money() {
    const mode = VS.moneyMode, date = VS.moneyDate, t = D.today();
    const [from, to] = Views._range();
    const lessons = Store.lessonsBetween(from, to);
    const sum = Calc.summary(lessons);
    const cash = Calc.cash(from, to);
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

    const dues = Calc.dueRows();
    const prepaid = Calc.prepaidTotal();
    const total = sum.earned + sum.plannedSum;

    return `
    ${pageHead('Доходы', '', `<button class="btn btn-soft" data-act="export-csv" title="Таблица уроков за выбранный период (откроется в Excel)">${icon('download', 18)}<span class="hide-mobile">Выгрузить в Excel</span></button>`)}
    <div class="sched-bar">
      <div class="sched-nav">
        <button class="icon-btn" data-act="money-prev" aria-label="Назад" title="Назад (←)">${icon('left')}</button>
        <button class="icon-btn" data-act="money-next" aria-label="Вперёд" title="Вперёд (→)">${icon('right')}</button>
        <button class="btn btn-soft btn-sm" data-act="money-today">Сегодня</button>
        <h2 class="sched-label">${esc(label)}</h2>
      </div>
      <div class="seg seg-sm" role="radiogroup">
        <label><input type="radio" name="moneyMode" value="month" ${mode === 'month' ? 'checked' : ''}><span>Месяц</span></label>
        <label><input type="radio" name="moneyMode" value="year" ${mode === 'year' ? 'checked' : ''}><span>Год</span></label>
      </div>
    </div>

    <section class="tiles tiles-4">
      ${tile('Заработано', Calc.money(sum.earned), `${lessonsWord(sum.count)} · ${fmt.hours(sum.minutes)}`, { cls: 'tile-accent' })}
      ${tile('Поступило денег', Calc.money(cash), 'оплаты за этот период', { cls: 'tile-good' })}
      ${tile('Не оплачено', Calc.money(sum.unpaid), sum.unpaid ? 'за проведённые уроки' : 'всё оплачено', { cls: sum.unpaid ? 'tile-warn' : '' })}
      ${tile('В планах', Calc.money(sum.plannedSum), sum.planned ? `${lessonsWord(sum.planned)} впереди` : 'нет запланированных')}
    </section>

    ${mode === 'month' && goal ? `<section class="card goal">
      <div class="goal-row"><b>Цель на месяц</b><span>${Calc.money(sum.earned)} из ${Calc.money(goal)}</span></div>
      <div class="meter meter-lg"><i class="m-done" style="width:${Math.min(100, sum.earned / goal * 100)}%"></i><i class="m-plan" style="width:${Math.min(100 - Math.min(100, sum.earned / goal * 100), sum.plannedSum / goal * 100)}%"></i></div>
      <p class="muted">${sum.earned >= goal ? 'Цель достигнута — отличный месяц!' : `Осталось ${Calc.money(goal - sum.earned)}${sum.plannedSum ? ` · запланированные уроки закроют ${Math.min(100, Math.round((sum.earned + sum.plannedSum) / goal * 100))}% цели` : ''}`}</p>
    </section>` : ''}

    <section class="card chart-card">
      <div class="block-head"><h2>${mode === 'month' ? 'Последние 12 месяцев' : 'Помесячно'}</h2>
        <div class="legend"><span><i class="lg-rec"></i>Оплачено</span><span><i class="lg-unp"></i>Не оплачено</span><span><i class="lg-plan"></i>В планах</span></div></div>
      <div class="bars">
        ${data.map(({ m, s: x }) => {
          const tot = x.earned + x.plannedSum;
          const h = (v) => (v / max * 100).toFixed(2);
          const isSel = mode === 'month' ? m === sel : false;
          return `<button class="bar ${isSel ? 'on' : ''} ${m.slice(0, 7) === t.slice(0, 7) ? 'cur' : ''}" data-act="pick-month" data-date="${m}" title="${esc(fmt.cap(fmt.month(m)))}: заработано ${Calc.money(x.earned)}${x.plannedSum ? ', в планах ' + Calc.money(x.plannedSum) : ''}">
            <span class="bar-val">${tot ? Math.round(tot / 100) / 10 + 'к' : ''}</span>
            <span class="bar-stack">
              ${x.plannedSum ? `<i class="b-plan" style="height:${h(x.plannedSum)}%"></i>` : ''}
              ${x.unpaid ? `<i class="b-unp" style="height:${h(x.unpaid)}%"></i>` : ''}
              ${x.received ? `<i class="b-rec" style="height:${h(x.received)}%"></i>` : ''}
            </span>
            <span class="bar-lbl">${esc(fmt.monthShort(m))}</span>
          </button>`;
        }).join('')}
      </div>
      ${total ? '' : '<p class="muted center chart-empty">Здесь появится график, когда вы проведёте первые уроки.</p>'}
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
            ${prepaid ? `<div><span>Предоплаты учеников</span><b>${Calc.money(prepaid)}</b></div>` : ''}
          </div>
        </section>
        ${Views._debtsBlock(dues)}
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
    const desk = window.desktop;
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
          <label class="field"><span class="label">Регулярные занятия создавать на</span>
            <select name="horizon">${[4, 8, 12, 16, 26].map((n) => `<option value="${n}" ${Number(s.horizon) === n ? 'selected' : ''}>${n} нед. вперёд</option>`).join('')}</select></label>
          <label class="field"><span class="label">Цель по доходу на месяц (0 — без цели)</span><input type="number" name="goal" min="0" step="1000" value="${s.goal}" inputmode="numeric"></label>
        </div>
        <div class="btn-row"><button class="btn btn-soft" data-act="open-offs">${icon('palm', 18)} Выходные и отпуск</button></div>
      </section>

      <section class="card sblock">
        <h3>Резервная копия</h3>
        ${desk ? `<p class="muted">Программа сама сохраняет копию данных каждый день в папку на вашем компьютере. Если что-то случится, их можно восстановить.</p>
          <p class="backup-status">${esc(desk.backupDir || '')}</p>`
          : `<p class="muted">Данные хранятся только в этом браузере на этом устройстве. Сохраняйте файл-копию раз в неделю-две — и восстановить всё можно будет на любом устройстве.</p>`}
        <p class="backup-status ${last ? '' : 'warn-text'}">${last ? `Последняя копия: ${new Date(last).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : 'Копия ещё не создавалась'}</p>
        <div class="btn-row">
          <button class="btn btn-primary" data-act="export-json">${icon('download', 18)} Скачать копию</button>
          <label class="btn btn-soft">${icon('upload', 18)} Восстановить из файла<input type="file" id="import-file" accept="application/json,.json" hidden></label>
          ${desk ? `<button class="btn btn-ghost" data-act="open-backups">Открыть папку с копиями</button>` : ''}
        </div>
      </section>

      <section class="card sblock">
        <h3>Помощь</h3>
        <div class="btn-row"><button class="btn btn-soft" data-act="show-help">${icon('keyboard', 18)} Горячие клавиши</button>
          <button class="btn btn-soft" data-act="load-demo">${icon('sparkle', 18)} Загрузить пример</button></div>
      </section>

      <section class="card sblock">
        <h3>Данные</h3>
        <p class="muted small">${lessonsWord(Store.data.lessons.length)} · учеников: ${Store.data.students.length}</p>
        <div class="btn-row"><button class="btn btn-ghost-danger" data-act="reset-all">${icon('trash', 18)} Удалить все данные</button></div>
      </section>
    </div>`;
  },
};
