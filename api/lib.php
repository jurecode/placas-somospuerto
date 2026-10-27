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
   pueden mirar y editar desde phpMyAdmin.

   «La primera vez» antes era «cada vez»: el `static` dura lo que dura un
   pedido, y cada pedido a la API —el panel de actividad pregunta cada
   pocos segundos— abría la base y mandaba estos cuatro CREATE TABLE. No
   rompían nada, pero en un hosting que limita cuánto se le pide, era carga
   sin ningún propósito.
   Ahora, cuando salen bien, se deja una marca en el disco y no se vuelven a
   mandar. El nombre de la marca sale del propio SQL: si mañana se agrega una
   tabla acá, el texto cambia, la marca es otra y se crean solas de nuevo,
   sin acordarse de nada. Si la carpeta no se puede escribir, se sigue
   haciendo como antes. */
function crear_tablas(PDO $pdo): void {
    static $hecho = false;
    if ($hecho) return;
    $hecho = true;

    $tablas = [];
    $tablas[] = "CREATE TABLE IF NOT EXISTS placas (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        nombre       VARCHAR(120) NOT NULL DEFAULT '',
        formato      VARCHAR(20)  NOT NULL DEFAULT 'noticia',
        datos        LONGTEXT     NOT NULL,
        actualizada  DATETIME     NOT NULL,
        INDEX (actualizada)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    $tablas[] = "CREATE TABLE IF NOT EXISTS fotos (
        id       INT AUTO_INCREMENT PRIMARY KEY,
        archivo  VARCHAR(200) NOT NULL,
        creada   DATETIME     NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    /* Instagram no tiene programación en su API: publica al instante. Por
       eso la cola vive acá y un cron la va vaciando cuando llega la hora. */
    $tablas[] = "CREATE TABLE IF NOT EXISTS programadas (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        placa_id    INT          NULL,
        nombre      VARCHAR(120) NOT NULL DEFAULT '',
        publicar_en DATETIME     NOT NULL,
        estado      VARCHAR(12)  NOT NULL DEFAULT 'pendiente',
        carga       LONGTEXT     NOT NULL,
        resultado   TEXT         NULL,
        creada      DATETIME     NOT NULL,
        INDEX (estado, publicar_en)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    $tablas[] = "CREATE TABLE IF NOT EXISTS ajustes (
        clave  VARCHAR(60) PRIMARY KEY,
        valor  TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    /* Las cuentas del equipo. La contraseña no se guarda: se guarda su
       huella (password_hash), que no se puede dar vuelta. */
    $tablas[] = "CREATE TABLE IF NOT EXISTS usuarios (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        usuario         VARCHAR(40)  NOT NULL UNIQUE,
        nombre          VARCHAR(80)  NOT NULL DEFAULT '',
        clave_hash      VARCHAR(255) NOT NULL,
        foto            VARCHAR(200) NOT NULL DEFAULT '',
        rol             VARCHAR(12)  NOT NULL DEFAULT 'editor',
        activo          TINYINT(1)   NOT NULL DEFAULT 1,
        creado          DATETIME     NOT NULL,
        ultimo_ingreso  DATETIME     NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    /* Una fila por navegador donde alguien entró. Del código de la sesión
       se guarda la huella, no el código: quien lea la base no puede entrar
       con lo que ve. */
    $tablas[] = "CREATE TABLE IF NOT EXISTS sesiones (
        token       CHAR(64)     PRIMARY KEY,
        usuario_id  INT          NOT NULL,
        creada      DATETIME     NOT NULL,
        usada       DATETIME     NOT NULL,
        donde       VARCHAR(120) NOT NULL DEFAULT '',
        INDEX (usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    /* Lo que se publicó y quién lo publicó, para el panel del equipo. */
    $tablas[] = "CREATE TABLE IF NOT EXISTS publicaciones (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id  INT          NULL,
        placa_id    INT          NULL,
        nombre      VARCHAR(120) NOT NULL DEFAULT '',
        formato     VARCHAR(20)  NOT NULL DEFAULT '',
        piezas      INT          NOT NULL DEFAULT 1,
        enlace      VARCHAR(255) NULL,
        ig_id       VARCHAR(40)  NULL,
        programada  TINYINT(1)   NOT NULL DEFAULT 0,
        publicada   DATETIME     NOT NULL,
        red         VARCHAR(12)  NOT NULL DEFAULT 'instagram',
        envio       VARCHAR(16)  NULL,
        INDEX (usuario_id, publicada),
        INDEX (publicada)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    /* Los intentos fallidos de entrar, para frenar a quien prueba
       contraseñas una tras otra. */
    $tablas[] = "CREATE TABLE IF NOT EXISTS intentos (
        id      INT AUTO_INCREMENT PRIMARY KEY,
        llave   VARCHAR(160) NOT NULL,
        cuando  DATETIME     NOT NULL,
        INDEX (llave, cuando)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    /* Cambios a tablas que ya existían antes de que se agregara algo. En
       una base nueva la columna ya viene en el CREATE y el ALTER falla por
       repetido: por eso cada uno se intenta y, si ya estaba, se sigue. */
    $cambios = [
        // en qué red salió cada publicación, y qué publicaciones salieron
        // juntas del mismo clic (una en Instagram y Facebook es un solo post)
        "ALTER TABLE publicaciones ADD COLUMN red VARCHAR(12) NOT NULL DEFAULT 'instagram'",
        "ALTER TABLE publicaciones ADD COLUMN envio VARCHAR(16) NULL",
    ];

    // la base va en la cuenta: otra base en el mismo sitio es otra marca
    $firma = substr(md5(BD_HOST . '|' . BD_NOMBRE . '|' . implode(';', $tablas) . '|' . implode(';', $cambios)), 0, 16);
    $marca = __DIR__ . '/.tablas-' . $firma;
    if (is_file($marca)) return;

    foreach ($tablas as $sql) $pdo->exec($sql);
    foreach ($cambios as $sql) {
        try { $pdo->exec($sql); } catch (Throwable $e) { /* ya estaba hecho */ }
    }
    @file_put_contents($marca, date('c') . "\n");
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

/* ------------------------------------------------------------------ */
/* cuentas                                                             */
/* ------------------------------------------------------------------ */

/* Cuánto dura una sesión sin usarse. Cada vez que se usa vuelve a empezar:
   quien entra todos los días no tiene que volver a poner la contraseña. */
const SESION_DIAS = 60;

/* La hora en UTC, puesta por PHP: es la misma que usa la cola de
   programadas, y así el panel muestra todo en la hora de quien mira. */
function ahora_utc(): string { return gmdate('Y-m-d H:i:s'); }

function iso_utc(?string $fecha): ?string {
    return $fecha ? str_replace(' ', 'T', $fecha) . 'Z' : null;
}

/* Quién hace el pedido.
   La clave del sitio —la de api/config.php— sigue valiendo: la usan el
   cron de las programadas y el panel de configuración, que no tienen
   usuario. Cualquier otra cosa se busca entre las sesiones abiertas.
   Devuelve null si no es nadie. */
/* Si lo que llegó es la clave del sitio. Sin los espacios de las puntas,
   de los dos lados: un espacio pegado al copiarla en config.php no se ve,
   y hacía que la clave «correcta» fuera rechazada. */
function es_clave_del_sitio(string $recibida): bool {
    return definida('PUBLICAR_CLAVE')
        && hash_equals(trim((string) PUBLICAR_CLAVE), trim($recibida));
}

function quien_es(?array $cuerpo = null): ?array {
    $recibida = trim((string) ($cuerpo['clave'] ?? clave_recibida()));
    if ($recibida === '') return null;
    if (es_clave_del_sitio($recibida)) {
        return ['id' => null, 'sitio' => true, 'usuario' => '', 'nombre' => '', 'foto' => '', 'rol' => 'admin'];
    }
    if (!preg_match('/^[a-f0-9]{64}$/', $recibida)) return null;

    $huella = hash('sha256', $recibida);
    try {
        $st = bd()->prepare(
            'SELECT u.id, u.usuario, u.nombre, u.foto, u.rol, s.usada
             FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
             WHERE s.token = ? AND u.activo = 1');
        $st->execute([$huella]);
        $u = $st->fetch();
    } catch (Throwable $e) {
        return null;   // sin base no hay sesiones
    }
    if (!$u) return null;

    $usada = strtotime($u['usada'] . ' UTC');
    if ($usada < time() - SESION_DIAS * 86400) {
        bd()->prepare('DELETE FROM sesiones WHERE token = ?')->execute([$huella]);
        return null;
    }
    // se anota el uso de a ratos: escribir en cada pedido sería carga de más
    if ($usada < time() - 600) {
        bd()->prepare('UPDATE sesiones SET usada = ? WHERE token = ?')->execute([ahora_utc(), $huella]);
    }
    return ['id' => (int) $u['id'], 'sitio' => false, 'usuario' => $u['usuario'],
            'nombre' => $u['nombre'], 'foto' => $u['foto'], 'rol' => $u['rol']];
}

/* Corta el pedido si no viene de alguien conocido, y si viene, dice quién
   es: los que publican lo usan para anotar a nombre de quién. */
function exigir_clave(?array $cuerpo = null): array {
    if (!definida('PUBLICAR_CLAVE')) {
        responder(['error' => 'Falta definir PUBLICAR_CLAVE en api/config.php'], 503);
    }
    $quien = quien_es($cuerpo);
    if (!$quien) responder(['error' => 'La sesión venció o la clave no es la correcta'], 401);
    return $quien;
}

/* Solo para quien administra el equipo. La clave del sitio no alcanza:
   la conocía todo el equipo antes de que hubiera cuentas. */
function exigir_admin(?array $cuerpo = null): array {
    $quien = exigir_clave($cuerpo);
    if ($quien['sitio'] || $quien['rol'] !== 'admin') {
        responder(['error' => 'Esto es solo para quien administra el equipo'], 403);
    }
    return $quien;
}

/* Anota una publicación en el historial del equipo. Si falla no rompe
   nada: el post ya está en Instagram, y el registro es un extra. */
/* `$red` es dónde salió; `$envio`, un código que comparten las que salieron
   del mismo clic en varias redes, para contarlas como un solo post. */
function registrar_publicacion(?int $usuarioId, array $meta, array $resultado, bool $programada = false,
                               string $red = 'instagram', ?string $envio = null): void {
    try {
        $st = bd()->prepare(
            'INSERT INTO publicaciones
               (usuario_id, placa_id, nombre, formato, piezas, enlace, ig_id, programada, publicada, red, envio)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $st->execute([
            $usuarioId,
            isset($meta['placa_id']) && $meta['placa_id'] !== null ? (int) $meta['placa_id'] : null,
            mb_substr((string) ($meta['nombre'] ?? ''), 0, 120),
            mb_substr((string) ($meta['formato'] ?? ''), 0, 20),
            max(1, (int) ($resultado['laminas'] ?? 1)),
            isset($resultado['enlace']) ? mb_substr((string) $resultado['enlace'], 0, 255) : null,
            isset($resultado['id']) ? mb_substr((string) $resultado['id'], 0, 40) : null,
            $programada ? 1 : 0,
            ahora_utc(),
            mb_substr($red, 0, 12),
            $envio,
        ]);
    } catch (Throwable $e) {
        error_log('no se pudo anotar la publicación: ' . $e->getMessage());
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

/* Petición HTTP cruda, con cabeceras propias. La usa la actualización
   contra GitHub, que necesita User-Agent y token. */
function pedir_http(string $url, array $cabeceras = [], ?string $guardarEn = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => $guardarEn === null,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => array_merge(['User-Agent: placas-somospuerto'], $cabeceras),
    ]);
    $fh = null;
    if ($guardarEn !== null) {
        $fh = fopen($guardarEn, 'wb');
        if ($fh === false) throw new RuntimeException('No se pudo escribir el archivo temporal');
        curl_setopt($ch, CURLOPT_FILE, $fh);
    }
    $cuerpo = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error  = curl_error($ch);
    if ($fh) fclose($fh);
    if ($cuerpo === false && $guardarEn === null) {
        throw new RuntimeException('No se pudo conectar: ' . $error);
    }
    return ['codigo' => $codigo, 'cuerpo' => is_string($cuerpo) ? $cuerpo : ''];
}

/* TikTok contesta distinto que Meta: todo viene con un `error` adentro, y
   si salió bien ese error dice code «ok». Con $form va como formulario (es
   lo que pide su ventanilla de tokens); si no, como JSON con el token de
   la cuenta en la cabecera. */
function pedir_tiktok(string $url, ?array $json = null, string $token = '', ?array $form = null): array {
    $ch = curl_init($url);
    $cabeceras = [];
    if ($form !== null) {
        $cabeceras[] = 'Content-Type: application/x-www-form-urlencoded';
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($form));
    } else {
        $cabeceras[] = 'Content-Type: application/json; charset=UTF-8';
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json ? json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '{}');
    }
    if ($token !== '') $cabeceras[] = 'Authorization: Bearer ' . $token;
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => $cabeceras,
    ]);
    $cuerpo = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($cuerpo === false) throw new RuntimeException('No se pudo contactar a TikTok: ' . curl_error($ch));
    $datos = json_decode((string) $cuerpo, true);
    if (!is_array($datos)) throw new RuntimeException("TikTok devolvió una respuesta inesperada ($codigo)");
    // la ventanilla de tokens avisa los errores con texto suelto
    if (is_string($datos['error'] ?? null)) {
        throw new RuntimeException(error_tiktok($datos['error'], (string) ($datos['error_description'] ?? '')));
    }
    $error = $datos['error']['code'] ?? 'ok';
    if ($error !== 'ok') throw new RuntimeException(error_tiktok((string) $error, (string) ($datos['error']['message'] ?? '')));
    return $datos;
}

