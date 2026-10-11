<?php
/* El trabajo de publicar en Instagram y Facebook, sin depender de quién lo pida.
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

/* Las redes donde se puede publicar. Instagram es la de siempre; las otras
   se agregan con el mismo procedimiento: los archivos se preparan una sola
   vez y cada red los toma de ahí. */
const REDES = ['instagram', 'facebook'];
const NOMBRES_DE_RED = ['instagram' => 'Instagram', 'facebook' => 'Facebook', 'tiktok' => 'TikTok'];

function facebook_conectado(): bool {
    return ajuste('fb_page_id') !== '' && ajuste('fb_page_token') !== '';
}

/* Las redes pedidas, en orden y sin repetidas. Sin decir nada es Instagram,
   como siempre: así lo programado antes de que hubiera redes sale igual. */
function redes_pedidas(array $carga): array {
    $pedidas = is_array($carga['redes'] ?? null) ? $carga['redes'] : ['instagram'];
    $redes = array_values(array_intersect(REDES, array_map('strval', $pedidas)));
    return $redes ?: ['instagram'];
}

/* Cada pieza necesita una URL pública para que las redes la bajen. Las que
   ya están subidas se usan tal cual; las que llegan como imagen generada se
   guardan un rato en publicaciones/. Devuelve [medios, temporales]. */
function preparar_medios(array $items): array {
    [$dir, $urlBase] = carpeta('publicaciones');
    if (!is_writable($dir)) {
        throw new RuntimeException('No se puede escribir en publicaciones/. Revisá los permisos (755).');
    }
    // restos de alguna petición que murió a mitad de camino
    foreach (glob($dir . '/*.jpg') ?: [] as $viejo) {
        if (is_file($viejo) && filemtime($viejo) < time() - 3600) @unlink($viejo);
    }
    $medios = [];
    $temporales = [];
    foreach ($items as $i => $item) {
        $tipo = $item['tipo'] ?? 'imagen';
        if (isset($item['ruta']) && $item['ruta'] !== '') {
            $medios[] = ['tipo' => $tipo, 'url' => ruta_publica((string) $item['ruta']),
                         'portadaEn' => $item['portadaEn'] ?? null];
            continue;
        }
        $partes = explode(',', (string) ($item['dataUrl'] ?? ''), 2);
        $binario = base64_decode($partes[1] ?? '', true);
        if ($binario === false) {
            foreach ($temporales as $t) @unlink($t);
            throw new RuntimeException('Una de las imágenes llegó mal');
        }
        $nombre = sprintf('%s-%d-%s.jpg', date('Ymd-His'), $i, bin2hex(random_bytes(4)));
        if (file_put_contents($dir . '/' . $nombre, $binario) === false) {
            foreach ($temporales as $t) @unlink($t);
            throw new RuntimeException('No se pudo guardar la imagen en el servidor');
        }
        $temporales[] = $dir . '/' . $nombre;
        $medios[] = ['tipo' => 'imagen', 'url' => $urlBase . '/' . $nombre];
    }
    return [$medios, $temporales];
}

/* Instagram: un contenedor por pieza, el del carrusel si son varias, y
   publicar. Es el procedimiento de siempre, sin cambios. */
function publicar_en_instagram(array $medios, array $carga): array {
    $igUser = ajuste('ig_user_id');
    $caption = (string) ($carga['caption'] ?? '');
    $aviso = null;
    $colaboradores = cuentas_de((string) ($carga['colaboradores'] ?? ''), 3);
    $etiquetas = etiquetas_usuario((string) ($carga['etiquetados'] ?? ''));
    $varias = count($medios) > 1;
    $hayVideo = false;

    // 2. un contenedor por lámina
    $hijos = [];
    foreach ($medios as $i => $medio) {
        if ($medio['tipo'] === 'reel') {
            $hayVideo = true;
            /* thumb_offset: la portada del reel, en milisegundos. Sin esto
               Instagram toma el primer cuadro, que en la mayoría de los
               videos es el fundido de entrada y sale negro. El navegador
               ya midió cuál de varios momentos tiene más imagen y manda
               ese; si no vino ninguno, se usa segundo y medio. */
            $enSegundos = (float) ($medio['portadaEn'] ?? 1.5);
            $cuerpo = ['media_type' => 'REELS', 'video_url' => $medio['url'],
                       'caption' => $caption,
                       'thumb_offset' => (int) round(max(0, $enSegundos) * 1000)];
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
            // ni la etiqueta ni la portada valen perder la publicación
            if (!$conEtiquetas && !isset($cuerpo['thumb_offset'])) throw $e;
            if ($conEtiquetas) {
                unset($cuerpo['user_tags']);
                $aviso = 'no se pudo etiquetar a nadie (' . $e->getMessage() .
                         '). Solo se puede etiquetar cuentas públicas.';
            }
            unset($cuerpo['thumb_offset']);
            $hijos[] = graph($igUser . '/media', $cuerpo)['id'];
        }
    }

    // Instagram tarda bastante más en procesar video que imagen
    $espera = $hayVideo ? 150 : 20;
    foreach ($hijos as $n => $id) {
        $tipo = $medios[$n]['tipo'] ?? 'pieza';
        esperar_contenedor((string) $id, $espera,
            sprintf('%s %d de %d', $tipo === 'imagen' ? 'la imagen' : "el $tipo",
                    $n + 1, count($hijos)));
    }

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
        esperar_contenedor($contenedor, $espera, 'el carrusel armado');
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
}

