#!/usr/bin/env python3
"""Editor de placas Somos Puerto.

Guarda cada placa en SQLite y sirve un editor local con vista previa en vivo.
Sin dependencias: solo la biblioteca estandar de Python 3.

    python3 app.py            # http://localhost:4173
    python3 app.py 8080       # otro puerto
"""

import http.server
import json
import mimetypes
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.parse
from datetime import datetime

RAIZ = os.path.dirname(os.path.abspath(__file__))
BD = os.path.join(RAIZ, "placas.db")
SUBIDAS = os.path.join(RAIZ, "assets", "subidas")
SALIDA = os.path.join(RAIZ, "salida")

CHROME = os.environ.get(
    "CHROME",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)

# Valores medidos sobre el arte original (cover.jpg, 3000x3000).
ORIGINAL = {
    "nombre": "Ignacia Michelson / Sargento Rap",
    "titulo": "Ignacia Michelson\nrecuerda su violenta\nrelación con el cantante\nmexicano Sargento Rap:\n\"Me destruyó\"",
    "etiqueta": "",
    "etiqueta_estilo": "diagonal",
    "formato": "noticia",
    "diseno": "duo-circulo",
    "foto_izq": "assets/foto-izquierda.jpg",
    "foto_der": "assets/foto-derecha.jpg",
    "foto_cen": "assets/foto-central.jpg",
    "foto_izq_ajuste": "completa",
    "foto_der_ajuste": "completa",
    "foto_cen_ajuste": "completa",
    "color_fondo": "#ff6100",
    "color_filete": "#ff9600",
    "etiqueta_fondo": "#ffffff",
    "etiqueta_texto": "#111111",
    "deg_inicio": 47.6,
    "deg_final": 0.933,
    "deg_curva": 1.5,
    "tam_titulo": 143.0,
    "interlinea": 173.0,
}

DISENOS = ("duo-circulo", "duo", "unica")
FORMATOS = ("noticia", "urgente")
AJUSTES = ("completa", "cubrir")
ESTILOS_ETIQUETA = ("diagonal", "pastilla", "bloque", "cinta", "contorno", "filete")

# Valores cerrados: si llega algo fuera de la lista, se descarta.
LISTAS = {
    "formato": FORMATOS,
    "diseno": DISENOS,
    "foto_izq_ajuste": AJUSTES,
    "foto_der_ajuste": AJUSTES,
    "foto_cen_ajuste": AJUSTES,
    "etiqueta_estilo": ESTILOS_ETIQUETA,
}

# Las fotos de fabrica salieron del arte original y traen el circulo blanco
# incrustado, asi que una placa nueva parte con un marcador neutro.
NUEVA = {
    "nombre": "Placa nueva",
    "titulo": "Titular de\nla noticia",
    "foto_izq": "assets/marcador.jpg",
    "foto_der": "assets/marcador.jpg",
    "foto_cen": "assets/marcador.jpg",
}

# Formato "urgente": sin fotos, la bajada chica arriba y una palabra enorme
# que se ajusta sola al ancho.
URGENTE = {
    "formato": "urgente",
    "etiqueta": "Urgente",
    "titulo": "Ahora",
    "color_fondo": "#ee0008",
    "tam_titulo": 900.0,
}

CAMPOS_NUM = {
    "foto_izq_x", "foto_izq_y", "foto_der_x", "foto_der_y",
    "foto_cen_x", "foto_cen_y", "deg_inicio", "deg_final",
    "deg_curva", "tam_titulo", "interlinea",
}
CAMPOS_TXT = {
    "titulo", "etiqueta", "etiqueta_estilo", "diseno", "formato",
    "foto_izq", "foto_der", "foto_cen",
    "foto_izq_ajuste", "foto_der_ajuste", "foto_cen_ajuste",
    "color_fondo", "color_filete", "etiqueta_fondo", "etiqueta_texto",
}
EDITABLES = CAMPOS_NUM | CAMPOS_TXT


