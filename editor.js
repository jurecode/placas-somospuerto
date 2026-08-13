/* Editor de placas.
 *
 * El dibujo y la exportación pasan enteros por el navegador (placa.js), y
 * las placas y las fotos se guardan en MySQL a través de api/, así que son
 * las mismas desde cualquier dispositivo. */

import { dibujarCierre, dibujarReel, dibujarFoto, esperarTipografias, textoSobre, LIENZO, REEL } from './placa.js';
import * as somosPuerto from './placa.js';
import * as eyey from './dibujo-eyey.js';
import { MARCA } from './marca/marca.js';
import { armarMp4, leerMp4, RELOJ } from './mp4.js';

/* Cada medio tiene su dibujante y la marca dice cuál. Lo que se le pasa de
   más —el nombre, el pie— lo ignora el que no lo necesita. */
const DIBUJANTE = { 'eyey': eyey }[MARCA.dibujo] || somosPuerto;
const dibujar = (ctx, datos, fotos, lado) => DIBUJANTE.dibujar(ctx, datos, fotos, lado, MARCA);
const dibujarLamina = (ctx, datos, lamina, foto, logo, lado) =>
  DIBUJANTE.dibujarLamina(ctx, datos, lamina, foto, logo, lado, MARCA);

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
  circulo_x: 50, circulo_y: 62.6,
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
const llevaCierre = () => placa.formato !== 'reel' && CIERRE !== false;

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

async function api(ruta, opciones = {}){
  const res = await fetch(ruta, {
    ...opciones,
    headers: { 'x-clave': clave(), ...(opciones.headers || {}) },
  });
  const datos = await res.json().catch(() => ({}));
  if(res.status === 401){
    localStorage.removeItem('clave_publicar');
    pantallaClave('La clave no es la correcta.');
    // se marca para que el arranque no tape la pantalla de la clave con
    // la de error genérico
    const e = new Error(datos.error || 'Clave incorrecta');
    e.esClave = true;
    throw e;
  }
  if(!res.ok) throw new Error(datos.error || `Error ${res.status}`);
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
const PLAZO_TROZO = 90_000;
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

async function guardarFoto(archivo, avisar){
  const arranque = Date.now();
  const contar = (r) => {
    const ms = Date.now() - arranque;
    anotar('subida', { peso: mb(archivo.size), tardo: seg(ms),
      velocidad: (archivo.size / 1048576 / (ms / 1000)).toFixed(2) + ' MB/s' });
    return r;
  };
  const fallo = (e) => {
    anotar('subida cortada', { peso: mb(archivo.size), tardo: seg(Date.now() - arranque),
      porque: String(e.message).slice(0, 120), nivel: 'mal' });
    throw e;
  };

  if(archivo.size <= ENTERO_HASTA){
    return conPlazo('api/fotos.php',
      { method: 'POST', body: archivo, headers: BINARIO }, PLAZO_TROZO)
      .then(contar, fallo);
  }
  try{
  const sesion = (crypto.randomUUID?.() || Math.random().toString(36) + Date.now())
    .replace(/[^a-zA-Z0-9]/g, '');
  let enviado = 0;
  for(let desde = 0; desde < archivo.size; desde += TROZO){
    const pedazo = archivo.slice(desde, desde + TROZO);
    const ultimo = desde + TROZO >= archivo.size;
    const r = await conPlazo(
      `api/fotos.php?trozo=1&sesion=${sesion}${ultimo ? '&fin=1' : ''}`,
      { method: 'POST', body: pedazo, headers: BINARIO }, PLAZO_TROZO);
    enviado += pedazo.size;
    avisar?.(enviado / archivo.size);
    if(ultimo) return contar(r);
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
const esCampo = (el) => el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

document.addEventListener('focusin', (ev) => {
  if(!esCampo(ev.target)) return;
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
    if(document.getElementById('bitacora')) pintarBitacora();
  }catch(e){ /* si no hay lugar, se sigue sin anotar */ }
}

function leerBitacora(){
  try{ return JSON.parse(localStorage.getItem(BITACORA) || '[]'); }
  catch(e){ return []; }
}

const mb = (bytes) => (bytes / 1048576).toFixed(2) + ' MB';
const seg = (ms) => (ms / 1000).toFixed(1) + 's';

/* Lo que se muestra: una línea por evento, la más nueva arriba. */
function pintarBitacora(){
  const caja = document.getElementById('bitacora');
  if(!caja) return;
  const libro = leerBitacora();
  if(!libro.length){
    caja.innerHTML = '<p class="nota">Todavía no hay nada anotado. Se llena sola al subir o publicar.</p>';
    return;
  }
  const hora = (t) => new Date(t).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  caja.innerHTML = libro.slice().reverse().map((l) => {
    const { t, evento, nivel, ...resto } = l;
    const detalle = Object.entries(resto)
      .map(([k, v]) => `${k}: ${v}`).join(' · ');
    return `<li class="${esc(nivel || 'ok')}">
      <b>${esc(hora(t))}</b>
      <span><i>${esc(evento)}</i>${detalle ? ' — ' + esc(detalle) : ''}</span>
    </li>`;
  }).join('');
}

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
  if(!String(placa.titulo || '').trim()){
    falta.push({ seccion: 'titular', que: 'Falta el titular.' });
  }
  return falta;
}

function irA(seccion){
  document.body.dataset.seccion = seccion;
  document.querySelectorAll('[data-ir]').forEach((b) => {
    b.classList.toggle('activa', b.dataset.ir === seccion);
  });
  // al cambiar de sección se vuelve arriba: si no, se entra a la mitad
  document.querySelector('.panel')?.scrollTo({ top: 0 });
  localStorage.setItem('seccion', seccion);
}

/* La barra muestra solo las secciones que este formato usa, y marca las que
   tienen algo sin llenar. */
function pintarBarra(){
  const barra = $('#barra');
  if(!barra || !placa) return;
  barra.hidden = false;
  const falta = loQueFalta();
  const urgente = placa.formato === 'urgente';
  const reel = placa.formato === 'reel';
  const sobra = { fotos: urgente, etiqueta: urgente, color: urgente,
                  carrusel: reel, titular: false, texto: false, mas: false };

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
  if(b) irA(b.dataset.ir);
});

function verVista(mostrar){
  document.body.classList.toggle('sin_vista', !mostrar);
  localStorage.setItem('sin_vista', mostrar ? '' : '1');
}
/* La calidad es del aparato, no de la placa: quien publica desde el teléfono
   con datos quiere rápida y desde la oficina quiere alta. */
function pintarCalidad(){
  document.querySelectorAll('[data-calidad]').forEach((b) => {
    b.classList.toggle('activo', b.dataset.calidad === calidadVideo());
  });
}
$('#calidad')?.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-calidad]');
  if(!b) return;
  localStorage.setItem('calidad_video', b.dataset.calidad);
  pintarCalidad();
  estado(b.dataset.calidad === 'rapida'
    ? 'Los videos van a pesar un tercio menos y subir más rápido.'
    : 'Los videos van a salir con la mejor calidad posible.');
});
pintarCalidad();

