<?php
/* El equipo: quiénes publican, cuánto y cuándo. Solo para administración.
 *
 * GET  → las cuentas con sus números y las últimas publicaciones.
 *        ?usuario=ID filtra las publicaciones de una sola persona.
 * POST → tarea: crear | editar. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = $metodo === 'POST' ? (json_decode(file_get_contents('php://input') ?: '', true) ?: []) : [];
$yo = exigir_admin($metodo === 'POST' ? $cuerpo : null);

function usuario_ok(string $u): string {
    $u = mb_strtolower(trim($u));
    if (!preg_match('/^[a-z0-9._-]{3,40}$/', $u)) {
        responder(['error' => 'El usuario va de 3 a 40 caracteres: letras sin tilde, números, punto, guion o guion bajo.'], 400);
    }
    return $u;
}
function clave_ok(string $c): string {
    if (mb_strlen($c) < 8) responder(['error' => 'La contraseña tiene que tener al menos 8 caracteres.'], 400);
    if (mb_strlen($c) > 200) responder(['error' => 'La contraseña es demasiado larga.'], 400);
    return $c;
}
function nombre_ok(string $n): string {
    $n = trim(preg_replace('/\s+/u', ' ', $n));
    if (mb_strlen($n) < 2) responder(['error' => 'Falta el nombre, el que va a aparecer en las placas.'], 400);
    return mb_substr($n, 0, 80);
}
function rol_ok(string $r): string {
    return $r === 'admin' ? 'admin' : 'editor';
}
/* La foto es una que ya subió fotos.php: solo se acepta una ruta de ahí. */
function foto_ok(string $f): string {
    $f = trim($f);
    if ($f === '') return '';
    if (!preg_match('#^fotos/[A-Za-z0-9._-]+\.(jpg|png|webp)$#', $f)) responder(['error' => 'Esa foto no es una de las subidas.'], 400);
    return $f;
}

/* Cuántas cuentas de administración activas quedarían sin `$id`. Nunca
   puede quedar cero: nadie podría crear cuentas ni ver el panel. */
function otros_admins(int $id): int {
    $st = bd()->prepare("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?");
    $st->execute([$id]);
    return (int) $st->fetchColumn();
}

