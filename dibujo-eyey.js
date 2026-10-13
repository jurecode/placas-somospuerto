/* El dibujante del segundo medio.
 *
 * Otra pieza gráfica, el mismo sistema: las medidas están en unidades del
 * lienzo original y se escalan al lado pedido, y todo lo que se ve sale de
 * acá, tanto la vista previa como lo que se publica.
 *
 * Las herramientas compartidas —cortar el texto por ancho, medir la fuente
 * ya cargada, encajar una foto, el color que se lee sobre otro— viven en
 * placa.js y se usan igual para los dos medios.
 */

import {
  LIENZO, altoDe, aRgb, metricas, anchoDe, repartir, textoSobre, dibujarFoto, medidaLogo,
  dibujarFranja, VOZ,
} from './placa.js';

/* Los formatos que este medio tiene dibujados con su propia gráfica. El
   editor ofrece estos y no los que diga marca/marca.js, que en un sitio ya
   instalado no se actualiza nunca: si dependiera de ese archivo, un formato
   nuevo no aparecería jamás. */
export const FORMATOS = ['urgente', 'noticia', 'reel', 'voz'];

/* La letra del titular y de la etiqueta es Anton, que es Impact libre: mismas
   proporciones condensadas y disponible en cualquier teléfono. El pie usa
   Poppins en itálica, como el arte original. */
const TIPOS = {
  titular:  '400 {px}px "Anton", Impact, "Arial Narrow", sans-serif',
  etiqueta: '400 {px}px "Anton", Impact, "Arial Narrow", sans-serif',
  pie:      'italic 800 {px}px "Poppins", Arial, sans-serif',
  flechas:  '900 {px}px "Poppins", Arial, sans-serif',
  // el texto de la noticia en la placa urgente: legible y sin competir con el titular
  noticia:  '700 {px}px "Poppins", Arial, sans-serif',
};

const fuente = (plantilla, px) => plantilla.replace('{px}', px);

export const MEDIDAS = {
  margen: 300,                    // aire a los lados, igual que el arte

  // el degradado negro que hace legible el titular sobre cualquier foto
  degradado: { desde: 30, final: 0.96, curva: 1.6 },

  logo:     { arriba: 300, alto: 190, ancho: 700 },
  // quién publicó, en la huincha al lado de las flechas: `aire` la separa
  // de las flechas y del «síguenos». Entra holgada en el alto de la huincha
  firma:    { aire: 50, fuente: 70, padX: 24, padY: 20, dentro: 8 },

  // la etiqueta es un rectángulo recto, arriba a la derecha
  // pegada al borde derecho, como en el arte
  etiqueta: { fuente: 150, padX: 52, padY: 34, arriba: 330, margenDerecho: 70 },

  // interlínea holgada: con Anton, que es muy alta y condensada, un valor
  // apretado deja las líneas pegadas y los recuadros casi tocándose
  titular:  { fuente: 260, interlinea: 1.32, abajo: 235 },

  // el corte entre las dos fotos, y el círculo que va encima
  medio:    { filete: 26 },
  circulo:  { x: 50, y: 44, radio: 520, anillo: 30 },

  // el resaltado: caja de color con otra negra corrida por detrás
  // el resaltado: caja de color con otra negra corrida por detrás.
  // «aire» es lo que se separa del texto vecino, aparte del relleno propio
  marca:    { padX: 54, padY: 30, aire: 46, sombraX: -34, sombraY: -34 },

  // la huincha de abajo, de lado a lado
  huincha:  { alto: 168, fuente: 82, margen: 300, flechas: 88 },

  /* Urgente: «URGENTE» en la etiqueta negra y la palabra enorme. Con la
     noticia escrita, todo se achica a `escala` y la noticia va debajo. El
     conjunto se centra entre el logo y la huincha. */
  urgente:  { etiqueta: 170, separacion: 120, fuente: 1100, escala: .62,
              raya: 260, grosorRaya: 18, antesRaya: 110, despuesRaya: 120,
              noticia: 160, minimo: 96, interlinea: 1.28, aire: 150 },

  /* El reel, en el espacio de 1080 x 1920. A la derecha queda lugar para
     los botones de Instagram, y abajo para el texto que Instagram pone
     encima del video. */
  reel:     { margen: 80, derecha: 170,
              logo: { arriba: 150, alto: 74, ancho: 320 },
              firma: { aire: 22, fuente: 30, padX: 11, padY: 9, dentro: 4 },
              titular: { fuente: 96, interlinea: 1.32, abajo: 430 },
              etiqueta: { fuente: 54, padX: 20, padY: 13, separacion: 60 } },
};

const suave = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
// cuánto entró una pieza que arranca en `desde` y tarda `dura`
const tramo = (avance, desde, dura) => suave((avance - desde) / dura);

