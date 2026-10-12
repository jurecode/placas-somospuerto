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
require_once __DIR__ . '/horarios_lib.php';
cargar_config();

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* Dos publicaciones a menos de media hora no: se pisan en el feed. Se
   rechaza y se dice con cuál choca y qué hora libre hay cerca. */
function separada_o_rechazar(int $t, ?int $excepto = null): void {
    $con = choca($t, SEPARACION_MINIMA, $excepto);
    if (!$con) return;
    $minutos = (int) round(abs($con['t'] - $t) / 60);
    $libre = sugerir_horas(SEPARACION_MINIMA, 1, $excepto)[0]['cuando'] ?? null;
    responder([
        'error' => "Queda a $minutos min de «" . str_replace('*', '', (string) $con['nombre']) . '», que '
            . ($con['programada'] ? 'está programada' : 'acaba de salir')
            . '. Entre dos publicaciones tiene que haber al menos ' . SEPARACION_MINIMA . ' minutos.',
        'sugerencia' => $libre,
    ], 409);
}

/* El cron llama con ?tarea=vaciar&clave=… porque no puede mandar cabeceras. */
if (isset($_GET['tarea']) && $_GET['tarea'] === 'vaciar') {
    exigir_clave();
    responder(vaciar_cola());
}

$cuerpo = null;
if ($metodo === 'POST') {
    $cuerpo = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
}
$quien = exigir_clave($cuerpo);

try {
    if ($metodo === 'GET') {
        /* Primero lo que falta salir, de la más próxima a la más lejana; después
           las últimas que ya salieron o fallaron. Las fechas van en UTC con la
           Z, para que el navegador las muestre en la hora de quien mira. */
        $campos = "id, nombre, DATE_FORMAT(publicar_en, '%Y-%m-%dT%H:%i:%sZ') AS publicar_en,
                   estado, resultado, carga";
        $proximas = bd()->query("SELECT $campos FROM programadas
            WHERE estado IN ('pendiente', 'publicando') ORDER BY publicar_en ASC LIMIT 50")->fetchAll();
        $hechas = bd()->query("SELECT $campos FROM programadas
            WHERE estado NOT IN ('pendiente', 'publicando') ORDER BY publicar_en DESC LIMIT 15")->fetchAll();
        // quién programó cada una: el nombre de su cuenta
        $nombres = [];
        foreach (bd()->query('SELECT id, nombre FROM usuarios')->fetchAll() as $u) $nombres[(int) $u['id']] = $u['nombre'];
        $filas = array_map(static function ($f) use ($nombres) {
            $c = json_decode((string) $f['carga'], true) ?: [];
            unset($f['carga']);   // las piezas no hacen falta para la lista
            $f['id'] = (int) $f['id'];
            $f['redes'] = redes_pedidas($c);
            $f['quien'] = isset($c['quien']) ? ($nombres[(int) $c['quien']] ?? null) : null;
            $f['formato'] = $c['placa']['formato'] ?? null;
            return $f;
        }, array_merge($proximas, $hechas));
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

    $tarea = (string) ($cuerpo['tarea'] ?? '');

    /* Cambiarle la hora a una que no salió todavía. Una que falló también se
       puede reprogramar: vuelve a la cola con la hora nueva. */
    if ($tarea === 'mover') {
        $marca = strtotime(trim((string) ($cuerpo['publicar_en'] ?? '')));
        if (!$marca) responder(['error' => 'La fecha no se entiende'], 400);
        if ($marca < time() + 30) responder(['error' => 'Esa hora ya pasó'], 400);
        separada_o_rechazar($marca, (int) ($cuerpo['id'] ?? 0));
        $st = bd()->prepare("UPDATE programadas SET publicar_en = ?, estado = 'pendiente', resultado = NULL
                             WHERE id = ? AND estado IN ('pendiente', 'error')");
        $st->execute([gmdate('Y-m-d H:i:s', $marca), (int) ($cuerpo['id'] ?? 0)]);
        if ($st->rowCount() === 0) responder(['error' => 'Esa ya salió o está saliendo: no se puede mover'], 409);
        responder(['ok' => true, 'publicar_en' => gmdate('Y-m-d\TH:i:s\Z', $marca)]);
    }

    /* Publicarla ya, sin esperar la hora: la pendiente que se quiere adelantar
       o la que falló y se quiere reintentar. Se marca primero, igual que la
       cola, para que dos clics no la publiquen dos veces. */
    if ($tarea === 'ahora') {
        $id = (int) ($cuerpo['id'] ?? 0);
        $marcar = bd()->prepare("UPDATE programadas SET estado = 'publicando', publicar_en = ?
                                 WHERE id = ? AND estado IN ('pendiente', 'error')");
        $marcar->execute([gmdate('Y-m-d H:i:s'), $id]);
        if ($marcar->rowCount() === 0) responder(['error' => 'Esa ya salió o está saliendo'], 409);
        $st = bd()->prepare('SELECT carga FROM programadas WHERE id = ?');
        $st->execute([$id]);
        $r = publicar_programada($id, (string) $st->fetchColumn());
        responder($r, $r['ok'] ? 200 : 502);
    }

    /* El navegador manda el instante en ISO con zona horaria y acá se
       guarda en UTC. Si se guardara la hora tal cual la escribe el usuario,
       un servidor en otra zona publicaría a destiempo: el hosting está en
       UTC y Chile va cuatro horas atrás. */
    $cuando = trim((string) ($cuerpo['publicar_en'] ?? ''));
    $marca = strtotime($cuando);
    if (!$marca) responder(['error' => 'La fecha no se entiende'], 400);
    if ($marca < time() + 30) responder(['error' => 'Esa hora ya pasó'], 400);
    separada_o_rechazar($marca);

    $carga = $cuerpo['carga'] ?? null;
    if (!is_array($carga) || empty($carga['items'])) {
        responder(['error' => 'Falta el contenido a publicar'], 400);
    }
    if (trim((string) ($carga['caption'] ?? '')) === '') {
        responder(['error' => 'Falta la descripción de la publicación'], 400);
    }
    // si pide Facebook y la página no está conectada, se dice ahora y no a la hora de salir
    if (in_array('facebook', redes_pedidas($carga), true) && !facebook_conectado()) {
        responder(['error' => 'Falta conectar la página de Facebook en el panel privado'], 400);
    }
    if (in_array('tiktok', redes_pedidas($carga), true) && !tiktok_conectado()) {
        responder(['error' => 'Falta conectar la cuenta de TikTok en el panel privado'], 400);
    }
    $carga['redes'] = redes_pedidas($carga);
    /* Quién la programó lo pone el servidor, de la sesión, y no lo que
       diga el navegador: si no, cualquiera podría publicar a nombre de otro.
       Cuando el cron la publique, queda anotada a su nombre. */
    $carga['quien'] = $quien['id'];
    $carga['placa'] = [
        'placa_id' => isset($cuerpo['placa_id']) ? (int) $cuerpo['placa_id'] : null,
        'nombre'   => mb_substr((string) ($cuerpo['nombre'] ?? ''), 0, 120),
        'formato'  => mb_substr((string) ($cuerpo['formato'] ?? ''), 0, 20),
    ];

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