try {
    if ($metodo === 'GET') {
        $semana = gmdate('Y-m-d H:i:s', time() - 7 * 86400);
        $mes    = gmdate('Y-m-d H:i:s', time() - 30 * 86400);
        /* Una publicación que salió en Instagram y en Facebook son dos filas
           con el mismo `envio`, pero cuenta como un post. Las de antes de
           que hubiera redes no tienen envio: cada fila es una. */
        $post = "COALESCE(p.envio, CONCAT('#', p.id))";
        $st = bd()->prepare(
            "SELECT u.id, u.usuario, u.nombre, u.foto, u.rol, u.activo, u.creado, u.ultimo_ingreso,
                    COUNT(DISTINCT $post) AS posts,
                    COUNT(DISTINCT CASE WHEN p.publicada >= ? THEN $post END) AS semana,
                    COUNT(DISTINCT CASE WHEN p.publicada >= ? THEN $post END) AS mes,
                    MAX(p.publicada) AS ultimo_post
             FROM usuarios u LEFT JOIN publicaciones p ON p.usuario_id = u.id
             GROUP BY u.id, u.usuario, u.nombre, u.foto, u.rol, u.activo, u.creado, u.ultimo_ingreso
             ORDER BY u.activo DESC, posts DESC, u.nombre");
        $st->execute([$semana, $mes]);
        $usuarios = array_map(static fn($u) => [
            'id' => (int) $u['id'], 'usuario' => $u['usuario'], 'nombre' => $u['nombre'],
            'foto' => $u['foto'], 'rol' => $u['rol'], 'activo' => (bool) $u['activo'],
            'creado' => iso_utc($u['creado']), 'ultimoIngreso' => iso_utc($u['ultimo_ingreso']),
            'posts' => (int) $u['posts'], 'semana' => (int) $u['semana'], 'mes' => (int) $u['mes'],
            'ultimoPost' => iso_utc($u['ultimo_post']),
        ], $st->fetchAll());

        $filtro = isset($_GET['usuario']) && $_GET['usuario'] !== '' ? (int) $_GET['usuario'] : null;
        $sql = "SELECT p.id, p.usuario_id, p.nombre, p.formato, p.piezas, p.enlace, p.programada, p.publicada,
                       p.red, p.envio, u.nombre AS quien, u.foto
                FROM publicaciones p LEFT JOIN usuarios u ON u.id = p.usuario_id"
             . ($filtro !== null ? ' WHERE p.usuario_id = ?' : '')
             . ' ORDER BY p.publicada DESC, p.id DESC LIMIT 900';
        $st = bd()->prepare($sql);
        $st->execute($filtro !== null ? [$filtro] : []);
        // las filas de un mismo envío se juntan en una, con sus redes
        $publicaciones = [];
        foreach ($st->fetchAll() as $p) {
            $clave = $p['envio'] ?? ('#' . $p['id']);
            $red = ['red' => $p['red'] ?: 'instagram', 'enlace' => $p['enlace']];
            if (isset($publicaciones[$clave])) {
                array_unshift($publicaciones[$clave]['redes'], $red);
                // el enlace principal es el de Instagram, como siempre
                if ($red['red'] === 'instagram') {
                    if ($p['enlace']) $publicaciones[$clave]['enlace'] = $p['enlace'];
                    // en Facebook los videos del carrusel salen aparte: cuenta el de Instagram
                    $publicaciones[$clave]['piezas'] = (int) $p['piezas'];
                }
                continue;
            }
            if (count($publicaciones) >= 300) continue;
            $publicaciones[$clave] = [
                'id' => (int) $p['id'], 'usuarioId' => $p['usuario_id'] !== null ? (int) $p['usuario_id'] : null,
                'quien' => $p['quien'], 'foto' => $p['foto'], 'nombre' => $p['nombre'],
                'formato' => $p['formato'], 'piezas' => (int) $p['piezas'], 'enlace' => $p['enlace'],
                'programada' => (bool) $p['programada'], 'publicada' => iso_utc($p['publicada']),
                'redes' => [$red],
            ];
        }
        $publicaciones = array_values($publicaciones);

        // los totales del equipo, para los números de arriba del panel
        $tot = bd()->prepare(
            "SELECT COUNT(DISTINCT $post) AS total,
                    COUNT(DISTINCT CASE WHEN p.publicada >= ? THEN $post END) AS semana,
                    COUNT(DISTINCT CASE WHEN p.publicada >= ? THEN $post END) AS mes,
                    COUNT(DISTINCT CASE WHEN p.usuario_id IS NULL THEN $post END) AS sin_cuenta
             FROM publicaciones p");
        $tot->execute([$semana, $mes]);
        $t = $tot->fetch();

        responder([
            'yo' => $yo['id'], 'usuarios' => $usuarios, 'publicaciones' => $publicaciones,
            'totales' => ['total' => (int) $t['total'], 'semana' => (int) $t['semana'],
                          'mes' => (int) $t['mes'], 'sinCuenta' => (int) $t['sin_cuenta']],
        ]);
    }

    if ($metodo !== 'POST') responder(['error' => 'Método no soportado'], 405);
    $tarea = (string) ($cuerpo['tarea'] ?? '');

    if ($tarea === 'crear') {
        $usuario = usuario_ok((string) ($cuerpo['usuario'] ?? ''));
        $st = bd()->prepare('SELECT COUNT(*) FROM usuarios WHERE usuario = ?');
        $st->execute([$usuario]);
        if ((int) $st->fetchColumn() > 0) responder(['error' => "Ya hay alguien con el usuario «{$usuario}»."], 409);
        bd()->prepare('INSERT INTO usuarios (usuario, nombre, clave_hash, foto, rol, activo, creado) VALUES (?, ?, ?, ?, ?, 1, ?)')
            ->execute([
                $usuario,
                nombre_ok((string) ($cuerpo['nombre'] ?? '')),
                password_hash(clave_ok((string) ($cuerpo['contrasena'] ?? '')), PASSWORD_DEFAULT),
                foto_ok((string) ($cuerpo['foto'] ?? '')),
                rol_ok((string) ($cuerpo['rol'] ?? 'editor')),
                ahora_utc(),
            ]);
        responder(['ok' => true, 'id' => (int) bd()->lastInsertId()]);
    }

    if ($tarea === 'editar') {
        $id = (int) ($cuerpo['id'] ?? 0);
        $st = bd()->prepare('SELECT * FROM usuarios WHERE id = ?');
        $st->execute([$id]);
        $u = $st->fetch();
        if (!$u) responder(['error' => 'Esa cuenta no existe.'], 404);

        $cambios = [];
        $valores = [];
        if (array_key_exists('nombre', $cuerpo)) { $cambios[] = 'nombre = ?'; $valores[] = nombre_ok((string) $cuerpo['nombre']); }
        if (array_key_exists('foto', $cuerpo))   { $cambios[] = 'foto = ?';   $valores[] = foto_ok((string) $cuerpo['foto']); }

        $quitaAdmin = false;
        if (array_key_exists('rol', $cuerpo)) {
            $rol = rol_ok((string) $cuerpo['rol']);
            $quitaAdmin = $u['rol'] === 'admin' && $rol !== 'admin';
            $cambios[] = 'rol = ?'; $valores[] = $rol;
        }
        $desactiva = false;
        if (array_key_exists('activo', $cuerpo)) {
            $activo = !empty($cuerpo['activo']);
            $desactiva = (int) $u['activo'] === 1 && !$activo;
            if ($desactiva && $id === $yo['id']) responder(['error' => 'No te podés desactivar a vos mismo.'], 400);
            $cambios[] = 'activo = ?'; $valores[] = $activo ? 1 : 0;
        }
        if (($quitaAdmin || $desactiva) && $u['rol'] === 'admin' && otros_admins($id) === 0) {
            responder(['error' => 'Tiene que quedar al menos una cuenta de administración activa.'], 400);
        }
        // `contrasena` y no `clave`: `clave` es la credencial de quien pide
        $nuevaClave = trim((string) ($cuerpo['contrasena'] ?? '')) !== '';
        if ($nuevaClave) { $cambios[] = 'clave_hash = ?'; $valores[] = password_hash(clave_ok((string) $cuerpo['contrasena']), PASSWORD_DEFAULT); }

        if (!$cambios) responder(['ok' => true]);
        $valores[] = $id;
        bd()->prepare('UPDATE usuarios SET ' . implode(', ', $cambios) . ' WHERE id = ?')->execute($valores);

        /* Desactivada o con contraseña nueva: lo que tenía abierto deja de
           servir. Si no, quien se va del equipo seguiría entrando desde el
           navegador donde ya tenía la sesión. */
        if ($desactiva || $nuevaClave) {
            // si es la propia, la de este navegador sigue: si no, el panel te echa
            bd()->prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token <> ?')
                ->execute([$id, $id === $yo['id'] ? hash('sha256', trim(clave_recibida())) : '']);
        }
        responder(['ok' => true]);
    }

    responder(['error' => 'No se entiende qué hay que hacer.'], 400);
} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