const lienzoNuevo = (w, h) => {
  if(typeof document !== 'undefined'){
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
};

/* Negro de arriba hacia abajo. No se configura: es lo que sostiene el
   titular sobre cualquier foto, y sin él el diseño no funciona. */
function degradadoNegro(ctx, alto){
  const D = MEDIDAS.degradado;
  const grad = ctx.createLinearGradient(0, 0, 0, alto);
  const inicio = D.desde / 100;
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(inicio, 'rgba(0,0,0,0)');
  for(let i = 1; i <= 12; i++){
    const t = i / 12;
    grad.addColorStop(inicio + t * (1 - inicio),
      `rgba(0,0,0,${(D.final * Math.pow(t, D.curva)).toFixed(4)})`);
  }
  return grad;
}

/* Dónde cae cada palabra de una línea. Se calcula aparte del dibujo porque
   las cajas de todas las líneas van antes que el texto de todas: si cada
   línea dibujara lo suyo por turno, el recuadro de una tapaba el texto de la
   de arriba. */
function medirLinea(ctx, palabras, x, caja, px, inter){
  const espacio = anchoDe(ctx, ' ', TIPOS.titular, px, inter);
  const posiciones = [];
  const anchos = [];
  let cursor = x;
  for(let i = 0; i < palabras.length; i++){
    if(i > 0){
      // una palabra «pegada» viene del mismo original, partida por el
      // asterisco: va sin espacio o quedaría un hueco en medio
      if(!palabras[i].pegada) cursor += espacio;
      // el aire separa el recuadro de la palabra vecina, salvo cuando el
      // asterisco partió una palabra: ahí abrirla sería peor
      if(palabras[i - 1].marcado !== palabras[i].marcado && !palabras[i].pegada){
        cursor += caja.aire;
      }
    }
    posiciones.push(cursor);
    anchos.push(anchoDe(ctx, palabras[i].t, TIPOS.titular, px, inter));
    cursor += anchos[i];
  }
  return { posiciones, anchos };
}

/* Los recuadros de una línea: el negro corrido y el de color encima. */
function cajasDeLinea(ctx, palabras, medida, baseline, caja, colores){
  const { posiciones, anchos } = medida;
  for(let i = 0; i < palabras.length; i++){
    if(!palabras[i].marcado) continue;
    let fin = i;
    while(fin + 1 < palabras.length && palabras[fin + 1].marcado) fin++;
    const desde = posiciones[i] - caja.padX;
    const hasta = posiciones[fin] + anchos[fin] + caja.padX;
    const arriba = baseline - caja.mayuscula - caja.padY;
    const alto = caja.mayuscula + caja.padY * 2;

    ctx.fillStyle = '#000000';
    ctx.fillRect(desde + caja.sombraX, arriba + caja.sombraY, hasta - desde, alto);
    ctx.fillStyle = colores.fondo;
    ctx.fillRect(desde, arriba, hasta - desde, alto);
    i = fin;
  }
}

/* Y el texto, que va siempre al final para que nada lo tape. */
function textoDeLinea(ctx, palabras, medida, baseline, px, inter, colores){
  ctx.font = fuente(TIPOS.titular, px);
  ctx.letterSpacing = `${inter}px`;
  for(let i = 0; i < palabras.length; i++){
    ctx.fillStyle = palabras[i].marcado ? colores.texto : colores.normal;
    ctx.fillText(palabras[i].t, medida.posiciones[i], baseline);
  }
}

/* La huincha de abajo: banda del color de la paleta, el «síguenos» a la
   izquierda y las flechas a la derecha. Con `firma`, quién publicó va al
   lado de las flechas, como una etiqueta chica de la casa. */
function dibujarHuincha(ctx, datos, marca, u, ancho, altoLienzo, invertida = false, firma = null){
  const H = MEDIDAS.huincha;
  const alto = H.alto * u;
  const y = altoLienzo - alto;
  const paleta = datos.color_fondo || '#ff0000';
  // en el cierre el fondo ya es el color de la paleta: si la huincha fuera
  // del mismo color desaparecería, así que ahí va al revés
  const color = invertida ? textoSobre(paleta) : paleta;
  const tinta = invertida ? paleta : textoSobre(paleta);

  ctx.fillStyle = color;
  ctx.fillRect(0, y, ancho, alto);

  const px = H.fuente * u;
  const met = metricas(ctx, TIPOS.pie, px);
  const linea = y + alto / 2 + met.mayuscula / 2;

  ctx.fillStyle = tinta;
  ctx.font = fuente(TIPOS.pie, px);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';
  const pie = marca.pie || 'SÍGUENOS';
  ctx.fillText(pie, H.margen * u, linea);
  const finPie = H.margen * u + ctx.measureText(pie).width;

  const flechas = '>>>';
  const pxF = H.flechas * u;
  const metF = metricas(ctx, TIPOS.flechas, pxF);
  ctx.font = fuente(TIPOS.flechas, pxF);
  const anchoF = ctx.measureText(flechas).width;
  const xFlechas = ancho - H.margen * u - anchoF;
  ctx.fillText(flechas, xFlechas, y + alto / 2 + metF.mayuscula / 2);

  if(firma?.nombre){
    const F = MEDIDAS.firma;
    // termina justo antes de las flechas y no puede llegar al «síguenos»
    etiquetaDeFirma(ctx, firma, datos, u, xFlechas - F.aire * u, y + alto / 2,
      finPie + F.aire * u, F, 1, 'derecha');
  }
}

/* Quién publicó: una etiqueta chica —negra y redondeada, letra del
   titular—, con la foto en un círculo, «POR» en el color de la paleta y el
   nombre en blanco, centrada en alto en `cy`. Con `lado` 'izquierda' arranca
   en `x` y no pasa de `limite`; con 'derecha' termina en `x` y no baja de
   `limite`. Si no entra, se achica. Las medidas de `F` van en unidades de `u`. */
function etiquetaDeFirma(ctx, firma, datos, u, x, cy, limite, F, alfa = 1, lado = 'izquierda'){
  const nombre = String(firma?.nombre || '').trim().toUpperCase();
  if(!nombre) return;
  const por = 'POR ';
  const medir = (px) => {
    const padX = F.padX * u * px / (F.fuente * u), padY = F.padY * u * px / (F.fuente * u);
    const dentro = F.dentro * u * px / (F.fuente * u);
    const met = metricas(ctx, TIPOS.etiqueta, px);
    const alto = met.mayuscula + padY * 2;
    const d = alto - dentro * 2;
    const anchoPor = anchoDe(ctx, por, TIPOS.etiqueta, px, 0);
    // a la derecha, el aire de la curva: si no, el nombre la toca
    const cierre = Math.max(padX, alto * .42);
    const ancho = dentro + d + padX + anchoPor + anchoDe(ctx, nombre, TIPOS.etiqueta, px, 0) + cierre;
    return { px, padX, padY, dentro, met, alto, d, anchoPor, ancho };
  };
  let m = medir(F.fuente * u);
  const cabe = lado === 'derecha' ? x - limite : limite - x;
  if(m.ancho > cabe) m = medir(m.px * Math.max(.6, cabe / m.ancho));
  if(lado === 'derecha') x -= m.ancho;
  const y = cy - m.alto / 2;

  ctx.save();
  ctx.globalAlpha = alfa;
  // redondeada del todo, como una píldora: acompaña a la foto redonda
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.roundRect(x, y, m.ancho, m.alto, m.alto / 2);
  ctx.fill();
  const fx = x + m.dentro + m.d / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(fx, cy, m.d / 2, 0, Math.PI * 2);
  ctx.clip();
  if(firma.imagen) dibujarFoto(ctx, firma.imagen, fx - m.d / 2, cy - m.d / 2, m.d, m.d, 'cubrir', 50, 30, u);
  else{ ctx.fillStyle = datos.color_filete || '#ff0000'; ctx.fillRect(fx - m.d / 2, cy - m.d / 2, m.d, m.d); }
  ctx.restore();
  ctx.font = fuente(TIPOS.etiqueta, m.px);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';
  const xt = x + m.dentro + m.d + m.padX, base = y + m.padY + m.met.mayuscula;
  ctx.fillStyle = datos.color_filete || '#ff0000';
  ctx.fillText(por, xt, base);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(nombre, xt + m.anchoPor, base);
  ctx.restore();
}

/* Cuánto mide una etiqueta: el rectángulo negro con su texto. */
function medirEtiqueta(ctx, texto, px, padX, padY){
  const met = metricas(ctx, TIPOS.etiqueta, px);
  return { met, alto: met.mayuscula + padY * 2, ancho: anchoDe(ctx, texto, TIPOS.etiqueta, px, 0) + padX * 2 };
}

/* Una etiqueta en (x, y): el rectángulo negro con el texto blanco. */
function etiquetaEn(ctx, texto, px, padX, padY, x, y){
  const m = medirEtiqueta(ctx, texto, px, padX, padY);
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, m.ancho, m.alto);
  ctx.fillStyle = '#ffffff';
  ctx.font = fuente(TIPOS.etiqueta, px);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(texto, x + padX, y + padY + m.met.mayuscula);
  return m;
}

