/* La placa con voz: leer el audio, medirlo y armar el video.
 *
 * El video sale de dibujar cada cuadro en el instante exacto que le toca
 * —treinta por segundo, ni uno más ni uno menos— y entregárselo al
 * codificador con su hora puesta. No se graba la pantalla mientras suena:
 * así no importa si el aparato es lento o si se va a otra pestaña, el
 * resultado es siempre el mismo y no tiene tirones.
 *
 * El ecualizador no es decorado: cada barra es una banda de frecuencias de
 * la voz real, medida en el momento de ese cuadro. Las graves van al medio y
 * las agudas a los costados, en espejo.
 */

import { armarMp4, leerMp4, RELOJ } from './mp4.js';
import { VOZ } from './placa.js';

const MUESTREO = 48000;   // Instagram pide 48 kHz como máximo

const SIN_AAC = 'Este navegador no puede pasar ese audio al formato que pide Instagram. '
  + 'Si lo tenés en .m4a anda igual en cualquier lado; si no, probá desde Chrome.';

/* ------------------------------------------------------------------ */
/* leer                                                                */
/* ------------------------------------------------------------------ */

/* Lee un audio suelto (m4a, mp3, ogg, wav, webm) o un video, del que se usa
   solo el sonido. Devuelve las muestras, para medir la voz, y —si ya viene
   en AAC dentro de un MP4— esa pista tal cual: así no se recomprime, que
   siempre pierde algo. */
export async function leerAudio(bytes){
  let aac = null;
  try{
    const { audio } = leerMp4(bytes.slice(0));
    if(audio?.descripcion && audio.muestras?.length) aac = audio;
  }catch(e){ /* no es un MP4: se decodifica igual */ }

  let pcm;
  try{
    // la frecuencia la elige el que decodifica: así todo sale en 48 kHz
    pcm = await new OfflineAudioContext(1, 1, MUESTREO).decodeAudioData(bytes.slice(0));
  }catch(e){
    throw new Error('Este navegador no pudo abrir ese audio. Probá con otro formato '
      + '—.m4a o .mp3— o desde Chrome.');
  }
  if(!pcm.duration) throw new Error('El audio está vacío.');
  return { pcm, aac, duracion: pcm.duration };
}

/* ------------------------------------------------------------------ */
/* medir                                                               */
/* ------------------------------------------------------------------ */

