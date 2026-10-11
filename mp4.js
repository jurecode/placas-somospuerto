/* Arma un archivo MP4 a partir de video y audio ya comprimidos.
 *
 * WebCodecs entrega los cuadros comprimidos sueltos, sin envoltorio: sabe
 * codificar pero no sabe guardar. Esto es el envoltorio.
 *
 * Un MP4 es un árbol de cajas. Cada caja lleva su largo, cuatro letras con su
 * nombre, y adentro datos o más cajas. Las que hacen falta para un archivo que
 * cualquier reproductor entienda:
 *
 *   ftyp   qué clase de archivo es
 *   mdat   los datos: todos los cuadros, uno detrás de otro
 *   moov   el índice: qué pista, con qué códec, dónde empieza cada cuadro
 *          y cuánto dura
 *
 * Se escribe el índice al final, cuando ya se sabe dónde quedó cada cuadro.
 */

/* ------------------------------------------------------------------ */
/* escribir bytes                                                      */
/* ------------------------------------------------------------------ */

class Cinta {
  constructor(){ this.partes = []; this.largo = 0; }
  bytes(b){ this.partes.push(b); this.largo += b.length; return this; }
  u8(v){ return this.bytes(new Uint8Array([v & 255])); }
  u16(v){ return this.bytes(new Uint8Array([(v >> 8) & 255, v & 255])); }
  u24(v){ return this.bytes(new Uint8Array([(v >> 16) & 255, (v >> 8) & 255, v & 255])); }
  u32(v){
    return this.bytes(new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]));
  }
  /* Los tamaños grandes van en 64 bits. Un video largo pasa los 4 GB de
     índice raras veces, pero la duración en unidades de tiempo sí puede
     pasarse, y ahí el archivo queda ilegible sin aviso. */
  u64(v){
    const alto = Math.floor(v / 4294967296);
    return this.u32(alto).u32(v >>> 0);
  }
  texto(s){ return this.bytes(new TextEncoder().encode(s)); }
  unir(){
    const todo = new Uint8Array(this.largo);
    let i = 0;
    for(const p of this.partes){ todo.set(p, i); i += p.length; }
    return todo;
  }
}

/* Una caja: largo, nombre, contenido. */
function caja(nombre, ...contenido){
  const cuerpo = [];
  let largo = 8;
  for(const c of contenido){
    const b = c instanceof Uint8Array ? c : c.unir();
    cuerpo.push(b); largo += b.length;
  }
  const c = new Cinta().u32(largo).texto(nombre);
  for(const b of cuerpo) c.bytes(b);
  return c.unir();
}

/* Caja con versión y banderas, que muchas llevan adelante. */
function cajaV(nombre, version, banderas, ...contenido){
  return caja(nombre, new Cinta().u8(version).u24(banderas).unir(), ...contenido);
}

/* ------------------------------------------------------------------ */
/* las cajas del índice                                                */
/* ------------------------------------------------------------------ */

/* Reloj interno del archivo. 90000 es lo habitual en video: divide bien los
   cuadros por segundo más comunes y evita redondeos que corran el audio. */
const RELOJ = 90000;

function stts(duraciones){
  // se agrupan las duraciones iguales seguidas, que es como lo espera el formato
  const grupos = [];
  for(const d of duraciones){
    const ultimo = grupos[grupos.length - 1];
    if(ultimo && ultimo.dura === d) ultimo.cuantos++;
    else grupos.push({ cuantos: 1, dura: d });
  }
  const c = new Cinta().u32(grupos.length);
  for(const g of grupos) c.u32(g.cuantos).u32(g.dura);
  return cajaV('stts', 0, 0, c);
}

function stsz(tamanos){
  const c = new Cinta().u32(0).u32(tamanos.length);
  for(const t of tamanos) c.u32(t);
  return cajaV('stsz', 0, 0, c);
}

function stco(posiciones){
  const c = new Cinta().u32(posiciones.length);
  for(const p of posiciones) c.u32(p);
  return cajaV('stco', 0, 0, c);
}

/* Cada cuadro en su propio trozo: es lo más simple y ningún reproductor se
   queja. Ocupa unos bytes más de índice y evita toda la contabilidad de
   agrupar muestras. */
function stsc(){
  return cajaV('stsc', 0, 0, new Cinta().u32(1).u32(1).u32(1).u32(1));
}

