/* Editor de placas.
 *
 * El dibujo y la exportación pasan enteros por el navegador (placa.js), y
 * las placas y las fotos se guardan en MySQL a través de api/, así que son
 * las mismas desde cualquier dispositivo. */

import { dibujar, dibujarLamina, esperarTipografias, LIENZO } from './placa.js';

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

/* Las paletas del medio. El filete es siempre uno de los dos colores de
   marca, así todo queda en familia aunque cambie el fondo. Los fondos se
   eligieron con contraste suficiente para el titular blanco. */
const PALETA = [
  { nombre: 'Fucsia',   fondo: '#ff0054', filete: '#0ae7ae', original: true },
  { nombre: 'Menta',    fondo: '#0ae7ae', filete: '#ff0054' },
  { nombre: 'Rojo',     fondo: '#ee0008', filete: '#0ae7ae' },
  { nombre: 'Naranjo',  fondo: '#ff6100', filete: '#0ae7ae' },
  { nombre: 'Vino',     fondo: '#7a0b32', filete: '#0ae7ae' },
  { nombre: 'Violeta',  fondo: '#6228d7', filete: '#0ae7ae' },
  { nombre: 'Púrpura',  fondo: '#2d0a4e', filete: '#0ae7ae' },
  { nombre: 'Azul',     fondo: '#0b3fd4', filete: '#0ae7ae' },
  { nombre: 'Marino',   fondo: '#0a1f44', filete: '#0ae7ae' },
  { nombre: 'Petróleo', fondo: '#0d4d4d', filete: '#ff0054' },
  { nombre: 'Selva',    fondo: '#0b3d2c', filete: '#ff0054' },
  { nombre: 'Negro',    fondo: '#101014', filete: '#0ae7ae' },
];

const ETIQUETAS = ['Farándula', 'Noticia', 'Contingencia', 'Policial',
                   'Deportes', 'Política', 'Espectáculos', 'Comunidad'];

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
  tam_titulo: 143,
  laminas: [],            // fotos extra del carrusel; la placa es la primera
  descripcion: '', hashtags: '', colaboradores: '', etiquetados: '',
};

const MAX_LAMINAS = 9;   // 9 + la placa = las 10 que permite Instagram

const EJEMPLO = {
  ...BASE,
  nombre: 'Ignacia Michelson',
  titulo: 'Ignacia Michelson\nrecuerda su violenta\nrelación con el cantante\nmexicano Sargento Rap:\n"Me destruyó"',
  foto_izq: 'assets/foto-izquierda.jpg',
  foto_der: 'assets/foto-derecha.jpg',
  foto_cen: 'assets/foto-central.jpg',
};

const URGENTE = {
  ...BASE,
  formato: 'urgente',
  titulo: 'Ahora',
  color_fondo: '#ee0008',
  tam_titulo: 900,
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

const guardarFoto = (archivo) => api('api/fotos.php', { method: 'POST', body: archivo });

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

function estado(texto, esError){
  const el = $('#estado');
  el.textContent = texto;
  el.classList.toggle('error', !!esError);
}

/* Las fotos son rutas del propio sitio ("assets/…" o "fotos/…"). */
async function cargarImagen(ref){
  if(!ref) return null;
  if(cacheImg.has(ref)) return cacheImg.get(ref);
  const url = ref;
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
    cargarImagen(p.foto_cen), cargarImagen('assets/logo.png'),
  ]);
  return { izq, der, cen, logo };
}

/* ------------------------------------------------------------------ */
/* dibujo                                                              */
/* ------------------------------------------------------------------ */

let pendiente = null;

/* Se juntan varios cambios seguidos en un solo dibujo. Con setTimeout y no
   con requestAnimationFrame a propósito: rAF no corre si la pestaña está
   en segundo plano y la vista previa quedaría congelada. */
