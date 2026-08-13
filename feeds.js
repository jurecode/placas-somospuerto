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
        ${n.foto
          ? `<img class="miniatura" src="${esc(n.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
          : `<div class="miniatura falta" data-sin-foto>buscando la foto…</div>`}
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
  buscarFotosQueFaltan();
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
      const hueco = document.querySelector(`.noticia[data-i="${i}"] [data-sin-foto]`);
      if(!hueco) continue;
      if(foto){
        const img = new Image();
        img.className = 'miniatura'; img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer'; img.alt = '';
        img.src = foto;
        hueco.replaceWith(img);
      }else{
        hueco.textContent = 'sin foto';
      }
    }catch(e){ n.sinFoto = true; }
  }
}

$('#lista').addEventListener('input', (ev) => {
  const art = ev.target.closest('.noticia');
  const campo = ev.target.dataset.campo;
  if(!art || !campo) return;
  noticias[Number(art.dataset.i)][campo] = ev.target.value;
});

$('#lista').addEventListener('click', async (ev) => {
  const art = ev.target.closest('.noticia');
  if(!art) return;
  const n = noticias[Number(art.dataset.i)];
  if(ev.target.closest('[data-publicar]')) return publicarNoticia(n, art);
  if(ev.target.closest('[data-editor]'))   return abrirEnElEditor(n, art);
});

/* ------------------------------------------------------------------ */
/* armar la placa                                                      */
/* ------------------------------------------------------------------ */

function cargarImagen(ruta){
  return new Promise((listo) => {
    if(!ruta) return listo(null);
    const img = new Image();
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
  const p = PALETA[0];
  return {
    nombre: n.titulo.slice(0, 60),
    titulo: repartirTitular(n.titulo),
    etiqueta: n.etiqueta,
    formato: 'noticia',
    diseno: 'unica',
    foto_izq: ruta, foto_izq_x: 50, foto_izq_y: 50, foto_izq_ajuste: 'cubrir',
    foto_der: ruta, foto_der_x: 50, foto_der_y: 50, foto_der_ajuste: 'cubrir',
    foto_cen: ruta, foto_cen_x: 50, foto_cen_y: 50, foto_cen_ajuste: 'cubrir',
    color_fondo: p.fondo, color_filete: p.filete,
    circulo_x: 50, circulo_y: 62.6,
    laminas: [],
    descripcion: n.resumen || n.titulo,
    hashtags: '', colaboradores: '', etiquetados: '',
    ...(MARCA.predeterminados || {}),
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
  if(!n.foto) return liberar(art, 'Esta noticia no tiene foto: abrila en el editor y ponele una.', 'mal');
  if(!String(n.titulo).trim()) return liberar(art, 'Falta el titular.', 'mal');
  const cuantas = CIERRE === false ? 1 : 2;
  if(!confirm(`Se va a publicar en Instagram, ahora mismo, un post de ${cuantas} imagen${cuantas > 1 ? 'es' : ''}:\n\n`
    + `«${n.titulo.slice(0, 120)}»\n\n¿Seguimos?`)) return;

  try{
    ocupar(art, 'Bajando la foto…');
    const ruta = await bajarFoto(n.foto);

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
    const ruta = n.foto ? await bajarFoto(n.foto) : 'assets/marcador.jpg';
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
    noticias = (d.items || []).map((n) => ({
      ...n,
      etiqueta: etiquetaSugerida(n.categorias, n.titulo),
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
