/* Формы и диалоги: урок, ученик, оплата, выходные, отчёт */
'use strict';

const DURATIONS = [30, 45, 60, 90, 120];

/* ---------- Тексты для копирования (напоминания, итоги, отчёты) ---------- */
const Texts = {
  first(name) { return String(name).trim().split(/[\s(]/)[0]; },
  whenWord(date) {
    const t = D.today();
    if (date === t) return 'сегодня';
    if (date === D.add(t, 1)) return 'завтра';
    return fmt.date(date, { weekday: 'long', day: 'numeric', month: 'long' });
  },
  reminder(l) {
    const s = Store.student(l.studentId);
    const hello = s && !/группа/i.test(s.name) ? `Здравствуйте, ${Texts.first(s.name)}!` : 'Здравствуйте!';
    return `${hello} Напоминаю: ${Texts.whenWord(l.date)} в ${l.time} наш урок${l.lang === 'zh' ? ' китайского' : ''}. До встречи!`;
  },
  summary(l) {
    const parts = [`Итоги урока ${fmt.dm(l.date)}`];
    if (l.topic) parts.push(`Тема: ${l.topic}`);
    if (l.covered) parts.push(`Прошли: ${l.covered}`);
    if (l.words) parts.push(`Новые слова: ${l.words}`);
    if (l.homework) parts.push(`Домашнее задание: ${l.homework}`);
    return parts.join('\n');
  },
  report(student, from, to) {
    const ls = Store.lessonsBetween(from, to).filter((l) => l.studentId === student.id);
    const done = ls.filter((l) => Calc.isPayable(l));
    const sm = Calc.summary(ls);
    const lines = [`Занятия — ${student.name}`, fmt.cap(fmt.month(from)), ''];
    done.forEach((l) => {
      lines.push(`${fmt.date(l.date, { day: '2-digit', month: '2-digit' })} (${fmt.date(l.date, { weekday: 'short' })}) ${l.time} · ${l.duration} мин · ${Calc.money(l.price)}${l.status === 'late' ? ' · поздняя отмена' : ''}${l.paid ? ' · оплачено' : ''}`);
    });
    if (!done.length) lines.push('В этом месяце занятий не было.');
    lines.push('', `Проведено: ${lessonsWord(sm.count)} (${fmt.hours(sm.minutes)})`, `Стоимость: ${Calc.money(sm.earned)}`);
    if (sm.received) lines.push(`Оплачено: ${Calc.money(sm.received)}`);
    if (sm.unpaid) lines.push(`К оплате: ${Calc.money(sm.unpaid)}`);
    const plan = ls.filter((l) => l.status === 'planned');
    if (plan.length) lines.push('', 'Ещё запланировано: ' + plan.map((l) => `${fmt.date(l.date, { day: 'numeric', month: 'short' })} ${l.time}`).join(', '));
    return lines.join('\n');
  },
};

const Forms = {
  /* ---------------- УРОК ---------------- */
  lesson({ id, date, time, studentId } = {}) {
    if (!Store.students().length && !id) {
      UI.choice('Сначала добавьте ученика', 'Урок всегда привязан к ученику — так расписание и учёт дохода работают сами.',
        [{ label: 'Добавить ученика', value: true, primary: true }]).then((ok) => { if (ok) Forms.student({ then: (s) => Forms.lesson({ date, time, studentId: s.id }) }); });
      return;
    }

    const existing = id ? Store.lesson(id) : null;
    const students = Store.students();
    const all = existing && !students.find((s) => s.id === existing.studentId)
      ? [Store.student(existing.studentId), ...students].filter(Boolean) : students;
    const firstStudent = Store.student(existing ? existing.studentId : studentId) || all[0];

    const nowStr = () => D.today() + T.fromMin(D.nowMinutes());
    const defTime = () => { const m = Math.ceil((D.nowMinutes() + 1) / 30) * 30; return T.fromMin(m >= 24 * 60 ? 9 * 60 : m); };
    const L = existing ? { ...existing } : {
      studentId: firstStudent.id, lang: firstStudent.lang === 'zh' ? 'zh' : 'en',
      date: date || D.today(), time: time || defTime(),
      duration: firstStudent.duration || Store.settings.duration, price: firstStudent.price || 0,
      status: 'planned', paid: false, topic: '', covered: '', words: '', homework: '', note: '', seriesId: null,
    };
    if (!existing && L.date + L.time < nowStr()) L.status = 'done';

    const isNew = !existing;
    const touched = { price: !!existing, status: !isNew };

    const html = `
    <form class="form lesson-form" autocomplete="off" novalidate>
      <div class="sheet-head">
        <h2>${isNew ? 'Новый урок' : 'Урок'}</h2>
        <div class="head-tools">
          ${isNew ? '' : `<button type="button" class="btn btn-soft btn-sm" data-copy-remind title="Текст-напоминание для ученика">${icon('copy', 16)} Напоминание</button>
          <button type="button" class="btn btn-soft btn-sm" data-copy-summary title="Тема, слова и домашнее задание одним сообщением">${icon('copy', 16)} Итоги</button>`}
          <button type="button" class="icon-btn" data-close aria-label="Закрыть" title="Закрыть (Esc)">${icon('x')}</button>
        </div>
      </div>
      <div class="sheet-body">
        <div class="grid2">
          <label class="field span2"><span class="label">Ученик</span>
            <select name="studentId">${all.map((s) => `<option value="${s.id}" ${s.id === L.studentId ? 'selected' : ''}>${esc(s.name)}${s.archived ? ' (архив)' : ''}</option>`).join('')}<option value="__new">＋ Новый ученик…</option></select>
          </label>
          <div class="field span2"><span class="label">Язык урока</span>
            <div class="seg" role="radiogroup">
              ${Object.values(LANGS).map((l) => `<label><input type="radio" name="lang" value="${l.code}" ${L.lang === l.code ? 'checked' : ''}><span>${l.mark === '中' ? '中 ' : ''}${l.name}</span></label>`).join('')}
            </div>
          </div>
          <label class="field"><span class="label">Дата</span><input type="date" name="date" value="${L.date}" required></label>
          <label class="field"><span class="label">Начало</span><input type="time" name="time" value="${L.time}" step="300" required></label>
          <div class="field span2"><span class="label">Длительность</span>
            <div class="chips">
              ${DURATIONS.map((d) => `<button type="button" class="chip" data-dur="${d}">${d} мин</button>`).join('')}
              <span class="chip-input"><input type="number" name="duration" min="5" max="480" step="5" value="${L.duration}" inputmode="numeric"><em>мин</em></span>
            </div>
          </div>
          <label class="field"><span class="label">Стоимость, ${esc(Store.settings.currency)}</span><input type="number" name="price" min="0" step="50" value="${L.price}" inputmode="numeric"></label>
          <div class="field"><span class="label">Оплата</span>
            <label class="switch"><input type="checkbox" name="paid" ${L.paid ? 'checked' : ''}><span class="track"></span><span class="switch-text">Оплачено</span></label>
          </div>
          <p class="hint span2" data-pay-hint></p>
          <div class="field span2"><span class="label">Статус</span>
            <div class="seg seg-4" role="radiogroup">
              ${Object.entries(STATUSES).map(([k, v]) => `<label><input type="radio" name="status" value="${k}" ${L.status === k ? 'checked' : ''}><span>${v.short}</span></label>`).join('')}
            </div>
            <p class="hint" data-status-hint></p>
          </div>
        </div>

        <div class="notice notice-warn" data-conflict hidden></div>

        ${isNew ? `
        <div class="repeat-box">
          <label class="switch"><input type="checkbox" name="repeat"><span class="track"></span><span class="switch-text">${icon('repeat', 16)} Повторять каждую неделю</span></label>
          <div class="repeat-opts" hidden>
            <span>ещё</span><input type="number" name="repeatCount" min="1" max="52" value="8" inputmode="numeric"><span data-repeat-label></span>
          </div>
          <p class="hint">Для постоянных занятий удобнее указать «Регулярные занятия» в карточке ученика: расписание тогда продлевается само.</p>
        </div>` : (L.seriesId ? `
        <label class="check"><input type="checkbox" name="applySeries"><span>Применить время, длительность и стоимость ко всем следующим урокам серии</span></label>` : '')}

        <div class="section-title">${icon('book', 18)} Запись урока</div>
        <div data-prev class="prev-lesson" hidden></div>
        <div class="grid1">
          <label class="field"><span class="label">Тема</span><input type="text" name="topic" value="${esc(L.topic)}" placeholder="Например: Present Perfect / 在餐厅"></label>
          <label class="field"><span class="label">Что прошли</span><textarea name="covered" rows="3" placeholder="Материал, упражнения, на что обратить внимание">${esc(L.covered)}</textarea></label>
          <label class="field"><span class="label">Новые слова</span><textarea name="words" rows="2" placeholder="Слова, иероглифы, пиньинь">${esc(L.words)}</textarea></label>
          <label class="field"><span class="label">Домашнее задание</span><textarea name="homework" rows="2" placeholder="Что задано к следующему уроку">${esc(L.homework)}</textarea></label>
          <label class="field"><span class="label">Личная заметка</span><textarea name="note" rows="2" placeholder="Видите только вы: успехи, трудности, план на будущее">${esc(L.note)}</textarea></label>
        </div>
      </div>
      <div class="sheet-foot">
        ${isNew ? '' : `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 18)}<span>Удалить</span></button>`}
        <span class="spacer"></span>
        <span class="kbd-hint hide-mobile">Ctrl + Enter — сохранить</span>
        <button type="button" class="btn btn-ghost" data-close>Отмена</button>
        <button type="submit" class="btn btn-primary">${isNew ? 'Добавить' : 'Сохранить'}</button>
      </div>
    </form>`;

    UI.modal(html, {
      wide: true,
      onMount(sheet) {
        const f = $('form', sheet);
        const val = (n) => f.elements[n];
        const refresh = () => {
          const dur = Number(val('duration').value) || 0;
          $$('[data-dur]', f).forEach((c) => c.classList.toggle('on', Number(c.dataset.dur) === dur));

          const status = f.elements.status.value;
          val('paid').closest('.field').style.opacity = status === 'canceled' ? '.4' : '';
          val('paid').disabled = status === 'canceled';
          $('[data-status-hint]', f).textContent =
            status === 'late' ? 'Ученик отменил слишком поздно — урок засчитывается в доход.' :
            status === 'canceled' ? 'Не учитывается в доходе и часах.' : '';

          const sid = val('studentId').value;
          const bal = sid !== '__new' ? Store.balance(sid) : 0;
          const payHint = $('[data-pay-hint]', f);
          if (existing && existing.paid && existing.paidBy === 'credit') payHint.textContent = 'Оплачено с баланса ученика (предоплаты).';
          else if (bal > 0 && !val('paid').checked && status !== 'canceled') payHint.textContent = `У ученика на балансе ${Calc.money(bal)} — проведённый урок спишется с него автоматически.`;
          else payHint.textContent = '';

          // конфликты и выходные
          const c = $('[data-conflict]', f);
          const date = val('date').value, time = val('time').value;
          const msgs = [];
          if (date && time && dur && status !== 'canceled') {
            Store.conflicts(date, time, dur, id).forEach((h) => msgs.push(`Пересекается с уроком: <b>${esc((Store.student(h.studentId) || {}).name || '?')}</b> в ${h.time}`));
          }
          const off = date && Store.offOn(date);
          if (off && status !== 'canceled') msgs.push(`Это выходной день${off.note ? ` («${esc(off.note)}»)` : ''}`);
          c.hidden = !msgs.length;
          c.innerHTML = msgs.map((m) => `<div>${icon('alert', 16)} ${m}</div>`).join('');

          // подсказка по прошлому уроку
          const prev = $('[data-prev]', f);
          const last = date && time && sid !== '__new' ? Store.lastLessonBefore(sid, date, time, id) : null;
          if (last && (last.homework || last.topic)) {
            prev.hidden = false;
            prev.innerHTML = `<div class="prev-title">Прошлый урок · ${fmt.dm(last.date)}${last.topic ? ' · ' + esc(last.topic) : ''}</div>`
              + (last.homework ? `<div><b>ДЗ было:</b> ${esc(last.homework)}</div>` : '');
          } else prev.hidden = true;

          const rep = f.elements.repeat;
          if (rep) {
            $('.repeat-opts', f).hidden = !rep.checked;
            const n = Number(val('repeatCount').value) || 0;
            $('[data-repeat-label]', f).textContent = `${plural(n, ['неделю', 'недели', 'недель'])} (всего ${lessonsWord(n + 1)})`;
          }
        };

        const currentLesson = () => ({
          ...(existing || {}), studentId: val('studentId').value, lang: f.elements.lang.value, date: val('date').value, time: val('time').value,
          topic: val('topic').value.trim(), covered: val('covered').value.trim(), words: val('words').value.trim(), homework: val('homework').value.trim(),
        });

        f.addEventListener('input', (e) => {
          const n = e.target.name;
          if (n === 'price') touched.price = true;
          if (n === 'status') touched.status = true;
          if (n === 'studentId') {
            if (e.target.value === '__new') {
              const keep = { date: val('date').value, time: val('time').value };
              e.target.value = L.studentId;
              UI.close();
              setTimeout(() => Forms.student({ then: (s) => Forms.lesson({ ...keep, studentId: s.id }) }), 220);
              return;
            }
            const s = Store.student(e.target.value);
            if (s && isNew) {
              if (!touched.price) val('price').value = s.price || 0;
              val('duration').value = s.duration || Store.settings.duration;
              if (s.lang !== 'both') f.elements.lang.value = s.lang;
            }
          }
          if ((n === 'date' || n === 'time') && isNew && !touched.status) {
            const d = val('date').value, t = val('time').value;
            if (d && t) f.elements.status.value = (d + t < nowStr()) ? 'done' : 'planned';
          }
          refresh();
        });
        f.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-dur]');
          if (chip) { val('duration').value = chip.dataset.dur; refresh(); }
          if (e.target.closest('[data-close]')) UI.close();
          if (e.target.closest('[data-delete]')) Forms.deleteLesson(id).then((done) => { if (done) UI.close(); });
          if (e.target.closest('[data-copy-remind]')) UI.copy(Texts.reminder(currentLesson()), 'Напоминание скопировано — вставьте в чат с учеником');
          if (e.target.closest('[data-copy-summary]')) {
            const l = currentLesson();
            if (!(l.topic || l.covered || l.words || l.homework)) UI.toast('Сначала заполните запись урока');
            else UI.copy(Texts.summary(l), 'Итоги урока скопированы — вставьте в чат с учеником');
          }
        });
        f.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f.requestSubmit(); }
        });
        refresh();

        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const date = val('date').value, time = val('time').value;
          const duration = Number(val('duration').value);
          if (!date || !time) return Forms.invalid(val(!date ? 'date' : 'time'));
          if (!(duration >= 5)) return Forms.invalid(val('duration'));
          const status = f.elements.status.value;
          const wantPaid = status !== 'canceled' && val('paid').checked;
          const base = {
            studentId: val('studentId').value, lang: f.elements.lang.value, date, time, duration,
            price: Math.max(0, Number(val('price').value) || 0), status,
            topic: val('topic').value.trim(), covered: val('covered').value.trim(), words: val('words').value.trim(),
            homework: val('homework').value.trim(), note: val('note').value.trim(),
          };
          // оплата
          const payInfo = (prev) => {
            if (wantPaid) return prev && prev.paid ? { paid: true, paidBy: prev.paidBy || 'cash', paidDate: prev.paidDate || D.today(), noAuto: false }
              : { paid: true, paidBy: 'cash', paidDate: D.today(), noAuto: false };
            return { paid: false, paidBy: null, paidDate: null, noAuto: !!(prev && prev.paid && status !== 'canceled') || !!(prev && prev.noAuto) };
          };
          if (existing) {
            const merged = { ...existing, ...base, ...payInfo(existing) };
            const list = [merged];
            if (f.elements.applySeries && f.elements.applySeries.checked) {
              Store.seriesFrom(existing).filter((x) => x.id !== existing.id && x.status === 'planned').forEach((x) => {
                list.push({ ...x, time, duration, price: base.price, lang: base.lang });
              });
            }
            Store.saveLessons(list);
            UI.close();
            UI.toast('Урок сохранён');
          } else {
            const repeat = f.elements.repeat && f.elements.repeat.checked;
            const extra = repeat ? clamp(Number(val('repeatCount').value) || 0, 1, 52) : 0;
            const seriesId = repeat ? uid() : null;
            const list = [];
            for (let i = 0; i <= extra; i++) {
              const d = D.add(date, i * 7);
              const st = i === 0 ? status : (d + time < nowStr() ? status : 'planned');
              list.push({ ...base, date: d, seriesId, status: st, ...(i === 0 ? payInfo(null) : { paid: false, paidBy: null, paidDate: null, noAuto: false }) });
            }
            Store.saveLessons(list);
            UI.close();
            UI.toast(list.length > 1 ? `Добавлено ${lessonsWord(list.length)}` : 'Урок добавлен');
          }
        });
      },
    });
  },

  async deleteLesson(id) {
    const l = Store.lesson(id);
    if (!l) return false;
    let ids = [id];
    let dropRow = false;
    const rest = Store.seriesFrom(l);
    if (l.seriesId && rest.length > 1) {
      const regular = !!l.auto;
      const choice = await UI.choice('Удалить урок?', regular ? 'Этот урок создан из регулярного расписания ученика.' : 'Этот урок входит в серию еженедельных занятий.', [
        { label: 'Только этот урок', value: 'one', danger: true },
        { label: regular ? 'Этот и все следующие (убрать из регулярного расписания)' : 'Этот и все следующие', value: 'all', danger: true },
      ]);
      if (!choice) return false;
      if (choice === 'all') {
        ids = rest.filter((x) => x.status === 'planned' || x.id === id).map((x) => x.id);
        dropRow = regular && !!l.slot;
      }
    } else {
      const ok = await UI.confirm('Удалить урок?', 'Запись урока и данные об оплате будут удалены.');
      if (!ok) return false;
    }
    let undo = Store.deleteLessons(ids);
    if (dropRow) {
      const [d, t] = l.slot.split('|');
      const stu = Store.student(l.studentId);
      const old = (stu.regular || []).map((r) => ({ ...r }));
      Store.removeRegularRow(l.studentId, D.weekdayIdx(d), t);
      Store.saveStudent({ id: l.studentId, regular: stu.regular });
      const undoLessons = undo;
      undo = () => { Store.saveStudent({ id: l.studentId, regular: old }); undoLessons(); };
    }
    UI.toast(ids.length > 1 ? `Удалено ${lessonsWord(ids.length)}` : 'Урок удалён', { action: 'Вернуть', onAction: undo });
    return true;
  },

  invalid(el) {
    el.focus();
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  },

  /* ---------------- УЧЕНИК ---------------- */
  student({ id, then, focusRegular } = {}) {
    const existing = id ? Store.student(id) : null;
    const S = existing ? { ...existing } : {
      name: '', lang: 'en', level: '', price: 1500, duration: Store.settings.duration, contact: '', notes: '',
      color: COLORS[Store.data.students.length % COLORS.length], archived: false, regular: [],
    };
    let rows = (S.regular || []).map((r) => ({ ...r }));
    const WD = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

    const html = `
    <form class="form" autocomplete="off" novalidate>
      <div class="sheet-head">
        <h2>${existing ? 'Профиль ученика' : 'Новый ученик'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Закрыть" title="Закрыть (Esc)">${icon('x')}</button>
      </div>
      <div class="sheet-body">
        <div class="grid2">
          <label class="field span2"><span class="label">Имя или название группы</span><input type="text" name="name" value="${esc(S.name)}" placeholder="Например: Анна Соколова" required autofocus></label>
          <div class="field span2"><span class="label">Язык</span>
            <div class="seg seg-3" role="radiogroup">
              <label><input type="radio" name="lang" value="en" ${S.lang === 'en' ? 'checked' : ''}><span>Английский</span></label>
              <label><input type="radio" name="lang" value="zh" ${S.lang === 'zh' ? 'checked' : ''}><span>中 Китайский</span></label>
              <label><input type="radio" name="lang" value="both" ${S.lang === 'both' ? 'checked' : ''}><span>Оба</span></label>
            </div>
          </div>
          <label class="field"><span class="label">Стоимость урока, ${esc(Store.settings.currency)}</span><input type="number" name="price" min="0" step="50" value="${S.price}" inputmode="numeric"></label>
          <label class="field"><span class="label">Обычная длительность, мин</span><input type="number" name="duration" min="5" max="480" step="5" value="${S.duration}" inputmode="numeric"></label>

          <div class="field span2 regular-box" data-regular-box>
            <span class="label">Регулярные занятия</span>
            <div class="regular-rows" data-rows></div>
            <button type="button" class="btn btn-soft btn-sm" data-add-row>${icon('plus', 16)} Добавить день занятий</button>
            <p class="hint">Уроки сами появятся в расписании на ${Store.settings.horizon} нед. вперёд и будут продлеваться автоматически. Любой урок можно перенести, отменить или удалить.</p>
          </div>

          <label class="field"><span class="label">Уровень</span>
            <input type="text" name="level" list="levels" value="${esc(S.level)}" placeholder="A2, HSK 3…">
            <datalist id="levels">${['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'].map((x) => `<option value="${x}">`).join('')}</datalist>
          </label>
          <label class="field"><span class="label">Контакт</span><input type="text" name="contact" value="${esc(S.contact)}" placeholder="Telegram или телефон"></label>
          <div class="field span2"><span class="label">Цвет в расписании</span>
            <div class="swatches">${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${S.color === c ? 'checked' : ''}><span style="--c:${c}">${icon('check', 14)}</span></label>`).join('')}</div>
          </div>
          <label class="field span2"><span class="label">Заметки об ученике</span><textarea name="notes" rows="3" placeholder="Цели, особенности, интересы, расписание родителей…">${esc(S.notes)}</textarea></label>
          ${existing ? `<label class="switch span2"><input type="checkbox" name="archived" ${S.archived ? 'checked' : ''}><span class="track"></span><span class="switch-text">В архиве (больше не занимается; будущие уроки по расписанию уберутся)</span></label>` : ''}
        </div>
      </div>
      <div class="sheet-foot">
        ${existing ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 18)}<span>Удалить</span></button>` : ''}
        <span class="spacer"></span>
        <span class="kbd-hint hide-mobile">Ctrl + Enter — сохранить</span>
        <button type="button" class="btn btn-ghost" data-close>Отмена</button>
        <button type="submit" class="btn btn-primary">${existing ? 'Сохранить' : 'Добавить'}</button>
      </div>
    </form>`;

    UI.modal(html, {
      onMount(sheet) {
        const f = $('form', sheet);
        const rowsEl = $('[data-rows]', f);
        const renderRows = () => {
          const both = f.elements.lang.value === 'both';
          rowsEl.innerHTML = rows.map((r, i) => `
            <div class="rrow" data-i="${i}">
              <select data-f="wd" aria-label="День недели">${WD.map((n, k) => `<option value="${k}" ${r.wd === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
              <input type="time" data-f="time" value="${r.time}" step="300" aria-label="Время">
              ${both ? `<select data-f="lang" aria-label="Язык"><option value="en" ${r.lang !== 'zh' ? 'selected' : ''}>Англ.</option><option value="zh" ${r.lang === 'zh' ? 'selected' : ''}>Кит.</option></select>` : ''}
              <button type="button" class="icon-btn" data-del-row="${i}" aria-label="Убрать" title="Убрать">${icon('x', 18)}</button>
            </div>`).join('');
        };
        renderRows();
        f.addEventListener('input', (e) => {
          const row = e.target.closest('.rrow');
          if (row && e.target.dataset.f) {
            const r = rows[Number(row.dataset.i)];
            r[e.target.dataset.f] = e.target.dataset.f === 'wd' ? Number(e.target.value) : e.target.value;
          }
          if (e.target.name === 'lang') renderRows();
        });
        f.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f.requestSubmit(); } });
        f.addEventListener('click', async (e) => {
          if (e.target.closest('[data-close]')) UI.close();
          if (e.target.closest('[data-add-row]')) {
            const used = new Set(rows.map((r) => r.wd));
            const wd = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d)) ?? 0;
            rows.push({ wd, time: rows.length ? rows[rows.length - 1].time : '16:00' });
            renderRows();
          }
          const del = e.target.closest('[data-del-row]');
          if (del) { rows.splice(Number(del.dataset.delRow), 1); renderRows(); }
          if (e.target.closest('[data-delete]')) {
            const n = Store.lessonsOf(id).length;
            const ok = await UI.confirm(`Удалить ученика «${S.name}»?`,
              n ? `Вместе с ним удалятся все его уроки (${n}) и записи. Если ученик просто закончил заниматься — лучше отправьте его в архив.` : 'Это действие можно отменить сразу после удаления.');
            if (!ok) return;
            const undo = Store.deleteStudent(id);
            UI.close();
            if (location.hash.startsWith('#/students/')) location.hash = '#/students';
            UI.toast('Ученик удалён', { action: 'Вернуть', onAction: undo });
          }
        });
        if (focusRegular) $('[data-regular-box]', f).scrollIntoView({ block: 'center' });

        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const name = f.elements.name.value.trim();
          if (!name) return Forms.invalid(f.elements.name);
          const seen = new Set();
          const regular = rows.filter((r) => r.time && !seen.has(`${r.wd}|${r.time}`) && seen.add(`${r.wd}|${r.time}`))
            .map((r) => ({ wd: r.wd, time: r.time, ...(f.elements.lang.value === 'both' && r.lang ? { lang: r.lang } : {}) }))
            .sort((a, b) => a.wd - b.wd || a.time.localeCompare(b.time));
          const price = Math.max(0, Number(f.elements.price.value) || 0);
          const duration = Math.max(5, Number(f.elements.duration.value) || 60);

          // изменили цену или длительность — предложить обновить будущие уроки
          let updateFuture = false;
          if (existing) {
            const nPrice = Store.futureCount(id, 'price', price), nDur = Store.futureCount(id, 'duration', duration);
            if ((price !== Number(existing.price) && nPrice) || (duration !== Number(existing.duration) && nDur)) {
              const ans = await UI.choice('Обновить будущие уроки?', `Вы изменили стоимость или длительность. В расписании уже есть запланированные уроки этого ученика (${Math.max(nPrice, nDur)}).`,
                [{ label: 'Да, обновить будущие уроки', value: 'yes', primary: true }, { label: 'Нет, только для новых', value: 'no' }]);
              if (ans === null) return;
              updateFuture = ans === 'yes';
            }
          }

          const saved = Store.saveStudent({
            ...(existing ? { id: existing.id } : {}),
            name, lang: f.elements.lang.value, level: f.elements.level.value.trim(),
            contact: f.elements.contact.value.trim(), notes: f.elements.notes.value.trim(),
            price, duration, regular,
            color: f.elements.color.value,
            archived: f.elements.archived ? f.elements.archived.checked : false,
          });
          if (updateFuture) Store.updateFuture(saved.id, { price, duration });
          UI.close();
          const created = regular.length && !existing ? ` · расписание создано на ${Store.settings.horizon} нед.` : '';
          UI.toast((existing ? 'Профиль сохранён' : 'Ученик добавлен') + created);
          if (then) setTimeout(() => then(saved), 220);
        });
      },
    });
  },

  /* ---------------- ОПЛАТА ---------------- */
  payment(studentId) {
    const s = Store.student(studentId);
    if (!s) return;
    const unpaid = Calc.debts().filter((l) => l.studentId === studentId).reduce((a, l) => a + (Number(l.price) || 0), 0);
    const bal = Math.max(0, Store.balance(studentId));
    const due = Math.max(0, unpaid - bal);
    const options = [];
    if (due > 0) options.push([`Закрыть долг · ${Calc.money(due)}`, due]);
    [4, 8].forEach((n) => options.push([`${n} ${plural(n, ['урок', 'урока', 'уроков'])} · ${Calc.money(n * s.price)}`, n * s.price]));
    const html = `
    <form class="form" autocomplete="off" novalidate>
      <div class="sheet-head"><h2>Принять оплату</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
      <div class="sheet-body">
        <div class="payee">${Bits.avatar(s, 40)}<div><b>${esc(s.name)}</b>
          <div class="muted small">${due > 0 ? `К оплате: ${Calc.money(due)}` : bal > 0 ? `Предоплата на балансе: ${Calc.money(bal)}` : 'Долгов нет'}</div></div></div>
        <label class="field"><span class="label">Сумма, ${esc(Store.settings.currency)}</span><input type="number" name="amount" min="1" step="50" value="${due || s.price}" inputmode="numeric" autofocus></label>
        <div class="chips">${options.map(([t, v]) => `<button type="button" class="chip" data-amount="${v}">${t}</button>`).join('')}</div>
        <div class="grid2">
          <label class="field"><span class="label">Дата</span><input type="date" name="date" value="${D.today()}"></label>
          <label class="field"><span class="label">Комментарий</span><input type="text" name="note" placeholder="Необязательно"></label>
        </div>
        <p class="hint">Сумма сначала закроет неоплаченные уроки, а остаток сохранится как предоплата и спишется со следующих уроков сам.</p>
      </div>
      <div class="sheet-foot"><span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-close>Отмена</button>
        <button type="submit" class="btn btn-primary">Принять</button></div>
    </form>`;
    UI.modal(html, {
      onMount(sheet) {
        const f = $('form', sheet);
        f.addEventListener('click', (e) => {
          if (e.target.closest('[data-close]')) UI.close();
          const c = e.target.closest('[data-amount]');
          if (c) f.elements.amount.value = c.dataset.amount;
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const amount = Number(f.elements.amount.value);
          if (!(amount > 0)) return Forms.invalid(f.elements.amount);
          const before = Calc.debts().filter((l) => l.studentId === studentId).length;
          const c = Store.addPayment(studentId, amount, { date: f.elements.date.value || D.today(), note: f.elements.note.value.trim() });
          const after = Calc.debts().filter((l) => l.studentId === studentId).length;
          UI.close();
          const bal2 = Math.max(0, Store.balance(studentId));
          UI.toast(`Оплата ${Calc.money(amount)} принята${before > after ? ` · закрыто уроков: ${before - after}` : ''}${bal2 ? ` · предоплата ${Calc.money(bal2)}` : ''}`,
            { action: 'Отменить', onAction: () => Store.deletePayment(c.id), ms: 7000 });
        });
      },
    });
  },

  /* ---------------- ВЫХОДНЫЕ / ОТПУСК ---------------- */
  off() {
    const html = () => `
    <form class="form" autocomplete="off" novalidate>
      <div class="sheet-head"><h2>Выходные и отпуск</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
      <div class="sheet-body">
        <p class="muted">Отметьте дни, когда вы не работаете. Регулярные уроки в эти дни создаваться не будут, а уже запланированные можно сразу отменить.</p>
        <div class="grid2">
          <label class="field"><span class="label">С</span><input type="date" name="from" value="${D.today()}"></label>
          <label class="field"><span class="label">По (включительно)</span><input type="date" name="to" value="${D.today()}"></label>
          <label class="field span2"><span class="label">Причина</span><input type="text" name="note" placeholder="Отпуск, болезнь, праздник…"></label>
        </div>
        <label class="check" data-cancel-wrap><input type="checkbox" name="cancel" checked><span data-cancel-label></span></label>
        <button type="submit" class="btn btn-primary">Добавить выходные</button>
        <div data-list></div>
      </div>
    </form>`;
    UI.modal(html(), {
      onMount(sheet) {
        const f = $('form', sheet);
        const list = () => {
          const offs = [...Store.data.offs].sort((a, b) => a.from.localeCompare(b.from)).filter((o) => o.to >= D.today());
          $('[data-list]', f).innerHTML = offs.length ? `<div class="section-title">Запланированные выходные</div>` + offs.map((o) => `
            <div class="off-row"><span><b>${esc(o.from === o.to ? fmt.dm(o.from) : fmt.dm(o.from) + ' — ' + fmt.dm(o.to))}</b> ${o.note ? `<span class="muted">· ${esc(o.note)}</span>` : ''}</span>
            <button type="button" class="icon-btn" data-del-off="${o.id}" aria-label="Удалить">${icon('trash', 18)}</button></div>`).join('') : '';
        };
        const refresh = () => {
          const a = f.elements.from.value, b = f.elements.to.value;
          if (a && b && b < a) f.elements.to.value = a;
          const n = a ? Store.countPlanned(a, f.elements.to.value || a) : 0;
          $('[data-cancel-wrap]', f).hidden = !n;
          $('[data-cancel-label]', f).textContent = `Отменить запланированные уроки в этот период (${n})`;
        };
        f.addEventListener('input', refresh);
        refresh(); list();
        f.addEventListener('click', (e) => {
          if (e.target.closest('[data-close]')) UI.close();
          const d = e.target.closest('[data-del-off]');
          if (d) { const undo = Store.deleteOff(d.dataset.delOff); list(); refresh(); UI.toast('Выходные убраны', { action: 'Вернуть', onAction: undo }); }
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const from = f.elements.from.value, to = f.elements.to.value || from;
          if (!from) return Forms.invalid(f.elements.from);
          let res = null;
          if (f.elements.cancel.checked && !$('[data-cancel-wrap]', f).hidden) res = Store.cancelRange(from, to);
          Store.addOff({ from, to, note: f.elements.note.value.trim() });
          UI.close();
          UI.toast(res && res.count ? `Выходные добавлены · отменено уроков: ${res.count}` : 'Выходные добавлены',
            res && res.count ? { action: 'Вернуть уроки', onAction: res.undo, ms: 7000 } : {});
        });
      },
    });
  },

  /* ---------------- ОТЧЁТ ЗА МЕСЯЦ ---------------- */
  report(studentId) {
    const s = Store.student(studentId);
    if (!s) return;
    let month = D.monthStart(D.today());
    const html = `
    <div class="form">
      <div class="sheet-head"><h2>Отчёт по занятиям</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>
      <div class="sheet-body">
        <div class="sched-nav">
          <button class="icon-btn" data-m="-1" aria-label="Предыдущий месяц">${icon('left')}</button>
          <b class="report-month" data-label></b>
          <button class="icon-btn" data-m="1" aria-label="Следующий месяц">${icon('right')}</button>
        </div>
        <textarea class="report-text" rows="14" readonly data-text></textarea>
        <p class="hint">Можно отправить ученику или родителям: список проведённых уроков, итог и сумма к оплате.</p>
      </div>
      <div class="sheet-foot"><span class="spacer"></span>
        <button class="btn btn-ghost" data-close>Закрыть</button>
        <button class="btn btn-primary" data-copy>${icon('copy', 18)} Скопировать</button></div>
    </div>`;
    UI.modal(html, {
      onMount(sheet) {
        const paint = () => {
          $('[data-label]', sheet).textContent = fmt.cap(fmt.month(month));
          $('[data-text]', sheet).value = Texts.report(s, month, D.monthEnd(month));
        };
        paint();
        sheet.addEventListener('click', (e) => {
          if (e.target.closest('[data-close]')) UI.close();
          const m = e.target.closest('[data-m]');
          if (m) { month = D.addMonths(month, Number(m.dataset.m)); paint(); }
          if (e.target.closest('[data-copy]')) UI.copy($('[data-text]', sheet).value, 'Отчёт скопирован');
        });
      },
    });
  },
};
