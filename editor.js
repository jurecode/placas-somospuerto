/* Editor de placas.
 *
 * El dibujo y la exportación pasan enteros por el navegador (placa.js), y
 * las placas y las fotos se guardan en MySQL a través de api/, así que son
 * las mismas desde cualquier dispositivo. */

import { dibujarCierre, dibujarReel as dibujarReelBase, dibujarFoto, esperarTipografias, textoSobre, LIENZO, altoDe, REEL,
         prepararVoz as prepararVozBase, VOZ } from './placa.js';
import * as somosPuerto from './placa.js';
import * as eyey from './dibujo-eyey.js';
import { MARCA } from './marca/marca.js';
import { armarMp4, leerMp4, RELOJ } from './mp4.js';
import { leerAudio, medirVoz, grabarVoz } from './voz.js';

/* Cada medio tiene su dibujante y la marca dice cuál. Lo que se le pasa de
   más —el nombre, el pie— lo ignora el que no lo necesita. */
const DIBUJANTE = { 'eyey': eyey }[MARCA.dibujo] || somosPuerto;
const dibujar = (ctx, datos, fotos, ancho) => DIBUJANTE.dibujar(ctx, datos, fotos, ancho, MARCA);
// el reel y la placa con voz, con la gráfica del medio si la tiene dibujada
const dibujarReel = DIBUJANTE.dibujarReel || dibujarReelBase;
const prepararVoz = DIBUJANTE.prepararVoz
  ? (datos, fotos, ancho, duracion) => DIBUJANTE.prepararVoz(datos, fotos, ancho, duracion, MARCA)
  : prepararVozBase;
/* Qué formatos se ofrecen: los que el dibujante del medio tiene hechos. La
   lista de marca/marca.js queda para los medios sin dibujante propio —en un
   sitio instalado ese archivo no se actualiza nunca, así que un formato
   nuevo nunca aparecería si dependiera solo de él—. */
const FORMATOS = DIBUJANTE.FORMATOS || MARCA.formatos;
const dibujarLamina = (ctx, datos, lamina, foto, logo, ancho) =>
  DIBUJANTE.dibujarLamina(ctx, datos, lamina, foto, logo, ancho, MARCA);

/* El ancho con que Instagram muestra el feed. El alto lo pone el dibujante
   —altoDe(1080) = 1350, el 4:5— porque la proporción es del diseño y no algo
   que cada lugar del editor pueda elegir por su cuenta. */
const ANCHO_FEED = 1080;

/* ------------------------------------------------------------------ */
/* catálogos                                                           */
/* ------------------------------------------------------------------ */

const DISENOS = [
  { id: 'duo-circulo', nombre: 'Dos fotos + círculo',
    svg: '<rect x="1" y="1" width="20" height="28" rx="3"/><rect x="23" y="1" width="20" height="28" rx="3"/><circle cx="22" cy="15" r="9" fill="currentColor" stroke="none" opacity=".85"/>' },
  { id: 'duo', nombre: 'Dos fotos',
    svg: '<rect x="1" y="1" width="20" height="28" rx="3"/><rect x="23" y="1" width="20" height="28" rx="3"/>' },
  { id: 'unica', nombre: 'Una sola foto',
    svg: '<rect x="1" y="1" width="42" height="28" rx="3"/>' },
  { id: 'unica-circulo', nombre: 'Una foto + círculo',
    svg: '<rect x="1" y="1" width="42" height="28" rx="3"/><circle cx="22" cy="15" r="9" fill="currentColor" stroke="none" opacity=".85"/>' },
];

/* Quién es el medio vive en marca/, que es lo único que cambia entre un
   sitio y otro y lo único que el actualizador no toca. */
const PALETA = MARCA.paleta;
const ETIQUETAS = MARCA.etiquetas;
const LOGO = MARCA.logo;
const CIERRE = MARCA.cierre;

const AJUSTES = [['completa', 'Completa', 'Entra entera, no se recorta'],
                 ['cubrir', 'Rellenar', 'Llena el hueco y recorta lo que sobra']];

const FOTOS_POR_DISENO = {
  'duo-circulo':   [['foto_izq', 'Foto izquierda'], ['foto_der', 'Foto derecha'], ['foto_cen', 'Foto del círculo']],
  'duo':           [['foto_izq', 'Foto izquierda'], ['foto_der', 'Foto derecha']],
  'unica':         [['foto_izq', 'Foto de fondo']],
  'unica-circulo': [['foto_izq', 'Foto de fondo'], ['foto_cen', 'Foto del círculo']],
};

const BASE = {
  nombre: 'Placa nueva',
  titulo: 'Titular de\nla noticia',
  etiqueta: 'Noticia',
  formato: 'noticia',
  diseno: 'unica',
  foto_izq: 'assets/marcador.jpg', foto_izq_x: 50, foto_izq_y: 50, foto_izq_ajuste: 'completa',
  foto_der: 'assets/marcador.jpg', foto_der_x: 50, foto_der_y: 50, foto_der_ajuste: 'completa',
  foto_cen: 'assets/marcador.jpg', foto_cen_x: 50, foto_cen_y: 50, foto_cen_ajuste: 'completa',
  color_fondo: '#ff0054',
  color_filete: '#0ae7ae',
  /* Era 62,6, la del arte original. Al agrandar el titular el diseño subió
     el círculo al medio, pero como cada placa nueva guardaba su 62,6, el
     cambio no le llegaba a ninguna: quedaba debajo de las letras. */
  circulo_x: 50, circulo_y: 50,
  laminas: [],            // fotos extra del carrusel; la placa es la primera
  descripcion: '', hashtags: '', colaboradores: '', etiquetados: '',
  // cada medio pisa lo que le corresponde: su cuerpo de letra, sus colores
  ...(MARCA.predeterminados || {}),
};

const MAX_LAMINAS = 8;   // 8 + la placa + el cierre = las 10 que permite Instagram

/* Todo post que no sea un reel termina con la lámina de cierre: el color de
   la paleta y el arte de «síguenos y comparte». Va sola, no se agrega a mano,
   y por eso ocupa uno de los diez lugares de Instagram. */
/* Solo un «cierre: false» explícito lo apaga. La carpeta de la marca no se
   sobrescribe al actualizar —para eso está—, así que un sitio instalado hace
   meses sigue con el valor que tenía el día que se instaló: si la regla
   dependiera de eso, el cierre desaparecería sin motivo visible. */
// el reel y la placa con voz son un solo video: no hay lámina de cierre.
// La urgente tampoco: es un aviso al toque, y el «síguenos» al final le sobra
const llevaCierre = () => !['reel', 'voz', 'urgente'].includes(placa.formato) && CIERRE !== false;

/* El arte del cierre. Puede venir en dos versiones, clara y oscura, porque
   una sola no se lee sobre toda la paleta: la clara desaparece en el fondo
   blanco y la oscura en el negro. Se elige con el mismo criterio con que se
   decide el color del texto sobre un fondo.
   Se prueban varios nombres, incluido el que suele traer el arte recién
   exportado, para no obligar a renombrar antes de subirlo. El primero que
   exista gana; si no hay ninguno, el dibujante arma la lámina solo. */
async function arteDelCierre(){
  const claro = textoSobre(placa.color_fondo || '#000000') === '#ffffff';
  const propio = (typeof CIERRE === 'string' && CIERRE) ? CIERRE : '';
  const candidatos = claro
    ? [propio, 'marca/cierre.png', 'marca/final.png']
    : ['marca/cierre-oscuro.png', 'marca/final.negro.png', propio, 'marca/cierre.png'];
  for(const ruta of candidatos){
    if(!ruta) continue;
    const img = await cargarImagen(ruta);
    if(img) return img;
  }
  return null;
}

const EJEMPLO = {
  ...BASE,
  nombre: 'Ignacia Michelson',
  titulo: 'Ignacia Michelson\nrecuerda su violenta\nrelación con el cantante\nmexicano Sargento Rap:\n"Me destruyó"',
  foto_izq: 'assets/foto-izquierda.jpg',
  foto_der: 'assets/foto-derecha.jpg',
  foto_cen: 'assets/foto-central.jpg',
};

const REELS = {
  ...BASE,
  formato: 'reel',
  titulo: 'Titular del\nreel',
  video: '', portada: '',
};

/* La placa con voz: la de noticia, con un audio que la vuelve video. El
   círculo arranca más arriba: abajo quedaría detrás de la franja del
   reproductor. */
const VOZ_PLACA = {
  ...BASE,
  formato: 'voz',
  titulo: 'Titular del\naudio',
  circulo_y: 30,
  audio: '', audio_nombre: '', audio_dura: 0,
};

const URGENTE = {
  ...BASE,
  formato: 'urgente',
  titulo: 'Ahora',
  color_fondo: '#ee0008',
};

/* ------------------------------------------------------------------ */
/* almacén: MySQL a través de api/                                     */
/* ------------------------------------------------------------------ */

/* La clave viaja en una cabecera y queda solo en este navegador. Se pide en
   una pantalla propia y no con prompt(), que bloquea la página y encima no
   existe en todos los navegadores. */
const clave = () => localStorage.getItem('clave_publicar') || '';

/* Cuando el servidor no manda datos sino una página de error del hosting,
   qué decir. 429 es el límite de pedidos de SiteGround; 5xx, casi siempre,
   un pedido que tardó más de lo que el hosting espera. */
function motivoHttp(status){
  if(status === 429) return 'El hosting frenó los pedidos por un rato (límite de SiteGround). Esperá un minuto y probá de nuevo.';
  if(status >= 500) return `El hosting cortó el pedido (error ${status}). Esperá un minuto y probá de nuevo.`;
  return `Error ${status}`;
}

async function api(ruta, opciones = {}){
  /* Sin credencial no se pregunta nada: el panel de actividad y otros que
     consultan solos arrancan antes de que se sepa si hay sesión, y su 401
     tapaba la pantalla de entrar con un «la sesión venció» que no era. */
  if(!clave()){
    const e = new Error('Todavía no se entró');
    e.esClave = true;
    e.status = 401;
    throw e;
  }
  const res = await fetch(ruta, {
    ...opciones,
    headers: { 'x-clave': clave(), ...(opciones.headers || {}) },
  });
  const datos = await res.json().catch(() => ({}));
  if(res.status === 401){
    // varios pedidos pueden volver con 401 a la vez: la pantalla se arma una sola vez
    if(clave()){
      localStorage.removeItem('clave_publicar');
      pantallaIngreso('La sesión se cerró o venció: entrá de nuevo.');
    }
    // se marca para que el arranque no tape la pantalla de la clave con
    // la de error genérico
    const e = new Error(datos.error || 'Clave incorrecta');
    e.esClave = true;
    e.status = 401;
    throw e;
  }
  if(!res.ok){
    /* El código y lo que mandó el servidor viajan con el error: quien llama
       tiene que poder distinguir «esperá y reintentá» (429, 503) de «esto no
       va a andar nunca» (400, 413). Antes todo llegaba como un texto. */
    const e = new Error(datos.error || motivoHttp(res.status));
    e.status = res.status;
    e.datos = datos;
    e.reintentarEn = Number(res.headers.get('Retry-After')) || 0;
    throw e;
  }
  if(datos && datos.error) throw new Error(datos.error);
  return datos;
}

const listarPlacas  = () => api('api/placas.php').then((d) => d.placas || []);
const leerPlaca     = (id) => api('api/placas.php?id=' + id);
const borrarPlacaBd = (id) => api('api/placas.php?id=' + id, { method: 'DELETE' });

const escribirPlaca = (p) => api('api/placas.php', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ clave: clave(), placa: p }),
});

/* Los videos van de a pedazos: de una sola vez chocaban contra el límite del
   hosting o se cortaban en una conexión móvil, y el editor se quedaba
   esperando para siempre. Cada trozo lleva su propio plazo, así que una
   conexión muerta falla en un minuto en vez de nunca. */
const TROZO = 2 * 1024 * 1024;
const ENTERO_HASTA = 4 * 1024 * 1024;
/* Era 90 s. Como un pedazo que no contesta ahora se reintenta, no hace
   falta esperarlo tanto: 90 s con la barra quieta era justamente el «se
   pega». Dos megas en 60 s son 35 KB/s, menos que un 3G malo. */
const PLAZO_TROZO = 60_000;

/* El hosting limita cuánto se le pide: cuando se pasa, contesta 429 a todo
   el sitio por un rato. Una subida son decenas de pedidos seguidos, así que
   es lo primero que lo dispara, y antes un solo 429 tiraba la subida entera
   —«Error 429»— y había que empezar de cero, que es pedir todavía más.
   Ahora un pedazo rechazado por algo pasajero se espera y se reintenta,
   cada vez un poco más, y la subida sigue desde donde quedó. */
const REINTENTOS = 6;   // 2 + 4 + 8 + 16 + 30 + 30 s: un minuto y medio de margen

/* Lo que vale la pena reintentar: sin respuesta (red caída, plazo vencido),
   saturado (429), el servidor que se cayó un momento (5xx), o «falta un
   pedazo» (409), que se arregla retomando. Una clave mala, un formato que no
   va o un archivo demasiado grande van a fallar igual la próxima vez. */
const pasajero = (e) => !e.status || [408, 409, 425, 429].includes(e.status) || e.status >= 500;

/* Cuánto esperar antes del intento `n`. Si el servidor dice cuánto
   (Retry-After), manda él, pero con tope: un «volvé en una hora» dejaría la
   subida colgada sin que nadie se entere. */
const esperaDe = (n, e) => (e?.reintentarEn
  ? Math.min(60_000, e.reintentarEn * 1000)
  : Math.min(30_000, 2000 * 2 ** n));

/* El mensaje que queda si después de todos los intentos no se pudo. Dice
   cuánto se esperó de verdad: depende de lo que haya pedido el servidor. */
function motivoFinal(e, esperado){
  if(e.status === 429){
    return new Error(`El hosting está limitando los pedidos al sitio (429) y no se liberó `
      + `en ${REINTENTOS} intentos (${Math.round(esperado / 1000)} s esperando). Esperá unos `
      + 'minutos y probá de nuevo; si sigue, es el límite del plan del hosting.');
  }
  return e;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* Sin esto PHP intenta leer el binario como si fuera un formulario y ensucia
   la respuesta con avisos que rompen el JSON. */
const BINARIO = { 'Content-Type': 'application/octet-stream' };

async function conPlazo(ruta, opciones, ms){
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ms);
  try{
    return await api(ruta, { ...opciones, signal: corte.signal });
  }catch(e){
    if(e.name === 'AbortError'){
      throw new Error('El servidor no contestó a tiempo. Puede ser la conexión: probá de nuevo.');
    }
    throw e;
  }finally{ clearTimeout(reloj); }
}

/* `avisar(fraccion, nota)`: la nota llega solo mientras se espera para
   reintentar, para que la barra diga por qué está quieta en vez de parecer
   colgada. Quien no la use puede ignorarla. */
async function guardarFoto(archivo, avisar){
  const arranque = Date.now();
  let reintentos = 0;
  let esperado = 0;   // ms en pausa entre intentos, para decirlo si al final no se pudo
  const contar = (r) => {
    const ms = Date.now() - arranque;
    anotar('subida', { peso: mb(archivo.size), tardo: seg(ms),
      velocidad: (archivo.size / 1048576 / (ms / 1000)).toFixed(2) + ' MB/s',
      ...(reintentos ? { reintentos } : {}) });
    return r;
  };
  const fallo = (e) => {
    anotar('subida cortada', { peso: mb(archivo.size), tardo: seg(Date.now() - arranque),
      porque: String(e.message).slice(0, 120), reintentos, nivel: 'mal' });
    throw e;
  };
  /* Un intento falló por algo pasajero: se anota, se dice en pantalla y se
     espera. Si ya no quedan intentos, el error sigue de largo. */
  const antesDeReintentar = async (e, n, fraccion) => {
    if(!pasajero(e) || n >= REINTENTOS) throw motivoFinal(e, esperado);
    reintentos++;
    const ms = esperaDe(n, e);
    esperado += ms;
    const que = e.status === 429 ? 'el hosting está limitando los pedidos'
      : e.status ? `el servidor contestó ${e.status}` : 'no hubo respuesta';
    anotar('subida reintentada', { intento: n + 1, porque: que,
      espera: seg(ms), va: Math.round(fraccion * 100) + '%', nivel: 'aviso' });
    avisar?.(fraccion, `Pausa: ${que}. Se reintenta en ${Math.round(ms / 1000)} s `
      + `(intento ${n + 1} de ${REINTENTOS}); no hace falta hacer nada.`);
    await dormir(ms);
  };

  try{
    if(archivo.size <= ENTERO_HASTA){
      for(let n = 0; ; n++){
        try{
          return contar(await conPlazo('api/fotos.php',
            { method: 'POST', body: archivo, headers: BINARIO }, PLAZO_TROZO));
        }catch(e){ await antesDeReintentar(e, n, 0); }
      }
    }

    const sesion = (crypto.randomUUID?.() || Math.random().toString(36) + Date.now())
      .replace(/[^a-zA-Z0-9]/g, '');
    /* El servidor dice cuánto tiene y se sigue desde ahí. Así un reintento
       nunca duplica un pedazo ni deja un hueco, y una subida cortada a la
       mitad retoma en vez de empezar de cero. */
    let desde = 0;
    let n = 0;   // intentos fallidos seguidos; vuelve a cero con cada pedazo que entra
    while(desde < archivo.size){
      const pedazo = archivo.slice(desde, desde + TROZO);
      const ultimo = desde + pedazo.size >= archivo.size;
      try{
        const r = await conPlazo(
          `api/fotos.php?trozo=1&sesion=${sesion}&desde=${desde}`
            + (ultimo ? `&fin=1&total=${archivo.size}` : ''),
          { method: 'POST', body: pedazo, headers: BINARIO }, PLAZO_TROZO);
        if(ultimo) return contar(r);
        desde = Number.isFinite(r.recibido) ? r.recibido : desde + pedazo.size;
        n = 0;
        avisar?.(desde / archivo.size);
      }catch(e){
        // «falta algo»: el servidor dice desde dónde, y se sigue sin esperar
        if(e.status === 409 && Number.isFinite(e.datos?.recibido) && n < REINTENTOS){
          anotar('subida retomada', { desde: mb(e.datos.recibido), porque: e.message, nivel: 'aviso' });
          desde = e.datos.recibido;
          n++;
          continue;
        }
        await antesDeReintentar(e, n, desde / archivo.size);
        n++;
      }
    }
    throw new Error('El archivo llegó vacío');
  }catch(e){ return fallo(e); }
}

/* ------------------------------------------------------------------ */
/* estado                                                              */
/* ------------------------------------------------------------------ */

let placa = null;
let guardando = null;
let vista = 0;   // 0 = la placa; 1..n = las fotos del carrusel
const cacheImg = new Map();

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* El hosting servía el HTML con meses de caché, así que el navegador podía
   quedarse con un index.html viejo y este editor.js nuevo. Esa mezcla rompía
   todo: el código busca cosas que en ese HTML todavía no existen. Si falta
   una pieza que este archivo da por hecha, se recarga una sola vez con la
   dirección cambiada, que es lo único que saltea la copia guardada. */
(function refrescarSiElHtmlEsViejo(){
  if(document.getElementById('trabajando')){
    sessionStorage.removeItem('html_refrescado');   // van juntos: nada que hacer
    return;
  }
  if(sessionStorage.getItem('html_refrescado')) return;   // ya se intentó, no dar vueltas
  sessionStorage.setItem('html_refrescado', '1');
  location.replace(location.pathname + '?v=' + Date.now());
})();

/* ------------------------------------------------------------------ */
/* la vista previa en el teléfono                                      */
/* ------------------------------------------------------------------ */

/* Con el teclado abierto, la vista previa entera no dejaba lugar para el
   campo que se estaba escribiendo. Mientras se escribe se achica y se guarda
   lo que no sirve en ese momento; al terminar, vuelve. */
/* Solo los campos donde se escribe, que son los que abren el teclado.
   Antes entraba cualquier INPUT, controles deslizantes incluidos: al tocar
   el de X o el de Y, la vista se achicaba y el panel se corría para
   centrarlo, y el control se iba de abajo del dedo mientras se arrastraba. */
const TIPOS_DE_TEXTO = ['text', 'search', 'email', 'url', 'tel', 'number', 'password'];
const esCampo = (el) => !!el && (el.tagName === 'TEXTAREA'
  || (el.tagName === 'INPUT' && TIPOS_DE_TEXTO.includes(el.type)));
// el teclado que tapa el campo es cosa del teléfono: en la computadora no hay nada que esquivar
const enTelefono = () => matchMedia('(max-width: 900px)').matches;

document.addEventListener('focusin', (ev) => {
  if(!esCampo(ev.target)) return;
  if(!enTelefono()) return;
  document.body.classList.add('escribiendo');
  // ya achicada la vista, el campo puede haber quedado debajo del teclado
  setTimeout(() => ev.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
});

document.addEventListener('focusout', (ev) => {
  if(!esCampo(ev.target)) return;
  // si el foco salta de un campo a otro, no vale la pena agrandar y achicar
  setTimeout(() => {
    if(!esCampo(document.activeElement)) document.body.classList.remove('escribiendo');
  }, 120);
});


/* ------------------------------------------------------------------ */
/* bitácora                                                            */
/* ------------------------------------------------------------------ */

/* Anota lo que pasa al preparar y subir, para poder mirar después por qué
   algo falló o por qué un video salió a tirones. Vive en el navegador, no en
   el servidor: lo que interesa —cuántos cuadros se perdieron, a qué velocidad
   subió, en qué paso se cortó— pasa todo de este lado.
   Se guarda entre visitas porque la falla suele verse cuando ya se recargó. */
const BITACORA = 'bitacora';
const TOPE_BITACORA = 300;

function anotar(evento, datos = {}){
  try{
    const linea = { t: Date.now(), evento, ...datos };
    const libro = leerBitacora();
    libro.push(linea);
    localStorage.setItem(BITACORA, JSON.stringify(libro.slice(-TOPE_BITACORA)));
  }catch(e){ /* si no hay lugar, se sigue sin anotar */ }
}

function leerBitacora(){
  try{ return JSON.parse(localStorage.getItem(BITACORA) || '[]'); }
  catch(e){ return []; }
}

const mb = (bytes) => (bytes / 1048576).toFixed(2) + ' MB';
const seg = (ms) => (ms / 1000).toFixed(1) + 's';

/* ------------------------------------------------------------------ */
/* secciones, en el teléfono                                           */
/* ------------------------------------------------------------------ */

/* Qué falta para poder publicar, por sección. La descripción es obligatoria
   —un post vacío no se puede editar después sin borrarlo— y el reel no es
   reel sin video. Lo que falta se marca en su sección y bloquea el botón. */
function loQueFalta(){
  if(!placa) return [];
  const falta = [];
  if(!String(placa.descripcion || '').trim()){
    falta.push({ seccion: 'texto', que: 'Falta la descripción: es lo que va debajo de la publicación.' });
  }
  if(placa.formato === 'reel' && !fuenteDelReel()){
    falta.push({ seccion: 'fotos', que: 'Falta el video del reel.' });
  }
  if(placa.formato === 'voz' && !placa.audio){
    falta.push({ seccion: 'fotos', que: 'Falta el audio con la voz.' });
  }
  if(!String(placa.titulo || '').trim()){
    falta.push({ seccion: 'titular', que: 'Falta el titular.' });
  }
  return falta;
}

function marcarSeccion(seccion){
  document.querySelectorAll('[data-ir]').forEach((b) => {
    b.classList.toggle('activa', b.dataset.ir === seccion);
  });
}

/* En el teléfono se ve una sección por vez; en la computadora están todas,
   una debajo de otra, y la barra de la izquierda lleva hasta cada una. */
function irA(seccion, suave = false){
  document.body.dataset.seccion = seccion;
  marcarSeccion(seccion);
  localStorage.setItem('seccion', seccion);
  if(enTelefono()){
    /* al cambiar de sección se vuelve arriba: si no, se entra a la mitad.
       Es la página la que se mueve —la placa queda fija arriba—, no el panel. */
    window.scrollTo({ top: 0 });
    return;
  }
  const destino = [...document.querySelectorAll(`.panel fieldset[data-seccion="${seccion}"]`)]
    .find((f) => f.offsetParent !== null);
  if(destino) destino.scrollIntoView({ block: 'start', behavior: suave ? 'smooth' : 'auto' });
}

/* En la computadora la barra marca en qué sección se está mientras se baja:
   la última que ya pasó por arriba. Al llegar al final del panel, la última. */
/* Se calcula en el momento y no esperando al próximo cuadro de pantalla: el
   navegador ya manda el evento a lo sumo una vez por cuadro, y esperar otro
   más dejaba la marca atrasada una sección —o dos, en un equipo cargado—. */
document.querySelector('.panel')?.addEventListener('scroll', (ev) => {
  if(enTelefono()) return;
  const panel = ev.target;
  const visibles = [...panel.querySelectorAll('fieldset[data-seccion]')].filter((f) => f.offsetParent !== null);
  if(!visibles.length) return;
  let actual = visibles[0].dataset.seccion;
  const tope = panel.getBoundingClientRect().top + 90;
  for(const f of visibles){
    if(f.getBoundingClientRect().top <= tope) actual = f.dataset.seccion;
    else break;
  }
  if(panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4){
    actual = visibles[visibles.length - 1].dataset.seccion;
  }
  marcarSeccion(actual);
}, { passive: true });

/* La barra muestra solo las secciones que este formato usa, y marca las que
   tienen algo sin llenar. */
function pintarBarra(){
  const barra = $('#barra');
  if(!barra || !placa) return;
  barra.hidden = false;
  const falta = loQueFalta();
  const urgente = placa.formato === 'urgente';
  const reel = placa.formato === 'reel';
  const voz = placa.formato === 'voz';
  const sobra = { fotos: urgente, etiqueta: urgente, color: urgente,
                  carrusel: reel || voz, titular: false, texto: false, mas: false };

  barra.querySelectorAll('[data-ir]').forEach((b) => {
    b.hidden = !!sobra[b.dataset.ir];
    b.classList.toggle('falta', falta.some((f) => f.seccion === b.dataset.ir));
  });

  // si la sección abierta no existe en este formato, se vuelve al titular
  const actual = document.body.dataset.seccion;
  if(!actual || sobra[actual]) irA('titular');
}

$('#barra')?.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-ir]');
  if(b) irA(b.dataset.ir, true);
});

