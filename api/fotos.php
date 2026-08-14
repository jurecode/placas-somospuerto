<?php
/* Sube una foto o un video y devuelve su URL pública.
 * El archivo va a la carpeta fotos/ y queda una fila en la tabla, para
 * poder listarlas y limpiarlas desde phpMyAdmin si hiciera falta.
 *
 * Los videos llegan de a pedazos. Un reel del teléfono pesa decenas de megas
 * y de una sola vez chocaba contra el post_max_size del hosting —que no es
 * nuestro y no siempre se puede subir—, o se cortaba a mitad de camino en una
 * conexión móvil. En trozos de dos megas eso deja de importar, y además se
 * puede ir contando cuánto falta. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();
exigir_clave();

/* Listar lo que hay subido. La carpeta está cerrada al público —el hosting
 * devuelve 403 si se pide el directorio— y así tiene que seguir, pero desde
 * el panel hace falta poder mirar un archivo concreto: cuando Instagram
 * rechaza un video, lo primero que uno quiere es abrirlo y ver qué se mandó.
 * Va detrás de la clave, igual que subir. */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && ($_GET['tarea'] ?? '') === 'listar') {
    [$dir, $base] = carpeta('fotos');
    $cuantos = min(200, max(1, (int) ($_GET['cuantos'] ?? 60)));

    $lista = [];
    foreach (scandir($dir) ?: [] as $n) {
        if ($n === '.' || $n === '..' || $n[0] === '.') continue;
        $ruta = $dir . '/' . $n;
        if (!is_file($ruta)) continue;
        /* Solo lo que se puede mirar. Se listan las extensiones permitidas en
         * vez de descartar las que molestan: en la carpeta puede haber pedazos
         * a medio subir, y cualquier cosa que llegue mañana quedaría afuera
         * sola en vez de aparecer en la lista sin que nadie lo note. */
        $ext = strtolower(pathinfo($n, PATHINFO_EXTENSION));
        $mirables = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'm4v'];
        if (!in_array($ext, $mirables, true)) continue;
        $lista[] = [
            'nombre' => $n,
            'url'    => $base . '/' . rawurlencode($n),
            'bytes'  => filesize($ruta) ?: 0,
            'cuando' => date('c', filemtime($ruta) ?: 0),
            'tipo'   => in_array($ext, ['mp4', 'mov', 'm4v'], true) ? 'video' : 'imagen',
        ];
    }
    // lo último primero, que es lo que se está por mirar
    usort($lista, static fn($x, $y) => strcmp($y['cuando'], $x['cuando']));
    responder(['archivos' => array_slice($lista, 0, $cuantos), 'total' => count($lista)]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(['error' => 'Solo POST'], 405);

/* 300 MB es lo que acepta Instagram en un reel; con la subida por pedazos el
 * límite del hosting ya no manda. */
const TOPE = 300 * 1024 * 1024;

[$dir, $url] = carpeta('fotos');
if (!is_writable($dir)) {
    responder(['error' => 'No se puede escribir en fotos/. Revisá los permisos (755).'], 500);
}

/* Lee el cuerpo, o explica por qué llegó vacío. PHP descarta la petición
 * entera cuando pasa post_max_size y no avisa de ninguna forma. */
function cuerpo_o_error(): string
{
    $datos = file_get_contents('php://input');
    if ($datos !== false && $datos !== '') return $datos;

    $declarado = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($declarado > 0) {
        responder(['error' => sprintf(
            'El servidor rechazó %d MB de una vez: PHP acepta hasta %s (post_max_size).',
            (int) round($declarado / 1048576), ini_get('post_max_size') ?: '?'
        )], 413);
    }
    responder(['error' => 'Llegó vacío'], 400);
}

/* Guarda el archivo ya completo: revisa que sea lo que dice ser, le pone un
 * nombre propio y lo anota. */
function guardar(string $binario, string $dir): void
{
    if (strlen($binario) > TOPE) responder(['error' => 'Máximo 300 MB'], 413);

    // imagen o MP4: nada más entra
    $ext = null;
    $tipo = @getimagesizefromstring($binario);
    if ($tipo !== false) {
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
                'image/gif' => 'gif'][$tipo['mime']] ?? null;
        if ($ext === null) responder(['error' => 'Formato no soportado: ' . $tipo['mime']], 400);
    } elseif (substr($binario, 4, 4) === 'ftyp') {   // firma de los MP4
        $ext = 'mp4';
    } else {
        responder(['error' => 'Eso no es una imagen ni un video MP4'], 400);
    }

    try {
        $nombre = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
        if (file_put_contents($dir . '/' . $nombre, $binario) === false) {
            responder(['error' => 'No se pudo guardar'], 500);
        }
        $st = bd()->prepare('INSERT INTO fotos (archivo, creada) VALUES (?, NOW())');
        $st->execute([$nombre]);
        responder(['ok' => true, 'id' => (int) bd()->lastInsertId(), 'ruta' => 'fotos/' . $nombre]);
    } catch (Throwable $e) {
        responder(['error' => $e->getMessage()], 500);
    }
}

/* ------------------------------------------------------------------ */
/* de a pedazos                                                        */
/* ------------------------------------------------------------------ */

if (isset($_GET['trozo'])) {
    // el nombre lo pone el navegador, así que se limpia antes de tocar el disco
    $sesion = preg_replace('/[^a-zA-Z0-9]/', '', (string) ($_GET['sesion'] ?? ''));
    if (strlen($sesion) < 8) responder(['error' => 'Falta identificar la subida'], 400);

    $parciales = $dir . '/.parciales';
    if (!is_dir($parciales) && !@mkdir($parciales, 0755, true)) {
        responder(['error' => 'No se pudo preparar la carpeta de subidas'], 500);
    }
    // subidas que quedaron por la mitad hace rato
    foreach (glob($parciales . '/*.part') ?: [] as $viejo) {
        if (is_file($viejo) && filemtime($viejo) < time() - 7200) @unlink($viejo);
    }

    $parcial = $parciales . '/' . $sesion . '.part';
    $pedazo = cuerpo_o_error();
    $llevaba = is_file($parcial) ? (int) filesize($parcial) : 0;
    if ($llevaba + strlen($pedazo) > TOPE) {
        @unlink($parcial);
        responder(['error' => 'Máximo 300 MB'], 413);
    }
    if (@file_put_contents($parcial, $pedazo, FILE_APPEND) === false) {
        responder(['error' => 'No se pudo guardar el pedazo'], 500);
    }

    if (empty($_GET['fin'])) {
        responder(['ok' => true, 'recibido' => (int) filesize($parcial)]);
    }

    $completo = file_get_contents($parcial);
    @unlink($parcial);
    if ($completo === false) responder(['error' => 'Se perdió lo subido'], 500);
    guardar($completo, $dir);
}

/* ------------------------------------------------------------------ */
/* de una sola vez, para lo chico                                      */
/* ------------------------------------------------------------------ */

guardar(cuerpo_o_error(), $dir);
