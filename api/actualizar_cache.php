<?php
/* Deja el .htaccess pidiendo que no se cachee el editor.
 * Vive aparte porque lo usan dos: la actualización y el diagnóstico del panel. */

declare(strict_types=1);

/* El hosting servía el editor con seis meses de caché y el navegador se
 * quedaba con la versión vieja después de actualizar. Se agrega el bloque al
 * .htaccess que ya exista, sin tocar nada de lo que tenga: si el sitio depende
 * de otras reglas, ahí siguen. */
const MARCA_CACHE = '# --- placas: sin caché para el editor ---';

function asegurar_cache(string $raiz): string
{
    $ruta = $raiz . '/.htaccess';
    $actual = is_file($ruta) ? (file_get_contents($ruta) ?: '') : '';
    if (strpos($actual, MARCA_CACHE) !== false) return 'ya estaba';

    $bloque = MARCA_CACHE . "\n"
        . "<IfModule mod_expires.c>\n"
        . "  ExpiresByType text/html \"access plus 0 seconds\"\n"
        . "  ExpiresByType text/javascript \"access plus 0 seconds\"\n"
        . "  ExpiresByType application/javascript \"access plus 0 seconds\"\n"
        . "  ExpiresByType text/css \"access plus 0 seconds\"\n"
        . "</IfModule>\n"
        . "<IfModule mod_headers.c>\n"
        . "  <FilesMatch \"\\.(html|js|css)$\">\n"
        . "    Header unset Expires\n"
        . "    Header set Cache-Control \"no-cache, must-revalidate\"\n"
        . "  </FilesMatch>\n"
        . "</IfModule>\n"
        . "# --- fin ---\n";

    $nuevo = $actual === '' ? $bloque : rtrim($actual) . "\n\n" . $bloque;
    if (@file_put_contents($ruta, $nuevo) === false) return 'no se pudo escribir';
    return 'agregado';
}
