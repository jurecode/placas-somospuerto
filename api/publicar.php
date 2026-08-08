<?php
/* Publica el carrusel en Instagram.
 *
 * Corre en el servidor y no en el navegador porque el token no puede quedar
 * en el JavaScript que cualquiera puede abrir, y porque la API de Instagram
 * no acepta que le subas archivos: exige una URL pública que va a buscar
 * ella misma. Por eso las imágenes se dejan un rato en /publicaciones y se
 * borran apenas Instagram terminó de leerlas.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

const MAX_LAMINAS = 10;

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    responder(['error' => 'Solo POST'], 405);
}

$entrada = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($entrada)) responder(['error' => 'No llegó el cuerpo de la petición'], 400);
exigir_clave($entrada);

$IG_USER_ID = ajuste('ig_user_id');
if ($IG_USER_ID === '' || ajuste('ig_access_token') === '') {
    responder(['error' => 'Falta cargar la cuenta de Instagram en el panel privado'], 503);
}

// compatibilidad: antes llegaba una lista de imágenes en base64
$items = $entrada['items'] ?? null;
if ($items === null && isset($entrada['imagenes'])) {
    $items = array_map(static fn($d) => ['tipo' => 'imagen', 'dataUrl' => $d], $entrada['imagenes']);
}
if (!is_array($items) || !count($items)) responder(['error' => 'No llegó ninguna imagen'], 400);
if (count($items) > MAX_LAMINAS) {
    responder(['error' => 'Instagram acepta hasta ' . MAX_LAMINAS . ' imágenes'], 400);
}

$caption      = (string) ($entrada['caption'] ?? '');
if (trim($caption) === '') {
    responder(['error' => 'Falta la descripción de la publicación'], 400);
}
$colaboradores = (string) ($entrada['colaboradores'] ?? '');
$etiquetados   = (string) ($entrada['etiquetados'] ?? '');

/* Instagram pide, además del usuario, dónde cae la etiqueta sobre la
   imagen, en porcentajes de 0 a 1. En una placa de noticia la posición da
   igual, así que se reparten en vertical para que no se pisen. */
function cuentas_de(string $texto, int $tope): array {
    $limpias = array_filter(array_map(
        static fn($c) => ltrim(trim($c), '@'),
        preg_split('/[,\s]+/', $texto) ?: []
    ));
    return array_slice(array_values($limpias), 0, $tope);
}

function etiquetas_usuario(string $texto): array {
    $cuentas = cuentas_de($texto, 20);   // el máximo que admite Instagram
    $tags = [];
    foreach ($cuentas as $i => $usuario) {
        $tags[] = [
            'username' => $usuario,
            'x' => $i % 2 === 0 ? 0.35 : 0.65,
            'y' => round(min(0.85, 0.2 + $i * 0.12), 2),
        ];
    }
    return $tags;
}

[$dir, $urlBase] = carpeta('publicaciones');
if (!is_dir($dir) || !is_writable($dir)) {
    responder(['error' => 'No se puede escribir en la carpeta publicaciones/. Revisá los permisos (755).'], 500);
}

// Si una petición anterior murió a mitad de camino (timeout, corte), sus
// imágenes quedaron ahí. Se limpian las de más de una hora.
foreach (glob($dir . '/*.jpg') ?: [] as $viejo) {
    if (is_file($viejo) && filemtime($viejo) < time() - 3600) @unlink($viejo);
}

$archivos = [];
$aviso = null;
$respuesta = null;
$codigo = 200;

