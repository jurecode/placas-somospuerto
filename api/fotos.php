<?php
/* Sube una foto o un video y devuelve su URL pública.
 * El archivo va a la carpeta fotos/ y queda una fila en la tabla, para
 * poder listarlas y limpiarlas desde phpMyAdmin si hiciera falta.
 *
 * Los videos llegan de a pedazos. Un reel del teléfono pesa decenas de megas
 * y de una sola vez chocaba contra el post_max_size del hosting —que no es
 * nuestro y no siempre se puede subir—, o se cortaba a mitad de camino en una
 * conexión móvil. En trozos de dos megas eso deja de importar, y además se
 * puede ir contando cuánto falta. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();
exigir_clave();

/* Listar lo que hay subido. La carpeta está cerrada al público —el hosting
 * devuelve 403 si se pide el directorio— y así tiene que seguir, pero desde
 * el panel hace falta poder mirar un archivo concreto: cuando Instagram
 * rechaza un video, lo primero que uno quiere es abrirlo y ver qué se mandó.
 * Va detrás de la clave, igual que subir. */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && ($_GET['tarea'] ?? '') === 'listar') {
    [$dir, $base] = carpeta('fotos');
    $cuantos = min(200, max(1, (int) ($_GET['cuantos'] ?? 60)));

    $lista = [];
    foreach (scandir($dir) ?: [] as $n) {
        if ($n === '.' || $n === '..' || $n[0] === '.') continue;
        $ruta = $dir . '/' . $n;
        if (!is_file($ruta)) continue;
        /* Solo lo que se puede mirar. Se listan las extensiones permitidas en
         * vez de descartar las que molestan: en la carpeta puede haber pedazos
         * a medio subir, y cualquier cosa que llegue mañana quedaría afuera
         * sola en vez de aparecer en la lista sin que nadie lo note. */
        $ext = strtolower(pathinfo($n, PATHINFO_EXTENSION));
        $mirables = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'm4v',
                     'm4a', 'mp3', 'ogg', 'wav', 'webm', 'aac'];
        if (!in_array($ext, $mirables, true)) continue;
        $lista[] = [
            'nombre' => $n,
            'url'    => $base . '/' . rawurlencode($n),
            'bytes'  => filesize($ruta) ?: 0,
            'cuando' => date('c', filemtime($ruta) ?: 0),
            'tipo'   => in_array($ext, ['mp4', 'mov', 'm4v'], true) ? 'video'
                      : (in_array($ext, ['m4a', 'mp3', 'ogg', 'wav', 'webm', 'aac'], true) ? 'audio' : 'imagen'),
        ];
    }
    // lo último primero, que es lo que se está por mirar
    usort($lista, static fn($x, $y) => strcmp($y['cuando'], $x['cuando']));
    responder(['archivos' => array_slice($lista, 0, $cuantos), 'total' => count($lista)]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(['error' => 'Solo POST'], 405);

/* 300 MB es lo que acepta Instagram en un reel; con la subida por pedazos el
 * límite del hosting ya no manda. */
const TOPE = 300 * 1024 * 1024;

[$dir, $url] = carpeta('fotos');
if (!is_writable($dir)) {
    responder(['error' => 'No se puede escribir en fotos/. Revisá los permisos (755).'], 500);
}

/* PHP descarta la petición entera cuando pasa post_max_size y no avisa de
 * ninguna forma: el cuerpo llega vacío. Esto lo explica en vez de decir
 * «vacío» a secas. */
function explicar_vacio(): void
{
    $declarado = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($declarado > 0) {
        responder(['error' => sprintf(
            'El servidor rechazó %d MB de una vez: PHP acepta hasta %s (post_max_size).',
            (int) round($declarado / 1048576), ini_get('post_max_size') ?: '?'
        )], 413);
    }
    responder(['error' => 'Llegó vacío'], 400);
}

/* El tipo de un video o de un audio, por sus primeros bytes: el nombre y lo
 * que dice el navegador no sirven, se pueden cambiar. Los audios entran por
 * la placa con voz: un audio de WhatsApp (ogg), una grabación (m4a, mp3,
 * wav, webm) o un video del que se usa solo el sonido. */
function tipo_de_sonido_o_video(string $c): ?string
{
    if (strlen($c) < 4) return null;
    if (substr($c, 4, 4) === 'ftyp') {
        // un m4a es un MP4 que trae solo sonido, y lo dice su marca
        return in_array(substr($c, 8, 4), ['M4A ', 'M4B '], true) ? 'm4a' : 'mp4';
    }
    if (substr($c, 0, 4) === 'OggS') return 'ogg';
    if (substr($c, 0, 4) === 'RIFF' && substr($c, 8, 4) === 'WAVE') return 'wav';
    if (substr($c, 0, 4) === "\x1A\x45\xDF\xA3") return 'webm';
    if (substr($c, 0, 3) === 'ID3') return 'mp3';
    $a = ord($c[0]); $b = ord($c[1]);
    if ($a === 0xFF && ($b & 0xF6) === 0xF0) return 'aac';   // AAC suelto (ADTS)
    if ($a === 0xFF && ($b & 0xE0) === 0xE0) return 'mp3';   // MP3 sin etiqueta
    return null;
}

/* Un pedazo entra entero en memoria sin problema: son dos megas. Lo que no
 * puede entrar en memoria es el video completo —ver guardar_archivo—. */
function cuerpo_o_error(): string
{
    $datos = file_get_contents('php://input');
    if ($datos !== false && $datos !== '') return $datos;
    explicar_vacio();
    return '';
}

/* Guarda un archivo que ya está en el disco: revisa que sea lo que dice ser,
 * le pone un nombre propio, lo mueve a fotos/ y lo anota.
 *
 * Antes recibía el video entero como texto. Al cerrar una subida por
 * pedazos eso obligaba a leer el archivo completo a la memoria de PHP y a
 * escribirlo de nuevo: el triple de trabajo de disco justo en el momento en
 * que la barra está en 100 %, y si el video pesaba más que el memory_limit,
 * PHP moría ahí y la subida fallaba al final, después de haberla esperado
 * entera. En un hosting que limita el uso de disco, eso era la mitad de la
 * espera. Ahora se mira solo el principio del archivo y se lo cambia de
 * carpeta, que no copia nada. */
function guardar_archivo(string $origen, string $dir): void
{
    $bytes = (int) @filesize($origen);
    if ($bytes <= 0) { @unlink($origen); responder(['error' => 'Llegó vacío'], 400); }
    if ($bytes > TOPE) { @unlink($origen); responder(['error' => 'Máximo 300 MB'], 413); }

    // imagen o MP4: nada más entra. getimagesize lee solo la cabecera.
    $ext = null;
    $tipo = @getimagesize($origen);
    if ($tipo !== false) {
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
                'image/gif' => 'gif'][$tipo['mime']] ?? null;
        if ($ext === null) {
            @unlink($origen);
            responder(['error' => 'Formato no soportado: ' . $tipo['mime']], 400);
        }
    } elseif (($ext = tipo_de_sonido_o_video((string) @file_get_contents($origen, false, null, 0, 12))) === null) {
        @unlink($origen);
        responder(['error' => 'Eso no es una imagen, ni un video MP4, ni un audio'], 400);
    }

    try {
        $nombre = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
        $destino = $dir . '/' . $nombre;
        if (!@rename($origen, $destino)) {
            @unlink($origen);
            responder(['error' => 'No se pudo guardar'], 500);
        }
        /* Lo creado a mano puede quedar legible solo para PHP, y el archivo lo
         * sirve el servidor web y lo baja Instagram: tiene que poder leerlo
         * cualquiera. Con file_put_contents salía así de por sí. */
        @chmod($destino, 0644);
        $st = bd()->prepare('INSERT INTO fotos (archivo, creada) VALUES (?, NOW())');
        $st->execute([$nombre]);
        responder(['ok' => true, 'id' => (int) bd()->lastInsertId(), 'ruta' => 'fotos/' . $nombre]);
    } catch (Throwable $e) {
        responder(['error' => $e->getMessage()], 500);
    }
}