function verVista(mostrar){
  document.body.classList.toggle('sin_vista', !mostrar);
  localStorage.setItem('sin_vista', mostrar ? '' : '1');
}
/* La lista de lo que hay en curso. Devuelve cuántas cosas hay, que es lo
   que decide cada cuánto volver a preguntar. */
async function pintarEnCurso(){
  const donde = $('#en_curso');
  if(!donde) return 0;
  let lista = [];
  try{
    const { actividad } = await api('api/actividad.php');
    lista = actividad || [];
  }catch(e){
    donde.innerHTML = `<li class="libre">No se pudo consultar: ${esc(e.message)}</li>`;
    return 0;
  }
  if(!lista.length){
    donde.innerHTML = '<li class="libre">Nada en curso.</li>';
    return 0;
  }
  const ahora = Date.now() / 1000;
  donde.innerHTML = lista.map((x) => {
    const hace = Math.max(0, Math.round(ahora - (x.desde || ahora)));
    const mio = x.id === ESTE;
    return `<li class="${mio ? 'propia' : ''}">
      <b>${esc(x.que || 'trabajando')}</b>
      <small>${mio ? 'acá mismo' : 'desde ' + esc(x.donde || 'otro equipo')}
        · hace ${hace < 60 ? hace + ' s' : Math.round(hace / 60) + ' min'}
        ${x.paso ? '· ' + esc(x.paso) : ''}</small>
    </li>`;
  }).join('');
  return lista.length;
}

/* Cada cuánto se pregunta. Era cada cinco segundos, siempre, con la idea de
   que es un pedido diminuto. Diminuto para el navegador: en el servidor
   cada uno arranca PHP y abre la base, y son 720 por hora por pestaña. Una
   computadora con el editor abierto todo el día eran unos 17.000 pedidos
   diarios sin que nadie publicara nada, y el hosting limita justamente la
   cantidad de pedidos: se gastaba el margen que después le faltaba a la
   subida de un video.
   Ahora, sin nada en curso, se pregunta cada 30 s —lo nuevo aparece en
   medio minuto como mucho—; mientras alguien publica, cada 8 s, que es
   cuando interesa seguirlo de cerca. Con la pestaña de fondo no se pregunta,
   y al volver se pregunta en el acto.
   (Antes esto miraba si la sección estaba en pantalla. No funcionaba: la
   sección puede no tener tamaño todavía cuando se la empieza a vigilar, y
   entonces nunca cuenta como visible y la lista no se llena nunca.) */
const CADA_SIN_NADA = 30_000;
const CADA_CON_ALGO = 8_000;
let proximaConsulta = null;
async function vigilarEnCurso(){
  clearTimeout(proximaConsulta);
  const hay = document.hidden ? 0 : await pintarEnCurso();
  proximaConsulta = setTimeout(vigilarEnCurso, hay ? CADA_CON_ALGO : CADA_SIN_NADA);
}
if($('#en_curso')){
  vigilarEnCurso();
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) vigilarEnCurso();
  });
}

$('#encoger')?.addEventListener('click', () => verVista(false));
$('#mostrar_vista')?.addEventListener('click', () => verVista(true));
if(localStorage.getItem('sin_vista')) verVista(false);

function estado(texto, esError){
  if(esError && texto) anotar('error', { que: String(texto).slice(0, 160), nivel: 'mal' });
  const el = $('#estado');
  if(!el) return;
  el.textContent = texto;
  el.classList.toggle('error', !!esError);
}

/* Lo que tarda se avisa en una franja abajo. Antes era un cartel del alto de
   la pantalla, y mientras un video subía no se podía hacer nada más: ni
   escribir el titular, ni empezar la noticia siguiente. La franja deja el
   editor a la vista y a mano.
   `avance` es 0..1 cuando se puede medir; sin número la barra va y viene.
   Cada cosa que tarda se abre con abrirTrabajo() y se cierra con
   cerrarTrabajo(), siempre desde un finally. */

/* Se cuentan, porque ahora sí pueden solaparse: como la franja no traba nada,
   se puede mandar una foto mientras otra va por la mitad. Sin contarlas, la
   primera en terminar apagaba el aviso de la que seguía y parecía que se
   había colgado. */
let enCurso = 0;
let ultimoRotulo = '';      // para poder rehacerlo cuando cambia la cuenta
let avisoAbierto = false;   // un error se queda hasta que lo lean

/* Procesar un video puede tardar minutos. Sin una salida, cualquier atasco
   dejaba el editor sin forma de recuperarse salvo recargar. */
let pedidoCortar = false;
const cortaron = () => pedidoCortar;
$('#cortar_trabajo')?.addEventListener('click', () => {
  if(avisoAbierto){                       // era un error, no algo en marcha
    avisoAbierto = false;
    return pintarTrabajo();
  }
  pedidoCortar = true;
  trabajo('Cortando…', null, 'Termina en unos segundos.');
});

/* Se muestra mientras haya algo en curso o un error sin leer. */
function pintarTrabajo(){
  const caja = $('#trabajando');
  if(!caja) return;
  const hay = enCurso > 0 || avisoAbierto;
  caja.hidden = !hay;
  document.body.classList.toggle('hay-trabajo', hay);
  // con dos cosas a la vez el rótulo solo nombra una, así que lo aclara. Se
  // rehace acá y no solo al avisar: si no, al terminar la primera quedaba
  // diciendo «2 en curso» hasta el aviso siguiente, que puede no llegar.
  if(hay && !avisoAbierto && ultimoRotulo){
    $('#trabajando_que').textContent =
      enCurso > 1 ? `${ultimoRotulo} · ${enCurso} cosas en curso` : ultimoRotulo;
  }
}

function abrirTrabajo(){
  if(enCurso === 0){
    pedidoCortar = false;                 // arranca algo nuevo
    avisoAbierto = false;
    ultimoRotulo = '';                    // el de la vez pasada ya no vale
    const riel = $('#trabajando')?.querySelector('.trabajando__riel');
    if(riel) riel.hidden = false;
    const salir = $('#cortar_trabajo');
    if(salir) salir.textContent = 'Cancelar';
  }
  enCurso++;
  pintarTrabajo();
}

function trabajo(texto, avance, pista){
  const caja = $('#trabajando');
  // si el HTML es viejo no hay dónde mostrarlo: se avisa abajo y se sigue
  if(!caja){
    return estado(texto + (typeof avance === 'number' ? ` ${Math.round(avance * 100)}%` : '…'));
  }
  ultimoRotulo = texto;
  if(enCurso === 0) abrirTrabajo();       // por si alguien avisa sin abrir
  else pintarTrabajo();
  const medible = typeof avance === 'number' && isFinite(avance);
  const pct = $('#trabajando_pct');
  pct.hidden = !medible;
  if(medible) pct.textContent = Math.round(Math.min(1, Math.max(0, avance)) * 100) + '%';
  const barra = $('#trabajando_barra');
  barra.classList.toggle('sinmedida', !medible);
  barra.style.width = medible ? Math.round(avance * 100) + '%' : '';
  if(pista !== undefined) $('#trabajando_pista').textContent = pista || '';
  ultimoPaso = texto;
}

function cerrarTrabajo(){
  enCurso = Math.max(0, enCurso - 1);
  pintarTrabajo();
}

/* Un problema que hay que ver sí o sí. Sin esto, perder el video se avisaba
   en una línea de 11 px al pie del panel, que en el teléfono ni se ve.
   Queda hasta que lo cierren: no lo tapa lo que venga después. */
function aviso(titulo, detalle){
  const caja = $('#trabajando');
  if(!caja) return estado(titulo + ': ' + detalle, true);
  avisoAbierto = true;
  pintarTrabajo();
  $('#trabajando_que').textContent = titulo;
  $('#trabajando_pct').hidden = true;
  $('#trabajando_pista').textContent = detalle || '';
  caja.querySelector('.trabajando__riel').hidden = true;
  $('#cortar_trabajo').textContent = 'Entendido';
}

/* ------------------------------------------------------------------ */
/* qué se está haciendo, visto desde cualquier lado                    */
/* ------------------------------------------------------------------ */

/* El aviso de «esperá que termine» miraba solo esta pestaña. Con dos
   abiertas, o publicando desde el teléfono y desde la computadora al mismo
   tiempo, ninguna se enteraba de la otra y las dos publicaciones se pisaban.
   Ahora lo que está en curso se anota en el servidor y lo ven todos. */
const ESTE = (crypto.randomUUID?.() || Math.random().toString(36).slice(2))
  .replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);

/* De dónde sale: alcanza para saber si el otro que está publicando sos vos
   en otra pestaña o alguien más en otro aparato. */
const AQUI = (() => {
  const a = navigator.userAgent;
  const que = /iPhone|iPad/.test(a) ? 'un iPhone'
            : /Android/.test(a) ? 'un Android'
            : /Macintosh/.test(a) ? 'una Mac'
            : /Windows/.test(a) ? 'un Windows' : 'otro equipo';
  return que;
})();

let latido = null;
async function anotarActividad(que, paso, desde){
  try{
    await api('api/actividad.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: clave(), tarea: 'anotar', id: ESTE, que, paso, donde: AQUI, desde }),
    });
  }catch(e){ /* que no falle publicar por no poder anotar */ }
}

function empezarActividad(que){
  const desde = Math.round(Date.now() / 1000);
  anotarActividad(que, '', desde);
  clearInterval(latido);
  // se refresca cada tanto: lo anotado caduca solo si el navegador se cierra
  latido = setInterval(() => anotarActividad(que, ultimoPaso, desde), 20000);
}

let ultimoPaso = '';
function terminarActividad(){
  clearInterval(latido); latido = null;
  ultimoPaso = '';
  api('api/actividad.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: clave(), tarea: 'borrar', id: ESTE }),
  }).catch(() => {});
}

/* Lo que hay en curso ahora mismo, sin contar lo de esta pestaña. */
async function otrosPublicando(){
  try{
    const { actividad } = await api('api/actividad.php');
    return (actividad || []).filter((x) => x.id !== ESTE);
  }catch(e){ return []; }
}

/* Publicar, programar y descargar dibujan con lo que la placa tiene en ese
   momento: el titular, los colores, las fotos. Si se pudiera seguir editando
   mientras corren, una lámina saldría con el texto viejo y la siguiente con
   el nuevo, y eso no se ve hasta que ya está publicado. Así que esas —y solo
   esas— dejan el formulario quieto. Subir archivos no dibuja nada y no entra
   acá: ahí se sigue trabajando encima. */
function congelar(si){
  document.body.classList.toggle('congelado', !!si);
}

/* El hosting sirve las imágenes con un año de caché y no hace caso al
   .htaccess, así que un logo cambiado seguía viéndose viejo en el teléfono
   por más que se actualizara el sitio. Se les cuelga el número de versión:
   para el navegador es otra dirección y la pide de nuevo.
   Las fotos subidas no lo llevan: cada una tiene su propio nombre y nunca
   cambia de contenido. */
const VERSION = 'dev';   // el paquete la reemplaza por el número de la versión
const recurso = (ruta) => (/^(assets|marca)\//.test(String(ruta)) ? `${ruta}?v=${VERSION}` : ruta);

/* Las fotos son rutas del propio sitio ("assets/…" o "fotos/…"). */
async function cargarImagen(ref){
  if(!ref) return null;
  if(cacheImg.has(ref)) return cacheImg.get(ref);
  const url = recurso(ref);
  const img = await new Promise((listo) => {
    const i = new Image();
    i.onload = () => listo(i);
    i.onerror = () => listo(null);
    i.src = url;
  });
  cacheImg.set(ref, img);
  return img;
}

async function imagenesDe(p){
  const [izq, der, cen, logo] = await Promise.all([
    cargarImagen(p.foto_izq), cargarImagen(p.foto_der),
    cargarImagen(p.foto_cen), cargarImagen(LOGO),
  ]);
  return { izq, der, cen, logo, firma };
}

/* ------------------------------------------------------------------ */
/* dibujo                                                              */
/* ------------------------------------------------------------------ */

let pendiente = null;
let bucleReel = null;   // redibuja la capa de texto mientras el reel se mueve

/* Un video del carrusel se veía como una foto quieta: la portada. Así no
   había forma de saber qué quedaba dentro del 4:5 ni cómo se movía, y eso
   recién se descubría publicado.
   Ahora la previa lo reproduce, y lo dibuja con dibujarLamina —la misma
   función que genera lo que se sube—, así que lo que se ve es literalmente
   lo que se va a publicar. Si se usara CSS para recortar serían dos recortes
   distintos y tarde o temprano dejarían de coincidir. */
let bucleLamina = null;
let videoLamina = null;
/* Cada dibujo se lleva un número. El bucle que pinta los cuadros compara el
   suyo contra el último antes de pedir el siguiente y se apaga si ya no es el
   vigente. Sin esto, mover un deslizador —que redibuja— dejaba el bucle
   anterior corriendo y arrancaba otro encima: a los pocos toques había media
   docena pintando el mismo lienzo. */
let generacionLamina = 0;

function soltarVideoLamina(){
  if(bucleLamina){ cancelAnimationFrame(bucleLamina); bucleLamina = null; }
  if(videoLamina){
    videoLamina.pause();
    videoLamina.removeAttribute('src');
    videoLamina.load();
    videoLamina.remove();
    videoLamina = null;
  }
}

/* Devuelve el <video> listo para dibujar, o null si no llegó a haber imagen.
   Va colgado de la página aunque no se vea: iOS no decodifica un <video>
   suelto y se queda clavado en el primer cuadro. */
async function videoParaPrevia(ruta){
  if(videoLamina && videoLamina.dataset.ruta === ruta) return videoLamina;
  soltarVideoLamina();
  const v = document.createElement('video');
  v.dataset.ruta = ruta;
  v.src = ruta;
  v.muted = true;            // sin esto el navegador no lo deja arrancar solo
  v.loop = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  Object.assign(v.style, {
    position: 'fixed', left: '0', top: '0', width: '2px', height: '2px',
    opacity: '0.01', pointerEvents: 'none', zIndex: '-1',
  });
  document.body.appendChild(v);
  videoLamina = v;
  const listo = await new Promise((ok) => {
    v.onloadeddata = () => ok(true);
    v.onerror = () => ok(false);
    setTimeout(() => ok(v.readyState >= 2), 4000);
  });
  if(!listo) return null;
  await v.play().catch(() => {});
  return v;
}

/* Se juntan varios cambios seguidos en un solo dibujo. Con setTimeout y no
   con requestAnimationFrame a propósito: rAF no corre si la pestaña está
   en segundo plano y la vista previa quedaría congelada. */
function repintar(){
  detenerVoz();   // si estaba sonando, lo que se ve ya no corresponde
  clearTimeout(pendiente);
  clearInterval(bucleReel);   // si había una capa animándose, se rearma abajo
  bucleReel = null;
  if(bucleLamina){ cancelAnimationFrame(bucleLamina); bucleLamina = null; }
  pendiente = setTimeout(async () => {
    // el número de este dibujo. Se toma acá y no antes: entre que se pidió el
    // repintado y que corre puede haberse pedido otro
    const mia = ++generacionLamina;
    try{
      const lienzo = $('#previa');
      const esReel = placa.formato === 'reel';
      // el reel es 9:16 y la placa 4:5, así que el lienzo cambia de forma
      const anchoQuiere = esReel ? REEL.ancho : ANCHO_FEED;
      const altoQuiere  = esReel ? REEL.alto : altoDe(ANCHO_FEED);
      if(lienzo.width !== anchoQuiere || lienzo.height !== altoQuiere){
        lienzo.width = anchoQuiere;
        lienzo.height = altoQuiere;
        lienzo.style.aspectRatio = `${anchoQuiere} / ${altoQuiere}`;
      }
      const ctx = lienzo.getContext('2d');
      /* El video se guarda crudo y el texto se dibuja encima, así se ve
         cambiar mientras se escribe. Las placas hechas antes traen el video
         ya quemado (sin reel_crudo): esas se muestran tal cual, porque si
         no el titular saldría dos veces.
         El reproductor puede faltar si el navegador se quedó con un
         index.html viejo en la caché: ahí se dibuja el lienzo y ya. */
      const reproductor = $('#previa_video');
      const fuente = esReel ? fuenteDelReel() : '';
      const conVideo = esReel && !!fuente && !!reproductor;
      const crudo = conVideo && !!placa.reel_crudo;
      // el lienzo nunca se esconde: es lo que le da tamaño al marco, y el
      // video va estirado por debajo
      if(reproductor){
        reproductor.hidden = !conVideo;
        if(conVideo && !reproductor.src.endsWith(fuente)){
          reproductor.src = fuente;
          reproductor.play().catch(() => {});
        }
        if(!conVideo && reproductor.src){ reproductor.pause(); reproductor.removeAttribute('src'); }
      }
      if(esReel){
        soltarVideoLamina();
        if(crudo){
          const logo = await cargarImagen(LOGO);
          // solo se redibuja cuando el momento de la animación cambió: pasado
          // el primer segundo la capa queda quieta y no gasta nada
          let ultimo = -1;
          const encima = () => {
            const a = Math.min(1, (reproductor.currentTime || 0) / ANIMACION);
            if(a === ultimo) return;
            ultimo = a;
            dibujarReel(ctx, placa, null, logo, REEL.ancho, REEL.alto, a, true, firma);
          };
          encima();
          bucleReel = setInterval(encima, 80);
        }else if(conVideo){
          ctx.clearRect(0, 0, lienzo.width, lienzo.height);   // ya viene quemado
        }else{
          dibujarReel(ctx, placa, await cargarImagen(placa.portada),
            await cargarImagen(LOGO), REEL.ancho, REEL.alto, 1, false, firma);
        }
        await pintarTira();
        return;
      }
      if(placa.formato === 'voz'){
        soltarVideoLamina();
        /* Se muestra el momento en que el titular ya entró, con la voz de
           ese instante. Si el audio todavía no se midió —la placa se abrió
           otro día—, se mide de fondo y se vuelve a dibujar; mientras tanto
           van barras de muestra. */
        const voz = vozEnMemoria();
        const dura = voz ? voz.audio.duracion : (placa.audio_dura || 12);
        const pintor = prepararVoz(placa, await imagenesDe(placa), lienzo.width, dura);
        const t = Math.min(dura, pintor.finEntrada + 0.6);
        if(voz) pintor.cuadro(ctx, t, ...vozEn(voz, t));
        else pintor.cuadro(ctx, t);
        if(!voz && placa.audio){
          vozDePlaca().then(() => { if(mia === generacionLamina) repintar(); }).catch(() => {});
        }
        await pintarTira();
        return;
      }
      const laminas = placa.laminas || [];
      const conCierre = llevaCierre() && laminas.length + 2 <= 10;
      const ultima = laminas.length + (conCierre ? 1 : 0);
      if(vista > ultima) vista = 0;
      if(vista === 0){
        soltarVideoLamina();
        dibujar(ctx, placa, await imagenesDe(placa), lienzo.width);
      }else if(conCierre && vista === ultima){
        soltarVideoLamina();
        dibujarCierre(ctx, placa, await arteDelCierre(), lienzo.width);
      }else{
        const lam = laminas[vista - 1];
        const logo = await cargarImagen(LOGO);
        const enMovimiento = lam.tipo === 'video' && lam.crudo
          ? await videoParaPrevia(recurso(lam.crudo)) : null;
        if(enMovimiento && mia === generacionLamina){
          // se redibuja al ritmo de la pantalla; cuesta unos 4 ms el cuadro
          const cuadro = () => {
            if(mia !== generacionLamina) return;   // ya hay un dibujo más nuevo
            pintarLamina(ctx, lam, enMovimiento, logo, lienzo.width);
            bucleLamina = requestAnimationFrame(cuadro);
          };
          cuadro();
        }else if(!enMovimiento){
          soltarVideoLamina();
          pintarLamina(ctx, lam, await cargarImagen(lam.foto), logo, lienzo.width);
        }
      }
      await pintarTira();
    }catch(e){
      estado('No se pudo dibujar: ' + e.message, true);
      console.error(e);
    }
  }, 16);
}

function bajar(blob, nombre){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const baseNombre = () => (placa.nombre || 'placa').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'placa';

/* Instagram solo acepta JPEG, así que el carrusel sale en ese formato y a
   1080 x 1350, que es el 4:5 con que muestra el feed. */
/* Miniaturas de todas las láminas, en orden, como van a salir en el feed. */
async function pintarTira(){
  const laminas = placa.laminas || [];
  const tira = $('#tira');
  if(placa.formato === 'reel'){
    $('#rotulo_tira').textContent = fuenteDelReel() ? 'Reel · un video vertical' : 'Reel · falta el video';
    tira.innerHTML = '';
    const compartirR = $('#compartir');
    if(compartirR) compartirR.hidden = true;
    // en el reel el video se baja con su propio botón, no con el del carrusel
    $('#bajar_videos').hidden = true;
    return;
  }
  if(placa.formato === 'voz'){
    $('#rotulo_tira').textContent = placa.audio
      ? `Voz · un video 4:5 de ${enMinutos(placa.audio_dura || 0)}` : 'Voz · falta el audio';
    tira.innerHTML = '';
    const compartirV = $('#compartir');
    if(compartirV) compartirV.hidden = true;
    $('#bajar_videos').hidden = true;
    return;
  }
  const compartir = $('#compartir');
  if(compartir) compartir.hidden = !navigator.canShare;
  // solo tiene sentido ofrecerlo si hay algún video que mirar
  $('#bajar_videos').hidden = !laminas.some((l) => l.tipo === 'video');

  // el cierre va siempre al final, y se muestra acá para que no sea una
  // sorpresa al publicar: lo que se ve en la tira es lo que sale
  const cierre = llevaCierre() && laminas.length + 2 <= 10;
  const cuantas = laminas.length + 1 + (cierre ? 1 : 0);

  // Se muestra siempre, aunque haya una sola lámina: es la vista del post
  // completo, y escondiéndola no se entendía que el carrusel existe.
  $('#rotulo_tira').textContent = laminas.length
    ? `El carrusel · ${cuantas} de 10` + (cierre ? ', con el cierre' : '')
    : (cierre ? 'La placa y el cierre' : 'Una sola imagen')
      + ' · agregá fotos o videos para armar un carrusel';

  if(tira.children.length !== cuantas){
    tira.innerHTML = Array.from({ length: cuantas }, (_, i) => {
      const esCierre = cierre && i === cuantas - 1;
      const titulo = esCierre ? 'El cierre' : (i ? 'Lámina ' + (i + 1) : 'La placa');
      return `<button data-vista="${i}" title="${titulo}">
         <canvas width="160" height="${altoDe(160)}"></canvas><i>${i + 1}</i>
       </button>`;
    }).join('');
  }
  const logo = await cargarImagen(LOGO);
  const botones = [...tira.children];
  botones.forEach((b, i) => b.classList.toggle('activa', i === vista));
  const ctx0 = botones[0].querySelector('canvas').getContext('2d');
  dibujar(ctx0, placa, await imagenesDe(placa), 160);
  for(let i = 0; i < laminas.length; i++){
    const ctx = botones[i + 1].querySelector('canvas').getContext('2d');
    pintarLamina(ctx, laminas[i], await cargarImagen(laminas[i].foto), logo, 160);
  }
  if(cierre){
    const ctx = botones[cuantas - 1].querySelector('canvas').getContext('2d');
    dibujarCierre(ctx, placa, await arteDelCierre(), 160);
  }
}

/* Genera las láminas como archivos JPEG en memoria. */
/* Lo que se manda a publicar: la placa y las imágenes se generan acá, los
   videos ya están en el servidor desde que se subieron. */
async function itemsParaPublicar(avisar){
  const laminas = placa.laminas || [];
  // el cierre entra si queda lugar: los diez de Instagram son un tope duro y
  // vale más el contenido que la firma
  const cierre = llevaCierre() && laminas.length + 2 <= 10;
  const total = laminas.length + 1 + (cierre ? 1 : 0);
  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO_FEED; lienzo.height = altoDe(ANCHO_FEED);
  const ctx = lienzo.getContext('2d');
  const logo = await cargarImagen(LOGO);
  const jpeg = () => new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.92));
  const aDataUrl = (blob) => new Promise((r) => {
    const l = new FileReader(); l.onload = () => r(l.result); l.readAsDataURL(blob);
  });

  const items = [];
  dibujar(ctx, placa, await imagenesDe(placa), ANCHO_FEED);
  items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });
  avisar?.(1 / total);

  for(const [i, lam] of laminas.entries()){
    if(lam.tipo === 'video'){
      items.push(await videoDeLamina(lam, i));
    }else{
      pintarLamina(ctx, lam, await cargarImagen(lam.foto), logo, ANCHO_FEED);
      items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });
    }
    avisar?.(items.length / total);
  }

  if(cierre){
    dibujarCierre(ctx, placa, await arteDelCierre(), ANCHO_FEED);
    items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });
    avisar?.(1);
  }
  return items;
}

