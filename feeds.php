<?php
/* El panel de feeds se sirve por PHP y no como archivo suelto, por lo mismo
 * que la portada del editor.
 *
 * El hosting manda los archivos estáticos con meses de caché —feeds.html
 * llegaba con seis meses— y no hace caso al .htaccess. El código que la
 * página nombra sí va firmado con el número de versión, pero eso no sirve de
 * nada si la página que lo nombra está congelada: el navegador nunca se
 * entera de que hay una versión nueva y sigue pidiendo la vieja durante
 * meses. Es el mismo agujero que ya se había tapado en la portada, y este
 * panel se armó después y quedó afuera.
 *
 * Con PHP las cabeceras las decidimos nosotros. */

header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('Content-Type: text/html; charset=utf-8');

readfile(__DIR__ . '/feeds.html');
