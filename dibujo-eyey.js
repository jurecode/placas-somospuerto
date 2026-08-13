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
  LIENZO, aRgb, metricas, anchoDe, repartir, textoSobre, dibujarFoto, medidaLogo,
} from './placa.js';

/* La letra del titular y de la etiqueta es Anton, que es Impact libre: mismas
   proporciones condensadas y disponible en cualquier teléfono. El pie usa
   Poppins en itálica, como el arte original. */
const TIPOS = {
  titular:  '400 {px}px "Anton", Impact, "Arial Narrow", sans-serif',
  etiqueta: '400 {px}px "Anton", Impact, "Arial Narrow", sans-serif',
  pie:      'italic 800 {px}px "Poppins", Arial, sans-serif',
  flechas:  '900 {px}px "Poppins", Arial, sans-serif',
};

const fuente = (plantilla, px) => plantilla.replace('{px}', px);

export const MEDIDAS = {
  margen: 300,                    // aire a los lados, igual que el arte

  // el degradado negro que hace legible el titular sobre cualquier foto
  degradado: { desde: 30, final: 0.96, curva: 1.6 },

  logo:     { arriba: 300, alto: 190, ancho: 700 },

  // la etiqueta es un rectángulo recto, arriba a la derecha
  // pegada al borde derecho, como en el arte
  etiqueta: { fuente: 150, padX: 52, padY: 34, arriba: 330, margenDerecho: 70 },

  titular:  { fuente: 260, interlinea: 1.04, abajo: 175 },

  // el resaltado: caja de color con otra negra corrida por detrás
  marca:    { padX: 40, padY: 26, sombraX: -34, sombraY: -34 },

  // la huincha de abajo, de lado a lado
  huincha:  { alto: 168, fuente: 82, margen: 300, flechas: 88 },
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

/* Una línea del titular: las palabras entre asteriscos van sobre la caja de
   color, con la caja negra corrida por detrás. Igual que en el otro medio,
   primero se calculan todas las posiciones y recién después se dibuja, para
   que la caja y el texto no puedan despegarse. */
function dibujarLinea(ctx, palabras, x, baseline, caja, px, inter, colores){
  const ancho = (p) => anchoDe(ctx, p.t, TIPOS.titular, px, inter);
  const espacio = anchoDe(ctx, ' ', TIPOS.titular, px, inter);

  const posiciones = [];
  const anchos = [];
  let cursor = x;
  for(let i = 0; i < palabras.length; i++){
    if(i > 0 && palabras[i - 1].marcado !== palabras[i].marcado) cursor += caja.padX;
    posiciones.push(cursor);
    anchos.push(ancho(palabras[i]));
    cursor += anchos[i] + espacio;
  }

  // los recuadros: primero el negro corrido, después el de color encima
  for(let i = 0; i < palabras.length; i++){
    if(!palabras[i].marcado) continue;
    let fin = i;
    while(fin + 1 < palabras.length && palabras[fin + 1].marcado) fin++;
    const desde = posiciones[i] - caja.padX;
    const hasta = posiciones[fin] + anchos[fin] + caja.padX;
    const arriba = baseline - caja.mayuscula - caja.padY;
    const altoCaja = caja.mayuscula + caja.padY * 2;

    ctx.fillStyle = '#000000';
    ctx.fillRect(desde + caja.sombraX, arriba + caja.sombraY, hasta - desde, altoCaja);
    ctx.fillStyle = colores.fondo;
    ctx.fillRect(desde, arriba, hasta - desde, altoCaja);
    i = fin;
  }

  ctx.font = fuente(TIPOS.titular, px);
  ctx.letterSpacing = `${inter}px`;
  for(let i = 0; i < palabras.length; i++){
    ctx.fillStyle = palabras[i].marcado ? colores.texto : colores.normal;
    ctx.fillText(palabras[i].t, posiciones[i], baseline);
  }
}

/* La huincha de abajo: banda del color de la paleta, el «síguenos» a la
   izquierda y las flechas a la derecha. */
function dibujarHuincha(ctx, datos, marca, u, lado){
  const H = MEDIDAS.huincha;
  const alto = H.alto * u;
  const y = lado - alto;
  const color = datos.color_fondo || '#ff0000';
  const tinta = textoSobre(color);

  ctx.fillStyle = color;
  ctx.fillRect(0, y, lado, alto);

  const px = H.fuente * u;
  const met = metricas(ctx, TIPOS.pie, px);
  const linea = y + alto / 2 + met.mayuscula / 2;

  ctx.fillStyle = tinta;
  ctx.font = fuente(TIPOS.pie, px);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(marca.pie || 'SÍGUENOS', H.margen * u, linea);

  const flechas = '>>>';
  const pxF = H.flechas * u;
  const metF = metricas(ctx, TIPOS.flechas, pxF);
  ctx.font = fuente(TIPOS.flechas, pxF);
  const anchoF = ctx.measureText(flechas).width;
  ctx.fillText(flechas, lado - H.margen * u - anchoF,
    y + alto / 2 + metF.mayuscula / 2);
}

/* La etiqueta: rectángulo negro arriba a la derecha. */
function dibujarEtiqueta(ctx, datos, u, lado){
  const texto = String(datos.etiqueta || '').trim().toUpperCase();
  if(!texto) return;

  const E = MEDIDAS.etiqueta;
  const px = E.fuente * u;
  const met = metricas(ctx, TIPOS.etiqueta, px);
  const alto = met.mayuscula + E.padY * u * 2;
  const ancho = anchoDe(ctx, texto, TIPOS.etiqueta, px, 0) + E.padX * u * 2;
  const x = lado - E.margenDerecho * u - ancho;
  const y = E.arriba * u;

  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, ancho, alto);

  ctx.fillStyle = '#ffffff';
  ctx.font = fuente(TIPOS.etiqueta, px);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(texto, x + E.padX * u, y + E.padY * u + met.mayuscula);
}