/* La etiqueta de la placa: rectángulo negro arriba a la derecha. */
function dibujarEtiqueta(ctx, datos, u, anchoLienzo){
  const texto = String(datos.etiqueta || '').trim().toUpperCase();
  if(!texto) return anchoLienzo - MEDIDAS.margen * u;
  const E = MEDIDAS.etiqueta;
  const px = E.fuente * u;
  const { ancho } = medirEtiqueta(ctx, texto, px, E.padX * u, E.padY * u);
  const x = anchoLienzo - E.margenDerecho * u - ancho;
  etiquetaEn(ctx, texto, px, E.padX * u, E.padY * u, x, E.arriba * u);
  return x;   // dónde empieza: lo que va a su izquierda no puede pasar de acá
}

/* El logo arriba a la izquierda, del tamaño de la placa. */
function dibujarLogo(ctx, logo, u){
  const L = MEDIDAS.logo;
  const caja = { x: MEDIDAS.margen * u, y: L.arriba * u, ancho: 0, alto: L.alto * u };
  if(!logo) return caja;
  const escala = Math.min(L.alto / logo.height, L.ancho / logo.width) * u;
  caja.ancho = logo.width * escala;
  caja.alto = logo.height * escala;
  ctx.drawImage(logo, caja.x, caja.y, caja.ancho, caja.alto);
  return caja;
}



