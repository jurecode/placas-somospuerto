<?php
/* Diagnóstico de la configuración, para el panel privado.
 * Nunca devuelve el valor de una credencial: solo si está puesta o no. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

[$dir] = carpeta_publica();

$variables = [
    'IG_USER_ID'     => definida('IG_USER_ID'),
    'IG_ACCESS_TOKEN'=> definida('IG_ACCESS_TOKEN'),
    'PUBLICAR_CLAVE' => definida('PUBLICAR_CLAVE'),
    'CARPETA_IMAGENES' => is_dir($dir) && is_writable($dir),
];
$faltan = array_keys(array_filter($variables, static fn($ok) => !$ok));

if (!definida('PUBLICAR_CLAVE')) {
    responder([
        'listo' => false, 'variables' => $variables, 'faltan' => $faltan,
        'mensaje' => 'Todavía no hay clave definida. Publicar está bloqueado hasta que exista PUBLICAR_CLAVE.',
    ]);
}

$clave = $_SERVER['HTTP_X_CLAVE'] ?? ($_GET['clave'] ?? '');
if (!hash_equals(PUBLICAR_CLAVE, (string) $clave)) {
    responder(['error' => 'Clave incorrecta'], 401);
}

if (!definida('IG_USER_ID') || !definida('IG_ACCESS_TOKEN')) {
    responder(['listo' => false, 'variables' => $variables, 'faltan' => $faltan]);
}

$cuenta = null; $tokenError = null;
try {
    $cuenta = pedir(API_IG . '/' . IG_USER_ID
        . '?fields=id,username,account_type&access_token=' . urlencode(IG_ACCESS_TOKEN));
} catch (Throwable $e) { $tokenError = $e->getMessage(); }

responder([
    'listo' => $cuenta !== null && !$faltan,
    'variables' => $variables, 'faltan' => $faltan,
    'cuenta' => $cuenta, 'tokenError' => $tokenError,
]);
