/* Editor de placas — corre entero en el navegador.
 *
 * Las placas y las fotos viven en IndexedDB, así que no hay servidor ni
 * base de datos que mantener. El PNG lo genera el mismo renderizador que
 * dibuja la vista previa (placa.js). */

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

const PALETA = [
  { nombre: 'Somos Puerto', fondo: '#ff6100', filete: '#ff9600', original: true },
  { nombre: 'Rojo',     fondo: '#d81f26', filete: '#ff7a2f' },
  { nombre: 'Magenta',  fondo: '#c2185b', filete: '#ff8fb1' },
  { nombre: 'Morado',   fondo: '#5b2d8e', filete: '#b47bff' },
  { nombre: 'Azul',     fondo: '#0b4f9e', filete: '#35a8ff' },
  { nombre: 'Marino',   fondo: '#10243f', filete: '#3fbfd8' },
  { nombre: 'Verde',    fondo: '#0e7a4f', filete: '#35d68a' },
  { nombre: 'Petróleo', fondo: '#134e4a', filete: '#f0b429' },
  { nombre: 'Pizarra',  fondo: '#2f353d', filete: '#ffb020' },
  { nombre: 'Negro',    fondo: '#141414', filete: '#ff6100' },
  { nombre: 'Vino',     fondo: '#6b1226', filete: '#ff9068' },
  { nombre: 'Mostaza',  fondo: '#b26a00', filete: '#ffd166' },
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

const ORIGINAL_DEG = { deg_final: 0.933, deg_curva: 1.5 };

const BASE = {
  nombre: 'Placa nueva',
  titulo: 'Titular de\nla noticia',
  etiqueta: '',
  formato: 'noticia',
  diseno: 'unica',
  foto_izq: 'assets/marcador.jpg', foto_izq_x: 50, foto_izq_y: 50, foto_izq_ajuste: 'completa',
  foto_der: 'assets/marcador.jpg', foto_der_x: 50, foto_der_y: 50, foto_der_ajuste: 'completa',
  foto_cen: 'assets/marcador.jpg', foto_cen_x: 50, foto_cen_y: 50, foto_cen_ajuste: 'completa',
  color_fondo: '#ff6100',
  color_filete: '#ff9600',
  deg_final: 0.933, deg_curva: 1.5,
  circulo_x: 50, circulo_y: 62.6,
  tam_titulo: 143, interlinea: 173,
  laminas: [],            // fotos extra del carrusel; la placa es la primera
  descripcion: '', hashtags: '', colaboradores: '',
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
/* almacén                                                             */
/* ------------------------------------------------------------------ */

const BD = 'placas-somospuerto';
let bd = null;

function abrirBd(){
  return new Promise((listo, falla) => {
    const pedido = indexedDB.open(BD, 1);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if(!db.objectStoreNames.contains('placas'))
        db.createObjectStore('placas', { keyPath: 'id', autoIncrement: true });
      if(!db.objectStoreNames.contains('fotos'))
        db.createObjectStore('fotos', { autoIncrement: true });
    };
    pedido.onsuccess = () => listo(pedido.result);
    pedido.onerror = () => falla(pedido.error);
  });
}

function tx(almacen, modo, fn){
  return new Promise((listo, falla) => {
    const t = bd.transaction(almacen, modo);
    const pedido = fn(t.objectStore(almacen));
    t.oncomplete = () => listo(pedido && pedido.result);
    t.onerror = () => falla(t.error);
  });
}

const listarPlacas = () => tx('placas', 'readonly', (s) => s.getAll());
const leerPlaca = (id) => tx('placas', 'readonly', (s) => s.get(id));
const escribirPlaca = (p) => tx('placas', 'readwrite', (s) => s.put(p));
const borrarPlacaBd = (id) => tx('placas', 'readwrite', (s) => s.delete(id));
const guardarFoto = (blob) => tx('fotos', 'readwrite', (s) => s.add(blob));
const leerFoto = (id) => tx('fotos', 'readonly', (s) => s.get(id));

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

/* Resuelve una referencia de foto ("assets/…" o "idb:12") a una imagen. */
async function cargarImagen(ref){
  if(!ref) return null;
  if(cacheImg.has(ref)) return cacheImg.get(ref);
  let url = ref;
  if(ref.startsWith('idb:')){
    const blob = await leerFoto(Number(ref.slice(4)));
    if(!blob) return null;
    url = URL.createObjectURL(blob);
  }
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
  tira.hidden = !laminas.length;
  $('#compartir').hidden = !navigator.canShare;
  if(!laminas.length){ tira.innerHTML = ''; return; }

  if(tira.children.length !== laminas.length + 1){
    tira.innerHTML = Array.from({ length: laminas.length + 1 }, (_, i) =>
      `<button data-vista="${i}" title="${i ? 'Foto ' + (i + 1) : 'La placa'}">
         <canvas width="128" height="128"></canvas><i>${i + 1}</i>
       </button>`).join('');
  }
  const logo = await cargarImagen('assets/logo.png');
  const botones = [...tira.children];
  botones.forEach((b, i) => b.classList.toggle('activa', i === vista));
  const ctx0 = botones[0].querySelector('canvas').getContext('2d');
  dibujar(ctx0, placa, await imagenesDe(placa), 128);
  for(let i = 0; i < laminas.length; i++){
    const ctx = botones[i + 1].querySelector('canvas').getContext('2d');
    dibujarLamina(ctx, placa, laminas[i], await cargarImagen(laminas[i].foto), logo, 128);
  }
}

/* Genera las láminas como archivos JPEG en memoria. */
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
        <b>Foto ${i + 2} del carrusel</b>
        <button type="button" class="archivo"
                onclick="this.parentNode.querySelector('input').click()">Cambiar…</button>
        <button type="button" class="archivo" data-quitar="${i}">Quitar</button>
        <input type="file" accept="image/*" data-lamina-foto="${i}">
        <div class="ajuste">${AJUSTES.map(([id, n, ayuda]) =>
          `<button data-lamina-ajuste="${i}:${id}" title="${ayuda}">${n}</button>`).join('')}</div>
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

function volcarEtiquetas(){
  $('#v_final').textContent  = Number(placa.deg_final).toFixed(3);
  $('#v_curva').textContent  = Number(placa.deg_curva).toFixed(2);
}

async function volcarControles(){
  document.querySelectorAll('[data-campo]').forEach((el) => {
    const v = placa[el.dataset.campo];
    if(v !== undefined && el.tagName !== 'DIV') el.value = v;
  });
  await pintarFotos();
  await pintarLaminas();
  volcarEtiquetas();
}

async function pintarSelector(){
  const lista = (await listarPlacas()).sort((a, b) => (b.actualizada || '').localeCompare(a.actualizada || ''));
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
  volcarEtiquetas();
  marcarSeleccion();
  clearTimeout(guardando);
  guardando = setTimeout(async () => {
    placa.nombre = nombrar(placa.titulo);
    placa.actualizada = new Date().toISOString().slice(0, 19);
    await escribirPlaca(placa);
    await pintarSelector();
    estado('Guardado ' + new Date().toLocaleTimeString('es-CL'));
  }, 400);
}

async function crear(datos){
  const nueva = { ...datos };
  delete nueva.id;
  nueva.nombre = nombrar(nueva.titulo);
  nueva.actualizada = new Date().toISOString().slice(0, 19);
  const id = await escribirPlaca(nueva);
  return id;
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

document.addEventListener('change', async (ev) => {
  const el = ev.target;

  if(el.dataset.laminaFoto !== undefined && el.files && el.files[0]){
    const i = Number(el.dataset.laminaFoto);
    const id = await guardarFoto(el.files[0]);
    placa.laminas[i] = { foto: 'idb:' + id, ajuste: 'completa', x: 50, y: 50 };
    cambio('laminas', placa.laminas);
    await pintarLaminas();
    el.value = '';
    return estado('Foto del carrusel actualizada');
  }

  if(!el.dataset.foto || !el.files || !el.files[0]) return;
  const archivo = el.files[0];
  estado('Guardando ' + archivo.name + '…');
  try{
    const id = await guardarFoto(archivo);
    const campo = el.dataset.foto;
    placa[campo + '_ajuste'] = 'completa';
    placa[campo + '_x'] = 50;
    placa[campo + '_y'] = 50;
    cambio(campo, 'idb:' + id);
    await pintarFotos();
    estado('Foto actualizada');
  }catch(e){ estado(e.message, true); }
  el.value = '';
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

$('#reset_deg').addEventListener('click', () => {
  Object.entries(ORIGINAL_DEG).forEach(([k, v]) => {
    placa[k] = v;
    const el = document.querySelector(`[data-campo="${k}"]`);
    if(el) el.value = v;
  });
  cambio('deg_curva', ORIGINAL_DEG.deg_curva);
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
  const lista = (await listarPlacas()).sort((a, b) => (b.actualizada || '').localeCompare(a.actualizada || ''));
  const guardada = Number(localStorage.getItem('placa'));
  return lista.find((p) => p.id === guardada) || lista[0] || null;
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
  bd = await abrirBd();
  await esperarTipografias();
  pintarDisenos();
  pintarPaleta();
  pintarChips();
  if(!(await listarPlacas()).length) await crear(EJEMPLO);
  abrirPortada();
})();
