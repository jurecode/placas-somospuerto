<?php
/* El trabajo de publicar en Instagram, sin depender de quién lo pida.
 *
 * Lo usan el botón del editor (api/publicar.php) y la cola de programadas
 * (api/programar.php). Está aparte justamente para que no haya dos
 * versiones del mismo procedimiento que se vayan separando con el tiempo.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';

const MAX_LAMINAS = 10;

function cuentas_de(string $texto, int $tope): array {
    $limpias = array_filter(array_map(
        static fn($c) => ltrim(trim($c), '@'),
        preg_split('/[,\s]+/', $texto) ?: []
    ));
    return array_slice(array_values($limpias), 0, $tope);
}

/* Instagram pide, además del usuario, dónde cae la etiqueta sobre la
   imagen, en porcentajes de 0 a 1. En una placa da igual, así que se
   reparten en vertical para que no se pisen. */
function etiquetas_usuario(string $texto): array {
    $tags = [];
    foreach (cuentas_de($texto, 20) as $i => $usuario) {
        $tags[] = ['username' => $usuario,
                   'x' => $i % 2 === 0 ? 0.35 : 0.65,
                   'y' => round(min(0.85, 0.2 + $i * 0.12), 2)];
    }
    return $tags;
}

function ruta_publica(string $rel): string {
    $rel = ltrim(str_replace('\\', '/', $rel), '/');
    if ($rel === '' || strpos($rel, '..') !== false || !is_file(dirname(__DIR__) . '/' . $rel)) {
        throw new RuntimeException('No se encontró un archivo de la publicación: ' . $rel);
    }
    return base_url() . '/' . $rel;
}

/* $carga: items[], caption, colaboradores, etiquetados.
   Cada item es {tipo: imagen|video|reel} más `ruta` (archivo ya subido) o
   `dataUrl` (base64, solo para imágenes que se generan al vuelo). */