/* Un pedazo de un video, directo del archivo al servidor de TikTok, sin
   cargarlo en la memoria de PHP. */
function subir_trozo_tiktok(string $url, string $archivo, int $desde, int $largo, int $total, string $tipo): void {
    $fh = fopen($archivo, 'rb');
    if ($fh === false) throw new RuntimeException('No se pudo leer el video para TikTok');
    fseek($fh, $desde);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_UPLOAD => true, CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_INFILE => $fh, CURLOPT_INFILESIZE => $largo,
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 300,
        CURLOPT_HTTPHEADER => [
            'Content-Type: ' . $tipo,
            'Content-Range: bytes ' . $desde . '-' . ($desde + $largo - 1) . '/' . $total,
        ],
    ]);
    $r = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    fclose($fh);
    if ($r === false) throw new RuntimeException('Se cortó la subida del video a TikTok: ' . curl_error($ch));
    if ($codigo >= 300) throw new RuntimeException("TikTok no aceptó un pedazo del video ($codigo)");
}

/* Lo que dice TikTok, en castellano cuando se sabe qué hacer. */
function error_tiktok(string $codigo, string $mensaje = ''): string {
    $conocidos = [
        'unaudited_client_can_only_post_to_private_accounts' =>
            'TikTok todavía no auditó la app para publicar directo (Content Posting API). Hasta que la '
            . 'apruebe, solo acepta cuentas en privado y lo publicado queda en «solo yo»: la auditoría se '
            . 'pide en el portal de desarrolladores de TikTok',
        'url_ownership_unverified' =>
            'TikTok no tiene verificado el sitio: falta el paso de verificar el dominio en el panel',
        'privacy_level_option_mismatch' =>
            'TikTok no acepta esa privacidad para esta cuenta: elegí otra en el panel',
        'spam_risk_too_many_posts' => 'TikTok frenó: ya hubo demasiadas publicaciones por la API en 24 horas',
        'spam_risk_user_banned_from_posting' => 'TikTok tiene bloqueada esta cuenta para publicar',
        'reached_active_user_cap' => 'La app de TikTok llegó a su tope diario de cuentas',
        'access_token_invalid' => 'La conexión con TikTok venció: conectala de nuevo en el panel',
        'invalid_grant' => 'La conexión con TikTok venció: conectala de nuevo en el panel',
        'scope_not_authorized' => 'Al conectar TikTok no se dio permiso para publicar: conectala de nuevo y aceptá todo',
        'rate_limit_exceeded' => 'TikTok pide esperar: demasiados pedidos en un minuto',
        'invalid_client' => 'TikTok no reconoce la Client key o el Client secret: revisalos en el panel',
    ];
    return $conocidos[$codigo] ?? ('TikTok: ' . ($mensaje !== '' ? $mensaje : $codigo));
}