async function archivosDelCarrusel(){
  const laminas = placa.laminas || [];
  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO_FEED; lienzo.height = altoDe(ANCHO_FEED);
  const ctx = lienzo.getContext('2d');
  const logo = await cargarImagen(LOGO);
  const jpeg = () => new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.92));

  const archivos = [];
  dibujar(ctx, placa, await imagenesDe(placa), ANCHO_FEED);
  archivos.push(new File([await jpeg()], `${baseNombre()}-1.jpg`, { type: 'image/jpeg' }));
  for(let i = 0; i < laminas.length; i++){
    pintarLamina(ctx, laminas[i], await cargarImagen(laminas[i].foto), logo, ANCHO_FEED);
    archivos.push(new File([await jpeg()], `${baseNombre()}-${i + 2}.jpg`, { type: 'image/jpeg' }));
  }
  if(llevaCierre()){
    dibujarCierre(ctx, placa, await arteDelCierre(), ANCHO_FEED);
    archivos.push(new File([await jpeg()], `${baseNombre()}-cierre.jpg`, { type: 'image/jpeg' }));
  }
  return archivos;
}

/* Los videos del carrusel, exactamente como los va a recibir Instagram.
   No se vuelve a armar nada acá: se llama a la misma videoDeLamina que usa
   publicar y después se baja del servidor la dirección que devolvió, que es
   la que Instagram lee. Por eso no puede diferir de lo publicado ni aunque
   alguien cambie el camino de grabado: es literalmente el mismo archivo.
   Sirve para mirar en el reproductor de uno si quedó cortado o pegado antes
   de que salga al aire, que desde adentro del editor no se puede ver.
   Con la marca apagada varios videos se mandan tal cual llegaron, así que lo
   que baja es el original sin tocar: eso también es una respuesta. */
async function videosDelCarrusel(avisar){
  const conVideo = (placa.laminas || [])
    .map((lam, i) => ({ lam, i }))
    .filter(({ lam }) => lam.tipo === 'video');

  const archivos = [];
  for(const [n, { lam, i }] of conVideo.entries()){
    avisar?.(n / conVideo.length);
    const { ruta } = await videoDeLamina(lam, i);
    if(!ruta) continue;
    const r = await fetch(ruta);
    if(!r.ok) throw new Error(`No se pudo bajar el video ${i + 2}: el servidor dijo ${r.status}`);
    // el número es el lugar que ocupa en el post: la placa es la 1
    archivos.push(new File([await r.blob()],
      `${baseNombre()}-${i + 2}.mp4`, { type: 'video/mp4' }));
  }
  avisar?.(1);
  return archivos;
}

async function exportarCarrusel(){
  const archivos = await archivosDelCarrusel();
  for(const archivo of archivos){
    bajar(archivo, archivo.name);
    await new Promise((r) => setTimeout(r, 350));   // si van de golpe el navegador las bloquea
  }
  return archivos.length;
}

function armarCaption(){
  const partes = [String(placa.descripcion || '').trim()];
  const tags = String(placa.hashtags || '').trim();
  if(tags) partes.push(tags);
  return partes.filter(Boolean).join('\n\n');
}

async function exportarPng(ancho){
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = altoDe(ancho);
  dibujar(lienzo.getContext('2d'), placa, await imagenesDe(placa), ancho);
  bajar(await new Promise((r) => lienzo.toBlob(r, 'image/png')),
    `${baseNombre()}-${ancho}x${altoDe(ancho)}.png`);
}

/* ------------------------------------------------------------------ */
/* controles                                                           */
/* ------------------------------------------------------------------ */

function pintarDisenos(){
  $('#disenos').innerHTML = DISENOS.map((d) => `
    <button data-diseno="${d.id}" title="${d.nombre}">
      <svg viewBox="0 0 44 30" fill="none" stroke="currentColor" stroke-width="2">${d.svg}</svg>
      ${d.nombre}
    </button>`).join('');
}

function pintarPaleta(){
  $('#paleta').innerHTML = PALETA.map((c, i) => `
    <button class="muestra${c.original ? ' original' : ''}" data-paleta="${i}" title="${c.nombre}">
      <span class="par"><i style="background:${c.fondo}"></i><i style="background:${c.filete}"></i></span>
      <span>${c.nombre}</span>
    </button>`).join('');
}

function pintarChips(){
  $('#chips_etiqueta').innerHTML =
    ETIQUETAS.map((t) => `<button data-etiqueta="${t}">${t}</button>`).join('') +
    '<button data-etiqueta="">Sin etiqueta</button>';
}

async function pintarFotos(){
  if(placa.formato === 'reel'){
    const fuente = fuenteDelReel();
    const miniatura = fuente
      ? `<video src="${esc(fuente)}#t=0.5" muted playsinline preload="metadata"></video>`
      : `<img src="${recurso('assets/marcador.jpg')}" alt="">`;
    $('#fotos').innerHTML = `
      <div class="foto" data-reel>
        ${miniatura}
        <div class="cuerpo">
          <b>Video del reel</b>
          <button type="button" class="archivo"
                  onclick="this.parentNode.querySelector('input').click()">${fuente ? 'Cambiar video…' : 'Elegir video…'}</button>
          <input type="file" accept="video/mp4,video/quicktime" data-reel-video>
          <p class="nota" id="estado_video"></p>
          <p class="nota">
            Vertical, hasta 15 minutos. El titular entra animado en el primer
            segundo y se le graba encima al publicar, así que podés seguir
            cambiando el texto hasta el final.
          </p>
        </div>
      </div>`;
    return;
  }
  const slots = FOTOS_POR_DISENO[placa.diseno] || FOTOS_POR_DISENO['duo-circulo'];
  $('#fotos').innerHTML = slots.map(([campo, etiqueta]) => `
    <div class="foto" data-campo="${campo}">
      <img alt="">
      <div class="cuerpo">
        <b>${etiqueta}</b>
        <button type="button" class="archivo"
                onclick="this.parentNode.querySelector('input').click()">Cambiar foto…</button>
        <input type="file" accept="image/*" data-foto="${campo}">
        <div class="ajuste">${AJUSTES.map(([id, n, ayuda]) =>
          `<button data-ajuste="${campo}_ajuste:${id}" title="${ayuda}">${n}</button>`).join('')}</div>
        <div class="encuadre">
          <span>X</span><input type="range" data-campo="${campo}_x" min="0" max="100" step="1" value="${placa[campo + '_x']}">
          <span>Y</span><input type="range" data-campo="${campo}_y" min="0" max="100" step="1" value="${placa[campo + '_y']}">
        </div>
        ${campo === 'foto_cen' ? `
        <b class="sub">Posición del círculo</b>
        <div class="encuadre">
          <span>X</span><input type="range" data-campo="circulo_x" min="8" max="92" step="0.5" value="${placa.circulo_x ?? 50}">
          <span>Y</span><input type="range" data-campo="circulo_y" min="8" max="92" step="0.5" value="${placa.circulo_y ?? 50}">
        </div>` : ''}
      </div>
    </div>`).join('');
  if(placa.formato === 'voz'){
    const nombre = placa.audio_nombre ? esc(placa.audio_nombre) : '';
    $('#fotos').insertAdjacentHTML('afterbegin', `
      <div class="foto" data-audio>
        <div class="icono-audio" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/>
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/></svg></div>
        <div class="cuerpo">
          <b>Audio con la voz</b>
          <button type="button" class="archivo"
                  onclick="this.parentNode.querySelector('input').click()">${placa.audio ? 'Cambiar audio…' : 'Elegir audio…'}</button>
          ${placa.audio ? '<button type="button" class="archivo" data-voz-escuchar>▶ Escuchar con las barras</button>' : ''}
          <input type="file" accept="audio/*,video/*,.opus,.ogg,.m4a,.mp3,.wav,.aac,.webm" data-voz-audio>
          <p class="nota" id="estado_audio">${placa.audio
            ? `${nombre}${nombre ? ' · ' : ''}${enMinutos(placa.audio_dura || 0)}` : ''}</p>
          <p class="nota">
            Un audio de WhatsApp, una grabación o un video, del que se usa solo
            el sonido. De 3 segundos a 15 minutos. Las barras se mueven con la
            voz de verdad, y se arma el video al publicar.
          </p>
        </div>
      </div>`);
  }
  for(const [campo] of slots){
    const img = await cargarImagen(placa[campo]);
    const destino = document.querySelector(`.foto[data-campo="${campo}"] img`);
    if(img && destino) destino.src = img.src;
  }
  marcarSeleccion();
}

document.addEventListener('click', (ev) => {
  if(ev.target.closest('[data-voz-escuchar]')) escucharVoz();
});

async function pintarLaminas(){
  const laminas = placa.laminas || [];
  $('#laminas').innerHTML = laminas.map((lam, i) => `
    <div class="foto" data-lamina="${i}">
      <img alt="">
      <div class="cuerpo">
        <b>${lam.tipo === 'video' ? 'Video' : 'Foto'} ${i + 2} del carrusel</b>
        <button type="button" class="archivo"
                onclick="this.parentNode.querySelector('input').click()">Cambiar…</button>
        <button type="button" class="archivo" data-quitar="${i}">Quitar</button>
        <input type="file" accept="image/*,video/*" data-lamina-foto="${i}">
        <div class="ajuste">${AJUSTES.map(([id, n, ayuda]) =>
          `<button data-lamina-ajuste="${i}:${id}" title="${ayuda}">${n}</button>`).join('')}</div>
        <div class="encuadre">
          <span>X</span><input type="range" data-lamina-eje="${i}:x" min="0" max="100" step="1" value="${lam.x ?? 50}">
          <span>Y</span><input type="range" data-lamina-eje="${i}:y" min="0" max="100" step="1" value="${lam.y ?? 50}">
        </div>
        ${lam.tipo === 'video' ? `<p class="nota">
          Se sube tal cual y el logo se le graba al publicar. Tocá su cuadro en
          la tira para verlo moverse ya recortado, que es como va a salir.
        </p>` : ''}
      </div>
    </div>`).join('') || '<p class="nota">Solo la placa. Agregá fotos para armar un carrusel.</p>';

  for(let i = 0; i < laminas.length; i++){
    const img = await cargarImagen(laminas[i].foto);
    const destino = document.querySelector(`[data-lamina="${i}"] img`);
    if(img && destino) destino.src = img.src;
  }
  $('#agregar_lamina').disabled = laminas.length >= MAX_LAMINAS;
  $('#cuantas').textContent = laminas.length + 1;
  document.querySelectorAll('[data-lamina-ajuste]').forEach((b) => {
    const [i, valor] = b.dataset.laminaAjuste.split(':');
    const porDefecto = laminas[i].tipo === 'video' ? 'cubrir' : 'completa';
    b.classList.toggle('activo', (laminas[i].ajuste || porDefecto) === valor);
  });
}

function marcarSeleccion(){
  document.querySelectorAll('[data-diseno]').forEach((b) =>
    b.classList.toggle('activo', b.dataset.diseno === placa.diseno));
  document.querySelectorAll('[data-ajuste]').forEach((b) => {
    const [campo, valor] = b.dataset.ajuste.split(':');
    b.classList.toggle('activo', placa[campo] === valor);
  });
  document.querySelectorAll('[data-paleta]').forEach((b) => {
    const c = PALETA[Number(b.dataset.paleta)];
    b.classList.toggle('activa',
      c.fondo.toLowerCase() === String(placa.color_fondo).toLowerCase());
  });
}

async function volcarControles(){
  document.querySelectorAll('[data-campo]').forEach((el) => {
    const v = placa[el.dataset.campo];
    if(v !== undefined && el.tagName !== 'DIV') el.value = v;
  });
  await pintarFotos();
  await pintarLaminas();
}

/* El nombre de una placa para mostrar: sin los asteriscos del resaltado. */
const sinMarcas = (nombre) => String(nombre || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

async function pintarSelector(){
  const lista = await listarPlacas();
  $('#selector').innerHTML = lista.map((p) => {
    const fecha = String(p.actualizada || '').replace('T', ' ').slice(5, 16);
    return `<option value="${p.id}"${p.id === placa.id ? ' selected' : ''}>${esc(sinMarcas(p.nombre))} — ${fecha}</option>`;
  }).join('');
  $('#cual').textContent = sinMarcas(placa.nombre);
}

/* ------------------------------------------------------------------ */
/* cargar y guardar                                                    */
/* ------------------------------------------------------------------ */

const nombrar = (titulo) =>
  String(titulo).split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 60) || 'Placa sin título';

async function cargar(id){
  // el archivo local y lo ya grabado son de la placa que se estaba editando:
  // sin soltarlos, la siguiente mostraría el video de la anterior
  if(videoLocal){ URL.revokeObjectURL(videoLocal); videoLocal = null; }
  subiendoVideo = null;
  ultimoQuemado = null;
  detenerVoz();
  ultimaVoz = null;

  placa = await leerPlaca(id);
  localStorage.setItem('placa', id);
  document.body.dataset.formato = placa.formato;
  // en un reel o una placa con voz no hay imágenes que bajar, hay un video
  const esVideo = ['reel', 'voz'].includes(placa.formato);
  $('#bajar_reel').hidden = !esVideo;
  $('#bajar_carrusel').hidden = esVideo;
  document.querySelectorAll('[data-exportar]').forEach((b) => { b.hidden = esVideo; });
  const urgente = placa.formato === 'urgente';
  $('#leg_titular').textContent = urgente ? 'Urgente' : 'Titular';
  $('#lab_titulo').textContent = urgente
    ? 'La palabra grande: se estira sola hasta llenar el ancho'
    : 'Un salto de línea = una línea en la placa';
  await volcarControles();
  irA(localStorage.getItem('seccion') || 'titular');
  pintarBarra();
  await pintarSelector();
  $('#portada').hidden = true;
  arrancado();
  repintar();
  prepararProgramar();
  estado('');
}

function cambio(campo, valor){
  placa[campo] = valor;
  repintar();
  pintarBarra();
  marcarSeleccion();
  clearTimeout(guardando);
  guardando = setTimeout(async () => {
    try{
      const r = await escribirPlaca(placa);
      placa.id = r.id;
      placa.nombre = r.nombre;
      await pintarSelector();
      estado('Guardado ' + new Date().toLocaleTimeString('es-CL'));
    }catch(e){ estado('No se pudo guardar: ' + e.message, true); }
  }, 400);
}

async function crear(datos){
  const nueva = { ...datos };
  delete nueva.id;
  return (await escribirPlaca(nueva)).id;
}

/* ------------------------------------------------------------------ */
/* eventos                                                             */
/* ------------------------------------------------------------------ */

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if(el.dataset.campo && el.tagName !== 'DIV'){
    let v = el.value;
    if(el.type === 'number' || el.type === 'range') v = parseFloat(v);
    cambio(el.dataset.campo, v);
    const pick = $('#' + el.dataset.campo + '_pick');
    if(pick && /^#[0-9a-f]{6}$/i.test(v)) pick.value = v;
  }
});

document.addEventListener('click', async (ev) => {
  const boton = ev.target.closest('[data-diseno], [data-paleta], [data-etiqueta], [data-ajuste]');
  if(!boton) return;
  if(boton.dataset.diseno){ cambio('diseno', boton.dataset.diseno); await pintarFotos(); return; }
  if(boton.dataset.ajuste){
    const [campo, valor] = boton.dataset.ajuste.split(':');
    return cambio(campo, valor);
  }
  if(boton.dataset.paleta !== undefined){
    const c = PALETA[Number(boton.dataset.paleta)];
    placa.color_filete = c.filete;
    return cambio('color_fondo', c.fondo);
  }
  if(boton.dataset.etiqueta !== undefined){
    $('#etiqueta').value = boton.dataset.etiqueta;
    cambio('etiqueta', boton.dataset.etiqueta);
  }
});

/* El botón abre el selector de archivos directo, con fotos y videos y
   varios a la vez. Antes agregaba un casillero vacío con una foto de
   muestra, que después había que cambiar: el botón decía «Agregar foto», y
   en el teléfono —donde no se puede soltar un archivo arrastrándolo— no
   había forma de adivinar que un video también entraba. */
$('#agregar_lamina').addEventListener('click', () => $('#archivos_carrusel').click());
$('#archivos_carrusel').addEventListener('change', async (ev) => {
  const archivos = [...(ev.target.files || [])];
  ev.target.value = '';
  try{ await agregarAlCarrusel(archivos); }
  catch(e){ estado(e.message, true); }
});

document.addEventListener('click', async (ev) => {
  const quitar = ev.target.closest('[data-quitar]');
  if(quitar){
    placa.laminas.splice(Number(quitar.dataset.quitar), 1);
    cambio('laminas', placa.laminas);
    return pintarLaminas();
  }
  const ajuste = ev.target.closest('[data-lamina-ajuste]');
  if(ajuste){
    const [i, valor] = ajuste.dataset.laminaAjuste.split(':');
    placa.laminas[i].ajuste = valor;
    // se pasa a mirar la lámina que se está tocando: encuadrar a ciegas,
    // con la placa en pantalla, era adivinar
    vista = Number(i) + 1;
    cambio('laminas', placa.laminas);
    return pintarLaminas();
  }
});

/* Mover el encuadre de una lámina. Va por `input` y no por `change` para que
   se vea correrse mientras se arrastra, que es de lo que se trata. */
document.addEventListener('input', (ev) => {
  const eje = ev.target.closest('[data-lamina-eje]');
  if(!eje) return;
  const [i, cual] = eje.dataset.laminaEje.split(':');
  placa.laminas[i][cual] = Number(eje.value);
  vista = Number(i) + 1;
  cambio('laminas', placa.laminas);
});

$('#tira').addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-vista]');
  if(!boton) return;
  vista = Number(boton.dataset.vista);
  repintar();
});

/* En el celular esto abre la hoja de compartir del sistema con las imágenes
   ya listas: se elige Instagram y se pega el texto. Si el navegador no lo
   soporta (escritorio, casi siempre), se bajan los archivos. */
$('#compartir').addEventListener('click', async (ev) => {
  ev.target.disabled = true;
  abrirTrabajo();
  congelar(true);   // dibuja con lo que hay ahora
  trabajo('Preparando las imágenes', null);
  let archivos;
  try{
    archivos = await archivosDelCarrusel();
  }catch(e){ estado(e.message, true); }
  // lo que sigue es la hoja del sistema, y el aviso propio estorbaba
  finally{ cerrarTrabajo(); congelar(false); }

  try{
    if(!archivos) return;
    const texto = armarCaption();
    if(navigator.canShare && navigator.canShare({ files: archivos })){
      await navigator.share({ files: archivos, text: texto });
      estado('Compartido');
    }else{
      for(const a of archivos){ bajar(a, a.name); await new Promise((r) => setTimeout(r, 350)); }
      estado('Tu navegador no comparte archivos: se descargaron ' + archivos.length);
    }
  }catch(e){
    if(e.name !== 'AbortError') estado(e.message, true);
    else estado('');
  }
  finally{ ev.target.disabled = false; }
});

/* ------------------------------------------------------------------ */
/* en qué redes se publica                                             */
/* ------------------------------------------------------------------ */

const NOMBRE_RED = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
// Instagram siempre: es la cuenta con la que arranca todo. Las otras, según el servidor
const conectadas = { instagram: true, facebook: false, tiktok: false };

/* «Instagram», «Instagram y Facebook», «Instagram, Facebook y TikTok». */
function enRedes(redes){
  const n = redes.map((r) => NOMBRE_RED[r] || r);
  return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n.at(-1) : (n[0] || '');
}

function redesElegidas(){
  return [...document.querySelectorAll('#redes input:checked:not(:disabled)')].map((i) => i.value);
}

function pintarRedes(){
  for(const input of document.querySelectorAll('#redes input')){
    const red = input.value;
    input.disabled = !conectadas[red];
    if(!conectadas[red]) input.checked = false;
    const nota = input.parentElement.querySelector('small');
    if(nota && red !== 'instagram') nota.textContent = conectadas[red] ? '' : 'sin conectar';
    input.parentElement.title = conectadas[red] ? '' : 'Se conecta desde el panel privado';
  }
  const elegidas = redesElegidas();
  $('#publicar span').textContent = elegidas.length
    ? 'Publicar en ' + enRedes(elegidas) : 'Elegí dónde publicar';
}

/* Qué hay conectado, y lo que se eligió la última vez en este navegador.
   La primera vez van marcadas todas las conectadas: un clic y sale en todas. */
async function cargarRedes(){
  try{
    const d = await api('api/redes.php');
    conectadas.facebook = !!d.facebook?.conectado;
    conectadas.tiktok = !!d.tiktok?.conectado;
  }catch(e){ /* sin respuesta queda solo Instagram, como antes */ }
  /* Se guarda qué se eligió y qué redes había en ese momento: una red que
     se conecta después arranca marcada, así sale en todas sin tocar nada. */
  let guardadas = null;
  try{ guardadas = JSON.parse(localStorage.getItem('redes_publicar') || 'null'); }catch(e){}
  if(Array.isArray(guardadas)) guardadas = { elegidas: guardadas, conocidas: ['instagram', 'facebook'] };
  for(const input of document.querySelectorAll('#redes input')){
    const red = input.value;
    input.checked = conectadas[red]
      && (!guardadas || guardadas.elegidas.includes(red) || !guardadas.conocidas?.includes(red));
  }
  // si lo guardado quedó sin nada que valga (desconectaron Facebook), Instagram
  if(!redesElegidas().length) $('#redes input[value="instagram"]').checked = true;
  pintarRedes();
}

$('#redes').addEventListener('change', () => {
  const conocidas = Object.keys(conectadas).filter((r) => conectadas[r]);
  try{ localStorage.setItem('redes_publicar', JSON.stringify({ elegidas: redesElegidas(), conocidas })); }catch(e){}
  pintarRedes();
});

/* ------------------------------------------------------------------ */
/* el paso de TikTok                                                   */
/* ------------------------------------------------------------------ */

/* TikTok exige, para publicar con su API, que quien publica vea a qué
   cuenta va, elija la privacidad (sin nada elegido de antemano), prenda a
   mano lo que se permite, y declare si es contenido comercial. Devuelve lo
   que se eligió, o null si se canceló. */
const QUIEN_VE = {
  PUBLIC_TO_EVERYONE: 'Todos', FOLLOWER_OF_CREATOR: 'Seguidores',
  MUTUAL_FOLLOW_FRIENDS: 'Amigos (se siguen mutuamente)', SELF_ONLY: 'Solo yo',
};
const MUSICA = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const POLITICA_MARCA = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

