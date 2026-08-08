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
if ($binario === false || strlen($binario) === 0) responder(['error' => 'Llegó vacío'], 400);
if (strlen($binario) > 25 * 1024 * 1024) responder(['error' => 'Máximo 25 MB'], 413);

$tipo = @getimagesizefromstring($binario);
if ($tipo === false) responder(['error' => 'Eso no es una imagen'], 400);
$ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
        'image/gif' => 'gif'][$tipo['mime']] ?? null;
if ($ext === null) responder(['error' => 'Formato no soportado: ' . $tipo['mime']], 400);

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