const TIKTOK = 'https://open.tiktokapis.com/v2';

function tiktok_conectado(): bool {
    return ajuste('tt_refresh_token') !== '' && (int) ajuste('tt_refresh_vence') > time();
}

/* Guarda lo que devuelve la ventanilla de tokens. El de acceso dura un día
   y el de renovar, un año: con ese se saca uno nuevo cada vez que hace falta,
   sin que nadie tenga que volver a conectar. */
function guardar_tokens_tiktok(array $d): void {
    guardar_ajuste('tt_access_token', (string) $d['access_token']);
    guardar_ajuste('tt_access_vence', (string) (time() + (int) ($d['expires_in'] ?? 86400)));
    if (!empty($d['refresh_token'])) {
        guardar_ajuste('tt_refresh_token', (string) $d['refresh_token']);
        guardar_ajuste('tt_refresh_vence', (string) (time() + (int) ($d['refresh_expires_in'] ?? 31536000)));
    }
    if (!empty($d['open_id'])) guardar_ajuste('tt_open_id', (string) $d['open_id']);
}

/* El token de acceso, renovado si vence en menos de diez minutos. */
function token_tiktok(): string {
    if (!tiktok_conectado()) throw new RuntimeException('Falta conectar la cuenta de TikTok en el panel privado');
    if ((int) ajuste('tt_access_vence') > time() + 600) return ajuste('tt_access_token');
    $d = pedir_tiktok(TIKTOK . '/oauth/token/', null, '', [
        'client_key' => ajuste('tt_client_key'), 'client_secret' => ajuste('tt_client_secret'),
        'grant_type' => 'refresh_token', 'refresh_token' => ajuste('tt_refresh_token'),
    ]);
    guardar_tokens_tiktok($d);
    return (string) $d['access_token'];
}

