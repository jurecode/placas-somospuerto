<?php
/* Piezas comunes de la API.
 *
 * Las credenciales viven en config.php, que NO está en el repositorio: se
 * crea a mano en el servidor a partir de config.ejemplo.php. Así el token
 * nunca pasa por GitHub.
 */

declare(strict_types=1);

/* La respuesta es JSON: un aviso de PHP impreso en medio lo rompe. Los
   errores se registran, pero no se muestran. */
@ini_set('display_errors', '0');
error_reporting(E_ALL);

const API_IG = 'https://graph.instagram.com/v25.0';

function cargar_config(): void {
    $ruta = __DIR__ . '/config.php';
    if (is_file($ruta)) {
        require_once $ruta;
    }
}

function responder(array $datos, int $codigo = 200): void {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function definida(string $nombre): bool {
    return defined($nombre) && trim((string) constant($nombre)) !== '';
}

/* La carpeta pública donde se dejan las imágenes el rato que Instagram
   tarda en descargarlas. Tiene que ser accesible desde internet. */
function carpeta_publica(): array {
    $dir = dirname(__DIR__) . '/publicaciones';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);

    $https  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
              || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $raiz   = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))), '/');
    $base   = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '') . $raiz;

    return [$dir, $base . '/publicaciones'];
}

function pedir(string $url, ?array $post = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    if ($post !== null) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($post));
    }
    $cuerpo = curl_exec($ch);
    $error  = curl_error($ch);
    // curl_close() no se llama: desde PHP 8.0 no hace nada y en 8.5 avisa
    // que está obsoleto, y ese aviso corrompería el JSON de respuesta.

    if ($cuerpo === false) {
        throw new RuntimeException('No se pudo contactar a Instagram: ' . $error);
    }
    $datos = json_decode($cuerpo, true);
    if (!is_array($datos)) {
        throw new RuntimeException('Instagram devolvió una respuesta inesperada');
    }
    if (isset($datos['error'])) {
        throw new RuntimeException(
            $datos['error']['error_user_msg'] ?? $datos['error']['message'] ?? 'Error de Instagram');
    }
    return $datos;
}

function graph(string $ruta, array $cuerpo): array {
    $cuerpo['access_token'] = IG_ACCESS_TOKEN;
    return pedir(API_IG . '/' . $ruta, $cuerpo);
}

/* Instagram descarga la imagen en segundo plano: hay que esperar a que el
   contenedor quede FINISHED antes de publicarlo. */
function esperar_contenedor(string $id, int $intentos = 20): void {
    for ($i = 0; $i < $intentos; $i++) {
        $d = pedir(API_IG . '/' . $id . '?fields=status_code&access_token=' . urlencode(IG_ACCESS_TOKEN));
        $estado = $d['status_code'] ?? '';
        if ($estado === 'FINISHED') return;
        if ($estado === 'ERROR' || $estado === 'EXPIRED') {
            throw new RuntimeException("Instagram rechazó una de las imágenes ($estado)");
        }
        sleep(2);
    }
    throw new RuntimeException('Instagram tardó demasiado en procesar las imágenes');
}
