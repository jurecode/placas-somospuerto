# Placas Somos Puerto

Generador de placas gráficas para redes sociales de [somospuerto.cl](https://www.somospuerto.cl).
Editor local con vista previa en vivo, base SQLite y exportación a PNG.

## Ver la placa en línea

`index.html` es la placa estática, reproducida en HTML/CSS puro sobre un lienzo
de 3000×3000. Se puede abrir directo o publicar en GitHub Pages.

El **editor** no corre en Pages: necesita Python. Se usa local.

## Correr el editor

```bash
python3 app.py
```

Abre <http://localhost:4173>. Sin dependencias: solo la biblioteca estándar de
Python 3. Para exportar a PNG usa Google Chrome en modo headless; si está en
otra ruta, se le indica con la variable de entorno `CHROME`.

## Cómo funciona

| Archivo | Qué hace |
| --- | --- |
| `plantilla.html` | El diseño. Única fuente de verdad del arte. |
| `app.py` | Servidor, base SQLite, API y exportación. |
| `editor.html` | Panel de control con vista previa en vivo. |
| `index.html` | La placa estática original, congelada. |
| `assets/` | Logo y fotos base. |

Cada medida se escribe con su valor original del lienzo de 3000 px multiplicado
por `--u` (`calc(2364 * var(--u))`), así que cambiando `--s` la placa escala sin
deformarse. Para exportar en alta:

```css
:root { --s: 3000px; }
```

### Dos formatos

- **Noticia**: collage de fotos (tres diseños), etiqueta, titular y filete.
- **Urgente**: fondo rojo degradado a negro, sin fotos, con una palabra en
  Poppins Black que se estira sola hasta llenar el ancho.

### Lo que no está versionado

`placas.db`, `assets/subidas/` y `salida/` quedan fuera del repo: son el
material de trabajo de cada máquina. Al correr `app.py` por primera vez la base
se crea sola con la placa de ejemplo.