$parciales = $dir . '/.parciales';
if (!is_dir($parciales) && !@mkdir($parciales, 0755, true)) {
    responder(['error' => 'No se pudo preparar la carpeta de subidas'], 500);
}

/* ------------------------------------------------------------------ */
/* de a pedazos                                                        */
/* ------------------------------------------------------------------ */

/* Cada pedazo dice en qué posición del archivo va (`desde`), y el servidor
 * contesta cuánto tiene (`recibido`). Antes cada uno se pegaba al final sin
 * mirar: si en el camino un pedazo llegaba dos veces —un reintento del
 * navegador, un proxy—, el video quedaba corrido unos megas y se veía con
 * saltos o se cortaba, sin ningún error. Y si uno fallaba no había forma de
 * seguir: se empezaba de cero.
 * Ahora repetir un pedazo no hace nada, un hueco se rechaza diciendo desde
 * dónde seguir, y el editor puede retomar una subida cortada en vez de
 * volver a mandar todo.
 * Un editor viejo, que no manda `desde`, sigue funcionando como antes. */
if (isset($_GET['trozo'])) {
    // el nombre lo pone el navegador, así que se limpia antes de tocar el disco
    $sesion = preg_replace('/[^a-zA-Z0-9]/', '', (string) ($_GET['sesion'] ?? ''));
    if (strlen($sesion) < 8) responder(['error' => 'Falta identificar la subida'], 400);

    // subidas que quedaron por la mitad hace rato
    foreach (glob($parciales . '/*.part') ?: [] as $viejo) {
        if (is_file($viejo) && filemtime($viejo) < time() - 7200) @unlink($viejo);
    }

    $parcial = $parciales . '/' . $sesion . '.part';
    $pedazo = cuerpo_o_error();
    $largo = strlen($pedazo);

    $f = @fopen($parcial, 'c+b');
    if ($f === false) responder(['error' => 'No se pudo guardar el pedazo'], 500);
    // dos pedidos de la misma subida a la vez —el original y un reintento—
    // no pueden escribir mezclados
    flock($f, LOCK_EX);
    $llevaba = (int) fstat($f)['size'];
    $desde = isset($_GET['desde']) ? max(0, (int) $_GET['desde']) : $llevaba;

    $soltar = static function () use ($f): void { flock($f, LOCK_UN); fclose($f); };

    if ($desde > $llevaba) {
        // falta algo del medio: se dice desde dónde seguir y no se escribe nada
        $soltar();
        responder(['error' => 'Falta un pedazo anterior', 'recibido' => $llevaba], 409);
    }
    if ($desde + $largo > TOPE) {
        $soltar();
        @unlink($parcial);
        responder(['error' => 'Máximo 300 MB'], 413);
    }
    if ($desde + $largo > $llevaba) {
        /* Lo normal es que $desde sea justo donde termina lo que hay. Si es
         * menos, el mismo pedazo había quedado escrito a medias: se recorta y
         * se escribe entero. Lo que ya estaba completo no se toca nunca. */
        if ($desde < $llevaba) ftruncate($f, $desde);
        fseek($f, $desde);
        $escritos = fwrite($f, $pedazo);
        fflush($f);
        if ($escritos !== $largo) {
            $soltar();
            responder(['error' => 'No se pudo guardar el pedazo'], 500);
        }
        $llevaba = $desde + $largo;
    }
    // si no entró en la condición, era un pedazo repetido: ya estaba
    $soltar();

    if (empty($_GET['fin'])) {
        responder(['ok' => true, 'recibido' => $llevaba]);
    }

    /* Antes de cerrar se confirma que llegó todo. Sin esto, una subida con
     * un hueco se guardaba igual y el video salía roto. */
    $total = isset($_GET['total']) ? (int) $_GET['total'] : $llevaba;
    clearstatcache(true, $parcial);
    $tiene = (int) @filesize($parcial);
    if ($tiene !== $total) {
        responder(['error' => "Llegaron $tiene de $total bytes", 'recibido' => min($tiene, $total)], 409);
    }
    guardar_archivo($parcial, $dir);
}

/* ------------------------------------------------------------------ */
/* de una sola vez, para lo chico                                      */
/* ------------------------------------------------------------------ */

/* Va directo al disco, sin pasar por una variable: así lo mandado de una
 * vez tampoco depende de la memoria de PHP. */
$temporal = $parciales . '/' . bin2hex(random_bytes(8)) . '.part';
$entrada = fopen('php://input', 'rb');
$salida = @fopen($temporal, 'wb');
if ($entrada === false || $salida === false) responder(['error' => 'No se pudo guardar'], 500);
$copiados = stream_copy_to_stream($entrada, $salida);
fclose($entrada);
fclose($salida);
if (!$copiados) {
    @unlink($temporal);
    explicar_vacio();
}
guardar_archivo($temporal, $dir);
