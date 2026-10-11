<?php
/* Las otras redes donde se publica además de Instagram.
 *
 * GET  → qué redes están conectadas (Facebook y TikTok). Lo pide el editor para saber qué
 *        botones mostrar; con ?revisar=1 (el panel) además se prueba el
 *        token contra Facebook.
 * POST → conectar o desconectar, solo con la clave del sitio o una cuenta
 *        de administración:
 *        {tarea:'conectar', token}  token de usuario o de página
 *        {tarea:'elegir', id}       cuál página, si el token maneja varias
 *        {tarea:'desconectar'}
 *
 * El token de la página nunca se devuelve, igual que el de Instagram. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

const FB = 'https://graph.facebook.com';

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = $metodo === 'POST' ? (json_decode(file_get_contents('php://input') ?: '', true) ?: []) : null;
$quien  = exigir_clave($cuerpo);

function estado_facebook(bool $revisar): array {
    $id = ajuste('fb_page_id');
    $token = ajuste('fb_page_token');
    if ($id === '' || $token === '') return ['conectado' => false];
    $r = ['conectado' => true, 'pagina' => ['id' => $id, 'nombre' => ajuste('fb_page_nombre')]];
    if ($revisar) {
        try {
            $p = pedir(FB . '/' . rawurlencode($id) . '?fields=id,name&access_token=' . urlencode($token));
            $r['pagina']['nombre'] = (string) ($p['name'] ?? $r['pagina']['nombre']);
            guardar_ajuste('fb_page_nombre', $r['pagina']['nombre']);
            $r['funciona'] = true;
        } catch (Throwable $e) {
            $r['funciona'] = false;
            $r['error'] = $e->getMessage();
        }
    }
    return $r;
}

/* TikTok: si está conectada, con qué cuenta y con qué privacidad sale. Al
   revisar se le pregunta a TikTok qué privacidades acepta la cuenta, que
   cambian según la cuenta sea pública o privada. Lo de configurar (claves
   de la app, dirección de vuelta, archivo de verificación) va solo para el
   panel. */
function estado_tiktok(bool $revisar): array {
    $r = ['conectado' => tiktok_conectado(), 'usuario' => ajuste('tt_usuario'),
          'privacidad' => ajuste('tt_privacidad', 'SELF_ONLY')];
    if (!$revisar) return $r;
    $r['app'] = ['client_key' => ajuste('tt_client_key'), 'secret' => ajuste('tt_client_secret') !== '',
                 'redirect_uri' => base_url() . '/api/tiktok.php', 'prefijo' => base_url() . '/',
                 'verificacion' => ajuste('tt_verificacion')];
    if ($r['conectado']) {
        try {
            $c = creador_tiktok();
            $r['usuario'] = (string) ($c['creator_username'] ?? $r['usuario']);
            $r['nombre'] = (string) ($c['creator_nickname'] ?? '');
            $r['opciones'] = $c['privacy_level_options'] ?? [];
            $r['funciona'] = true;
        } catch (Throwable $e) {
            $r['funciona'] = false;
            $r['error'] = $e->getMessage();
        }
    }
    return $r;
}

/* Cuándo vence un token, si Facebook lo dice. Es un extra: si no contesta,
   no se sabe y listo. 0 es «no vence». */
function vencimiento(string $token): ?int {
    try {
        $d = pedir(FB . '/debug_token?input_token=' . urlencode($token) . '&access_token=' . urlencode($token));
        return isset($d['data']['expires_at']) ? (int) $d['data']['expires_at'] : null;
    } catch (Throwable $e) {
        return null;
    }
}

function guardar_pagina(array $p): array {
    guardar_ajuste('fb_page_id', (string) $p['id']);
    guardar_ajuste('fb_page_token', (string) $p['access_token']);
    guardar_ajuste('fb_page_nombre', (string) ($p['name'] ?? ''));
    guardar_ajuste('fb_candidatas', '');
    $r = ['ok' => true, 'facebook' => estado_facebook(false)];
    $vence = vencimiento((string) $p['access_token']);
    if ($vence !== null && $vence > 0) {
        $r['aviso'] = 'Este token vence el ' . gmdate('d/m H:i', $vence) . ' (UTC). Para que no venza, '
            . 'extendé el token de usuario en el Depurador de tokens y conectá de nuevo con ese.';
    }
    if (isset($p['tasks']) && is_array($p['tasks']) && !in_array('CREATE_CONTENT', $p['tasks'], true)) {
        $r['aviso'] = trim(($r['aviso'] ?? '') . ' Tu usuario no tiene permiso para publicar en esta página: '
            . 'pedile a quien la administra que te dé acceso completo.');
    }
    return $r;
}