/* Copiar sirve para mandármela: lo que se copia es texto plano, una línea
   por evento, que se pega en cualquier lado. */
$('#copiar_bitacora')?.addEventListener('click', async () => {
  const libro = leerBitacora();
  const texto = libro.map((l) => {
    const { t, evento, nivel, ...resto } = l;
    const detalle = Object.entries(resto).map(([k, v]) => `${k}=${v}`).join(' ');
    return `${new Date(t).toLocaleString('es-CL')}  ${evento}${detalle ? '  ' + detalle : ''}`;
  }).join('\n');
  try{
    await navigator.clipboard.writeText(texto || 'sin nada anotado');
    estado(`Copiadas ${libro.length} líneas`);
  }catch(e){ estado('No se pudo copiar: ' + e.message, true); }
});

$('#limpiar_bitacora')?.addEventListener('click', () => {
  localStorage.removeItem(BITACORA);
  pintarBitacora();
  estado('Bitácora borrada');
});

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
  return { izq, der, cen, logo };
}

/* ------------------------------------------------------------------ */
/* dibujo                                                              */
/* ------------------------------------------------------------------ */

let pendiente = null;
let bucleReel = null;   // redibuja la capa de texto mientras el reel se mueve

/* Se juntan varios cambios seguidos en un solo dibujo. Con setTimeout y no
   con requestAnimationFrame a propósito: rAF no corre si la pestaña está
   en segundo plano y la vista previa quedaría congelada. */
