<?php
/* Los feeds de otros medios, para armar publicaciones sin copiar y pegar.
 *
 * Esto vive en el servidor y no en el navegador por dos motivos. Uno, que un
 * navegador no puede leer un feed de otro dominio: lo bloquea por seguridad y
 * no hay forma de pedirle permiso a un sitio ajeno. Y dos, que la foto hay
 * que bajarla igual a nuestro servidor para poder dibujarla en la placa.
 *
 * Nada de esto toca el editor: es una puerta aparte con su propia tabla.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

const FEEDS_CACHE_SEG   = 300;          // cinco minutos: los medios no publican más seguido
const FEEDS_MAX_ITEMS   = 40;
const FEEDS_PLAZO       = 20;           // segundos por pedido
const FEEDS_MAX_BYTES   = 6 * 1024 * 1024;
const FOTO_MAX_BYTES    = 12 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* tablas propias                                                      */
/* ------------------------------------------------------------------ */

function feeds_tablas(): void {
    static $hecho = false;
    if ($hecho) return;
    $hecho = true;
    bd()->exec("CREATE TABLE IF NOT EXISTS feeds (
        id      INT AUTO_INCREMENT PRIMARY KEY,
        nombre  VARCHAR(80)  NOT NULL,
        url     VARCHAR(500) NOT NULL,
        orden   INT          NOT NULL DEFAULT 0,
        creado  DATETIME     NOT NULL,
        UNIQUE KEY url_unica (url(190))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    /* Lo traído queda guardado un rato: abrir la pestaña no puede significar
       golpear cinco sitios ajenos cada vez. */
    bd()->exec("CREATE TABLE IF NOT EXISTS feeds_cache (
        clave   VARCHAR(64) PRIMARY KEY,
        valor   LONGTEXT    NOT NULL,
        vence   DATETIME    NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function cache_leer(string $clave) {
    $st = bd()->prepare('SELECT valor FROM feeds_cache WHERE clave = ? AND vence > NOW()');
    $st->execute([$clave]);
    $v = $st->fetchColumn();
    return $v === false ? null : json_decode((string) $v, true);
}

function cache_guardar(string $clave, $valor, int $segundos): void {
    $st = bd()->prepare(
        'INSERT INTO feeds_cache (clave, valor, vence) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), vence = VALUES(vence)');
    $st->execute([$clave, json_encode($valor, JSON_UNESCAPED_UNICODE), $segundos]);
    /* Se limpia lo vencido de vez en cuando, para que la tabla no crezca
       para siempre con noticias de hace meses. */
    if (random_int(1, 20) === 1) bd()->exec('DELETE FROM feeds_cache WHERE vence < NOW()');
}

/* ------------------------------------------------------------------ */
/* traer de afuera, con cuidado                                        */
/* ------------------------------------------------------------------ */

/* Este archivo pide direcciones que vienen de la base, y la base la llena
   quien tenga la clave. Aun así se revisa cada una: una dirección que apunte
   a la red interna del hosting convertiría esto en una puerta para mirar
   adentro del servidor desde afuera. Solo http y https, y solo a direcciones
   públicas. */
function url_permitida(string $url, ?string &$porque = null): bool {
    $p = parse_url($url);
    if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true)) {
        $porque = 'La dirección tiene que empezar con http:// o https://';
        return false;
    }
    $host = $p['host'] ?? '';
    if ($host === '') { $porque = 'No se entiende el dominio'; return false; }

    foreach (array_unique(array_merge(
        gethostbynamel($host) ?: [],
        [filter_var($host, FILTER_VALIDATE_IP) ?: null]
    )) as $ip) {
        if (!$ip) continue;
        if (!filter_var($ip, FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            $porque = 'Esa dirección apunta a la red interna del servidor';
            return false;
        }
    }
    return true;
}

function traer(string $url, int $maxBytes = FEEDS_MAX_BYTES): ?string {
    $porque = null;
    if (!url_permitida($url, $porque)) return null;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 4,
        CURLOPT_TIMEOUT        => FEEDS_PLAZO,
        CURLOPT_CONNECTTIMEOUT => 8,
        // varios medios devuelven 403 a un cliente sin nombre
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; PlacasBot/1.0)',
        CURLOPT_ENCODING       => '',
        CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS=> CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_BUFFERSIZE     => 65536,
        CURLOPT_NOPROGRESS     => false,
        CURLOPT_PROGRESSFUNCTION => function ($r, $bajado) use ($maxBytes) {
            return $bajado > $maxBytes ? 1 : 0;   // corta si se pasa de tamaño
        },
    ]);
    $cuerpo = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return ($cuerpo === false || $codigo >= 400) ? null : (string) $cuerpo;
}

/* ------------------------------------------------------------------ */
/* leer el feed                                                        */
/* ------------------------------------------------------------------ */

function limpiar_texto(string $html): string {
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = preg_replace('/\s+/u', ' ', $t);
    return trim((string) $t);
}

