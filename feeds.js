/* El panel de noticias de otros medios.
 *
 * Trae los feeds que estén dados de alta, los muestra en una tabla con la
 * foto, el titular, la etiqueta y la bajada, y de ahí se publica con un
 * botón. Lo que se publica lo dibuja placa.js, el mismo dibujante del editor,
 * así que sale idéntico a lo que se hace a mano.
 *
 * No toca el editor. Comparte con él la clave, la marca y el dibujante, y
 * nada más: son dos páginas separadas y cada una anda sin la otra.
 */

import { dibujarCierre, esperarTipografias, LIENZO, altoDe } from './placa.js';
import * as somosPuerto from './placa.js';
import * as eyey from './dibujo-eyey.js';
import { MARCA } from './marca/marca.js';

const DIBUJANTE = { 'eyey': eyey }[MARCA.dibujo] || somosPuerto;
const dibujar = (ctx, datos, fotos, ancho) => DIBUJANTE.dibujar(ctx, datos, fotos, ancho, MARCA);

const ANCHO_FEED = 1080;          // lo mismo que el editor: el 4:5 del feed
const LOGO   = MARCA.logo;
const CIERRE = MARCA.cierre;
const ETIQUETAS = MARCA.etiquetas || ['Noticia'];
const PALETA = MARCA.paleta || [{ fondo: '#ff0054', filete: '#0ae7ae' }];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ */
/* la clave, igual que en el editor                                    */
/* ------------------------------------------------------------------ */

const clave = () => localStorage.getItem('clave_publicar') || '';

async function api(ruta, opciones = {}){
  const r = await fetch(ruta, {
    ...opciones,
    headers: { 'X-Clave': clave(), ...(opciones.headers || {}) },
  });
  const datos = await r.json().catch(() => ({}));
  if(!r.ok){
    if(r.status === 401){ localStorage.removeItem('clave_publicar'); pedirClave(); }
    throw new Error(datos.error || `Error ${r.status}`);
  }
  return datos;
}

function pedirClave(mensaje){
  $('#velo_clave').hidden = false;
  $('#aviso_clave').textContent = mensaje || '';
  $('#clave').focus();
}

$('#entrar').addEventListener('click', async () => {
  const valor = $('#clave').value.trim();
  if(!valor) return;
  localStorage.setItem('clave_publicar', valor);
  try{
    await api('api/feeds.php?tarea=fuentes');
    $('#velo_clave').hidden = true;
    arrancar();
  }catch(e){ pedirClave(e.message); }
});
$('#clave').addEventListener('keydown', (e) => { if(e.key === 'Enter') $('#entrar').click(); });

/* ------------------------------------------------------------------ */
/* etiquetas: del vocabulario del medio ajeno al nuestro               */
/* ------------------------------------------------------------------ */

/* Cada medio nombra sus secciones a su manera —BioBio dice «Región del Bío
   Bío», ADN dice «Chile», ipauta dice «Exclusivas»— y nosotros tenemos las
   nuestras. Esto traduce de unas a otras por palabras clave, para no tener
   que elegir a mano en cada noticia. La elección queda igual en un menú: esto
   propone, no decide. */
const PISTAS = [
  ['Deportes',     /deport|f[uú]tbol|futbol|colo.?colo|universidad de chile|selecci[oó]n|copa|liga|gol|tenis|nba|mundial|atleta|entrenador|dt\b/i],
  ['Policial',     /policial|polic[ií]a|delito|crimen|homicidio|asesinat|robo|deten|carabiner|fiscal[ií]a|narco|balac|femicid|secuestr/i],
  ['Política',     /pol[ií]tic|gobierno|presidente|ministr|congreso|senad|diputad|elecci|candidat|partido|constituc|alcald|municipal/i],
  ['Farándula',    /far[aá]ndul|celebrit|influencer|reality|matrimonio|pareja|romance|escándalo|instagram/i],
  ['Espectáculos', /espect[aá]cul|m[uú]sica|musica|cine|serie|netflix|concierto|festival|artista|cantante|disco|[aá]lbum|reggaet|urbano|estreno|tv\b|televisi/i],
  ['Comunidad',    /comunidad|vecin|regi[oó]n|comuna|salud|educaci|hospital|colegio|transporte|clima|sismo|temblor|emergencia|incendi/i],
  ['Contingencia', /contingenc|econom|d[oó]lar|inflaci|paro|huelga|protesta|manifestaci/i],
];