/* Cuáles son cuadros clave. Sin esto el reproductor no sabe dónde puede
   saltar y algunos se niegan a abrir el archivo. */
function stss(claves){
  const c = new Cinta().u32(claves.length);
  for(const k of claves) c.u32(k);
  return cajaV('stss', 0, 0, c);
}

function avc1(ancho, alto, avcC){
  const cuerpo = new Cinta()
    .bytes(new Uint8Array(6))   // reservado
    .u16(1)                     // índice de la descripción
    .u16(0).u16(0)              // versión y revisión
    .u32(0).u32(0).u32(0)       // reservado
    .u16(ancho).u16(alto)
    .u32(0x00480000).u32(0x00480000)  // 72 puntos por pulgada
    .u32(0)
    .u16(1)                     // un cuadro por muestra
    .bytes(new Uint8Array(32))  // nombre del compresor, vacío
    .u16(0x0018)                // profundidad de color
    .u16(0xffff);               // sin tabla de colores
  return caja('avc1', cuerpo, caja('avcC', avcC));
}

/* La descripción del audio AAC. El «esds» es un descriptor anidado que viene
   de MPEG-4 y es la parte más quisquillosa del formato. */
/* La descripción del audio, que va en cajas anidadas y cada una declara su
   propio largo. Estaban mal contados: el descriptor del decodificador decía
   medir 15 bytes cuando tenía 17, así que un lector estricto se detenía justo
   antes del trozo que dice la frecuencia y los canales. Los navegadores lo
   adivinan igual —por eso el audio se escuchaba bien en las pruebas— pero
   Instagram rechazaba el archivo sin explicar por qué.
   Y faltaba entero el descriptor de sincronización, que el formato pide.
   Los largos se calculan en vez de escribirse a mano, para que no se vuelvan
   a desfasar si alguien agrega un campo. */
function mp4a(canales, muestreo, config){
  // lo que dice qué audio es: frecuencia, canales, perfil
  const especifico = new Cinta().u8(0x05).u8(config.length).bytes(config);

  const dec = new Cinta()
    .u8(0x04).u8(13 + especifico.largo)
    .u8(0x40)          // audio MPEG-4
    .u8(0x15)          // corriente de audio
    .u24(0)            // tamaño del búfer
    .u32(128000).u32(128000)   // tasa máxima y media; en cero algunos lo rechazan
    .bytes(especifico.unir());

  /* Sin esto el formato queda incompleto. El 0x02 es «el predefinido para MP4»,
     que es lo que corresponde acá. */
  const sincro = new Cinta().u8(0x06).u8(1).u8(0x02);

  const esds = new Cinta()
    .u8(0x03).u8(3 + dec.largo + sincro.largo)
    .u16(1).u8(0)
    .bytes(dec.unir())
    .bytes(sincro.unir());

  const cuerpo = new Cinta()
    .bytes(new Uint8Array(6))
    .u16(1)
    .u32(0).u32(0)
    .u16(canales)
    .u16(16)           // bits por muestra
    .u16(0).u16(0)
    .u32(muestreo * 65536);   // en punto fijo 16.16

  return caja('mp4a', cuerpo, cajaV('esds', 0, 0, esds));
}

function pista(p){
  const esVideo = p.tipo === 'video';
  const tkhd = cajaV('tkhd', 0, 3,   // 3 = existe y se reproduce
    new Cinta()
      .u32(0).u32(0)                 // creado y modificado
      .u32(p.id).u32(0)
      .u32(Math.round(p.duracion * RELOJ))
      .u32(0).u32(0)
      .u16(0).u16(0)                 // capa y grupo
      .u16(esVideo ? 0 : 0x0100)     // volumen
      .u16(0)
      // matriz de transformación: la identidad
      .u32(0x00010000).u32(0).u32(0)
      .u32(0).u32(0x00010000).u32(0)
      .u32(0).u32(0).u32(0x40000000)
      .u32((esVideo ? p.ancho : 0) * 65536)
      .u32((esVideo ? p.alto : 0) * 65536));

  const mdhd = cajaV('mdhd', 0, 0, new Cinta()
    .u32(0).u32(0)
    .u32(p.reloj)
    .u32(p.duracionEnSuReloj)
    .u16(0x55c4)   // idioma «und»
    .u16(0));

  const hdlr = cajaV('hdlr', 0, 0, new Cinta()
    .u32(0).texto(esVideo ? 'vide' : 'soun')
    .u32(0).u32(0).u32(0)
    .texto(esVideo ? 'Video\0' : 'Audio\0'));

  const cabecera = esVideo
    ? cajaV('vmhd', 0, 1, new Cinta().u16(0).u16(0).u16(0).u16(0))
    : cajaV('smhd', 0, 0, new Cinta().u16(0).u16(0));

  const dinf = caja('dinf', cajaV('dref', 0, 0,
    new Cinta().u32(1).bytes(cajaV('url ', 0, 1))));

  const descripcion = esVideo
    ? avc1(p.ancho, p.alto, p.descripcion)
    : mp4a(p.canales, p.muestreo, p.descripcion);

  const stsdCaja = cajaV('stsd', 0, 0, new Cinta().u32(1).bytes(descripcion));

  const tablas = [stsdCaja, stts(p.duraciones), stsc(), stsz(p.tamanos), stco(p.posiciones)];
  if(esVideo && p.claves.length) tablas.splice(2, 0, stss(p.claves));

  return caja('trak', tkhd,
    caja('mdia', mdhd, hdlr,
      caja('minf', cabecera, dinf, caja('stbl', ...tablas))));
}