function repintar(){
  clearTimeout(pendiente);
  clearInterval(bucleReel);   // si había una capa animándose, se rearma abajo
  bucleReel = null;
  pendiente = setTimeout(async () => {
    try{
      const lienzo = $('#previa');
      const esReel = placa.formato === 'reel';
      // el reel es 9:16, así que el lienzo cambia de forma
      const anchoQuiere = esReel ? REEL.ancho : 1080;
      const altoQuiere  = esReel ? REEL.alto : 1080;
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
        if(crudo){
          const logo = await cargarImagen(LOGO);
          // solo se redibuja cuando el momento de la animación cambió: pasado
          // el primer segundo la capa queda quieta y no gasta nada
          let ultimo = -1;
          const encima = () => {
            const a = Math.min(1, (reproductor.currentTime || 0) / ANIMACION);
            if(a === ultimo) return;
            ultimo = a;
            dibujarReel(ctx, placa, null, logo, REEL.ancho, REEL.alto, a, true);
          };
          encima();
          bucleReel = setInterval(encima, 80);
        }else if(conVideo){
          ctx.clearRect(0, 0, lienzo.width, lienzo.height);   // ya viene quemado
        }else{
          dibujarReel(ctx, placa, await cargarImagen(placa.portada),
            await cargarImagen(LOGO), REEL.ancho, REEL.alto, 1);
        }
        await pintarTira();
        return;
      }
      const laminas = placa.laminas || [];
      const conCierre = llevaCierre() && laminas.length + 2 <= 10;
      const ultima = laminas.length + (conCierre ? 1 : 0);
      if(vista > ultima) vista = 0;
      if(vista === 0){
        dibujar(ctx, placa, await imagenesDe(placa), lienzo.width);
      }else if(conCierre && vista === ultima){
        dibujarCierre(ctx, placa, await arteDelCierre(), lienzo.width);
      }else{
        const lam = laminas[vista - 1];
        dibujarLamina(ctx, placa, lam, await cargarImagen(lam.foto),
          await cargarImagen(LOGO), lienzo.width);
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
   1080, que es el tamaño con que muestra el feed. */
/* Miniaturas de todas las láminas, en orden, como van a salir en el feed. */
async function pintarTira(){
  const laminas = placa.laminas || [];
  const tira = $('#tira');
  if(placa.formato === 'reel'){
    $('#rotulo_tira').textContent = fuenteDelReel() ? 'Reel · un video vertical' : 'Reel · falta el video';
    tira.innerHTML = '';
    const compartirR = $('#compartir');
    if(compartirR) compartirR.hidden = true;
    return;
  }
  const compartir = $('#compartir');
  if(compartir) compartir.hidden = !navigator.canShare;

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
         <canvas width="160" height="160"></canvas><i>${i + 1}</i>
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
    dibujarLamina(ctx, placa, laminas[i], await cargarImagen(laminas[i].foto), logo, 160);
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
  lienzo.width = lienzo.height = 1080;
  const ctx = lienzo.getContext('2d');
  const logo = await cargarImagen(LOGO);
  const jpeg = () => new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.92));
  const aDataUrl = (blob) => new Promise((r) => {
    const l = new FileReader(); l.onload = () => r(l.result); l.readAsDataURL(blob);
  });

  const items = [];
  dibujar(ctx, placa, await imagenesDe(placa), 1080);
  items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });
  avisar?.(1 / total);

  for(const [i, lam] of laminas.entries()){
    if(lam.tipo === 'video'){
      items.push(await videoDeLamina(lam, i));
    }else{
      dibujarLamina(ctx, placa, lam, await cargarImagen(lam.foto), logo, 1080);
      items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });
    }
    avisar?.(items.length / total);
  }

  if(cierre){
    dibujarCierre(ctx, placa, await arteDelCierre(), 1080);
    items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });
    avisar?.(1);
  }
  return items;
}

async function archivosDelCarrusel(){
  const laminas = placa.laminas || [];
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 1080;
  const ctx = lienzo.getContext('2d');
  const logo = await cargarImagen(LOGO);
  const jpeg = () => new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.92));

  const archivos = [];
  dibujar(ctx, placa, await imagenesDe(placa), 1080);
  archivos.push(new File([await jpeg()], `${baseNombre()}-1.jpg`, { type: 'image/jpeg' }));
  for(let i = 0; i < laminas.length; i++){
    dibujarLamina(ctx, placa, laminas[i], await cargarImagen(laminas[i].foto), logo, 1080);
    archivos.push(new File([await jpeg()], `${baseNombre()}-${i + 2}.jpg`, { type: 'image/jpeg' }));
  }
  if(llevaCierre()){
    dibujarCierre(ctx, placa, await arteDelCierre(), 1080);
    archivos.push(new File([await jpeg()], `${baseNombre()}-cierre.jpg`, { type: 'image/jpeg' }));
  }
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

async function exportarPng(lado){
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = lado;
  dibujar(lienzo.getContext('2d'), placa, await imagenesDe(placa), lado);
  bajar(await new Promise((r) => lienzo.toBlob(r, 'image/png')), `${baseNombre()}-${lado}px.png`);
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
          <span>Y</span><input type="range" data-campo="circulo_y" min="8" max="92" step="0.5" value="${placa.circulo_y ?? 62.6}">
        </div>` : ''}
      </div>
    </div>`).join('');
  for(const [campo] of slots){
    const img = await cargarImagen(placa[campo]);
    const destino = document.querySelector(`.foto[data-campo="${campo}"] img`);
    if(img && destino) destino.src = img.src;
  }
  marcarSeleccion();
}

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
        <input type="file" accept="image/*,video/mp4,video/quicktime" data-lamina-foto="${i}">
        ${lam.tipo === 'video' ? '<p class="nota">Ya quedó con el logo quemado.</p>' :
          `<div class="ajuste">${AJUSTES.map(([id, n, ayuda]) =>
            `<button data-lamina-ajuste="${i}:${id}" title="${ayuda}">${n}</button>`).join('')}</div>`}
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
    b.classList.toggle('activo', (laminas[i].ajuste || 'completa') === valor);
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