# --------------------------------------------------------------------------
# base de datos
# --------------------------------------------------------------------------

ESQUEMA = """
CREATE TABLE IF NOT EXISTS placas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT NOT NULL DEFAULT 'Placa nueva',
  titulo       TEXT NOT NULL DEFAULT '',
  etiqueta     TEXT NOT NULL DEFAULT '',
  etiqueta_estilo TEXT NOT NULL DEFAULT 'diagonal',
  formato      TEXT NOT NULL DEFAULT 'noticia',
  diseno       TEXT NOT NULL DEFAULT 'duo-circulo',

  foto_izq     TEXT NOT NULL DEFAULT '',
  foto_izq_x   REAL NOT NULL DEFAULT 50,
  foto_izq_y   REAL NOT NULL DEFAULT 50,
  foto_izq_ajuste TEXT NOT NULL DEFAULT 'completa',
  foto_der     TEXT NOT NULL DEFAULT '',
  foto_der_x   REAL NOT NULL DEFAULT 50,
  foto_der_y   REAL NOT NULL DEFAULT 50,
  foto_der_ajuste TEXT NOT NULL DEFAULT 'completa',
  foto_cen     TEXT NOT NULL DEFAULT '',
  foto_cen_x   REAL NOT NULL DEFAULT 50,
  foto_cen_y   REAL NOT NULL DEFAULT 50,
  foto_cen_ajuste TEXT NOT NULL DEFAULT 'completa',

  color_fondo    TEXT NOT NULL DEFAULT '#ff6100',
  color_filete   TEXT NOT NULL DEFAULT '#ff9600',
  etiqueta_fondo TEXT NOT NULL DEFAULT '#ffffff',
  etiqueta_texto TEXT NOT NULL DEFAULT '#111111',

  deg_inicio   REAL NOT NULL DEFAULT 47.6,   -- % del collage donde arranca
  deg_final    REAL NOT NULL DEFAULT 0.933,  -- opacidad en el borde inferior
  deg_curva    REAL NOT NULL DEFAULT 1.5,    -- exponente de la curva

  tam_titulo   REAL NOT NULL DEFAULT 143,
  interlinea   REAL NOT NULL DEFAULT 173,

  creada       TEXT NOT NULL DEFAULT '',
  actualizada  TEXT NOT NULL DEFAULT ''
);
"""


def conexion():
    cx = sqlite3.connect(BD)
    cx.row_factory = sqlite3.Row
    return cx


# Columnas agregadas despues de la primera version: se aplican sobre bases
# que ya existen, para no perder las placas guardadas.
MIGRACIONES = [
    ("etiqueta", "TEXT NOT NULL DEFAULT ''"),
    ("diseno", "TEXT NOT NULL DEFAULT 'duo-circulo'"),
    ("etiqueta_fondo", "TEXT NOT NULL DEFAULT '#ffffff'"),
    ("etiqueta_texto", "TEXT NOT NULL DEFAULT '#111111'"),
    ("etiqueta_estilo", "TEXT NOT NULL DEFAULT 'diagonal'"),
    ("foto_izq_ajuste", "TEXT NOT NULL DEFAULT 'completa'"),
    ("foto_der_ajuste", "TEXT NOT NULL DEFAULT 'completa'"),
    ("foto_cen_ajuste", "TEXT NOT NULL DEFAULT 'completa'"),
    ("formato", "TEXT NOT NULL DEFAULT 'noticia'"),
]