/* Las fotos a sangre: una, dos mitades, y el círculo si el armado lo lleva.
   Las imágenes llegan con las claves cortas —izq, der, cen— y no con el
   nombre del campo de la placa. */
function dibujarFotos(ctx, datos, fotos, u, ancho, alto){
  /* Los armados son los mismos que el otro medio: una foto o dos, con o sin
     el círculo. Acá no hay recuadro con márgenes como allá —la foto va a
     sangre— así que dos fotos son las dos mitades del cuadro. */
  const dosFotos = String(datos.diseno || 'unica').startsWith('duo');
  const hueco = dosFotos ? (ancho - MEDIDAS.medio.filete * u) / 2 : ancho;
  dibujarFoto(ctx, fotos.izq, 0, 0, hueco, alto,
    datos.foto_izq_ajuste || 'cubrir', datos.foto_izq_x ?? 50, datos.foto_izq_y ?? 50, u);
  if(dosFotos){
    dibujarFoto(ctx, fotos.der, hueco + MEDIDAS.medio.filete * u, 0, hueco, alto,
      datos.foto_der_ajuste || 'cubrir', datos.foto_der_x ?? 50, datos.foto_der_y ?? 50, u);
  }

  /* El círculo recortado, con su anillo blanco. Va antes del degradado, para
     que el fundido lo alcance igual que a las fotos y no quede flotando por
     encima de todo. */
  if(String(datos.diseno || '').endsWith('-circulo')){
    const C = MEDIDAS.circulo;
    const cx = ancho * (datos.circulo_x ?? C.x) / 100;
    const cy = alto * (datos.circulo_y ?? C.y) / 100;
    const radio = C.radio * u;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radio - C.anillo * u, 0, Math.PI * 2);
    ctx.clip();
    const lado = (radio - C.anillo * u) * 2;
    dibujarFoto(ctx, fotos.cen, cx - lado / 2, cy - lado / 2, lado, lado,
      datos.foto_cen_ajuste || 'cubrir', datos.foto_cen_x ?? 50, datos.foto_cen_y ?? 50, u);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, radio - C.anillo * u / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = C.anillo * u;
    ctx.stroke();
  }
}

/* El titular: dónde cae cada línea, con sus recuadros. `k` escala las
   medidas del resaltado, que están en unidades de la placa. El cuerpo es el
   pedido; si el titular es tan largo que pasaría de `tope`, se achica solo
   lo justo para que entre. */
function armarTitular(ctx, datos, k, { izquierda, maxAncho, abajo, tope, px: pxBase, interlinea: rel }){
  let px = pxBase;
  let interlinea, lineas, met, arriba;
  for(let intento = 0; intento < 12; intento++){
    interlinea = px * rel;
    lineas = repartir(ctx, datos.titulo, TIPOS.titular, px, 0, maxAncho);
    met = metricas(ctx, TIPOS.titular, px);
    arriba = abajo - lineas.length * interlinea;
    if(arriba >= tope) break;
    px *= 0.92;
  }
  const medioInterlineado = (interlinea - (met.ascenso + met.descenso)) / 2;
  const M = MEDIDAS.marca;
  const caja = {
    mayuscula: met.mayuscula,
    padX: M.padX * k, padY: M.padY * k, aire: M.aire * k,
    sombraX: M.sombraX * k, sombraY: M.sombraY * k,
  };
  const colores = {
    normal: '#ffffff',
    fondo: datos.color_filete || '#ff0000',
    texto: textoSobre(datos.color_filete || '#ff0000'),
  };
  const bases = lineas.map((_, i) => arriba + i * interlinea + medioInterlineado + met.ascenso);
  const medidas = lineas.map((linea) => medirLinea(ctx, linea, izquierda, caja, px, 0));
  return { lineas, medidas, bases, caja, colores, px, arriba, interlinea };
}

