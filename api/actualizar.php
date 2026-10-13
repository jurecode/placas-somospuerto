<?php
/* Actualiza el sitio con la última versión publicada en GitHub.
 *
 * Baja el zip que arma el workflow y lo descomprime encima. Nunca toca
 * api/config.php ni las carpetas con contenido: solo el código.
 *
 * Como el repositorio es privado, hace falta un token de GitHub de solo
 * lectura, que se carga desde el panel y queda en la base.
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

const REPO_POR_DEFECTO = 'jurecode/placas-somospuerto';
const ARCHIVO_ZIP = 'placas-somospuerto.zip';

/* Cada versión publica un paquete por medio, con su marca ya adentro. Cuál le
 * toca a este sitio se dice en config.php, que es de cada instalación y no se
 * sobrescribe nunca. Sin eso, el de siempre. */
function paquete(): string {
    $nombre = defined('PAQUETE') ? (string) PAQUETE : ARCHIVO_ZIP;
    $nombre = basename(trim($nombre));                 // nada de rutas
    return preg_match('/^placas-[a-z0-9-]+\.zip$/i', $nombre) ? $nombre : ARCHIVO_ZIP;
}

// nunca se sobrescriben: son configuración o contenido, no código
const INTOCABLES = ['api/config.php'];

/* La carpeta de la marca —logo, cierre, colores, nombre— se crea la primera
 * vez y después no se toca nunca más. Es lo que permite que dos medios
 * distintos vivan del mismo repositorio: se actualizan juntos y cada uno
 * conserva lo suyo. */
const CARPETA_MARCA = 'marca/';

require_once __DIR__ . '/actualizar_cache.php';

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = null;
if ($metodo === 'POST') {
    $cuerpo = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
}
/* La actualización automática. No pide clave a propósito: la llama GitHub al
 * terminar cada versión (ver el workflow) y el editor al abrirse, y lo único
 * que puede hacer es instalar la última versión oficial del repositorio, que
 * es justamente lo que se quiere. Solo si está prendida en el panel, y con
 * una espera mínima entre revisiones para que nadie la pueda usar para
 * cargar el servidor. */
$tarea = (string) ($_GET['tarea'] ?? ($cuerpo['tarea'] ?? ''));
if ($tarea === 'auto') {
    try {
        responder(actualizar_solo(($_GET['aviso'] ?? '') === 'push'));
    } catch (Throwable $e) {
        responder(['ok' => false, 'error' => $e->getMessage()], 500);
    }
}

exigir_clave($cuerpo);

function github(string $ruta, ?string $guardarEn = null, bool $binario = false): array {
    $token = ajuste('gh_token');
    if ($token === '') throw new RuntimeException('Falta el token de GitHub. Cargalo en el panel.');
    $cabeceras = [
        'Authorization: Bearer ' . $token,
        'Accept: ' . ($binario ? 'application/octet-stream' : 'application/vnd.github+json'),
        'X-GitHub-Api-Version: 2022-11-28',
    ];
    $r = pedir_http($ruta, $cabeceras, $guardarEn);
    if ($r['codigo'] === 401 || $r['codigo'] === 403) {
        throw new RuntimeException('GitHub rechazó el token (¿tiene permiso de lectura sobre el repo?)');
    }
    if ($r['codigo'] === 404) throw new RuntimeException('No se encontró el repositorio o la versión');
    if ($r['codigo'] >= 400) throw new RuntimeException('GitHub respondió ' . $r['codigo']);
    return $r;
}

function ultima_version(): array {
    $repo = ajuste('gh_repo', REPO_POR_DEFECTO);
    $r = github("https://api.github.com/repos/$repo/releases/latest");
    $d = json_decode($r['cuerpo'], true);
    if (!is_array($d)) throw new RuntimeException('GitHub devolvió algo inesperado');

    $url = null;
    $quiero = paquete();
    foreach ($d['assets'] ?? [] as $a) {
        if (($a['name'] ?? '') === $quiero) { $url = $a['url']; break; }
    }
    return ['tag' => $d['tag_name'] ?? '?', 'publicada' => $d['published_at'] ?? null, 'zip' => $url];
}

/* Las últimas versiones con su nota, para poder ver qué cambió antes de
 * actualizar y qué se instaló después. La nota es el mensaje del cambio. */
function historial(int $cuantas = 8): array {
    $repo = ajuste('gh_repo', REPO_POR_DEFECTO);
    $r = github("https://api.github.com/repos/$repo/releases?per_page=$cuantas");
    $d = json_decode($r['cuerpo'], true);
    if (!is_array($d)) return [];

    $lista = [];
    foreach ($d as $v) {
        $lista[] = [
            'tag'       => $v['tag_name'] ?? '?',
            'nombre'    => $v['name'] ?? ($v['tag_name'] ?? '?'),
            'publicada' => $v['published_at'] ?? null,
            'notas'     => trim((string) ($v['body'] ?? '')),
        ];
    }
    return $lista;
}

