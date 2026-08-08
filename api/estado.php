<?php
/* Estado de la configuración y guardado de las credenciales de Instagram.
 *
 * El token se guarda en la base (no en un archivo) para poder renovarlo
 * desde el panel cuando vence, sin entrar por FTP. Nunca se devuelve: solo
 * se informa si está puesto y si funciona. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Sin clave definida no hay nada que proteger todavía: se informa qué falta
// para poder arrancar la configuración, y nada más.
if (!definida('PUBLICAR_CLAVE')) {
    responder([
        'listo' => false,
        'variables' => ['BD' => false, 'PUBLICAR_CLAVE' => false,
                        'IG_USER_ID' => false, 'IG_ACCESS_TOKEN' => false,
                        'CARPETAS' => false],
        'faltan' => ['PUBLICAR_CLAVE'],
        'mensaje' => 'Falta crear api/config.php con los datos de la base y la clave.',
    ]);
}

$cuerpo = null;
if ($metodo === 'POST') {
    $cuerpo = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($cuerpo)) responder(['error' => 'Cuerpo inválido'], 400);
}
exigir_clave($cuerpo);

/* El bloque de caché del .htaccess se asegura acá y no solo al actualizar: la
 * actualización corre con el código viejo todavía cargado, así que si esperara
 * al próximo release el navegador seguiría sirviendo el editor viejo. Es
 * idempotente: la segunda vez no hace nada. */
require_once __DIR__ . '/actualizar_cache.php';
asegurar_cache(dirname(__DIR__));

$bdOk = true; $bdError = null;
try { bd(); } catch (Throwable $e) { $bdOk = false; $bdError = $e->getMessage(); }

if ($metodo === 'POST') {
    if (!$bdOk) responder(['error' => 'Sin base de datos no se puede guardar: ' . $bdError], 500);
    foreach (['ig_user_id', 'ig_access_token'] as $c) {
        if (isset($cuerpo[$c]) && trim((string) $cuerpo[$c]) !== '') {
            guardar_ajuste($c, trim((string) $cuerpo[$c]));
        }
    }
    guardar_ajuste('ig_host', '');   // que se vuelva a detectar con el token nuevo
    responder(['ok' => true]);
}

[$dirFotos] = carpeta('fotos');
[$dirPub]   = carpeta('publicaciones');

$igUser  = $bdOk ? ajuste('ig_user_id') : '';
$igToken = $bdOk ? ajuste('ig_access_token') : '';

$variables = [
    'BD'              => $bdOk,
    'PUBLICAR_CLAVE'  => true,
    'IG_USER_ID'      => $igUser !== '',
    'IG_ACCESS_TOKEN' => $igToken !== '',
    'CARPETAS'        => is_writable($dirFotos) && is_writable($dirPub),
];
$faltan = array_keys(array_filter($variables, static fn($ok) => !$ok));

$cuenta = null; $tokenError = $bdError; $host = null;
if ($igUser !== '' && $igToken !== '') {
    try {
        // se reprueban los dos hosts: si acaban de cambiar el token, el
        // anotado puede ser el que ya no corresponde
        $host = host_ig(true);
        $cuenta = pedir($host . '/' . $igUser
            . '?fields=id,username&access_token=' . urlencode($igToken));
    } catch (Throwable $e) { $tokenError = $e->getMessage(); }
}

responder([
    'listo' => $cuenta !== null && !$faltan,
    'variables' => $variables, 'faltan' => $faltan,
    'cuenta' => $cuenta, 'tokenError' => $tokenError,
    'host' => $host ? parse_url($host, PHP_URL_HOST) : null,
]);