function etiquetaSugerida(categorias, titulo){
  const texto = [...(categorias || []), titulo || ''].join(' ');
  for(const [nuestra, pista] of PISTAS){
    if(!ETIQUETAS.includes(nuestra)) continue;   // el otro medio puede no tenerla
    if(pista.test(texto)) return nuestra;
  }
  // si no se parece a nada, la primera de la marca: siempre hay que poner una
  return ETIQUETAS.includes('Noticia') ? 'Noticia' : ETIQUETAS[0];
}

/* ------------------------------------------------------------------ */
/* estado                                                              */
/* ------------------------------------------------------------------ */

let fuentes = [];
let fuenteActiva = null;
let noticias = [];
const publicadas = new Set(JSON.parse(localStorage.getItem('feeds_publicadas') || '[]'));

function recordarPublicada(id){
  publicadas.add(id);
  // se guardan las últimas 300: alcanza para no repetir y no crece sin fin
  localStorage.setItem('feeds_publicadas', JSON.stringify([...publicadas].slice(-300)));
}

function estado(texto, mal){
  const el = $('#estado');
  el.textContent = texto || '';
  el.classList.toggle('error', !!mal);
}

/* ------------------------------------------------------------------ */
/* pestañas                                                            */
/* ------------------------------------------------------------------ */

function pintarPestanas(){
  const nav = $('#pestanas');
  nav.innerHTML = fuentes.map((f) => `
    <button data-fuente="${f.id}" class="${f.id === fuenteActiva ? 'activa' : ''}">${esc(f.nombre)}</button>
  `).join('') + '<button class="mas" data-abrir-fuentes>+ Agregar medio</button>';
}

$('#pestanas').addEventListener('click', (ev) => {
  if(ev.target.closest('[data-abrir-fuentes]')) return abrirFuentes();
  const b = ev.target.closest('[data-fuente]');
  if(!b) return;
  fuenteActiva = Number(b.dataset.fuente);
  localStorage.setItem('feeds_ultima', String(fuenteActiva));
  pintarPestanas();
  cargarNoticias();
});

/* ------------------------------------------------------------------ */
/* la tabla                                                            */
/* ------------------------------------------------------------------ */