/* Baja el zip de la versión `$v` y lo descomprime encima del sitio. */
function instalar(array $v): array {
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('Este hosting no tiene ZipArchive: hay que subir por FTP');
    }

    if ($v['zip'] === null) throw new RuntimeException('La versión no trae el archivo ' . paquete());

    $raiz = dirname(__DIR__);
    if (!is_writable($raiz)) throw new RuntimeException('La carpeta del sitio no tiene permiso de escritura');

    $tmp = tempnam(sys_get_temp_dir(), 'placas') ?: ($raiz . '/.actualizacion.zip');
    github($v['zip'], $tmp, true);

    $zip = new ZipArchive();
    if ($zip->open($tmp) !== true) throw new RuntimeException('El archivo descargado no es un zip válido');

    $escritos = []; $omitidos = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $nombre = $zip->getNameIndex($i);
        if ($nombre === false || substr($nombre, -1) === '/') continue;

        // nada de rutas raras ni de salirse de la carpeta del sitio
        $limpio = ltrim(str_replace('\\', '/', $nombre), '/');
        if (strpos($limpio, '..') !== false) { $omitidos[] = $nombre; continue; }
        if (in_array($limpio, INTOCABLES, true)) { $omitidos[] = $limpio; continue; }

        $destino = $raiz . '/' . $limpio;

        // la marca se instala si falta, y no se pisa si ya está
        if (strpos($limpio, CARPETA_MARCA) === 0 && is_file($destino)) {
            $omitidos[] = $limpio;
            continue;
        }

        $carpeta = dirname($destino);
        if (!is_dir($carpeta) && !@mkdir($carpeta, 0755, true)) { $omitidos[] = $limpio; continue; }

        $datos = $zip->getFromIndex($i);
        if ($datos === false || @file_put_contents($destino, $datos) === false) {
            $omitidos[] = $limpio;
            continue;
        }
        $escritos[] = $limpio;
    }
    $zip->close();
    @unlink($tmp);

    if (!$escritos) throw new RuntimeException('No se pudo escribir ningún archivo. Revisá los permisos.');

    $cache = asegurar_cache($raiz);

    guardar_ajuste('version_instalada', $v['tag']);
    return ['version' => $v['tag'], 'cache' => $cache, 'archivos' => count($escritos), 'omitidos' => $omitidos];
}

/* Revisa si hay versión nueva y, si la hay, la instala. Con `$porPush` (el
 * aviso de GitHub) revisa ya, salvo que haya revisado hace menos de un
 * minuto; si no (el editor al abrirse), como mucho una vez cada 15 minutos.
 * Un candado en la base evita que dos avisos a la vez instalen dos veces. */
function actualizar_solo(bool $porPush): array {
    if (ajuste('auto_actualizar') !== '1') return ['ok' => true, 'hizo' => 'apagado'];
    $espera = $porPush ? 60 : 900;
    if ((int) ajuste('auto_revisado') > time() - $espera) return ['ok' => true, 'hizo' => 'revisado hace poco'];
    if ((int) bd()->query("SELECT GET_LOCK('placas_actualizar', 0)")->fetchColumn() !== 1) {
        return ['ok' => true, 'hizo' => 'ya se está actualizando'];
    }
    try {
        guardar_ajuste('auto_revisado', (string) time());
        $v = ultima_version();
        if ($v['tag'] === ajuste('version_instalada')) return ['ok' => true, 'hizo' => 'al día', 'version' => $v['tag']];
        try {
            $r = instalar($v);
        } catch (Throwable $e) {
            guardar_ajuste('auto_error', json_encode(['error' => $e->getMessage(), 'cuando' => time(), 'version' => $v['tag']]));
            throw $e;
        }
        guardar_ajuste('auto_error', '');
        guardar_ajuste('auto_ultima', json_encode(['version' => $r['version'], 'cuando' => time()]));
        return ['ok' => true, 'hizo' => 'actualizado'] + $r;
    } finally {
        bd()->query("SELECT RELEASE_LOCK('placas_actualizar')");
    }
}

try {
    if ($metodo === 'GET') {
        $v = ultima_version();
        $instalada = ajuste('version_instalada');
        $lista = [];
        try { $lista = historial(); } catch (Throwable $e) { /* sin historial se sigue igual */ }
        responder([
            'instalada' => $instalada !== '' ? $instalada : null,
            'ultima'    => $v['tag'],
            'publicada' => $v['publicada'],
            'hayNueva'  => $instalada === '' || $instalada !== $v['tag'],
            'repo'      => ajuste('gh_repo', REPO_POR_DEFECTO),
            'versiones' => $lista,
            'auto'      => ajuste('auto_actualizar') === '1',
            'autoUltima' => json_decode(ajuste('auto_ultima'), true) ?: null,
            'autoError'  => json_decode(ajuste('auto_error'), true) ?: null,
        ]);
    }

    if ($metodo !== 'POST') responder(['error' => 'Método no soportado'], 405);

    // guardar el token o el repo desde el panel
    $guardo = false;
    foreach (['gh_token', 'gh_repo'] as $c) {
        if (isset($cuerpo[$c]) && trim((string) $cuerpo[$c]) !== '') {
            guardar_ajuste($c, trim((string) $cuerpo[$c]));
            $guardo = true;
        }
    }
    if ($guardo && empty($cuerpo['actualizar'])) responder(['ok' => true, 'guardado' => true]);

    // prender o apagar la actualización automática
    if (array_key_exists('auto_actualizar', $cuerpo)) {
        guardar_ajuste('auto_actualizar', !empty($cuerpo['auto_actualizar']) ? '1' : '0');
        responder(['ok' => true, 'auto' => !empty($cuerpo['auto_actualizar'])]);
    }

    $v = ultima_version();
    responder(['ok' => true] + instalar($v));

} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