/* Lo pinta en dos pasadas: todas las cajas y recién después todas las
   letras. `entra(i)` —opcional— dice cuánto entró cada línea: { alfa, dy }. */
function pintarTitular(ctx, T, entra = null){
  const cada = (pintar) => T.lineas.forEach((linea, i) => {
    const e = entra ? entra(i) : null;
    if(e && e.alfa <= 0) return;
    ctx.save();
    if(e){ ctx.globalAlpha = e.alfa; ctx.translate(0, e.dy); }
    pintar(linea, i);
    ctx.restore();
  });
  cada((linea, i) => cajasDeLinea(ctx, linea, T.medidas[i], T.bases[i], T.caja, T.colores));
  cada((linea, i) => textoDeLinea(ctx, linea, T.medidas[i], T.bases[i], T.px, 0, T.colores));
}

/* ------------------------------------------------------------------ */
/* la placa                                                            */
/* ------------------------------------------------------------------ */

/* Se pide el ancho y el alto sale solo: la proporción es 4:5, la del feed, y
   es parte del diseño. El canvas tiene que venir de ese tamaño.
   Acá el alto de más no obliga a recolocar nada: la foto va a sangre, el logo
   y la etiqueta cuelgan del borde de arriba y el titular se apoya sobre la
   huincha, que sigue pegada al de abajo. */
export function dibujar(ctx, datos, fotos, ancho, marca = {}){
  const u = ancho / LIENZO;
  const alto = altoDe(ancho);

  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';

  if(datos.formato === 'urgente') return dibujarUrgente(ctx, datos, fotos, u, ancho, alto, marca);

  dibujarFotos(ctx, datos, fotos, u, ancho, alto);
  ctx.fillStyle = degradadoNegro(ctx, alto);
  ctx.fillRect(0, 0, ancho, alto);
  dibujarLogo(ctx, fotos.logo, u);
  dibujarEtiqueta(ctx, datos, u, ancho);

  // el titular, apoyado sobre la huincha; no puede subir más allá de la etiqueta
  pintarTitular(ctx, titularDePlaca(ctx, datos, u, ancho, alto));

  // la huincha, con quién publicó al lado de las flechas
  dibujarHuincha(ctx, datos, marca, u, ancho, alto, false, fotos.firma);
}

/* El titular de la placa, con su cuerpo y su lugar de siempre. `tope` lo
   cambia la placa con voz, que necesita lugar arriba para el ecualizador. */
function titularDePlaca(ctx, datos, u, ancho, alto, tope = null){
  const izquierda = MEDIDAS.margen * u;
  return armarTitular(ctx, datos, u, {
    izquierda, maxAncho: ancho - izquierda * 2,
    abajo: alto - MEDIDAS.huincha.alto * u - MEDIDAS.titular.abajo * u,
    tope: tope ?? (MEDIDAS.etiqueta.arriba + MEDIDAS.etiqueta.fuente + MEDIDAS.etiqueta.padY * 2 + 90) * u,
    px: MEDIDAS.titular.fuente * u, interlinea: MEDIDAS.titular.interlinea,
  });
}

/* ------------------------------------------------------------------ */
/* urgente                                                             */
/* ------------------------------------------------------------------ */

/* Parte un texto en renglones que entren en `disponible`, respetando los
   saltos de línea escritos a mano. */
function enRenglones(ctx, texto, tipo, px, disponible){
  const renglones = [];
  for(const parrafo of String(texto).split('\n')){
    let linea = '';
    for(const palabra of parrafo.split(/\s+/).filter(Boolean)){
      const prueba = linea ? linea + ' ' + palabra : palabra;
      if(linea && anchoDe(ctx, prueba, tipo, px, 0) > disponible){
        renglones.push(linea);
        linea = palabra;
      }else linea = prueba;
    }
    if(linea) renglones.push(linea);
  }
  return renglones;
}

/* La placa urgente: el color de la paleta, «URGENTE» en la etiqueta negra
   de la casa, la palabra enorme en la letra del titular y, si se escribió,
   la noticia debajo. Logo, firma y huincha en su lugar de siempre. */