/* La foto del artículo, buscada donde cada medio la ponga. ADN la manda en
   media:content, ipauta en media:thumbnail, y BioBio no la manda: para esos
   queda el og:image de la propia nota, que se pide aparte y solo cuando hace
   falta, porque es un pedido más por noticia. */
function foto_del_item(SimpleXMLElement $item, array $ns): ?string {
    foreach (['media', 'content'] as $abrev) {
        if (!isset($ns[$abrev])) continue;
        $m = $item->children($ns[$abrev]);
        foreach (['content', 'thumbnail'] as $etiqueta) {
            if (!isset($m->$etiqueta)) continue;
            foreach ($m->$etiqueta as $nodo) {
                /* Los atributos se piden aparte a propósito. Pedidos como
                   $nodo['url'] salen vacíos: al haber entrado por children()
                   de un espacio de nombres, SimpleXML busca el atributo en ese
                   mismo espacio, y estos van sin prefijo. Con esto puesto, ADN
                   e ipauta pasan de 6 fotos de 40 a todas. */
                $at   = $nodo->attributes();
                $u    = (string) ($at['url'] ?? '');
                $tipo = (string) ($at['type'] ?? '');
                if ($u !== '' && ($tipo === '' || str_starts_with($tipo, 'image'))) return $u;
            }
        }
    }
    if (isset($item->enclosure)) {
        foreach ($item->enclosure as $e) {
            $at   = $e->attributes();
            $tipo = (string) ($at['type'] ?? '');
            $u    = (string) ($at['url'] ?? '');
            if ($u !== '' && ($tipo === '' || str_starts_with($tipo, 'image'))) return $u;
        }
    }
    // por último, la primera imagen del cuerpo, salteando emojis y píxeles
    $cuerpo = '';
    if (isset($ns['content'])) {
        $c = $item->children($ns['content']);
        if (isset($c->encoded)) $cuerpo = (string) $c->encoded;
    }
    if ($cuerpo === '') $cuerpo = (string) ($item->description ?? '');
    if (preg_match_all('/<img[^>]+src="([^"]+)"/i', $cuerpo, $m2)) {
        foreach ($m2[1] as $u) {
            if (preg_match('#/(emoji|s\.w\.org)/#i', $u)) continue;
            if (preg_match('/\.(svg|gif)(\?|$)/i', $u)) continue;
            return $u;
        }
    }
    return null;
}

function leer_feed(string $xml): array {
    $antes = libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml);
    libxml_use_internal_errors($antes);
    if (!$doc) return [];

    $ns = $doc->getNamespaces(true);
    $items = [];

    // RSS trae <item> dentro de <channel>; Atom trae <entry> en la raíz
    $lista = isset($doc->channel->item) ? $doc->channel->item
           : (isset($doc->entry) ? $doc->entry : []);

    foreach ($lista as $item) {
        $titulo = limpiar_texto((string) ($item->title ?? ''));
        if ($titulo === '') continue;

        $enlace = (string) ($item->link ?? '');
        if ($enlace === '' && isset($item->link['href'])) $enlace = (string) $item->link['href'];

        $resumen = limpiar_texto((string) ($item->description ?? $item->summary ?? ''));
        if ($resumen === '' && isset($ns['content'])) {
            $c = $item->children($ns['content']);
            if (isset($c->encoded)) $resumen = limpiar_texto((string) $c->encoded);
        }

        $categorias = [];
        foreach (($item->category ?? []) as $c) {
            $t = limpiar_texto((string) $c);
            if ($t !== '') $categorias[] = $t;
        }

        $fecha = (string) ($item->pubDate ?? $item->published ?? $item->updated ?? '');
        $ts = $fecha !== '' ? strtotime($fecha) : false;

        $items[] = [
            'titulo'     => $titulo,
            'enlace'     => $enlace,
            'resumen'    => mb_substr($resumen, 0, 600),
            'categorias' => array_slice($categorias, 0, 6),
            'fecha'      => $ts ? date('c', $ts) : null,
            'foto'       => foto_del_item($item, $ns),
            'id'         => substr(sha1($enlace !== '' ? $enlace : $titulo), 0, 16),
        ];
        if (count($items) >= FEEDS_MAX_ITEMS) break;
    }
    return $items;
}

/* La foto de portada de una nota que no la trae en el feed. */
function portada_del_articulo(string $url): ?string {
    $clave = 'og:' . sha1($url);
    $guardada = cache_leer($clave);
    if ($guardada !== null) return $guardada['foto'] ?? null;

    $html = traer($url, 2 * 1024 * 1024);
    $foto = null;
    if ($html !== null) {
        foreach (['og:image', 'twitter:image'] as $prop) {
            if (preg_match('/<meta[^>]+(?:property|name)=["\']' . preg_quote($prop, '/')
                . '["\'][^>]*content=["\']([^"\']+)/i', $html, $m)
             || preg_match('/<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']'
                . preg_quote($prop, '/') . '["\']/i', $html, $m)) {
                $foto = html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
                break;
            }
        }
    }
    // se guarda aunque no haya: no tiene sentido volver a pedir la misma nota
    cache_guardar($clave, ['foto' => $foto], 86400);
    return $foto;
}

