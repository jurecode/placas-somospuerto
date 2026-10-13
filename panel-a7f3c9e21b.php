<?php
/* El panel privado se sirve por PHP y no como archivo suelto, igual que el
 * editor y el panel del equipo: el hosting manda los archivos estáticos con
 * seis meses de caché y no hace caso al .htaccess, así que el navegador se
 * quedaba con un panel viejo aunque el sitio ya estuviera actualizado (pasó
 * con la sección «Espacio»). Con PHP las cabeceras las decidimos nosotros. */

header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

readfile(__DIR__ . '/panel-a7f3c9e21b.html');