async function pintarSelector(){
  const lista = await listarPlacas();
  $('#selector').innerHTML = lista.map((p) => {
    const fecha = String(p.actualizada || '').replace('T', ' ').slice(5, 16);
    return `<option value="${p.id}"${p.id === placa.id ? ' selected' : ''}>${esc(p.nombre)} — ${fecha}</option>`;
  }).join('');
  $('#cual').textContent = placa.nombre;
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

  placa = await leerPlaca(id);
  localStorage.setItem('placa', id);
  document.body.dataset.formato = placa.formato;
  const esReel = placa.formato === 'reel';
  // en un reel no hay imágenes que bajar, hay un video
  $('#bajar_reel').hidden = !esReel;
  $('#bajar_carrusel').hidden = esReel;
  document.querySelectorAll('[data-exportar]').forEach((b) => { b.hidden = esReel; });
  const urgente = placa.formato === 'urgente';
  $('#leg_titular').textContent = urgente ? 'Descripción' : 'Titular';
  $('#lab_titulo').textContent = urgente
    ? 'Lo único editable: se estira sola hasta llenar el ancho'
    : 'Un salto de línea = una línea en la placa';
  await volcarControles();
  irA(localStorage.getItem('seccion') || 'titular');
  pintarBarra();
  pintarBitacora();
  await pintarSelector();
  $('#portada').hidden = true;
  repintar();
  pintarCola();
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

$('#agregar_lamina').addEventListener('click', async () => {
  placa.laminas = (placa.laminas || []).concat(
    { foto: 'assets/marcador.jpg', ajuste: 'completa', x: 50, y: 50 });
  cambio('laminas', placa.laminas);
  await pintarLaminas();
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
    cambio('laminas', placa.laminas);
    return pintarLaminas();
  }
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
  const laminas = (placa.laminas || []).length + 1;
  if(!confirm(`Se va a publicar en Instagram un carrusel de ${laminas} imagen${laminas > 1 ? 'es' : ''}. ¿Seguimos?`)) return;
  ev.target.disabled = true;
  // publicar puede llevar minutos; si la pantalla se apaga, se corta todo
  const despierto = await mantenerDespierto();
  abrirTrabajo();
  congelar(true);   // cada pieza se dibuja con lo que hay ahora
  try{
    if(placa.formato === 'reel' && !fuenteDelReel()){
      estado('Falta el video del reel.', true);
      return;
    }
    let items;
    if(placa.formato === 'reel'){
      items = [await reelParaPublicar()];
    }else{
      trabajo('Generando las imágenes', 0);
      items = await itemsParaPublicar((a) => trabajo('Generando las imágenes', a));
    }

    anotar('publicando', { piezas: items.length,
      tipos: items.map((x) => x.tipo).join(', ') });
    const arranquePublicar = Date.now();
    trabajo('Publicando en Instagram', null,
      'Instagram tiene que recibir y procesar cada pieza. Con video puede tardar unos minutos. No cierres esta ventana.');
    const res = await fetch('api/publicar.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clave: clave(), items,
        caption: armarCaption(),
        colaboradores: placa.colaboradores || '',
        etiquetados: placa.etiquetados || '',
      }),
    });
    const datos = await res.json().catch(() => ({}));
    if(!res.ok){
      if(res.status === 401) localStorage.removeItem('clave_publicar');
      throw new Error(datos.error || `Error ${res.status}`);
    }
    anotar('publicado', { tardo: seg(Date.now() - arranquePublicar),
      aviso: datos.aviso ? String(datos.aviso).slice(0, 80) : 'sin avisos' });
    estado('Publicado' + (datos.aviso ? ' — ' + datos.aviso : ''));
    if(datos.enlace) window.open(datos.enlace, '_blank');
  }catch(e){ estado(e.message, true); }
  finally{
    cerrarTrabajo(); congelar(false);
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

async function pintarCola(){
  const cola = $('#cola');
  if(!cola) return;
  try{
    const { programadas, ahora, ahora_bd: bd } = await api('api/programar.php');
    // si los relojes del servidor no coinciden, lo programado sale a
    // destiempo y hay que saberlo antes de que pase
    const desfase = bd ? Math.abs(new Date(ahora) - new Date(bd.replace(' ', 'T') + 'Z')) : 0;
    const aviso = desfase > 120000
      ? `<li class="error">Ojo: el reloj de la base va ${Math.round(desfase / 60000)} min
         corrido respecto del servidor. Avisale a quien programó esto.</li>`
      : '';
    cola.innerHTML = aviso + ((programadas || []).map((p) => `
      <li class="${esc(p.estado)}">
        <b>${esc(new Date(p.publicar_en).toLocaleString('es-CL',
              { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</b>
        <span>${esc(p.nombre)} · ${esc(p.estado)}</span>
        ${p.estado === 'pendiente'
          ? `<button class="descarga quitar" data-quitar-cola="${p.id}">Cancelar</button>` : ''}
      </li>`).join('') || '<li class="pendiente">Nada programado.</li>');
  }catch(e){ cola.innerHTML = `<li class="error">${esc(e.message)}</li>`; }
}

$('#programar').addEventListener('click', async (ev) => {
  const cuando = $('#cuando').value;
  if(!cuando) return estado('Elegí la fecha y la hora.', true);
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
  ev.target.disabled = true;
  const despierto = await mantenerDespierto();
  abrirTrabajo();
  congelar(true);   // las imágenes se generan ahora, con lo que hay ahora
  try{
    const carga = await cargaParaProgramar();
    trabajo('Anotando en la cola', null);
    await api('api/programar.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clave: clave(), placa_id: placa.id, nombre: placa.nombre,
        // se manda el instante absoluto: el servidor puede estar en otra zona
        publicar_en: new Date(cuando).toISOString(),
        carga: { ...carga, caption: armarCaption(),
                 colaboradores: placa.colaboradores || '',
                 etiquetados: placa.etiquetados || '' },
      }),
    });
    estado('Programado');
    await pintarCola();
  }catch(e){ estado(e.message, true); }
  finally{
    cerrarTrabajo(); congelar(false);
    despierto?.release().catch(() => {});
    ev.target.disabled = false;
  }
});

