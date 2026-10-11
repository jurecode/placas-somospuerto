<?php
/* La conexión con la cuenta de TikTok.
 *
 * TikTok no da un token para copiar y pegar como Meta: la cuenta autoriza a
 * la app en su propia página y vuelve acá con un código. Por eso esta es la
 * dirección que se anota en la app de TikTok como «Redirect URI», y por eso
 * tiene que ser siempre la misma, sin nada después del signo de pregunta.
 *
 * GET  ?code=…&state=…  → la vuelta desde TikTok (la abre el navegador)
 * POST, solo con la clave del sitio o una cuenta de administración:
 *   {tarea:'credenciales', client_key, client_secret}
 *   {tarea:'iniciar', volver}     devuelve la dirección para ir a autorizar
 *   {tarea:'privacidad', valor}   con qué privacidad salen las publicaciones
 *   {tarea:'verificacion', nombre, contenido}  el archivo para verificar el sitio
 *   {tarea:'desconectar'} */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

const ESTADO_DURA = 900;   // quince minutos para ir a TikTok y volver
const PRIVACIDADES = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];

function redirect_uri(): string {
    return base_url() . '/api/tiktok.php';
}

/* La vuelta se muestra como una página chica: la abre el navegador, no el
   editor, y si algo salió mal hay que poder leerlo. */
