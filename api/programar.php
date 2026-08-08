<?php
/* Cola de publicaciones programadas.
 *
 * La API de Instagram no sabe programar: publica en el momento. Así que
 * las imágenes se dejan subidas, la publicación queda anotada acá, y un
 * cron (o el propio editor al abrirse) llama a este archivo para vaciar
 * lo que ya venció.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/publicador.php';
cargar_config();

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* El cron llama con ?tarea=vaciar&clave=… porque no puede mandar cabeceras. */
if (isset($_GET['tarea']) && $_GET['tarea'] === 'vaciar') {
    exigir_clave();
    responder(vaciar_cola());
}

$cuerpo = null;
if ($metodo === 'POST') {
    $cuerpo = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
}
exigir_clave($cuerpo);

try {
    if ($metodo === 'GET') {
        // las fechas salen en UTC con la Z, para que el navegador las
        // muestre en la hora de quien mira
        $filas = bd()->query(
            "SELECT id, nombre,
                    DATE_FORMAT(publicar_en, '%Y-%m-%dT%H:%i:%sZ') AS publicar_en,
                    estado, resultado
             FROM programadas ORDER BY publicar_en DESC LIMIT 50")->fetchAll();
        // los dos relojes, para poder ver de un vistazo si alguno está corrido
        $relojBd = null;
        try { $relojBd = (string) bd()->query('SELECT UTC_TIMESTAMP()')->fetchColumn(); }
        catch (Throwable $e) { /* si no contesta, con el de PHP alcanza */ }
        responder(['programadas' => $filas,
                   'ahora' => gmdate('Y-m-d\TH:i:s\Z'),
                   'ahora_bd' => $relojBd]);
    }

    if ($metodo === 'DELETE') {
        $st = bd()->prepare('DELETE FROM programadas WHERE id = ? AND estado = ?');
        $st->execute([(int) ($_GET['id'] ?? 0), 'pendiente']);
        responder(['ok' => true]);
    }

    if ($metodo !== 'POST') responder(['error' => 'Método no soportado'], 405);

    /* El navegador manda el instante en ISO con zona horaria y acá se
       guarda en UTC. Si se guardara la hora tal cual la escribe el usuario,
       un servidor en otra zona publicaría a destiempo: el hosting está en
       UTC y Chile va cuatro horas atrás. */
    $cuando = trim((string) ($cuerpo['publicar_en'] ?? ''));
    $marca = strtotime($cuando);
    if (!$marca) responder(['error' => 'La fecha no se entiende'], 400);
    if ($marca < time() + 30) responder(['error' => 'Esa hora ya pasó'], 400);

    $carga = $cuerpo['carga'] ?? null;
    if (!is_array($carga) || empty($carga['items'])) {
        responder(['error' => 'Falta el contenido a publicar'], 400);
    }
    if (trim((string) ($carga['caption'] ?? '')) === '') {
        responder(['error' => 'Falta la descripción de la publicación'], 400);
    }

    $st = bd()->prepare(
        'INSERT INTO programadas (placa_id, nombre, publicar_en, estado, carga, creada)
         VALUES (?, ?, ?, ?, ?, NOW())');
    $st->execute([
        isset($cuerpo['placa_id']) ? (int) $cuerpo['placa_id'] : null,
        mb_substr((string) ($cuerpo['nombre'] ?? 'Sin nombre'), 0, 120),
        gmdate('Y-m-d H:i:s', $marca),
        'pendiente',
        json_encode($carga, JSON_UNESCAPED_UNICODE),
    ]);
    responder(['ok' => true, 'id' => (int) bd()->lastInsertId(),
               'publicar_en' => gmdate('Y-m-d\TH:i:s\Z', $marca)]);

} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