/* ------------------------------------------------------------------ */
/* la puerta                                                           */
/* ------------------------------------------------------------------ */

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = [];
if ($metodo === 'POST') {
    $cuerpo = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
}
exigir_clave($cuerpo);
feeds_tablas();

try {
    $tarea = $cuerpo['tarea'] ?? $_GET['tarea'] ?? 'items';

    /* --- la lista de fuentes --- */
    if ($tarea === 'fuentes') {
        responder(['fuentes' => bd()->query(
            'SELECT id, nombre, url FROM feeds ORDER BY orden, id')->fetchAll()]);
    }

    /* --- agregar una fuente --- */
    if ($tarea === 'agregar') {
        $nombre = trim((string) ($cuerpo['nombre'] ?? ''));
        $url    = trim((string) ($cuerpo['url'] ?? ''));
        if ($nombre === '' || $url === '') responder(['error' => 'Falta el nombre o la dirección'], 400);

        $porque = null;
        if (!url_permitida($url, $porque)) responder(['error' => $porque], 400);

        // se comprueba que sea un feed de verdad antes de guardarlo, así el
        // error aparece al agregarlo y no días después con la tabla vacía
        $xml = traer($url);
        if ($xml === null) responder(['error' => 'No se pudo leer esa dirección'], 400);
        $items = leer_feed($xml);
        if (!$items) responder(['error' => 'Esa dirección no parece un feed: no se encontró ninguna noticia'], 400);

        $st = bd()->prepare('INSERT INTO feeds (nombre, url, orden, creado)
                             VALUES (?, ?, COALESCE((SELECT * FROM (SELECT MAX(orden)+1 FROM feeds) t), 0), NOW())
                             ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)');
        $st->execute([mb_substr($nombre, 0, 80), $url]);
        responder(['ok' => true, 'noticias' => count($items)]);
    }

    /* --- quitar una fuente --- */
    if ($tarea === 'quitar') {
        $id = (int) ($cuerpo['id'] ?? $_GET['id'] ?? 0);
        bd()->prepare('DELETE FROM feeds WHERE id = ?')->execute([$id]);
        responder(['ok' => true]);
    }

    /* --- las noticias de una fuente --- */
    if ($tarea === 'items') {
        $id = (int) ($_GET['fuente'] ?? 0);
        $st = bd()->prepare('SELECT id, nombre, url FROM feeds WHERE id = ?');
        $st->execute([$id]);
        $fuente = $st->fetch();
        if (!$fuente) responder(['error' => 'Esa fuente no está en la lista'], 404);

        $clave = 'feed:' . sha1($fuente['url']);
        $guardado = ($_GET['recargar'] ?? '') === '1' ? null : cache_leer($clave);
        if ($guardado === null) {
            $xml = traer($fuente['url']);
            if ($xml === null) responder(['error' => 'No se pudo leer ' . $fuente['nombre']], 502);
            $guardado = leer_feed($xml);
            cache_guardar($clave, $guardado, FEEDS_CACHE_SEG);
        }
        responder(['fuente' => $fuente, 'items' => $guardado]);
    }

    /* --- la portada de una nota que no la trae en el feed --- */
    if ($tarea === 'portada') {
        $url = (string) ($_GET['url'] ?? $cuerpo['url'] ?? '');
        if ($url === '') responder(['error' => 'Falta la dirección de la nota'], 400);
        responder(['foto' => portada_del_articulo($url)]);
    }

    /* --- bajar una foto para poder dibujarla en la placa --- */
    if ($tarea === 'foto') {
        $url = (string) ($cuerpo['url'] ?? '');
        if ($url === '') responder(['error' => 'Falta la dirección de la foto'], 400);
        $porque = null;
        if (!url_permitida($url, $porque)) responder(['error' => $porque], 400);

        $datos = traer($url, FOTO_MAX_BYTES);
        if ($datos === null || strlen($datos) < 500) responder(['error' => 'No se pudo bajar la foto'], 502);

        $info = @getimagesizefromstring($datos);
        if (!$info) responder(['error' => 'Eso que llegó no es una imagen'], 415);
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$info['mime']] ?? null;
        if (!$ext) responder(['error' => 'Formato de imagen no soportado: ' . $info['mime']], 415);

        [$dir] = carpeta('fotos');
        $nombre = 'feed_' . bin2hex(random_bytes(6)) . '.' . $ext;
        if (file_put_contents($dir . '/' . $nombre, $datos) === false) {
            responder(['error' => 'No se pudo guardar la foto en el servidor'], 500);
        }
        bd()->prepare('INSERT INTO fotos (archivo, creada) VALUES (?, NOW())')
            ->execute(['fotos/' . $nombre]);
        responder(['ruta' => 'fotos/' . $nombre,
                   'ancho' => $info[0], 'alto' => $info[1]]);
    }

    responder(['error' => 'No se entiende qué se pide'], 400);
} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
