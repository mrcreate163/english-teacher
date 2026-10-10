/* Хранилище данных (localStorage) и расчёты по урокам/доходам */
'use strict';

const LANGS = {
  en: { code: 'en', name: 'Английский', short: 'EN', mark: 'EN' },
  zh: { code: 'zh', name: 'Китайский', short: 'ZH', mark: '中' },
};

const STATUSES = {
  planned: { label: 'Запланирован', short: 'В плане' },
  done: { label: 'Проведён', short: 'Проведён' },
  late: { label: 'Поздняя отмена (оплачивается)', short: 'Поздняя отмена' },
  canceled: { label: 'Отменён', short: 'Отменён' },
};
const PAYABLE = new Set(['done', 'late']); // статусы, за которые вы получаете деньги

const COLORS = ['#6d5ae6', '#2f80ed', '#0ea5a4', '#3fa34d', '#d98a00', '#e8590c', '#e0457b', '#64748b'];

const Store = (() => {
  const KEY = 'tutor-planner-v1';
  const listeners = new Set();
  let storageOk = true;

  const defaults = () => ({
    students: [],
    lessons: [],
    credits: [], // оплаты вперёд / поступления: {id, studentId, date, amount, note}
    offs: [],    // выходные и отпуск: {id, from, to, note}
    settings: { currency: '₽', duration: 60, dayStart: 8, dayEnd: 22, goal: 0, theme: 'auto', horizon: 8 },
    meta: { lastBackup: null, created: Date.now(), demo: false, ver: 3 },
  });

  /* Версия 3: «оплачен» больше не флаг урока — всё считается от оплат ученика.
     Старые отметки «оплачено» превращаются в оплаты, привязанные к уроку. */
  function migrate(out) {
    if ((out.meta.ver || 0) >= 3) return out;
    out.lessons.forEach((l) => {
      if (l.paid && l.paidBy !== 'credit' && Number(l.price) > 0) {
        out.credits.push({ id: uid(), studentId: l.studentId, date: l.paidDate || l.date, amount: Number(l.price), note: 'Оплата урока', lessonId: l.id });
      }
      delete l.paid; delete l.paidBy; delete l.paidDate; delete l.noAuto;
    });
    out.meta.ver = 3;
    return out;
  }

  function normalize(d) {
    const def = defaults();
    return migrate({
      students: Array.isArray(d.students) ? d.students : [],
      lessons: Array.isArray(d.lessons) ? d.lessons : [],
      credits: Array.isArray(d.credits) ? d.credits : [],
      offs: Array.isArray(d.offs) ? d.offs : [],
      settings: { ...def.settings, ...(d.settings || {}) },
      meta: { ...def.meta, ...(d.meta || {}), ver: (d.meta && d.meta.ver) || 0 },
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { console.warn('Не удалось прочитать данные', e); storageOk = false; }
    return defaults();
  }

  let data = load();

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); storageOk = true; }
    catch (e) { storageOk = false; console.warn('Не удалось сохранить данные', e); }
  }

  const sortLessons = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
  const price = (l) => Number(l.price) || 0;
  const nowKey = () => D.today() + T.fromMin(D.nowMinutes());

  /* ----- Расчёты с учениками -----
     У каждого ученика один баланс: оплаты пополняют его, проведённые уроки с него списываются.
     Оплата, привязанная к уроку (галочка «Оплачено»), закрывает именно этот урок.
     Остальные оплаты закрывают проведённые уроки по порядку, от старых к новым.
     Всё считается на лету, поэтому предоплата списывается сразу, как только урок отмечен проведённым. */
  let ledgerCache = null;
  function computeLedger() {
    const out = {};
    const byId = new Map(data.lessons.map((l) => [l.id, l]));
    for (const s of data.students) {
      const paid = new Set();
      let pool = 0;
      for (const c of data.credits) {
        if (c.studentId !== s.id) continue;
        const l = c.lessonId && byId.get(c.lessonId);
        if (l && l.studentId === s.id && PAYABLE.has(l.status) && !paid.has(l.id)) paid.add(l.id);
        else pool += Number(c.amount) || 0;
      }
      let unpaidSum = 0, blocked = false;
      data.lessons.filter((l) => l.studentId === s.id && PAYABLE.has(l.status) && !paid.has(l.id)).sort(sortLessons).forEach((l) => {
        const pr = price(l);
        if (pr <= 0) { paid.add(l.id); return; }
        if (!blocked && pool >= pr) { paid.add(l.id); pool -= pr; } else { blocked = true; unpaidSum += pr; }
      });
      const due = Math.max(0, unpaidSum - pool);
      const prepaid = unpaidSum ? 0 : pool;
      out[s.id] = { paid, due, prepaid, unpaidSum };
    }
    return out;
  }
  const ledger = () => ledgerCache || (ledgerCache = computeLedger());

  /* Регулярное расписание: создаёт уроки на несколько недель вперёд. Возвращает число созданных. */
  function generateRegular() {
    const today = D.today();
    const horizon = D.add(today, Math.max(2, Number(data.settings.horizon) || 8) * 7);
    let added = 0;
    for (const s of data.students) {
      if (s.archived || !Array.isArray(s.regular) || !s.regular.length) continue;
      const have = new Set(data.lessons.filter((l) => l.studentId === s.id).map((l) => l.slot || `${l.date}|${l.time}`));
      const skip = new Set(s.skips || []);
      for (let d = today; d <= horizon; d = D.add(d, 1)) {
        const wd = D.weekdayIdx(d);
        for (const r of s.regular) {
          if (r.wd !== wd) continue;
          const key = `${d}|${r.time}`;
          if (have.has(key) || skip.has(key)) continue;
          if (data.offs.some((o) => d >= o.from && d <= o.to)) continue;
          if (d === today && key <= nowKey()) continue; // уроки, которые уже должны были пройти, не создаём
          data.lessons.push({
            id: uid(), studentId: s.id, lang: r.lang || (s.lang === 'zh' ? 'zh' : 'en'), date: d, time: r.time,
            duration: Number(r.duration) || Number(s.duration) || 60, price: Number(s.price) || 0, status: 'planned', paid: false,
            topic: '', covered: '', words: '', homework: '', note: '', seriesId: `reg-${s.id}-${r.wd}-${r.time}`, slot: key, auto: true,
          });
          have.add(key); added++;
        }
      }
    }
    return added;
  }

  /* Убирает будущие нетронутые уроки, которых больше нет в регулярном расписании */
  function cleanupRegular(s) {
    const now = nowKey();
    const rows = new Set((s.regular || []).map((r) => `${r.wd}|${r.time}`));
    const drop = data.lessons.filter((l) => l.studentId === s.id && l.auto && l.status === 'planned' && !data.credits.some((c) => c.lessonId === l.id)
      && `${l.date}|${l.time}` === l.slot && l.date + l.time > now
      && !(l.topic || l.covered || l.words || l.homework || l.note)
      && (s.archived || !rows.has(`${D.weekdayIdx(l.date)}|${l.time}`)));
    const ids = new Set(drop.map((l) => l.id));
    data.lessons = data.lessons.filter((l) => !ids.has(l.id));
  }

  function emit() { listeners.forEach((fn) => fn()); }
  function commit() { ledgerCache = null; persist(); emit(); }

  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { data = load(); ledgerCache = null; emit(); }
  });

  const api = {
    get data() { return data; },
    get settings() { return data.settings; },
    get storageOk() { return storageOk; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isEmpty() { return !data.students.length && !data.lessons.length; },

    /* ----- ученики ----- */
    student(id) { return data.students.find((s) => s.id === id); },
    students({ archived = false } = {}) {
      return data.students.filter((s) => !!s.archived === archived)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    },
    saveStudent(s) {
      let saved;
      if (!s.id) {
        s.id = uid();
        s.created = Date.now();
        if (!s.color) s.color = COLORS[data.students.length % COLORS.length];
        s.skips = s.skips || [];
        data.students.push(s);
        saved = s;
      } else {
        const i = data.students.findIndex((x) => x.id === s.id);
        data.students[i] = { ...data.students[i], ...s };
        saved = data.students[i];
      }
      cleanupRegular(saved);
      generateRegular();
      commit();
      return saved;
    },
    deleteStudent(id) {
      const removedStudent = api.student(id);
      const removedLessons = data.lessons.filter((l) => l.studentId === id);
      const removedCredits = data.credits.filter((c) => c.studentId === id);
      data.students = data.students.filter((s) => s.id !== id);
      data.lessons = data.lessons.filter((l) => l.studentId !== id);
      data.credits = data.credits.filter((c) => c.studentId !== id);
      commit();
      return () => { data.students.push(removedStudent); data.lessons.push(...removedLessons); data.credits.push(...removedCredits); commit(); };
    },
    /* Изменить цену/длительность во всех будущих запланированных уроках ученика */
    updateFuture(studentId, patch) {
      const now = nowKey();
      let n = 0;
      data.lessons.forEach((l) => {
        if (l.studentId === studentId && l.status === 'planned' && l.date + l.time > now) { Object.assign(l, patch); n++; }
      });
      commit();
      return n;
    },
    futureCount(studentId, field, value) {
      const now = nowKey();
      return data.lessons.filter((l) => l.studentId === studentId && l.status === 'planned' && l.date + l.time > now && Number(l[field]) !== Number(value)).length;
    },
    removeRegularRow(studentId, wd, time) {
      const s = api.student(studentId);
      if (!s) return;
      s.regular = (s.regular || []).filter((r) => !(r.wd === wd && r.time === time));
    },

    /* ----- уроки ----- */
    lesson(id) { return data.lessons.find((l) => l.id === id); },
    lessonsOn(date) { return data.lessons.filter((l) => l.date === date).sort(sortLessons); },
    lessonsBetween(from, to) {
      return data.lessons.filter((l) => l.date >= from && l.date <= to).sort(sortLessons);
    },
    lessonsOf(studentId) {
      return data.lessons.filter((l) => l.studentId === studentId).sort((a, b) => sortLessons(b, a));
    },
    saveLessons(list) {
      list.forEach((l) => {
        if (!l.id) { l.id = uid(); data.lessons.push(l); }
        else {
          const i = data.lessons.findIndex((x) => x.id === l.id);
          if (i >= 0) data.lessons[i] = l; else data.lessons.push(l);
          const link = data.credits.find((c) => c.lessonId === l.id);
          if (link && Number(l.price) > 0) link.amount = Number(l.price); // оплата следует за ценой урока
        }
      });
      commit();
    },
    patchLesson(id, patch) {
      const l = api.lesson(id);
      if (l) { Object.assign(l, patch); commit(); }
    },
    deleteLessons(ids) {
      const set = new Set(ids);
      const removed = data.lessons.filter((l) => set.has(l.id));
      const tombs = [];
      // уроки из регулярного расписания не должны появиться снова
      removed.forEach((l) => {
        const s = api.student(l.studentId);
        if (s && l.slot && !(s.skips || []).includes(l.slot)) { s.skips = [...(s.skips || []), l.slot]; tombs.push([s, l.slot]); }
      });
      data.lessons = data.lessons.filter((l) => !set.has(l.id));
      commit();
      return () => {
        data.lessons.push(...removed);
        tombs.forEach(([s, slot]) => { s.skips = (s.skips || []).filter((x) => x !== slot); });
        commit();
      };
    },
    seriesFrom(lesson) {
      if (!lesson.seriesId) return [lesson];
      return data.lessons.filter((l) => l.seriesId === lesson.seriesId && (l.date + l.time) >= (lesson.date + lesson.time)).sort(sortLessons);
    },
    lastLessonBefore(studentId, date, time, excludeId) {
      return data.lessons
        .filter((l) => l.studentId === studentId && l.id !== excludeId && l.status !== 'canceled' && (l.date + l.time) < (date + time))
        .sort((a, b) => sortLessons(b, a))[0];
    },
    nextLesson(studentId) {
      const now = nowKey();
      return data.lessons
        .filter((l) => l.studentId === studentId && l.status === 'planned' && (l.date + l.time) >= now)
        .sort(sortLessons)[0];
    },
    /* Ближайший непроведённый урок (сегодня или позже) */
    upcoming(limit = 1) {
      const now = nowKey();
      return data.lessons.filter((l) => l.status === 'planned' && l.date + T.end(l.time, l.duration) > now).sort(sortLessons).slice(0, limit);
    },
    conflicts(date, time, duration, excludeId) {
      const a = T.toMin(time), b = a + Number(duration);
      return data.lessons.filter((l) => l.id !== excludeId && l.date === date && l.status !== 'canceled'
        && T.toMin(l.time) < b && T.toMin(l.time) + Number(l.duration) > a);
    },
    /* Уроки, которые уже должны были пройти, но не отмечены */
    needsMarking() {
      const now = nowKey();
      return data.lessons.filter((l) => l.status === 'planned' && (l.date + T.end(l.time, l.duration)) <= now).sort(sortLessons);
    },
    search(q) {
      q = q.trim().toLowerCase();
      if (!q) return { students: [], lessons: [] };
      const students = data.students.filter((s) => [s.name, s.contact, s.notes, s.level].join(' ').toLowerCase().includes(q)).slice(0, 6);
      const lessons = data.lessons.filter((l) => [l.topic, l.covered, l.words, l.homework, l.note].join(' ').toLowerCase().includes(q))
        .sort((a, b) => sortLessons(b, a)).slice(0, 8);
      return { students, lessons };
    },

    /* ----- оплаты и баланс ----- */
    isPaid(l) {
      if (PAYABLE.has(l.status)) { const e = ledger()[l.studentId]; return !!e && e.paid.has(l.id); }
      return data.credits.some((c) => c.lessonId === l.id);
    },
    /* due — сколько ученик должен, prepaid — сколько осталось предоплаты */
    account(studentId) { return ledger()[studentId] || { paid: new Set(), due: 0, prepaid: 0, unpaidSum: 0 }; },
    payments(studentId) { return data.credits.filter((c) => c.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)); },
    paymentFor(lessonId) { return data.credits.find((c) => c.lessonId === lessonId); },
    addPayment(studentId, amount, { date = D.today(), note = '', lessonId = null } = {}) {
      const c = { id: uid(), studentId, date, amount: Number(amount) || 0, note };
      if (lessonId) c.lessonId = lessonId;
      data.credits.push(c);
      commit();
      return c;
    },
    deletePayment(id) {
      const removed = data.credits.find((c) => c.id === id);
      data.credits = data.credits.filter((c) => c.id !== id);
      commit();
      return () => { data.credits.push(removed); commit(); };
    },
    /* Галочка «Оплачено» в уроке: создаёт или убирает оплату, привязанную к этому уроку */
    setLessonPaid(lessonId, paid) {
      const l = api.lesson(lessonId);
      if (!l) return;
      const link = api.paymentFor(lessonId);
      if (paid && !link) api.addPayment(l.studentId, price(l), { lessonId, note: 'Оплата урока' });
      else if (!paid && link) api.deletePayment(link.id);
    },

    /* ----- выходные и отпуск ----- */
    offOn(date) { return data.offs.find((o) => date >= o.from && date <= o.to); },
    addOff(off) { off.id = uid(); data.offs.push(off); generateRegular(); commit(); return off; },
    deleteOff(id) {
      const removed = data.offs.find((o) => o.id === id);
      data.offs = data.offs.filter((o) => o.id !== id);
      generateRegular();
      commit();
      return () => { data.offs.push(removed); commit(); };
    },
    /* Отменяет запланированные уроки в периоде. Возвращает функцию отмены действия. */
    cancelRange(from, to) {
      const ls = data.lessons.filter((l) => l.status === 'planned' && l.date >= from && l.date <= to);
      ls.forEach((l) => { l.status = 'canceled'; });
      commit();
      return { count: ls.length, undo() { ls.forEach((l) => { l.status = 'planned'; }); commit(); } };
    },
    countPlanned(from, to) { return data.lessons.filter((l) => l.status === 'planned' && l.date >= from && l.date <= to).length; },

    /* ----- настройки и резервные копии ----- */
    saveSettings(patch) {
      Object.assign(data.settings, patch);
      if (patch.horizon) generateRegular();
      commit();
    },
    markBackup() { data.meta.lastBackup = Date.now(); commit(); },
    noteBackup() { data.meta.lastBackup = Date.now(); persist(); },
    ensureRegular() { const n = generateRegular(); if (n) commit(); return n; },

    exportJSON() {
      return JSON.stringify({ app: 'tutor-planner', version: 2, exported: new Date().toISOString(), ...data }, null, 2);
    },
    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.students) || !Array.isArray(parsed.lessons)) throw new Error('Неверный формат файла');
      data = normalize(parsed);
      commit();
    },
    reset() { data = defaults(); commit(); },
    loadDemo() { data = migrate(Demo.build()); generateRegular(); commit(); },
  };
  return api;
})();