function pasoTiktok(redes, { programar = false } = {}){
  const dlg = $('#paso_tiktok');
  const esVideo = ['reel', 'voz'].includes(placa.formato);
  const hayVideo = esVideo || (placa.laminas || []).some((l) => l.tipo === 'video');
  const hayFotos = !esVideo;
  const duracion = placa.formato === 'reel' ? $('#previa_video').duration
    : placa.formato === 'voz' ? placa.audio_dura : 0;

  // todo vuelve a como TikTok lo pide: nada elegido ni prendido
  for(const id of ['tt_comentarios', 'tt_duo', 'tt_stitch', 'tt_musica', 'tt_comercial', 'tt_marca_propia', 'tt_marca_pagada']){
    $('#' + id).checked = false;
    $('#' + id).disabled = false;
  }
  document.querySelectorAll('[data-tt-video]').forEach((el) => { el.hidden = !hayVideo; });
  document.querySelectorAll('[data-tt-fotos]').forEach((el) => { el.hidden = !hayFotos; });
  $('#tt_comercial_opciones').hidden = true;
  $('#tt_cuerpo').hidden = true;
  $('#tt_declaracion').hidden = true;
  $('#tt_demora').hidden = true;
  $('#tt_error').hidden = true;
  $('#tt_foto').hidden = true;
  $('#tt_cuenta').textContent = 'Consultando la cuenta de TikTok…';
  $('#tt_texto').value = armarCaption();
  const otras = redes.filter((r) => r !== 'tiktok');
  $('#tt_otras').hidden = !otras.length;
  $('#tt_otras').textContent = otras.length ? `Al mismo tiempo sale en ${enRedes(otras)}, como siempre.` : '';
  $('#tt_publicar').textContent = programar ? 'Programar' : 'Publicar';
  $('#tt_publicar').disabled = true;

  // la vista previa: el video del reel debajo y lo dibujado encima, como en el editor
  const lienzo = $('#tt_previa');
  const origen = $('#previa');
  lienzo.width = origen.width;
  lienzo.height = origen.height;
  const ctx = lienzo.getContext('2d');
  const video = $('#previa_video');
  if(!video.hidden && video.readyState >= 2) ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(origen, 0, 0);

  let creador = null;
  const marcaPagada = () => $('#tt_marca_pagada').checked;

  function revisar(){
    const comercial = $('#tt_comercial').checked;
    $('#tt_comercial_opciones').hidden = !comercial;
    if(!comercial){ $('#tt_marca_propia').checked = false; $('#tt_marca_pagada').checked = false; }
    const propia = $('#tt_marca_propia').checked, pagada = marcaPagada();
    const pieza = hayVideo && !hayFotos ? 'Tu video' : hayVideo ? 'Tu publicación' : 'Tu foto';
    $('#tt_etiqueta').hidden = !(propia || pagada);
    $('#tt_etiqueta').textContent = pagada ? `${pieza} va a llevar la etiqueta «Colaboración pagada».`
      : `${pieza} va a llevar la etiqueta «Contenido promocional».`;

    // el contenido de marca no puede ser privado
    const privado = $('#tt_quien').querySelector('option[value="SELF_ONLY"]');
    if(privado){
      privado.disabled = pagada;
      privado.title = pagada ? 'El contenido de marca no puede ser privado.' : '';
      if(pagada && $('#tt_quien').value === 'SELF_ONLY'){
        $('#tt_quien').value = '';
        $('#tt_etiqueta').textContent += ' El contenido de marca no puede ser privado: elegí quién puede verlo.';
      }
    }

    $('#tt_declaracion').innerHTML = pagada
      ? `Al publicar, aceptás la <a href="${POLITICA_MARCA}" target="_blank" rel="noopener">Política de contenido de marca</a> y la <a href="${MUSICA}" target="_blank" rel="noopener">Confirmación de uso de música</a> de TikTok.`
      : `Al publicar, aceptás la <a href="${MUSICA}" target="_blank" rel="noopener">Confirmación de uso de música</a> de TikTok.`;

    let motivo = '';
    if(!creador) motivo = 'Esperá a que TikTok conteste.';
    else if(hayVideo && creador.maxSegundos && duracion > creador.maxSegundos){
      motivo = `El video dura ${Math.round(duracion)} s y esta cuenta de TikTok acepta hasta ${creador.maxSegundos} s.`;
    }else if(!$('#tt_quien').value) motivo = 'Elegí quién puede verlo.';
    else if(comercial && !propia && !pagada){
      motivo = 'Tenés que indicar si el contenido promociona tu marca, a un tercero, o a los dos.';
    }
    $('#tt_publicar').disabled = !!motivo;
    $('#tt_publicar_caja').title = motivo;
  }

  return new Promise((resolver) => {
    const cerrar = (valor) => {
      dlg.removeEventListener('change', revisar);
      dlg.close();
      resolver(valor);
    };
    dlg.addEventListener('change', revisar);
    $('#tt_cancelar').onclick = () => cerrar(null);
    dlg.oncancel = (e) => { e.preventDefault(); cerrar(null); };
    $('#tt_publicar').onclick = () => {
      if($('#tt_publicar').disabled) return;
      cerrar({
        privacidad: $('#tt_quien').value, texto: $('#tt_texto').value,
        comentarios: $('#tt_comentarios').checked, duo: $('#tt_duo').checked,
        stitch: $('#tt_stitch').checked, musica: $('#tt_musica').checked,
        marca_propia: $('#tt_marca_propia').checked, marca_pagada: marcaPagada(),
      });
    };
    dlg.showModal();

    // la cuenta, pedida a TikTok cada vez que se abre: puede haber cambiado
    api('api/redes.php?creador=tiktok').then((c) => {
      creador = c;
      $('#tt_cuenta').textContent = `Va a la cuenta ${c.nombre || ''} (@${c.usuario})`;
      if(c.foto){ $('#tt_foto').src = c.foto; $('#tt_foto').hidden = false; }
      $('#tt_quien').innerHTML = '<option value="" selected disabled>Elegí quién puede verlo</option>'
        + c.opciones.map((o) => `<option value="${esc(o)}">${esc(QUIEN_VE[o] || o)}</option>`).join('');
      // lo que la cuenta tiene apagado en TikTok, acá también
      for(const [id, apagado] of [['tt_comentarios', c.sinComentarios], ['tt_duo', c.sinDuo], ['tt_stitch', c.sinStitch]]){
        $('#' + id).disabled = !!apagado;
        $('#' + id).closest('label').title = apagado ? 'Está apagado en la configuración de la cuenta de TikTok' : '';
      }
      $('#tt_cuerpo').hidden = false;
      $('#tt_declaracion').hidden = false;
      $('#tt_demora').hidden = false;
      revisar();
    }).catch((e) => {
      // si TikTok dice que ahora no se puede publicar, se para acá
      $('#tt_cuenta').textContent = 'TikTok no contestó';
      $('#tt_error').hidden = false;
      $('#tt_error').textContent = e.message + ' Probá de nuevo en un rato, o sacá TikTok de las redes.';
    });
  });
}

$('#publicar').addEventListener('click', async (ev) => {
  // sin descripción no se publica: un post vacío no se puede editar después
  // sin borrarlo y volver a subirlo
  // no se avanza con algo obligatorio sin llenar: se lleva a su sección
  const falta = loQueFalta();
  if(falta.length){
    estado(falta[0].que, true);
    irA(falta[0].seccion);
    pintarBarra();
    const campo = $('#' + (falta[0].seccion === 'texto' ? 'descripcion' : 'titulo'));
    campo?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  /* Como subir ya no traba el editor, se puede llegar acá con una foto a
     medio camino: el carrusel todavía no la tiene y el post saldría sin ella,
     sin que nada lo avise. Publicar e ir a la cola son las dos cosas que no
     se pueden deshacer, así que esperan. */
  if(enCurso > 0){
    return estado('Esperá a que termine lo que se está subiendo: si no, sale sin eso.', true);
  }
  /* Y que no haya otro publicando desde otro lado. Dos publicaciones a la vez
     se pisan: Instagram procesa las piezas de las dos y devuelve errores que
     no dicen nada. */
  const otros = await otrosPublicando();
  if(otros.length){
    const o = otros[0];
    const hace = Math.max(0, Math.round(Date.now()/1000 - (o.desde || 0)));
    if(!confirm(`Hay algo publicándose desde ${o.donde || 'otro equipo'} `
      + `hace ${hace} segundos: «${o.que}». Publicar dos cosas a la vez las hace `
      + 'chocar. ¿Seguimos igual?')) return;
  }
  const redes = redesElegidas();
  if(!redes.length) return estado('Elegí al menos una red, arriba de Publicar.', true);
  const laminas = (placa.laminas || []).length + 1;
  // el reel y la placa con voz son un video solo, no un carrusel
  const queSale = ['reel', 'voz'].includes(placa.formato) ? 'un video'
    : `un carrusel de ${laminas} imagen${laminas > 1 ? 'es' : ''}`;
  // con TikTok, su paso hace de confirmación; sin TikTok, la pregunta de siempre
  let tiktok = null;
  if(redes.includes('tiktok')){
    tiktok = await pasoTiktok(redes);
    if(!tiktok) return;
  }else if(!confirm(`Se va a publicar en ${enRedes(redes)} ${queSale}. ¿Seguimos?`)) return;
  ev.target.disabled = true;
  // publicar puede llevar minutos; si la pantalla se apaga, se corta todo
  const despierto = await mantenerDespierto();
  abrirTrabajo();
  congelar(true);   // cada pieza se dibuja con lo que hay ahora
  empezarActividad(`publicando ${placa.nombre || 'una placa'}`);
  try{
    if(placa.formato === 'reel' && !fuenteDelReel()){
      estado('Falta el video del reel.', true);
      return;
    }
    let items;
    if(placa.formato === 'reel'){
      items = [await reelParaPublicar()];
    }else if(placa.formato === 'voz'){
      items = [await vozParaPublicar()];
    }else{
      trabajo('Generando las imágenes', 0);
      items = await itemsParaPublicar((a) => trabajo('Generando las imágenes', a));
    }

    anotar('publicando', { piezas: items.length,
      tipos: items.map((x) => x.tipo).join(', ') });
    const arranquePublicar = Date.now();
    trabajo('Publicando en ' + enRedes(redes), null,
      'Cada red tiene que recibir y procesar cada pieza. Con video puede tardar unos minutos. No cierres esta ventana.');
    const res = await fetch('api/publicar.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clave: clave(), items,
        caption: armarCaption(),
        colaboradores: placa.colaboradores || '',
        etiquetados: placa.etiquetados || '',
        redes, tiktok,
        // para el historial del equipo: qué fue. Quién, lo sabe el servidor
        placa: { placa_id: placa.id, nombre: placa.nombre, formato: placa.formato },
      }),
    });
    const datos = await res.json().catch(() => ({}));
    if(!res.ok){
      if(res.status === 401) localStorage.removeItem('clave_publicar');
      /* Sin datos y con 5xx, el hosting dejó de esperar pero el servidor
         puede haber seguido: publicar de nuevo a ciegas la duplicaría. */
      if(!datos.error && res.status >= 500){
        throw new Error(`El hosting cortó la espera (error ${res.status}) mientras se publicaba. `
          + 'Puede que haya salido igual: revisá las redes antes de volver a publicar.');
      }
      throw new Error(datos.error || motivoHttp(res.status));
    }
    anotar('publicado', { tardo: seg(Date.now() - arranquePublicar),
      aviso: datos.aviso ? String(datos.aviso).slice(0, 80) : 'sin avisos' });
    // dónde salió de verdad: si una red falló, las otras igual salieron
    const salio = Object.entries(datos.redes || { instagram: datos })
      .filter(([, r]) => r.ok).map(([red]) => red);
    estado('Publicado en ' + enRedes(salio) + (datos.aviso ? ' — ' + datos.aviso : ''),
      salio.length < redes.length);
    if(datos.enlace) window.open(datos.enlace, '_blank');
  }catch(e){ estado(e.message, true); }
  finally{
    cerrarTrabajo(); congelar(false); terminarActividad();
    despierto?.release().catch(() => {});
    ev.target.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* programar para más tarde                                            */
/* ------------------------------------------------------------------ */

/* Al programar, las imágenes se generan ahora y quedan subidas: cuando
   llegue la hora no va a haber ningún navegador que las dibuje. */
async function cargaParaProgramar(){
  if(placa.formato === 'reel') return { items: [await reelParaPublicar()] };
  if(placa.formato === 'voz') return { items: [await vozParaPublicar()] };
  trabajo('Generando las imágenes', 0);
  const listos = await itemsParaPublicar((a) => trabajo('Generando las imágenes', a));
  const items = [];
  for(const item of listos){
    trabajo('Guardando las imágenes', items.length / listos.length,
      'Quedan subidas desde ahora: a la hora de publicar no va a haber ningún navegador que las dibuje.');
    if(item.tipo !== 'imagen'){ items.push(item); continue; }
    const blob = await (await fetch(item.dataUrl)).blob();
    const { ruta } = await guardarFoto(new File([blob], 'programada.jpg', { type: 'image/jpeg' }));
    items.push({ tipo: 'imagen', ruta });
  }
  return { items };
}

/* La fecha como se dice: «lun 12 oct, 20:00». */
const fechaLarga = (d) => d.toLocaleString('es-CL',
  { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/* «en 2 h 15 min» o «hace 3 h», según falte o ya haya pasado. */
function cuantoFalta(ms){
  const min = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(min / 60), d = Math.floor(h / 24);
  const t = d >= 1 ? `${d} d${h % 24 ? ' ' + (h % 24) + ' h' : ''}`
    : h >= 1 ? `${h} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}`
    : `${Math.max(1, min)} min`;
  return ms >= 0 ? `en ${t}` : `hace ${t}`;
}

/* Lo que pide el selector de fecha: la hora local, sin zona. */
const aLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/* Las horas rápidas. Las de hoy que ya pasaron (o están a menos de veinte
   minutos) no se ofrecen. */
function horasRapidas(){
  const ahora = new Date();
  // siempre en punto o y media: nunca a las 21:37
  const en = (min) => new Date(Math.ceil((ahora.getTime() + min * 60000) / 1800000) * 1800000);
  const a = (dias, h) => { const d = new Date(ahora); d.setDate(d.getDate() + dias); d.setHours(h, 0, 0, 0); return d; };
  const lista = [['En 30 min', en(30)], ['En 1 hora', en(60)]];
  for(const h of [13, 20]){
    const hoy = a(0, h);
    if(hoy - ahora > 20 * 60000) lista.push([`Hoy ${h}:00`, hoy]);
  }
  lista.push(['Mañana 8:00', a(1, 8)], ['Mañana 13:00', a(1, 13)]);
  return lista.slice(0, 5);
}

function pintarAtajos(){
  const caja = $('#atajos_cuando');
  if(!caja) return;
  caja.innerHTML = horasRapidas()
    .map(([texto, d]) => `<button type="button" data-cuando="${aLocal(d)}">${esc(texto)}</button>`).join('');
}

/* Debajo del selector, en palabras: cuándo sale, cuánto falta y dónde. */
function decirCuando(){
  const el = $('#cuando_dice');
  if(!el) return;
  const v = $('#cuando').value;
  el.className = 'cuando-dice';
  if(!v){ el.textContent = 'Elegí cuándo sale, o tocá una de las horas rápidas.'; return; }
  const d = new Date(v);
  const falta = d - Date.now();
  if(falta < 30000){
    el.className = 'cuando-dice mal';
    el.textContent = 'Esa hora ya pasó: elegí una más adelante.';
    return;
  }
  const redes = redesElegidas();
  let texto = `Sale el ${fechaLarga(d)}, ${cuantoFalta(falta)}`
    + (redes.length ? `, en ${enRedes(redes)}.` : '. Falta elegir en qué redes, arriba de Publicar.');
  if(horarios){
    const v = Math.round(puntajeDe(d) * 100);
    texto += ` A esa hora la audiencia está al ${v} % de su pico.`;
  }
  // si queda muy cerca de otra, se avisa con la mejor hora libre
  const cerca = choqueCon(d, separacion());
  if(cerca){
    el.className = 'cuando-dice aviso';
    const mejor = horarios?.sugerencias?.[0];
    texto += ` Ojo: queda a ${cerca.minutos} min de «${sinMarcas(cerca.nombre)}».`
      + (mejor ? ` Mejor separarlas: probá ${cuandoCorto(new Date(mejor.cuando))}.` : '');
  }
  el.textContent = texto;
  marcarHoraElegida();
}

/* ------------------------------------------------------------------ */
/* las mejores horas                                                   */
/* ------------------------------------------------------------------ */

let horarios = null;        // lo que dice el servidor: curva, pico y sugerencias
let elegidaAMano = false;   // si se eligió una hora a mano, no se le cambia
let proximasCache = [];     // lo programado, para avisar si una hora choca

const separacion = () => {
  try{ return Number(localStorage.getItem('separacion')) === 30 ? 30 : 60; }catch(e){ return 60; }
};

// la hora en Chile, que es la de la audiencia (la curva está en esa hora)
const horaChile = (d) => Number(new Intl.DateTimeFormat('es-CL',
  { hour: 'numeric', hour12: false, timeZone: 'America/Santiago' }).format(d)) % 24;
const minutoChile = (d) => Number(new Intl.DateTimeFormat('es-CL',
  { minute: 'numeric', timeZone: 'America/Santiago' }).format(d));

function puntajeDe(d){
  const h = horaChile(d);
  const H = horarios.horas;
  return minutoChile(d) >= 30 ? (H[h] + H[(h + 1) % 24]) / 2 : H[h];
}

/* «Hoy 21:00», «Mañana 13:30» o «mié 14, 09:00». */
function cuandoCorto(d){
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  const dias = Math.round((dia - hoy) / 86400000);
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if(dias === 0) return 'Hoy ' + hora;
  if(dias === 1) return 'Mañana ' + hora;
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }) + ', ' + hora;
}

/* La programada que queda a menos de `minutos` de `d`, si hay. */
function choqueCon(d, minutos){
  let cerca = null;
  for(const p of proximasCache){
    const m = Math.round(Math.abs(new Date(p.publicar_en) - d) / 60000);
    if(m < minutos && (!cerca || m < cerca.minutos)) cerca = { minutos: m, nombre: p.nombre };
  }
  return cerca;
}

/* Siempre en punto o y media. */
function redondearMedia(v){
  const d = new Date(v);
  const m = d.getMinutes();
  d.setMinutes(m < 15 ? 0 : m < 45 ? 30 : 60, 0, 0);
  return aLocal(d);
}

function marcarHoraElegida(){
  const v = $('#cuando')?.value;
  const h = v ? horaChile(new Date(v)) : -1;
  document.querySelectorAll('#mejores_grafico i').forEach((barra, i) => barra.classList.toggle('elegida', i === h));
}

/* Pide las mejores horas y las pinta. Si no se eligió nada a mano, la mejor
   queda puesta en el selector: lista para tocar Programar. */
async function pintarMejores(){
  const caja = $('#mejores');
  if(!caja) return;
  try{ horarios = await api('api/horarios.php?separacion=' + separacion()); }
  catch(e){ caja.hidden = true; horarios = null; return; }
  const H = horarios;
  caja.hidden = false;
  document.querySelectorAll('[data-separar]').forEach((b) => {
    b.classList.toggle('activa', Number(b.dataset.separar) === separacion());
  });
  $('#mejores_fuente').textContent = `Pico a las ${H.pico}:00 · `
    + (H.fuente === 'publicaciones'
      ? `según cómo les fue a tus últimas ${H.muestras} publicaciones`
      : 'horario típico de un medio de noticias (todavía hay pocas publicaciones tuyas para medir)');
  $('#mejores_grafico').innerHTML = H.horas.map((v, h) =>
    `<i class="${h === H.pico ? 'pico' : ''}" style="height:${Math.max(6, Math.round(v * 100))}%"
        title="${h}:00 · ${Math.round(v * 100)} % del pico"></i>`).join('');
  $('#mejores_opciones').innerHTML = H.sugerencias.length
    ? H.sugerencias.map((s, i) => {
        const d = new Date(s.cuando);
        return `<button type="button" data-cuando="${aLocal(d)}" class="${i === 0 ? 'mejor' : ''}">`
          + `${i === 0 ? '★ ' : ''}${esc(cuandoCorto(d))}<small>${Math.round(s.puntaje * 100)} %</small></button>`;
      }).join('')
    : '<small>No quedan horas libres en los próximos dos días con esta separación.</small>';
  if(!elegidaAMano && H.sugerencias[0]) $('#cuando').value = aLocal(new Date(H.sugerencias[0].cuando));
  decirCuando();
}

/* Al abrir una placa: las horas rápidas, una hora sugerida (la próxima en
   punto, con al menos media hora de margen) y la lista. */
function prepararProgramar(){
  const campo = $('#cuando');
  if(!campo) return;
  campo.min = aLocal(new Date());
  elegidaAMano = false;
  if(!campo.value || new Date(campo.value) < Date.now()){
    const d = new Date(Date.now() + 30 * 60000);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    campo.value = aLocal(d);
  }
  pintarAtajos();
  decirCuando();
  // la lista primero: con ella se sabe qué horas chocan
  pintarCola().then(pintarMejores);
}

const ESTADO_COLA = { pendiente: 'programada', publicando: 'saliendo', publicada: 'publicada', error: 'falló' };
let hayProximas = false;

function itemCola(p){
  const d = new Date(p.publicar_en);
  const [primera, ...resto] = String(p.resultado || '').split('\n');
  const enlace = /^https?:\/\//.test(primera) ? primera : null;
  const meta = [p.redes?.length ? 'En ' + enRedes(p.redes) : '', p.quien ? 'por ' + p.quien : '']
    .filter(Boolean).join(' · ');
  const cuando = p.estado === 'publicando' ? 'saliendo ahora' : cuantoFalta(d - Date.now());
  const acciones = p.estado === 'pendiente'
    ? `<button type="button" data-cola="mover">Cambiar hora</button>
       <button type="button" data-cola="ahora">Publicar ya</button>
       <button type="button" data-cola="quitar" class="quitar">Cancelar</button>`
    : p.estado === 'error'
      ? `<button type="button" data-cola="mover">Reprogramar</button>
         <button type="button" data-cola="ahora">Reintentar ya</button>`
      : '';
  return `
    <li class="${esc(p.estado)}" data-id="${p.id}" data-cuando="${esc(p.publicar_en)}">
      <div class="cola-fila">
        <b>${esc(fechaLarga(d))}</b><small>${esc(cuando)}</small>
        <em>${esc(ESTADO_COLA[p.estado] || p.estado)}</em>
      </div>
      <span class="cola-nombre" title="${esc(sinMarcas(p.nombre))}">${esc(sinMarcas(p.nombre))}</span>
      ${meta ? `<small class="cola-meta">${esc(meta)}</small>` : ''}
      ${p.estado === 'error' && p.resultado ? `<small class="cola-motivo">${esc(p.resultado)}</small>` : ''}
      ${p.estado === 'publicada' && (enlace || resto.length)
        ? `<small class="cola-meta">${enlace ? `<a href="${esc(enlace)}" target="_blank" rel="noopener">Ver la publicación</a>` : ''}${
            resto.length ? (enlace ? ' · ' : '') + esc(resto.join(' ')) : ''}</small>` : ''}
      ${acciones ? `<div class="cola-acciones">${acciones}</div>` : ''}
      <div class="cola-mover" hidden>
        <input type="datetime-local" step="1800" aria-label="Nueva fecha y hora">
        <button type="button" data-cola="guardar" class="principal">Guardar</button>
        <button type="button" data-cola="cerrar">Volver</button>
      </div>
    </li>`;
}

/* La lista: primero lo que falta salir, de la más próxima a la más lejana, y
   después las últimas que salieron o fallaron. */
async function pintarCola(){
  const cola = $('#cola');
  if(!cola) return;
  // si se está cambiando una hora, no se le borra el campo de abajo
  if(cola.querySelector('.cola-mover:not([hidden])')) return;
  try{
    const { programadas, ahora, ahora_bd: bd } = await api('api/programar.php');
    // si los relojes del servidor no coinciden, lo programado sale a
    // destiempo y hay que saberlo antes de que pase
    const desfase = bd ? Math.abs(new Date(ahora) - new Date(bd.replace(' ', 'T') + 'Z')) : 0;
    const aviso = desfase > 120000
      ? `<li class="vacia" style="color:var(--mal)">Ojo: el reloj de la base va ${Math.round(desfase / 60000)} min
         corrido respecto del servidor. Avisale a quien administra el sitio.</li>`
      : '';
    const lista = programadas || [];
    const proximas = lista.filter((p) => ['pendiente', 'publicando'].includes(p.estado));
    const hechas = lista.filter((p) => !['pendiente', 'publicando'].includes(p.estado));
    hayProximas = proximas.length > 0;
    proximasCache = proximas;
    cola.innerHTML = aviso
      + `<li class="cola-titulo">Próximas${proximas.length ? ' · ' + proximas.length : ''}</li>`
      + (proximas.map(itemCola).join('') || '<li class="vacia">Nada programado todavía.</li>')
      + (hechas.length ? '<li class="cola-titulo">Recientes</li>' + hechas.map(itemCola).join('') : '');
  }catch(e){ cola.innerHTML = `<li class="vacia" style="color:var(--mal)">${esc(e.message)}</li>`; }
}

for(const sel of ['#atajos_cuando', '#mejores_opciones']){
  $(sel)?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cuando]');
    if(!b) return;
    $('#cuando').value = b.dataset.cuando;
    elegidaAMano = true;
    decirCuando();
  });
}
$('#cuando')?.addEventListener('input', () => { elegidaAMano = true; decirCuando(); });
// al terminar de elegir, a la media hora más cercana
$('#cuando')?.addEventListener('change', (ev) => {
  if(!ev.target.value) return;
  ev.target.value = redondearMedia(ev.target.value);
  decirCuando();
});
$('#mejores')?.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-separar]');
  if(!b) return;
  try{ localStorage.setItem('separacion', b.dataset.separar); }catch(e){}
  pintarMejores();
});
$('#redes')?.addEventListener('change', decirCuando);