def iniciar_bd():
    os.makedirs(SUBIDAS, exist_ok=True)
    os.makedirs(SALIDA, exist_ok=True)
    cx = conexion()
    cx.executescript(ESQUEMA)

    existentes = {f["name"] for f in cx.execute("PRAGMA table_info(placas)")}
    for columna, definicion in MIGRACIONES:
        if columna not in existentes:
            cx.execute("ALTER TABLE placas ADD COLUMN %s %s" % (columna, definicion))

    # el nombre dejo de escribirse a mano: se deriva del titular
    for fila in cx.execute("SELECT id, titulo, nombre FROM placas").fetchall():
        propuesto = nombrar(fila["titulo"])
        if fila["nombre"] != propuesto and not fila["nombre"].endswith("(copia)"):
            cx.execute("UPDATE placas SET nombre = ? WHERE id = ?", (propuesto, fila["id"]))

    vacia = cx.execute("SELECT COUNT(*) AS n FROM placas").fetchone()["n"] == 0
    if vacia:
        ahora = datetime.now().isoformat(timespec="seconds")
        campos = dict(ORIGINAL)
        campos["creada"] = ahora
        campos["actualizada"] = ahora
        cols = ", ".join(campos)
        marks = ", ".join("?" for _ in campos)
        cx.execute(
            "INSERT INTO placas (%s) VALUES (%s)" % (cols, marks),
            list(campos.values()),
        )
    cx.commit()
    cx.close()


def nombrar(titulo):
    """El nombre de la placa sale solo de la primera linea del titular."""
    for linea in str(titulo).split("\n"):
        linea = linea.strip()
        if linea:
            return linea[:60]
    return "Placa sin título"


def leer_placa(pid):
    cx = conexion()
    fila = cx.execute("SELECT * FROM placas WHERE id = ?", (pid,)).fetchone()
    cx.close()
    return dict(fila) if fila else None


def listar_placas():
    """La mas recien editada primero: es la que abre el editor al entrar."""
    cx = conexion()
    filas = cx.execute(
        "SELECT id, nombre, titulo, color_fondo, actualizada"
        " FROM placas ORDER BY actualizada DESC, id DESC"
    ).fetchall()
    cx.close()
    return [dict(f) for f in filas]


def guardar_placa(pid, datos):
    """Actualiza solo los campos conocidos; ignora cualquier otra clave."""
    campos, valores = [], []
    for clave, valor in datos.items():
        if clave not in EDITABLES:
            continue
        if clave in CAMPOS_NUM:
            try:
                valor = float(valor)
            except (TypeError, ValueError):
                continue
        else:
            valor = str(valor)
            if clave in LISTAS and valor not in LISTAS[clave]:
                continue
        campos.append(clave)
        valores.append(valor)
    if not campos:
        return leer_placa(pid)

    if "titulo" in datos:
        campos.append("nombre")
        valores.append(nombrar(datos["titulo"]))

    campos.append("actualizada")
    valores.append(datetime.now().isoformat(timespec="seconds"))
    asignaciones = ", ".join("%s = ?" % c for c in campos)

    cx = conexion()
    cx.execute("UPDATE placas SET %s WHERE id = ?" % asignaciones, valores + [pid])
    cx.commit()
    cx.close()
    return leer_placa(pid)


def crear_placa(desde=None, formato="noticia"):
    base = leer_placa(desde) if desde else None
    ahora = datetime.now().isoformat(timespec="seconds")
    campos = dict(ORIGINAL)
    if base:
        for clave in EDITABLES:
            campos[clave] = base[clave]
    else:
        campos.update(NUEVA)
        if formato == "urgente":
            campos.update(URGENTE)
    campos["nombre"] = nombrar(campos["titulo"])
    campos["creada"] = ahora
    campos["actualizada"] = ahora

    cx = conexion()
    cur = cx.execute(
        "INSERT INTO placas (%s) VALUES (%s)"
        % (", ".join(campos), ", ".join("?" for _ in campos)),
        list(campos.values()),
    )
    cx.commit()
    pid = cur.lastrowid
    cx.close()
    return leer_placa(pid)


def borrar_placa(pid):
    cx = conexion()
    cx.execute("DELETE FROM placas WHERE id = ?", (pid,))
    cx.commit()
    cx.close()


# --------------------------------------------------------------------------
# render
# --------------------------------------------------------------------------