function pintarNoticias(){
  const lista = $('#lista');
  $('#cabecera').hidden = !noticias.length;
  if(!noticias.length){
    lista.innerHTML = `<p class="vacio">Esta fuente no devolvió noticias.<br>
      Puede que el medio no haya publicado nada todavía, o que haya cambiado la dirección del feed.</p>`;
    return;
  }
  lista.innerHTML = noticias.map((n, i) => `
    <article class="noticia ${publicadas.has(n.id) ? 'publicada' : ''}" data-i="${i}">
      <div class="celda-foto">
        <div class="previa">
          <canvas class="miniatura" width="${VISTA}" height="${altoDe(VISTA)}" data-previa
                  title="Tocala para retocarla"></canvas>
          <canvas class="miniatura chica" width="${VISTA}" height="${altoDe(VISTA)}" data-cierre
                  title="La lámina de cierre · tocala para retocar la placa"></canvas>
        </div>
        <span class="apunte" data-estado-foto>${n.foto ? '' : 'buscando la foto…'}</span>
      </div>
      <div class="celda-titular">
        <textarea class="titular" data-campo="titulo">${esc(n.titulo)}</textarea>
        <span class="fuente">
          ${n.fecha ? esc(new Date(n.fecha).toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })) : ''}
          ${n.enlace ? ` · <a href="${esc(n.enlace)}" target="_blank" rel="noopener noreferrer">ver la nota</a>` : ''}
        </span>
      </div>
      <div class="celda-etiqueta">
        <select data-campo="etiqueta">
          ${ETIQUETAS.map((e) => `<option ${e === n.etiqueta ? 'selected' : ''}>${esc(e)}</option>`).join('')}
        </select>
        <div class="paleta">
          ${PALETA.map((p, k) => `
            <button class="tono ${k === n.paleta ? 'activa' : ''}" data-paleta="${k}"
                    title="${esc(p.nombre || '')}" aria-label="${esc(p.nombre || '')}">
              <i style="background:${esc(p.fondo)}"></i><i style="background:${esc(p.filete)}"></i>
            </button>`).join('')}
        </div>
      </div>
      <div class="celda-resumen">
        <textarea class="resumen" data-campo="resumen">${esc(n.resumen)}</textarea>
      </div>
      <div class="celda-acciones">
        <div class="acciones">
          <button class="principal" data-publicar>Publicar post ahora</button>
          <button data-editor>Abrir en el editor</button>
          <span class="apunte" data-apunte>${publicadas.has(n.id) ? 'Ya la publicaste' : ''}</span>
        </div>
      </div>
    </article>`).join('');
  dibujarTodas();
  buscarFotosQueFaltan();
}

/* El ancho al que se dibuja la vista previa. Chico, pero el doble de lo que
   se ve, para que no salga borrosa en pantallas densas. */
const VISTA = 420;
/* El modal dibuja más fino: es donde se mira de cerca. */
const MODAL = 660;

/* La vista previa es la placa de verdad, dibujada con el mismo dibujante que
   la publica. Antes acá iba la foto cruda del medio, y eso obligaba a
   publicar a ciegas: el titular podía no entrar, la etiqueta podía estar
   equivocada y no había forma de saberlo hasta verlo publicado.
   La foto se dibuja directo desde el sitio del otro medio, sin bajarla. Eso
   «mancha» el lienzo y el navegador después no deja sacar el JPEG, pero para
   mirar no molesta: al publicar se baja la foto y se dibuja de nuevo en un
   lienzo limpio. Así la previa es instantánea y no llena el servidor de
   fotos de noticias que nunca se van a publicar. */
async function dibujarPrevia(n, art){
  if(!art || !art.isConnected) return;
  const lienzo = art.querySelector('[data-previa]');
  const cierre = art.querySelector('[data-cierre]');
  if(!lienzo) return;

  const placa = placaDesde(n, n.fotoPropia || n.foto || 'assets/marcador.jpg');
  const [foto, logo] = await Promise.all([cargarImagen(placa.foto_izq), cargarImagen(LOGO)]);
  if(!art.isConnected) return;
  dibujar(lienzo.getContext('2d'), placa, { izq: foto, der: foto, cen: foto, logo }, VISTA);

  if(cierre){
    if(CIERRE === false){ cierre.hidden = true; }
    else dibujarCierre(cierre.getContext('2d'), placa, await arteDelCierre(placa.color_fondo), VISTA);
  }
}

/* Se junta el redibujo: escribiendo el titular, cada tecla pediría uno. */
const esperando = new Map();
function pedirPrevia(n, art){
  clearTimeout(esperando.get(n.id));
  esperando.set(n.id, setTimeout(() => dibujarPrevia(n, art), 220));
}

function dibujarTodas(){
  for(const [i, n] of noticias.entries()){
    dibujarPrevia(n, document.querySelector(`.noticia[data-i="${i}"]`));
  }
}

/* Las noticias que no traen foto en el feed —BioBio, por ejemplo— la tienen
   en la propia nota. Se pide de a una y en segundo plano: son pedidos a otro
   sitio y no vale la pena hacer esperar la tabla por ellos. */
