<?php
/* Sube una foto y devuelve su URL pública.
 * El archivo va a la carpeta fotos/ y queda una fila en la tabla, para
 * poder listarlas y limpiarlas desde phpMyAdmin si hiciera falta. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();
exigir_clave();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(['error' => 'Solo POST'], 405);

[$dir, $url] = carpeta('fotos');
if (!is_writable($dir)) {
    responder(['error' => 'No se puede escribir en fotos/. Revisá los permisos (755).'], 500);
}

$binario = file_get_contents('php://input');
if ($binario === false || strlen($binario) === 0) {
    /* PHP tira el cuerpo entero cuando pasa post_max_size y no avisa: sin
       esto, un reel largo fallaba con un «llegó vacío» que no explicaba nada. */
    $declarado = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($declarado > 0) {
        responder(['error' => sprintf(
            'El servidor rechazó el archivo por tamaño: pesa %d MB y PHP acepta hasta %s '
            . '(post_max_size). Subí ese límite en Site Tools → Devs → PHP Manager.',
            (int) round($declarado / 1048576), ini_get('post_max_size') ?: '?'
        )], 413);
    }
    responder(['error' => 'Llegó vacío'], 400);
}
if (strlen($binario) > 120 * 1024 * 1024) responder(['error' => 'Máximo 120 MB'], 413);

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