/* ------------------------------------------------------------------ */
/* la placa                                                            */
/* ------------------------------------------------------------------ */

export function dibujar(ctx, datos, fotos, lado, marca = {}){
  const u = lado / LIENZO;

  ctx.clearRect(0, 0, lado, lado);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, lado, lado);
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';

  // la foto llena el cuadro. Las imágenes llegan con las claves cortas
  // —izq, der, cen— y no con el nombre del campo de la placa.
  dibujarFoto(ctx, fotos.izq, 0, 0, lado, lado,
    datos.foto_izq_ajuste || 'cubrir', datos.foto_izq_x ?? 50, datos.foto_izq_y ?? 50, u);

  ctx.fillStyle = degradadoNegro(ctx, lado);
  ctx.fillRect(0, 0, lado, lado);

  // el logo, arriba a la izquierda
  if(fotos.logo){
    const L = MEDIDAS.logo;
    const escala = Math.min(L.alto / fotos.logo.height, L.ancho / fotos.logo.width) * u;
    ctx.drawImage(fotos.logo, MEDIDAS.margen * u, L.arriba * u,
      fotos.logo.width * escala, fotos.logo.height * escala);
  }

  dibujarEtiqueta(ctx, datos, u, lado);

  // el titular, apoyado sobre la huincha
  const izquierda = MEDIDAS.margen * u;
  const maxAncho = lado - izquierda * 2;
  const abajo = lado - MEDIDAS.huincha.alto * u - MEDIDAS.titular.abajo * u;
  const tope = MEDIDAS.etiqueta.arriba * u + 260 * u;   // debajo de la etiqueta

  /* El cuerpo es el del arte y no se toca. Si el titular es tan largo que se
     saldría por arriba, se achica solo lo justo para que entre. */
  let px = MEDIDAS.titular.fuente * u;
  let interlinea, lineas, met, arriba;
  for(let intento = 0; intento < 12; intento++){
    interlinea = px * MEDIDAS.titular.interlinea;
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
    padX: M.padX * u, padY: M.padY * u,
    sombraX: M.sombraX * u, sombraY: M.sombraY * u,
  };
  const colores = {
    normal: '#ffffff',
    fondo: datos.color_filete || '#ff0000',
    texto: textoSobre(datos.color_filete || '#ff0000'),
  };

  lineas.forEach((linea, i) => {
    dibujarLinea(ctx, linea, izquierda,
      arriba + i * interlinea + medioInterlineado + met.ascenso,
      caja, px, 0, colores);
  });

  dibujarHuincha(ctx, datos, marca, u, lado);
}

/* La lámina del carrusel: la foto con el degradado y la huincha, sin texto. */
export function dibujarLamina(ctx, datos, lamina, foto, logo, lado, marca = {}){
  const u = lado / LIENZO;

  ctx.clearRect(0, 0, lado, lado);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, lado, lado);
  ctx.letterSpacing = '0px';

  dibujarFoto(ctx, foto, 0, 0, lado, lado,
    lamina.ajuste || 'cubrir', lamina.x ?? 50, lamina.y ?? 50, u);

  ctx.fillStyle = degradadoNegro(ctx, lado);
  ctx.fillRect(0, 0, lado, lado);

  if(logo){
    const [ancho, alto] = medidaLogo(logo, u);
    ctx.drawImage(logo, MEDIDAS.margen * u, MEDIDAS.logo.arriba * u, ancho, alto);
  }
  dibujarHuincha(ctx, datos, marca, u, lado);
}
