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
function mp4a(canales, muestreo, config){
  const dec = new Cinta()
    .u8(0x04).u8(13 + config.length)
    .u8(0x40)          // audio MPEG-4
    .u8(0x15)          // corriente de audio
    .u24(0).u32(0).u32(0)
    .u8(0x05).u8(config.length).bytes(config);

  const esds = new Cinta()
    .u8(0x03).u8(dec.largo + 3)
    .u16(1).u8(0)
    .bytes(dec.unir());

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

  // el ftyp va delante, así que las posiciones se corren por su largo
  const ftyp = caja('ftyp',
    new Cinta().texto('isom').u32(512).texto('isomiso2avc1mp41').unir());
  const desplazamiento = ftyp.length + encabezadoMdat;
  for(const p of preparadas){
    p.posiciones = p.posiciones.map((x) => x + desplazamiento);
  }

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

  const moov = caja('moov', mvhd, ...preparadas.map(pista));
  const datos = cuerpo.unir();
  const mdat = caja('mdat', datos);

  const todo = new Uint8Array(ftyp.length + mdat.length + moov.length);
  todo.set(ftyp, 0);
  todo.set(mdat, ftyp.length);
  todo.set(moov, ftyp.length + mdat.length);
  return new Blob([todo], { type: 'video/mp4' });
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

const CONTENEDORAS = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts'];

/* Devuelve las pistas con sus muestras ya ubicadas. */
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
      const version = vista.getUint8(ini);
      actual.reloj = version === 1 ? Number(vista.getBigUint64(ini + 20)) : vista.getUint32(ini + 12);
      actual.duracion = version === 1 ? Number(vista.getBigUint64(ini + 28)) : vista.getUint32(ini + 16);
    }
    if(nombre === 'hdlr'){
      actual.clase = String.fromCharCode(vista.getUint8(ini + 8), vista.getUint8(ini + 9),
        vista.getUint8(ini + 10), vista.getUint8(ini + 11));
    }
    if(nombre === 'stsd'){
      // la descripción está adentro; se busca avcC o esds sin importar dónde
      recorrer(vista, ini + 8, fin, function hondo(n, a, b){
        if(n === 'avc1' || n === 'avc3'){
          actual.ancho = vista.getUint16(a + 24);
          actual.alto = vista.getUint16(a + 26);
          recorrer(vista, a + 78, b, hondo);
        }else if(n === 'mp4a'){
          actual.canales = vista.getUint16(a + 16);
          actual.muestreo = vista.getUint32(a + 24) >>> 16;
          recorrer(vista, a + 28, b, hondo);
        }else if(n === 'avcC'){
          actual.descripcion = new Uint8Array(buffer.slice(a, b));
          actual.codec = 'avc1.' + [...actual.descripcion.slice(1, 4)]
            .map((x) => x.toString(16).padStart(2, '0')).join('');
        }else if(n === 'esds'){
          // dentro del esds, el descriptor 0x05 es la configuración del AAC
          const d = new Uint8Array(buffer.slice(a + 4, b));
          for(let k = 0; k < d.length - 2; k++){
            if(d[k] === 0x05){ actual.descripcion = d.slice(k + 2, k + 2 + d[k + 1]); break; }
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
    if(nombre === 'stss'){
      const n = vista.getUint32(ini + 4); t.stss = new Set();
      for(let k = 0; k < n; k++) t.stss.add(vista.getUint32(ini + 8 + k * 4));
    }
  };

  recorrer(vista, 0, buffer.byteLength, paso);

  // con las tablas se reconstruye dónde empieza cada muestra y cuánto dura
  for(const p of pistas){
    const t = p.tabla;
    if(!t.stsz || !t.stco || !t.stsc) { p.muestras = []; continue; }

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

    const muestras = [];
    let n = 0, tiempo = 0;
    for(let c = 0; c < t.stco.length && n < t.stsz.length; c++){
      let pos = t.stco[c];
      for(let k = 0; k < (porTrozo[c] || 0) && n < t.stsz.length; k++){
        const largo = t.stsz[n];
        const dura = duraciones[n] ?? 0;
        muestras.push({
          datos: new Uint8Array(buffer.slice(pos, pos + largo)),
          tiempo, duracion: dura,
          clave: t.stss ? t.stss.has(n + 1) : true,   // sin stss, todas son clave
        });
        pos += largo; tiempo += dura; n++;
      }
    }
    p.muestras = muestras;
  }

  return {
    video: pistas.find((p) => p.clase === 'vide'),
    audio: pistas.find((p) => p.clase === 'soun'),
  };
}
