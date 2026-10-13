<?php
/* Liberar espacio: borrar lo que ya no hace falta de lo que se subió.
 *
 * Todo lo que sube el editor queda en fotos/ y nunca se borraba solo. Acá se
 * mira qué sigue en uso —las placas, lo programado, las fotos de las
 * cuentas— y se ofrecen dos limpiezas:
 *
 * - Sueltos: archivos que no usa nada. Videos de prueba, los que se
 *   reemplazaron, los ya procesados para publicar. Solo los de más de un
 *   día, para no tocar una subida que está en curso.
 * - Publicadas: las placas que ya salieron hace más de N días, con sus
 *   archivos (los que no comparten con otra placa). El historial del
 *   equipo y los posts en las redes no se tocan: lo que se va es la placa
 *   del editor.
 *
 * GET  ?dias=7            cuánto ocupa todo y cuánto se libera con cada una
 * POST {tarea:'sueltos'}  o {tarea:'publicadas', dias}
 *
 * Solo con la clave del sitio o una cuenta de administración. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = $metodo === 'POST' ? (json_decode(file_get_contents('php://input') ?: '', true) ?: []) : null;
$quien = exigir_clave($cuerpo);
if (!$quien['sitio'] && $quien['rol'] !== 'admin') {
    responder(['error' => 'Liberar espacio es solo para quien administra el equipo'], 403);
}

const UN_DIA = 86400;

/* Los nombres de archivo de fotos/ que aparecen en un texto (el JSON de una
   placa, de una programada…). En el JSON la barra puede venir escapada. */
function archivos_en(string $texto): array {
    preg_match_all('#fotos(?:\\\\?/)([A-Za-z0-9._-]+)#', $texto, $m);
    return $m[1];
}

/* Lo que hay en una carpeta: nombre => [bytes, cuándo]. Sin los ocultos
   (.htaccess, pedazos a medio subir) ni las carpetas. */
function contenido(string $dir): array {
    $lista = [];
    foreach (scandir($dir) ?: [] as $n) {
        if ($n === '' || $n[0] === '.') continue;
        $ruta = $dir . '/' . $n;
        if (is_file($ruta)) $lista[$n] = [filesize($ruta) ?: 0, filemtime($ruta) ?: 0];
    }
    return $lista;
}

/* Los archivos que usa cada cosa. Las placas, una por una (para saber cuáles
   son de una placa publicada); y aparte lo programado sin publicar y las
   fotos de las cuentas, que se respetan siempre. */
function en_uso(): array {
    $porPlaca = [];
    foreach (bd()->query('SELECT id, datos FROM placas')->fetchAll() as $p) {
        $porPlaca[(int) $p['id']] = array_unique(archivos_en((string) $p['datos']));
    }
    $siempre = [];
    foreach (bd()->query("SELECT placa_id, carga FROM programadas WHERE estado <> 'publicada'")->fetchAll() as $p) {
        foreach (archivos_en((string) $p['carga']) as $a) $siempre[$a] = true;
    }
    foreach (bd()->query('SELECT foto FROM usuarios WHERE foto IS NOT NULL')->fetchAll() as $u) {
        foreach (archivos_en((string) $u['foto']) as $a) $siempre[$a] = true;
    }
    return [$porPlaca, $siempre];
}

/* Las placas que ya se publicaron hace más de `$dias` días y que no tienen
   nada programado. `$dias` 0 es «todas las publicadas». */