function repintar(){
  clearTimeout(pendiente);
  pendiente = setTimeout(async () => {
    try{
      const lienzo = $('#previa');
      const ctx = lienzo.getContext('2d');
      const laminas = placa.laminas || [];
      if(vista > laminas.length) vista = 0;
      if(vista === 0){
        dibujar(ctx, placa, await imagenesDe(placa), lienzo.width);
      }else{
        const lam = laminas[vista - 1];
        dibujarLamina(ctx, placa, lam, await cargarImagen(lam.foto),
          await cargarImagen('assets/logo.png'), lienzo.width);
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
  const compartir = $('#compartir');
  if(compartir) compartir.hidden = !navigator.canShare;

  // Se muestra siempre, aunque haya una sola lámina: es la vista del post
  // completo, y escondiéndola no se entendía que el carrusel existe.
  $('#rotulo_tira').textContent = laminas.length
    ? `El carrusel · ${laminas.length + 1} de 10`
    : 'Una sola imagen · agregá fotos o videos para armar un carrusel';

  if(tira.children.length !== laminas.length + 1){
    tira.innerHTML = Array.from({ length: laminas.length + 1 }, (_, i) =>
      `<button data-vista="${i}" title="${i ? 'Lámina ' + (i + 1) : 'La placa'}">
         <canvas width="160" height="160"></canvas><i>${i + 1}</i>
       </button>`).join('');
  }
  const logo = await cargarImagen('assets/logo.png');
  const botones = [...tira.children];
  botones.forEach((b, i) => b.classList.toggle('activa', i === vista));
  const ctx0 = botones[0].querySelector('canvas').getContext('2d');
  dibujar(ctx0, placa, await imagenesDe(placa), 160);
  for(let i = 0; i < laminas.length; i++){
    const ctx = botones[i + 1].querySelector('canvas').getContext('2d');
    dibujarLamina(ctx, placa, laminas[i], await cargarImagen(laminas[i].foto), logo, 160);
  }
}

/* Genera las láminas como archivos JPEG en memoria. */
/* Lo que se manda a publicar: la placa y las imágenes se generan acá, los
   videos ya están en el servidor desde que se subieron. */
async function itemsParaPublicar(){
  const laminas = placa.laminas || [];
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 1080;
  const ctx = lienzo.getContext('2d');
  const logo = await cargarImagen('assets/logo.png');
  const jpeg = () => new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.92));
  const aDataUrl = (blob) => new Promise((r) => {
    const l = new FileReader(); l.onload = () => r(l.result); l.readAsDataURL(blob);
  });

  const items = [];
  dibujar(ctx, placa, await imagenesDe(placa), 1080);
  items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });

  for(const lam of laminas){
    if(lam.tipo === 'video'){
      items.push({ tipo: 'video', ruta: lam.video });
      continue;
    }
    dibujarLamina(ctx, placa, lam, await cargarImagen(lam.foto), logo, 1080);
    items.push({ tipo: 'imagen', dataUrl: await aDataUrl(await jpeg()) });
  }
  return items;
}

async function archivosDelCarrusel(){
  const laminas = placa.laminas || [];
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 1080;
  const ctx = lienzo.getContext('2d');
  const logo = await cargarImagen('assets/logo.png');
  const jpeg = () => new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.92));

  const archivos = [];
  dibujar(ctx, placa, await imagenesDe(placa), 1080);
  archivos.push(new File([await jpeg()], `${baseNombre()}-1.jpg`, { type: 'image/jpeg' }));
  for(let i = 0; i < laminas.length; i++){
    dibujarLamina(ctx, placa, laminas[i], await cargarImagen(laminas[i].foto), logo, 1080);
    archivos.push(new File([await jpeg()], `${baseNombre()}-${i + 2}.jpg`, { type: 'image/jpeg' }));
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
  placa = await leerPlaca(id);
  localStorage.setItem('placa', id);
  document.body.dataset.formato = placa.formato;
  const urgente = placa.formato === 'urgente';
  $('#leg_titular').textContent = urgente ? 'Descripción' : 'Titular';
  $('#lab_titulo').textContent = urgente
    ? 'Lo único editable: se estira sola hasta llenar el ancho'
    : 'Un salto de línea = una línea en la placa';
  await volcarControles();
  await pintarSelector();
  $('#portada').hidden = true;
  repintar();
  estado('');
}