async function buscarFotosQueFaltan(){
  for(const [i, n] of noticias.entries()){
    if(n.foto || !n.enlace || n.sinFoto) continue;
    try{
      const { foto } = await api('api/feeds.php?tarea=portada&url=' + encodeURIComponent(n.enlace));
      if(fuenteActiva !== n.deFuente) return;          // se cambió de pestaña
      n.foto = foto || null;
      n.sinFoto = !foto;
      const art = document.querySelector(`.noticia[data-i="${i}"]`);
      const aviso = art?.querySelector('[data-estado-foto]');
      if(aviso) aviso.textContent = foto ? '' : 'sin foto: abrila en el editor y ponele una';
      if(foto) await dibujarPrevia(n, art);
    }catch(e){ n.sinFoto = true; }
  }
}

$('#lista').addEventListener('input', (ev) => {
  const art = ev.target.closest('.noticia');
  const campo = ev.target.dataset.campo;
  if(!art || !campo) return;
  const n = noticias[Number(art.dataset.i)];
  n[campo] = ev.target.value;
  // el titular y la etiqueta se ven en la placa; la bajada no
  if(campo !== 'resumen') pedirPrevia(n, art);
});

$('#lista').addEventListener('click', async (ev) => {
  const art = ev.target.closest('.noticia');
  if(!art) return;
  const n = noticias[Number(art.dataset.i)];

  const tono = ev.target.closest('[data-paleta]');
  if(tono){
    n.paleta = Number(tono.dataset.paleta);
    localStorage.setItem('feeds_paleta', String(n.paleta));
    art.querySelectorAll('[data-paleta]').forEach((b) =>
      b.classList.toggle('activa', b === tono));
    return dibujarPrevia(n, art);
  }
  if(ev.target.closest('[data-previa], [data-cierre], [data-retocar]')) return abrirModal(n, art);

  if(ev.target.closest('[data-publicar]')) return publicarNoticia(n, art);
  if(ev.target.closest('[data-editor]'))   return abrirEnElEditor(n, art);
});

/* El modal de retoque: la placa en grande y los mismos controles del editor.
   La foto de una nota ajena casi nunca cae bien de una: viene apaisada, o con
   la cara contra un borde. Con esto se acomoda sin salir de la tabla, y lo
   que se ve es la placa de verdad, no una aproximación. */
let enModal = null;   // { n, art }

function abrirModal(n, art){
  enModal = { n, art };
  $('#m_titulo').value = n.titulo;
  $('#m_etiqueta').innerHTML = ETIQUETAS.map((e) =>
    `<option ${e === n.etiqueta ? 'selected' : ''}>${esc(e)}</option>`).join('');
  $('#m_paleta').innerHTML = PALETA.map((p, k) => `
    <button class="tono ${k === (n.paleta ?? 0) ? 'activa' : ''}" data-m-paleta="${k}"
            title="${esc(p.nombre || '')}">
      <i style="background:${esc(p.fondo)}"></i><i style="background:${esc(p.filete)}"></i>
    </button>`).join('');
  $('#m_x').value = n.foto_x ?? 50;
  $('#m_y').value = n.foto_y ?? 50;
  marcarAjuste();
  $('#velo_modal').hidden = false;
  dibujarModal();
}

function marcarAjuste(){
  const cual = enModal?.n.ajuste || 'completa';
  document.querySelectorAll('[data-m-ajuste]').forEach((b) =>
    b.classList.toggle('activo', b.dataset.mAjuste === cual));
}

async function dibujarModal(){
  if(!enModal) return;
  const { n } = enModal;
  const placa = placaDesde(n, n.fotoPropia || n.foto || 'assets/marcador.jpg');
  const [foto, logo] = await Promise.all([cargarImagen(placa.foto_izq), cargarImagen(LOGO)]);
  if(!enModal) return;
  const c = $('#m_placa');
  c.width = MODAL; c.height = altoDe(MODAL);
  dibujar(c.getContext('2d'), placa, { izq: foto, der: foto, cen: foto, logo }, MODAL);
  const cc = $('#m_cierre');
  if(CIERRE === false){ cc.hidden = true; return; }
  cc.width = MODAL; cc.height = altoDe(MODAL);
  dibujarCierre(cc.getContext('2d'), placa, await arteDelCierre(placa.color_fondo), MODAL);
}