/* Cada minuto: las horas rápidas y el «en tanto» se ponen al día, y si hay
   algo por salir, la lista también —así se ve pasar de programada a
   publicada sin recargar—. Con la pestaña escondida no se pregunta nada. */
setInterval(() => {
  if(document.visibilityState !== 'visible' || !placa) return;
  pintarAtajos();
  decirCuando();
  if(hayProximas) pintarCola();
}, 60000);

$('#programar').addEventListener('click', async (ev) => {
  const cuando = $('#cuando').value;
  if(!cuando) return estado('Elegí la fecha y la hora.', true);
  // antes de preparar nada: si la hora ya pasó, el servidor la rechazaría al final
  if(new Date(cuando) - Date.now() < 30000) return estado('Esa hora ya pasó: elegí una más adelante.', true);
  /* Muy cerca de otra: a menos de media hora no se puede (el servidor la
     rechaza); dentro de la separación elegida, se pregunta. */
  const cerca = choqueCon(new Date(cuando), separacion());
  if(cerca && cerca.minutos < 30){
    return estado(`Queda a ${cerca.minutos} min de «${sinMarcas(cerca.nombre)}»: entre dos publicaciones `
      + 'tiene que haber al menos 30 minutos. Elegí una de las mejores horas.', true);
  }
  if(cerca && !confirm(`Queda a ${cerca.minutos} min de «${sinMarcas(cerca.nombre)}». `
    + '¿La programo igual?')) return;
  if(!String(placa.descripcion || '').trim()){
    return estado('Falta la descripción: es lo que va debajo de la publicación.', true);
  }
  /* Como subir ya no traba el editor, se puede llegar acá con una foto a
     medio camino: el carrusel todavía no la tiene y el post saldría sin ella,
     sin que nada lo avise. Publicar e ir a la cola son las dos cosas que no
     se pueden deshacer, así que esperan. */
  if(enCurso > 0){
    return estado('Esperá a que termine lo que se está subiendo: si no, sale sin eso.', true);
  }
  /* Y que no haya otro publicando desde otro lado. Dos publicaciones a la vez
     se pisan: Instagram procesa las piezas de las dos y devuelve errores que
     no dicen nada. */
  const otros = await otrosPublicando();
  if(otros.length){
    const o = otros[0];
    const hace = Math.max(0, Math.round(Date.now()/1000 - (o.desde || 0)));
    if(!confirm(`Hay algo publicándose desde ${o.donde || 'otro equipo'} `
      + `hace ${hace} segundos: «${o.que}». Publicar dos cosas a la vez las hace `
      + 'chocar. ¿Seguimos igual?')) return;
  }
  const redes = redesElegidas();
  if(!redes.length) return estado('Elegí al menos una red, arriba de Publicar.', true);
  let tiktok = null;
  if(redes.includes('tiktok')){
    tiktok = await pasoTiktok(redes, { programar: true });
    if(!tiktok) return;
  }
  ev.target.disabled = true;
  const despierto = await mantenerDespierto();
  abrirTrabajo();
  congelar(true);   // las imágenes se generan ahora, con lo que hay ahora
  empezarActividad(`programando ${placa.nombre || 'una placa'}`);
  try{
    const carga = await cargaParaProgramar();
    trabajo('Anotando en la cola', null);
    await api('api/programar.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clave: clave(), placa_id: placa.id, nombre: placa.nombre, formato: placa.formato,
        // se manda el instante absoluto: el servidor puede estar en otra zona
        publicar_en: new Date(cuando).toISOString(),
        carga: { ...carga, caption: armarCaption(),
                 colaboradores: placa.colaboradores || '',
                 etiquetados: placa.etiquetados || '', redes, tiktok },
      }),
    });
    estado(`Programado: sale el ${fechaLarga(new Date(cuando))} en ${enRedes(redes)}`);
    elegidaAMano = false;      // la próxima arranca otra vez en la mejor hora libre
    await pintarCola();
    pintarMejores();
  }catch(e){
    // si chocaba con otra, el servidor dice qué hora libre hay cerca: queda puesta
    if(e.datos?.sugerencia){
      $('#cuando').value = aLocal(new Date(e.datos.sugerencia));
      decirCuando();
      estado(e.message + ' Te dejé puesta la hora libre más cercana.', true);
    }else estado(e.message, true);
  }
  finally{
    cerrarTrabajo(); congelar(false); terminarActividad();
    despierto?.release().catch(() => {});
    ev.target.disabled = false;
  }
});

$('#cola').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-cola]');
  if(!b) return;
  const li = b.closest('li[data-id]');
  const id = Number(li.dataset.id);
  const caja = li.querySelector('.cola-mover');
  const pedir = (cuerpo) => api('api/programar.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: clave(), id, ...cuerpo }),
  });
  try{
    switch(b.dataset.cola){
      case 'mover': {
        // arranca en la hora que tenía, o en una hora más si esa ya pasó
        const antes = new Date(li.dataset.cuando);
        const campo = caja.querySelector('input');
        campo.min = aLocal(new Date());
        campo.value = aLocal(antes > Date.now() ? antes : new Date(Date.now() + 3600000));
        caja.hidden = false;
        campo.focus();
        return;
      }
      case 'cerrar':
        caja.hidden = true;
        return;
      case 'guardar': {
        const v = caja.querySelector('input').value && redondearMedia(caja.querySelector('input').value);
        if(!v) return;
        b.disabled = true;
        const r = await pedir({ tarea: 'mover', publicar_en: new Date(v).toISOString() });
        caja.hidden = true;
        estado('Ahora sale el ' + fechaLarga(new Date(r.publicar_en)));
        break;
      }
      case 'ahora': {
        if(!confirm('¿Publicarla ahora mismo, sin esperar la hora?')) return;
        b.disabled = true;
        b.textContent = 'Publicando…';
        const r = await pedir({ tarea: 'ahora' });
        estado('Publicada' + (r.aviso ? ' — ' + r.aviso : ''));
        break;
      }
      case 'quitar':
        if(!confirm('¿Cancelar esta publicación? No va a salir.')) return;
        await api('api/programar.php?id=' + id, { method: 'DELETE' });
        estado('Cancelada');
        break;
    }
  }catch(e){
    estado(e.message + (e.datos?.sugerencia ? ` Hay lugar el ${fechaLarga(new Date(e.datos.sugerencia))}.` : ''), true);
  }
  if(caja) caja.hidden = true;
  await pintarCola();
  pintarMejores();
});

$('#copiar').addEventListener('click', async () => {
  const texto = armarCaption();
  try{
    await navigator.clipboard.writeText(texto);
    estado('Descripción copiada' + (placa.colaboradores ? ' — los colaboradores se agregan en Instagram' : ''));
  }catch(e){ estado('No se pudo copiar: ' + e.message, true); }
});

$('#bajar_carrusel').addEventListener('click', async (ev) => {
  ev.target.disabled = true;
  abrirTrabajo();
  congelar(true);
  trabajo('Generando las imágenes', null);
  try{
    const n = await exportarCarrusel();
    estado(`Listas ${n} imagen${n > 1 ? 'es' : ''} en JPEG ${ANCHO_FEED}×${altoDe(ANCHO_FEED)}`);
  }catch(e){ estado(e.message, true); }
  finally{ cerrarTrabajo(); congelar(false); ev.target.disabled = false; }
});

/* Los videos del carrusel tal cual se suben. Es el mismo trabajo que hace
   publicar —grabar si hay que grabar, subir, y quedarse con la dirección—,
   así que lo que quede en la caché lo aprovecha publicar después: mirar el
   video antes no cuesta una segunda grabación. */
$('#bajar_videos').addEventListener('click', async (ev) => {
  ev.target.disabled = true;
  const despierto = await mantenerDespierto();
  abrirTrabajo();
  congelar(true);   // se graba con lo que la placa tiene ahora
  trabajo('Preparando los videos', 0, 'Quedan igual que al publicar.');
  try{
    const archivos = await videosDelCarrusel(
      (a) => trabajo('Preparando los videos', a, 'Quedan igual que al publicar.'));
    if(!archivos.length) throw new Error('El carrusel no tiene ningún video');
    cerrarTrabajo(); congelar(false);
    for(const a of archivos){
      bajar(a, a.name);
      await new Promise((r) => setTimeout(r, 350));   // de golpe el navegador los bloquea
    }
    estado(`Se ${archivos.length > 1 ? 'descargaron' : 'descargó'} `
      + `${archivos.length} video${archivos.length > 1 ? 's' : ''}, `
      + 'igual que como van a subir');
  }catch(e){ estado(e.message, true); }
  finally{
    cerrarTrabajo(); congelar(false); terminarActividad();
    despierto?.release().catch(() => {});
    ev.target.disabled = false;
  }
});

/* El reel terminado, para tenerlo en el teléfono o subirlo a mano. Si ya se
   grabó para publicar y no cambió nada, se baja el mismo y es instantáneo. */
$('#bajar_reel').addEventListener('click', async (ev) => {
  ev.target.disabled = true;
  const despierto = await mantenerDespierto();
  abrirTrabajo();
  congelar(true);   // el titular se le quema encima con lo que hay ahora
  try{
    if(placa.formato === 'voz'){
      // el mismo que se va a publicar: si ya está armado, sale al instante
      const { blob } = await grabarVozDePlaca();
      bajar(blob, baseNombre() + '.mp4');
    }else if(!placa.reel_crudo && placa.video){
      // los de antes ya están hechos: se bajan del servidor y listo
      const r = await fetch(placa.video);
      bajar(await r.blob(), baseNombre() + '.mp4');
    }else{
      const { blob } = await grabarReel();
      bajar(blob, baseNombre() + '.mp4');
    }
    estado('Video listo, se descargó');
  }catch(e){ estado(e.message, true); }
  finally{
    cerrarTrabajo(); congelar(false); terminarActividad();
    despierto?.release().catch(() => {});
    ev.target.disabled = false;
  }
});

/* Una foto nueva parte entera y centrada: así no se corta aunque venga con
   otra resolución. */
async function reemplazarFoto(campo, archivo){
  abrirTrabajo();   // sin congelar: subir no dibuja nada, se sigue trabajando
  trabajo('Subiendo la foto', null, archivo.name);
  const suPlaca = placa;   // si mientras sube se cambia de noticia, es de la otra
  try{
    const { ruta } = await guardarFoto(archivo);
    if(placa !== suPlaca) return estado('La foto subió, pero ya estabas en otra noticia.', true);
    placa[campo + '_ajuste'] = 'completa';
    placa[campo + '_x'] = 50;
    placa[campo + '_y'] = 50;
    cambio(campo, ruta);
    await pintarFotos();
  }finally{ cerrarTrabajo(); }
}

async function reemplazarLamina(i, archivo){
  if(esVideo(archivo)) return agregarVideo(archivo, i);   // ese trae su propio aviso
  abrirTrabajo();
  trabajo('Subiendo la foto', null, archivo.name);
  const suPlaca = placa;
  try{
    const { ruta } = await guardarFoto(archivo);
    if(placa !== suPlaca) return estado('La foto subió, pero ya estabas en otra noticia.', true);
    placa.laminas[i] = { foto: ruta, ajuste: 'completa', x: 50, y: 50 };
    cambio('laminas', placa.laminas);
    await pintarLaminas();
    estado('Foto del carrusel actualizada');
  }finally{ cerrarTrabajo(); }
}

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  const archivo = el.files && el.files[0];
  if(!archivo) return;

  try{
    if(el.dataset.reelVideo !== undefined){
      await agregarReel(archivo);
    }else if(el.dataset.vozAudio !== undefined){
      await agregarAudioVoz(archivo);
    }else if(el.dataset.laminaFoto !== undefined){
      await reemplazarLamina(Number(el.dataset.laminaFoto), archivo);
      estado('Foto del carrusel actualizada');
    }else if(el.dataset.foto){
      estado('Guardando ' + archivo.name + '…');
      await reemplazarFoto(el.dataset.foto, archivo);
      estado('Foto actualizada');
    }
  }catch(e){ estado(e.message, true); }
  el.value = '';
});

/* ------------------------------------------------------------------ */
/* video: quemar el degradado y el logo encima                          */
/* ------------------------------------------------------------------ */

const TIPO_MP4 = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
/* Los topes de Instagram, según su documentación: el reel llega a 15 minutos
   y 300 MB. Para el video del carrusel no publican un número, así que se deja
   en 3 minutos: da de sobra para una nota y mantiene la grabación dentro de
   algo tolerable, porque es en tiempo real. */
const DURACION_MAX = 180;
const DURACION_REEL = 900;

const enMinutos = (s) => {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
};

/* Safari nombra el códec distinto según la versión, y con el nombre largo
   contesta que no puede. Se prueban de más preciso a más general; todos son
   MP4 con H.264, que es lo único que Instagram acepta. */
function tipoDeSalida(){
  const opciones = [TIPO_MP4, 'video/mp4;codecs=avc1,mp4a', 'video/mp4;codecs=avc1', 'video/mp4'];
  return opciones.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

/* El teléfono apaga la pantalla solo y con eso frena el video, los temporizadores
   y la grabación: la publicación quedaba colgada sin terminar nunca. */
async function mantenerDespierto(){
  try{ return await navigator.wakeLock.request('screen'); }
  catch(e){ return null; }   // no todos los navegadores lo tienen
}

/* La pantalla encendida mientras sube un archivo.
   Grabar y publicar ya lo hacían, pero guardar el video recién elegido no,
   y es justo la subida más larga: el video entero, tal cual salió del
   teléfono. Encima el editor invita a seguir trabajando mientras tanto, y a
   los pocos segundos sin tocar la pantalla el teléfono se bloquea; con la
   pantalla apagada el navegador suspende la pestaña y la subida queda
   congelada en el porcentaje en que estaba.
   El sistema suelta el bloqueo cada vez que uno se va a otra app —a
   WhatsApp a copiar el titular, por ejemplo—, así que se vuelve a pedir al
   regresar, mientras la subida siga en curso. */
async function despiertoMientras(promesa){
  let bloqueo = await mantenerDespierto();
  const alVolver = async () => {
    if(!document.hidden && (!bloqueo || bloqueo.released)) bloqueo = await mantenerDespierto();
  };
  document.addEventListener('visibilitychange', alVolver);
  try{ return await promesa; }
  finally{
    document.removeEventListener('visibilitychange', alVolver);
    bloqueo?.release().catch(() => {});
  }
}

/* Cuántos bits por segundo lleva el video grabado. Manda el tamaño del
   archivo y, con eso, lo que tarda en subir; no cambia lo que tarda la
   grabación, que va contra el reloj.
   Medido sobre cinco segundos: a 3,5 Mbps el archivo queda en el 78% y a
   2,5 en el 67%. Instagram recomprime todo igual, así que en modo rápido la
   pérdida casi no se ve y se sube un tercio menos. */
/* Declaradas como función y no como constante a propósito: se usan más
   arriba, al pintar el control, y una constante todavía no existiría. */
/* La calidad, el camino y la marca del video se elegían en «Más». Se
   sacaron del panel y quedan fijos en lo que ya se usaba: calidad alta,
   camino rápido y sin nada encima. Lo guardado de antes en este navegador
   se borra al arrancar, para que nadie quede atado a una elección que ya no
   puede cambiar. */
for(const k of ['calidad_video', 'codecs_rapido', 'marca_en_video_2']) localStorage.removeItem(k);

function calidadVideo(){ return 'alta'; }

/* Si los videos del carrusel llevan el logo y el degradado quemados encima.
   Viene apagado. Dibujarles algo obliga a recomprimirlos enteros, y de ahí
   salían el peso, la espera y —sobre todo— los tirones: recomprimir es lo
   que hacía caer al camino que pierde cuadros. Sin dibujar nada el video se
   manda tal cual llegó, que es como se ve bien.
   La placa del carrusel lleva el logo igual, así que el post sigue firmado.
   Se puede volver a encender desde el panel cuando convenga. */
/* La clave cambió de nombre a propósito. Al probar los dos modos, el
   navegador de quien probó quedó con «con logo» guardado, y eso le ganaba al
   valor por omisión: seguía quemando la marca aunque el editor viniera
   configurado para no hacerlo. Con un nombre nuevo, lo guardado antes deja de
   contar y todos arrancan sin marca; el que la quiera la vuelve a encender. */
function marcaEnVideo(){ return false; }
function tasaDeVideo(){
  return calidadVideo() === 'rapida'
    ? 2_500_000
    : (innerWidth < 900 ? 5_000_000 : 8_000_000);
}

/* Cuántos bits por segundo merece la salida.
   Estuvo un rato calculado sobre los píxeles del ORIGINAL, con el argumento
   de que agrandar no inventa detalle. El argumento es cierto y la conclusión
   estaba mal: el codificador no comprime el original, comprime el cuadro de
   salida, y encima de ese cuadro van el titular, el logo y el degradado, que
   se dibujan a resolución completa y sí son detalle nuevo.
   Medido con contenido movido y con grano, a 1080x1350: bajar de 8 a 3 Mbps
   cuesta 0,86 dB, y sobre un original que venía bien la pérdida total llega
   a 3,3. Así que la cuenta va sobre los píxeles de la SALIDA.
   No hace falta ser tacaño: el control de tasa gasta lo que necesita y no
   más —con contenido fácil se planta en 3,8 Mbps aunque se le ofrezcan 12—,
   así que pedir de sobra no engorda los archivos que no lo piden.
   El perfil del códec, de paso, no cambia nada: medidos Main y High dan lo
   mismo que Baseline a igual tasa. */
function tasaDeSalida(ancho, alto){
  const tope = tasaDeVideo();
  const pixeles = (ancho || 0) * (alto || 0);
  if(!pixeles) return tope;
  return Math.round(Math.min(tope, Math.max(3_000_000, pixeles * 30 * 0.18)));
}


/* ------------------------------------------------------------------ */
/* grabar sin depender del reloj                                       */
/* ------------------------------------------------------------------ */

/* El camino viejo reproduce el video y graba lo que se ve: tarda lo que dura
   el video, y si el aparato no llega a componer 30 cuadros por segundo, los
   que faltan se pierden —el tirón— y el final puede quedar corto.
   Este camino no reproduce nada. Abre el archivo, saca los cuadros
   comprimidos, los descomprime uno por uno, les dibuja lo que va encima y los
   vuelve a comprimir. Va tan rápido como pueda el aparato, no pierde ninguno,
   y si se cambia de pestaña solo va más lento.
   El audio se copia tal cual, sin volver a comprimirlo. */

/* El camino rápido: descomprimir, dibujar y volver a comprimir, sin reloj de
   por medio. Estuvo apagado mientras el archivo que producía no se dejaba
   recorrer; ya se dejó, y medido da 600 cuadros de 600 en una décima parte de
   lo que dura el video, contra 29% de los cuadros en tiempo real.
   Va encendido salvo que se lo apague a mano, y si el navegador no lo tiene
   —o si algo falla en el medio— se graba a la antigua sin que nadie se entere.
   Guardar un '0' es la salida de emergencia si aparece un video que lo rompa. */
const hayCodecs = () => typeof VideoEncoder === 'function' && typeof VideoDecoder === 'function';

async function quemarConCodecs(fuente, pintar, avisar, ancho, alto){
  const buffer = typeof fuente === 'string'
    ? await (await fetch(fuente)).arrayBuffer()
    : await fuente.arrayBuffer();

  const { video, audio } = leerMp4(buffer);
  /* Sin muestras, el archivo tiene una forma que el lector no conoce. Se
     dice cuál es el caso para que no parezca un archivo roto, y quien llama
     se pasa al camino lento, que reproduce el video y no necesita leerlo. */
  if(!video || !video.muestras.length){
    const fragmentado = new TextDecoder('latin1')
      .decode(new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 4096))))
      .includes('mvex');
    throw new Error(fragmentado
      ? 'el video viene fragmentado y este camino no lo puede leer'
      : 'no se pudo leer el índice del video');
  }
  if(!video.descripcion) throw new Error('el video no viene ni en H.264 ni en HEVC');

  /* Se pregunta antes si este aparato sabe decodificarlo. HEVC —lo que
     graba el iPhone de fábrica— no lo decodifica cualquier navegador: Safari
     y Chrome en Mac sí, Chrome en Windows depende de la placa de video. Sin
     preguntar, fallaba a mitad de camino con un error que no decía nada. */
  const configDec = {
    codec: video.codec, description: video.descripcion,
    codedWidth: video.ancho, codedHeight: video.alto,
  };
  const { supported } = await VideoDecoder.isConfigSupported(configDec).catch(() => ({}));
  if(!supported){
    throw new Error(`este navegador no decodifica ${/^(hvc1|hev1)/.test(video.codec) ? 'HEVC' : video.codec}`
      + ' por el camino rápido');
  }

  /* Un lienzo normal y no uno fuera de pantalla: el de fuera de pantalla no
     siempre trae todo lo del dibujo —el espaciado entre letras, por ejemplo—
     y ahí el titular no llegaba a dibujarse. */
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d');

  const muestras = [];
  let descripcion = null, falla = null, cerrado = false;
  const enc = new VideoEncoder({
    output: (trozo, meta) => {
      if(cerrado) return;
      if(meta?.decoderConfig?.description && !descripcion){
        descripcion = new Uint8Array(meta.decoderConfig.description);
      }
      const datos = new Uint8Array(trozo.byteLength);
      trozo.copyTo(datos);
      muestras.push({ datos, clave: trozo.type === 'key', tiempo: trozo.timestamp });
    },
    error: (e) => { falla = e; },
  });
  /* Por software a propósito. El codificador por hardware cambia su propia
     descripción a mitad del trabajo —el controlador se reinicia— y un MP4 no
     admite que eso cambie: el archivo queda inservible. Por software es
     estable, y como decodificar va rapidísimo, sigue saliendo mucho más
     rápido que reproducir el video entero. */
  /* El nivel del códec va en las dos últimas cifras del nombre. El 1f es el
     nivel 3.1, que topa en 921.600 píxeles: un reel de 1080x1920 necesita más
     del doble y el codificador lo rechaza. El 2a es el nivel 4.2, que llega a
     2.228.224 y cubre de sobra cualquier formato de Instagram. */
  /* La salida va a ritmo constante, aunque el origen no lo tenga.
     Casi todo lo que sale de un teléfono, de CapCut o de una IA viene con
     ritmo variable: los cuadros no caen cada 33,3 ms sino cuando el editor
     decidió, mezclando tramos de 24, 30 y 60 por segundo en el mismo archivo.
     Medido sobre esta misma tubería: entra variable y salía variable, porque
     se conservaban los tiempos del original tal cual.
     Eso se ve bien en la computadora y da saltitos después de que Instagram
     lo reprocesa, que es el efecto de «se veía perfecto y quedó lageado».
     Así que se emite un cuadro en cada instante exacto de la rejilla, con el
     último que haya llegado: si el origen va más lento se repite, si va más
     rápido se descarta. El archivo queda parejo de punta a punta. */
  const ritmoOrigen = (() => {
    /* El promedio y no la mediana: en un video desparejo —y los que llegan
       suelen serlo— la mediana la fija un puñado de cuadros muy juntos y
       daba 60 para un video que en realidad corre a seis por segundo. El
       promedio sale de lo único que no miente, cuántos cuadros hay y cuánto
       dura el video entero. */
    const total = video.muestras.reduce((s, m) => s + (m.duracion || 0), 0);
    if(!total || !video.muestras.length) return 30;
    const porSegundo = video.muestras.length / (total / video.reloj);
    return porSegundo > 45 ? 60 : 30;   // un 60 de verdad se respeta
  })();
  const PASO = Math.round(1e6 / ritmoOrigen);

  /* El ritmo va acá y no un 30 fijo: es lo que el codificador usa para
     repartir los bits entre cuadros. Diciéndole 30 mientras se le entregan 60
     reparte el doble de lo que corresponde a cada uno. */
  enc.configure({
    codec: 'avc1.42002a', width: ancho, height: alto,
    bitrate: tasaDeSalida(ancho, alto), framerate: ritmoOrigen, avc: { format: 'avc' },
    hardwareAcceleration: 'prefer-software', latencyMode: 'quality',
  });

  let siguiente = 0;          // el próximo instante de la rejilla, en microsegundos
  let hayDibujo = false;      // hasta que llegue el primer cuadro no hay qué emitir
  let emitidos = 0;

  const emitir = () => {
    const salida = new VideoFrame(lienzo, { timestamp: siguiente, duration: PASO });
    // una clave cada dos segundos, para que se pueda saltar dentro del video
    enc.encode(salida, { keyFrame: emitidos % (ritmoOrigen * 2) === 0 });
    salida.close();
    emitidos++;
    /* El casillero siguiente se calcula desde cero y no sumando PASO: PASO
       está redondeado —33.333 µs en vez de 33.333,33—, y al sumarlo la
       rejilla se iba atrasando respecto de los cuadros. */
    siguiente = Math.round(emitidos * 1e6 / ritmoOrigen);
  };

  const total = video.muestras.length;
  let hechos = 0;
  const dec = new VideoDecoder({
    output: (cuadro) => {
      if(cerrado){ cuadro.close(); return; }
      try{
        // los instantes que este cuadro deja atrás se llenan con lo anterior
        /* Cada cuadro va al casillero más cercano a su hora. Antes iba al
           primero que le quedaba atrás: con la hora apenas corrida por el
           redondeo —un microsegundo— el casillero se llenaba con el cuadro
           anterior, que salía repetido, y todo el video quedaba corrido uno.
           Medido con una pelota que cruza la pantalla: se quedaba quieta un
           cuadro al principio. */
        while(hayDibujo && siguiente + PASO / 2 <= cuadro.timestamp) emitir();
        pintar(ctx, cuadro, siguiente / 1e6);
        hayDibujo = true;
      }finally{
        cuadro.close();
        hechos++;
        if(hechos % 5 === 0) avisar?.(hechos / total);
      }
    },
    error: (e) => { falla = e; },
  });
  dec.configure(configDec);

  const cerrarTodo = () => {
    cerrado = true;
    try{ if(dec.state !== 'closed') dec.close(); }catch(e){}
    try{ if(enc.state !== 'closed') enc.close(); }catch(e){}
  };

  try{
  for(const m of video.muestras){
    if(falla) throw falla;
    if(cortaron()) throw new Error('Cancelado');
    dec.decode(new EncodedVideoChunk({
      type: m.clave ? 'key' : 'delta',
      timestamp: Math.round(m.tiempo * 1e6 / video.reloj),
      duration: Math.round(m.duracion * 1e6 / video.reloj),
      data: m.datos,
    }));
    /* Se frena hasta que los codecs hagan lugar; sin esto la cola crece sin
       límite y el aparato se queda sin memoria.
       Antes se preguntaba cada 6 ms con setTimeout, y esperar costaba más que
       trabajar: un setTimeout de 6 ms tarda unos 6,75 ms de reloj real, y con
       la pestaña de fondo el navegador lo estira a un segundo. Ahora se espera
       el aviso propio del codec —`dequeue`, que llega cuando de verdad sacó
       algo de la cola— con un plazo corto por las dudas. */
    while(dec.decodeQueueSize > 20 || enc.encodeQueueSize > 20){
      await new Promise((r) => {
        let plazo = 0;
        const seguir = () => {
          clearTimeout(plazo);
          dec.removeEventListener('dequeue', seguir);
          enc.removeEventListener('dequeue', seguir);
          r();
        };
        dec.addEventListener('dequeue', seguir);
        enc.addEventListener('dequeue', seguir);
        plazo = setTimeout(seguir, 100);
      });
      if(falla) throw falla;
    }
  }
  await dec.flush(); dec.close();
  /* Lo que quedó dibujado cubre hasta el final del original: se emiten los
     instantes que faltan para no cortar el video antes de tiempo. */
  const duracionOrigen = video.muestras.reduce((a, m) => a + m.duracion, 0) / video.reloj * 1e6;
  // con la misma tolerancia: si no, el redondeo agregaba un cuadro de más al final
  while(hayDibujo && siguiente + PASO / 2 <= duracionOrigen) emitir();
  if(!emitidos && hayDibujo) emitir();       // un original de un solo cuadro
  await enc.flush(); enc.close();
  cerrado = true;
  }catch(e){ cerrarTodo(); throw e; }
  if(falla) throw falla;
  if(!muestras.length) throw new Error('no salió ningún cuadro');

  /* Todas las muestras duran lo mismo: se emitieron sobre una rejilla fija.
     No hace falta deducir la duración de la distancia entre cuadros, que era
     lo que arrastraba el ritmo irregular del original hasta el archivo final. */
  muestras.sort((a, b) => a.tiempo - b.tiempo);
  const duracionPareja = Math.max(1, Math.round(PASO * RELOJ / 1e6));
  const pistaVideo = {
    tipo: 'video', reloj: RELOJ, ancho, alto, descripcion,
    muestras: muestras.map((m) => ({ datos: m.datos, clave: m.clave,
                                     duracion: duracionPareja })),
  };

  const pistas = [pistaVideo];
  if(audio && audio.descripcion && audio.muestras.length){
    pistas.push({
      tipo: 'audio', reloj: audio.reloj, canales: audio.canales || 2,
      muestreo: audio.muestreo || audio.reloj, descripcion: audio.descripcion,
      muestras: audio.muestras.map((m) => ({ datos: m.datos, duracion: m.duracion })),
    });
  }
  return armarMp4(pistas);
}