try {
    // 1. cada lámina necesita una URL pública para que Instagram la lea.
    //    Las imágenes llegan en base64 y se dejan un rato; los videos ya
    //    están subidos desde antes, así que solo se referencian.
    $medios = [];
    foreach ($items as $i => $item) {
        if (($item['tipo'] ?? 'imagen') === 'video') {
            $rel = ltrim(str_replace('\\', '/', (string) ($item['ruta'] ?? '')), '/');
            if ($rel === '' || strpos($rel, '..') !== false || !is_file(dirname(__DIR__) . '/' . $rel)) {
                throw new RuntimeException('No se encontró el video de una de las láminas');
            }
            $medios[] = ['tipo' => 'video', 'url' => base_url() . '/' . $rel];
            continue;
        }
        $partes = explode(',', (string) ($item['dataUrl'] ?? ''), 2);
        $binario = base64_decode($partes[1] ?? '', true);
        if ($binario === false) throw new RuntimeException('Una de las imágenes llegó mal');

        $nombre = sprintf('%s-%d-%s.jpg', date('Ymd-His'), $i, bin2hex(random_bytes(4)));
        $ruta = $dir . '/' . $nombre;
        if (file_put_contents($ruta, $binario) === false) {
            throw new RuntimeException('No se pudo guardar la imagen en el servidor');
        }
        $archivos[] = $ruta;
        $medios[] = ['tipo' => 'imagen', 'url' => $urlBase . '/' . $nombre];
    }

    $cuentas  = cuentas_de($colaboradores, 3);
    $etiquetas = etiquetas_usuario($etiquetados);

    $varias = count($medios) > 1;
    $hayVideo = false;

    // 2. un contenedor por lámina. Las etiquetas de personas van en la
    //    primera, que es la placa: solo las imágenes las admiten.
    $hijos = [];
    foreach ($medios as $i => $medio) {
        if ($medio['tipo'] === 'video') {
            $hayVideo = true;
            $cuerpo = ['media_type' => 'VIDEO', 'video_url' => $medio['url']];
        } else {
            $cuerpo = ['image_url' => $medio['url']];
        }
        if ($varias) $cuerpo['is_carousel_item'] = 'true';
        else         $cuerpo['caption'] = $caption;

        $conEtiquetas = $i === 0 && $etiquetas && $medio['tipo'] !== 'video';
        if ($conEtiquetas) $cuerpo['user_tags'] = json_encode($etiquetas);

        try {
            $hijos[] = graph($IG_USER_ID . '/media', $cuerpo)['id'];
        } catch (RuntimeException $e) {
            // una cuenta privada o mal escrita tumba la etiqueta, no el post
            if (!$conEtiquetas) throw $e;
            unset($cuerpo['user_tags']);
            $hijos[] = graph($IG_USER_ID . '/media', $cuerpo)['id'];
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
        $armar = static function (bool $conColaboradores) use ($hijos, $caption, $cuentas, $IG_USER_ID) {
            $cuerpo = [
                'media_type' => 'CAROUSEL',
                'children'   => implode(',', $hijos),
                'caption'    => $caption,
            ];
            if ($conColaboradores && $cuentas) {
                $cuerpo['collaborators'] = json_encode($cuentas);
            }
            return graph($IG_USER_ID . '/media', $cuerpo)['id'];
        };
        try {
            $contenedor = (string) $armar(true);
        } catch (RuntimeException $e) {
            // los colaboradores dependen de la cuenta y del permiso; si no
            // pasan, se publica igual y se avisa en vez de perder el post
            if (!$cuentas) throw $e;
            $contenedor = (string) $armar(false);
            $aviso = 'no se pudieron agregar los colaboradores (' . $e->getMessage() . ')';
        }
        esperar_contenedor($contenedor, $espera);
    }

    // 4. publicar
    $id = graph($IG_USER_ID . '/media_publish', ['creation_id' => $contenedor])['id'];

    $enlace = null;
    try {
        $d = pedir(API_IG . '/' . $id . '?fields=permalink&access_token=' . urlencode(ajuste('ig_access_token')));
        $enlace = $d['permalink'] ?? null;
    } catch (Throwable $e) { /* el post ya está publicado; el enlace es un extra */ }

    $respuesta = ['ok' => true, 'id' => $id, 'enlace' => $enlace,
                  'laminas' => count($medios), 'aviso' => $aviso];

} catch (Throwable $e) {
    $respuesta = ['error' => $e->getMessage()];
    $codigo = 502;
}

// El borrado va acá y no en un bloque finally: responder() hace exit, y
// exit se lo saltea. Si no, cada publicación fallida dejaría la imagen
// colgada en una carpeta pública.
foreach ($archivos as $ruta) @unlink($ruta);

responder($respuesta, $codigo);
