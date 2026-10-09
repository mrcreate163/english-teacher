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
    settings: { currency: '₽', duration: 60, dayStart: 8, dayEnd: 22, goal: 0, theme: 'auto' },
    meta: { lastBackup: null, created: Date.now() },
  });

  function normalize(d) {
    const def = defaults();
    return {
      students: Array.isArray(d.students) ? d.students : [],
      lessons: Array.isArray(d.lessons) ? d.lessons : [],
      settings: { ...def.settings, ...(d.settings || {}) },
      meta: { ...def.meta, ...(d.meta || {}) },
    };
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

  function emit() { listeners.forEach((fn) => fn()); }
  function commit() { persist(); emit(); }

  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { data = load(); emit(); }
  });

  const sortLessons = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

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
      if (!s.id) {
        s.id = uid();
        s.created = Date.now();
        if (!s.color) s.color = COLORS[data.students.length % COLORS.length];
        data.students.push(s);
      } else {
        const i = data.students.findIndex((x) => x.id === s.id);
        data.students[i] = { ...data.students[i], ...s };
      }
      commit();
      return s;
    },
    deleteStudent(id) {
      const removedStudent = api.student(id);
      const removedLessons = data.lessons.filter((l) => l.studentId === id);
      data.students = data.students.filter((s) => s.id !== id);
      data.lessons = data.lessons.filter((l) => l.studentId !== id);
      commit();
      return () => { data.students.push(removedStudent); data.lessons.push(...removedLessons); commit(); };
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
      data.lessons = data.lessons.filter((l) => !set.has(l.id));
      commit();
      return () => { data.lessons.push(...removed); commit(); };
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
      const now = D.today() + T.fromMin(D.nowMinutes());
      return data.lessons
        .filter((l) => l.studentId === studentId && l.status === 'planned' && (l.date + l.time) >= now)
        .sort(sortLessons)[0];
    },
    conflicts(date, time, duration, excludeId) {
      const a = T.toMin(time), b = a + Number(duration);
      return data.lessons.filter((l) => l.id !== excludeId && l.date === date && l.status !== 'canceled'
        && T.toMin(l.time) < b && T.toMin(l.time) + Number(l.duration) > a);
    },
    /* Уроки, которые уже должны были пройти, но не отмечены */
    needsMarking() {
      const now = D.today() + T.fromMin(D.nowMinutes());
      return data.lessons.filter((l) => l.status === 'planned' && (l.date + T.end(l.time, l.duration)) <= now).sort(sortLessons);
    },

    /* ----- настройки ----- */
    saveSettings(patch) { Object.assign(data.settings, patch); commit(); },
    markBackup() { data.meta.lastBackup = Date.now(); commit(); },

    exportJSON() {
      return JSON.stringify({ app: 'tutor-planner', version: 1, exported: new Date().toISOString(), ...data }, null, 2);
    },
    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.students) || !Array.isArray(parsed.lessons)) throw new Error('Неверный формат файла');
      data = normalize(parsed);
      commit();
    },
    reset() { data = defaults(); commit(); },
    loadDemo() { data = Demo.build(); commit(); },
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
        if (l.paid) r.received += price; else r.unpaid += price;
      } else if (l.status === 'planned') { r.planned++; r.plannedSum += price; }
      else r.canceled++;
    }
    return r;
  },
  /* неоплаченные проведённые уроки за всё время */
  debts() {
    return Store.data.lessons.filter((l) => PAYABLE.has(l.status) && !l.paid && l.date <= D.today());
  },
  money(n) {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ' + Store.settings.currency;
  },
};

/* ---------- Демо-данные ---------- */
const Demo = {
  build() {
    const d = {
      students: [],
      lessons: [],
      settings: { ...Store.settings, goal: 90000 },
      meta: { lastBackup: Date.now(), created: Date.now() },
    };
    const mk = (name, lang, level, price, duration, contact, notes, color) => {
      const s = { id: uid(), name, lang, level, price, duration, contact, notes, color, created: Date.now() };
      d.students.push(s); return s;
    };
    const anna = mk('Анна Соколова', 'en', 'B1', 1800, 60, '@anna_sok', 'Готовится к IELTS, цель — 6.5. Любит разговорную практику.', COLORS[0]);
    const maxim = mk('Максим', 'zh', 'HSK 2', 2000, 60, '+7 900 123-45-67', 'Учит китайский для работы. Сложно даются тоны.', COLORS[5]);
    const kira = mk('Кира (8 лет)', 'en', 'A1', 1400, 45, 'Мама: Ольга, +7 911 000-11-22', 'Занятия в игровой форме, карточки и песни.', COLORS[2]);
    const dima = mk('Дмитрий Орлов', 'zh', 'HSK 4', 2400, 90, '@dorlov', 'Готовится к HSK 4 на весну.', COLORS[1]);
    const group = mk('Группа «Бизнес-английский»', 'en', 'B2', 3600, 90, '', 'Три человека, четверг вечером.', COLORS[4]);

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
    // расписание на неделю: [студент, смещение от понедельника, время]
    const pattern = [
      [anna, 0, '16:00'], [maxim, 1, '18:00'], [kira, 2, '15:00'], [anna, 3, '16:00'],
      [group, 3, '19:00'], [dima, 4, '17:30'], [maxim, 5, '11:00'], [kira, 5, '13:00'],
    ];
    const counters = {};
    for (let w = -5; w <= 2; w++) {
      for (const [st, off, time] of pattern) {
        const date = D.add(wk, w * 7 + off);
        const dateTime = date + time;
        const nowStr = today + T.fromMin(D.nowMinutes());
        let status = 'planned', paid = false;
        if (dateTime < nowStr) {
          status = 'done';
          paid = D.add(date, 10) < today || Math.random() > 0.3;
          if (Math.random() < 0.06) { status = 'canceled'; paid = false; }
        }
        const n = (counters[st.id] = (counters[st.id] || 0) + 1);
        const rec = status === 'done' ? (topics[st.id] || [])[(n - 1) % (topics[st.id] || [1]).length] : null;
        d.lessons.push({
          id: uid(), studentId: st.id, lang: st.lang, date, time, duration: st.duration, price: st.price,
          status, paid, topic: rec ? rec[0] : '', covered: rec ? rec[1] : '', words: rec ? rec[2] : '',
          homework: rec ? rec[3] : '', note: '', seriesId: `${st.id}-${off}-${time}`,
        });
      }
    }
    // пара «не отмеченных» уроков сегодня утром не нужна — оставляем как есть
    return d;
  },
};