/* ---------- Расчёты ---------- */
const Calc = {
  isPayable: (l) => PAYABLE.has(l.status),
  summary(lessons) {
    const r = { count: 0, minutes: 0, earned: 0, received: 0, unpaid: 0, planned: 0, plannedSum: 0, canceled: 0 };
    for (const l of lessons) {
      const price = Number(l.price) || 0;
      if (PAYABLE.has(l.status)) {
        r.count++; r.minutes += Number(l.duration) || 0; r.earned += price;
        if (Store.isPaid(l)) r.received += price; else r.unpaid += price;
      } else if (l.status === 'planned') { r.planned++; r.plannedSum += price; }
      else r.canceled++;
    }
    return r;
  },
  /* кто сколько должен */
  dueRows() {
    return Store.data.students.map((s) => ({ s, ...Store.account(s.id) })).filter((r) => r.due > 0)
      .map((r) => ({ s: r.s, due: r.due, ls: Store.lessonsOf(r.s.id).filter((l) => Calc.isPayable(l) && !Store.isPaid(l)), balance: r.prepaid }))
      .sort((a, b) => b.due - a.due);
  },
  prepaidTotal() {
    return Store.data.students.reduce((a, s) => a + Store.account(s.id).prepaid, 0);
  },
  /* реально поступившие деньги за период (по дате оплаты) */
  cash(from, to) {
    return Store.data.credits.reduce((a, c) => a + (c.date >= from && c.date <= to ? Number(c.amount) || 0 : 0), 0);
  },
  money(n) {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString('ru-RU').replace(/\u00a0/g, '\u202f') + '\u00a0' + Store.settings.currency;
  },
};