/* Grabar es a reloj: el video se reproduce a velocidad normal y se captura
   lo que el lienzo tenga en ese instante. Si el navegador deja de llamar al
   dibujo treinta veces por segundo, esos cuadros no existen en el archivo, y
   eso es lo que después se ve como tirones.
   Puede pasar por dos motivos muy distintos que la bitácora no distinguía:
   la pestaña se fue al fondo —ahí el navegador la castiga a propósito— o el
   aparato no da abasto. El primero se arregla dejando la pantalla a la vista
   y el segundo no, así que conviene saber cuál fue. Dibujar cuesta unos 4 ms
   de los 33 que hay, o sea que el dibujo nunca es el culpable: siempre es
   que no lo llamaron. */
/* El veredicto, aparte y sin nada alrededor, para poder probarlo solo.
   Los dos umbrales: medio segundo al fondo ya explica cualquier tirón, y una
   pausa de 200 ms son seis cuadros perdidos de una, que no se explica por
   dibujar —eso cuesta 4 ms— sino porque no llamaron al dibujo. */
function porQueSeCorto(pausaMax, alFondo){
  if(alFondo > 500) return 'la pantalla no estuvo a la vista';
  if(pausaMax > 200) return 'el aparato no dio abasto';
  return '-';
}

/* El reloj entra por parámetro para poder probar esto sin depender de cuánto
   tarde de verdad la máquina. En el editor siempre es performance.now. */
function vigilarFluidez(ahoraFn = () => performance.now(), oculto = () => document.hidden){
  let ultimo = ahoraFn();
  let primera = true;
  // `null` y no 0: el instante cero es un instante válido, y usarlo como
  // «no está al fondo» hacía que ese caso no se contara nunca
  let pausaMax = 0, alFondo = 0, desde = oculto() ? ultimo : null;
  const alCambiar = () => {
    const ahora = ahoraFn();
    if(oculto()){ desde = ahora; }
    else if(desde !== null){ alFondo += ahora - desde; desde = null; }
  };
  document.addEventListener('visibilitychange', alCambiar);
  return {
    latido(){
      const ahora = ahoraFn();
      // la primera vuelta no cuenta: mediría la espera hasta arrancar, que
      // incluye cargar el video y no tiene nada que ver con la fluidez
      if(!primera) pausaMax = Math.max(pausaMax, ahora - ultimo);
      primera = false;
      ultimo = ahora;
    },
    fin(){
      document.removeEventListener('visibilitychange', alCambiar);
      if(desde !== null) alFondo += ahoraFn() - desde;
      return {
        pausaMax: Math.round(pausaMax) + ' ms',
        fondo: alFondo > 500 ? seg(alFondo) : 'no',
        porque: porQueSeCorto(pausaMax, alFondo),
      };
    },
  };
}

/* iOS no reproduce un <video> que no está colgado de la página: se queda en
   el primer cuadro y la grabación no avanza nunca —el porcentaje se clava y
   parece colgado—. Se lo pone fuera de la vista mientras dura el trabajo.
   Ni display:none ni opacity:0 sirven: con eso deja de decodificar. */
function enEscena(video){
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  Object.assign(video.style, {
    position: 'fixed', left: '0', top: '0', width: '2px', height: '2px',
    opacity: '0.01', pointerEvents: 'none', zIndex: '-1',
  });
  document.body.appendChild(video);
  return () => video.remove();
}

/* Reproduce hasta el final, pero no espera para siempre. Si el video deja de
   avanzar —pestaña dormida, memoria, un archivo cortado— corta con un motivo
   en vez de dejar el botón girando. */
function reproducirHastaElFinal(video){
  return new Promise((listo, falla) => {
    let posicion = -1, quieto = 0;
    const reloj = setInterval(() => {
      if(cortaron()){ cerrar(); video.pause(); return falla(new Error('Cancelado')); }
      if(video.currentTime !== posicion){ posicion = video.currentTime; quieto = 0; return; }
      quieto += 0.5;
      if(quieto >= 24){
        cerrar();
        falla(new Error('El video dejó de avanzar. Suele pasar si la pantalla se apaga '
          + 'o si se cambia de aplicación mientras se procesa: dejá esta pantalla a la vista.'));
      }
    }, 500);
    const cerrar = () => { clearInterval(reloj); video.onended = null; video.onerror = null; };
    video.onended = () => { cerrar(); listo(); };
    video.onerror = () => { cerrar(); falla(new Error('El video se cortó a mitad de camino')); };
    video.play().catch((e) => {
      cerrar();
      falla(new Error('El navegador no dejó reproducir el video: ' + e.message));
    });
  });
}

/* Se reproduce el video, se dibuja cada cuadro dentro de la moldura junto
   con el logo, y se graba la salida. La grabación es en tiempo real: un
   video de 30 segundos tarda 30 segundos. No hay forma de acelerarlo con
   MediaRecorder, y a cambio el resultado sale en MP4/H.264, que es el
   único formato que Instagram acepta. */
async function quemarVideo(archivo, lamina, avisar){
  const tipo = tipoDeSalida();
  if(!tipo){
    throw new Error('Este navegador no puede generar MP4, que es lo único que acepta '
      + 'Instagram. Probá con Chrome, o con Safari actualizado.');
  }

  const video = document.createElement('video');
  // sirve tanto un archivo recién elegido como uno ya guardado en el servidor
  const propia = typeof archivo !== 'string';
  video.src = propia ? URL.createObjectURL(archivo) : archivo;
  video.muted = false;
  const sacarDeEscena = enEscena(video);
  try{
  await esperarMetadatos(video);
  if(video.duration > DURACION_MAX + 0.5){
    throw new Error(`El video dura ${enMinutos(video.duration)} y el máximo son `
      + `${enMinutos(DURACION_MAX)}. Recortalo y volvé a elegirlo.`);
  }

  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO_FEED; lienzo.height = altoDe(ANCHO_FEED);
  const ctx = lienzo.getContext('2d');
  const logo = await cargarImagen(LOGO);

  const flujo = lienzo.captureStream(30);

  // el audio del video se engancha aparte; sin esto la salida sale muda
  let audio = null;
  try{
    audio = new AudioContext();
    // iOS lo entrega dormido: sin esto la salida queda muda
    if(audio.state === 'suspended') await audio.resume();
    const fuente = audio.createMediaElementSource(video);
    const destino = audio.createMediaStreamDestination();
    fuente.connect(destino);
    destino.stream.getAudioTracks().forEach((t) => flujo.addTrack(t));
  }catch(e){ /* si el video no trae audio, sigue sin él */ }

  const tasa = tasaDeSalida(ANCHO_FEED, altoDe(ANCHO_FEED));
  const grabador = new MediaRecorder(flujo, {
    mimeType: tipo, videoBitsPerSecond: tasa,
  });
  const trozos = [];
  grabador.ondataavailable = (e) => { if(e.data.size) trozos.push(e.data); };
  let falloGrabador = null;
  grabador.onerror = (e) => { falloGrabador = e.error || new Error('falló la grabación'); };

  const vigia = vigilarFluidez();
  let dibujando = true, cuadros = 0;
  const pintar = () => {
    if(!dibujando) return;
    vigia.latido();
    dibujarLamina(ctx, placa, lamina, video, logo, ANCHO_FEED);
    cuadros++;
    if(video.duration) avisar?.(video.currentTime / video.duration);
    setTimeout(pintar, 33);   // ~30 cuadros por segundo
  };

  // igual que en el reel: sin un cuadro listo, lo primero que se graba es
  // el lienzo vacío y eso termina siendo la portada
  video.currentTime = 0;
  await new Promise((r) => {
    if(video.readyState >= 2) return r();
    video.onloadeddata = r;
    setTimeout(r, 1500);
  });
  dibujarLamina(ctx, placa, lamina, video, logo, 1080);

  const listo = new Promise((r) => { grabador.onstop = r; });
  const despierto = await mantenerDespierto();
  try{
    grabador.start();
    pintar();
    await reproducirHastaElFinal(video);
  }finally{
    dibujando = false;
    if(grabador.state !== 'inactive') grabador.stop();
    despierto?.release().catch(() => {});
  }
  await listo;
  audio?.close();

  /* Acá se ve el tirón con números. La grabación va contra el reloj, así que
     si el aparato no llega a dibujar 30 cuadros por segundo, los que faltan
     no existen en el archivo: eso es lo que se ve como saltos. */
  const esperados = Math.round((video.duration || 0) * 30);
  const logrados = cuadros;
  const porciento = esperados ? Math.round(logrados / esperados * 100) : 100;
  anotar('grabado', {
    dura: seg((video.duration || 0) * 1000),
    cuadros: `${logrados} de ${esperados}`,
    fluidez: porciento + '%',
    origen: `${video.videoWidth}x${video.videoHeight}`,
    tasa: (tasa / 1e6).toFixed(1) + ' Mbps',
    ...vigia.fin(),
    nivel: porciento < 80 ? 'mal' : (porciento < 95 ? 'aviso' : 'ok'),
  });

  if(falloGrabador) throw falloGrabador;
  if(!trozos.length) throw new Error('La grabación salió vacía. Probá con un video más corto.');

  // una imagen del primer cuadro, para la vista previa y las miniaturas
  video.currentTime = 0;
  await new Promise((r) => { video.onseeked = r; setTimeout(r, 500); });
  dibujarLamina(ctx, placa, lamina, video, logo, 1080);
  const portada = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.9));

  if(propia) URL.revokeObjectURL(video.src);
  return { video: new Blob(trozos, { type: 'video/mp4' }), portada };
  }finally{ sacarDeEscena(); }
}

const ANIMACION = 1.2;   // segundos que tarda en entrar el titular

/* Igual que quemarVideo pero vertical y con el titular animado. La
   animación ocupa el primer segundo y pico; después queda fijo. */
async function quemarReel(fuente, avisar){
  const tipo = tipoDeSalida();
  if(!tipo){
    throw new Error('Este navegador no puede generar MP4, que es lo único que acepta '
      + 'Instagram. Probá con Chrome, o con Safari actualizado.');
  }
  const video = document.createElement('video');
  // sirve tanto un archivo recién elegido como uno ya guardado en el servidor
  const propia = typeof fuente !== 'string';
  video.src = propia ? URL.createObjectURL(fuente) : fuente;
  const sacarDeEscena = enEscena(video);
  try{
  await esperarMetadatos(video);
  if(video.duration > DURACION_REEL + 0.5){
    throw new Error(`El reel dura ${enMinutos(video.duration)} y el máximo que acepta `
      + `Instagram son ${enMinutos(DURACION_REEL)}. Recortalo y volvé a elegirlo.`);
  }

  const lienzo = document.createElement('canvas');
  lienzo.width = REEL.ancho;
  lienzo.height = REEL.alto;
  const ctx = lienzo.getContext('2d');
  const logo = await cargarImagen(LOGO);

  const flujo = lienzo.captureStream(30);
  let audio = null;
  try{
    audio = new AudioContext();
    // iOS lo entrega dormido: sin esto la salida queda muda
    if(audio.state === 'suspended') await audio.resume();
    const fuente = audio.createMediaElementSource(video);
    const destino = audio.createMediaStreamDestination();
    fuente.connect(destino);
    destino.stream.getAudioTracks().forEach((t) => flujo.addTrack(t));
  }catch(e){ /* si no trae audio, sigue sin él */ }

  const tasa = tasaDeSalida(REEL.ancho, REEL.alto);
  const grabador = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: tasa });
  const trozos = [];
  grabador.ondataavailable = (e) => { if(e.data.size) trozos.push(e.data); };
  let falloGrabador = null;
  grabador.onerror = (e) => { falloGrabador = e.error || new Error('falló la grabación'); };

  const vigia = vigilarFluidez();
  let dibujando = true, cuadros = 0;
  const pintar = () => {
    if(!dibujando) return;
    vigia.latido();
    dibujarReel(ctx, placa, video, logo, REEL.ancho, REEL.alto,
      Math.min(1, video.currentTime / ANIMACION), false, firma);
    cuadros++;
    if(video.duration) avisar?.(video.currentTime / video.duration);
    setTimeout(pintar, 33);
  };

  /* El primer cuadro decide la portada del reel en el perfil. Si se empieza
     a grabar antes de que el video tenga un cuadro listo, lo primero que
     entra es el lienzo vacío: negro con el degradado abajo, que es lo que
     salía en la grilla. Así que se espera a tener imagen y se dibuja antes
     de arrancar la grabadora. */
  video.currentTime = 0;
  await new Promise((r) => {
    if(video.readyState >= 2) return r();
    video.onloadeddata = r;
    setTimeout(r, 1500);
  });
  dibujarReel(ctx, placa, video, logo, REEL.ancho, REEL.alto, 0, false, firma);

  const listo = new Promise((r) => { grabador.onstop = r; });
  const despierto = await mantenerDespierto();
  try{
    grabador.start();
    pintar();
    await reproducirHastaElFinal(video);
  }finally{
    dibujando = false;
    if(grabador.state !== 'inactive') grabador.stop();
    despierto?.release().catch(() => {});
  }
  await listo;
  audio?.close();

  /* Acá se ve el tirón con números. La grabación va contra el reloj, así que
     si el aparato no llega a dibujar 30 cuadros por segundo, los que faltan
     no existen en el archivo: eso es lo que se ve como saltos. */
  const esperados = Math.round((video.duration || 0) * 30);
  const logrados = cuadros;
  const porciento = esperados ? Math.round(logrados / esperados * 100) : 100;
  anotar('grabado', {
    dura: seg((video.duration || 0) * 1000),
    cuadros: `${logrados} de ${esperados}`,
    fluidez: porciento + '%',
    origen: `${video.videoWidth}x${video.videoHeight}`,
    tasa: (tasa / 1e6).toFixed(1) + ' Mbps',
    ...vigia.fin(),
    nivel: porciento < 80 ? 'mal' : (porciento < 95 ? 'aviso' : 'ok'),
  });

  if(falloGrabador) throw falloGrabador;
  if(!trozos.length) throw new Error('La grabación salió vacía. Probá con un video más corto.');

  // portada: un cuadro con el titular ya entrado
  video.currentTime = Math.min(2, video.duration / 2);
  await new Promise((r) => { video.onseeked = r; setTimeout(r, 600); });
  dibujarReel(ctx, placa, video, logo, REEL.ancho, REEL.alto, 1, false, firma);
  const portada = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.9));

  if(propia) URL.revokeObjectURL(video.src);
  return { video: new Blob(trozos, { type: 'video/mp4' }), portada };
  }finally{ sacarDeEscena(); }
}

/* El video se guarda tal cual llega. Antes se le quemaba el titular acá
   mismo, y entonces cambiar el texto no servía de nada: el video ya estaba
   hecho. Ahora se quema recién al publicar.
   El archivo elegido se ve al instante desde el propio teléfono y viaja al
   servidor de fondo: no hay razón para mirar una barra sin poder escribir. */
let videoLocal = null;      // el archivo de esta sesión, ya en el navegador
let subiendoVideo = null;   // termina cuando el crudo llegó al servidor

const fuenteDelReel = () => videoLocal || placa.video || '';

async function agregarReel(archivo){
  /* El reel anotaba solo el peso, y el peso solo no dice nada: 2 MB pueden ser
     un video corto y sano o uno largo y destruido. Se mide igual que en el
     carrusel, que es donde se vio que el problema venía de origen. */
  let viene = null;
  try{
    const el = document.createElement('video');
    el.src = URL.createObjectURL(archivo);
    el.muted = true;
    const sacar = enEscena(el);
    await new Promise((ok) => { el.onloadedmetadata = ok; el.onerror = ok; setTimeout(ok, 4000); });
    viene = comoVieneElVideo(archivo.size, el.duration, el.videoWidth, el.videoHeight);
    anotar('video elegido', { para: 'reel', peso: mb(archivo.size),
      dura: seg((el.duration || 0) * 1000),
      tamano: `${el.videoWidth}x${el.videoHeight}`,
      origen: viene ? `${viene.mbps} Mbps · ${viene.estado}` : 'sin medir',
      nivel: viene?.estado === 'machacado' ? 'aviso' : 'ok' });
    sacar(); URL.revokeObjectURL(el.src);
  }catch(e){
    anotar('video elegido', { para: 'reel', peso: mb(archivo.size) });
  }
  if(videoLocal) URL.revokeObjectURL(videoLocal);
  videoLocal = URL.createObjectURL(archivo);
  ultimoQuemado = null;
  placa.reel_crudo = 1;
  placa.portada = '';
  repintar();
  await pintarFotos();

  // el aviso va en la tarjeta del video, que es donde se está mirando
  const decir = (texto, mal) => {
    const el = $('#estado_video');
    if(el){ el.textContent = texto; el.classList.toggle('mal', !!mal); }
    estado(texto, mal);
  };
  decir('Guardando el video… 0%. Podés ir escribiendo el titular.');
  if(viene?.estado === 'machacado'){
    aviso('Este video ya viene muy comprimido',
      `Trae ${viene.mbps} Mbps, que es poco: ya tiene bloques antes de que lo `
      + 'toquemos, y va a salir así por más que lo procesemos bien. Si lo tenés '
      + 'en mejor calidad —del original y no reenviado por WhatsApp ni descargado '
      + 'de otra red— conviene usar ese.');
  }

  // si mientras sube se cambia de placa, lo subido es de la otra: no se toca
  const suPlaca = placa;
  subiendoVideo = despiertoMientras(guardarFoto(archivo, (a, nota) => {
    decir(`Guardando el video… ${Math.round(a * 100)}%. `
      + (nota || 'Podés ir escribiendo el titular.'));
  }))
    .then(({ ruta }) => {
      if(placa !== suPlaca) return ruta;
      cambio('video', ruta);
      decir('Video guardado.');
      return ruta;
    })
    .catch((e) => {
      if(placa === suPlaca){
        decir('No se guardó: ' + e.message, true);
        aviso('El video no llegó al servidor',
          e.message + ' Se ve acá porque está en este teléfono, pero si cerrás la '
          + 'página se pierde. Probá de nuevo, o con un video más corto.');
      }
      throw e;
    });
}

/* Grabar es en tiempo real: no hay forma de hacerlo más rápido. Lo que sí se
   puede es no hacerlo dos veces. Se guarda el resultado junto con la firma de
   lo que se ve en pantalla; mientras no cambie nada, se reusa. */
