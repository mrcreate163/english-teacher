<?php
/*
 * «Мои уроки» — сервер синхронизации.
 *
 * Хранит только зашифрованные записи: расшифровать их можно лишь паролем синхронизации,
 * который знаете вы. Ни имён учеников, ни дат, ни сумм сервер не видит.
 * Работает на любом обычном PHP-хостинге (PHP 7.4 и новее), база данных не нужна.
 */

define('APP_VERSION', 1);
define('MAX_BODY', 12 * 1024 * 1024);     // максимальный размер одного запроса
define('MAX_CHANGES', 3000);              // максимум записей в одном запросе
define('MAX_RECORD', 262144);             // максимум размера одной записи
define('MAX_STORE', 80 * 1024 * 1024);    // потолок размера хранилища
define('MAX_FAILS', 12);                  // неудачных входов за окно
define('FAIL_WINDOW', 600);               // окно, секунд

$dataDir = __DIR__ . '/data';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('X-Content-Type-Options: nosniff');

function out($code, $arr) {
    http_response_code($code);
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail($code, $error, $message) {
    out($code, array('ok' => false, 'error' => $error, 'message' => $message));
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

/* ---------- Подготовка папки с данными ---------- */
function ensure_dir($dir) {
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    if (!is_dir($dir) || !is_writable($dir)) { return false; }
    // защита от прямого скачивания (для Apache); сами файлы дополнительно защищены кодом PHP в первой строке
    if (!file_exists($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
    }
    if (!file_exists($dir . '/index.html')) { @file_put_contents($dir . '/index.html', ''); }
    return true;
}

/* Файлы хранилища начинаются со строки PHP, которая обрывает вывод: даже если сервер отдаст файл как есть, содержимое не покажется. */
const GUARD = "<?php http_response_code(404); exit; ?>\n";

function read_json_file($path, $default) {
    if (!file_exists($path)) { return $default; }
    $raw = @file_get_contents($path);
    if ($raw === false) { return $default; }
    if (strpos($raw, GUARD) === 0) { $raw = substr($raw, strlen(GUARD)); }
    $d = json_decode($raw, true);
    return is_array($d) ? $d : $default;
}

function write_json_file($path, $data) {
    $tmp = $path . '.tmp' . getmypid();
    $json = GUARD . json_encode($data, JSON_UNESCAPED_UNICODE);
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) { return false; }
    return @rename($tmp, $path);
}

/* ---------- Простая защита от перебора пароля ---------- */
function too_many_fails($dir) {
    $f = read_json_file($dir . '/fails.php', array('t' => array()));
    $now = time();
    $recent = array();
    foreach ($f['t'] as $t) { if ($now - $t < FAIL_WINDOW) { $recent[] = $t; } }
    return count($recent) >= MAX_FAILS;
}

function note_fail($dir) {
    $f = read_json_file($dir . '/fails.php', array('t' => array()));
    $now = time();
    $recent = array();
    foreach ($f['t'] as $t) { if ($now - $t < FAIL_WINDOW) { $recent[] = $t; } }
    $recent[] = $now;
    write_json_file($dir . '/fails.php', array('t' => $recent));
}

$action = isset($_GET['a']) ? $_GET['a'] : 'ping';
$storePath = $dataDir . '/store.php';

/* ---------- Проверка связи ---------- */
if ($action === 'ping') {
    $ok = ensure_dir($dataDir);
    $store = $ok ? read_json_file($storePath, array()) : array();
    out(200, array(
        'ok' => true,
        'app' => 'moi-uroki',
        'api' => APP_VERSION,
        'php' => PHP_VERSION,
        'writable' => $ok,
        'claimed' => !empty($store['auth']),
        'https' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'),
    ));
}

if ($action !== 'sync') { fail(404, 'unknown_action', 'Неизвестное действие'); }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { fail(405, 'method', 'Нужен POST-запрос'); }
if (!ensure_dir($dataDir)) { fail(500, 'not_writable', 'Серверу не удаётся записывать данные: проверьте права на папку api/data'); }

$len = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
if ($len > MAX_BODY) { fail(413, 'too_large', 'Слишком большой запрос'); }
$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($raw === false || strlen($raw) > MAX_BODY) { fail(413, 'too_large', 'Слишком большой запрос'); }
$body = json_decode($raw, true);
if (!is_array($body)) { fail(400, 'bad_json', 'Не удалось прочитать запрос'); }

$key = isset($body['key']) ? $body['key'] : '';
if (!is_string($key) || !preg_match('/^[A-Za-z0-9_-]{20,128}$/', $key)) { fail(400, 'bad_key', 'Неверный формат ключа'); }
$since = isset($body['since']) ? (int)$body['since'] : 0;
$changes = isset($body['changes']) && is_array($body['changes']) ? $body['changes'] : array();
if (count($changes) > MAX_CHANGES) { fail(413, 'too_many', 'Слишком много записей в одном запросе'); }

if (too_many_fails($dataDir)) { fail(429, 'locked', 'Слишком много неверных попыток. Подождите 10 минут.'); }

/* ---------- Блокировка на время обработки ---------- */
$lock = fopen($dataDir . '/lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) { fail(500, 'lock', 'Не удалось получить блокировку'); }

$store = read_json_file($storePath, array('v' => 1, 'auth' => '', 'salt' => '', 'rev' => 0, 'recs' => array()));
if (!isset($store['recs']) || !is_array($store['recs'])) { $store['recs'] = array(); }
$rev = isset($store['rev']) ? (int)$store['rev'] : 0;
$claimedNow = false;

if (empty($store['auth'])) {
    // первое подключение закрепляет сервер за вашим паролем
    $salt = bin2hex(random_bytes(16));
    $store['salt'] = $salt;
    $store['auth'] = hash('sha256', $salt . $key);
    $claimedNow = true;
} else {
    if (!hash_equals($store['auth'], hash('sha256', $store['salt'] . $key))) {
        note_fail($dataDir);
        flock($lock, LOCK_UN);
        fail(401, 'wrong_password', 'Неверный пароль синхронизации');
    }
}

/* ---------- Принимаем изменения (побеждает более свежая правка) ---------- */
$changed = false;
foreach ($changes as $c) {
    if (!is_array($c)) { continue; }
    $h = isset($c['h']) ? $c['h'] : '';
    $u = isset($c['u']) ? (int)$c['u'] : 0;
    $d = !empty($c['d']) ? 1 : 0;
    $cipher = isset($c['c']) && is_string($c['c']) ? $c['c'] : '';
    if (!is_string($h) || !preg_match('/^[A-Za-z0-9_-]{16,64}$/', $h)) { continue; }
    if ($u <= 0 || strlen($cipher) > MAX_RECORD) { continue; }
    if (!$d && $cipher === '') { continue; }
    if (!preg_match('/^[A-Za-z0-9+\/=_-]*$/', $cipher)) { continue; }
    if (isset($store['recs'][$h]) && (int)$store['recs'][$h]['u'] >= $u) { continue; }
    $rev++;
    $store['recs'][$h] = array('u' => $u, 'd' => $d, 'c' => $d ? '' : $cipher, 'r' => $rev);
    $changed = true;
}

if ($changed || $claimedNow) {
    $store['rev'] = $rev;
    $encoded = strlen(json_encode($store));
    if ($encoded > MAX_STORE) { flock($lock, LOCK_UN); fail(507, 'store_full', 'Хранилище переполнено'); }
    if (!write_json_file($storePath, $store)) { flock($lock, LOCK_UN); fail(500, 'write_failed', 'Не удалось сохранить данные'); }
}

/* ---------- Отдаём всё, что новее, чем знает клиент ---------- */
$recs = array();
foreach ($store['recs'] as $h => $r) {
    if ((int)$r['r'] > $since) {
        $recs[] = array('h' => $h, 'u' => (int)$r['u'], 'd' => (int)$r['d'], 'c' => $r['c'], 'r' => (int)$r['r']);
    }
}
usort($recs, function ($a, $b) { return $a['r'] - $b['r']; });

flock($lock, LOCK_UN);
fclose($lock);

out(200, array('ok' => true, 'rev' => $rev, 'claimed' => $claimedNow, 'recs' => $recs, 'time' => (int)(microtime(true) * 1000)));