/* ------------------------------------------------------------------ */
/* armar el archivo                                                    */
/* ------------------------------------------------------------------ */

/* Recibe las pistas ya comprimidas y devuelve el MP4 entero.
 *
 * pistas: { tipo, muestras:[{datos, duracion, clave}], descripcion, … }
 * La duración de cada muestra va en las unidades del reloj de su pista. */
export function armarMp4(pistas){
  // 1. todos los datos, uno detrás de otro, anotando dónde quedó cada uno
  const cuerpo = new Cinta();
  const encabezadoMdat = 8;
  let posicion = 0;

  const preparadas = pistas.map((p, i) => {
    const posiciones = [], tamanos = [], duraciones = [], claves = [];
    p.muestras.forEach((m, n) => {
      posiciones.push(posicion);
      tamanos.push(m.datos.length);
      duraciones.push(m.duracion);
      if(m.clave) claves.push(n + 1);   // se cuentan desde uno
      cuerpo.bytes(m.datos);
      posicion += m.datos.length;
    });
    const total = duraciones.reduce((a, b) => a + b, 0);
    return { ...p, id: i + 1, posiciones, tamanos, duraciones, claves,
             duracionEnSuReloj: total, duracion: total / p.reloj };
  });

  const ftyp = caja('ftyp',
    new Cinta().texto('isom').u32(512).texto('isomiso2avc1mp41').unir());
  /* Las posiciones de cada muestra son absolutas dentro del archivo, así que
     hay que saber dónde va a empezar el mdat. Con el índice al final eso era
     directo: ftyp más la cabecera del mdat.
     Pero el índice va adelante —ver abajo—, y su largo depende de cuántas
     muestras hay. Se arma una vez para medirlo y se vuelve a armar con las
     posiciones corridas: el segundo armado mide exactamente igual, porque
     cada posición ocupa cuatro bytes fijos gane o pierda dígitos. */
  const correr = (cuanto) => {
    for(const p of preparadas) p.posiciones = p.posiciones.map((x) => x + cuanto);
  };
  correr(ftyp.length + encabezadoMdat);

  const duracionTotal = Math.max(...preparadas.map((p) => p.duracion), 0);
  const mvhd = cajaV('mvhd', 0, 0, new Cinta()
    .u32(0).u32(0)
    .u32(RELOJ)
    .u32(Math.round(duracionTotal * RELOJ))
    .u32(0x00010000)   // velocidad normal
    .u16(0x0100)       // volumen
    .u16(0).u32(0).u32(0)
    .u32(0x00010000).u32(0).u32(0)
    .u32(0).u32(0x00010000).u32(0)
    .u32(0).u32(0).u32(0x40000000)
    .u32(0).u32(0).u32(0).u32(0).u32(0).u32(0)
    .u32(preparadas.length + 1));

  /* El índice va delante del contenido, no detrás.
     Instagram lo pide por escrito en su documentación para publicar video
     —«moov atom at the front of the file»— y sin eso rechaza el archivo con
     un ERROR pelado, sin explicar cuál es el problema. Lo mismo vale para
     cualquiera que quiera empezar a reproducir sin bajarlo entero: con el
     índice al final hay que tener todo el archivo antes de mostrar nada.
     Se arma dos veces: la primera para saber cuánto ocupa, la segunda ya con
     las posiciones corridas por ese tanto. */
  const armarMoov = () => caja('moov', mvhd, ...preparadas.map(pista));
  const largoMoov = armarMoov().length;
  correr(largoMoov);
  const moov = armarMoov();
  if(moov.length !== largoMoov){
    // no debería pasar nunca, y si pasara el archivo saldría corrido
    throw new Error('el índice cambió de tamaño al recolocarlo');
  }

  /* El archivo se arma como una lista de pedazos y el Blob los junta una
     sola vez. Antes se juntaban a mano: los cuadros en un bloque, ese bloque
     copiado dentro de la caja mdat, todo eso copiado otra vez en un bloque
     final, y el Blob lo copiaba una última vez. Cuatro copias enteras del
     video en memoria a la vez, que en un teléfono con un reel largo alcanzan
     para que el navegador recargue la página: el «se cayó al subir».
     Los bytes son los mismos; cambia solo cuántas veces se copian. */
  const cabezaMdat = new Cinta().u32(8 + cuerpo.largo).texto('mdat').unir();
  return new Blob([ftyp, moov, cabezaMdat, ...cuerpo.partes], { type: 'video/mp4' });
}