$('#cola').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-quitar-cola]');
  if(!b) return;
  try{
    await api('api/programar.php?id=' + b.dataset.quitarCola, { method: 'DELETE' });
    await pintarCola();
  }catch(e){ estado(e.message, true); }
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
    estado(`Listas ${n} imagen${n > 1 ? 'es' : ''} en JPEG 1080`);
  }catch(e){ estado(e.message, true); }
  finally{ cerrarTrabajo(); congelar(false); ev.target.disabled = false; }
});

/* El reel terminado, para tenerlo en el teléfono o subirlo a mano. Si ya se
   grabó para publicar y no cambió nada, se baja el mismo y es instantáneo. */
$('#bajar_reel').addEventListener('click', async (ev) => {
  ev.target.disabled = true;
  const despierto = await mantenerDespierto();
  abrirTrabajo();
  congelar(true);   // el titular se le quema encima con lo que hay ahora
  try{
    if(!placa.reel_crudo && placa.video){
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
    cerrarTrabajo(); congelar(false);
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

/* Cuántos bits por segundo lleva el video grabado. Manda el tamaño del
   archivo y, con eso, lo que tarda en subir; no cambia lo que tarda la
   grabación, que va contra el reloj.
   Medido sobre cinco segundos: a 3,5 Mbps el archivo queda en el 78% y a
   2,5 en el 67%. Instagram recomprime todo igual, así que en modo rápido la
   pérdida casi no se ve y se sube un tercio menos. */
/* Declaradas como función y no como constante a propósito: se usan más
   arriba, al pintar el control, y una constante todavía no existiría. */
function calidadVideo(){ return localStorage.getItem('calidad_video') || 'alta'; }
function tasaDeVideo(){
  return calidadVideo() === 'rapida'
    ? 2_500_000
    : (innerWidth < 900 ? 5_000_000 : 8_000_000);
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

/* El camino rápido está terminado a medias: descomprime, dibuja y comprime
   bien —comprobado cuadro por cuadro—, pero el archivo que arma todavía no se
   puede recorrer: abre, dura lo que tiene que durar, y al saltar a cualquier
   segundo devuelve siempre el primer cuadro. El error está en la tabla de
   tiempos del contenedor.
   Queda apagado hasta que eso esté resuelto: un reel que no se puede
   reproducir es peor que uno que tarda. Se enciende poniendo
   codecs_rapido = 1 en el almacenamiento del navegador, para poder seguir
   probándolo sin tocar el código. */
const hayCodecs = () =>
  localStorage.getItem('codecs_rapido') === '1' &&
  typeof VideoEncoder === 'function' && typeof VideoDecoder === 'function';

async function quemarConCodecs(fuente, pintar, avisar, ancho, alto){
  const buffer = typeof fuente === 'string'
    ? await (await fetch(fuente)).arrayBuffer()
    : await fuente.arrayBuffer();

  const { video, audio } = leerMp4(buffer);
  if(!video || !video.muestras.length) throw new Error('no se pudo leer el índice del video');
  if(!video.descripcion) throw new Error('el video no viene en H.264');

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
  enc.configure({
    codec: 'avc1.42002a', width: ancho, height: alto,
    bitrate: tasaDeVideo(), framerate: 30, avc: { format: 'avc' },
    hardwareAcceleration: 'prefer-software', latencyMode: 'quality',
  });

  const total = video.muestras.length;
  let hechos = 0;
  const dec = new VideoDecoder({
    output: (cuadro) => {
      if(cerrado){ cuadro.close(); return; }
      try{
        pintar(ctx, cuadro, cuadro.timestamp / 1e6);
        const salida = new VideoFrame(lienzo, {
          timestamp: cuadro.timestamp, duration: cuadro.duration || 33333,
        });
        // una clave cada dos segundos, para que se pueda saltar dentro del video
        enc.encode(salida, { keyFrame: hechos % 60 === 0 });
        salida.close();
      }finally{
        cuadro.close();
        hechos++;
        if(hechos % 5 === 0) avisar?.(hechos / total);
      }
    },
    error: (e) => { falla = e; },
  });
  dec.configure({
    codec: video.codec, description: video.descripcion,
    codedWidth: video.ancho, codedHeight: video.alto,
  });

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
    // sin esto la cola crece sin límite y el aparato se queda sin memoria
    while(dec.decodeQueueSize > 20 || enc.encodeQueueSize > 20){
      await new Promise((r) => setTimeout(r, 6));
      if(falla) throw falla;
    }
  }
  await dec.flush(); dec.close();
  await enc.flush(); enc.close();
  cerrado = true;
  }catch(e){ cerrarTodo(); throw e; }
  if(falla) throw falla;
  if(!muestras.length) throw new Error('no salió ningún cuadro');

  // las duraciones salen de la distancia entre cuadros, en el reloj del archivo
  muestras.sort((a, b) => a.tiempo - b.tiempo);
  const pistaVideo = {
    tipo: 'video', reloj: RELOJ, ancho, alto, descripcion,
    muestras: muestras.map((m, i) => {
      const sig = muestras[i + 1];
      const dura = sig ? (sig.tiempo - m.tiempo) : (RELOJ / 30) * 1e6 / RELOJ;
      return { datos: m.datos, clave: m.clave,
               duracion: Math.max(1, Math.round(dura * RELOJ / 1e6)) };
    }),
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
  await new Promise((listo, falla) => {
    video.onloadedmetadata = listo;
    video.onerror = () => falla(new Error('No se pudo leer el video'));
  });
  if(video.duration > DURACION_MAX + 0.5){
    throw new Error(`El video dura ${enMinutos(video.duration)} y el máximo son `
      + `${enMinutos(DURACION_MAX)}. Recortalo y volvé a elegirlo.`);
  }

  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 1080;
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

  const grabador = new MediaRecorder(flujo, {
    mimeType: tipo, videoBitsPerSecond: tasaDeVideo(),
  });
  const trozos = [];
  grabador.ondataavailable = (e) => { if(e.data.size) trozos.push(e.data); };
  let falloGrabador = null;
  grabador.onerror = (e) => { falloGrabador = e.error || new Error('falló la grabación'); };

  let dibujando = true, cuadros = 0;
  const pintar = () => {
    if(!dibujando) return;
    dibujarLamina(ctx, placa, lamina, video, logo, 1080);
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
  await new Promise((listo, falla) => {
    video.onloadedmetadata = listo;
    video.onerror = () => falla(new Error('No se pudo leer el video'));
  });
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

  const grabador = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: tasaDeVideo() });
  const trozos = [];
  grabador.ondataavailable = (e) => { if(e.data.size) trozos.push(e.data); };
  let falloGrabador = null;
  grabador.onerror = (e) => { falloGrabador = e.error || new Error('falló la grabación'); };

  let dibujando = true, cuadros = 0;
  const pintar = () => {
    if(!dibujando) return;
    dibujarReel(ctx, placa, video, logo, REEL.ancho, REEL.alto,
      Math.min(1, video.currentTime / ANIMACION));
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
  dibujarReel(ctx, placa, video, logo, REEL.ancho, REEL.alto, 0);

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
    nivel: porciento < 80 ? 'mal' : (porciento < 95 ? 'aviso' : 'ok'),
  });

  if(falloGrabador) throw falloGrabador;
  if(!trozos.length) throw new Error('La grabación salió vacía. Probá con un video más corto.');

  // portada: un cuadro con el titular ya entrado
  video.currentTime = Math.min(2, video.duration / 2);
  await new Promise((r) => { video.onseeked = r; setTimeout(r, 600); });
  dibujarReel(ctx, placa, video, logo, REEL.ancho, REEL.alto, 1);
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
  anotar('video elegido', { para: 'reel', peso: mb(archivo.size) });
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

  // si mientras sube se cambia de placa, lo subido es de la otra: no se toca
  const suPlaca = placa;
  subiendoVideo = guardarFoto(archivo, (a) => {
    decir(`Guardando el video… ${Math.round(a * 100)}%. Podés ir escribiendo el titular.`);
  })
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
  fuenteDelReel(), placa.titulo, placa.etiqueta, placa.color_fondo, placa.color_filete,
]);

/* Elige el momento de la portada. La de fábrica salía negra: muchos videos
   arrancan con un fundido, y el cuadro fijo del segundo y medio caía justo
   ahí. Se prueban varios momentos, se mide cuánta imagen tiene cada uno
   —brillo medio y cuánto varía— y gana el que más tenga. */
async function momentoDePortada(fuente){
  const video = document.createElement('video');
  const propia = typeof fuente !== 'string';
  video.src = propia ? URL.createObjectURL(fuente) : fuente;
  video.muted = true;
  const sacar = enEscena(video);
  try{
    await new Promise((listo, falla) => {
      video.onloadedmetadata = listo;
      video.onerror = () => falla(new Error('No se pudo leer el video'));
    });
    const dura = video.duration || 0;
    if(!dura) return 1.5;

    // el primer segundo se saltea: casi siempre es el fundido de entrada
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
      const d = ctx.getImageData(0, 0, 96, 96).data;
      let suma = 0, suma2 = 0, n = 0;
      for(let i = 0; i < d.length; i += 16){   // uno de cada cuatro píxeles
        const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
        suma += v; suma2 += v * v; n++;
      }
      const media = suma / n;
      const contraste = Math.sqrt(Math.max(0, suma2 / n - media * media));
      // un cuadro negro tiene media y contraste casi cero; uno con imagen,
      // los dos altos. Se premia el contraste, que es lo que se ve.
      const puntaje = media * 0.6 + contraste * 1.4;
      if(puntaje > mejorPuntaje){ mejorPuntaje = puntaje; mejor = t; }
    }
    return mejor;
  }catch(e){
    return 1.5;   // ante la duda, lo de antes
  }finally{ sacar(); if(propia) URL.revokeObjectURL(video.src); }
}

