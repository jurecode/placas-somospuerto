<?php
/* Deja el .htaccess con las reglas del editor.
 * Vive aparte porque lo usan dos: la actualización y el diagnóstico del panel. */

declare(strict_types=1);

/* Dos cosas hacen falta acá:
 *
 * 1. Que la portada la sirva index.php y no index.html. El hosting manda los
 *    archivos sueltos con meses de caché y no hace caso a estas reglas —lo
 *    comprobamos: seguía diciendo seis meses—, mientras que lo que sale de PHP
 *    llega con las cabeceras que ponemos nosotros.
 * 2. Pedir igual que no se cachee el HTML ni el JS. Si el hosting lo respeta,
 *    mejor; si no, los archivos van firmados con la versión y da lo mismo.
 *
 * El bloque se reemplaza entero cuando cambia, por eso lleva número: la
 * primera versión no traía el DirectoryIndex y había que poder actualizarla.
 * Nada de lo que el .htaccess ya tenga se toca. */
const MARCA_CACHE = '# --- placas: reglas del editor (v3) ---';
const FIN_CACHE   = '# --- fin placas ---';

function asegurar_cache(string $raiz): string
{
    $ruta = $raiz . '/.htaccess';
    $actual = is_file($ruta) ? (file_get_contents($ruta) ?: '') : '';
    if (strpos($actual, MARCA_CACHE) !== false) return 'ya estaba';

    // se saca cualquier bloque nuestro anterior, sin tocar el resto
    $limpio = preg_replace(
        '/\n*# --- placas: [^\n]*\n.*?# --- fin[^\n]*\n/s', "\n", $actual
    );
    if ($limpio === null) $limpio = $actual;   // por si el texto es muy grande

    $bloque = MARCA_CACHE . "\n"
        . "DirectoryIndex index.php index.html\n"
        . "<IfModule mod_expires.c>\n"
        . "  ExpiresByType text/html \"access plus 0 seconds\"\n"
        . "  ExpiresByType text/javascript \"access plus 0 seconds\"\n"
        . "  ExpiresByType application/javascript \"access plus 0 seconds\"\n"
        . "  ExpiresByType text/css \"access plus 0 seconds\"\n"
        . "  ExpiresByType image/png \"access plus 0 seconds\"\n"
        . "</IfModule>\n"
        . "<IfModule mod_headers.c>\n"
        . "  <FilesMatch \"\\.(html|js|css|png)$\">\n"
        . "    Header unset Expires\n"
        . "    Header set Cache-Control \"no-cache, must-revalidate\"\n"
        . "  </FilesMatch>\n"
        . "</IfModule>\n"
        . FIN_CACHE . "\n";

    $limpio = trim($limpio);
    $nuevo = $limpio === '' ? $bloque : $limpio . "\n\n" . $bloque;
    if (@file_put_contents($ruta, $nuevo) === false) return 'no se pudo escribir';
    return 'agregado';
}