/* Transformada de Fourier en el lugar, para tamaños que son potencia de 2. */
function fft(re, im){
  const n = re.length;
  for(let i = 1, j = 0; i < n; i++){
    let bit = n >> 1;
    for(; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if(i < j){
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for(let largo = 2; largo <= n; largo <<= 1){
    const angulo = -2 * Math.PI / largo;
    const wr = Math.cos(angulo), wi = Math.sin(angulo);
    const mitad = largo >> 1;
    for(let i = 0; i < n; i += largo){
      let cr = 1, ci = 0;
      for(let k = 0; k < mitad; k++){
        const a = i + k, b = a + mitad;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr;        im[a] += vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/* El valor por debajo del cual queda el `p` por uno de la lista. */
function percentil(lista, p){
  const orden = Float32Array.from(lista).sort();
  return orden[Math.min(orden.length - 1, Math.floor(orden.length * p))];
}

/* Mide la voz cuadro por cuadro: para cada uno, cuánto suena cada banda
   (de 0 a 1) y el volumen general, que es lo que hace latir el micrófono.
   Las bandas van de 90 Hz a 6 kHz, que es donde está la voz.
   Cada banda se compara con lo más fuerte que ella misma tuvo en el audio,
   no con las demás: si no, las graves —que en la voz son las que más
   suenan— se comían todo y las de los costados no se movían nunca.
   Al final se suaviza en el tiempo: las barras suben rápido y bajan más
   despacio, que es lo que hace que se vean fluidas y no temblorosas. */
export async function medirVoz(pcm, avisar){
  const ritmo = VOZ.ritmo;
  const B = VOZ.bandas;
  const sr = pcm.sampleRate;

  // en mono: para mirar la voz, los dos canales son lo mismo
  const datos = new Float32Array(pcm.length);
  for(let c = 0; c < pcm.numberOfChannels; c++){
    const canal = pcm.getChannelData(c);
    for(let i = 0; i < datos.length; i++) datos[i] += canal[i] / pcm.numberOfChannels;
  }

  const N = 2048;   // ~43 ms a 48 kHz: lo que dura una sílaba corta
  const hann = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  const bordes = Array.from({ length: B + 1 }, (_, i) => 90 * Math.pow(6000 / 90, i / B));
  const desde = bordes.slice(0, B).map((f) => Math.max(1, Math.floor(f * N / sr)));
  const hasta = bordes.slice(1).map((f, i) => Math.max(desde[i] + 1, Math.floor(f * N / sr)));

  const cuadros = Math.max(1, Math.round(pcm.duration * ritmo));
  const crudo = new Float32Array(cuadros * B);   // en decibeles
  const fuerza = new Float32Array(cuadros);
  const re = new Float32Array(N), im = new Float32Array(N);

  for(let f = 0; f < cuadros; f++){
    const centro = Math.round((f + 0.5) / ritmo * sr);
    const inicio = centro - N / 2;
    let energia = 0;
    for(let j = 0; j < N; j++){
      const v = datos[inicio + j] || 0;
      energia += v * v;
      re[j] = v * hann[j];
      im[j] = 0;
    }
    fuerza[f] = 10 * Math.log10(energia / N + 1e-12);
    fft(re, im);
    for(let b = 0; b < B; b++){
      let p = 0;
      for(let k = desde[b]; k < hasta[b]; k++) p += re[k] * re[k] + im[k] * im[k];
      crudo[f * B + b] = 10 * Math.log10(p / (hasta[b] - desde[b]) + 1e-12);
    }
    if(f % 300 === 299){
      avisar?.(f / cuadros);
      await new Promise((r) => setTimeout(r, 0));   // que la página no se congele
    }
  }

  // el volumen general: de silencio (0) a lo más fuerte del audio (1)
  const techoV = percentil(fuerza, 0.97);
  const pisoV = techoV - 32;
  const volumen = fuerza.map((v) => Math.min(1, Math.max(0, (v - pisoV) / (techoV - pisoV))));

  const bandas = new Float32Array(cuadros * B);
  for(let b = 0; b < B; b++){
    const columna = new Float32Array(cuadros);
    for(let f = 0; f < cuadros; f++) columna[f] = crudo[f * B + b];
    const techo = percentil(columna, 0.96);
    const piso = techo - 38;
    for(let f = 0; f < cuadros; f++){
      const n = Math.min(1, Math.max(0, (columna[f] - piso) / (techo - piso)));
      // sin voz, las barras descansan aunque haya ruido de fondo
      bandas[f * B + b] = Math.pow(n, 1.35) * (0.15 + 0.85 * volumen[f]);
    }
  }

  // subir rápido, bajar despacio
  const suavizar = (lista, paso) => {
    const previo = new Float32Array(paso);
    for(let i = 0; i < lista.length; i++){
      const k = i % paso;
      const v = lista[i];
      previo[k] += (v - previo[k]) * (v > previo[k] ? 0.7 : 0.2);
      lista[i] = previo[k];
    }
  };
  suavizar(bandas, B);
  suavizar(volumen, 1);
  avisar?.(1);
  return { cuadros, bandas, volumen };
}

/* ------------------------------------------------------------------ */
/* armar el video                                                      */
/* ------------------------------------------------------------------ */

/* El audio en AAC para el MP4. Si ya venía así, se usa tal cual. */
function pistaAac(aac){
  return {
    tipo: 'audio', reloj: aac.reloj, canales: aac.canales || 2,
    muestreo: aac.muestreo || aac.reloj, descripcion: aac.descripcion,
    muestras: aac.muestras.map((m) => ({ datos: m.datos, duracion: m.duracion })),
  };
}

/* La configuración del AAC, por si el codificador no la entrega: perfil
   LC, la frecuencia por su número de tabla y los canales. Son dos bytes. */
function configuracionAac(muestreo, canales){
  const tabla = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
  const i = Math.max(0, tabla.indexOf(muestreo));
  const v = (2 << 11) | (i << 7) | (canales << 3);
  return new Uint8Array([v >> 8, v & 255]);
}

async function codificarAac(pcm){
  if(typeof AudioEncoder !== 'function' || typeof AudioData !== 'function') throw new Error(SIN_AAC);
  const canales = Math.min(2, pcm.numberOfChannels);
  const config = { codec: 'mp4a.40.2', sampleRate: pcm.sampleRate, numberOfChannels: canales, bitrate: 160_000 };
  const { supported } = await AudioEncoder.isConfigSupported(config).catch(() => ({}));
  if(!supported) throw new Error(SIN_AAC);

  const muestras = [];
  let descripcion = null, falla = null;
  const enc = new AudioEncoder({
    output: (trozo, meta) => {
      if(meta?.decoderConfig?.description && !descripcion){
        descripcion = new Uint8Array(meta.decoderConfig.description);
      }
      const datos = new Uint8Array(trozo.byteLength);
      trozo.copyTo(datos);
      // cada trozo de AAC son 1024 muestras; se toma lo que diga, por las dudas
      const duracion = Math.round((trozo.duration || 0) * pcm.sampleRate / 1e6) || 1024;
      muestras.push({ datos, duracion });
    },
    error: (e) => { falla = e; },
  });
  enc.configure(config);

  const BLOQUE = 4096;
  const fuentes = Array.from({ length: canales }, (_, c) => pcm.getChannelData(c));
  for(let i = 0; i < pcm.length; i += BLOQUE){
    if(falla) throw falla;
    const n = Math.min(BLOQUE, pcm.length - i);
    const plano = new Float32Array(n * canales);
    for(let c = 0; c < canales; c++) plano.set(fuentes[c].subarray(i, i + n), c * n);
    const trozo = new AudioData({ format: 'f32-planar', sampleRate: pcm.sampleRate,
      numberOfFrames: n, numberOfChannels: canales,
      timestamp: Math.round(i * 1e6 / pcm.sampleRate), data: plano });
    enc.encode(trozo);
    trozo.close();
  }
  await enc.flush();
  enc.close();
  if(falla) throw falla;
  if(!muestras.length) throw new Error(SIN_AAC);
  return {
    tipo: 'audio', reloj: pcm.sampleRate, canales, muestreo: pcm.sampleRate,
    descripcion: descripcion || configuracionAac(pcm.sampleRate, canales), muestras,
  };
}

/* Arma el MP4: cada cuadro dibujado por `pintor` (lo que devuelve
   prepararVoz) con la voz de ese instante, y el audio debajo.
   `cortado()` permite cancelar a mitad de camino. */
export async function grabarVoz({ pintor, medida, audio, ancho, alto, bitrate, avisar, cortado = () => false }){
  if(typeof VideoEncoder !== 'function' || typeof VideoFrame !== 'function'){
    throw new Error('Este navegador no puede armar videos. Probá desde Chrome, o en un iPhone '
      + 'con iOS 17 o más nuevo.');
  }
  const ritmo = VOZ.ritmo;
  const B = VOZ.bandas;
  const total = Math.max(1, Math.round(audio.duracion * ritmo));
  const PASO = 1e6 / ritmo;

  // primero el audio: si este navegador no lo puede convertir, que se sepa
  // ahora y no después de haber armado todo el video
  avisar?.(0, 'Preparando el audio');
  const pistaAudio = audio.aac ? pistaAac(audio.aac) : await codificarAac(audio.pcm);

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d');

  const muestras = [];
  let descripcion = null, falla = null;
  const enc = new VideoEncoder({
    output: (trozo, meta) => {
      if(meta?.decoderConfig?.description && !descripcion){
        descripcion = new Uint8Array(meta.decoderConfig.description);
      }
      const datos = new Uint8Array(trozo.byteLength);
      trozo.copyTo(datos);
      muestras.push({ datos, clave: trozo.type === 'key', tiempo: trozo.timestamp });
    },
    error: (e) => { falla = e; },
  });
  /* Igual que al grabar los reels: por software, porque el codificador por
     hardware puede cambiar su configuración a mitad de camino y un MP4 no
     admite eso. Si este aparato no tiene uno por software, que elija él. */
  const config = { codec: 'avc1.42002a', width: ancho, height: alto, bitrate,
    framerate: ritmo, avc: { format: 'avc' },
    hardwareAcceleration: 'prefer-software', latencyMode: 'quality' };
  const { supported } = await VideoEncoder.isConfigSupported(config).catch(() => ({}));
  if(!supported) delete config.hardwareAcceleration;
  enc.configure(config);

  try{
    for(let f = 0; f < total; f++){
      if(falla) throw falla;
      if(cortado()) throw new Error('Cancelado');
      const i = Math.min(f, medida.cuadros - 1);
      pintor.cuadro(ctx, f / ritmo, medida.bandas.subarray(i * B, i * B + B), medida.volumen[i]);
      const cuadro = new VideoFrame(lienzo, { timestamp: Math.round(f * PASO), duration: Math.round(PASO) });
      // una clave cada dos segundos, para que se pueda saltar dentro del video
      enc.encode(cuadro, { keyFrame: f % (ritmo * 2) === 0 });
      cuadro.close();
      // sin esperar, la cola crece sin límite y el teléfono se queda sin memoria
      while(enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      if(f % 10 === 0){
        avisar?.(f / total * 0.97);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await enc.flush();
  }finally{
    if(enc.state !== 'closed') enc.close();
  }
  if(falla) throw falla;
  if(!descripcion || !muestras.length) throw new Error('El codificador de video no entregó nada.');

  muestras.sort((a, b) => a.tiempo - b.tiempo);
  const porCuadro = Math.round(RELOJ / ritmo);
  avisar?.(0.99);
  return armarMp4([
    { tipo: 'video', reloj: RELOJ, ancho, alto, descripcion,
      muestras: muestras.map((m) => ({ datos: m.datos, clave: m.clave, duracion: porCuadro })) },
    pistaAudio,
  ]);
}
