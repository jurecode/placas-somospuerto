<?php
/* La portada se sirve por PHP y no como archivo suelto.
 *
 * El hosting manda los archivos estáticos con meses de caché y no hace caso
 * al .htaccess: index.html llegaba con seis meses y editor.js con un año. Así
 * el navegador se quedaba con una mitad vieja y otra nueva, que es peor que
 * quedarse atrás: el código buscaba cosas que en ese HTML no existían.
 *
 * Con PHP las cabeceras las decidimos nosotros. El HTML se pide siempre y los
 * archivos que nombra van firmados con el número de versión, así que cada
 * página trae exactamente el editor que le corresponde. */

header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('Content-Type: text/html; charset=utf-8');

readfile(__DIR__ . '/index.html');
