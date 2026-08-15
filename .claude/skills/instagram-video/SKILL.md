---
name: instagram-video
description: Analiza y optimiza videos antes de subirlos a Instagram Reels o Stories, evitando frame rate variable, incompatibilidades de codec y reproducción con tirones.
---

# Optimizar un video para Instagram

Cuando el usuario quiera preparar, exportar, convertir o subir un video a
Instagram, inspeccionar primero el archivo y crear una copia optimizada.

La prioridad, en este orden:

1. Movimiento fluido.
2. Frame rate constante.
3. Evitar cambios innecesarios de frame rate.
4. Compatibilidad amplia con Instagram y dispositivos móviles.
5. Mantener la máxima calidad razonable antes de la recompresión de Instagram.
6. No modificar ni sobrescribir nunca el archivo original.

## Antes de empezar: ¿están las herramientas?

Todo esto depende de `ffmpeg` y `ffprobe`. Comprobarlo antes de prometer nada:

```bash
command -v ffmpeg ffprobe
```

Si no están, decirlo de entrada en vez de fallar a mitad de camino. En macOS:

```bash
brew install ffmpeg
```

## 1. Encontrar el video

Si el usuario da un archivo o una ruta, usar ese. Si hay varios y no aclara
cuál, mostrar los encontrados y elegir el candidato más probable por nombre o
por fecha, diciendo cuál se eligió.

Nunca sobrescribir el original. El archivo generado termina en
`_instagram.mp4`:

```
video_final.mov  →  video_final_instagram.mp4
```

## 2. Inspeccionar antes de convertir

```bash
ffprobe -v error \
  -select_streams v:0 \
  -show_entries stream=codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate \
  -show_entries format=duration,bit_rate,format_name \
  -of json "INPUT"
```

Y el audio:

```bash
ffprobe -v error \
  -select_streams a:0 \
  -show_entries stream=codec_name,sample_rate,channels \
  -of json "INPUT"
```

Informar brevemente: resolución, codec, FPS nominal, FPS promedio, pixel
format, bitrate aproximado, codec de audio y sample rate.

## 3. Detectar posibles causas de tirones

Prestar atención a:

- FPS nominal y promedio distintos —la señal más clara de frame rate variable—
- videos grabados con frame rate variable
- videos de teléfono
- grabaciones de pantalla
- material mezclado de 24 / 25 / 30 / 50 / 60 FPS
- HEVC/H.265 proveniente de teléfonos
- resoluciones no estándar
- videos 4K que van a ser recomprimidos
- pixel formats de 10 bits o HDR
- timelines exportados con un FPS distinto al del material original

No asumir que un bitrate alto significa mayor fluidez. La prioridad es
conseguir timestamps y FPS consistentes.

## Perfil Instagram estable

| | |
|---|---|
| Contenedor | MP4 |
| Video | H.264 |
| Pixel format | yuv420p |
| Resolución vertical | 1080 × 1920 (9:16) |
| Frame rate | 30 FPS constantes |
| Audio | AAC, 48 kHz, 192 kbps |
| GOP | ~2 segundos |
| Fast start | activado |

## Conversión recomendada

Para un Reel o Story estándar:

```bash
ffmpeg -hide_banner -y \
  -i "INPUT" \
  -vf "fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libx264 \
  -preset slow \
  -crf 19 \
  -maxrate 12M \
  -bufsize 24M \
  -profile:v high \
  -level:v 4.1 \
  -pix_fmt yuv420p \
  -g 60 \
  -c:a aac \
  -b:a 192k \
  -ar 48000 \
  -movflags +faststart \
  "OUTPUT_instagram.mp4"
```

## Videos de 60 FPS

No convertir automáticamente todos los 60 FPS a 30 sin analizar el material.

Si el original es realmente 60 FPS constantes y contiene deportes,
desplazamientos rápidos, cámara en movimiento, gaming, acción o paneos
rápidos, ofrecer las dos opciones:

**Compatibilidad** — una versión CFR de 30 FPS.

**Movimiento** — mantener 60 FPS constantes:

```bash
ffmpeg -hide_banner -y \
  -i "INPUT" \
  -vf "fps=60,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libx264 \
  -preset slow \
  -crf 19 \
  -maxrate 16M \
  -bufsize 32M \
  -profile:v high \
  -level:v 4.2 \
  -pix_fmt yuv420p \
  -g 120 \
  -c:a aac \
  -b:a 192k \
  -ar 48000 \
  -movflags +faststart \
  "OUTPUT_instagram_60fps.mp4"
```

Si el problema original son tirones, probar primero la versión de 30 FPS CFR.

## Video horizontal

No recortar contenido automáticamente. Por defecto: mantener todo el
encuadre, escalar proporcionalmente y rellenar el resto del lienzo vertical.

Si el usuario pide explícitamente que ocupe toda la pantalla, se puede hacer
un crop central 9:16:

```bash
-vf "fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
```

## Video HDR o de 10 bits

Si `ffprobe` muestra `yuv420p10le`, BT.2020, HLG, PQ o HDR10, advertir que el
material necesita atención especial. No hacer conversiones HDR → SDR
improvisadas: producen colores lavados o quemados.

Si no hace falta conservar HDR, preparar una versión SDR compatible y
verificar el resultado mirándolo.

## Verificación posterior

Después de crear el archivo, volver a inspeccionarlo:

```bash
ffprobe -v error \
  -select_streams v:0 \
  -show_entries stream=codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate \
  -show_entries format=duration,bit_rate \
  -of json "OUTPUT_instagram.mp4"
```

Comprobar: 1080 × 1920 cuando corresponda, H.264, yuv420p, FPS nominal y
promedio correctos, audio AAC, y duración similar a la del original.

Después reproducir el archivo generado. Si el movimiento se ve entrecortado
en local, no recomendar subirlo todavía.

## Cuándo activar este flujo

Cuando el usuario diga cosas como:

- «Instagram me pega tirones»
- «el Reel va a saltos»
- «el video se traba»
- «se ve fluido en el PC pero mal en Instagram»
- «Instagram me arruina el video»
- «optimiza este video para Instagram»

Primero inspeccionar el archivo. No volver a codificar a ciegas.

## Respuesta final

Al terminar, responder breve:

**Original** — resolución, FPS, codec.

**Instagram** — resolución final, FPS final, codec, tamaño del archivo.

**Diagnóstico** — en una o dos frases, qué característica del original podía
provocar problemas.

**Archivo** — la ruta exacta del MP4 generado.

Nunca afirmar que Instagram no volverá a recomprimir el archivo, ni
garantizar que desaparecerán todos los tirones. El objetivo es entregar un
archivo técnicamente consistente y reducir las causas evitables antes de la
subida.