function cerrarModal(){
  if(enModal){
    // lo retocado se refleja en la fila y en sus campos
    const { n, art } = enModal;
    const t = art.querySelector('[data-campo="titulo"]');
    if(t) t.value = n.titulo;
    const e = art.querySelector('[data-campo="etiqueta"]');
    if(e) e.value = n.etiqueta;
    art.querySelectorAll('[data-paleta]').forEach((b) =>
      b.classList.toggle('activa', Number(b.dataset.paleta) === (n.paleta ?? 0)));
    dibujarPrevia(n, art);
  }
  enModal = null;
  $('#velo_modal').hidden = true;
}

$('#m_cerrar').addEventListener('click', cerrarModal);
$('#velo_modal').addEventListener('click', (ev) => { if(ev.target.id === 'velo_modal') cerrarModal(); });
document.addEventListener('keydown', (e) => { if(e.key === 'Escape') cerrarModal(); });

$('#velo_modal').addEventListener('input', (ev) => {
  if(!enModal) return;
  const { n } = enModal;
  if(ev.target.id === 'm_titulo')   n.titulo = ev.target.value;
  if(ev.target.id === 'm_etiqueta') n.etiqueta = ev.target.value;
  if(ev.target.id === 'm_x')        n.foto_x = Number(ev.target.value);
  if(ev.target.id === 'm_y')        n.foto_y = Number(ev.target.value);
  dibujarModal();
});

$('#velo_modal').addEventListener('click', async (ev) => {
  if(!enModal) return;
  const { n } = enModal;
  const tono = ev.target.closest('[data-m-paleta]');
  if(tono){
    n.paleta = Number(tono.dataset.mPaleta);
    localStorage.setItem('feeds_paleta', String(n.paleta));
    $('#m_paleta').querySelectorAll('.tono').forEach((b) => b.classList.toggle('activa', b === tono));
    return dibujarModal();
  }
  const aj = ev.target.closest('[data-m-ajuste]');
  if(aj){
    n.ajuste = aj.dataset.mAjuste;
    marcarAjuste();
    return dibujarModal();
  }
  if(ev.target.closest('[data-m-centrar]')){
    n.foto_x = 50; n.foto_y = 50;
    $('#m_x').value = 50; $('#m_y').value = 50;
    return dibujarModal();
  }
});

/* Cambiar la foto por una propia. La de la nota a veces no sirve —una captura
   de pantalla, un gráfico, la cara cortada— y era motivo para irse al editor
   por una sola cosa. */
