<?php
/* Qué se está haciendo ahora mismo, visto desde cualquier lado.
 *
 * El editor ya evitaba publicar dos cosas a la vez, pero solo dentro de la
 * misma pestaña: abriendo dos, o publicando desde el teléfono y desde la
 * computadora, ninguna se enteraba de la otra. Y dos publicaciones al mismo
 * tiempo se pisan —Instagram procesa las piezas de las dos y devuelve
 * errores que no dicen nada—.
 *
 * Acá se anota, en el servidor, lo que hay en curso: qué es, desde qué
 * dispositivo, desde cuándo y en qué paso va. Como es del servidor, lo ven
 * todos los que tengan el panel abierto.
 *
 * Lo anotado caduca solo: si un navegador se cierra a mitad de camino nadie
 * queda bloqueado esperando a un fantasma. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

/* Cuánto vale lo anotado sin que nadie lo refresque. Publicar un carrusel
   con videos puede llevar un par de minutos, así que el plazo tiene que
   cubrirlo; pasado eso se da por muerto. */
const VIVE_SEG = 240;

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = [];
if ($metodo === 'POST') {
    $cuerpo = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
}
exigir_clave($cuerpo);

function leer_actividad(): array {
    $crudo = ajuste('actividad', '');
    if ($crudo === '') return [];
    $d = json_decode($crudo, true);
    if (!is_array($d)) return [];
    // se descarta lo que quedó colgado
    $ahora = time();
    $vivas = array_values(array_filter($d, static fn($a) =>
        isset($a['visto']) && ($ahora - (int) $a['visto']) < VIVE_SEG));
    return $vivas;
}

if ($metodo === 'GET') {
    responder(['actividad' => leer_actividad(), 'ahora' => time()]);
}

$tarea = (string) ($cuerpo['tarea'] ?? '');
$id    = substr(preg_replace('/[^a-zA-Z0-9]/', '', (string) ($cuerpo['id'] ?? '')), 0, 40);
if ($id === '') responder(['error' => 'Falta el identificador'], 400);

$vivas = leer_actividad();
$vivas = array_values(array_filter($vivas, static fn($a) => ($a['id'] ?? '') !== $id));

if ($tarea === 'anotar') {
    $vivas[] = [
        'id'      => $id,
        'que'     => mb_substr((string) ($cuerpo['que'] ?? 'trabajando'), 0, 120),
        'paso'    => mb_substr((string) ($cuerpo['paso'] ?? ''), 0, 120),
        'donde'   => mb_substr((string) ($cuerpo['donde'] ?? ''), 0, 60),
        'desde'   => (int) ($cuerpo['desde'] ?? time()),
        'visto'   => time(),
    ];
}
// con 'borrar' simplemente no se vuelve a agregar

guardar_ajuste('actividad', json_encode(array_values($vivas), JSON_UNESCAPED_UNICODE));
responder(['ok' => true, 'actividad' => $vivas]);