/* Quién es la cuenta y qué privacidades acepta. TikTok pide consultarlo
   antes de cada publicación. */
function creador_tiktok(): array {
    $d = pedir_tiktok(TIKTOK . '/post/publish/creator_info/query/', [], token_tiktok())['data'] ?? [];
    if (!empty($d['creator_username'])) guardar_ajuste('tt_usuario', (string) $d['creator_username']);
    return $d;
}

/* $espera: los segundos que se le aguantan. Facebook baja el video entero
   antes de contestar, y con uno largo 30 no alcanzan. */
function pedir(string $url, ?array $post = null, int $espera = 30): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $espera,
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

/* Deja el token como lo espera Meta, y dice qué le sacó.
   Al copiarlo se cuela de todo: las comillas del explorador de la API, el
   «Bearer » de un ejemplo, la dirección entera de la redirección con su
   «access_token=…&expires_in=…», espacios de un salto de línea. Meta
   contesta a todo eso «Cannot parse access token», igual que a un token de
   la otra puerta, y no hay forma de darse cuenta mirando el campo, porque
   es de contraseña. Un token de verdad es una sola tira de letras y números:
   lo que no sea eso, sobra. */
function limpiar_token(string $crudo): array {
    $t = trim($crudo);
    $saco = [];
    // pegaron la dirección, o un pedazo con access_token=: solo el valor
    if (preg_match('/access_token=([^&#\s"\']+)/', $t, $m)) {
        $t = $m[1];
        $saco[] = 'access_token=';
    }
    $antes = $t;
    $t = trim($t, " \t\n\r\"'`“”‘’");
    if ($t !== $antes) $saco[] = 'comillas';
    if (preg_match('/^bearer\s+/i', $t)) {
        $t = preg_replace('/^bearer\s+/i', '', $t);
        $saco[] = 'Bearer';
    }
    if (strpos($t, '%') !== false && rawurldecode($t) !== $t) {
        $t = rawurldecode($t);
        $saco[] = 'codificación de dirección';
    }
    $sinEspacios = (string) preg_replace('/\s+/u', '', $t);
    if ($sinEspacios !== $t) {
        $t = $sinEspacios;
        $saco[] = 'espacios';
    }
    return [$t, $saco];
}