async function grabarReel(){
  const fuente = fuenteDelReel();
  if(!fuente) throw new Error('Falta el video del reel');
  const firma = firmaDelReel();
  if(ultimoQuemado && ultimoQuemado.firma === firma) return ultimoQuemado;

  const rotulo = 'Grabando el titular en el video';
  const espera = 'Se le queman encima el titular, la etiqueta y el logo.';
  const lento = espera + ' La grabación es en tiempo real, así que tarda lo que '
    + 'dura el video. Dejá esta pantalla a la vista.';
  trabajo(rotulo, 0, espera);

  // se graba desde el archivo del propio teléfono cuando está: no hay que
  // bajarlo del servidor para volver a subirlo
  let video = null;
  if(hayCodecs()){
    try{
      const logo = await cargarImagen(LOGO);
      video = await quemarConCodecs(fuente,
        (ctx, cuadro, segundos) => {
          dibujarReel(ctx, placa, cuadro, logo, REEL.ancho, REEL.alto,
            Math.min(1, segundos / ANIMACION));
        },
        (a) => trabajo(rotulo, a, espera),
        REEL.ancho, REEL.alto);
    }catch(e){
      if(String(e.message) === 'Cancelado') throw e;
      console.warn('el camino rápido no pudo, se graba a la antigua:', e.message);
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
    (a) => trabajo('Subiendo el reel', a, 'Ya está grabado: falta que llegue al servidor.'));
  ultimoQuemado = { firma, ruta: sub.ruta, blob: video, portadaEn };
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
    await new Promise((listo, falla) => {
      video.onloadedmetadata = listo;
      video.onerror = () => falla(new Error('No se pudo leer el video'));
    });
    if(video.duration > DURACION_MAX + 0.5){
      throw new Error(`El video dura ${enMinutos(video.duration)} y el máximo son `
      + `${enMinutos(DURACION_MAX)}. Recortalo y volvé a elegirlo.`);
    }
    video.currentTime = Math.min(1, video.duration / 2);
    await new Promise((r) => { video.onseeked = r; setTimeout(r, 1500); });

    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = 1080;
    dibujarFoto(lienzo.getContext('2d'), video, 0, 0, 1080, 1080, 'cubrir', 50, 50, 1080 / LIENZO);
    const jpg = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.9));
    return { jpg, duracion: video.duration, ancho: video.videoWidth, alto: video.videoHeight };
  }finally{ sacar(); URL.revokeObjectURL(video.src); }
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
    anotar('video elegido', { para: 'carrusel', peso: mb(archivo.size),
      dura: seg(duracion * 1000), tamano: `${ancho}x${alto}` });
    if(duracion > 45){
      estado(`Ojo: dura ${enMinutos(duracion)}. Al publicar, grabarlo va a tardar lo mismo.`);
    }

    trabajo('Subiendo el video', 0, 'Se guarda tal cual, sin procesar.');
    const subido = await guardarFoto(archivo,
      (a) => trabajo('Subiendo el video', a, 'Se guarda tal cual, sin procesar.'));
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