function cambio(campo, valor){
  placa[campo] = valor;
  repintar();
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
  estado('Preparando imágenes…');
  try{
    const archivos = await archivosDelCarrusel();
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
  ev.target.disabled = false;
});

$('#publicar').addEventListener('click', async (ev) => {
  // sin descripción no se publica: un post vacío no se puede editar después
  // sin borrarlo y volver a subirlo
  if(!String(placa.descripcion || '').trim()){
    estado('Falta la descripción: es lo que va debajo de la publicación.', true);
    const campo = $('#descripcion');
    campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campo.focus();
    return;
  }
  const laminas = (placa.laminas || []).length + 1;
  if(!confirm(`Se va a publicar en Instagram un carrusel de ${laminas} imagen${laminas > 1 ? 'es' : ''}. ¿Seguimos?`)) return;
  ev.target.disabled = true;
  estado('Generando imágenes…');
  try{
    const items = await itemsParaPublicar();

    estado('Subiendo a Instagram… puede tardar unos minutos si hay video');
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
    estado('Publicado' + (datos.aviso ? ' — ' + datos.aviso : ''));
    if(datos.enlace) window.open(datos.enlace, '_blank');
  }catch(e){ estado(e.message, true); }
  ev.target.disabled = false;
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
  estado('Generando imágenes…');
  try{
    const n = await exportarCarrusel();
    estado(`Listas ${n} imagen${n > 1 ? 'es' : ''} en JPEG 1080`);
  }catch(e){ estado(e.message, true); }
  ev.target.disabled = false;
});

/* Una foto nueva parte entera y centrada: así no se corta aunque venga con
   otra resolución. */
async function reemplazarFoto(campo, archivo){
  const { ruta } = await guardarFoto(archivo);
  placa[campo + '_ajuste'] = 'completa';
  placa[campo + '_x'] = 50;
  placa[campo + '_y'] = 50;
  cambio(campo, ruta);
  await pintarFotos();
}

async function reemplazarLamina(i, archivo){
  if(esVideo(archivo)) return agregarVideo(archivo, i);
  const { ruta } = await guardarFoto(archivo);
  placa.laminas[i] = { foto: ruta, ajuste: 'completa', x: 50, y: 50 };
  cambio('laminas', placa.laminas);
  await pintarLaminas();
  estado('Foto del carrusel actualizada');
}

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  const archivo = el.files && el.files[0];
  if(!archivo) return;

  try{
    if(el.dataset.laminaFoto !== undefined){
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
const DURACION_MAX = 60;   // lo que acepta Instagram en un carrusel

/* Se reproduce el video, se dibuja cada cuadro dentro de la moldura junto
   con el logo, y se graba la salida. La grabación es en tiempo real: un
   video de 30 segundos tarda 30 segundos. No hay forma de acelerarlo con
   MediaRecorder, y a cambio el resultado sale en MP4/H.264, que es el
   único formato que Instagram acepta. */
async function quemarVideo(archivo, lamina, avisar){
  if(!MediaRecorder.isTypeSupported(TIPO_MP4)){
    throw new Error('Este navegador no puede generar MP4. Probá con Chrome o Safari.');
  }

  const video = document.createElement('video');
  video.src = URL.createObjectURL(archivo);
  video.muted = false;
  video.playsInline = true;
  await new Promise((listo, falla) => {
    video.onloadedmetadata = listo;
    video.onerror = () => falla(new Error('No se pudo leer el video'));
  });
  if(video.duration > DURACION_MAX + 0.5){
    throw new Error(`El video dura ${Math.round(video.duration)}s y el máximo son ${DURACION_MAX}s`);
  }

  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 1080;
  const ctx = lienzo.getContext('2d');
  const logo = await cargarImagen('assets/logo.png');

  const flujo = lienzo.captureStream(30);

  // el audio del video se engancha aparte; sin esto la salida sale muda
  let audio = null;
  try{
    audio = new AudioContext();
    const fuente = audio.createMediaElementSource(video);
    const destino = audio.createMediaStreamDestination();
    fuente.connect(destino);
    destino.stream.getAudioTracks().forEach((t) => flujo.addTrack(t));
  }catch(e){ /* si el video no trae audio, sigue sin él */ }

  const grabador = new MediaRecorder(flujo, {
    mimeType: TIPO_MP4, videoBitsPerSecond: 6_000_000,
  });
  const trozos = [];
  grabador.ondataavailable = (e) => { if(e.data.size) trozos.push(e.data); };

  let dibujando = true;
  const pintar = () => {
    if(!dibujando) return;
    dibujarLamina(ctx, placa, lamina, video, logo, 1080);
    if(video.duration) avisar?.(video.currentTime / video.duration);
    setTimeout(pintar, 33);   // ~30 cuadros por segundo
  };

  const listo = new Promise((r) => { grabador.onstop = r; });
  grabador.start();
  pintar();
  await video.play();
  await new Promise((r) => { video.onended = r; });
  dibujando = false;
  grabador.stop();
  await listo;
  audio?.close();

  // una imagen del primer cuadro, para la vista previa y las miniaturas
  video.currentTime = 0;
  await new Promise((r) => { video.onseeked = r; setTimeout(r, 500); });
  dibujarLamina(ctx, placa, lamina, video, logo, 1080);
  const portada = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.9));

  URL.revokeObjectURL(video.src);
  return { video: new Blob(trozos, { type: 'video/mp4' }), portada };
}