export { RELOJ };

/* ------------------------------------------------------------------ */
/* leer un MP4                                                         */
/* ------------------------------------------------------------------ */

/* Lo simétrico de lo de arriba: recorrer las cajas y sacar de dónde a dónde
 * va cada cuadro comprimido, para poder dárselos al decodificador uno por uno.
 * Solo se leen las tablas que se necesitan; el resto se saltea. */

function recorrer(vista, desde, hasta, alEncontrar){
  let i = desde;
  while(i + 8 <= hasta){
    let largo = vista.getUint32(i);
    const nombre = String.fromCharCode(
      vista.getUint8(i + 1 + 3), vista.getUint8(i + 5), vista.getUint8(i + 6), vista.getUint8(i + 7));
    let contenido = i + 8;
    if(largo === 1){                       // largo en 64 bits
      largo = Number(vista.getBigUint64(i + 8));
      contenido = i + 16;
    }
    if(largo === 0) largo = hasta - i;     // hasta el final
    if(largo < 8) break;
    alEncontrar(nombre, contenido, i + largo);
    i += largo;
  }
}

const CONTENEDORAS = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex'];

/* Devuelve las pistas con sus muestras ya ubicadas. */
/* Un cuadro comprimido, como una ventana sobre el archivo original en vez
 * de una copia. Antes cada cuadro se copiaba: el video quedaba dos veces en
 * memoria —el archivo entero más todos sus cuadros sueltos— durante toda la
 * grabación. El original se tiene que quedar igual hasta el final, así que
 * mirarlo no cuesta nada.
 * Si la tabla de un archivo roto apunta más allá del final, se corta ahí,
 * igual que hacía slice, en vez de tirar un error. */
function pedazo(buffer, desde, largo){
  const ini = Math.min(desde, buffer.byteLength);
  return new Uint8Array(buffer, ini, Math.max(0, Math.min(largo, buffer.byteLength - ini)));
}

/* Un descriptor del esds: etiqueta, y dónde empieza y termina lo suyo.
 * El largo ocupa de 1 a 4 bytes: cada uno aporta 7 bits, y mientras tenga
 * prendido el de arriba sigue el próximo. Apple escribe siempre los 4
 * (80 80 80 02). */
function descriptor(d, i){
  if(i >= d.length) return null;
  const etiqueta = d[i++];
  let largo = 0;
  for(let n = 0; n < 4 && i < d.length; n++){
    const b = d[i++];
    largo = (largo << 7) | (b & 0x7f);
    if(!(b & 0x80)) break;
  }
  return { etiqueta, desde: i, hasta: Math.min(d.length, i + largo) };
}

/* La configuración del AAC, de adentro del esds: ES (0x03) → configuración
 * del decodificador (0x04) → lo específico (0x05).
 * Antes se buscaba el primer byte 0x05 y se tomaba el siguiente como largo.
 * Con los archivos de Apple, donde el largo ocupa cuatro bytes, salían once
 * bytes de basura en vez de los dos de la configuración, y el audio del
 * video armado quedaba sin poder reproducirse —pasaba en los reels hechos
 * con videos de iPhone—. Y un 0x05 cualquiera de más adelante también
 * podía confundirlo. */
