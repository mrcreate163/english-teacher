/* Сборка установщика Windows: упаковка Electron → значок и сведения в exe → NSIS-установщик.
   Работает на Windows и на Linux/macOS (нужен установленный NSIS: makensis). */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const dist = path.join(root, 'dist');
const unpacked = path.join(dist, 'win-unpacked');
const win = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  // .cmd-файлы на Windows запускаются через оболочку, а обычные exe (makensis) — напрямую, чтобы пути с пробелами не ломались
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: win && /\.cmd$/i.test(cmd), ...opts });
  if (r.error) { console.error(`Не удалось запустить ${cmd}: ${r.error.message}`); process.exit(1); }
  if (r.status !== 0) process.exit(r.status || 1);
}

function findMakensis() {
  if (!win) return 'makensis';
  const candidates = ['C:\\Program Files (x86)\\NSIS\\makensis.exe', 'C:\\Program Files\\NSIS\\makensis.exe'];
  return candidates.find((p) => fs.existsSync(p)) || 'makensis';
}

fs.rmSync(dist, { recursive: true, force: true });

// 1. Упаковка приложения (без правки exe — её делаем сами, чтобы не требовался Wine/winCodeSign)
const builder = path.join(root, 'node_modules', '.bin', win ? 'electron-builder.cmd' : 'electron-builder');
run(builder, ['--win', '--dir', '--x64', '--publish', 'never', '-c.win.signAndEditExecutable=false']);

// 2. Значок и сведения о программе
const exe = path.join(unpacked, 'MoiUroki.exe');
require('./set-icon.js')(exe, path.join(root, 'icons', 'icon.ico'), pkg.version);

// 3. Установщик
const out = path.join(dist, `Moi-uroki-Ustanovshchik-${pkg.version}.exe`);
run(findMakensis(), [
  `-DAPP_VERSION=${pkg.version}`, `-DSRC_DIR=${unpacked}`, `-DOUT_FILE=${out}`,
  `-DICON_FILE=${path.join(root, 'icons', 'icon.ico')}`, path.join(root, 'installer', 'installer.nsi'),
]);

console.log(`\nГотово: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} МБ)`);
