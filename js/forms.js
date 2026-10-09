/* Формы: урок и ученик */
'use strict';

const DURATIONS = [30, 45, 60, 90, 120];

const Forms = {
  /* ---------------- УРОК ---------------- */
  lesson({ id, date, time, studentId } = {}) {
    if (!Store.students().length && !id) {
      UI.choice('Сначала добавьте ученика', 'Урок всегда привязан к ученику — это нужно для расписания и учёта дохода.',
        [{ label: 'Добавить ученика', value: true, primary: true }]).then((ok) => { if (ok) Forms.student({ then: () => Forms.lesson({ date, time }) }); });
      return;
    }

    const existing = id ? Store.lesson(id) : null;
    const students = Store.students();
    const all = existing && !students.find((s) => s.id === existing.studentId)
      ? [Store.student(existing.studentId), ...students].filter(Boolean) : students;
    const firstStudent = Store.student(existing ? existing.studentId : studentId) || all[0];

    const nowStr = () => D.today() + T.fromMin(D.nowMinutes());
    const L = existing ? { ...existing } : {
      studentId: firstStudent.id, lang: firstStudent.lang === 'zh' ? 'zh' : 'en',
      date: date || D.today(), time: time || T.fromMin(Math.ceil((D.nowMinutes() + 1) / 30) * 30 % (24 * 60)),
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
        <button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button>
      </div>
      <div class="sheet-body">
        <div class="grid2">
          <label class="field span2"><span class="label">Ученик</span>
            <select name="studentId">${all.map((s) => `<option value="${s.id}" ${s.id === L.studentId ? 'selected' : ''}>${esc(s.name)}${s.archived ? ' (архив)' : ''}</option>`).join('')}</select>
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

          // конфликт расписания
          const c = $('[data-conflict]', f);
          const date = val('date').value, time = val('time').value;
          if (date && time && dur && status !== 'canceled') {
            const hits = Store.conflicts(date, time, dur, id);
            if (hits.length) {
              c.hidden = false;
              c.innerHTML = `${icon('alert', 16)} Пересекается с уроком: ` + hits.map((h) => `<b>${esc((Store.student(h.studentId) || {}).name || '?')}</b> в ${h.time}`).join(', ');
            } else c.hidden = true;
          } else c.hidden = true;

          // подсказка по прошлому уроку
          const prev = $('[data-prev]', f);
          const last = date && time ? Store.lastLessonBefore(val('studentId').value, date, time, id) : null;
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

        f.addEventListener('input', (e) => {
          const n = e.target.name;
          if (n === 'price') touched.price = true;
          if (n === 'status') touched.status = true;
          if (n === 'studentId') {
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
        });
        refresh();

        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const date = val('date').value, time = val('time').value;
          const duration = Number(val('duration').value);
          if (!date || !time) return Forms.invalid(val(!date ? 'date' : 'time'));
          if (!(duration >= 5)) return Forms.invalid(val('duration'));
          const status = f.elements.status.value;
          const base = {
            studentId: val('studentId').value, lang: f.elements.lang.value, date, time, duration,
            price: Math.max(0, Number(val('price').value) || 0), status,
            paid: status === 'canceled' ? false : val('paid').checked,
            topic: val('topic').value.trim(), covered: val('covered').value.trim(), words: val('words').value.trim(),
            homework: val('homework').value.trim(), note: val('note').value.trim(),
          };
          if (existing) {
            const merged = { ...existing, ...base };
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
              list.push({ ...base, date: D.add(date, i * 7), seriesId, status: i === 0 ? status : (D.add(date, i * 7) + time < nowStr() ? status : 'planned'), paid: i === 0 ? base.paid : false });
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
    if (l.seriesId && Store.seriesFrom(l).length > 1) {
      const choice = await UI.choice('Удалить урок?', 'Этот урок входит в серию еженедельных занятий.', [
        { label: 'Только этот урок', value: 'one', danger: true },
        { label: 'Этот и все следующие', value: 'all', danger: true },
      ]);
      if (!choice) return false;
      if (choice === 'all') ids = Store.seriesFrom(l).map((x) => x.id);
    } else {
      const ok = await UI.confirm('Удалить урок?', 'Запись урока и данные об оплате будут удалены.');
      if (!ok) return false;
    }
    const undo = Store.deleteLessons(ids);
    UI.toast(ids.length > 1 ? `Удалено ${lessonsWord(ids.length)}` : 'Урок удалён', { action: 'Вернуть', onAction: undo });
    return true;
  },

  invalid(el) {
    el.focus();
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  },

  /* ---------------- УЧЕНИК ---------------- */
  student({ id, then } = {}) {
    const existing = id ? Store.student(id) : null;
    const S = existing ? { ...existing } : {
      name: '', lang: 'en', level: '', price: 1500, duration: Store.settings.duration, contact: '', notes: '',
      color: COLORS[Store.data.students.length % COLORS.length], archived: false,
    };
    const html = `
    <form class="form" autocomplete="off" novalidate>
      <div class="sheet-head">
        <h2>${existing ? 'Профиль ученика' : 'Новый ученик'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button>
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
          <label class="field"><span class="label">Уровень</span>
            <input type="text" name="level" list="levels" value="${esc(S.level)}" placeholder="A2, HSK 3…">
            <datalist id="levels">${['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'].map((x) => `<option value="${x}">`).join('')}</datalist>
          </label>
          <label class="field"><span class="label">Контакт</span><input type="text" name="contact" value="${esc(S.contact)}" placeholder="Telegram или телефон"></label>
          <label class="field"><span class="label">Стоимость урока, ${esc(Store.settings.currency)}</span><input type="number" name="price" min="0" step="50" value="${S.price}" inputmode="numeric"></label>
          <label class="field"><span class="label">Обычная длительность, мин</span><input type="number" name="duration" min="5" max="480" step="5" value="${S.duration}" inputmode="numeric"></label>
          <div class="field span2"><span class="label">Цвет в расписании</span>
            <div class="swatches">${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${S.color === c ? 'checked' : ''}><span style="--c:${c}">${icon('check', 14)}</span></label>`).join('')}</div>
          </div>
          <label class="field span2"><span class="label">Заметки об ученике</span><textarea name="notes" rows="3" placeholder="Цели, особенности, интересы, расписание родителей…">${esc(S.notes)}</textarea></label>
          ${existing ? `<label class="switch span2"><input type="checkbox" name="archived" ${S.archived ? 'checked' : ''}><span class="track"></span><span class="switch-text">В архиве (скрыть из списка и выбора при записи)</span></label>` : ''}
        </div>
      </div>
      <div class="sheet-foot">
        ${existing ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 18)}<span>Удалить</span></button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-close>Отмена</button>
        <button type="submit" class="btn btn-primary">${existing ? 'Сохранить' : 'Добавить'}</button>
      </div>
    </form>`;

    UI.modal(html, {
      onMount(sheet) {
        const f = $('form', sheet);
        f.addEventListener('click', async (e) => {
          if (e.target.closest('[data-close]')) UI.close();
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
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = f.elements.name.value.trim();
          if (!name) return Forms.invalid(f.elements.name);
          const saved = Store.saveStudent({
            ...(existing ? { id: existing.id } : {}),
            name, lang: f.elements.lang.value, level: f.elements.level.value.trim(),
            contact: f.elements.contact.value.trim(), notes: f.elements.notes.value.trim(),
            price: Math.max(0, Number(f.elements.price.value) || 0),
            duration: Math.max(5, Number(f.elements.duration.value) || 60),
            color: f.elements.color.value,
            archived: f.elements.archived ? f.elements.archived.checked : false,
          });
          UI.close();
          UI.toast(existing ? 'Профиль сохранён' : 'Ученик добавлен');
          if (then) setTimeout(() => then(saved), 200);
        });
      },
    });
  },
};