async function agregarVideo(archivo, indice){
  const lamina = { ajuste: 'cubrir', x: 50, y: 50 };
  estado('Procesando el video… tarda lo que dura el video');
  const { video, portada } = await quemarVideo(archivo, lamina, (avance) => {
    estado(`Procesando el video… ${Math.round(avance * 100)}%`);
  });

  estado('Subiendo el video…');
  const subido = await guardarFoto(new File([video], 'lamina.mp4', { type: 'video/mp4' }));
  const conPortada = await guardarFoto(new File([portada], 'portada.jpg', { type: 'image/jpeg' }));

  const nueva = { ...lamina, tipo: 'video', video: subido.ruta, foto: conPortada.ruta };
  if(indice === undefined) placa.laminas = (placa.laminas || []).concat(nueva);
  else placa.laminas[indice] = nueva;
  cambio('laminas', placa.laminas);
  await pintarLaminas();
  estado('Video listo en el carrusel');
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
      await reemplazarFoto(zona.dataset.campo, archivos[0]);
      estado('Foto actualizada');
    }else if(zona.dataset.lamina !== undefined){
      await reemplazarLamina(Number(zona.dataset.lamina), archivos[0]);
    }else{
      // en la zona del carrusel se agregan todas las que entren
      const lugar = MAX_LAMINAS - (placa.laminas || []).length;
      const entran = archivos.slice(0, lugar);
      if(!entran.length) return estado(`El carrusel ya tiene las ${MAX_LAMINAS + 1} imágenes`, true);
      estado(`Subiendo ${entran.length}…`);
      for(const archivo of entran){
        if(esVideo(archivo)){ await agregarVideo(archivo); continue; }
        const { ruta } = await guardarFoto(archivo);
        placa.laminas = (placa.laminas || []).concat({ foto: ruta, ajuste: 'completa', x: 50, y: 50 });
      }
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
    estado('Generando PNG…');
    boton.disabled = true;
    try{
      await exportarPng(Number(boton.dataset.lado));
      estado('Listo, se descargó el PNG');
    }catch(e){ estado(e.message, true); }
    boton.disabled = false;
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
  cargar(await crear(boton.dataset.crear === 'urgente' ? URGENTE : BASE));
});

/* ------------------------------------------------------------------ */
/* arranque                                                            */
/* ------------------------------------------------------------------ */

(async () => {
  await esperarTipografias();
  pintarDisenos();
  pintarPaleta();
  pintarChips();
  if(!clave()) return pantallaClave();
  try{
    if(!(await listarPlacas()).length) await crear(EJEMPLO);
    abrirPortada();
  }catch(e){
    if(!e.esClave) pantallaError(e.message);
  }
})();
