<?php
/* Las placas, guardadas en MySQL.
 *
 * El cuerpo de cada placa va como JSON en una sola columna a propósito: el
 * diseño todavía cambia seguido y así no hace falta migrar la tabla cada
 * vez que aparece un campo nuevo. Nombre, formato y fecha sí son columnas,
 * que son por lo que se lista y se ordena. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = null;
if ($metodo === 'POST' || $metodo === 'PUT') {
    $cuerpo = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($cuerpo)) responder(['error' => 'Cuerpo inválido'], 400);
}
exigir_clave($cuerpo);

function nombrar(string $titulo): string {
    foreach (explode("\n", $titulo) as $linea) {
        $linea = trim($linea);
        if ($linea !== '') return mb_substr($linea, 0, 60);
    }
    return 'Placa sin título';
}

function fila_a_placa(array $f): array {
    $datos = json_decode($f['datos'], true) ?: [];
    $datos['id'] = (int) $f['id'];
    $datos['nombre'] = $f['nombre'];
    $datos['actualizada'] = $f['actualizada'];
    return $datos;
}

try {
    if ($metodo === 'GET') {
        if (isset($_GET['id'])) {
            $st = bd()->prepare('SELECT * FROM placas WHERE id = ?');
            $st->execute([(int) $_GET['id']]);
            $f = $st->fetch();
            responder($f ? fila_a_placa($f) : ['error' => 'No existe'], $f ? 200 : 404);
        }
        // el listado no arrastra el JSON completo: solo lo que se muestra
        $filas = bd()->query(
            'SELECT id, nombre, formato, actualizada FROM placas
             ORDER BY actualizada DESC, id DESC')->fetchAll();
        responder(['placas' => $filas]);
    }

    if ($metodo === 'POST') {
        $datos = $cuerpo['placa'] ?? [];
        if (!is_array($datos)) responder(['error' => 'Falta la placa'], 400);

        $id = isset($datos['id']) ? (int) $datos['id'] : 0;
        unset($datos['id'], $datos['actualizada']);
        $nombre  = nombrar((string) ($datos['titulo'] ?? ''));
        $formato = (string) ($datos['formato'] ?? 'noticia');
        $datos['nombre'] = $nombre;
        $json = json_encode($datos, JSON_UNESCAPED_UNICODE);

        if ($id > 0) {
            $st = bd()->prepare(
                'UPDATE placas SET nombre = ?, formato = ?, datos = ?, actualizada = NOW() WHERE id = ?');
            $st->execute([$nombre, $formato, $json, $id]);
        } else {
            $st = bd()->prepare(
                'INSERT INTO placas (nombre, formato, datos, actualizada) VALUES (?, ?, ?, NOW())');
            $st->execute([$nombre, $formato, $json]);
            $id = (int) bd()->lastInsertId();
        }
        responder(['ok' => true, 'id' => $id, 'nombre' => $nombre]);
    }

    if ($metodo === 'DELETE') {
        $id = (int) ($_GET['id'] ?? 0);
        if (bd()->query('SELECT COUNT(*) FROM placas')->fetchColumn() <= 1) {
            responder(['error' => 'Tiene que quedar al menos una placa'], 400);
        }
        $st = bd()->prepare('DELETE FROM placas WHERE id = ?');
        $st->execute([$id]);
        responder(['ok' => true]);
    }

    responder(['error' => 'Método no soportado'], 405);

} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