def a_rgb(hex_color):
    h = hex_color.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        h = "ff6100"
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def degradado_css(hex_color, inicio, final, curva, pasos=10):
    """Degradado que funde el collage con el fondo.

    alpha(t) = final * t^curva, con t recorriendo de `inicio`% a 100%.
    Con (47.6, 0.933, 1.5) reproduce exactamente el arte original: esa curva
    se midio sobre el anillo blanco del circulo, que es blanco puro y sirve
    de referencia para despejar el alfa fila por fila.
    Espejo en JS dentro de plantilla.html (window.degradadoCss).
    """
    r, g, b = a_rgb(hex_color)
    stops = ["rgb(%d %d %d / 0) %s%%" % (r, g, b, inicio)]
    for i in range(1, pasos + 1):
        t = i / float(pasos)
        p = inicio + t * (100 - inicio)
        a = final * (t ** curva)
        stops.append("rgb(%d %d %d / %.3f) %.2f%%" % (r, g, b, a, p))
    return "linear-gradient(to bottom, %s)" % ", ".join(stops)


def escapar(texto):
    return (texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def render(placa, lado="min(1080px, 100vw, 100svh)", prefijo="/"):
    """Devuelve el HTML de la placa con todos los valores ya escritos."""
    with open(os.path.join(RAIZ, "plantilla.html"), encoding="utf-8") as f:
        html = f.read()

    lineas = str(placa["titulo"]).split("\n")
    reemplazos = {
        "lado": lado,
        "color_fondo": placa["color_fondo"],
        "color_filete": placa["color_filete"],
        "degradado": degradado_css(
            placa["color_fondo"], placa["deg_inicio"],
            placa["deg_final"], placa["deg_curva"],
        ),
        "tam_titulo": "%g" % placa["tam_titulo"],
        "interlinea": "%g" % placa["interlinea"],
        "diseno": placa["diseno"] if placa["diseno"] in DISENOS else "duo-circulo",
        "formato": placa["formato"] if placa["formato"] in FORMATOS else "noticia",
        "etiqueta": escapar(placa["etiqueta"]),
        "etiqueta_estilo": placa["etiqueta_estilo"],
        "etiqueta_fondo": placa["etiqueta_fondo"],
        "etiqueta_texto": placa["etiqueta_texto"],
        "izq_ajuste": placa["foto_izq_ajuste"],
        "der_ajuste": placa["foto_der_ajuste"],
        "cen_ajuste": placa["foto_cen_ajuste"],
        "izq_x": "%g" % placa["foto_izq_x"], "izq_y": "%g" % placa["foto_izq_y"],
        "der_x": "%g" % placa["foto_der_x"], "der_y": "%g" % placa["foto_der_y"],
        "cen_x": "%g" % placa["foto_cen_x"], "cen_y": "%g" % placa["foto_cen_y"],
        "foto_izq": prefijo + placa["foto_izq"],
        "foto_der": prefijo + placa["foto_der"],
        "foto_cen": prefijo + placa["foto_cen"],
        "logo": prefijo + "assets/logo.png",
        "titulo_html": "<br>\n      ".join(escapar(l) for l in lineas),
        "titulo_plano": escapar(placa["titulo"]),
        "titulo_texto": escapar(" ".join(lineas))[:120],
    }
    for clave, valor in reemplazos.items():
        html = html.replace("{{%s}}" % clave, valor)
    return html


# --------------------------------------------------------------------------
# exportacion
# --------------------------------------------------------------------------

def nombre_archivo(placa):
    base = re.sub(r"[^a-z0-9]+", "-", placa["nombre"].lower()).strip("-")
    return "placa-%d-%s" % (placa["id"], base or "sin-nombre")


def exportar_html(placa):
    """Escribe salida/<nombre>.html con una copia propia de assets/."""
    os.makedirs(SALIDA, exist_ok=True)
    destino_assets = os.path.join(SALIDA, "assets")
    for ruta in (placa["foto_izq"], placa["foto_der"], placa["foto_cen"],
                 "assets/logo.png"):
        origen = os.path.join(RAIZ, ruta)
        if not os.path.exists(origen):
            continue
        destino = os.path.join(SALIDA, ruta)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        if os.path.abspath(origen) != os.path.abspath(destino):
            shutil.copyfile(origen, destino)
    del destino_assets

    ruta = os.path.join(SALIDA, nombre_archivo(placa) + ".html")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(render(placa, prefijo=""))
    return ruta


def exportar_png(placa, lado, puerto, espera=45):
    """Captura la placa con Chrome en modo headless.

    Chrome escribe el PNG en unos segundos pero despues se queda vivo con su
    updater, asi que no lo esperamos: vigilamos el archivo hasta que deja de
    crecer y recien ahi matamos el proceso.
    """
    if not os.path.exists(CHROME):
        raise RuntimeError(
            "No encontré Chrome en %s. Definí la variable de entorno CHROME "
            "con la ruta correcta, o exportá a HTML." % CHROME
        )
    os.makedirs(SALIDA, exist_ok=True)
    ruta = os.path.join(SALIDA, "%s-%dpx.png" % (nombre_archivo(placa), lado))
    if os.path.exists(ruta):
        os.remove(ruta)

    perfil = tempfile.mkdtemp(prefix="placa-chrome-")
    url = "http://127.0.0.1:%d/placa/%d?s=%d" % (puerto, placa["id"], lado)
    proceso = subprocess.Popen(
        [
            CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--no-first-run", "--no-default-browser-check",
            "--disable-background-networking", "--disable-component-update",
            "--user-data-dir=" + perfil,
            "--window-size=%d,%d" % (lado, lado),
            "--virtual-time-budget=8000",
            "--screenshot=" + ruta,
            url,
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        anterior, estables, limite = -1, 0, time.time() + espera
        while time.time() < limite:
            time.sleep(0.4)
            actual = os.path.getsize(ruta) if os.path.exists(ruta) else -1
            if actual > 0 and actual == anterior:
                estables += 1
                if estables >= 2:
                    return ruta
            else:
                estables = 0
            anterior = actual
            if proceso.poll() is not None and os.path.exists(ruta):
                return ruta
        raise RuntimeError("Chrome no generó el PNG en %d s" % espera)
    finally:
        if proceso.poll() is None:
            proceso.kill()
            proceso.wait(timeout=10)
        shutil.rmtree(perfil, ignore_errors=True)


# --------------------------------------------------------------------------
# servidor
# --------------------------------------------------------------------------

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "PlacasSomosPuerto"

    # -- utilidades ------------------------------------------------------

    def responder(self, cuerpo, tipo="text/html; charset=utf-8", codigo=200):
        if isinstance(cuerpo, str):
            cuerpo = cuerpo.encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def json(self, datos, codigo=200):
        self.responder(
            json.dumps(datos, ensure_ascii=False),
            "application/json; charset=utf-8",
            codigo,
        )

    def error(self, mensaje, codigo=400):
        self.json({"error": mensaje}, codigo)

    def cuerpo(self):
        largo = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(largo) if largo else b""

    def cuerpo_json(self):
        try:
            return json.loads(self.cuerpo().decode("utf-8") or "{}")
        except ValueError:
            return None

    def archivo(self, ruta_rel):
        """Sirve un archivo del proyecto, sin salirse de la carpeta."""
        ruta = os.path.abspath(os.path.join(RAIZ, ruta_rel.lstrip("/")))
        if not ruta.startswith(RAIZ + os.sep) or not os.path.isfile(ruta):
            self.error("No encontrado", 404)
            return
        tipo = mimetypes.guess_type(ruta)[0] or "application/octet-stream"
        with open(ruta, "rb") as f:
            self.responder(f.read(), tipo)

    def log_message(self, formato, *args):
        pass  # silencio: el editor hace muchas peticiones

    # -- rutas -----------------------------------------------------------

    def do_GET(self):
        partes = urllib.parse.urlparse(self.path)
        ruta = partes.path
        query = urllib.parse.parse_qs(partes.query)

        if ruta in ("/", "/editor", "/editor.html"):
            return self.archivo("editor.html")

        if ruta == "/api/placas":
            return self.json(listar_placas())

        m = re.fullmatch(r"/api/placas/(\d+)", ruta)
        if m:
            placa = leer_placa(int(m.group(1)))
            return self.json(placa) if placa else self.error("No existe", 404)

        m = re.fullmatch(r"/placa/(\d+)", ruta)
        if m:
            placa = leer_placa(int(m.group(1)))
            if not placa:
                return self.error("No existe", 404)
            lado = query.get("s", [None])[0]
            if lado and lado.isdigit():
                return self.responder(render(placa, lado=lado + "px"))
            return self.responder(render(placa))

        if ruta.startswith("/assets/") or ruta.startswith("/salida/"):
            return self.archivo(ruta)

        if ruta == "/cover.jpg":
            return self.archivo("cover.jpg")

        self.error("No encontrado", 404)

    def do_POST(self):
        partes = urllib.parse.urlparse(self.path)
        ruta = partes.path
        query = urllib.parse.parse_qs(partes.query)

        if ruta == "/api/placas":
            datos = self.cuerpo_json() or {}
            desde = datos.get("desde")
            formato = datos.get("formato", "noticia")
            if formato not in FORMATOS:
                formato = "noticia"
            return self.json(
                crear_placa(int(desde) if desde else None, formato), 201)

        if ruta == "/api/subir":
            nombre = (query.get("nombre", ["foto.jpg"])[0] or "foto.jpg")
            nombre = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(nombre))
            datos = self.cuerpo()
            if not datos:
                return self.error("Archivo vacío")
            if len(datos) > 25 * 1024 * 1024:
                return self.error("Archivo demasiado grande (máx. 25 MB)")
            os.makedirs(SUBIDAS, exist_ok=True)
            nombre = "%d-%s" % (int(time.time()), nombre)
            with open(os.path.join(SUBIDAS, nombre), "wb") as f:
                f.write(datos)
            return self.json({"ruta": "assets/subidas/" + nombre})

        m = re.fullmatch(r"/api/exportar/(\d+)", ruta)
        if m:
            placa = leer_placa(int(m.group(1)))
            if not placa:
                return self.error("No existe", 404)
            formato = query.get("formato", ["png"])[0]
            try:
                if formato == "html":
                    ruta_out = exportar_html(placa)
                else:
                    lado = int(query.get("s", ["1080"])[0])
                    ruta_out = exportar_png(placa, lado, self.server.server_address[1])
            except Exception as e:  # noqa: BLE001 - se muestra tal cual en el editor
                return self.error(str(e), 500)
            return self.json({
                "archivo": os.path.relpath(ruta_out, RAIZ),
                "url": "/" + os.path.relpath(ruta_out, RAIZ),
            })

        self.error("No encontrado", 404)

    def do_PUT(self):
        m = re.fullmatch(r"/api/placas/(\d+)", urllib.parse.urlparse(self.path).path)
        if not m:
            return self.error("No encontrado", 404)
        datos = self.cuerpo_json()
        if datos is None:
            return self.error("JSON inválido")
        placa = guardar_placa(int(m.group(1)), datos)
        return self.json(placa) if placa else self.error("No existe", 404)

    def do_DELETE(self):
        m = re.fullmatch(r"/api/placas/(\d+)", urllib.parse.urlparse(self.path).path)
        if not m:
            return self.error("No encontrado", 404)
        if len(listar_placas()) <= 1:
            return self.error("Tiene que quedar al menos una placa")
        borrar_placa(int(m.group(1)))
        return self.json({"ok": True})


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    iniciar_bd()
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", puerto), Handler)
    print("Editor de placas en http://localhost:%d" % puerto)
    print("Base de datos: %s" % BD)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nChao.")


if __name__ == "__main__":
    main()
