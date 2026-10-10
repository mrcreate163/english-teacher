/* Оболочка Electron: запускает приложение как обычную программу Windows/macOS/Linux */
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');

const backupDir = () => path.join(app.getPath('documents'), 'Мои уроки', 'Резервные копии');
const KEEP_DAYS = 30;

function listBackups() {
  try {
    return fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json'))
      .map((f) => ({ f, t: fs.statSync(path.join(backupDir(), f)).mtimeMs })).sort((a, b) => b.t - a.t);
  } catch (e) { return []; }
}

ipcMain.on('backup-dir', (e) => { e.returnValue = backupDir(); });
ipcMain.handle('backup-save', (e, text) => {
  try {
    fs.mkdirSync(backupDir(), { recursive: true });
    const d = new Date();
    const name = `копия-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    fs.writeFileSync(path.join(backupDir(), name), text, 'utf8');
    // удаляем копии старше KEEP_DAYS дней, но последние 5 оставляем всегда
    listBackups().slice(5).forEach(({ f, t }) => { if (Date.now() - t > KEEP_DAYS * 864e5) fs.unlink(path.join(backupDir(), f), () => {}); });
    return true;
  } catch (err) { return false; }
});
ipcMain.handle('backup-latest', () => {
  const l = listBackups()[0];
  if (!l) return null;
  try { return { name: l.f, mtime: l.t, text: fs.readFileSync(path.join(backupDir(), l.f), 'utf8') }; } catch (e) { return null; }
});
ipcMain.handle('backup-open', () => { fs.mkdirSync(backupDir(), { recursive: true }); return shell.openPath(backupDir()); });

/* Файлы «на телефон»: спрашиваем, куда сохранить (по умолчанию Документы\Мои уроки\Для телефона), и показываем файл в папке */
const phoneDir = () => path.join(app.getPath('documents'), 'Мои уроки', 'Для телефона');

async function askPath(event, name, filters) {
  if (process.env.MOI_TEST_SAVE_DIR) return path.join(process.env.MOI_TEST_SAVE_DIR, name); // только для автоматических проверок
  fs.mkdirSync(phoneDir(), { recursive: true });
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = await dialog.showSaveDialog(win, { title: 'Сохранить файл', defaultPath: path.join(phoneDir(), name), filters });
  return r.canceled ? null : r.filePath;
}

ipcMain.handle('save-file', async (event, { name, data, kind }) => {
  const filePath = await askPath(event, name, kind === 'ics' ? [{ name: 'Календарь', extensions: ['ics'] }] : [{ name: 'Текст', extensions: ['txt'] }]);
  if (!filePath) return null;
  fs.writeFileSync(filePath, data, 'utf8');
  if (!process.env.MOI_TEST_SAVE_DIR) shell.showItemInFolder(filePath);
  return filePath;
});

ipcMain.handle('save-pdf', async (event, { name, html }) => {
  const filePath = await askPath(event, name, [{ name: 'PDF', extensions: ['pdf'] }]);
  if (!filePath) return null;
  const tmp = path.join(os.tmpdir(), `moi-uroki-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadFile(tmp);
    const pdf = await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
    fs.writeFileSync(filePath, pdf);
  } finally { win.destroy(); fs.rm(tmp, () => {}); }
  if (!process.env.MOI_TEST_SAVE_DIR) shell.showItemInFolder(filePath);
  return filePath;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 980, minHeight: 640,
    title: 'Мои уроки', backgroundColor: '#f5f4f0', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'icons', 'icon-512.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  // внешние ссылки (например, Telegram) открываем в обычном браузере
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
}

Menu.setApplicationMenu(null);
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