async function videoDeLamina(lam, i){
  if(!lam.crudo) return { tipo: 'video', ruta: lam.video };   // de antes: ya venía quemado

  const firma = JSON.stringify([lam.crudo, lam.ajuste, lam.x, lam.y, placa.color_fondo]);
  const guardado = quemados.get(lam.crudo);
  if(guardado && guardado.firma === firma) return { tipo: 'video', ruta: guardado.ruta };

  const espera = 'Se le graban encima el degradado y el logo.';
  const lento = espera + ' La grabación es en tiempo real: tarda lo que dura '
    + 'el video. Dejá esta pantalla a la vista.';
  const rotulo = `Grabando el video ${i + 1}`;
  trabajo(rotulo, 0, espera);

  let video = null;
  if(hayCodecs()){
    try{
      const logo = await cargarImagen(LOGO);
      video = await quemarConCodecs(lam.crudo,
        (ctx, cuadro) => dibujarLamina(ctx, placa, lam, cuadro, logo, 1080),
        (a) => trabajo(rotulo, a, espera), 1080, 1080);
    }catch(e){
      if(String(e.message) === 'Cancelado') throw e;
      console.warn('el camino rápido no pudo, se graba a la antigua:', e.message);
      video = null;
    }
  }
  if(!video){
    trabajo(rotulo, 0, lento);
    ({ video } = await quemarVideo(lam.crudo, lam, (a) => trabajo(rotulo, a, lento)));
  }
  trabajo('Subiendo el video', 0, 'Ya está grabado: falta que llegue al servidor.');
  const sub = await guardarFoto(new File([video], 'lamina.mp4', { type: 'video/mp4' }),
    (a) => trabajo('Subiendo el video', a, 'Ya está grabado: falta que llegue al servidor.'));
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
      // en la zona del carrusel se agregan todas las que entren
      const lugar = MAX_LAMINAS - (placa.laminas || []).length;
      const entran = archivos.slice(0, lugar);
      if(!entran.length) return estado(`El carrusel ya está lleno: ${MAX_LAMINAS + 1} imágenes más el cierre`, true);
      abrirTrabajo();
      const suPlaca = placa;
      try{
        for(const [i, archivo] of entran.entries()){
          // el video abre su propio aviso, con su porcentaje
          if(esVideo(archivo)){ await agregarVideo(archivo); continue; }
          trabajo(`Subiendo ${entran.length > 1 ? `${i + 1} de ${entran.length}` : 'la foto'}`,
            i / entran.length, archivo.name);
          const { ruta } = await guardarFoto(archivo);
          if(placa !== suPlaca) return estado('Las fotos subieron, pero ya estabas en otra noticia.', true);
          placa.laminas = (placa.laminas || []).concat({ foto: ruta, ajuste: 'completa', x: 50, y: 50 });
        }
      }finally{ cerrarTrabajo(); }
      cambio('laminas', placa.laminas);
      await pintarLaminas();
      estado(`${entran.length} foto${entran.length > 1 ? 's' : ''} al carrusel` +
             (archivos.length > entran.length ? ` (${archivos.length - entran.length} no entraron)` : ''));
    }
  }catch(e){ estado(e.message, true); }
});

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

async function abrirPortada(){
  const ultima = await ultimaPlaca();
  const seguir = $('#seguir');
  seguir.hidden = !ultima;
  if(ultima){
    seguir.textContent = 'Seguir con la última: ' + ultima.nombre;
    seguir.dataset.id = ultima.id;
  }
  $('#portada').hidden = false;
}

$('#portada').addEventListener('click', async (ev) => {
  const boton = ev.target.closest('[data-crear], #seguir');
  if(!boton) return;
  if(boton.id === 'seguir') return cargar(Number(boton.dataset.id));
  const plantillas = { urgente: URGENTE, reel: REELS, noticia: BASE };
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
  if(Array.isArray(MARCA.formatos)){
    document.querySelectorAll('[data-crear]').forEach((b) => {
      b.hidden = !MARCA.formatos.includes(b.dataset.crear);
    });
  }

  await esperarTipografias();
  pintarDisenos();
  pintarPaleta();
  pintarChips();
  if(!clave()) return pantallaClave();
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