/* Facebook: en la página del medio, con su token de página.
   - Un video solo (reel, placa con voz): como video de la página.
   - Una foto: como foto, con el texto.
   - Varias: se suben sin publicar y se juntan en una sola publicación.
     La API no mezcla fotos y videos en la misma: si el carrusel trae
     videos, van después, cada uno como video aparte, y se avisa. */
function publicar_en_facebook(array $medios, string $texto): array {
    $pagina = ajuste('fb_page_id');
    $token  = ajuste('fb_page_token');
    if ($pagina === '' || $token === '') {
        throw new RuntimeException('Falta conectar la página de Facebook en el panel');
    }
    $base = 'https://graph.facebook.com';
    $fotos  = array_values(array_filter($medios, static fn($m) => $m['tipo'] === 'imagen'));
    $videos = array_values(array_filter($medios, static fn($m) => $m['tipo'] !== 'imagen'));
    $video  = static fn(array $m) => pedir("$base/$pagina/videos",
        ['file_url' => $m['url'], 'description' => $texto, 'access_token' => $token], 300);
    $enlace = static fn(string $id) => 'https://www.facebook.com/' . rawurlencode($id);

    if (!$fotos) {
        $r = $video($videos[0]);
        $aviso = null;
        foreach (array_slice($videos, 1) as $m) $video($m);
        if (count($videos) > 1) $aviso = 'en Facebook cada video salió como publicación aparte';
        return ['ok' => true, 'id' => (string) $r['id'], 'enlace' => $enlace((string) $r['id']),
                'laminas' => count($videos), 'aviso' => $aviso];
    }
    if (count($fotos) === 1) {
        $r = pedir("$base/$pagina/photos", ['url' => $fotos[0]['url'], 'caption' => $texto, 'access_token' => $token]);
        $id = (string) ($r['post_id'] ?? $r['id']);
    } else {
        $cuerpo = ['message' => $texto, 'access_token' => $token];
        foreach ($fotos as $i => $f) {
            // sin publicar: Facebook las borra solas si no se usan en 24 horas
            $subida = pedir("$base/$pagina/photos", ['url' => $f['url'], 'published' => 'false', 'access_token' => $token]);
            $cuerpo["attached_media[$i]"] = json_encode(['media_fbid' => (string) $subida['id']]);
        }
        $id = (string) pedir("$base/$pagina/feed", $cuerpo)['id'];
    }
    foreach ($videos as $m) $video($m);
    return ['ok' => true, 'id' => $id, 'enlace' => $enlace($id), 'laminas' => count($fotos),
            'aviso' => $videos ? 'en Facebook los videos del carrusel salieron como publicaciones aparte: su API no junta fotos y videos' : null];
}

/* $carga: items[], caption, colaboradores, etiquetados, y `redes`.
   Cada item es {tipo: imagen|video|reel} más `ruta` (archivo ya subido) o
   `dataUrl` (base64, solo para imágenes que se generan al vuelo).
   Se publica en cada red pedida. Si una falla, las demás igual salen, y lo
   que pasó queda en `redes` y en el aviso. Solo si fallan todas, error.
   Arriba de todo va el resultado de Instagram, como siempre: así lo leen el
   editor y la cola de programadas. */
