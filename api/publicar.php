<?php
/* Publica ahora mismo lo que manda el editor.
 * El trabajo real está en publicador.php, compartido con la cola de
 * publicaciones programadas. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/publicador.php';
cargar_config();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(['error' => 'Solo POST'], 405);

$entrada = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($entrada)) responder(['error' => 'No llegó el cuerpo de la petición'], 400);
exigir_clave($entrada);

try {
    responder(publicar_ahora([
        'items'         => $entrada['items'] ?? $entrada['imagenes'] ?? [],
        'caption'       => $entrada['caption'] ?? '',
        'colaboradores' => $entrada['colaboradores'] ?? '',
        'etiquetados'   => $entrada['etiquetados'] ?? '',
    ]));
} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 502);
}