/* De qué puerta es el token, por cómo empieza: los de Instagram Login
   arrancan con IG y los de Facebook Login con EAA. Vacío si no se sabe. */
function tipo_token(string $token): string {
    if (strncmp($token, 'IG', 2) === 0) return 'instagram';
    if (strncmp($token, 'EAA', 3) === 0) return 'facebook';
    return '';
}

/* Devuelve el host que funciona con el token guardado, probándolos si hace
   falta. La respuesta queda anotada para no probar en cada llamada.

   Si no funciona en ninguno, el error que se muestra es el de la puerta a
   la que pertenece el token. Antes se mostraba el de la última probada,
   que era siempre Facebook, y Facebook a cualquier token de Instagram le
   contesta «Cannot parse access token» —que solo quiere decir «este no es
   mío»—. Así, un token de Instagram vencido, o uno bueno con el id de la
   cuenta equivocado, aparecían como «el token está cortado», y el motivo
   de verdad, el que había dado Instagram, se tiraba. */
function host_ig(bool $reprobar = false): string {
    $guardado = ajuste('ig_host');
    if ($guardado !== '' && !$reprobar) return $guardado;

    $id    = ajuste('ig_user_id');
    $token = ajuste('ig_access_token');
    if ($id === '' || $token === '') throw new RuntimeException('Falta la cuenta de Instagram');

    // primero la puerta que le corresponde; la otra igual se prueba, por si
    // algún día Meta cambia cómo empiezan
    $tipo  = tipo_token($token);
    $orden = $tipo === 'facebook' ? array_reverse(HOSTS_IG) : HOSTS_IG;

    $errores = [];
    foreach ($orden as $host) {
        try {
            pedir($host . '/' . $id . '?fields=id,username&access_token=' . urlencode($token));
            guardar_ajuste('ig_host', $host);
            return $host;
        } catch (RuntimeException $e) {
            $errores[$host] = $e->getMessage();
        }
    }
    if ($tipo !== '') throw new RuntimeException(reset($errores));
    // sin saber de qué puerta es, se dicen las dos respuestas
    $partes = [];
    foreach ($errores as $host => $msg) $partes[] = parse_url($host, PHP_URL_HOST) . ': ' . $msg;
    throw new RuntimeException($partes ? implode(' · ', $partes) : 'El token no funciona');
}