try {
    /* Para el paso de TikTok del editor: la cuenta y lo que permite, recién
       pedido a TikTok cada vez que se abre, como piden sus reglas. Si TikTok
       dice que ahora no se puede publicar, el error llega tal cual. */
    if ($metodo === 'GET' && ($_GET['creador'] ?? '') === 'tiktok') {
        $c = creador_tiktok();
        responder([
            'usuario' => (string) ($c['creator_username'] ?? ''), 'nombre' => (string) ($c['creator_nickname'] ?? ''),
            'foto' => (string) ($c['creator_avatar_url'] ?? ''), 'opciones' => $c['privacy_level_options'] ?? [],
            'sinComentarios' => !empty($c['comment_disabled']), 'sinDuo' => !empty($c['duet_disabled']),
            'sinStitch' => !empty($c['stitch_disabled']), 'maxSegundos' => (int) ($c['max_video_post_duration_sec'] ?? 0),
        ]);
    }
    if ($metodo === 'GET') {
        responder([
            'facebook' => estado_facebook(isset($_GET['revisar'])),
            'tiktok'   => estado_tiktok(isset($_GET['revisar'])),
        ]);
    }
    if ($metodo !== 'POST') responder(['error' => 'Método no soportado'], 405);

    // conectar y desconectar cambia dónde publica todo el equipo
    if (!$quien['sitio'] && $quien['rol'] !== 'admin') {
        responder(['error' => 'Conectar las redes es solo para quien administra el equipo'], 403);
    }
    $tarea = (string) ($cuerpo['tarea'] ?? '');

    if ($tarea === 'desconectar') {
        foreach (['fb_page_id', 'fb_page_token', 'fb_page_nombre', 'fb_candidatas'] as $k) guardar_ajuste($k, '');
        responder(['ok' => true, 'facebook' => ['conectado' => false]]);
    }

    if ($tarea === 'conectar') {
        [$token] = limpiar_token((string) ($cuerpo['token'] ?? ''));
        if ($token === '') responder(['error' => 'Pegá el token de Facebook'], 400);

        /* Un token de usuario trae sus páginas en /me/accounts, cada una con
           su propio token. Si pegaron directo el de una página, /me/accounts
           no existe para ella, y /me es la página misma. */
        $paginas = null;
        try {
            $d = pedir(FB . '/me/accounts?fields=id,name,access_token,tasks&limit=100&access_token=' . urlencode($token));
            $paginas = array_values(array_filter($d['data'] ?? [], static fn($p) => !empty($p['access_token'])));
        } catch (RuntimeException $e) {
            // con un token de página esto falla; con uno roto, falla /me también y se dice ese error
        }
        if ($paginas === null || !$paginas) {
            try {
                $yo = pedir(FB . '/me?fields=id,name,category&access_token=' . urlencode($token));
            } catch (RuntimeException $e) {
                if ($paginas !== null) {
                    responder(['error' => 'Ese token no maneja ninguna página. Al crearlo, marcá la página del medio '
                        . 'y los permisos pages_show_list, pages_manage_posts y pages_read_engagement.'], 400);
                }
                responder(['error' => 'Facebook no acepta ese token: ' . $e->getMessage()], 400);
            }
            if (!isset($yo['category'])) {
                responder(['error' => 'Ese token no maneja ninguna página. Al crearlo, marcá la página del medio '
                    . 'y los permisos pages_show_list, pages_manage_posts y pages_read_engagement.'], 400);
            }
            responder(guardar_pagina(['id' => $yo['id'], 'name' => $yo['name'] ?? '', 'access_token' => $token]));
        }
        if (count($paginas) === 1) responder(guardar_pagina($paginas[0]));

        // varias: se guardan un rato y se pregunta cuál
        guardar_ajuste('fb_candidatas', json_encode($paginas));
        responder(['elegir' => array_map(static fn($p) => ['id' => (string) $p['id'], 'nombre' => (string) ($p['name'] ?? '')], $paginas)]);
    }

    if ($tarea === 'elegir') {
        $id = (string) ($cuerpo['id'] ?? '');
        foreach (json_decode(ajuste('fb_candidatas'), true) ?: [] as $p) {
            if ((string) $p['id'] === $id) responder(guardar_pagina($p));
        }
        responder(['error' => 'Esa página ya no está en la lista: pegá el token de nuevo'], 400);
    }

    responder(['error' => 'No se entiende qué hay que hacer.'], 400);
} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