function dibujarUrgente(ctx, datos, fotos, u, ancho, alto, marca){
  const U = MEDIDAS.urgente;
  const noticia = String(datos.noticia || '').trim();
  const k = noticia ? U.escala : 1;
  const centro = ancho / 2;

  ctx.fillStyle = datos.color_fondo || '#ff0000';
  ctx.fillRect(0, 0, ancho, alto);
  const sombra = ctx.createLinearGradient(0, 0, 0, alto);
  [[0, .30], [.28, 0], [.52, 0], [.82, .45], [1, .80]]
    .forEach(([p, a]) => sombra.addColorStop(p, `rgba(0,0,0,${a})`));
  ctx.fillStyle = sombra;
  ctx.fillRect(0, 0, ancho, alto);

  dibujarLogo(ctx, fotos.logo, u);

  // el espacio libre: entre el logo y la huincha
  const techo = (MEDIDAS.logo.arriba + MEDIDAS.logo.alto + U.aire) * u;
  const piso = alto - (MEDIDAS.huincha.alto + U.aire) * u;
  const disponible = ancho - MEDIDAS.margen * u * 2;

  // «URGENTE»
  const pxE = U.etiqueta * u * k;
  const padX = MEDIDAS.etiqueta.padX * u * k, padY = MEDIDAS.etiqueta.padY * u * k;
  const mE = medirEtiqueta(ctx, 'URGENTE', pxE, padX, padY);
  const separacion = U.separacion * u * k;

  // la palabra enorme, que se estira hasta el ancho (con noticia, una fracción)
  const lineas = String(datos.titulo || '').toUpperCase().split('\n').filter((l) => l.trim());
  let px = U.fuente * u * k;
  const medido = Math.max(0, ...lineas.map((l) => anchoDe(ctx, l, TIPOS.titular, px, 0)));
  if(medido > disponible * (noticia ? .8 : 1)) px *= disponible * (noticia ? .8 : 1) / medido;
  const met = metricas(ctx, TIPOS.titular, px);
  const interlinea = px * 1.02;
  const altoPalabra = lineas.length ? (lineas.length - 1) * interlinea + met.mayuscula : 0;

  // la noticia, achicándose hasta entrar
  let renglones = [], pxN = 0, altoNoticia = 0;
  const extra = noticia ? (U.antesRaya + U.grosorRaya + U.despuesRaya) * u : 0;
  if(noticia){
    const cabe = piso - techo - (mE.alto + separacion + altoPalabra) - extra;
    for(pxN = U.noticia * u; ; pxN *= .94){
      renglones = enRenglones(ctx, noticia, TIPOS.noticia, pxN, disponible);
      altoNoticia = renglones.length * pxN * U.interlinea;
      if(altoNoticia <= cabe || pxN <= U.minimo * u) break;
    }
  }

  // todo el conjunto, centrado en el espacio libre
  const total = mE.alto + separacion + altoPalabra + extra + altoNoticia;
  let y = techo + Math.max(0, (piso - techo - total) / 2);

  etiquetaEn(ctx, 'URGENTE', pxE, padX, padY, centro - mE.ancho / 2, y);
  y += mE.alto + separacion;

  ctx.font = fuente(TIPOS.titular, px);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  lineas.forEach((linea, i) => ctx.fillText(linea, centro, y + met.mayuscula + i * interlinea));
  y += altoPalabra;

  if(noticia){
    y += U.antesRaya * u;
    ctx.fillRect(centro - U.raya * u / 2, y, U.raya * u, U.grosorRaya * u);
    y += (U.grosorRaya + U.despuesRaya) * u;
    const metN = metricas(ctx, TIPOS.noticia, pxN);
    const paso = pxN * U.interlinea;
    ctx.font = fuente(TIPOS.noticia, pxN);
    renglones.forEach((r, i) => {
      ctx.fillText(r, centro, y + i * paso + (paso - (metN.ascenso + metN.descenso)) / 2 + metN.ascenso);
    });
  }
  ctx.textAlign = 'left';

  // sobre el color de la paleta, la huincha va al revés para no desaparecer
  dibujarHuincha(ctx, datos, marca, u, ancho, alto, true, fotos.firma);
}

/* ------------------------------------------------------------------ */
/* el reel                                                             */
/* ------------------------------------------------------------------ */

/* Igual que en el otro medio: con `soloEncima` dibuja solo lo que va sobre
   el video, para que la vista previa lo ponga arriba del video crudo. Cada
   pieza entra por separado según `avance` (de 0 a 1): la etiqueta, las
   líneas del titular una tras otra, y el logo. */