function publicar_ahora(array $carga): array {
    $igUser = ajuste('ig_user_id');
    if ($igUser === '' || ajuste('ig_access_token') === '') {
        throw new RuntimeException('Falta cargar la cuenta de Instagram en el panel privado');
    }

    $items = $carga['items'] ?? [];
    if (!is_array($items) || !count($items)) throw new RuntimeException('No llegó ninguna imagen');
    if (count($items) > MAX_LAMINAS) {
        throw new RuntimeException('Instagram acepta hasta ' . MAX_LAMINAS . ' imágenes');
    }
    $caption = (string) ($carga['caption'] ?? '');
    if (trim($caption) === '') throw new RuntimeException('Falta la descripción de la publicación');

    [$dir, $urlBase] = carpeta('publicaciones');
    if (!is_writable($dir)) {
        throw new RuntimeException('No se puede escribir en publicaciones/. Revisá los permisos (755).');
    }
    // restos de alguna petición que murió a mitad de camino
    foreach (glob($dir . '/*.jpg') ?: [] as $viejo) {
        if (is_file($viejo) && filemtime($viejo) < time() - 3600) @unlink($viejo);
    }

    $temporales = [];
    $aviso = null;
    try {
        // 1. cada lámina necesita una URL pública para que Instagram la lea
        $medios = [];
        foreach ($items as $i => $item) {
            $tipo = $item['tipo'] ?? 'imagen';
            if (isset($item['ruta']) && $item['ruta'] !== '') {
                $medios[] = ['tipo' => $tipo, 'url' => ruta_publica((string) $item['ruta'])];
                continue;
            }
            $partes = explode(',', (string) ($item['dataUrl'] ?? ''), 2);
            $binario = base64_decode($partes[1] ?? '', true);
            if ($binario === false) throw new RuntimeException('Una de las imágenes llegó mal');
            $nombre = sprintf('%s-%d-%s.jpg', date('Ymd-His'), $i, bin2hex(random_bytes(4)));
            if (file_put_contents($dir . '/' . $nombre, $binario) === false) {
                throw new RuntimeException('No se pudo guardar la imagen en el servidor');
            }
            $temporales[] = $dir . '/' . $nombre;
            $medios[] = ['tipo' => 'imagen', 'url' => $urlBase . '/' . $nombre];
        }

        $colaboradores = cuentas_de((string) ($carga['colaboradores'] ?? ''), 3);
        $etiquetas = etiquetas_usuario((string) ($carga['etiquetados'] ?? ''));
        $varias = count($medios) > 1;
        $hayVideo = false;

        // 2. un contenedor por lámina
        $hijos = [];
        foreach ($medios as $i => $medio) {
            if ($medio['tipo'] === 'reel') {
                $hayVideo = true;
                $cuerpo = ['media_type' => 'REELS', 'video_url' => $medio['url'], 'caption' => $caption];
            } elseif ($medio['tipo'] === 'video') {
                $hayVideo = true;
                $cuerpo = ['media_type' => 'VIDEO', 'video_url' => $medio['url']];
            } else {
                $cuerpo = ['image_url' => $medio['url']];
            }
            if ($varias) $cuerpo['is_carousel_item'] = 'true';
            elseif ($medio['tipo'] !== 'reel') $cuerpo['caption'] = $caption;

            // las etiquetas de personas solo las admiten las imágenes
            $conEtiquetas = $i === 0 && $etiquetas && $medio['tipo'] === 'imagen';
            if ($conEtiquetas) $cuerpo['user_tags'] = json_encode($etiquetas);

            try {
                $hijos[] = graph($igUser . '/media', $cuerpo)['id'];
            } catch (RuntimeException $e) {
                // una cuenta privada o mal escrita tumba la etiqueta, no el post
                if (!$conEtiquetas) throw $e;
                unset($cuerpo['user_tags']);
                $hijos[] = graph($igUser . '/media', $cuerpo)['id'];
                $aviso = 'no se pudo etiquetar a nadie (' . $e->getMessage() .
                         '). Solo se puede etiquetar cuentas públicas.';
            }
        }

        // Instagram tarda bastante más en procesar video que imagen
        $espera = $hayVideo ? 150 : 20;
        foreach ($hijos as $id) esperar_contenedor((string) $id, $espera);

        // 3. si son varias, el contenedor del carrusel
        $contenedor = (string) $hijos[0];
        if ($varias) {
            $armar = static function (bool $con) use ($hijos, $caption, $colaboradores, $igUser) {
                $c = ['media_type' => 'CAROUSEL', 'children' => implode(',', $hijos), 'caption' => $caption];
                if ($con && $colaboradores) $c['collaborators'] = json_encode($colaboradores);
                return graph($igUser . '/media', $c)['id'];
            };
            try {
                $contenedor = (string) $armar(true);
            } catch (RuntimeException $e) {
                if (!$colaboradores) throw $e;
                $contenedor = (string) $armar(false);
                $aviso = 'no se pudieron agregar los colaboradores (' . $e->getMessage() . ')';
            }
            esperar_contenedor($contenedor, $espera);
        }

        // 4. publicar
        $id = graph($igUser . '/media_publish', ['creation_id' => $contenedor])['id'];

        $enlace = null;
        try {
            $d = pedir(host_ig() . '/' . $id . '?fields=permalink&access_token='
                       . urlencode(ajuste('ig_access_token')));
            $enlace = $d['permalink'] ?? null;
        } catch (Throwable $e) { /* ya está publicado; el enlace es un extra */ }

        return ['ok' => true, 'id' => $id, 'enlace' => $enlace,
                'laminas' => count($medios), 'aviso' => $aviso];
    } finally {
        // las que se generaron acá ya las descargó Instagram; las que venían
        // subidas de antes se quedan, que son las del carrusel y los videos
        foreach ($temporales as $ruta) @unlink($ruta);
    }
}

/* Publica todo lo que ya venció. La usa el cron y también el editor al
   abrirse, para que funcione aunque no haya cron configurado. */
function vaciar_cola(int $tope = 5): array {
    $st = bd()->prepare(
        "SELECT id, carga FROM programadas
         WHERE estado = 'pendiente' AND publicar_en <= UTC_TIMESTAMP()
         ORDER BY publicar_en LIMIT $tope");
    $st->execute();
    $hechas = [];
    foreach ($st->fetchAll() as $fila) {
        // se marca antes de empezar: si el proceso muere a mitad, no se
        // reintenta sola y termina publicando dos veces
        $marcar = bd()->prepare("UPDATE programadas SET estado = 'publicando' WHERE id = ? AND estado = 'pendiente'");
        $marcar->execute([$fila['id']]);
        if ($marcar->rowCount() === 0) continue;   // otra corrida se la llevó

        try {
            $r = publicar_ahora(json_decode($fila['carga'], true) ?: []);
            $upd = bd()->prepare("UPDATE programadas SET estado = 'publicada', resultado = ? WHERE id = ?");
            $upd->execute([$r['enlace'] ?? ('id ' . $r['id']), $fila['id']]);
            $hechas[] = ['id' => (int) $fila['id'], 'ok' => true, 'enlace' => $r['enlace'] ?? null];
        } catch (Throwable $e) {
            $upd = bd()->prepare("UPDATE programadas SET estado = 'error', resultado = ? WHERE id = ?");
            $upd->execute([mb_substr($e->getMessage(), 0, 500), $fila['id']]);
            $hechas[] = ['id' => (int) $fila['id'], 'ok' => false, 'error' => $e->getMessage()];
        }
    }
    return ['revisadas' => count($hechas), 'resultados' => $hechas];
}
