<?php
/* El panel del equipo se sirve por PHP y no como archivo suelto, igual que
 * el editor y el panel de feeds: el hosting manda los archivos estáticos con
 * meses de caché y no hace caso al .htaccess, y una página congelada nunca se
 * entera de que hay una versión nueva. Con PHP las cabeceras las decidimos
 * nosotros. */

header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('Content-Type: text/html; charset=utf-8');

readfile(__DIR__ . '/equipo.html');