export function dibujarReel(ctx, datos, medio, logo, ancho, alto, avance = 1, soloEncima = false, firma = null){
  const R = MEDIDAS.reel;
  const u = ancho / 1080;           // las medidas del reel
  const k = ancho / LIENZO;         // las que vienen de la placa

  ctx.clearRect(0, 0, ancho, alto);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';
  if(!soloEncima){
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, ancho, alto);
    dibujarFoto(ctx, medio, 0, 0, ancho, alto, 'cubrir',
      datos.reel_x ?? 50, datos.reel_y ?? 50, u, datos.reel_zoom ?? 1);
  }
  ctx.fillStyle = degradadoNegro(ctx, alto);
  ctx.fillRect(0, 0, ancho, alto);

  // arriba: el logo y, a su lado, quién publica (el reel no tiene huincha:
  // abajo lo tapa el texto que pone Instagram)
  const e = tramo(avance, .5, .4);
  let anchoLogo = 0, altoLogo = R.logo.alto * u;
  if(logo){
    const escala = Math.min(R.logo.alto / logo.height, R.logo.ancho / logo.width) * u;
    anchoLogo = logo.width * escala;
    altoLogo = logo.height * escala;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.drawImage(logo, R.margen * u, R.logo.arriba * u - (1 - e) * 20 * u, anchoLogo, altoLogo);
    ctx.restore();
  }
  if(firma?.nombre){
    etiquetaDeFirma(ctx, firma, datos, u, R.margen * u + anchoLogo + R.firma.aire * u,
      R.logo.arriba * u + altoLogo / 2 - (1 - e) * 20 * u, ancho - R.derecha * u, R.firma, e);
  }

  const T = armarTitular(ctx, datos, k * (R.titular.fuente / MEDIDAS.titular.fuente) * (LIENZO / 1080), {
    izquierda: R.margen * u, maxAncho: ancho - (R.margen + R.derecha) * u,
    abajo: alto - R.titular.abajo * u, tope: alto * .42,
    px: R.titular.fuente * u, interlinea: R.titular.interlinea,
  });
  pintarTitular(ctx, T, (i) => {
    const e = tramo(avance, .14 + i * .09, .38);
    return { alfa: e, dy: (1 - e) * 46 * u };
  });

  // la etiqueta, arriba del titular
  const texto = String(datos.etiqueta || '').trim().toUpperCase();
  if(texto){
    const E = R.etiqueta;
    const m = medirEtiqueta(ctx, texto, E.fuente * u, E.padX * u, E.padY * u);
    const e = tramo(avance, 0, .3);
    ctx.save();
    ctx.globalAlpha = e;
    etiquetaEn(ctx, texto, E.fuente * u, E.padX * u, E.padY * u, R.margen * u,
      T.arriba - E.separacion * u - m.alto + (1 - e) * 30 * u);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* la placa con voz                                                    */
/* ------------------------------------------------------------------ */

/* La placa de siempre, con la foto que se acerca despacio, el titular que
   entra y el ecualizador encima del titular, que se mueve con la voz.
   Devuelve lo mismo que la del otro medio: con qué dibujar cada cuadro. */
export function prepararVoz(datos, fotos, ancho, duracion, marca = {}){
  const u = ancho / LIENZO;
  const alto = altoDe(ancho);
  const Z = 1 + VOZ.acercar;
  const E = VOZ.entrada;

  // la foto, ya agrandada una vez: acercarla en cada cuadro es copiarla
  const capaFoto = lienzoNuevo(Math.round(ancho * Z), Math.round(alto * Z));
  dibujarFotos(capaFoto.getContext('2d'), datos, fotos, u * Z, ancho * Z, alto * Z);

  // lo que no se mueve: degradado, logo, etiqueta y la huincha con la firma
  const capaFija = lienzoNuevo(ancho, alto);
  const cf = capaFija.getContext('2d');
  cf.fillStyle = degradadoNegro(cf, alto);
  cf.fillRect(0, 0, ancho, alto);
  dibujarLogo(cf, fotos.logo, u);
  dibujarEtiqueta(cf, datos, u, ancho);
  dibujarHuincha(cf, datos, marca, u, ancho, alto, false, fotos.firma);

  // el titular deja lugar arriba para el ecualizador
  const T = titularDePlaca(cf, datos, u, ancho, alto, VOZ.tituloArriba * u);
  const termina = E.lineas + Math.max(0, T.lineas.length - 1) * E.entreLineas + E.linea;
  const lados = { izquierda: MEDIDAS.margen, derecha: LIENZO - MEDIDAS.margen };

  return {
    alto,
    finEntrada: termina,
    portada: Math.max(0, Math.min(duracion - 0.1, termina + 0.3)),
    cuadro(ctx, t, bandas = null, volumen = 0){
      ctx.save();
      ctx.letterSpacing = '0px';
      ctx.fillStyle = '#0b0b0d';
      ctx.fillRect(0, 0, ancho, alto);
      const a = duracion > 0 ? Math.min(1, Math.max(0, t / duracion)) : 0;
      const s = 1 + VOZ.acercar * a * a * (3 - 2 * a);   // arranca y termina sin tirón
      // se acerca hacia un poco arriba del centro, donde suelen estar las caras
      const cx = ancho / 2, cy = alto * .4;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(capaFoto, cx * (1 - s), cy * (1 - s), ancho * s, alto * s);
      ctx.drawImage(capaFija, 0, 0);
      pintarTitular(ctx, T, t >= termina ? null : (i) => {
        const e = suave((t - E.lineas - i * E.entreLineas) / E.linea);
        return { alfa: e, dy: (1 - e) * E.sube * u };
      });
      const [d0, d1] = E.franja;
      dibujarFranja(ctx, datos, u, T.arriba - T.caja.mayuscula * .2, t, duracion, bandas, volumen,
        suave((t - d0) / (d1 - d0)), lados);
      ctx.restore();
    },
  };
}

/* La lámina del carrusel: la foto con el degradado y la huincha, sin texto. */
export function dibujarLamina(ctx, datos, lamina, foto, logo, ancho, marca = {}){
  const u = ancho / LIENZO;
  const alto = altoDe(ancho);

  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.letterSpacing = '0px';

  dibujarFoto(ctx, foto, 0, 0, ancho, alto,
    lamina.ajuste || 'cubrir', lamina.x ?? 50, lamina.y ?? 50, u, lamina.zoom ?? 1);

  ctx.fillStyle = degradadoNegro(ctx, alto);
  ctx.fillRect(0, 0, ancho, alto);

  if(logo){
    const [anchoLogo, altoLogo] = medidaLogo(logo, u);
    ctx.drawImage(logo, MEDIDAS.margen * u, MEDIDAS.logo.arriba * u, anchoLogo, altoLogo);
  }
  dibujarHuincha(ctx, datos, marca, u, ancho, alto);
}

/* ------------------------------------------------------------------ */
/* la lámina de cierre                                                 */
/* ------------------------------------------------------------------ */

/* El otro medio tiene su cierre dibujado como una imagen aparte. Acá se
   arma con las mismas piezas de la placa —el logo, la letra condensada, la
   huincha— así que cambia solo con la paleta y no hay un archivo que
   mantener aparte. Si algún día llega el arte propio, se pone en marca/ y
   este dibujo se reemplaza sin tocar nada más. */
export function dibujarCierre(ctx, datos, arte, ancho, marca = {}, logo = null){
  const u = ancho / LIENZO;
  const alto = altoDe(ancho);
  const color = datos.color_fondo || '#ff0000';
  const tinta = textoSobre(color);

  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ancho, alto);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';

  // si algún día hay arte propio, manda ese y no se dibuja nada más. Entra
  // entero y centrado: si viniera cuadrado, agrandarlo hasta llenar el 4:5 le
  // comería los márgenes, y lo que sobra arriba y abajo ya es el color de la
  // paleta, así que no se ve ninguna franja.
  if(arte){
    const escala = Math.min(ancho / arte.width, alto / arte.height);
    const w = arte.width * escala, h = arte.height * escala;
    ctx.drawImage(arte, (ancho - w) / 2, (alto - h) / 2, w, h);
    return;
  }

  const centro = ancho / 2;

  // el logo, arriba del texto y pintado del color que se lea sobre el fondo
  if(logo){
    const altoLogo = 420 * u;
    const escala = altoLogo / logo.height;
    const anchoLogo = logo.width * escala;
    const x = centro - anchoLogo / 2;
    const y = alto * 0.30 - altoLogo / 2;

    const tinte = document.createElement('canvas');
    tinte.width = Math.max(1, Math.round(anchoLogo));
    tinte.height = Math.max(1, Math.round(altoLogo));
    const tc = tinte.getContext('2d');
    tc.drawImage(logo, 0, 0, tinte.width, tinte.height);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = tinta;
    tc.fillRect(0, 0, tinte.width, tinte.height);
    ctx.drawImage(tinte, x, y, anchoLogo, altoLogo);
  }

  // «SÍGUENOS Y COMPARTE», con la segunda línea sobre su caja, igual que el
  // resaltado del titular
  const px = 330 * u;
  const met = metricas(ctx, TIPOS.titular, px);
  const interlinea = px * 1.02;
  const base = alto * 0.60;

  ctx.font = fuente(TIPOS.titular, px);
  ctx.fillStyle = tinta;
  const uno = 'SIGUENOS';
  ctx.fillText(uno, centro - ctx.measureText(uno).width / 2, base);

  const dos = 'Y COMPARTE';
  const anchoDos = ctx.measureText(dos).width;
  const M = MEDIDAS.marca;
  const padX = M.padX * u, padY = M.padY * u;
  const x2 = centro - anchoDos / 2;
  const y2 = base + interlinea;
  const arriba = y2 - met.mayuscula - padY;
  const altoCaja = met.mayuscula + padY * 2;

  ctx.fillStyle = tinta === '#ffffff' ? '#000000' : '#ffffff';
  ctx.fillRect(x2 - padX + M.sombraX * u, arriba + M.sombraY * u,
    anchoDos + padX * 2, altoCaja);
  ctx.fillStyle = tinta;
  ctx.fillRect(x2 - padX, arriba, anchoDos + padX * 2, altoCaja);

  ctx.fillStyle = color;
  ctx.font = fuente(TIPOS.titular, px);
  ctx.fillText(dos, x2, y2);

  dibujarHuincha(ctx, datos, marca, u, ancho, alto, true);
}
