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

if (!definida('IG_USER_ID') || !definida('IG_ACCESS_TOKEN')) {
    responder(['error' => 'Falta configurar IG_USER_ID e IG_ACCESS_TOKEN en api/config.php'], 503);
}
if (!definida('PUBLICAR_CLAVE')) {
    responder(['error' => 'Falta definir PUBLICAR_CLAVE en api/config.php: sin eso el endpoint queda abierto'], 503);
}

$entrada = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($entrada)) responder(['error' => 'No llegó el cuerpo de la petición'], 400);

if (!hash_equals(PUBLICAR_CLAVE, (string) ($entrada['clave'] ?? ''))) {
    responder(['error' => 'Clave incorrecta'], 401);
}

$imagenes = $entrada['imagenes'] ?? [];
if (!is_array($imagenes) || !count($imagenes)) responder(['error' => 'No llegó ninguna imagen'], 400);
if (count($imagenes) > MAX_LAMINAS) {
    responder(['error' => 'Instagram acepta hasta ' . MAX_LAMINAS . ' imágenes'], 400);
}

$caption      = (string) ($entrada['caption'] ?? '');
$colaboradores = (string) ($entrada['colaboradores'] ?? '');

[$dir, $urlBase] = carpeta_publica();
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
    // 1. dejar las imágenes en una URL pública para que Instagram las lea
    $urls = [];
    foreach ($imagenes as $i => $dataUrl) {
        $partes = explode(',', (string) $dataUrl, 2);
        $binario = base64_decode($partes[1] ?? '', true);
        if ($binario === false) throw new RuntimeException('Una de las imágenes llegó mal');

        $nombre = sprintf('%s-%d-%s.jpg', date('Ymd-His'), $i, bin2hex(random_bytes(4)));
        $ruta = $dir . '/' . $nombre;
        if (file_put_contents($ruta, $binario) === false) {
            throw new RuntimeException('No se pudo guardar la imagen en el servidor');
        }
        $archivos[] = $ruta;
        $urls[] = $urlBase . '/' . $nombre;
    }

    $cuentas = array_slice(array_values(array_filter(array_map(
        static fn($c) => ltrim(trim($c), '@'),
        preg_split('/[,\s]+/', $colaboradores) ?: []
    ))), 0, 3);

    $varias = count($urls) > 1;

    // 2. un contenedor por imagen
    $hijos = [];
    foreach ($urls as $url) {
        $cuerpo = ['image_url' => $url];
        if ($varias) $cuerpo['is_carousel_item'] = 'true';
        else         $cuerpo['caption'] = $caption;
        $hijos[] = graph(IG_USER_ID . '/media', $cuerpo)['id'];
    }
    foreach ($hijos as $id) esperar_contenedor((string) $id);

    // 3. si son varias, el contenedor del carrusel
    $contenedor = (string) $hijos[0];
    if ($varias) {
        $armar = static function (bool $conColaboradores) use ($hijos, $caption, $cuentas) {
            $cuerpo = [
                'media_type' => 'CAROUSEL',
                'children'   => implode(',', $hijos),
                'caption'    => $caption,
            ];
            if ($conColaboradores && $cuentas) {
                $cuerpo['collaborators'] = json_encode($cuentas);
            }
            return graph(IG_USER_ID . '/media', $cuerpo)['id'];
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
        esperar_contenedor($contenedor);
    }

    // 4. publicar
    $id = graph(IG_USER_ID . '/media_publish', ['creation_id' => $contenedor])['id'];

    $enlace = null;
    try {
        $d = pedir(API_IG . '/' . $id . '?fields=permalink&access_token=' . urlencode(IG_ACCESS_TOKEN));
        $enlace = $d['permalink'] ?? null;
    } catch (Throwable $e) { /* el post ya está publicado; el enlace es un extra */ }

    $respuesta = ['ok' => true, 'id' => $id, 'enlace' => $enlace,
                  'laminas' => count($urls), 'aviso' => $aviso];

} catch (Throwable $e) {
    $respuesta = ['error' => $e->getMessage()];
    $codigo = 502;
}

// El borrado va acá y no en un bloque finally: responder() hace exit, y
// exit se lo saltea. Si no, cada publicación fallida dejaría la imagen
// colgada en una carpeta pública.
foreach ($archivos as $ruta) @unlink($ruta);

responder($respuesta, $codigo);
