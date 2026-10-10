/* Собирает папку и zip-архив для загрузки на обычный PHP-хостинг (Beget, SpaceWeb и т. д.).
   Результат: dist/hosting/ и dist/moi-uroki-hosting-<версия>.zip */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const out = path.join(root, 'dist', 'hosting');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const copy = (from, to = from) => {
  const dest = path.join(out, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(path.join(root, from), dest, { recursive: true });
};

['index.html', 'manifest.webmanifest', 'css', 'js'].forEach((f) => copy(f));
['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'].forEach((f) => copy(path.join('icons', f)));
copy(path.join('server', 'api', 'index.php'), path.join('api', 'index.php'));

// сервис-воркер с номером версии: при обновлении телефон сам подтянет новые файлы
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8').replace('__VERSION__', pkg.version);
fs.writeFileSync(path.join(out, 'sw.js'), sw);

fs.writeFileSync(path.join(out, '.htaccess'), `# «Мои уроки»: настройки для Apache (Beget, SpaceWeb и другие хостинги)
AddDefaultCharset UTF-8
AddType application/manifest+json .webmanifest
DirectoryIndex index.html

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "same-origin"
  <FilesMatch "\\.(html|js|css|webmanifest)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json
</IfModule>
`);

fs.writeFileSync(path.join(out, 'README.txt'), `«Мои уроки» ${pkg.version} — файлы для хостинга

Что делать:
1. Загрузите ВСЁ содержимое этой папки в корневую папку вашего сайта на хостинге (обычно public_html).
2. Откройте ваш сайт в браузере. Должно появиться приложение.
3. Проверка сервера: откройте  ВАШ-САЙТ/api/index.php  — должна показаться строка, начинающаяся с {"ok":true.

Полная инструкция с картинками: https://github.com/mrcreate163/english-teacher#readme
(файл docs/HOSTING.md в репозитории).

Обновление: загрузите такие же файлы поверх старых. Папку api/data/ (ваши данные) не удаляйте.
`);

const zipPath = path.join(root, 'dist', `moi-uroki-hosting-${pkg.version}.zip`);
const zip = new AdmZip();
zip.addLocalFolder(out);
zip.writeZip(zipPath);
console.log(`Готово: ${zipPath} (${(fs.statSync(zipPath).size / 1024).toFixed(0)} КБ)`);