function pagina(string $titulo, string $texto, ?string $volver = null): void {
    header('Content-Type: text/html; charset=utf-8');
    $e = static fn($s) => htmlspecialchars($s, ENT_QUOTES);
    $enlace = $volver ? '<p><a href="' . $e($volver) . '">Volver al panel</a></p>' : '';
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<meta name="robots" content="noindex"><title>' . $e($titulo) . '</title>'
       . '<body style="font:16px/1.5 system-ui,sans-serif;background:#0E0E10;color:#F2F2F4;padding:40px 20px;max-width:560px;margin:auto">'
       . '<h1 style="font-size:20px">' . $e($titulo) . '</h1><p>' . $e($texto) . '</p>' . $enlace
       . '<style>a{color:#3DE0B4}</style></body>';
    exit;
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* ------------------------------------------------------------ la vuelta */
if ($metodo === 'GET') {
    $guardado = json_decode(ajuste('tt_estado'), true) ?: [];
    $volver = $guardado['volver'] ?? null;
    $state = (string) ($_GET['state'] ?? '');
    // el state prueba que la vuelta es de un pedido que hizo el panel, no de cualquiera
    if ($state === '' || !hash_equals((string) ($guardado['state'] ?? ''), $state)
        || (int) ($guardado['cuando'] ?? 0) < time() - ESTADO_DURA) {
        pagina('No se pudo conectar TikTok', 'El pedido venció o no salió de este panel. Volvé al panel y tocá «Conectar con TikTok» de nuevo.', $volver);
    }
    guardar_ajuste('tt_estado', '');   // sirve una sola vez
    if (isset($_GET['error'])) {
        pagina('TikTok no autorizó', (string) ($_GET['error_description'] ?? $_GET['error'])
            . '. Si tocaste «Cancelar», volvé a intentar y aceptá los permisos.', $volver);
    }
    try {
        $d = pedir_tiktok(TIKTOK . '/oauth/token/', null, '', [
            'client_key' => ajuste('tt_client_key'), 'client_secret' => ajuste('tt_client_secret'),
            'code' => (string) ($_GET['code'] ?? ''), 'grant_type' => 'authorization_code',
            'redirect_uri' => redirect_uri(),
        ]);
        if (!str_contains((string) ($d['scope'] ?? ''), 'video.publish')) {
            pagina('Falta un permiso', 'TikTok conectó la cuenta pero sin el permiso para publicar. Volvé a conectar y dejá marcado el de publicar videos.', $volver);
        }
        guardar_tokens_tiktok($d);
        $creador = creador_tiktok();
        // la primera vez, la privacidad más cerrada: la abre quien administra
        if (ajuste('tt_privacidad') === '') guardar_ajuste('tt_privacidad', 'SELF_ONLY');
    } catch (Throwable $e) {
        pagina('No se pudo conectar TikTok', $e->getMessage(), $volver);
    }
    if ($volver) {
        header('Location: ' . $volver . (str_contains($volver, '#') ? '' : '#tiktok'));
        exit;
    }
    pagina('TikTok conectado', 'Listo: @' . ($creador['creator_username'] ?? '') . ' ya está conectada.');
}

/* ------------------------------------------------------------ el panel */
if ($metodo !== 'POST') responder(['error' => 'Método no soportado'], 405);
$cuerpo = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
$quien = exigir_clave($cuerpo);
if (!$quien['sitio'] && $quien['rol'] !== 'admin') {
    responder(['error' => 'Conectar las redes es solo para quien administra el equipo'], 403);
}
$tarea = (string) ($cuerpo['tarea'] ?? '');

try {
    if ($tarea === 'credenciales') {
        $key = trim((string) ($cuerpo['client_key'] ?? ''));
        $secret = trim((string) ($cuerpo['client_secret'] ?? ''));
        if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $key)) responder(['error' => 'La Client key no tiene la forma de las de TikTok: copiala de nuevo'], 400);
        guardar_ajuste('tt_client_key', $key);
        // el secret no vuelve nunca; vacío es «dejá el que estaba»
        if ($secret !== '') {
            if (!preg_match('/^[A-Za-z0-9_-]{16,128}$/', $secret)) responder(['error' => 'El Client secret no tiene la forma de los de TikTok: copialo de nuevo'], 400);
            guardar_ajuste('tt_client_secret', $secret);
        }
        responder(['ok' => true]);
    }

    if ($tarea === 'iniciar') {
        if (ajuste('tt_client_key') === '' || ajuste('tt_client_secret') === '') {
            responder(['error' => 'Primero guardá la Client key y el Client secret de la app de TikTok'], 400);
        }
        // solo se vuelve a una página de este mismo sitio
        $volver = (string) ($cuerpo['volver'] ?? '');
        if (!str_starts_with($volver, base_url() . '/')) $volver = null;
        $state = bin2hex(random_bytes(16));
        guardar_ajuste('tt_estado', json_encode(['state' => $state, 'cuando' => time(), 'volver' => $volver]));
        responder(['url' => 'https://www.tiktok.com/v2/auth/authorize/?' . http_build_query([
            'client_key' => ajuste('tt_client_key'), 'response_type' => 'code',
            'scope' => 'user.info.basic,video.publish', 'redirect_uri' => redirect_uri(),
            'state' => $state, 'disable_auto_auth' => 1,
        ])]);
    }

    if ($tarea === 'privacidad') {
        $valor = (string) ($cuerpo['valor'] ?? '');
        if (!in_array($valor, PRIVACIDADES, true)) responder(['error' => 'Esa privacidad no existe'], 400);
        guardar_ajuste('tt_privacidad', $valor);
        responder(['ok' => true, 'privacidad' => $valor]);
    }

    /* TikTok baja las fotos del sitio, y para eso pide probar que el sitio es
       nuestro: da un archivo que tiene que estar en la raíz. Se sube desde
       acá para no tener que entrar por FTP. Solo un .txt con ese nombre. */
    if ($tarea === 'verificacion') {
        $nombre = basename((string) ($cuerpo['nombre'] ?? ''));
        $contenido = trim((string) ($cuerpo['contenido'] ?? ''));
        if (!preg_match('/^tiktok[A-Za-z0-9_-]{1,80}\.txt$/', $nombre)) {
            responder(['error' => 'Ese no es el archivo de TikTok: se llama «tiktok….txt»'], 400);
        }
        if ($contenido === '' || strlen($contenido) > 500 || !preg_match('/^[\x20-\x7E\r\n]+$/', $contenido)) {
            responder(['error' => 'El contenido del archivo no es el que da TikTok'], 400);
        }
        // el de antes, si había, se borra: queda uno solo
        $viejo = ajuste('tt_verificacion');
        if ($viejo !== '' && $viejo !== $nombre) @unlink(dirname(__DIR__) . '/' . basename($viejo));
        if (file_put_contents(dirname(__DIR__) . '/' . $nombre, $contenido) === false) {
            responder(['error' => 'No se pudo guardar el archivo en el sitio'], 500);
        }
        guardar_ajuste('tt_verificacion', $nombre);
        responder(['ok' => true, 'url' => base_url() . '/' . $nombre]);
    }

    if ($tarea === 'desconectar') {
        $token = ajuste('tt_access_token');
        if ($token !== '') {
            try {
                pedir_tiktok(TIKTOK . '/oauth/revoke/', null, '', [
                    'client_key' => ajuste('tt_client_key'), 'client_secret' => ajuste('tt_client_secret'), 'token' => $token]);
            } catch (Throwable $e) { /* se borra igual de acá */ }
        }
        foreach (['tt_access_token', 'tt_access_vence', 'tt_refresh_token', 'tt_refresh_vence', 'tt_open_id', 'tt_usuario'] as $k) {
            guardar_ajuste($k, '');
        }
        responder(['ok' => true]);
    }

    responder(['error' => 'No se entiende qué hay que hacer.'], 400);
} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