function graph(string $ruta, array $cuerpo): array {
    $cuerpo['access_token'] = ajuste('ig_access_token');
    return pedir(host_ig() . '/' . $ruta, $cuerpo);
}

/* Instagram descarga la pieza en segundo plano: hay que esperar a que el
   contenedor quede FINISHED antes de publicarlo.
   Se pide también `status`, que es donde viene el motivo escrito. Antes se
   pedía solo `status_code` y el aviso terminaba siendo «rechazó una de las
   imágenes (ERROR)», que no dice qué arreglar: puede ser la proporción, el
   largo del video, el códec o que no alcanzó a bajar el archivo. El motivo
   lo manda Instagram y lo estábamos tirando.
   `$cual` es para nombrar la pieza —«la 2 de 4»—, que en un carrusel es la
   mitad del problema: sin eso hay que adivinar cuál de todas falló. */
function esperar_contenedor(string $id, int $intentos = 20, string $cual = ''): void {
    $token = ajuste('ig_access_token');
    $host  = host_ig();
    $quien = $cual !== '' ? $cual : 'una de las piezas';
    for ($i = 0; $i < $intentos; $i++) {
        $d = pedir($host . '/' . $id . '?fields=status_code,status&access_token=' . urlencode($token));
        $estado = $d['status_code'] ?? '';
        if ($estado === 'FINISHED') return;
        if ($estado === 'ERROR' || $estado === 'EXPIRED') {
            /* Viene como «Error: <motivo>» o con un número de los suyos.
               Se manda tal cual: traducirlo a mano sería adivinar, y el texto
               de ellos es lo que se puede buscar. */
            $motivo = trim((string) ($d['status'] ?? ''));
            $motivo = preg_replace('/\s+/u', ' ', $motivo);
            throw new RuntimeException(
                "Instagram rechazó $quien" . ($motivo !== '' ? ": $motivo" : " ($estado)"));
        }
        sleep(2);
    }
    throw new RuntimeException("Instagram tardó demasiado en procesar $quien");
}
