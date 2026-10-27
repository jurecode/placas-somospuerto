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
$quien = exigir_clave($entrada);

try {
    $r = publicar_ahora([
        'items'         => $entrada['items'] ?? $entrada['imagenes'] ?? [],
        'caption'       => $entrada['caption'] ?? '',
        'colaboradores' => $entrada['colaboradores'] ?? '',
        'etiquetados'   => $entrada['etiquetados'] ?? '',
        'redes'         => $entrada['redes'] ?? ['instagram'],
        // lo que va solo a TikTok, si es distinto: el video con el cierre
        'items_tiktok'  => is_array($entrada['items_tiktok'] ?? null) ? $entrada['items_tiktok'] : null,
        // lo que se eligió en el paso de TikTok del editor
        'tiktok'        => is_array($entrada['tiktok'] ?? null) ? $entrada['tiktok'] : null,
    ]);
    // a nombre de quien entró; con la clave del sitio queda sin nombre
    registrar_redes($quien['id'], (array) ($entrada['placa'] ?? []), $r);
    responder($r);
} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 502);
}
