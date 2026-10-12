<?php
/* Las mejores horas para publicar, para el editor.
 *
 * GET ?separacion=30|60   la curva de las 24 horas (de Chile), de dónde
 *                         sale, el pico, y las próximas horas sugeridas,
 *                         ya separadas de lo programado o publicado.
 *     &refrescar=1        vuelve a mirar Instagram en vez de usar lo guardado
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/horarios_lib.php';
cargar_config();
exigir_clave();

try {
    $separacion = in_array((int) ($_GET['separacion'] ?? 60), [30, 60], true) ? (int) $_GET['separacion'] : 60;
    $curva = curva_de_horas(isset($_GET['refrescar']));
    responder([
        'horas' => $curva['horas'], 'pico' => $curva['pico'],
        'fuente' => $curva['fuente'], 'muestras' => $curva['muestras'],
        'zona' => ZONA_AUDIENCIA, 'separacion' => $separacion, 'minima' => SEPARACION_MINIMA,
        'sugerencias' => sugerir_horas($separacion),
    ]);
} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
