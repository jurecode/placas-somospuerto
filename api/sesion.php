<?php
/* Entrar y salir del editor con una cuenta propia.
 *
 * Antes todo el equipo entraba con una sola clave, la de api/config.php, y
 * no había forma de saber quién había publicado qué. Ahora cada uno tiene
 * su usuario y su contraseña, y lo que publica queda a su nombre.
 *
 * La primera cuenta —la de quien administra— se crea con la clave del
 * sitio, una sola vez. Después las demás las crea esa cuenta desde el panel
 * del equipo. */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
cargar_config();

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = $metodo === 'POST' ? (json_decode(file_get_contents('php://input') ?: '', true) ?: []) : [];
$tarea  = (string) ($cuerpo['tarea'] ?? $_GET['tarea'] ?? '');

/* Para comparar contra algo cuando el usuario no existe: así entrar con un
   usuario inventado tarda lo mismo que con uno real, y no se puede ir
   adivinando cuáles existen por el tiempo de respuesta. */
const HUELLA_DE_NADIE = '$2y$12$BLzw4IrlgEZ1VGCbTTLtceRAt/awQz1w0xLdDUaCvF56eBcni6y5y';

const INTENTOS_MAX = 8;
const INTENTOS_VENTANA = 900;   // 15 minutos

function hay_usuarios(): bool {
    return (int) bd()->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0;
}

/* Lo que se puede contar de una cuenta: nunca su huella. */
function cuenta_publica(array $u): array {
    return ['id' => (int) $u['id'], 'usuario' => $u['usuario'], 'nombre' => $u['nombre'],
            'foto' => $u['foto'], 'rol' => $u['rol']];
}

function abrir_sesion(int $usuarioId): string {
    $token = bin2hex(random_bytes(32));
    $donde = mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 120);
    bd()->prepare('INSERT INTO sesiones (token, usuario_id, creada, usada, donde) VALUES (?, ?, ?, ?, ?)')
        ->execute([hash('sha256', $token), $usuarioId, ahora_utc(), ahora_utc(), $donde]);
    bd()->prepare('UPDATE usuarios SET ultimo_ingreso = ? WHERE id = ?')->execute([ahora_utc(), $usuarioId]);
    return $token;
}

/* El usuario va en minúsculas y sin espacios: «Matias.Jure» y «matias.jure»
   son el mismo, y nadie se queda afuera por una mayúscula. */
function usuario_valido(string $u): string {
    $u = mb_strtolower(trim($u));
    if (!preg_match('/^[a-z0-9._-]{3,40}$/', $u)) {
        responder(['error' => 'El usuario va de 3 a 40 caracteres: letras sin tilde, números, punto, guion o guion bajo.'], 400);
    }
    return $u;
}

function clave_valida(string $c): string {
    if (mb_strlen($c) < 8) responder(['error' => 'La contraseña tiene que tener al menos 8 caracteres.'], 400);
    if (mb_strlen($c) > 200) responder(['error' => 'La contraseña es demasiado larga.'], 400);
    return $c;
}

function nombre_valido(string $n): string {
    $n = trim(preg_replace('/\s+/u', ' ', $n));
    if (mb_strlen($n) < 2) responder(['error' => 'Falta el nombre, el que va a aparecer en las placas.'], 400);
    return mb_substr($n, 0, 80);
}