function placas_publicadas(int $dias): array {
    // solo las que siguen existiendo: el historial guarda también las ya borradas
    $st = bd()->prepare(
        "SELECT p.placa_id FROM publicaciones p JOIN placas pl ON pl.id = p.placa_id
         GROUP BY p.placa_id HAVING MAX(p.publicada) <= ?");
    $st->execute([gmdate('Y-m-d H:i:s', time() - $dias * UN_DIA)]);
    $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    $conCola = array_map('intval', bd()->query(
        "SELECT placa_id FROM programadas WHERE estado IN ('pendiente', 'publicando', 'error') AND placa_id IS NOT NULL")
        ->fetchAll(PDO::FETCH_COLUMN));
    return array_values(array_diff($ids, $conCola));
}

/* El plan: qué se borraría con cada limpieza y cuánto se libera. */
function plan(int $dias): array {
    [$dir] = carpeta('fotos');
    [$dirPub] = carpeta('publicaciones');
    $hay = contenido($dir);
    [$porPlaca, $siempre] = en_uso();

    $usados = $siempre;
    foreach ($porPlaca as $archivos) foreach ($archivos as $a) $usados[$a] = true;

    // sueltos: nadie los usa y tienen más de un día
    $sueltos = [];
    foreach ($hay as $n => [$bytes, $cuando]) {
        if (!isset($usados[$n]) && $cuando < time() - UN_DIA) $sueltos[$n] = $bytes;
    }
    // y los temporales de publicar que quedaron (se borran solos, pero por las dudas)
    $temporales = [];
    foreach (contenido($dirPub) as $n => [$bytes, $cuando]) {
        if ($cuando < time() - 3600) $temporales[$n] = $bytes;
    }

    // publicadas: sus archivos, salvo los que usa otra placa que se queda o algo programado
    $viejas = placas_publicadas($dias);
    $seQuedan = $siempre;
    foreach ($porPlaca as $id => $archivos) {
        if (!in_array($id, $viejas, true)) foreach ($archivos as $a) $seQuedan[$a] = true;
    }
    $dePublicadas = [];
    foreach ($viejas as $id) {
        foreach ($porPlaca[$id] ?? [] as $a) {
            if (!isset($seQuedan[$a]) && isset($hay[$a])) $dePublicadas[$a] = $hay[$a][0];
        }
    }

    return [
        'total'      => array_sum(array_column($hay, 0)) + array_sum(array_column(contenido($dirPub), 0)),
        'archivos'   => count($hay),
        'sueltos'    => $sueltos, 'temporales' => $temporales,
        'placas'     => $viejas, 'dePublicadas' => $dePublicadas,
    ];
}

/* Borra archivos de fotos/ (o de publicaciones/) por nombre. Solo nombres
   simples, sin rutas: nada fuera de esas carpetas. */
function borrar(array $nombres, string $carpeta): int {
    [$dir] = carpeta($carpeta);
    $liberado = 0;
    foreach ($nombres as $n => $bytes) {
        if (!preg_match('/^[A-Za-z0-9._-]+$/', (string) $n) || $n[0] === '.') continue;
        if (@unlink($dir . '/' . $n)) $liberado += (int) $bytes;
    }
    return $liberado;
}

try {
    $dias = max(0, min(3650, (int) ($cuerpo['dias'] ?? $_GET['dias'] ?? 7)));
    $p = plan($dias);

    if ($metodo === 'GET') {
        responder([
            'total' => $p['total'], 'archivos' => $p['archivos'], 'dias' => $dias,
            'sueltos' => ['bytes' => array_sum($p['sueltos']) + array_sum($p['temporales']),
                          'cantidad' => count($p['sueltos']) + count($p['temporales'])],
            'publicadas' => ['bytes' => array_sum($p['dePublicadas']), 'cantidad' => count($p['dePublicadas']),
                             'placas' => count($p['placas'])],
        ]);
    }
    if ($metodo !== 'POST') responder(['error' => 'Método no soportado'], 405);

    $tarea = (string) ($cuerpo['tarea'] ?? '');
    if ($tarea === 'sueltos') {
        $liberado = borrar($p['sueltos'], 'fotos') + borrar($p['temporales'], 'publicaciones');
        responder(['ok' => true, 'liberado' => $liberado, 'borrados' => count($p['sueltos']) + count($p['temporales'])]);
    }
    if ($tarea === 'publicadas') {
        $liberado = borrar($p['dePublicadas'], 'fotos');
        if ($p['placas']) {
            $marcas = implode(',', array_fill(0, count($p['placas']), '?'));
            bd()->prepare("DELETE FROM placas WHERE id IN ($marcas)")->execute($p['placas']);
        }
        responder(['ok' => true, 'liberado' => $liberado, 'borrados' => count($p['dePublicadas']),
                   'placas' => count($p['placas'])]);
    }
    responder(['error' => 'No se entiende qué hay que hacer.'], 400);
} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
