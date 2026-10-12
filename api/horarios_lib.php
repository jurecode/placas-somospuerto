<?php
/* Las mejores horas para publicar.
 *
 * Instagram no da con este tipo de conexión cuántos seguidores hay
 * conectados a cada hora, así que se mira lo que sí da siempre: las propias
 * publicaciones de la cuenta, con sus «me gusta» y comentarios. Cada una se
 * compara con lo normal para su tipo (los reels sacan más que las fotos), y
 * se promedia según la hora a la que salió. Así sale a qué hora reacciona
 * más esta audiencia.
 *
 * Con pocas publicaciones, cada hora se apoya en el horario típico de un
 * medio de noticias en Chile, y con ninguna, se usa ese horario tal cual.
 *
 * Las horas son de Chile: la de la audiencia, no la del servidor. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';

const ZONA_AUDIENCIA = 'America/Santiago';

/* Nunca dos publicaciones a menos de esto: se pisan en el feed y la segunda
   le quita alcance a la primera. Es el piso; en el editor se elige 30 o 60. */
const SEPARACION_MINIMA = 30;   // minutos

/* El horario típico de un medio de noticias en Chile, de 0 a 23 h: la
   mañana camino al trabajo, el almuerzo y el pico de la noche. */
const CURVA_TIPICA = [0.30, 0.18, 0.11, 0.08, 0.08, 0.12, 0.28, 0.52, 0.74, 0.80, 0.74, 0.72,
                      0.82, 0.94, 0.90, 0.76, 0.72, 0.76, 0.86, 0.95, 1.00, 0.96, 0.80, 0.52];

const HORARIOS_DURAN = 6 * 3600;   // cada cuánto se vuelve a mirar Instagram

/* La curva de las 24 horas, de 0 a 1, con de dónde sale. Se guarda unas
   horas: no hace falta preguntarle a Instagram cada vez que se abre el editor. */
function curva_de_horas(bool $refrescar = false): array {
    $guardada = json_decode(ajuste('horarios'), true);
    if (!$refrescar && is_array($guardada) && ($guardada['cuando'] ?? 0) > time() - HORARIOS_DURAN) {
        return $guardada;
    }
    $curva = null;
    try {
        $curva = curva_de_publicaciones(publicaciones_de_instagram());
    } catch (Throwable $e) {
        error_log('no se pudieron leer las publicaciones para los horarios: ' . $e->getMessage());
    }
    $curva = $curva ?? ['horas' => CURVA_TIPICA, 'fuente' => 'tipica', 'muestras' => 0];
    $curva['pico'] = array_search(max($curva['horas']), $curva['horas'], true);
    $curva['cuando'] = time();
    guardar_ajuste('horarios', json_encode($curva));
    return $curva;
}

/* Las últimas publicaciones de la cuenta, hasta 300, con cuándo salieron y
   cuánta reacción tuvieron. Solo pide campos básicos: no hace falta ningún
   permiso de estadísticas. */
function publicaciones_de_instagram(): array {
    $id = ajuste('ig_user_id');
    $token = ajuste('ig_access_token');
    if ($id === '' || $token === '') return [];
    $url = host_ig() . '/' . rawurlencode($id) . '/media?fields=id,timestamp,like_count,comments_count,media_product_type'
         . '&limit=100&access_token=' . urlencode($token);
    $todas = [];
    for ($pagina = 0; $pagina < 3 && $url; $pagina++) {
        $d = pedir($url);
        foreach ($d['data'] ?? [] as $m) $todas[] = $m;
        $url = $d['paging']['next'] ?? null;
    }
    return $todas;
}

/* La curva sale de las publicaciones de los últimos 90 días, dejando afuera
   las de menos de un día: todavía están juntando reacciones y harían parecer
   mala cualquier hora reciente. Devuelve null si no alcanzan. */
function curva_de_publicaciones(array $medios): ?array {
    $zona = new DateTimeZone(ZONA_AUDIENCIA);
    $desde = time() - 90 * 86400;
    $hasta = time() - 86400;
    $porTipo = [];
    $validas = [];
    foreach ($medios as $m) {
        $t = strtotime((string) ($m['timestamp'] ?? ''));
        if (!$t || $t < $desde || $t > $hasta) continue;
        // un comentario vale más que un «me gusta»: cuesta más dejarlo
        $reaccion = (int) ($m['like_count'] ?? 0) + 2 * (int) ($m['comments_count'] ?? 0);
        $tipo = (string) ($m['media_product_type'] ?? 'FEED');
        $hora = (int) (new DateTime('@' . $t))->setTimezone($zona)->format('G');
        $validas[] = ['tipo' => $tipo, 'hora' => $hora, 'reaccion' => $reaccion];
        $porTipo[$tipo][] = $reaccion;
    }
    if (count($validas) < 12) return null;

    // lo normal de cada tipo: la mediana, que un post viral no la mueve
    $mediana = [];
    foreach ($porTipo as $tipo => $valores) {
        sort($valores);
        $n = count($valores);
        $mediana[$tipo] = max(1, $n % 2 ? $valores[intdiv($n, 2)] : ($valores[$n / 2 - 1] + $valores[$n / 2]) / 2);
    }

    /* Cada hora: el promedio de cuánto rindieron sus posts respecto de lo
       normal, apoyado en el horario típico con el peso de tres posts. Una
       hora con un solo post no puede ganar por casualidad. */
    $suma = array_fill(0, 24, 0.0);
    $cuantos = array_fill(0, 24, 0);
    foreach ($validas as $v) {
        // el logaritmo achata los virales: uno solo no define una hora
        $suma[$v['hora']] += log(1 + $v['reaccion'] / $mediana[$v['tipo']]) / log(2);
        $cuantos[$v['hora']]++;
    }
    $apoyo = 3;
    $horas = [];
    for ($h = 0; $h < 24; $h++) {
        $horas[] = ($suma[$h] + $apoyo * CURVA_TIPICA[$h]) / ($cuantos[$h] + $apoyo);
    }
    // suavizada con las vecinas: las 20:00 y las 21:00 no son mundos aparte
    $suave = [];
    for ($h = 0; $h < 24; $h++) {
        $suave[] = 0.25 * $horas[($h + 23) % 24] + 0.5 * $horas[$h] + 0.25 * $horas[($h + 1) % 24];
    }
    $max = max($suave) ?: 1;
    return ['horas' => array_map(static fn($x) => round($x / $max, 3), $suave),
            'fuente' => 'publicaciones', 'muestras' => count($validas)];
}

