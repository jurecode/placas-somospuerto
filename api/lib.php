<?php
/* Piezas comunes de la API.
 *
 * Los datos de conexión y la clave viven en config.php, que NO está en el
 * repositorio: se crea a mano en el servidor a partir de config.ejemplo.php.
 * Las credenciales de Instagram sí van en la base, para poder cambiarlas
 * desde el panel cuando vence el token, sin tocar archivos por FTP.
 */

declare(strict_types=1);

/* La respuesta es JSON: un aviso de PHP impreso en medio lo rompe. Los
   errores se registran, pero no se muestran. */
@ini_set('display_errors', '0');
error_reporting(E_ALL);

/* Meta tiene dos puertas y cada token sirve solo en la que lo emitió:
   graph.instagram.com para las apps con Instagram Login, graph.facebook.com
   para las que van con Facebook Login. Mandar el token a la puerta
   equivocada devuelve "Failed to decrypt", que no dice nada útil. Como no
   hay forma de saberlo mirando el token, se prueban las dos y se recuerda
   cuál anduvo. */
const HOSTS_IG = [
    'https://graph.instagram.com/v25.0',
    'https://graph.facebook.com',   // sin versión: Meta usa la que corresponda
];
const API_IG = 'https://graph.instagram.com/v25.0';   // sólo por compatibilidad

function cargar_config(): void {
    $ruta = __DIR__ . '/config.php';
    if (is_file($ruta)) require_once $ruta;
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

/* ------------------------------------------------------------------ */
/* base de datos                                                       */
/* ------------------------------------------------------------------ */

function bd(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    foreach (['BD_HOST', 'BD_NOMBRE', 'BD_USUARIO'] as $c) {
        if (!defined($c)) {
            throw new RuntimeException('Falta configurar la base de datos en api/config.php');
        }
    }
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', BD_HOST, BD_NOMBRE);
    $pdo = new PDO($dsn, BD_USUARIO, defined('BD_CLAVE') ? BD_CLAVE : '', [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    crear_tablas($pdo);
    return $pdo;
}

/* Se crean solas la primera vez: no hay que correr SQL a mano. Igual se
   pueden mirar y editar desde phpMyAdmin. */
function crear_tablas(PDO $pdo): void {
    static $hecho = false;
    if ($hecho) return;
    $hecho = true;

    $pdo->exec("CREATE TABLE IF NOT EXISTS placas (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        nombre       VARCHAR(120) NOT NULL DEFAULT '',
        formato      VARCHAR(20)  NOT NULL DEFAULT 'noticia',
        datos        LONGTEXT     NOT NULL,
        actualizada  DATETIME     NOT NULL,
        INDEX (actualizada)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS fotos (
        id       INT AUTO_INCREMENT PRIMARY KEY,
        archivo  VARCHAR(200) NOT NULL,
        creada   DATETIME     NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ajustes (
        clave  VARCHAR(60) PRIMARY KEY,
        valor  TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function ajuste(string $clave, string $porDefecto = ''): string {
    $st = bd()->prepare('SELECT valor FROM ajustes WHERE clave = ?');
    $st->execute([$clave]);
    $v = $st->fetchColumn();
    return $v === false ? $porDefecto : (string) $v;
}

function guardar_ajuste(string $clave, string $valor): void {
    $st = bd()->prepare(
        'INSERT INTO ajustes (clave, valor) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)');
    $st->execute([$clave, $valor]);
}

/* ------------------------------------------------------------------ */
/* autenticación                                                       */
/* ------------------------------------------------------------------ */

function clave_recibida(): string {
    if (isset($_SERVER['HTTP_X_CLAVE'])) return (string) $_SERVER['HTTP_X_CLAVE'];
    if (isset($_GET['clave'])) return (string) $_GET['clave'];
    return '';
}

function exigir_clave(?array $cuerpo = null): void {
    if (!definida('PUBLICAR_CLAVE')) {
        responder(['error' => 'Falta definir PUBLICAR_CLAVE en api/config.php'], 503);
    }
    $recibida = $cuerpo['clave'] ?? clave_recibida();
    if (!hash_equals(PUBLICAR_CLAVE, (string) $recibida)) {
        responder(['error' => 'Clave incorrecta'], 401);
    }
}

/* ------------------------------------------------------------------ */
/* carpetas públicas                                                   */
/* ------------------------------------------------------------------ */

function base_url(): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
             || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $raiz  = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))), '/');
    return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '') . $raiz;
}

function carpeta(string $nombre): array {
    $dir = dirname(__DIR__) . '/' . $nombre;
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return [$dir, base_url() . '/' . $nombre];
}

/* ------------------------------------------------------------------ */
/* Instagram                                                           */
/* ------------------------------------------------------------------ */

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

    if ($cuerpo === false) throw new RuntimeException('No se pudo contactar a Instagram: ' . $error);
    $datos = json_decode((string) $cuerpo, true);
    if (!is_array($datos)) throw new RuntimeException('Instagram devolvió una respuesta inesperada');
    if (isset($datos['error'])) {
        throw new RuntimeException(
            $datos['error']['error_user_msg'] ?? $datos['error']['message'] ?? 'Error de Instagram');
    }
    return $datos;
}

/* Devuelve el host que funciona con el token guardado, probándolos si hace
   falta. La respuesta queda anotada para no probar en cada llamada. */
function host_ig(bool $reprobar = false): string {
    $guardado = ajuste('ig_host');
    if ($guardado !== '' && !$reprobar) return $guardado;

    $id    = ajuste('ig_user_id');
    $token = ajuste('ig_access_token');
    if ($id === '' || $token === '') throw new RuntimeException('Falta la cuenta de Instagram');

    $ultimo = null;
    foreach (HOSTS_IG as $host) {
        try {
            pedir($host . '/' . $id . '?fields=id,username&access_token=' . urlencode($token));
            guardar_ajuste('ig_host', $host);
            return $host;
        } catch (RuntimeException $e) {
            $ultimo = $e;
        }
    }
    throw new RuntimeException($ultimo ? $ultimo->getMessage() : 'El token no funciona');
}

function graph(string $ruta, array $cuerpo): array {
    $cuerpo['access_token'] = ajuste('ig_access_token');
    return pedir(host_ig() . '/' . $ruta, $cuerpo);
}

/* Instagram descarga la imagen en segundo plano: hay que esperar a que el
   contenedor quede FINISHED antes de publicarlo. */
function esperar_contenedor(string $id, int $intentos = 20): void {
    $token = ajuste('ig_access_token');
    $host  = host_ig();
    for ($i = 0; $i < $intentos; $i++) {
        $d = pedir($host . '/' . $id . '?fields=status_code&access_token=' . urlencode($token));
        $estado = $d['status_code'] ?? '';
        if ($estado === 'FINISHED') return;
        if ($estado === 'ERROR' || $estado === 'EXPIRED') {
            throw new RuntimeException("Instagram rechazó una de las imágenes ($estado)");
        }
        sleep(2);
    }
    throw new RuntimeException('Instagram tardó demasiado en procesar las imágenes');
}