try {
    /* Sin clave: si ya hay cuentas. Es lo único que dice sin preguntar
       quién es, y lo necesita la pantalla de ingreso para saber si pedir
       usuario y contraseña o la creación de la primera cuenta. */
    if ($tarea === 'estado') {
        responder(['hayUsuarios' => hay_usuarios()]);
    }

    // quién soy
    if ($metodo === 'GET') {
        $quien = exigir_clave();
        if ($quien['sitio']) responder(['sitio' => true, 'hayUsuarios' => hay_usuarios()]);
        responder(['usuario' => cuenta_publica($quien)]);
    }

    if ($metodo !== 'POST') responder(['error' => 'Método no soportado'], 405);

    if ($tarea === 'entrar') {
        $usuario = mb_strtolower(trim((string) ($cuerpo['usuario'] ?? '')));
        // `contrasena` y no `clave`: `clave` es el nombre de la credencial en
        // todos los pedidos, y quien_es() la lee de ahí
        $clave   = (string) ($cuerpo['contrasena'] ?? '');
        $llave   = mb_substr($usuario . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 160);
        $desde   = gmdate('Y-m-d H:i:s', time() - INTENTOS_VENTANA);

        bd()->prepare('DELETE FROM intentos WHERE cuando < ?')->execute([$desde]);
        $st = bd()->prepare('SELECT COUNT(*) FROM intentos WHERE llave = ? AND cuando >= ?');
        $st->execute([$llave, $desde]);
        if ((int) $st->fetchColumn() >= INTENTOS_MAX) {
            responder(['error' => 'Demasiados intentos con este usuario. Esperá 15 minutos y probá de nuevo.'], 429);
        }

        $st = bd()->prepare('SELECT * FROM usuarios WHERE usuario = ?');
        $st->execute([$usuario]);
        $u = $st->fetch() ?: null;
        $bien = password_verify($clave, $u['clave_hash'] ?? HUELLA_DE_NADIE);
        if (!$u || !$bien || !(int) $u['activo']) {
            bd()->prepare('INSERT INTO intentos (llave, cuando) VALUES (?, ?)')->execute([$llave, ahora_utc()]);
            // el mismo mensaje en los tres casos: no se dice cuál falló
            responder(['error' => 'Usuario o contraseña incorrectos.'], 401);
        }
        bd()->prepare('DELETE FROM intentos WHERE llave = ?')->execute([$llave]);
        if (password_needs_rehash($u['clave_hash'], PASSWORD_DEFAULT)) {
            bd()->prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?')
                ->execute([password_hash($clave, PASSWORD_DEFAULT), $u['id']]);
        }
        responder(['token' => abrir_sesion((int) $u['id']), 'usuario' => cuenta_publica($u)]);
    }

    /* La primera cuenta, la de administración. Pide la clave del sitio,
       que es la prueba de que quien la crea es el dueño, y anda una sola
       vez: con una cuenta creada, las demás salen del panel del equipo. */
    if ($tarea === 'primera') {
        if (!es_clave_del_sitio((string) ($cuerpo['clave_sitio'] ?? ''))) {
            responder(['error' => 'La clave del sitio no es la correcta.'], 403);
        }
        if (hay_usuarios()) responder(['error' => 'Ya hay cuentas creadas: entrá con la tuya.'], 409);
        $nombre  = nombre_valido((string) ($cuerpo['nombre'] ?? ''));
        $usuario = usuario_valido((string) ($cuerpo['usuario'] ?? ''));
        $clave   = clave_valida((string) ($cuerpo['contrasena'] ?? ''));
        bd()->prepare('INSERT INTO usuarios (usuario, nombre, clave_hash, rol, activo, creado) VALUES (?, ?, ?, ?, 1, ?)')
            ->execute([$usuario, $nombre, password_hash($clave, PASSWORD_DEFAULT), 'admin', ahora_utc()]);
        $id = (int) bd()->lastInsertId();
        $st = bd()->prepare('SELECT * FROM usuarios WHERE id = ?');
        $st->execute([$id]);
        responder(['token' => abrir_sesion($id), 'usuario' => cuenta_publica($st->fetch())]);
    }

    if ($tarea === 'salir') {
        $token = trim((string) ($cuerpo['clave'] ?? clave_recibida()));
        if (preg_match('/^[a-f0-9]{64}$/', $token)) {
            bd()->prepare('DELETE FROM sesiones WHERE token = ?')->execute([hash('sha256', $token)]);
        }
        responder(['ok' => true]);
    }

    // cambiar la propia contraseña: pide la actual, por si alguien dejó la sesión abierta
    if ($tarea === 'clave') {
        $quien = exigir_clave($cuerpo);
        if ($quien['sitio']) responder(['error' => 'Entrá con tu cuenta para cambiar tu contraseña.'], 400);
        $st = bd()->prepare('SELECT clave_hash FROM usuarios WHERE id = ?');
        $st->execute([$quien['id']]);
        if (!password_verify((string) ($cuerpo['actual'] ?? ''), (string) $st->fetchColumn())) {
            responder(['error' => 'La contraseña actual no es esa.'], 403);
        }
        $nueva = clave_valida((string) ($cuerpo['nueva'] ?? ''));
        bd()->prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?')
            ->execute([password_hash($nueva, PASSWORD_DEFAULT), $quien['id']]);
        // las otras sesiones se cierran: si alguien la sabía, deja de servirle
        $actual = hash('sha256', trim((string) ($cuerpo['clave'] ?? clave_recibida())));
        bd()->prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token <> ?')->execute([$quien['id'], $actual]);
        responder(['ok' => true]);
    }

    responder(['error' => 'No se entiende qué hay que hacer.'], 400);
} catch (Throwable $e) {
    responder(['error' => $e->getMessage()], 500);
}