/* Los momentos ya tomados: lo que está programado y lo que salió en las
   últimas horas. `$excepto` deja afuera una programada (la que se mueve). */
function momentos_ocupados(?int $excepto = null): array {
    $ocupados = [];
    // las fechas se guardan en UTC y se leen como UTC: con UNIX_TIMESTAMP la
    // base las interpretaría en su propia zona
    $st = bd()->prepare("SELECT id, nombre, publicar_en FROM programadas
                         WHERE estado IN ('pendiente', 'publicando') AND id <> ?");
    $st->execute([$excepto ?? 0]);
    foreach ($st->fetchAll() as $f) {
        $ocupados[] = ['t' => strtotime($f['publicar_en'] . ' UTC'), 'nombre' => $f['nombre'], 'programada' => true];
    }
    $st = bd()->prepare('SELECT nombre, publicada FROM publicaciones WHERE publicada >= ?');
    $st->execute([gmdate('Y-m-d H:i:s', time() - 6 * 3600)]);
    foreach ($st->fetchAll() as $f) {
        $ocupados[] = ['t' => strtotime($f['publicada'] . ' UTC'), 'nombre' => $f['nombre'], 'programada' => false];
    }
    return $ocupados;
}

/* La publicación que queda a menos de `$minutos` del instante `$t`, si hay. */
function choca(int $t, int $minutos, ?int $excepto = null): ?array {
    $cerca = null;
    foreach (momentos_ocupados($excepto) as $o) {
        $d = abs($o['t'] - $t);
        if ($d < $minutos * 60 && (!$cerca || $d < abs($cerca['t'] - $t))) $cerca = $o;
    }
    return $cerca;
}

/* Qué tan buena es una hora: la de la curva, y en las y media, el promedio
   con la siguiente. */
function puntaje_de(int $t, array $horas): float {
    $local = (new DateTime('@' . $t))->setTimezone(new DateTimeZone(ZONA_AUDIENCIA));
    $h = (int) $local->format('G');
    $m = (int) $local->format('i');
    return $m >= 30 ? ($horas[$h] + $horas[($h + 1) % 24]) / 2 : $horas[$h];
}

/* Las mejores horas de los próximos dos días, siempre en punto o y media,
   lejos de lo ya programado o publicado, y separadas entre sí. Entre dos
   horas parecidas gana la más cercana: lo que se quiere es publicar pronto. */
function sugerir_horas(int $separacion, int $cuantas = 3, ?int $excepto = null): array {
    $separacion = max(SEPARACION_MINIMA, $separacion);
    $curva = curva_de_horas();
    $ocupados = momentos_ocupados($excepto);
    $media = 1800;
    $desde = (int) ceil((time() + 20 * 60) / $media) * $media;
    $candidatos = [];
    for ($t = $desde; $t <= time() + 48 * 3600; $t += $media) {
        foreach ($ocupados as $o) {
            if (abs($o['t'] - $t) < $separacion * 60) continue 2;
        }
        $horasAdelante = ($t - time()) / 3600;
        // cada hora de espera resta un poco: una noticia no aguanta un día
        // entero por un 10 % más de audiencia
        $candidatos[] = ['t' => $t, 'puntaje' => puntaje_de($t, $curva['horas']) * (1 - 0.006 * $horasAdelante)];
    }
    usort($candidatos, static fn($a, $b) => $b['puntaje'] <=> $a['puntaje']);
    $elegidas = [];
    foreach ($candidatos as $c) {
        foreach ($elegidas as $e) {
            if (abs($e['t'] - $c['t']) < max($separacion, 120) * 60) continue 2;
        }
        $elegidas[] = $c;
        if (count($elegidas) >= $cuantas) break;
    }
    return array_map(static fn($c) => [
        'cuando' => gmdate('Y-m-d\TH:i:s\Z', $c['t']),
        'puntaje' => round(puntaje_de($c['t'], $curva['horas']), 2),
    ], $elegidas);
}