let ultimoQuemado = null;

const firmaDelReel = () => JSON.stringify([
  fuenteDelReel(), placa.titulo, placa.etiqueta, placa.color_fondo, placa.color_filete, firma?.nombre,
]);

/* Elige el momento de la portada. La de fábrica salía negra: muchos videos
   arrancan con un fundido, y el cuadro fijo del segundo y medio caía justo
   ahí. Se prueban varios momentos, se mide cuánta imagen tiene cada uno
   —brillo medio y cuánto varía— y gana el que más tenga. */
/* Cuánta imagen tiene un cuadro. Un cuadro negro da media y contraste casi
   cero; uno con imagen, los dos altos. Se premia el contraste, que es lo que
   de verdad se ve. */
function puntajeDeCuadro(ctx, lado){
  const d = ctx.getImageData(0, 0, lado, lado).data;
  let suma = 0, suma2 = 0, n = 0;
  for(let i = 0; i < d.length; i += 16){   // uno de cada cuatro píxeles
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    suma += v; suma2 += v * v; n++;
  }
  const media = suma / n;
  const contraste = Math.sqrt(Math.max(0, suma2 / n - media * media));
  return media * 0.6 + contraste * 1.4;
}

/* De varios momentos, el que tenga más imagen. Recibe un <video> ya cargado
   y lo deja parado en el mejor. Casi todos los videos abren con un fundido
   desde negro, así que el primer segundo casi nunca sirve de portada. */
async function mejorMomento(video, dura){
  const momentos = [1, 2, 3, 5, 8, 12].filter((t) => t < dura - 0.2);
  if(!momentos.length) momentos.push(Math.min(0.5, dura / 2));

  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 96;   // alcanza para medir, y es instantáneo
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });

  let mejor = momentos[0], mejorPuntaje = -1;
  for(const t of momentos){
    video.currentTime = t;
    await new Promise((r) => { video.onseeked = r; setTimeout(r, 900); });
    ctx.drawImage(video, 0, 0, 96, 96);
    const puntaje = puntajeDeCuadro(ctx, 96);
    if(puntaje > mejorPuntaje){ mejorPuntaje = puntaje; mejor = t; }
  }
  return mejor;
}

async function momentoDePortada(fuente){
  const video = document.createElement('video');
  const propia = typeof fuente !== 'string';
  video.src = propia ? URL.createObjectURL(fuente) : fuente;
  video.muted = true;
  const sacar = enEscena(video);
  try{
    await esperarMetadatos(video);
    const dura = video.duration || 0;
    if(!dura) return 1.5;
    return await mejorMomento(video, dura);
  }catch(e){
    return 1.5;   // ante la duda, lo de antes
  }finally{ sacar(); if(propia) URL.revokeObjectURL(video.src); }
}

async function grabarReel(){
  const fuente = fuenteDelReel();
  if(!fuente) throw new Error('Falta el video del reel');
  /* `huella` y no `firma`: con ese nombre tapaba a la firma de quien publica
     —«Publicado por»—, y el reel salía grabado sin ella. */
  const huella = firmaDelReel();
  if(ultimoQuemado && ultimoQuemado.firma === huella) return ultimoQuemado;

  const rotulo = 'Grabando el titular en el video';
  const espera = 'Se le queman encima el titular, la etiqueta y el logo.';
  const lento = espera + ' La grabación es en tiempo real, así que tarda lo que '
    + 'dura el video. Dejá esta pantalla a la vista.';
  trabajo(rotulo, 0, espera);

  // se graba desde el archivo del propio teléfono cuando está: no hay que
  // bajarlo del servidor para volver a subirlo
  let video = null;
  if(hayCodecs()){
    const arranque = Date.now();
    try{
      const logo = await cargarImagen(LOGO);
      video = await quemarConCodecs(fuente,
        (ctx, cuadro, segundos) => {
          dibujarReel(ctx, placa, cuadro, logo, REEL.ancho, REEL.alto,
            Math.min(1, segundos / ANIMACION), false, firma);
        },
        (a) => trabajo(rotulo, a, espera),
        REEL.ancho, REEL.alto);
      anotar('grabado', { camino: 'rápido', tardo: seg(Date.now() - arranque),
        fluidez: '100%', porque: 'no depende del reloj: van todos los cuadros' });
    }catch(e){
      if(String(e.message) === 'Cancelado') throw e;
      console.warn('el camino rápido no pudo, se graba a la antigua:', e.message);
      anotar('camino rápido no pudo', { porque: String(e.message).slice(0, 120),
        nivel: 'aviso' });
      video = null;
    }
  }
  if(!video){
    trabajo(rotulo, 0, lento);
    ({ video } = await quemarReel(fuente, (a) => trabajo(rotulo, a, lento)));
  }
  // primero termina de subir el crudo: dos videos grandes a la vez por la red
  // del teléfono se pisan y ninguno avanza
  await subiendoVideo?.catch(() => {});
  trabajo('Eligiendo la portada', null, 'Se busca el cuadro con más imagen, para que no salga en negro.');
  const portadaEn = await momentoDePortada(fuente);

  trabajo('Subiendo el reel', 0, 'Ya está grabado: falta que llegue al servidor.');
  const sub = await guardarFoto(new File([video], 'reel.mp4', { type: 'video/mp4' }),
    (a, nota) => trabajo('Subiendo el reel', a, nota || 'Ya está grabado: falta que llegue al servidor.'));
  ultimoQuemado = { firma: huella, ruta: sub.ruta, blob: video, portadaEn };
  return ultimoQuemado;
}

/* Lo que se manda a Instagram: acá sí se quema, con el texto que tenga la
   placa en este momento. Las de antes ya vienen quemadas del servidor. */
async function reelParaPublicar(){
  if(!fuenteDelReel()) throw new Error('Falta el video del reel');
  if(!placa.reel_crudo) return { tipo: 'reel', ruta: placa.video };
  const { ruta, portadaEn } = await grabarReel();
  return { tipo: 'reel', ruta, portadaEn };
}

/* ------------------------------------------------------------------ */
/* placa con voz                                                       */
/* ------------------------------------------------------------------ */

/* El audio ya leído y medido, para no repetirlo cada vez que se dibuja:
   medir quince minutos de voz lleva unos segundos. Va atado a la placa y
   al archivo que se midió; `ruta` es null mientras recién se eligió y
   todavía está subiendo. */
let vozMedida = null;      // { placaId, ruta, audio, medida, local }
let midiendoVoz = null;    // la medición en curso, para no arrancar dos
let ultimaVoz = null;      // el video ya armado: { firma, ruta, blob, portadaEn }
let reproduccion = null;   // la vista previa sonando: { sonido, cuadro }

const DURACION_VOZ_MIN = 3;     // Instagram no acepta reels más cortos
const DURACION_VOZ_MAX = 900;   // ni más largos que 15 minutos

/* Todo lo que cambia el video. Si nada de esto cambió desde la última vez,
   publicar usa el que ya está armado y subido, en vez de armarlo de nuevo. */
const CAMPOS_VOZ = ['audio', 'titulo', 'etiqueta', 'color_fondo', 'color_filete', 'diseno',
  'foto_izq', 'foto_izq_x', 'foto_izq_y', 'foto_izq_ajuste',
  'foto_der', 'foto_der_x', 'foto_der_y', 'foto_der_ajuste',
  'foto_cen', 'foto_cen_x', 'foto_cen_y', 'foto_cen_ajuste', 'circulo_x', 'circulo_y'];

function vozEnMemoria(){
  const v = vozMedida;
  if(!v || !placa || v.placaId !== placa.id) return null;
  return (v.ruta === null || v.ruta === placa.audio) ? v : null;
}

/* Lee y mide el audio de la placa. Si se acaba de elegir ya está en
   memoria; si la placa se abrió otro día o desde otro equipo, se baja del
   servidor. */
async function vozDePlaca(avisar){
  const ya = vozEnMemoria();
  if(ya) return ya;
  if(!placa.audio) throw new Error('Falta el audio con la voz.');
  const ruta = placa.audio, placaId = placa.id;
  if(midiendoVoz?.ruta === ruta) return midiendoVoz.promesa;
  const promesa = (async () => {
    avisar?.('Bajando el audio');
    const r = await fetch(recurso(ruta));
    if(!r.ok) throw new Error(`No se pudo bajar el audio del servidor (${r.status}).`);
    const audio = await leerAudio(await r.arrayBuffer());
    avisar?.('Midiendo la voz');
    const medida = await medirVoz(audio.pcm);
    vozMedida = { placaId, ruta, audio, medida, local: null };
    return vozMedida;
  })();
  midiendoVoz = { ruta, promesa };
  try{ return await promesa; }
  finally{ if(midiendoVoz?.promesa === promesa) midiendoVoz = null; }
}

/* Los niveles de la voz en el segundo `t`. */
function vozEn(voz, t){
  const B = VOZ.bandas;
  const f = Math.max(0, Math.min(voz.medida.cuadros - 1, Math.floor(t * VOZ.ritmo)));
  return [voz.medida.bandas.subarray(f * B, f * B + B), voz.medida.volumen[f]];
}

/* Se elige el audio: se lee y se mide acá mismo, así la placa se ve con
   la voz de verdad enseguida, y se sube mientras tanto. Si el audio no se
   puede abrir o no tiene un largo que Instagram acepte, se dice antes de
   subir nada. */
async function agregarAudioVoz(archivo){
  detenerVoz();
  const decir = (texto, mal) => {
    const el = $('#estado_audio');
    if(el){ el.textContent = texto; el.classList.toggle('mal', !!mal); }
    estado(texto, mal);
  };
  decir('Leyendo el audio…');
  const audio = await leerAudio(await archivo.arrayBuffer());
  if(audio.duracion < DURACION_VOZ_MIN){
    throw new Error(`El audio dura ${audio.duracion.toFixed(1)} s: Instagram pide al menos ${DURACION_VOZ_MIN} segundos.`);
  }
  if(audio.duracion > DURACION_VOZ_MAX){
    throw new Error(`El audio dura ${enMinutos(audio.duracion)}: Instagram acepta hasta 15 minutos.`);
  }
  decir('Midiendo la voz…');
  const medida = await medirVoz(audio.pcm);
  anotar('audio elegido', { para: 'voz', peso: mb(archivo.size),
    dura: seg(audio.duracion * 1000),
    camino: audio.aac ? 'AAC: va tal cual, sin recomprimir' : 'se pasa a AAC al publicar' });

  const suPlaca = placa;
  if(vozMedida?.local) URL.revokeObjectURL(vozMedida.local);
  vozMedida = { placaId: placa.id, ruta: null, audio, medida, local: URL.createObjectURL(archivo) };
  ultimaVoz = null;
  repintar();

  const pista = 'Podés ir escribiendo el titular.';
  decir(`Guardando el audio… 0%. ${pista}`);
  const { ruta } = await despiertoMientras(guardarFoto(archivo,
    (a, nota) => decir(`Guardando el audio… ${Math.round(a * 100)}%. ${nota || pista}`)));
  if(placa !== suPlaca) return estado('El audio subió, pero ya estabas en otra noticia.', true);
  if(vozMedida?.placaId === placa.id) vozMedida.ruta = ruta;
  placa.audio_nombre = archivo.name;
  placa.audio_dura = Math.round(audio.duracion * 10) / 10;
  cambio('audio', ruta);
  await pintarFotos();
  decir(`Audio listo: ${enMinutos(audio.duracion)}.`);
}

function detenerVoz(){
  if(!reproduccion) return;
  cancelAnimationFrame(reproduccion.cuadro);
  reproduccion.sonido.pause();
  reproduccion = null;
  const b = $('[data-voz-escuchar]');
  if(b) b.textContent = '▶ Escuchar con las barras';
}

/* La vista previa con sonido: la placa se dibuja con la misma función que
   arma el video, en el segundo que va sonando, así que lo que se ve es lo
   que se va a publicar. */
async function escucharVoz(){
  if(reproduccion){ detenerVoz(); repintar(); return; }
  try{
    const voz = await vozDePlaca((que) => estado(que + '…'));
    estado('');
    const pintor = prepararVoz(placa, await imagenesDe(placa), ANCHO_FEED, voz.audio.duracion);
    const sonido = new Audio(voz.local || recurso(placa.audio));
    const ctx = $('#previa').getContext('2d');
    reproduccion = { sonido, cuadro: 0 };
    const pintar = () => {
      if(reproduccion?.sonido !== sonido) return;
      const t = sonido.currentTime;
      pintor.cuadro(ctx, t, ...vozEn(voz, t));
      reproduccion.cuadro = requestAnimationFrame(pintar);
    };
    sonido.onended = () => { detenerVoz(); repintar(); };
    await sonido.play();
    const b = $('[data-voz-escuchar]');
    if(b) b.textContent = '■ Parar';
    pintar();
  }catch(e){
    detenerVoz();
    estado(e.message, true);
  }
}

/* Arma el video, lo sube y lo recuerda: publicar, programar y bajar usan
   el mismo, y mientras no cambie nada no se vuelve a armar. */
async function grabarVozDePlaca(){
  const firma = JSON.stringify(CAMPOS_VOZ.map((k) => placa[k]));
  if(ultimaVoz?.firma === firma) return ultimaVoz;
  if(!placa.audio) throw new Error('Falta el audio con la voz.');

  const rotulo = 'Armando el video con la voz';
  const pista = 'Cada cuadro se dibuja con la voz de ese instante, así sale parejo '
    + 'aunque el aparato sea lento.';
  trabajo(rotulo, null, 'Leyendo el audio');
  const voz = await vozDePlaca((que) => trabajo(rotulo, null, que));
  const pintor = prepararVoz(placa, await imagenesDe(placa), ANCHO_FEED, voz.audio.duracion);
  const arranque = Date.now();
  const blob = await grabarVoz({
    pintor, medida: voz.medida, audio: voz.audio,
    ancho: ANCHO_FEED, alto: altoDe(ANCHO_FEED),
    bitrate: tasaDeSalida(ANCHO_FEED, altoDe(ANCHO_FEED)),
    avisar: (a, que) => trabajo(rotulo, a, que || pista),
    cortado: cortaron,
  });
  anotar('voz armada', { dura: seg(voz.audio.duracion * 1000), tardo: seg(Date.now() - arranque),
    peso: mb(blob.size), audio: voz.audio.aac ? 'AAC tal cual' : 'convertido a AAC' });

  const subiendo = 'Ya está armado: falta que llegue al servidor.';
  trabajo('Subiendo el video', 0, subiendo);
  const sub = await guardarFoto(new File([blob], 'voz.mp4', { type: 'video/mp4' }),
    (a, nota) => trabajo('Subiendo el video', a, nota || subiendo));
  ultimaVoz = { firma, ruta: sub.ruta, blob, portadaEn: pintor.portada };
  return ultimaVoz;
}

/* Para Instagram es un reel: un video solo, en 4:5. La tapa es el momento
   en que el titular ya terminó de entrar. */
async function vozParaPublicar(){
  const { ruta, portadaEn } = await grabarVozDePlaca();
  return { tipo: 'reel', ruta, portadaEn };
}

/* Un cuadro del video, sin nada encima. Es rápido: se salta al segundo que
   se pida y se dibuja, sin reproducir nada. Sirve de portada en la tira, y
   como no lleva el degradado quemado, la miniatura toma siempre el color que
   la placa tenga en ese momento. */
async function cuadroDelVideo(archivo){
  const video = document.createElement('video');
  video.src = URL.createObjectURL(archivo);
  video.muted = true;
  const sacar = enEscena(video);
  try{
    await esperarMetadatos(video);
    if(video.duration > DURACION_MAX + 0.5){
      throw new Error(`El video dura ${enMinutos(video.duration)} y el máximo son `
      + `${enMinutos(DURACION_MAX)}. Recortalo y volvé a elegirlo.`);
    }
    /* Antes se saltaba a un segundo fijo y se dibujaba lo que hubiera. Si el
       video abre con un fundido desde negro —que es lo habitual— la portada
       salía negra, y en la tira el carrusel mostraba un hueco. Se busca el
       cuadro con más imagen, igual que hace el reel. */
    await mejorMomento(video, video.duration || 0);
    await new Promise((r) => setTimeout(r, 120));

    const lienzo = document.createElement('canvas');
    /* La portada se guarda con la forma del video y sin recortar. Antes salía
       ya recortada al 4:5 y centrada, y eso volvía mentirosa la miniatura en
       cuanto se movía el encuadre: la tira recortaba de nuevo una imagen que
       ya venía recortada, mientras que lo que se publica recorta el original.
       Guardándola entera, la miniatura y la salida hacen la misma cuenta. */
    const escala = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
    lienzo.width = Math.round(video.videoWidth * escala);
    lienzo.height = Math.round(video.videoHeight * escala);
    lienzo.getContext('2d').drawImage(video, 0, 0, lienzo.width, lienzo.height);
    const jpg = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.9));
    return { jpg, duracion: video.duration, ancho: video.videoWidth, alto: video.videoHeight };
  }finally{ sacar(); URL.revokeObjectURL(video.src); }
}

/* Qué tan machacado viene el video que eligieron.
   Medido sobre esta misma cadena: un original de 0,36 Mbps —que es lo que
   llega desde WhatsApp, o de descargar algo ya publicado— pierde 10,3 dB
   antes de que el editor lo toque, y lo que nosotros le agregamos son 0,41.
   Es decir: sobre un video así no hay nada que se pueda hacer del lado del
   editor, y conviene saberlo antes de publicarlo y no después.
   La cuenta es bits por píxel y por cuadro, que compara peras con peras entre
   resoluciones distintas. Por debajo de 0,03 el video ya viene con bloques
   visibles; de 0,05 para arriba está sano. */
function comoVieneElVideo(bytes, segundos, ancho, alto){
  const pixeles = (ancho || 0) * (alto || 0);
  if(!bytes || !segundos || !pixeles) return null;
  const bpp = (bytes * 8) / segundos / (pixeles * 30);
  const mbps = bytes * 8 / segundos / 1e6;
  return {
    bpp: +bpp.toFixed(3),
    mbps: +mbps.toFixed(2),
    estado: bpp < 0.03 ? 'machacado' : (bpp < 0.05 ? 'justo' : 'sano'),
  };
}

/* El video se guarda crudo, igual que el del reel. Antes se le quemaba el
   degradado al subirlo y quedaba con el color de ese momento: si después se
   cambiaba la paleta, la placa cambiaba y el video del carrusel no. */
async function agregarVideo(archivo, indice){
  abrirTrabajo();
  trabajo('Preparando el video', null,
    'Se guarda tal cual. Podés seguir con la noticia mientras sube: el degradado y el logo se le graban al publicar.');
  const suPlaca = placa;
  try{
    const { jpg, duracion, ancho, alto } = await cuadroDelVideo(archivo);
    const viene = comoVieneElVideo(archivo.size, duracion, ancho, alto);
    anotar('video elegido', { para: 'carrusel', peso: mb(archivo.size),
      dura: seg(duracion * 1000), tamano: `${ancho}x${alto}`,
      origen: viene ? `${viene.mbps} Mbps · ${viene.estado}` : 'sin medir',
      nivel: viene?.estado === 'machacado' ? 'aviso' : 'ok' });
    if(viene?.estado === 'machacado'){
      aviso('Este video ya viene muy comprimido',
        `Trae ${viene.mbps} Mbps para ${ancho}x${alto}, que es poco: ya tiene bloques `
        + 'antes de que lo toquemos. Va a salir así por más que lo procesemos bien. '
        + 'Si lo tenés en mejor calidad —del original y no reenviado por WhatsApp ni '
        + 'descargado de otra red— conviene usar ese.');
    }else if(duracion > 45){
      estado(`Ojo: dura ${enMinutos(duracion)}.`);
    }

    trabajo('Subiendo el video', 0, 'Se guarda tal cual, sin procesar.');
    const subido = await despiertoMientras(guardarFoto(archivo,
      (a, nota) => trabajo('Subiendo el video', a, nota || 'Se guarda tal cual, sin procesar.')));
    const conPortada = await guardarFoto(new File([jpg], 'portada.jpg', { type: 'image/jpeg' }));

    if(placa !== suPlaca) return estado('El video subió, pero ya estabas en otra noticia.', true);
    const nueva = { ajuste: 'cubrir', x: 50, y: 50, tipo: 'video',
                    crudo: subido.ruta, foto: conPortada.ruta };
    if(indice === undefined) placa.laminas = (placa.laminas || []).concat(nueva);
    else placa.laminas[indice] = nueva;
    cambio('laminas', placa.laminas);
    await pintarLaminas();
    estado('Video listo en el carrusel');
  }finally{ cerrarTrabajo(); }
}

/* Lo que se manda a publicar de una lámina de video: se le graban el
   degradado y el logo recién acá, con el color que la placa tenga ahora.
   Se guarda lo grabado junto con la firma de lo que se ve, así publicar dos
   veces seguidas no vuelve a grabar nada. */
const quemados = new Map();

/* Una lámina, dibujada como va a salir publicada.
   Un video sin marca encima se sube tal cual, así que la previa no puede
   mostrarle el degradado y el logo: estaría prometiendo algo que el post no
   va a tener. Se dibuja solo el video, encuadrado igual que al publicarlo.
   Las fotos y los videos con marca siguen por el dibujante de siempre.
   Vale para la previa grande, para la tira y para lo que se exporta: una sola
   función, así no puede haber dos versiones de la verdad. */
function pintarLamina(ctx, lam, medio, logo, ancho){
  const crudo = lam?.tipo === 'video' && !marcaEnVideo();
  if(!crudo) return dibujarLamina(ctx, placa, lam, medio, logo, ancho);
  const alto = altoDe(ancho);
  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, ancho, alto);
  dibujarFoto(ctx, medio, 0, 0, ancho, alto,
    lam.ajuste || 'completa', lam.x ?? 50, lam.y ?? 50, ancho / LIENZO);
}

/* Esperar los datos de un video sin plazo es la forma más fácil de dejar todo
   colgado. Si el navegador no dispara ni «listo» ni «error» —pasa con
   formatos que no entiende, con archivos cortados a la mitad, y en iOS cuando
   el elemento no llega a decodificar— la promesa no se resuelve nunca: el
   aviso queda girando y no hay forma de saber en qué se trabó ni con cuál
   archivo. Era el caso de los cuatro lugares donde se abría un video, y el
   primero de ellos corre al elegirlo, antes de subir nada.
   Con plazo, en el peor caso se termina con un motivo escrito. */
async function esperarMetadatos(video, plazo = 20000){
  await new Promise((listo, falla) => {
    let cerrado = false;
    const fin = (fn, arg) => {
      if(cerrado) return;
      cerrado = true;
      clearTimeout(reloj);
      video.onloadedmetadata = null;
      video.onerror = null;
      fn(arg);
    };
    const reloj = setTimeout(() => fin(falla, new Error(
      `El navegador no pudo leer el video: no respondió en ${Math.round(plazo / 1000)} `
      + 'segundos. Suele pasar con formatos que no entiende —HEVC, o un .mov de '
      + 'iPhone— o si el archivo quedó cortado al subirlo.')), plazo);
    video.onloadedmetadata = () => fin(listo);
    video.onerror = () => fin(falla, new Error('No se pudo leer el video: no se pudo '
      + 'abrir el archivo. Puede estar incompleto o en un formato que este navegador '
      + 'no reproduce.'));
  });
}

/* Las medidas de un video que ya está en el servidor, sin bajarlo entero. */
async function medidasDeVideo(ruta){
  const v = document.createElement('video');
  v.src = ruta; v.muted = true; v.preload = 'metadata';
  const sacar = enEscena(v);
  try{
    await new Promise((ok) => { v.onloadedmetadata = ok; v.onerror = ok; setTimeout(ok, 6000); });
    return v.videoWidth ? { ancho: v.videoWidth, alto: v.videoHeight } : null;
  }finally{ sacar(); }
}