function configuracionAac(d){
  const es = descriptor(d, 0);
  if(!es || es.etiqueta !== 0x03) return null;
  let i = es.desde + 2;                 // el número del stream
  const banderas = d[i++];
  if(banderas & 0x80) i += 2;           // depende de otro stream
  if(banderas & 0x40) i += 1 + d[i];    // una dirección
  if(banderas & 0x20) i += 2;           // otro reloj
  const dc = descriptor(d, i);
  if(!dc || dc.etiqueta !== 0x04) return null;
  // tipo de objeto, tipo de stream, búfer y dos tasas: 13 bytes
  for(let j = dc.desde + 13; j < dc.hasta;){
    const x = descriptor(d, j);
    if(!x || x.hasta <= j) break;
    if(x.etiqueta === 0x05) return d.slice(x.desde, x.hasta);
    j = x.hasta;
  }
  return null;
}

/* El nombre del códec HEVC, como lo pide el decodificador:
 * hvc1.<perfil>.<compatibilidad>.<nivel>.<restricciones>, todo sacado de los
 * primeros trece bytes de la configuración (ISO 14496-15, anexo E). Las
 * banderas de compatibilidad van con los bits dados vuelta, y de las
 * restricciones se sacan los ceros del final. */
function codecHevc(c, caja = 'hvc1'){
  if(!c || c.length < 13) return caja === 'hev1' ? 'hev1' : 'hvc1';
  const espacio = c[1] >> 6;
  const nivelAlto = (c[1] >> 5) & 1;
  const perfil = c[1] & 31;
  let compat = ((c[2] << 24) | (c[3] << 16) | (c[4] << 8) | c[5]) >>> 0;
  let vuelta = 0;
  for(let i = 0; i < 32; i++){ vuelta = (vuelta << 1) | (compat & 1); compat >>>= 1; }
  const restricciones = [...c.slice(6, 12)];
  while(restricciones.length && restricciones[restricciones.length - 1] === 0) restricciones.pop();
  return [caja === 'hev1' ? 'hev1' : 'hvc1',
          ['', 'A', 'B', 'C'][espacio] + perfil,
          (vuelta >>> 0).toString(16).toUpperCase(),
          (nivelAlto ? 'H' : 'L') + c[12],
          ...restricciones.map((x) => x.toString(16).toUpperCase())].join('.');
}

/* Lo que dicen los primeros bits de la configuración del AAC. */
function leerConfiguracionAac(c){
  if(!c || c.length < 2) return {};
  const bits = (c[0] << 8) | c[1];
  const tipo = bits >> 11;
  const indice = (bits >> 7) & 15;
  // 31 y 15 son «sigue en los bits de después»: rarísimo, se deja la cabecera
  if(tipo === 31 || indice === 15) return {};
  const tabla = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  return { muestreo: tabla[indice], canales: (bits >> 3) & 15 };
}