$('#m_archivo').addEventListener('change', async (ev) => {
  const archivo = ev.target.files && ev.target.files[0];
  if(!archivo || !enModal) return;
  const { n } = enModal;
  $('#m_aviso').textContent = 'Subiendo la foto…';
  try{
    const r = await fetch('api/fotos.php', {
      method: 'POST',
      headers: { 'X-Clave': clave(), 'Content-Type': 'application/octet-stream' },
      body: archivo,
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || `Error ${r.status}`);
    n.fotoPropia = d.ruta;
    n.foto_x = 50; n.foto_y = 50;
    $('#m_x').value = 50; $('#m_y').value = 50;
    $('#m_aviso').textContent = 'Foto cambiada.';
    dibujarModal();
  }catch(e){ $('#m_aviso').textContent = e.message; }
  ev.target.value = '';
});

/* ------------------------------------------------------------------ */
/* armar la placa                                                      */
/* ------------------------------------------------------------------ */

/* Sin decir de dónde venimos. Varios medios —ipauta entre ellos— devuelven
   403 cuando la foto se pide desde otro sitio: es la defensa contra el
   hotlinking. Pedida sin referencia, la misma foto responde 200.
   Sin esto la placa salía en negro, y encima parecía otro problema: como el
   dibujo se hacía igual, se veía la placa armada pero vacía. */
function cargarImagen(ruta){
  return new Promise((listo) => {
    if(!ruta) return listo(null);
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => listo(img);
    img.onerror = () => listo(null);
    img.src = ruta;
  });
}

/* La lámina de cierre puede venir en dos versiones, clara y oscura, porque
   una sola no se lee sobre toda la paleta. Mismo criterio que el editor. */
async function arteDelCierre(colorFondo){
  const { textoSobre } = somosPuerto;
  const claro = textoSobre(colorFondo || '#000000') === '#ffffff';
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

/* El titular de un feed viene en una sola línea y muy largo. Se corta en
   líneas parecidas para que el dibujante no tenga que achicarlo tanto. */
function repartirTitular(texto, porLinea = 26){
  const palabras = String(texto).trim().split(/\s+/);
  const lineas = [];
  let actual = '';
  for(const p of palabras){
    if(actual && (actual + ' ' + p).length > porLinea){ lineas.push(actual); actual = p; }
    else actual = actual ? actual + ' ' + p : p;
  }
  if(actual) lineas.push(actual);
  return lineas.join('\n');
}

function placaDesde(n, ruta){
  const p = PALETA[n.paleta ?? 0] || PALETA[0];
  return {
    /* Los valores del medio van PRIMERO, como piso: son lo que trae puesto
       una placa nueva. Estaban al final, y ahí pisaban todo lo elegido en la
       fila. En eyey, que fija color y etiqueta en sus predeterminados, eso
       hacía que la placa saliera siempre roja y siempre con «Musica» por más
       que se tocara otra paleta u otra etiqueta: se veía marcada la elegida y
       se dibujaba la del medio. */
    ...(MARCA.predeterminados || {}),
    nombre: n.titulo.slice(0, 60),
    titulo: repartirTitular(n.titulo),
    etiqueta: n.etiqueta,
    formato: 'noticia',
    diseno: 'unica',
    /* Entera y no recortada, igual que arranca una placa en el editor: una
       foto de prensa suele traer la cara pegada a un borde, y recortarla al
       4:5 sin mirar corta justo lo que importa. Lo que sobra se rellena con
       una copia difuminada de la misma foto. Desde el modal se cambia. */
    foto_izq: ruta, foto_izq_x: n.foto_x ?? 50, foto_izq_y: n.foto_y ?? 50,
    foto_izq_ajuste: n.ajuste || 'completa',
    foto_der: ruta, foto_der_x: n.foto_x ?? 50, foto_der_y: n.foto_y ?? 50,
    foto_der_ajuste: n.ajuste || 'completa',
    foto_cen: ruta, foto_cen_x: n.foto_x ?? 50, foto_cen_y: n.foto_y ?? 50,
    foto_cen_ajuste: n.ajuste || 'completa',
    color_fondo: p.fondo, color_filete: p.filete,
    circulo_x: 50, circulo_y: 62.6,
    laminas: [],
    descripcion: n.resumen || n.titulo,
    hashtags: '', colaboradores: '', etiquetados: '',
  };
}

/* Baja la foto de la noticia a nuestro servidor. Hay que hacerlo sí o sí:
   una imagen de otro dominio dibujada en un canvas lo deja «manchado» y el
   navegador después no deja sacar el JPEG. */
async function bajarFoto(url){
  const { ruta } = await api('api/feeds.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: clave(), tarea: 'foto', url }),
  });
  return ruta;
}

async function piezasParaPublicar(placa){
  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO_FEED;
  lienzo.height = altoDe(ANCHO_FEED);
  const ctx = lienzo.getContext('2d');
  const jpeg = () => new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.92));
  const aDataUrl = (blob) => new Promise((r) => {
    const l = new FileReader(); l.onload = () => r(l.result); l.readAsDataURL(blob);
  });

  const foto = await cargarImagen(placa.foto_izq);
  const logo = await cargarImagen(LOGO);
  const items = [];

  dibujar(ctx, placa, { izq: foto, der: foto, cen: foto, logo }, ANCHO_FEED);
  items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });

  // la lámina de cierre, igual que en el editor
  if(CIERRE !== false){
    dibujarCierre(ctx, placa, await arteDelCierre(placa.color_fondo), ANCHO_FEED);
    items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* los dos botones                                                     */
/* ------------------------------------------------------------------ */

function ocupar(art, texto, clase){
  art.classList.add('ocupada');
  art.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  const ap = art.querySelector('[data-apunte]');
  if(ap){ ap.textContent = texto; ap.className = 'apunte ' + (clase || ''); }
}
function liberar(art, texto, clase){
  art.classList.remove('ocupada');
  art.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  const ap = art.querySelector('[data-apunte]');
  if(ap){ ap.textContent = texto || ''; ap.className = 'apunte ' + (clase || ''); }
}

async function publicarNoticia(n, art){
  if(!n.foto && !n.fotoPropia) return liberar(art, 'Esta noticia no tiene foto: abrila en el editor y ponele una.', 'mal');
  if(!String(n.titulo).trim()) return liberar(art, 'Falta el titular.', 'mal');
  const cuantas = CIERRE === false ? 1 : 2;
  if(!confirm(`Se va a publicar en Instagram, ahora mismo, un post de ${cuantas} imagen${cuantas > 1 ? 'es' : ''}:\n\n`
    + `«${n.titulo.slice(0, 120)}»\n\n¿Seguimos?`)) return;

  try{
    ocupar(art, 'Bajando la foto…');
    // si se subió una propia desde el modal, esa ya está en el servidor
    const ruta = n.fotoPropia || await bajarFoto(n.foto);

    ocupar(art, 'Dibujando la placa…');
    const placa = placaDesde(n, ruta);
    const items = await piezasParaPublicar(placa);

    ocupar(art, 'Publicando en Instagram… puede tardar un minuto.');
    const r = await fetch('api/publicar.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clave: clave(), items,
        caption: [placa.descripcion, placa.hashtags].filter(Boolean).join('\n\n'),
      }),
    });
    const datos = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(datos.error || `Error ${r.status}`);

    recordarPublicada(n.id);
    art.classList.add('publicada');
    liberar(art, 'Publicada' + (datos.aviso ? ' — ' + datos.aviso : ''), 'ok');
    if(datos.enlace) window.open(datos.enlace, '_blank', 'noopener');
  }catch(e){
    liberar(art, e.message, 'mal');
  }
}

