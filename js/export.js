/* Расписание и записи «на телефон»: календарь (.ics), PDF и текст. Всё формируется на компьютере, интернет не нужен. */
'use strict';

const Export = (() => {
  const DEFAULTS = { weeksAhead: 4, weeksBack: 2, remind: 30, money: true, records: 5, pdfFormat: 'phone', textRange: 'week' };
  const load = () => ({ ...DEFAULTS, ...prefs.get('phoneOpts', {}) });
  const save = (o) => prefs.set('phoneOpts', o);

  const langName = (l) => (l === 'zh' ? 'китайский' : 'английский');
  const langShort = (l) => (l === 'zh' ? 'кит.' : 'англ.');
  const t = () => D.today();

  /* ---------- Календарь .ics ---------- */
  const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsDate = (d, time) => d.replace(/-/g, '') + (time ? 'T' + time.replace(':', '') + '00' : '');
  const utcStamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

  // строки календаря не длиннее 75 байт
  function fold(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const out = []; let cur = '', bytes = 0, limit = 75;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (bytes + n > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  function lessonDescription(l, s, withMoney) {
    const lines = [];
    const rec = (label, v) => { if (v) lines.push(`${label}: ${v}`); };
    if (l.status === 'planned') {
      lines.push(`${fmt.dur(l.duration)} · ${langName(l.lang)}${s.level ? ' · ' + s.level : ''}`);
      const last = Store.lastLessonBefore(s.id, l.date, l.time, l.id);
      if (last) {
        rec('Прошлый раз', [last.topic, last.covered].filter(Boolean).join(' — '));
        rec('Проверить ДЗ', last.homework);
        rec('Слова с прошлого раза', last.words);
      } else lines.push('Первый урок с этим учеником');
      rec('Контакт', s.contact);
      rec('Об ученике', s.notes);
    } else {
      rec('Тема', l.topic); rec('Что прошли', l.covered); rec('Новые слова', l.words); rec('Домашнее задание', l.homework); rec('Заметка', l.note);
      if (!lines.length) lines.push('Записи урока нет');
    }
    if (withMoney && Calc.isPayable(l)) lines.push(`Оплачен: ${Store.isPaid(l) ? 'да' : 'нет'} · ${Calc.money(l.price)}`);
    return lines.join('\n');
  }

  function ics(o = load()) {
    const from = D.add(t(), -7 * o.weeksBack), to = D.add(t(), 7 * o.weeksAhead);
    const stamp = utcStamp(), seq = Math.floor(Date.now() / 1000);
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moi uroki//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Мои уроки'];
    let count = 0;
    for (const l of Store.lessonsBetween(from, to)) {
      const s = Store.student(l.studentId);
      if (!s) continue;
      const canceled = l.status === 'canceled';
      L.push('BEGIN:VEVENT', `UID:lesson-${l.id}@moi-uroki`, `DTSTAMP:${stamp}`, `SEQUENCE:${seq}`,
        `DTSTART:${icsDate(l.date, l.time)}`, `DTEND:${icsDate(l.date, T.end(l.time, l.duration))}`,
        `SUMMARY:${icsEsc((l.status === 'done' ? '✓ ' : '') + s.name + ' · ' + langShort(l.lang))}`,
        `DESCRIPTION:${icsEsc(lessonDescription(l, s, o.money))}`);
      if (canceled) L.push('STATUS:CANCELLED');
      if (l.status === 'planned' && o.remind > 0 && l.date + l.time > t() + T.fromMin(D.nowMinutes())) {
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc('Урок: ' + s.name)}`, `TRIGGER:-PT${o.remind}M`, 'END:VALARM');
      }
      L.push('END:VEVENT');
      count++;
    }
    for (const off of Store.data.offs) {
      if (off.to < from || off.from > to) continue;
      L.push('BEGIN:VEVENT', `UID:off-${off.id}@moi-uroki`, `DTSTAMP:${stamp}`, `SEQUENCE:${seq}`,
        `DTSTART;VALUE=DATE:${icsDate(off.from)}`, `DTEND;VALUE=DATE:${icsDate(D.add(off.to, 1))}`,
        `SUMMARY:${icsEsc('Выходной' + (off.note ? ' — ' + off.note : ''))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return { text: L.map(fold).join('\r\n') + '\r\n', count };
  }

  /* ---------- Текст для сообщения ---------- */
  function textRange(kind) {
    const today = t();
    if (kind === 'today') return { from: today, to: today, title: `Расписание на сегодня, ${fmt.dm(today)}` };
    if (kind === 'tomorrow') { const d = D.add(today, 1); return { from: d, to: d, title: `Расписание на завтра, ${fmt.dm(d)}` }; }
    const to = D.add(today, 6);
    return { from: today, to, title: `Расписание на неделю: ${fmt.dm(today)} — ${fmt.dm(to)}` };
  }

  function text(kind = load().textRange) {
    const r = textRange(kind);
    const lines = [r.title, ''];
    let n = 0;
    for (let d = r.from; d <= r.to; d = D.add(d, 1)) {
      const ls = Store.lessonsOn(d).filter((l) => l.status !== 'canceled');
      const off = Store.offOn(d);
      if (!ls.length && !off) continue;
      if (r.from !== r.to) lines.push(fmt.cap(fmt.date(d, { weekday: 'short', day: 'numeric', month: 'long' })));
      if (off) lines.push(`Выходной${off.note ? ' — ' + off.note : ''}`);
      for (const l of ls) {
        const s = Store.student(l.studentId);
        if (!s) continue;
        n++;
        lines.push(`${l.time}–${T.end(l.time, l.duration)}  ${s.name} (${langShort(l.lang)})${l.status === 'done' ? ' ✓' : ''}`);
        const last = Store.lastLessonBefore(s.id, l.date, l.time, l.id);
        if (l.status === 'planned' && last && last.homework) lines.push(`   ДЗ с прошлого раза: ${last.homework}`);
      }
      if (r.from !== r.to) lines.push('');
    }
    if (!n) lines.push('Уроков нет.');
    else lines.push(r.from !== r.to ? `Всего: ${lessonsWord(n)}` : '', '');
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---------- PDF ---------- */
  const h = esc;
  const nl = (s) => h(s).replace(/\n/g, '<br>');

  function pdfHtml(o = load()) {
    const phone = o.pdfFormat !== 'a4';
    const today = t();
    const to = D.add(today, 7 * o.weeksAhead);
    const days = [];
    for (let d = today; d <= to; d = D.add(d, 1)) {
      const ls = Store.lessonsOn(d).filter((l) => l.status !== 'canceled');
      const off = Store.offOn(d);
      if (ls.length || off) days.push({ d, ls, off });
    }

    const schedule = days.map(({ d, ls, off }) => `
      <section class="day">
        <div class="dh"><b>${h(d === today ? 'Сегодня' : fmt.cap(fmt.date(d, { weekday: 'long' })))}</b> ${h(fmt.date(d, { day: 'numeric', month: 'long' }))}</div>
        ${off ? `<div class="off">Выходной${off.note ? ' — ' + h(off.note) : ''}</div>` : ''}
        ${ls.map((l) => {
          const s = Store.student(l.studentId); if (!s) return '';
          const last = Store.lastLessonBefore(s.id, l.date, l.time, l.id);
          return `<div class="les" style="--c:${s.color}">
            <div class="lt">${l.time}–${T.end(l.time, l.duration)}</div>
            <div class="lb"><div class="ln">${h(s.name)} <span class="lg">${l.lang === 'zh' ? '中' : 'EN'}</span></div>
              <div class="ls">${[s.level, fmt.dur(l.duration)].filter(Boolean).map(h).join(' · ')}</div>
              ${l.status === 'planned' && last && (last.topic || last.homework) ? `<div class="hw"><small>Прошлый раз${last.topic ? ': ' + h(last.topic) : ''}</small>${last.homework ? `<div>Проверить ДЗ: ${nl(last.homework)}</div>` : ''}</div>` : ''}
            </div></div>`;
        }).join('')}
      </section>`).join('');

    const students = Store.students().map((s) => {
      const acc = Store.account(s.id);
      const recs = Store.lessonsOf(s.id).filter((l) => Calc.isPayable(l)).slice(0, o.records);
      const next = Store.nextLesson(s.id);
      const reg = (s.regular || []).map((r) => `${WEEKDAYS[r.wd]} ${r.time}`).join(', ');
      return `<section class="stu">
        <h3 style="--c:${s.color}">${h(s.name)} <span class="lg">${s.lang === 'both' ? 'EN · 中' : s.lang === 'zh' ? '中' : 'EN'}</span></h3>
        <div class="meta">
          ${s.level ? `<div><small>Уровень</small>${h(s.level)}</div>` : ''}
          ${s.contact ? `<div><small>Контакт</small>${h(s.contact)}</div>` : ''}
          <div><small>Занятие</small>${h(Calc.money(s.price))} · ${s.duration} мин</div>
          ${reg ? `<div><small>Регулярно</small>${h(reg)}</div>` : ''}
          ${next ? `<div><small>Следующий урок</small>${h(fmt.cap(fmt.date(next.date, { weekday: 'short', day: 'numeric', month: 'long' })))}, ${next.time}</div>` : ''}
          ${o.money ? `<div><small>Оплата</small>${acc.due > 0 ? `<b class="bad">к оплате ${h(Calc.money(acc.due))}</b>` : acc.prepaid > 0 ? `предоплата ${h(Calc.money(acc.prepaid))}` : 'долгов нет'}</div>` : ''}
        </div>
        ${s.notes ? `<div class="note">${nl(s.notes)}</div>` : ''}
        ${recs.length ? `<h4>Последние записи</h4>${recs.map((l) => `
          <div class="rec"><div class="rd">${h(fmt.cap(fmt.date(l.date, { weekday: 'short', day: 'numeric', month: 'long' })))}</div>
            ${l.topic ? `<div class="rt">${h(l.topic)}</div>` : ''}
            ${l.covered ? `<p>${nl(l.covered)}</p>` : ''}
            ${l.words ? `<p><small>Новые слова</small>${nl(l.words)}</p>` : ''}
            ${l.homework ? `<p class="rhw"><small>Домашнее задание</small>${nl(l.homework)}</p>` : ''}
            ${l.note ? `<p><small>Заметка</small>${nl(l.note)}</p>` : ''}
            ${!(l.topic || l.covered || l.words || l.homework || l.note) ? '<p class="muted">Записи нет</p>' : ''}
          </div>`).join('')}` : '<p class="muted">Проведённых уроков пока нет.</p>'}
      </section>`;
    }).join('');

    const now = new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Мои уроки — расписание</title><style>
      @page { size: ${phone ? '82mm 178mm' : 'A4'}; margin: ${phone ? '6mm 5mm' : '14mm 14mm'}; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; font: ${phone ? '10.5pt' : '11pt'}/1.4 "Segoe UI", -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif; color: #1d1c25; }
      h1 { font-size: ${phone ? '17pt' : '22pt'}; margin: 0 0 2px; }
      .sub { color: #6e6c7b; font-size: ${phone ? '9pt' : '10pt'}; margin-bottom: 10px; }
      .sec { font-size: ${phone ? '13pt' : '15pt'}; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #5646e0; color: #5646e0; }
      .day { margin-bottom: 10px; break-inside: avoid; }
      .dh { font-size: ${phone ? '11pt' : '12pt'}; background: #f1f0fb; padding: 3px 7px; border-radius: 6px; margin-bottom: 4px; }
      .dh b { color: #5646e0; margin-right: 4px; }
      .off { color: #6e6c7b; padding: 2px 7px; }
      .les { display: flex; ${phone ? 'flex-direction: column; gap: 0;' : 'gap: 7px;'} padding: 5px 0 5px 7px; border-left: 4px solid var(--c); margin: 4px 0; break-inside: avoid; }
      .lt { min-width: ${phone ? '19mm' : '24mm'}; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .ln { font-weight: 700; }
      .lg { font-size: 8pt; font-weight: 700; background: #eceafc; color: #5646e0; padding: 0 4px; border-radius: 4px; vertical-align: 1px; }
      .ls { color: #6e6c7b; font-size: 9pt; }
      .hw { margin-top: 2px; font-size: 9.5pt; background: #f5f4f0; padding: 3px 6px; border-radius: 5px; }
      .hw small { display: block; color: #6e6c7b; }
      .stu { break-before: page; }
      .stu:first-of-type { break-before: auto; }
      h3 { font-size: ${phone ? '14pt' : '16pt'}; margin: 0 0 4px; padding-left: 7px; border-left: 5px solid var(--c); }
      h4 { font-size: 11pt; margin: 10px 0 4px; color: #5646e0; }
      .meta { display: grid; grid-template-columns: ${phone ? '1fr' : '1fr 1fr'}; gap: 2px 14px; margin-bottom: 6px; }
      .meta small, .rec small { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #6e6c7b; }
      .meta > div { padding: 2px 0; }
      .bad { color: #b46e00; }
      .note { background: #fdf0d4; padding: 4px 7px; border-radius: 6px; margin: 4px 0; font-size: 9.5pt; }
      .rec { padding: 5px 0; border-top: 1px solid #e7e5de; break-inside: avoid; }
      .rd { font-size: 9pt; color: #6e6c7b; }
      .rt { font-weight: 700; }
      .rec p { margin: 3px 0; }
      .rhw { background: #eceafc; padding: 3px 6px; border-radius: 5px; }
      .muted { color: #6e6c7b; }
      .empty { color: #6e6c7b; padding: 8px 0; }
    </style></head><body>
      <h1>Мои уроки</h1>
      <div class="sub">Расписание на ${h(fmt.dm(today))} — ${h(fmt.dm(to))} · обновлено ${h(now)}</div>
      <h2 class="sec">Расписание</h2>
      ${schedule || '<div class="empty">Запланированных уроков нет.</div>'}
      ${students ? `<h2 class="sec" style="break-before:page">Ученики и записи уроков</h2>${students}` : ''}
    </body></html>`;
  }

  /* ---------- Сохранение ---------- */
  async function saveFile(name, data, kind) {
    if (window.desktop && window.desktop.saveFile) {
      const path = await window.desktop.saveFile(name, data, kind);
      return path || null;
    }
    UI.download(name, data, kind === 'ics' ? 'text/calendar' : 'text/plain');
    return name;
  }

  async function savePdf(name, html) {
    if (window.desktop && window.desktop.savePdf) return (await window.desktop.savePdf(name, html)) || null;
    // без программы: открываем страницу для печати — в окне печати выберите «Сохранить как PDF»
    const w = window.open('', '_blank');
    if (!w) { UI.toast('Браузер заблокировал окно. Разрешите всплывающие окна для этой страницы.'); return null; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 400);
    return name;
  }

  return { DEFAULTS, load, save, ics, text, pdfHtml, saveFile, savePdf };
})();
