/* Синхронизация между устройствами.
   Данные шифруются на вашем устройстве паролем синхронизации (AES-GCM), сервер хранит только непрочитываемые записи.
   Каждая запись (ученик, урок, оплата, выходной, настройки) синхронизируется отдельно; при конфликте побеждает более свежая правка. */
'use strict';

const Sync = (() => {
  const CFG_KEY = 'tutor-sync-cfg-v1';
  const KNOWN_KEY = 'tutor-sync-known-v1';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const SALT = new TextEncoder().encode('moi-uroki-sync-v1');
  const ITER = 150000;
  const CHUNK = 400;

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const listeners = new Set();

  let cfg = readJSON(CFG_KEY, null);        // {url, pass, auth, aes, mac, cursor, last}
  let known = readJSON(KNOWN_KEY, {});      // hid -> {k, u, h, d}
  let keyCache = null;                      // импортированные ключи
  let running = false, again = false, timer = null, poller = null;
  let skew = 0;                             // разница часов с сервером, мс
  const hidCache = new Map();
  const state = { state: cfg ? 'idle' : 'off', error: '', last: cfg ? cfg.last || 0 : 0, serverHere: false };

  function readJSON(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } }
  const saveCfg = () => writeJSON(CFG_KEY, cfg);
  const saveKnown = () => writeJSON(KNOWN_KEY, known);
  const emit = () => listeners.forEach((fn) => fn(state));
  const setState = (s, error = '') => { state.state = s; state.error = error; emit(); };

  /* ---------- Криптография ---------- */
  const b64 = (buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  function normalizePass(p) { return String(p || '').toUpperCase().replace(/[\s-]+/g, ''); }

  function generatePass() {
    const r = new Uint8Array(20);
    crypto.getRandomValues(r);
    const chars = Array.from(r, (b) => ALPHABET[b % 32]);
    return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join('')).join('-');
  }

  async function deriveKeys(passphrase) {
    if (!(window.crypto && crypto.subtle)) throw new SyncError('no_crypto', 'Браузер не поддерживает шифрование. Откройте приложение по адресу https://…');
    const base = await crypto.subtle.importKey('raw', enc.encode(normalizePass(passphrase)), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: SALT, iterations: ITER }, base, 96 * 8));
    return { auth: b64url(bits.slice(32, 64)), aes: b64(bits.slice(0, 32)), mac: b64(bits.slice(64, 96)) };
  }

  async function keys() {
    if (keyCache && keyCache.sig === cfg.aes + cfg.mac) return keyCache;
    const aes = await crypto.subtle.importKey('raw', unb64(cfg.aes), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const mac = await crypto.subtle.importKey('raw', unb64(cfg.mac), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keyCache = { aes, mac, sig: cfg.aes + cfg.mac };
    return keyCache;
  }

  async function hidOf(key) {
    if (hidCache.has(key)) return hidCache.get(key);
    const k = await keys();
    const sig = await crypto.subtle.sign('HMAC', k.mac, enc.encode(key));
    const h = b64url(sig).slice(0, 32);
    hidCache.set(key, h);
    return h;
  }

  async function encrypt(obj) {
    const k = await keys();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k.aes, enc.encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv); out.set(ct, 12);
    return b64(out);
  }

  async function decrypt(str) {
    const k = await keys();
    const buf = unb64(str);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, k.aes, buf.slice(12));
    return JSON.parse(dec.decode(pt));
  }

  /* ---------- Снимок данных и отпечатки ---------- */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  function hash(v) { // cyrb53
    const s = stable(v);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  const syncedSettings = (s) => { const o = { ...s }; delete o.theme; return o; }; // тема — личная настройка устройства

  function snapshot() {
    const d = Store.data, m = new Map();
    d.students.forEach((x) => m.set('student:' + x.id, x));
    d.lessons.forEach((x) => m.set('lesson:' + x.id, x));
    d.credits.forEach((x) => m.set('credit:' + x.id, x));
    d.offs.forEach((x) => m.set('off:' + x.id, x));
    m.set('settings:main', syncedSettings(d.settings));
    return m;
  }

  const now = () => Date.now() + skew;

  /* ---------- Сеть ---------- */
  class SyncError extends Error { constructor(code, message) { super(message); this.code = code; } }

  const apiBase = (url) => url.replace(/\/+$/, '') + '/api/index.php';

  async function call(url, action, body, ms = 25000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    let res;
    try {
      res = await fetch(`${apiBase(url)}?a=${action}`, body
        ? { method: 'POST', body: JSON.stringify(body), signal: ctl.signal, headers: { 'Content-Type': 'text/plain' } }
        : { signal: ctl.signal });
    } catch (e) {
      throw new SyncError('offline', e.name === 'AbortError' ? 'Сервер долго не отвечает' : 'Нет связи с сервером. Проверьте интернет, адрес сайта (https://…) и что файлы загружены на хостинг.');
    } finally { clearTimeout(t); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* не JSON */ }
    if (!data) {
      if (res.status === 404) throw new SyncError('not_found', 'По этому адресу сервер синхронизации не найден. Проверьте адрес и что папка api загружена на хостинг.');
      throw new SyncError('bad_response', `Сервер ответил не так, как ожидалось (код ${res.status}). Возможно, на хостинге выключен PHP или неверный адрес.`);
    }
    if (!data.ok) throw new SyncError(data.error || 'server', data.message || 'Ошибка сервера');
    return data;
  }

  function normalizeUrl(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    s = s.replace(/[?#].*$/, '').replace(/\/(index\.html?|api(\/index\.php)?)?\/?$/i, '');
    return s.replace(/\/+$/, '');
  }

  /* ---------- Применение чужих изменений ---------- */
  function parseKey(k) { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; }

  async function processRemote(recs, snap) {
    const ops = [];
    for (const r of recs) {
      const kn = known[r.h];
      if (kn && kn.u >= r.u) continue;                       // у нас то же или более свежее
      let key = kn ? kn.k : null, rec = null;
      if (!r.d) {
        try { const p = await decrypt(r.c); key = p.k; rec = p.r; } catch (e) { throw new SyncError('wrong_password', 'Не удалось расшифровать данные. Скорее всего, пароль синхронизации введён неверно.'); }
      }
      if (!key) { known[r.h] = { k: null, u: r.u, h: '', d: 1 }; continue; }
      // пока шёл запрос, запись изменили здесь — сохраняем локальную правку, она уйдёт при следующей синхронизации
      if (kn && kn.k && snap.has(kn.k) && hash(snap.get(kn.k)) !== kn.h && !(kn.d)) continue;
      const [type, id] = parseKey(key);
      ops.push({ type, id, rec });
      known[r.h] = { k: key, u: r.u, h: rec ? hash(rec) : '', d: r.d ? 1 : 0 };
      hidCache.set(key, r.h);
    }
    if (ops.length) Store.applyRemote(ops);
    return ops.length;
  }

  /* ---------- Один цикл синхронизации ---------- */
  async function cycle() {
    // первое подключение: сначала забираем то, что уже есть на сервере (там приоритет, например, у настроек), потом отправляем своё
    if (!cfg.cursor && !Object.keys(known).length) {
      const first = await call(cfg.url, 'sync', { key: cfg.auth, since: 0, changes: [] });
      if (first.time) skew = first.time - Date.now();
      await processRemote(first.recs, snapshot());
      cfg.cursor = first.rev;
      saveKnown(); saveCfg();
    }
    const snap = snapshot();
    const changes = [], sent = [];
    for (const [key, rec] of snap) {
      const hid = await hidOf(key);
      const kn = known[hid];
      const h = hash(rec);
      if (kn && kn.h === h && !kn.d) continue;
      // уроки, созданные автоматически по расписанию, уступают любой настоящей правке
      const u = (!kn && key.startsWith('lesson:reg-')) ? 1 : now();
      sent.push({ hid, key, u, h, d: 0, rec });
    }
    const present = new Set();
    for (const key of snap.keys()) present.add(await hidOf(key));
    Object.keys(known).forEach((hid) => {
      const kn = known[hid];
      if (!kn.d && kn.k && !present.has(hid)) sent.push({ hid, key: kn.k, u: now(), h: '', d: 1, rec: null });
    });

    let applied = 0;
    let first = true;
    while (first || sent.length) {
      first = false;
      const part = sent.splice(0, CHUNK);
      const body = { key: cfg.auth, since: cfg.cursor || 0, changes: [] };
      for (const s of part) body.changes.push({ h: s.hid, u: s.u, d: s.d, c: s.d ? '' : await encrypt({ k: s.key, r: s.rec }) });
      const res = await call(cfg.url, 'sync', body);
      if (res.time) skew = res.time - Date.now();
      part.forEach((s) => { known[s.hid] = { k: s.key, u: s.u, h: s.h, d: s.d }; });
      applied += await processRemote(res.recs, snapshot());
      cfg.cursor = res.rev;
      saveKnown(); saveCfg();
    }
    return applied;
  }

  async function run() {
    if (!cfg) return;
    if (running) { again = true; return; }
    if (navigator.onLine === false) { setState('offline', 'Нет интернета'); return; }
    running = true;
    setState('syncing');
    try {
      await cycle();
      cfg.last = Date.now(); state.last = cfg.last; saveCfg();
      setState('idle');
      if (Store.ensureRegular()) kick(); // новые ученики с регулярным расписанием
    } catch (e) {
      if (e.code === 'wrong_password') setState('auth', e.message);
      else if (e.code === 'offline') setState('offline', e.message);
      else setState('error', e.message || 'Ошибка синхронизации');
    } finally {
      running = false;
      if (again) { again = false; kick(500); }
    }
  }

  function kick(ms = 1500) {
    if (!cfg) return;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }

  function startPolling() {
    clearInterval(poller);
    poller = setInterval(() => { if (cfg && !document.hidden) run(); }, 45000);
  }

  /* ---------- Подключение ---------- */
  async function ping(url) {
    const data = await call(normalizeUrl(url), 'ping');
    if (data.app !== 'moi-uroki') throw new SyncError('not_app', 'По этому адресу работает не «Мои уроки».');
    if (!data.writable) throw new SyncError('not_writable', 'Серверу не удаётся записывать данные: проверьте права на папку api/data (должно быть 755).');
    return data;
  }

  /* Проверяет адрес и пароль. Возвращает, сколько записей уже есть на сервере. */
  async function inspect(url, passphrase) {
    url = normalizeUrl(url);
    const info = await ping(url);
    const k = await deriveKeys(passphrase);
    const res = await call(url, 'sync', { key: k.auth, since: 0, changes: [] });
    return { url, keys: k, count: res.recs.length, claimed: res.claimed, https: info.https };
  }

  /* mode: 'merge' — объединить, 'server' — заменить данные на этом устройстве данными сервера */
  async function connect(checked, passphrase, mode) {
    cfg = { url: checked.url, pass: normalizePass(passphrase), ...checked.keys, cursor: 0, last: 0 };
    known = {}; keyCache = null; hidCache.clear();
    saveCfg(); saveKnown();
    if (mode === 'server') Store.wipeData();
    setState('idle');
    await run();
    startPolling();
    if (state.state === 'error' || state.state === 'auth') { const msg = state.error; disconnect(true); throw new SyncError('connect_failed', msg); }
  }

  function disconnect(keepError) {
    clearTimeout(timer); clearInterval(poller);
    cfg = null; known = {}; keyCache = null; hidCache.clear();
    try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(KNOWN_KEY); } catch (e) { /* ignore */ }
    state.state = 'off'; if (!keepError) state.error = '';
    emit();
  }

  async function detectServer() {
    if (!/^https?:$/.test(location.protocol)) return false;
    try {
      const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '').replace(/\/+$/, '');
      const r = await fetch(`${base}/api/index.php?a=ping`, { cache: 'no-store' });
      const d = await r.json();
      state.serverHere = !!(d && d.app === 'moi-uroki');
      state.hereUrl = base;
    } catch (e) { state.serverHere = false; }
    emit();
    return state.serverHere;
  }

  Store.subscribe(() => kick());
  window.addEventListener('online', () => kick(300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(300); });
  if (cfg) { startPolling(); setTimeout(run, 800); }

  return {
    state,
    get connected() { return !!cfg; },
    get url() { return cfg ? cfg.url : ''; },
    get pass() { return cfg ? cfg.pass : ''; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    generatePass, normalizePass, normalizeUrl, inspect, connect, disconnect, detectServer,
    now: () => run(),
    run,
    formatPass(p) { const s = normalizePass(p); return s.length === 20 ? s.match(/.{5}/g).join('-') : s; },
    _internals: { hash, stable, deriveKeys, snapshot, get known() { return known; } },
  };
})();