/* ---------- Демо-данные ---------- */
const Demo = {
  build() {
    const d = {
      students: [], lessons: [], credits: [], offs: [],
      settings: { ...Store.settings, goal: 90000 },
      meta: { lastBackup: Date.now(), created: Date.now(), demo: true },
    };
    const mk = (name, lang, level, price, duration, contact, notes, color, regular) => {
      const s = { id: uid(), name, lang, level, price, duration, contact, notes, color, created: Date.now(), skips: [], regular };
      d.students.push(s); return s;
    };
    const anna = mk('Анна Соколова', 'en', 'B1', 1800, 60, '@anna_sok', 'Готовится к IELTS, цель — 6.5. Любит разговорную практику.', COLORS[0], [{ wd: 0, time: '16:00' }, { wd: 3, time: '16:00' }]);
    const maxim = mk('Максим', 'zh', 'HSK 2', 2000, 60, '+7 900 123-45-67', 'Учит китайский для работы. Сложно даются тоны.', COLORS[5], [{ wd: 1, time: '18:00' }, { wd: 5, time: '11:00' }]);
    const kira = mk('Кира (8 лет)', 'en', 'A1', 1400, 45, 'Мама: Ольга, +7 911 000-11-22', 'Занятия в игровой форме, карточки и песни.', COLORS[2], [{ wd: 2, time: '15:00' }, { wd: 5, time: '13:00' }]);
    const dima = mk('Дмитрий Орлов', 'zh', 'HSK 4', 2400, 90, '@dorlov', 'Готовится к HSK 4 на весну. Платит вперёд пакетами.', COLORS[1], [{ wd: 4, time: '17:30' }]);
    const group = mk('Группа «Бизнес-английский»', 'en', 'B2', 3600, 90, '', 'Три человека, четверг вечером.', COLORS[4], [{ wd: 3, time: '19:00' }]);

    const topics = {
      [anna.id]: [
        ['Present Perfect vs Past Simple', 'Разобрали разницу, упражнения на выбор времени.', 'accomplish, achieve, deadline, afford', 'Упр. 4–5 на стр. 56, написать 5 предложений о себе'],
        ['IELTS Speaking: Part 2', 'Практика монолога по карточкам, работа над связками.', 'furthermore, nevertheless, in particular', 'Записать ответ на тему «A person who inspired me»'],
        ['Условные предложения', 'Conditionals 0–3, перевод с русского.', 'otherwise, unless, provided that', 'Эссе 150 слов: «If I could live anywhere…»'],
        ['Phrasal verbs: work & career', 'Разбор 15 фразовых глаголов, диалоги.', 'carry out, set up, take on, burn out', 'Выучить глаголы, 10 предложений'],
      ],
      [maxim.id]: [
        ['Тоны: повторение', 'Пары слов на 2-й и 3-й тоны, скороговорки.', '妈 mā, 麻 má, 马 mǎ, 骂 mà', 'Прописать 20 иероглифов, прослушать диалог 3 раза'],
        ['В ресторане 在餐厅', 'Диалог заказа еды, счётные слова.', '菜单 càidān, 服务员 fúwùyuán, 买单 mǎidān', 'Составить свой диалог из 8 реплик'],
        ['Вопросительные конструкции', '吗, 呢, 吧; вопросы с 几 и 多少.', '几 jǐ, 多少 duōshao, 谁 shéi', 'Упр. 6–7, карточки Anki'],
      ],
      [kira.id]: [
        ['Animals & colors', 'Игра «Угадай животное», песня про цвета.', 'cat, dog, rabbit, red, green', 'Раскрасить картинку и подписать'],
        ['My family', 'Карточки: семья, притяжательные местоимения.', 'mother, father, sister, brother', 'Нарисовать семью и подписать'],
      ],
      [dima.id]: [
        ['HSK 4: чтение', 'Разбор текстов, работа со словарём.', '经验 jīngyàn, 提高 tígāo, 影响 yǐngxiǎng', 'Прочитать текст на стр. 40, выписать новые слова'],
        ['Конструкция 把', 'Правила и 20 примеров, упражнения.', '把 bǎ, 被 bèi, 放 fàng, 送 sòng', 'Перевести 10 предложений'],
      ],
      [group.id]: [
        ['Business emails', 'Структура письма, формальный и нейтральный тон.', 'attach, regarding, follow up', 'Написать письмо-запрос'],
        ['Meetings & negotiations', 'Ролевая игра: переговоры о цене.', 'agenda, deal, compromise, deadline', 'Подготовить мини-презентацию'],
      ],
    };

    const today = D.today();
    const wk = D.weekStart(today);
    const nowStr = today + T.fromMin(D.nowMinutes());
    const counters = {};
    let k = 0;
    const past = [];
    for (let w = -6; w <= 0; w++) {
      for (const st of d.students) {
        for (const r of st.regular) {
          const date = D.add(wk, w * 7 + r.wd);
          const dateTime = date + r.time;
          const n = (counters[st.id] = (counters[st.id] || 0) + 1);
          k++;
          let status = 'planned', paid = false, paidBy = null, paidDate = null;
          if (dateTime < nowStr) {
            status = k % 17 === 0 ? 'canceled' : 'done';
            if (status === 'done') {
              // Дмитрий платит вперёд (баланс), остальные — по-разному
              if (st !== dima && (D.add(date, 9) < today || k % 3 !== 0)) { paid = true; paidBy = 'cash'; paidDate = D.add(date, k % 3); if (paidDate > today) paidDate = today; }
            }
          }
          const rec = status === 'done' ? (topics[st.id] || [])[(n - 1) % (topics[st.id] || [1]).length] : null;
          const l = {
            id: uid(), studentId: st.id, lang: st.lang, date, time: r.time, duration: st.duration, price: st.price,
            status, paid, paidBy, paidDate, topic: rec ? rec[0] : '', covered: rec ? rec[1] : '', words: rec ? rec[2] : '',
            homework: rec ? rec[3] : '', note: '', seriesId: `reg-${st.id}-${r.wd}-${r.time}`, slot: `${date}|${r.time}`, auto: true,
          };
          d.lessons.push(l);
          if (dateTime < nowStr) past.push(l);
        }
      }
    }
    // последний прошедший урок оставляем неотмеченным — чтобы показать подсказку «Отметьте проведённые»
    const last = past.filter((l) => l.status === 'done').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
    if (last && last.date === today) { last.status = 'planned'; last.paid = false; last.paidBy = null; last.topic = last.covered = last.words = last.homework = ''; }
    d.credits.push({ id: uid(), studentId: dima.id, date: D.add(today, -20), amount: 7200, note: 'Пакет на 3 урока' });
    d.credits.push({ id: uid(), studentId: dima.id, date: D.add(today, -3), amount: 2400, note: '' });
    d.credits.push({ id: uid(), studentId: kira.id, date: D.add(today, -1), amount: 5600, note: 'Предоплата: 4 урока' });
    return d;
  },
};
