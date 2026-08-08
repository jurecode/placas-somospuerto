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

// nunca se sobrescriben: son configuración o contenido, no código
const INTOCABLES = ['api/config.php'];

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = null;
if ($metodo === 'POST') {
    $cuerpo = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
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
    foreach ($d['assets'] ?? [] as $a) {
        if (($a['name'] ?? '') === ARCHIVO_ZIP) { $url = $a['url']; break; }
    }
    return ['tag' => $d['tag_name'] ?? '?', 'publicada' => $d['published_at'] ?? null, 'zip' => $url];
}

try {
    if ($metodo === 'GET') {
        $v = ultima_version();
        $instalada = ajuste('version_instalada');
        responder([
            'instalada' => $instalada !== '' ? $instalada : null,
            'ultima'    => $v['tag'],
            'publicada' => $v['publicada'],
            'hayNueva'  => $instalada === '' || $instalada !== $v['tag'],
            'repo'      => ajuste('gh_repo', REPO_POR_DEFECTO),
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

    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('Este hosting no tiene ZipArchive: hay que subir por FTP');
    }

    $v = ultima_version();
    if ($v['zip'] === null) throw new RuntimeException('La versión no trae el archivo ' . ARCHIVO_ZIP);

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

    guardar_ajuste('version_instalada', $v['tag']);
    responder(['ok' => true, 'version' => $v['tag'],
               'archivos' => count($escritos), 'omitidos' => $omitidos]);

} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