/* Para cuando hay que retocarla: se crea la placa y se abre el editor en
   ella. Es el mismo camino de siempre, con el trabajo aburrido ya hecho. */
async function abrirEnElEditor(n, art){
  try{
    ocupar(art, 'Preparando la placa…');
    const ruta = n.fotoPropia || (n.foto ? await bajarFoto(n.foto) : 'assets/marcador.jpg');
    const placa = placaDesde(n, ruta);
    const { id } = await api('api/placas.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: clave(), placa }),
    });
    // el editor abre la que diga 'placa' en el almacenamiento del navegador
    localStorage.setItem('placa', String(id));
    location.href = 'index.html';
  }catch(e){ liberar(art, e.message, 'mal'); }
}

/* ------------------------------------------------------------------ */
/* fuentes                                                             */
/* ------------------------------------------------------------------ */

function abrirFuentes(){
  $('#velo_fuentes').hidden = false;
  $('#aviso_fuentes').textContent = '';
  pintarListaFuentes();
}
$('#cerrar_fuentes').addEventListener('click', () => { $('#velo_fuentes').hidden = true; });
$('#fuentes').addEventListener('click', abrirFuentes);

function pintarListaFuentes(){
  $('#lista_fuentes').innerHTML = fuentes.map((f) => `
    <li><span><b>${esc(f.nombre)}</b><small>${esc(f.url)}</small></span>
        <button data-quitar="${f.id}">Quitar</button></li>`).join('')
    || '<li><span class="nota">Todavía no hay ninguna.</span></li>';
}