export function leerMp4(buffer){
  const vista = new DataView(buffer);
  const pistas = [];
  let actual = null;
  let mdat = null;

  const paso = (nombre, ini, fin) => {
    if(nombre === 'mdat'){ mdat = { ini, fin }; return; }
    if(nombre === 'trak'){
      actual = { tabla: {} };
      pistas.push(actual);
      recorrer(vista, ini, fin, paso);
      return;
    }
    if(CONTENEDORAS.includes(nombre)){ recorrer(vista, ini, fin, paso); return; }
    if(!actual) return;
    const t = actual.tabla;

    if(nombre === 'mdhd'){
      /* En la versión 1 las fechas ocupan 8 bytes cada una, pero el reloj
         sigue siendo de 32: estaba leído como si fuera de 64 y devolvía
         números de billones, con lo que toda duración calculada daba cero.
         La duración sí es de 64, y empieza cuatro bytes antes de donde se la
         buscaba. Se nota solo con archivos que usan esa versión, que son los
         que graba el navegador. */
      const version = vista.getUint8(ini);
      actual.reloj = version === 1 ? vista.getUint32(ini + 20) : vista.getUint32(ini + 12);
      actual.duracion = version === 1
        ? Number(vista.getBigUint64(ini + 24))
        : vista.getUint32(ini + 16);
    }
    if(nombre === 'tkhd'){
      // el número de pista: es con lo que los fragmentos dicen a quién pertenecen
      const version = vista.getUint8(ini);
      actual.id = version === 1 ? vista.getUint32(ini + 20) : vista.getUint32(ini + 12);
    }
    if(nombre === 'hdlr'){
      /* QuickTime —los .mov del iPhone— trae dos por pista: la del medio
         ('vide' o 'soun') y otra de datos ('alis'). Antes cada una pisaba a
         la anterior, quedaba 'alis', y la pista no era ni video ni sonido:
         el lector no encontraba nada en ningún video de iPhone, y el editor
         caía al camino viejo, el que graba a reloj y pierde cuadros. */
      const clase = String.fromCharCode(vista.getUint8(ini + 8), vista.getUint8(ini + 9),
        vista.getUint8(ini + 10), vista.getUint8(ini + 11));
      if(clase === 'vide' || clase === 'soun' || !actual.clase) actual.clase = clase;
    }
    if(nombre === 'stsd'){
      // la descripción está adentro; se busca avcC o esds sin importar dónde
      recorrer(vista, ini + 8, fin, function hondo(n, a, b){
        // H.264 y HEVC: la cabecera del cuadro es la misma
        if(n === 'avc1' || n === 'avc3' || n === 'hvc1' || n === 'hev1'){
          actual.ancho = vista.getUint16(a + 24);
          actual.alto = vista.getUint16(a + 26);
          recorrer(vista, a + 78, b, hondo);
        }else if(n === 'hvcC'){
          /* HEVC, que es lo que graba el iPhone de fábrica. El decodificador
             necesita esta configuración tal cual y un nombre de códec que se
             arma con sus primeros bytes. */
          actual.descripcion = new Uint8Array(buffer.slice(a, b));
          actual.codec = codecHevc(actual.descripcion, n);
        }else if(n === 'mp4a'){
          actual.canales = vista.getUint16(a + 16);
          actual.muestreo = vista.getUint32(a + 24) >>> 16;
          // las versiones 1 y 2 de QuickTime traen 16 y 36 bytes más antes
          // de las cajas de adentro
          const version = vista.getUint16(a + 8);
          recorrer(vista, a + 28 + (version === 1 ? 16 : version === 2 ? 36 : 0), b, hondo);
        }else if(n === 'avcC'){
          actual.descripcion = new Uint8Array(buffer.slice(a, b));
          actual.codec = 'avc1.' + [...actual.descripcion.slice(1, 4)]
            .map((x) => x.toString(16).padStart(2, '0')).join('');
        }else if(n === 'esds'){
          const config = configuracionAac(new Uint8Array(buffer.slice(a + 4, b)));
          if(config){
            actual.descripcion = config;
            /* Canales y frecuencia, de la configuración y no de la cabecera:
               QuickTime pone 2 canales en la cabecera aunque el audio sea
               mono, y lo que mira el reproductor es la configuración. Si
               las dos no coinciden en el archivo que se arma, hay
               reproductores que no lo abren. */
            const { canales, muestreo } = leerConfiguracionAac(config);
            if(canales) actual.canales = canales;
            if(muestreo) actual.muestreo = muestreo;
          }
          actual.codec = 'mp4a.40.2';
        }else if(['wave', 'esds '].includes(n)){
          recorrer(vista, a, b, hondo);
        }
      });
    }
    if(nombre === 'stts'){
      const n = vista.getUint32(ini + 4); const v = [];
      for(let k = 0; k < n; k++){
        v.push([vista.getUint32(ini + 8 + k * 8), vista.getUint32(ini + 12 + k * 8)]);
      }
      t.stts = v;
    }
    if(nombre === 'stsz'){
      const uno = vista.getUint32(ini + 4), n = vista.getUint32(ini + 8); const v = [];
      for(let k = 0; k < n; k++) v.push(uno || vista.getUint32(ini + 12 + k * 4));
      t.stsz = v;
    }
    if(nombre === 'stco' || nombre === 'co64'){
      const n = vista.getUint32(ini + 4); const v = [];
      for(let k = 0; k < n; k++){
        v.push(nombre === 'stco' ? vista.getUint32(ini + 8 + k * 4)
                                 : Number(vista.getBigUint64(ini + 8 + k * 8)));
      }
      t.stco = v;
    }
    if(nombre === 'stsc'){
      const n = vista.getUint32(ini + 4); const v = [];
      for(let k = 0; k < n; k++){
        v.push([vista.getUint32(ini + 8 + k * 12), vista.getUint32(ini + 12 + k * 12)]);
      }
      t.stsc = v;
    }
    if(nombre === 'ctts'){
      /* Cuánto después de decodificarse se muestra cada cuadro. Con cuadros
         B —casi todo lo que sale de un teléfono— el orden en que se guardan
         no es el orden en que se ven.
         Se lee con signo siempre, aunque la norma diga que en la versión 0
         no lo tiene: el iPhone escribe la versión 0 con valores negativos, y
         leídos sin signo daban cuatro mil millones —los cuadros quedaban a
         horas de distancia—. ffmpeg hace lo mismo, por lo mismo. */
      const n = vista.getUint32(ini + 4); const v = [];
      for(let k = 0; k < n; k++){
        v.push([vista.getUint32(ini + 8 + k * 8), vista.getInt32(ini + 12 + k * 8)]);
      }
      t.ctts = v;
    }
    if(nombre === 'stss'){
      const n = vista.getUint32(ini + 4); t.stss = new Set();
      for(let k = 0; k < n; k++) t.stss.add(vista.getUint32(ini + 8 + k * 4));
    }
  };

  /* Los valores por omisión de cada pista, para los archivos fragmentados:
     cuánto dura y cuánto ocupa una muestra cuando el fragmento no lo dice. */
  const porOmision = new Map();
  recorrer(vista, 0, buffer.byteLength, function buscarTrex(n, a, b){
    if(n === 'moov' || n === 'mvex'){ recorrer(vista, a, b, buscarTrex); return; }
    if(n !== 'trex') return;
    porOmision.set(vista.getUint32(a + 4), {
      duracion: vista.getUint32(a + 12),
      tamano:   vista.getUint32(a + 16),
      banderas: vista.getUint32(a + 20),
    });
  });

  recorrer(vista, 0, buffer.byteLength, paso);

  /* Los fragmentos.
     Un MP4 fragmentado no guarda las muestras en el índice del principio sino
     en cajas `moof` repartidas por el archivo, cada una con su pedazo de datos
     al lado. Así los arma el grabador del navegador y varias apps de edición,
     y son la mayoría de los videos que llegan.
     Sin esto el lector devolvía cero muestras y todo el camino rápido se caía
     al lento, que graba a reloj y pierde cuadros: es de ahí que salía el video
     a tirones. */
  const fragmentos = [];
  recorrer(vista, 0, buffer.byteLength, (n, a, b) => {
    if(n === 'moof') fragmentos.push({ ini: a - 8, fin: b });
  });

  for(const frag of fragmentos){
    recorrer(vista, frag.ini + 8, frag.fin, (n, a, b) => {
      if(n !== 'traf') return;
      let pista = null, base = frag.ini, tiempoBase = null;
      let dur = 0, tam = 0, ban = 0, corridas = [];

      recorrer(vista, a, b, (m, x) => {
        if(m === 'tfhd'){
          const f = vista.getUint32(x) & 0xffffff;   // versión y banderas juntas
          let p = x + 4;
          const id = vista.getUint32(p); p += 4;
          pista = pistas.find((q) => q.id === id) || null;
          const om = porOmision.get(id) || {};
          dur = om.duracion || 0; tam = om.tamano || 0; ban = om.banderas || 0;
          if(f & 0x000001){ base = Number(vista.getBigUint64(p)); p += 8; }
          if(f & 0x000002){ p += 4; }
          if(f & 0x000008){ dur = vista.getUint32(p); p += 4; }
          if(f & 0x000010){ tam = vista.getUint32(p); p += 4; }
          if(f & 0x000020){ ban = vista.getUint32(p); p += 4; }
        }
        if(m === 'tfdt'){
          const v = vista.getUint8(x);
          tiempoBase = v === 1 ? Number(vista.getBigUint64(x + 4)) : vista.getUint32(x + 4);
        }
        if(m === 'trun'){
          const f = vista.getUint32(x) & 0xffffff;
          let p = x + 4;
          const cuantas = vista.getUint32(p); p += 4;
          let desplazamiento = 0, primeras = null;
          if(f & 0x000001){ desplazamiento = vista.getInt32(p); p += 4; }
          if(f & 0x000004){ primeras = vista.getUint32(p); p += 4; }
          const lista = [];
          for(let k = 0; k < cuantas; k++){
            let d = dur, t = tam, bb = k === 0 && primeras !== null ? primeras : ban;
            if(f & 0x000100){ d = vista.getUint32(p); p += 4; }
            if(f & 0x000200){ t = vista.getUint32(p); p += 4; }
            if(f & 0x000400){ bb = vista.getUint32(p); p += 4; }
            // cuánto después de decodificarse se muestra: ver ctts
            let cc = 0;
            // con signo siempre, como en ctts: los archivos reales no respetan la versión
            if(f & 0x000800){ cc = vista.getInt32(p); p += 4; }
            lista.push({ duracion: d, tamano: t, banderas: bb, composicion: cc });
          }
          corridas.push({ desde: base + desplazamiento, lista });
        }
      });

      if(!pista) return;
      if(!pista.fragmentadas) pista.fragmentadas = [];
      /* El tiempo de cada muestra. Si el fragmento trae `tfdt` se arranca de
         ahí; si no —y muchos no lo traen— se sigue contando desde donde quedó
         el fragmento anterior. Antes, sin `tfdt`, todas las muestras quedaban
         en el instante cero: el que las consume creía que el video entero
         ocurría a la vez y emitía un solo cuadro. */
      if(pista.finFragmento === undefined) pista.finFragmento = 0;
      let reloj = tiempoBase ?? pista.finFragmento;
      for(const c of corridas){
        let pos = c.desde;
        for(const m of c.lista){
          pista.fragmentadas.push({
            datos: pedazo(buffer, pos, m.tamano),
            tiempo: (reloj ?? 0) + m.composicion,
            duracion: m.duracion,
            // el bit 16 marca «esta no es cuadro clave»
            clave: ((m.banderas >>> 16) & 1) === 0,
          });
          pos += m.tamano;
          reloj += m.duracion;
        }
      }
      pista.finFragmento = reloj;
    });
  }

  // con las tablas se reconstruye dónde empieza cada muestra y cuánto dura
  for(const p of pistas){
    const t = p.tabla;
    if(!t.stsz || !t.stco || !t.stsc || !t.stsz.length){
      // sin índice clásico manda lo que trajeron los fragmentos
      p.muestras = p.fragmentadas || [];
      continue;
    }

    // a qué trozo pertenece cada muestra
    const porTrozo = [];
    for(let i = 0; i < t.stsc.length; i++){
      const desde = t.stsc[i][0], hasta = i + 1 < t.stsc.length ? t.stsc[i + 1][0] : t.stco.length + 1;
      for(let c = desde; c < hasta; c++) porTrozo[c - 1] = t.stsc[i][1];
    }

    const duraciones = [];
    for(const [cuantos, dura] of (t.stts || [])){
      for(let k = 0; k < cuantos; k++) duraciones.push(dura);
    }

    const corrimientos = [];
    for(const [cuantos, cuanto] of (t.ctts || [])){
      for(let k = 0; k < cuantos; k++) corrimientos.push(cuanto);
    }

    const muestras = [];
    let n = 0, tiempo = 0;
    for(let c = 0; c < t.stco.length && n < t.stsz.length; c++){
      let pos = t.stco[c];
      for(let k = 0; k < (porTrozo[c] || 0) && n < t.stsz.length; k++){
        const largo = t.stsz[n];
        const dura = duraciones[n] ?? 0;
        muestras.push({
          datos: pedazo(buffer, pos, largo),
          // la hora en que se muestra, no en la que se decodifica
          tiempo: tiempo + (corrimientos[n] || 0), duracion: dura,
          clave: t.stss ? t.stss.has(n + 1) : true,   // sin stss, todas son clave
        });
        pos += largo; tiempo += dura; n++;
      }
    }
    p.muestras = muestras;
  }

  /* Las muestras siguen en el orden en que se decodifican —es el que pide el
     decodificador—, pero cada una con la hora en que se muestra. Antes la
     hora era la de decodificar: con cuadros B, el decodificador los devolvía
     en orden de pantalla con las horas cambiadas, y al repartirlos en la
     rejilla de 30 por segundo algunos se repetían y otros se perdían. El
     video salía a saltitos aunque el camino rápido anduviera.
     Se corre todo para que el primero que se ve quede en cero: el corrimiento
     de composición suele empezar en un cuadro o dos. */
  for(const p of pistas){
    if(!p.muestras?.length) continue;
    let primero = Infinity;
    for(const m of p.muestras) if(m.tiempo < primero) primero = m.tiempo;
    if(primero !== 0) for(const m of p.muestras) m.tiempo -= primero;
  }

  return {
    video: pistas.find((p) => p.clase === 'vide'),
    audio: pistas.find((p) => p.clase === 'soun'),
  };
}