async function videoDeLamina(lam, i){
  let rapidoNoPudo = false;   // ver más abajo: no se intenta dos veces
  /* Los videos de antes vienen ya grabados y sin el archivo original, así que
     no hay nada que volver a dibujarles. Se mandaban tal cual.
     El problema es que se grabaron cuando la placa era cuadrada, y en el
     mismo carrusel las imágenes ahora salen en 4:5. Instagram exige que todas
     las piezas tengan la misma proporción y rechaza el conjunto sin explicar
     cuál es el problema: «rechazó el video 2 de 4: ERROR».
     Si las medidas no coinciden se lo reencuadra al 4:5 antes de mandarlo.
     Entra entero, con lo que sobra relleno con una copia difuminada de él
     mismo, y no se le dibuja nada encima: el logo y el degradado ya los tiene
     grabados de cuando se hizo, y ponérselos otra vez los duplicaría. */
  if(!lam.crudo){
    if(!lam.video) return { tipo: 'video', ruta: lam.video };
    const medidas = await medidasDeVideo(lam.video);
    const quiere = altoDe(ANCHO_FEED) / ANCHO_FEED;
    if(!medidas || Math.abs(medidas.alto / medidas.ancho - quiere) < 0.01){
      return { tipo: 'video', ruta: lam.video };   // ya tiene la proporción buena
    }
    const yaEsta = quemados.get(lam.video);
    if(yaEsta) return { tipo: 'video', ruta: yaEsta.ruta };

    const rotulo = `Acomodando el video ${i + 1}`;
    const pista = `Es de antes y mide ${medidas.ancho}x${medidas.alto}. `
                + 'Instagram no acepta un carrusel con piezas de proporciones distintas.';
    anotar('video de antes', { pieza: i + 1,
      medidas: `${medidas.ancho}x${medidas.alto}`,
      pasa_a: `${ANCHO_FEED}x${altoDe(ANCHO_FEED)}`, nivel: 'aviso' });
    trabajo(rotulo, 0, pista);
    const alto = altoDe(ANCHO_FEED);
    const u = ANCHO_FEED / LIENZO;
    let listo = null;
    if(hayCodecs()){
      try{
        listo = await quemarConCodecs(lam.video,
          (ctx, cuadro) => {
            ctx.clearRect(0, 0, ANCHO_FEED, alto);
            dibujarFoto(ctx, cuadro, 0, 0, ANCHO_FEED, alto, 'completa', 50, 50, u);
          },
          (b) => trabajo(rotulo, b, pista), ANCHO_FEED, alto);
      }catch(e){
        if(String(e.message) === 'Cancelado') throw e;
        anotar('no se pudo acomodar el video', { porque: String(e.message).slice(0, 120),
          nivel: 'mal' });
      }
    }
    if(!listo){
      throw new Error(`El video ${i + 1} es de antes y mide ${medidas.ancho}x${medidas.alto}, `
        + 'que no combina con el resto del carrusel, y este navegador no puede '
        + 'reacomodarlo. Cambialo por uno nuevo desde el carrusel.');
    }
    trabajo(rotulo, 1, 'Subiéndolo.');
    const sub = await guardarFoto(new File([listo], 'lamina.mp4', { type: 'video/mp4' }),
      (b, nota) => trabajo(rotulo, b, nota || 'Subiéndolo.'));
    quemados.set(lam.video, { firma: 'reencuadrado', ruta: sub.ruta });
    return { tipo: 'video', ruta: sub.ruta };
  }

  /* Sin marca encima no hay nada que dibujar, y sin nada que dibujar no hay
     que recomprimir: el video se manda tal cual llegó.
     Es la diferencia más grande de todas. Con los cuatro videos de la
     bitácora: 90 MB de salida contra 17 de original, o sea un 81% menos, sin
     esperar el procesado y sin perder una sola vez la calidad —recomprimir
     siempre pierde algo—.
     Lo que se resigna es el logo sobre el video. La placa del carrusel lo
     lleva igual, así que el post sigue estando firmado. */
  if(!marcaEnVideo()){
    const medidas = await medidasDeVideo(lam.crudo);
    const quiere = altoDe(ANCHO_FEED) / ANCHO_FEED;
    if(medidas && Math.abs(medidas.alto / medidas.ancho - quiere) < 0.01){
      anotar('video sin retocar', { pieza: i + 1,
        medidas: `${medidas.ancho}x${medidas.alto}`,
        archivo: String(lam.crudo).split('/').pop(),
        porque: 'va tal cual: no se le dibuja nada y no se recomprime' });
      return { tipo: 'video', ruta: lam.crudo };
    }
    // no cuadra la proporción: se reencuadra, pero sin dibujarle nada
    const rotulo = `Acomodando el video ${i + 1}`;
    const pista = medidas
      ? `Viene en ${medidas.ancho}x${medidas.alto} y el carrusel va en `
        + `${ANCHO_FEED}x${altoDe(ANCHO_FEED)}.`
      : 'Se lo lleva a la proporción del carrusel.';
    trabajo(rotulo, 0, pista);
    const altoSalida = altoDe(ANCHO_FEED);
    const u = ANCHO_FEED / LIENZO;
    let solo = null;
    if(hayCodecs()){
      try{
        rapidoNoPudo = false;
        solo = await quemarConCodecs(lam.crudo,
          (ctx, cuadro) => {
            ctx.clearRect(0, 0, ANCHO_FEED, altoSalida);
            dibujarFoto(ctx, cuadro, 0, 0, ANCHO_FEED, altoSalida,
              lam.ajuste || 'completa', lam.x ?? 50, lam.y ?? 50, u);
          },
          (b) => trabajo(rotulo, b, pista), ANCHO_FEED, altoSalida);
      }catch(e){
        if(String(e.message) === 'Cancelado') throw e;
        rapidoNoPudo = true;
        anotar('no se pudo acomodar el video', { porque: String(e.message).slice(0, 120), nivel: 'aviso' });
      }
    }
    if(solo){
      trabajo(rotulo, 1, 'Subiéndolo.');
      const sub = await guardarFoto(new File([solo], 'lamina.mp4', { type: 'video/mp4' }),
        (b, nota) => trabajo(rotulo, b, nota || 'Subiéndolo.'));
      return { tipo: 'video', ruta: sub.ruta };
    }
    // si no se pudo, se sigue por el camino de siempre y se le dibuja encima
    anotar('se vuelve a grabar con marca', { pieza: i + 1,
      porque: 'no se pudo reencuadrar sin dibujar', nivel: 'aviso' });
  }

  const firma = JSON.stringify([lam.crudo, lam.ajuste, lam.x, lam.y, placa.color_fondo]);
  const guardado = quemados.get(lam.crudo);
  if(guardado && guardado.firma === firma) return { tipo: 'video', ruta: guardado.ruta };

  const espera = 'Se le graban encima el degradado y el logo.';
  const lento = espera + ' La grabación es en tiempo real: tarda lo que dura '
    + 'el video. Dejá esta pantalla a la vista.';
  const rotulo = `Grabando el video ${i + 1}`;
  /* Si se llegó hasta acá con la marca apagada es porque hubo que reencuadrar
     y no se pudo sin dibujar. Queda anotado: si alguien ve la marca en un
     video y no esperaba verla, la bitácora dice por qué apareció. */
  anotar('se le dibuja encima', { pieza: i + 1,
    porque: marcaEnVideo() ? 'está pedido con logo' : 'no se pudo acomodar sin dibujar',
    nivel: marcaEnVideo() ? 'ok' : 'aviso' });
  trabajo(rotulo, 0, espera);

  let video = null;
  /* Si el camino rápido ya no pudo con este archivo, no se lo vuelve a
     intentar: fallaría igual, y cada intento carga el video entero en
     memoria. Con dos seguidos, un video largo del iPhone tiraba la pestaña. */
  if(hayCodecs() && !rapidoNoPudo){
    const arranque = Date.now();
    try{
      const logo = await cargarImagen(LOGO);
      video = await quemarConCodecs(lam.crudo,
        (ctx, cuadro) => dibujarLamina(ctx, placa, lam, cuadro, logo, ANCHO_FEED),
        (a) => trabajo(rotulo, a, espera), ANCHO_FEED, altoDe(ANCHO_FEED));
      anotar('grabado', { camino: 'rápido', tardo: seg(Date.now() - arranque),
        fluidez: '100%', porque: 'no depende del reloj: van todos los cuadros' });
    }catch(e){
      if(String(e.message) === 'Cancelado') throw e;
      console.warn('el camino rápido no pudo, se graba a la antigua:', e.message);
      anotar('camino rápido no pudo', { porque: String(e.message).slice(0, 120),
        nivel: 'aviso' });
      video = null;
    }
  }
  if(!video){
    trabajo(rotulo, 0, lento);
    ({ video } = await quemarVideo(lam.crudo, lam, (a) => trabajo(rotulo, a, lento)));
  }
  trabajo('Subiendo el video', 0, 'Ya está grabado: falta que llegue al servidor.');
  const sub = await guardarFoto(new File([video], 'lamina.mp4', { type: 'video/mp4' }),
    (a, nota) => trabajo('Subiendo el video', a, nota || 'Ya está grabado: falta que llegue al servidor.'));
  quemados.set(lam.crudo, { firma, ruta: sub.ruta });
  return { tipo: 'video', ruta: sub.ruta };
}

/* ------------------------------------------------------------------ */
/* arrastrar y soltar fotos                                            */
/* ------------------------------------------------------------------ */

const esVideo = (f) => f.type.startsWith('video/');
const mediosDe_ = (dt) => [...(dt?.files || [])]
  .filter((f) => f.type.startsWith('image/') || esVideo(f));

/* Dónde se puede soltar: cada hueco de foto, cada lámina, y la sección
   del carrusel entera (ahí se sueltan varias de una vez). */
function zonaDeSoltado(destino){
  return destino.closest('.foto[data-campo]')
      || destino.closest('[data-lamina]')
      || destino.closest('#zona_carrusel');
}

let zonaActual = null;
const marcar = (zona) => {
  if(zonaActual === zona) return;
  zonaActual?.classList.remove('soltar');
  zonaActual = zona;
  zonaActual?.classList.add('soltar');
};

// sin esto el navegador abre la imagen y se pierde lo que estabas haciendo
document.addEventListener('dragover', (ev) => {
  if(!ev.dataTransfer?.types.includes('Files')) return;
  ev.preventDefault();
  marcar(zonaDeSoltado(ev.target));
});
document.addEventListener('dragleave', (ev) => {
  if(ev.relatedTarget === null) marcar(null);
});
document.addEventListener('drop', async (ev) => {
  if(!ev.dataTransfer?.types.includes('Files')) return;
  ev.preventDefault();
  const zona = zonaDeSoltado(ev.target);
  marcar(null);
  const archivos = mediosDe_(ev.dataTransfer);
  if(!zona || !archivos.length || !placa) return;

  try{
    if(zona.dataset.campo){
      // esas dos abren y cierran su propio aviso
      await reemplazarFoto(zona.dataset.campo, archivos[0]);
      estado('Foto actualizada');
    }else if(zona.dataset.lamina !== undefined){
      await reemplazarLamina(Number(zona.dataset.lamina), archivos[0]);
    }else{
      await agregarAlCarrusel(archivos);
    }
  }catch(e){ estado(e.message, true); }
});

/* Fotos y videos al final del carrusel, todos los que entren. Lo usan el
   botón y soltar archivos sobre el carrusel. */
async function agregarAlCarrusel(archivos){
  archivos = archivos.filter((f) => f.type.startsWith('image/') || esVideo(f));
  if(!archivos.length || !placa) return;
  const lugar = MAX_LAMINAS - (placa.laminas || []).length;
  const entran = archivos.slice(0, lugar);
  if(!entran.length) return estado(`El carrusel ya está lleno: ${MAX_LAMINAS + 1} imágenes más el cierre`, true);
  abrirTrabajo();
  const suPlaca = placa;
  let fotos = 0, videos = 0;
  try{
    for(const [i, archivo] of entran.entries()){
      // el video abre su propio aviso, con su porcentaje
      if(esVideo(archivo)){ await agregarVideo(archivo); videos++; continue; }
      trabajo(`Subiendo ${entran.length > 1 ? `${i + 1} de ${entran.length}` : 'la foto'}`,
        i / entran.length, archivo.name);
      const { ruta } = await guardarFoto(archivo);
      if(placa !== suPlaca) return estado('Las fotos subieron, pero ya estabas en otra noticia.', true);
      placa.laminas = (placa.laminas || []).concat({ foto: ruta, ajuste: 'completa', x: 50, y: 50 });
      fotos++;
    }
  }finally{ cerrarTrabajo(); }
  cambio('laminas', placa.laminas);
  await pintarLaminas();
  const partes = [fotos && `${fotos} foto${fotos > 1 ? 's' : ''}`, videos && `${videos} video${videos > 1 ? 's' : ''}`].filter(Boolean);
  estado(`${partes.join(' y ')} al carrusel` +
         (archivos.length > entran.length ? ` (${archivos.length - entran.length} no entraron)` : ''));
}

$('#selector').addEventListener('change', (ev) => cargar(Number(ev.target.value)));
$('#nueva').addEventListener('click', abrirPortada);
$('#duplicar').addEventListener('click', async () => cargar(await crear(placa)));

$('#borrar').addEventListener('click', async () => {
  if(!confirm('¿Borrar «' + placa.nombre + '»?')) return;
  const lista = await listarPlacas();
  if(lista.length <= 1) return estado('Tiene que quedar al menos una placa', true);
  await borrarPlacaBd(placa.id);
  const resto = await listarPlacas();
  cargar(resto[resto.length - 1].id);
});

document.querySelectorAll('[data-exportar]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    abrirTrabajo();
    congelar(true);
    trabajo('Generando el PNG', null);
    try{
      await exportarPng(Number(boton.dataset.lado));
      estado('Listo, se descargó el PNG');
    }catch(e){ estado(e.message, true); }
    finally{ cerrarTrabajo(); congelar(false); boton.disabled = false; }
  });
});

/* ------------------------------------------------------------------ */
/* portada                                                             */
/* ------------------------------------------------------------------ */

async function ultimaPlaca(){
  const lista = await listarPlacas();
  const guardada = Number(localStorage.getItem('placa'));
  return lista.find((p) => p.id === guardada) || lista[0] || null;
}

/* Si el editor no puede arrancar, hay que decirlo en la cara y no dejar
   un lienzo negro: el mensaje del panel queda al fondo y no se ve. */
/* ------------------------------------------------------------------ */
/* cuentas                                                             */
/* ------------------------------------------------------------------ */

/* Con quién se entró. null mientras el sitio todavía no tiene cuentas y se
   entra con la clave de siempre: ahí no hay firma. */
let yo = null;
/* Lo que va en «Publicado por»: el nombre y la foto de la cuenta. Cada
   pieza la recibe al dibujarse, así la vista previa la muestra igual que
   va a salir publicada. */
let firma = null;

/* Quién es este navegador para el servidor: { usuario } con una cuenta,
   { sitio, hayUsuarios } con la clave de siempre, o null si la sesión ya
   no vale. Si el servidor no contesta, eso es otra cosa y se avisa como
   error. */
async function quienSoy(){
  const r = await fetch('api/sesion.php', { headers: { 'x-clave': clave() } });
  if(r.status === 401) return null;
  const d = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(d.error || `El servidor contestó ${r.status}`);
  return d;
}

/* La pantalla para entrar. Mientras el sitio no tenga cuentas se pide la
   clave de siempre, así nadie se queda afuera durante el cambio; en cuanto
   existe la primera, cada uno entra con su usuario y su contraseña. */
async function pantallaIngreso(mensaje){
  let hay = true;
  try{ hay = !!(await (await fetch('api/sesion.php?tarea=estado')).json()).hayUsuarios; }
  catch(e){ /* sin respuesta se pide usuario: es lo que corresponde de ahora en más */ }
  if(!hay) return pantallaClave(mensaje);

  const portada = $('#portada');
  portada.innerHTML = `
    <h2>Entrar</h2>
    ${mensaje ? `<p class="fallo">${esc(mensaje)}</p>` : ''}
    <form class="ingreso" id="ingreso" autocomplete="on">
      <input id="ing_usuario" name="usuario" placeholder="Usuario" autocomplete="username"
             autocapitalize="none" spellcheck="false" required>
      <input id="ing_clave" name="contrasena" type="password" placeholder="Contraseña"
             autocomplete="current-password" required>
      <button class="tarjeta-chica" type="submit">Entrar</button>
      <p class="pista" id="ing_estado" aria-live="polite"></p>
    </form>
    <p class="pista">La cuenta te la crea quien administra el equipo.</p>`;
  portada.hidden = false;
  arrancado();

  const form = $('#ingreso');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = form.querySelector('button');
    boton.disabled = true;
    $('#ing_estado').textContent = 'Entrando…';
    try{
      // fetch directo y no api(): un 401 acá es «contraseña mala», no «sesión vencida»
      const r = await fetch('api/sesion.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarea: 'entrar', usuario: $('#ing_usuario').value,
                               contrasena: $('#ing_clave').value }),
      });
      const d = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(d.error || `Error ${r.status}`);
      localStorage.setItem('clave_publicar', d.token);
      location.reload();
    }catch(e){
      $('#ing_estado').textContent = e.message;
      boton.disabled = false;
    }
  });
  $('#ing_usuario').focus();
}

/* La foto de la cuenta arriba, con su menú. */
function pintarCuenta(){
  const caja = $('#cuenta');
  if(!caja || !yo) return;
  caja.hidden = false;
  const boton = $('#yo');
  const iniciales = yo.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  boton.innerHTML = yo.foto ? `<img src="${esc(yo.foto)}" alt="">` : esc(iniciales);
  boton.title = yo.nombre;
  $('#menu_quien').innerHTML = `<b>${esc(yo.nombre)}</b><small>@${esc(yo.usuario)}${yo.rol === 'admin' ? ' · administración' : ''}</small>`;
  $('#ir_equipo').hidden = yo.rol !== 'admin';
}

$('#yo')?.addEventListener('click', (ev) => {
  ev.stopPropagation();
  $('#menu_yo').hidden = !$('#menu_yo').hidden;
  $('#form_clave').hidden = true;
});
// el menú se cierra al tocar afuera
document.addEventListener('click', (ev) => {
  const menu = $('#menu_yo');
  if(menu && !menu.hidden && !ev.target.closest('#cuenta')) menu.hidden = true;
});

/* El registro técnico —lo que antes se veía en «Qué pasó»— se sigue
   anotando en este navegador, y se copia desde acá para mandarlo cuando
   algo falla: cuánto pesaba el video, qué camino tomó, en qué paso se cortó. */
$('#copiar_registro')?.addEventListener('click', async (ev) => {
  const libro = leerBitacora();
  const texto = libro.map((l) => {
    const { t, evento, nivel, ...resto } = l;
    const detalle = Object.entries(resto).map(([k, v]) => `${k}=${v}`).join(' ');
    return `${new Date(t).toLocaleString('es-CL')}  ${evento}${detalle ? '  ' + detalle : ''}`;
  }).join('\n');
  try{
    await navigator.clipboard.writeText(texto || 'sin nada anotado');
    ev.target.textContent = `Copiado: ${libro.length} líneas`;
  }catch(e){ ev.target.textContent = 'No se pudo copiar'; }
  setTimeout(() => { ev.target.textContent = 'Copiar registro técnico'; }, 2500);
});

$('#salir')?.addEventListener('click', async () => {
  try{
    await fetch('api/sesion.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-clave': clave() },
      body: JSON.stringify({ tarea: 'salir' }) });
  }catch(e){ /* igual se olvida acá */ }
  localStorage.removeItem('clave_publicar');
  location.reload();
});

$('#cambiar_clave')?.addEventListener('click', () => {
  $('#form_clave').hidden = !$('#form_clave').hidden;
  $('#clave_actual').focus();
});

$('#form_clave')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const aviso = $('#clave_estado');
  if($('#clave_nueva').value !== $('#clave_repetida').value){
    aviso.textContent = 'Las dos contraseñas nuevas no son iguales.';
    return;
  }
  aviso.textContent = 'Guardando…';
  try{
    await api('api/sesion.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tarea: 'clave', actual: $('#clave_actual').value, nueva: $('#clave_nueva').value }),
    });
    ev.target.reset();
    aviso.textContent = 'Listo. Las sesiones abiertas en otros aparatos se cerraron.';
  }catch(e){ aviso.textContent = e.message; }
});

function pantallaError(mensaje){
  const portada = $('#portada');
  portada.innerHTML = `
    <h2>El editor no puede arrancar</h2>
    <p class="fallo">${esc(mensaje)}</p>
    <p class="pista">
      Casi siempre falta crear <code>api/config.php</code> en el servidor,
      copiando <code>api/config.ejemplo.php</code> y completando los datos
      de la base MySQL y la clave.
    </p>
    <div class="fila">
      <button class="tarjeta-chica" id="reintentar">Reintentar</button>
      <a class="tarjeta-chica" href="panel-a7f3c9e21b.html">Abrir el panel de configuración</a>
    </div>`;
  portada.hidden = false;
  arrancado();
  $('#reintentar').addEventListener('click', () => location.reload());
}

/* Pantalla para escribir la clave. Al aceptar se recarga: así todo el
   arranque vuelve a correr con la clave puesta, sin estados a medias. */
function pantallaClave(mensaje){
  const portada = $('#portada');
  portada.innerHTML = `
    <h2>Clave de acceso</h2>
    ${mensaje ? `<p class="fallo">${esc(mensaje)}</p>` : ''}
    <p class="pista">
      Es la que está en <code>api/config.php</code>, en la línea
      <code>PUBLICAR_CLAVE</code>. Queda guardada en este navegador y no se
      vuelve a pedir.
    </p>
    <div class="fila">
      <input type="password" id="clave_entrada" placeholder="Clave" autocomplete="current-password">
      <button class="tarjeta-chica" id="entrar">Entrar</button>
    </div>`;
  portada.hidden = false;
  arrancado();

  const entrar = () => {
    const v = $('#clave_entrada').value.trim();
    if(!v) return;
    localStorage.setItem('clave_publicar', v);
    location.reload();
  };
  $('#entrar').addEventListener('click', entrar);
  $('#clave_entrada').addEventListener('keydown', (e) => { if(e.key === 'Enter') entrar(); });
  $('#clave_entrada').focus();
}

/* Ya hay algo que mostrar: se saca el velo del arranque. */
function arrancado(){ document.body.classList.remove('arrancando'); }
// por las dudas: si algo se colgara, que nunca quede la pantalla en blanco
setTimeout(arrancado, 10000);

async function abrirPortada(){
  const ultima = await ultimaPlaca();
  const seguir = $('#seguir');
  seguir.hidden = !ultima;
  if(ultima){
    seguir.textContent = 'Seguir con la última: ' + sinMarcas(ultima.nombre);
    seguir.dataset.id = ultima.id;
  }
  $('#portada').hidden = false;
  arrancado();
}

$('#portada').addEventListener('click', async (ev) => {
  const boton = ev.target.closest('[data-crear], #seguir');
  if(!boton) return;
  if(boton.id === 'seguir') return cargar(Number(boton.dataset.id));
  const plantillas = { urgente: URGENTE, reel: REELS, noticia: BASE, voz: VOZ_PLACA };
  cargar(await crear(plantillas[boton.dataset.crear] || BASE));
});

/* ------------------------------------------------------------------ */
/* arranque                                                            */
/* ------------------------------------------------------------------ */

(async () => {
  document.title = 'Editor de placas — ' + MARCA.nombre;
  $('#cual').textContent = MARCA.nombre;
  // este medio usa una sola foto de fondo: el selector de armados sobra
  if(MARCA.disenos === false) $('#disenos').closest('fieldset').hidden = true;
  // los formatos que este medio todavía no tiene dibujados, no se ofrecen
  if(Array.isArray(FORMATOS)){
    document.querySelectorAll('[data-crear]').forEach((b) => {
      b.hidden = !FORMATOS.includes(b.dataset.crear);
    });
  }

  await esperarTipografias();
  pintarDisenos();
  pintarPaleta();
  pintarChips();
  if(!clave()) return pantallaIngreso();
  try{
    const quien = await quienSoy();
    if(!quien){
      localStorage.removeItem('clave_publicar');
      return pantallaIngreso('La sesión venció: entrá de nuevo.');
    }
    /* Con la clave de siempre y cuentas ya creadas, se pide entrar: si no,
       se podría seguir publicando sin nombre para siempre. */
    if(quien.sitio && quien.hayUsuarios){
      localStorage.removeItem('clave_publicar');
      return pantallaIngreso('Desde ahora cada uno entra con su usuario y su contraseña.');
    }
    yo = quien.usuario || null;
    if(yo) firma = { nombre: yo.nombre, imagen: yo.foto ? await cargarImagen(yo.foto) : null };
    pintarCuenta();
  }catch(e){
    return pantallaError(e.message);
  }
  cargarRedes();
  // por si el hosting no tiene cron: al abrir, se publica lo que ya venció
  api('api/programar.php?tarea=vaciar&clave=' + encodeURIComponent(clave()))
    .catch(() => {});
  try{
    if(!(await listarPlacas()).length) await crear(EJEMPLO);
    abrirPortada();
  }catch(e){
    if(!e.esClave) pantallaError(e.message);
  }
})();