function publicar_ahora(array $carga): array {
    $redes = redes_pedidas($carga);
    if (in_array('instagram', $redes, true)
        && (ajuste('ig_user_id') === '' || ajuste('ig_access_token') === '')) {
        throw new RuntimeException('Falta cargar la cuenta de Instagram en el panel privado');
    }
    if (in_array('facebook', $redes, true) && !facebook_conectado()) {
        throw new RuntimeException('Falta conectar la página de Facebook en el panel privado');
    }

    $items = $carga['items'] ?? [];
    if (!is_array($items) || !count($items)) throw new RuntimeException('No llegó ninguna imagen');
    if (count($items) > MAX_LAMINAS) {
        throw new RuntimeException('Instagram acepta hasta ' . MAX_LAMINAS . ' imágenes');
    }
    $caption = (string) ($carga['caption'] ?? '');
    if (trim($caption) === '') throw new RuntimeException('Falta la descripción de la publicación');

    [$medios, $temporales] = preparar_medios($items);
    $resultados = [];
    try {
        foreach ($redes as $red) {
            try {
                $resultados[$red] = $red === 'facebook'
                    ? publicar_en_facebook($medios, $caption)
                    : publicar_en_instagram($medios, $carga);
            } catch (Throwable $e) {
                $resultados[$red] = ['ok' => false, 'error' => $e->getMessage()];
            }
        }
    } finally {
        // las que se generaron acá ya las bajaron las redes; las que venían
        // subidas de antes se quedan, que son las del carrusel y los videos
        foreach ($temporales as $ruta) @unlink($ruta);
    }

    $bien = array_filter($resultados, static fn($r) => !empty($r['ok']));
    if (!$bien) {
        // con una sola red, el error tal cual, como siempre
        if (count($resultados) === 1) throw new RuntimeException((string) reset($resultados)['error']);
        $partes = [];
        foreach ($resultados as $red => $r) $partes[] = NOMBRES_DE_RED[$red] . ': ' . $r['error'];
        throw new RuntimeException('No salió en ninguna red. ' . implode(' · ', $partes));
    }
    $principal = $resultados['instagram'] ?? reset($bien);
    $avisos = [];
    foreach ($resultados as $red => $r) {
        if (empty($r['ok'])) $avisos[] = 'no salió en ' . NOMBRES_DE_RED[$red] . ': ' . $r['error'];
        elseif (!empty($r['aviso'])) $avisos[] = $r['aviso'];
    }
    return ['ok' => true, 'id' => $principal['id'] ?? null, 'enlace' => $principal['enlace'] ?? null,
            'laminas' => $principal['laminas'] ?? count($medios),
            'aviso' => $avisos ? implode(' · ', $avisos) : null, 'redes' => $resultados];
}

/* Publica todo lo que ya venció. La usa el cron y también el editor al
   abrirse, para que funcione aunque no haya cron configurado. */
function vaciar_cola(int $tope = 5): array {
    /* La hora la pone PHP y no MySQL. Las dos deberían dar lo mismo, pero si
       el reloj del servidor de base está corrido, con UTC_TIMESTAMP() todo lo
       programado vence antes de tiempo y sale al toque. Comparando contra el
       reloj de la misma máquina que aceptó la programación, eso no puede
       pasar: el que anota y el que revisa son el mismo. */
    $st = bd()->prepare(
        "SELECT id, carga FROM programadas
         WHERE estado = 'pendiente' AND publicar_en <= ?
         ORDER BY publicar_en LIMIT $tope");
    $st->execute([gmdate('Y-m-d H:i:s')]);
    $hechas = [];
    foreach ($st->fetchAll() as $fila) {
        // se marca antes de empezar: si el proceso muere a mitad, no se
        // reintenta sola y termina publicando dos veces
        $marcar = bd()->prepare("UPDATE programadas SET estado = 'publicando' WHERE id = ? AND estado = 'pendiente'");
        $marcar->execute([$fila['id']]);
        if ($marcar->rowCount() === 0) continue;   // otra corrida se la llevó

        try {
            $carga = json_decode($fila['carga'], true) ?: [];
            $r = publicar_ahora($carga);
            registrar_redes(isset($carga['quien']) ? (int) $carga['quien'] : null,
                (array) ($carga['placa'] ?? []), $r, true);
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

/* Anota en el historial cada red donde salió, con un mismo código de envío:
   así el panel del equipo las cuenta como una sola publicación. */
function registrar_redes(?int $usuarioId, array $meta, array $r, bool $programada = false): void {
    $envio = bin2hex(random_bytes(6));
    foreach (($r['redes'] ?? ['instagram' => $r]) as $red => $resultado) {
        if (!empty($resultado['ok'])) {
            registrar_publicacion($usuarioId, $meta, $resultado, $programada, (string) $red, $envio);
        }
    }
}