$('#lista_fuentes').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-quitar]');
  if(!b) return;
  const f = fuentes.find((x) => String(x.id) === b.dataset.quitar);
  if(!confirm(`¿Quitar «${f ? f.nombre : ''}» de las pestañas?`)) return;
  try{
    await api('api/feeds.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: clave(), tarea: 'quitar', id: Number(b.dataset.quitar) }),
    });
    await cargarFuentes();
    pintarListaFuentes();
  }catch(e){ $('#aviso_fuentes').textContent = e.message; }
});

$('#agregar_fuente').addEventListener('click', async () => {
  const nombre = $('#nueva_nombre').value.trim();
  const url    = $('#nueva_url').value.trim();
  if(!nombre || !url){ $('#aviso_fuentes').textContent = 'Falta el nombre o la dirección.'; return; }
  $('#agregar_fuente').disabled = true;
  $('#aviso_fuentes').textContent = 'Comprobando el feed…';
  try{
    const r = await api('api/feeds.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: clave(), tarea: 'agregar', nombre, url }),
    });
    $('#nueva_nombre').value = ''; $('#nueva_url').value = '';
    $('#aviso_fuentes').textContent = `Listo: ${r.noticias} noticias.`;
    await cargarFuentes();
    pintarListaFuentes();
  }catch(e){ $('#aviso_fuentes').textContent = e.message; }
  $('#agregar_fuente').disabled = false;
});

/* ------------------------------------------------------------------ */
/* cargar                                                              */
/* ------------------------------------------------------------------ */

async function cargarFuentes(){
  const { fuentes: lista } = await api('api/feeds.php?tarea=fuentes');
  fuentes = lista || [];
  if(!fuentes.length){ fuenteActiva = null; pintarPestanas(); return; }
  const guardada = Number(localStorage.getItem('feeds_ultima'));
  if(!fuentes.some((f) => f.id === fuenteActiva)){
    fuenteActiva = fuentes.some((f) => f.id === guardada) ? guardada : fuentes[0].id;
  }
  pintarPestanas();
}

async function cargarNoticias(recargar){
  if(!fuenteActiva){
    $('#lista').innerHTML = `<p class="vacio">Todavía no hay ninguna fuente.<br>
      Tocá <b>+ Agregar medio</b> y pegá la dirección de un feed.</p>`;
    $('#cabecera').hidden = true;
    return;
  }
  estado('Trayendo noticias…');
  $('#lista').innerHTML = '<p class="vacio">Trayendo noticias…</p>';
  try{
    const d = await api(`api/feeds.php?fuente=${fuenteActiva}${recargar ? '&recargar=1' : ''}`);
    /* La paleta arranca en la última que se usó: si el medio está publicando
       toda la jornada en fucsia, no tiene sentido volver a elegirla en cada
       noticia. */
    const ultima = Number(localStorage.getItem('feeds_paleta')) || 0;
    noticias = (d.items || []).map((n) => ({
      ...n,
      etiqueta: etiquetaSugerida(n.categorias, n.titulo),
      paleta: ultima < PALETA.length ? ultima : 0,
      deFuente: fuenteActiva,
    }));
    estado(`${noticias.length} noticias de ${d.fuente.nombre}`);
    pintarNoticias();
  }catch(e){
    estado(e.message, true);
    $('#lista').innerHTML = `<p class="vacio">${esc(e.message)}</p>`;
  }
}

$('#recargar').addEventListener('click', () => cargarNoticias(true));

async function arrancar(){
  $('#sub').textContent = `Se publican con el diseño de ${MARCA.nombre}`;
  try{
    await esperarTipografias();
    await cargarFuentes();
    await cargarNoticias();
  }catch(e){ estado(e.message, true); }
}

if(!clave()) pedirClave();
else arrancar();
