/* Dibuja la placa en un canvas.
 *
 * Es la única fuente de verdad del diseño: la vista previa y el PNG que se
 * descarga salen los dos de acá, así que no hay forma de que se despeguen.
 *
 * Todas las medidas están en las unidades del arte original (lienzo de
 * 3000x3000) y se escalan al lado pedido, igual que hacía --u en CSS.
 */

export const LIENZO = 3000;

export const MEDIDAS = {
  media:    { x: 318, y: 136, ancho: 2364, alto: 1604, radio: 48, filete: 30 },
  circulo:  { cx: 1500, cy: 1140, radio: 512, anillo: 30 },
  pie:      { x: 414, margenDerecho: 318, abajo: 479, separacion: 83 },
  filete:   { ancho: 28, respiro: 11.5 },
  // cinta: forma y colores fijos, es la etiqueta oficial del medio
  etiqueta: { fuente: 74, padY: 22, padX: 96, sesgo: 44, separacion: 38,
              fondo: '#ffffff', texto: '#111111' },
  logo:     { ancho: 592, abajo: 117 },
  urgente:  { arriba: 790, margen: 180, bajada: 190, separacion: 166 },
};

const TIPOS = {
  titular:  '900 {px}px "Inter Tight", Arial, sans-serif',
  etiqueta: '500 {px}px "Inter Tight", Arial, sans-serif',
  urgenteBajada: '700 {px}px "Poppins", Arial, sans-serif',
  urgenteTexto:  '900 {px}px "Poppins", Arial, sans-serif',
};

const fuente = (plantilla, px) => plantilla.replace('{px}', px);

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

export function aRgb(hex){
  let h = String(hex || '').trim().replace('#', '');
  if(h.length === 3) h = h.split('').map((c) => c + c).join('');
  if(!/^[0-9a-f]{6}$/i.test(h)) h = 'ff6100';
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/* Mismo degradado que tenía el CSS: alpha(t) = final * t^curva, con t
   recorriendo desde `inicio`% hasta el borde de abajo del collage. */
export function degradado(ctx, datos, x, y, ancho, alto){
  const [r, g, b] = aRgb(datos.color_fondo);
  const grad = ctx.createLinearGradient(0, y, 0, y + alto);
  const inicio = Number(datos.deg_inicio) / 100;
  const pasos = 12;
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(inicio, `rgba(${r},${g},${b},0)`);
  for(let i = 1; i <= pasos; i++){
    const t = i / pasos;
    const alfa = Number(datos.deg_final) * Math.pow(t, Number(datos.deg_curva));
    grad.addColorStop(inicio + t * (1 - inicio), `rgba(${r},${g},${b},${alfa.toFixed(4)})`);
  }
  return grad;
}

/* Métricas reales de la fuente ya cargada: así no hay constantes mágicas
   que se rompan si cambia la tipografía. */
function metricas(ctx, tipo, px){
  ctx.font = fuente(tipo, px);
  const m = ctx.measureText('Hxg');
  return {
    ascenso: m.fontBoundingBoxAscent,
    descenso: m.fontBoundingBoxDescent,
    mayuscula: ctx.measureText('H').actualBoundingBoxAscent,
  };
}

function anchoDe(ctx, texto, tipo, px, interletrado){
  ctx.font = fuente(tipo, px);
  ctx.letterSpacing = `${interletrado}px`;
  return ctx.measureText(texto).width;
}

/* Corta cada línea del titular por ancho, como hacía el navegador. */
function repartir(ctx, texto, tipo, px, interletrado, maxAncho){
  const salida = [];
  for(const parrafo of String(texto).toUpperCase().split('\n')){
    const palabras = parrafo.split(' ');
    let linea = '';
    for(const palabra of palabras){
      const prueba = linea ? linea + ' ' + palabra : palabra;
      if(linea && anchoDe(ctx, prueba, tipo, px, interletrado) > maxAncho){
        salida.push(linea);
        linea = palabra;
      }else{
        linea = prueba;
      }
    }
    salida.push(linea);
  }
  return salida;
}

/* ------------------------------------------------------------------ */
/* fotos                                                               */
/* ------------------------------------------------------------------ */

/* Dibuja una foto dentro de un hueco.
   "completa": entra entera y lo que sobra se rellena con una copia
   difuminada de la misma foto. "cubrir": llena y recorta. */
function dibujarFoto(ctx, img, x, y, ancho, alto, ajuste, posX, posY, u){
  if(!img) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, ancho, alto);
  ctx.clip();

  const encajar = (escala) => {
    const w = img.width * escala, h = img.height * escala;
    return [x + (ancho - w) * (posX / 100), y + (alto - h) * (posY / 100), w, h];
  };

  if(ajuste === 'completa'){
    // fondo difuminado
    const cubre = Math.max(ancho / img.width, alto / img.height) * 1.18;
    const [fx, fy, fw, fh] = encajar(cubre);
    ctx.filter = `blur(${26 * u}px) brightness(.72) saturate(1.15)`;
    ctx.drawImage(img, fx - (fw - ancho) * .09, fy - (fh - alto) * .09, fw, fh);
    ctx.filter = 'none';
    const entra = Math.min(ancho / img.width, alto / img.height);
    ctx.drawImage(img, ...encajar(entra));
  }else{
    ctx.drawImage(img, ...encajar(Math.max(ancho / img.width, alto / img.height)));
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* etiqueta                                                            */
/* ------------------------------------------------------------------ */

/* La etiqueta del medio: cinta blanca con texto oscuro, siempre igual.
   No es configurable a propósito — es parte de la identidad, como el logo. */
function dibujarEtiqueta(ctx, datos, u, abajoDe){
  const texto = String(datos.etiqueta || '').trim().toUpperCase();
  if(!texto) return abajoDe;

  const E = MEDIDAS.etiqueta;
  const px = E.fuente * u;
  const inter = 0.04 * px;
  const met = metricas(ctx, TIPOS.etiqueta, px);

  const padY = E.padY * u;
  const padX = E.padX * u;
  const sesgo = E.sesgo * u;
  const alto = met.mayuscula + padY * 2;
  const ancho = anchoDe(ctx, texto, TIPOS.etiqueta, px, inter) + padX * 2;
  const x = (MEDIDAS.pie.x + MEDIDAS.pie.separacion) * u;
  const y = abajoDe - alto;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + sesgo, y);
  ctx.lineTo(x + ancho, y);
  ctx.lineTo(x + ancho - sesgo, y + alto);
  ctx.lineTo(x, y + alto);
  ctx.closePath();
  ctx.fillStyle = E.fondo;
  ctx.fill();

  ctx.fillStyle = E.texto;
  ctx.font = fuente(TIPOS.etiqueta, px);
  ctx.letterSpacing = `${inter}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(texto, x + padX, y + padY + met.mayuscula);
  ctx.restore();

  return y - E.separacion * u;
}

/* ------------------------------------------------------------------ */
/* formatos                                                            */
/* ------------------------------------------------------------------ */

function dibujarNoticia(ctx, datos, fotos, u){
  const M = MEDIDAS.media;
  const x = M.x * u, y = M.y * u, ancho = M.ancho * u, alto = M.alto * u;

  // collage
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, M.radio * u);
  ctx.clip();
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(x, y, ancho, alto);

  const unaSola = datos.diseno.startsWith('unica');
  const hueco = unaSola ? ancho : (ancho - M.filete * u) / 2;
  dibujarFoto(ctx, fotos.izq, x, y, hueco, alto,
    datos.foto_izq_ajuste, datos.foto_izq_x, datos.foto_izq_y, u);
  if(!unaSola){
    dibujarFoto(ctx, fotos.der, x + hueco + M.filete * u, y, hueco, alto,
      datos.foto_der_ajuste, datos.foto_der_x, datos.foto_der_y, u);
  }

  // recorte circular
  if(datos.diseno.endsWith('-circulo')){
    const C = MEDIDAS.circulo;
    const cx = C.cx * u, cy = C.cy * u, radio = C.radio * u;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radio - C.anillo * u, 0, Math.PI * 2);
    ctx.clip();
    const lado = (radio - C.anillo * u) * 2;
    dibujarFoto(ctx, fotos.cen, cx - lado / 2, cy - lado / 2, lado, lado,
      datos.foto_cen_ajuste, datos.foto_cen_x, datos.foto_cen_y, u);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, radio - C.anillo * u / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = C.anillo * u;
    ctx.stroke();
  }

  // fundido con el fondo
  ctx.fillStyle = degradado(ctx, datos, x, y, ancho, alto);
  ctx.fillRect(x, y, ancho, alto);
  ctx.restore();

  // titular, anclado por abajo
  const px = Number(datos.tam_titulo) * u;
  const interlinea = Number(datos.interlinea) * u;
  const inter = 0.008 * px;
  const maxAncho = (LIENZO - MEDIDAS.media.x - MEDIDAS.pie.x - MEDIDAS.pie.separacion) * u;
  const lineas = repartir(ctx, datos.titulo, TIPOS.titular, px, inter, maxAncho);
  const met = metricas(ctx, TIPOS.titular, px);

  const respiro = MEDIDAS.filete.respiro * u;
  const abajoCaja = (LIENZO - MEDIDAS.pie.abajo) * u - respiro;
  const arribaTexto = abajoCaja - lineas.length * interlinea;
  const medioInterlineado = (interlinea - (met.ascenso + met.descenso)) / 2;

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.font = fuente(TIPOS.titular, px);
  ctx.letterSpacing = `${inter}px`;
  ctx.textBaseline = 'alphabetic';
  const equis = (MEDIDAS.pie.x + MEDIDAS.pie.separacion) * u + MEDIDAS.filete.ancho * u;
  lineas.forEach((linea, i) => {
    ctx.fillText(linea, equis,
      arribaTexto + i * interlinea + medioInterlineado + met.ascenso);
  });
  ctx.restore();

  // filete: mide exactamente lo mismo que el bloque de texto
  ctx.fillStyle = datos.color_filete;
  ctx.fillRect(MEDIDAS.pie.x * u, arribaTexto - respiro,
    MEDIDAS.filete.ancho * u, lineas.length * interlinea + respiro * 2);

  dibujarEtiqueta(ctx, datos, u, arribaTexto - respiro);
}

function dibujarUrgente(ctx, datos, fotos, u, lado){
  const U = MEDIDAS.urgente;

  // fondo: color de la paleta oscurecido hacia el negro por abajo
  ctx.fillStyle = datos.color_fondo;
  ctx.fillRect(0, 0, lado, lado);
  const sombra = ctx.createLinearGradient(0, 0, 0, lado);
  [[0, .28], [.26, 0], [.44, 0], [.74, .50], [1, .96]]
    .forEach(([p, a]) => sombra.addColorStop(p, `rgba(0,0,0,${a})`));
  ctx.fillStyle = sombra;
  ctx.fillRect(0, 0, lado, lado);

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const centro = lado / 2;

  // "URGENTE", fijo
  const pxBajada = U.bajada * u;
  const metBajada = metricas(ctx, TIPOS.urgenteBajada, pxBajada);
  ctx.font = fuente(TIPOS.urgenteBajada, pxBajada);
  ctx.letterSpacing = `${-0.01 * pxBajada}px`;
  const arribaBajada = U.arriba * u;
  ctx.fillText('URGENTE', centro,
    arribaBajada + (pxBajada - (metBajada.ascenso + metBajada.descenso)) / 2 + metBajada.ascenso);

  // la palabra grande se estira hasta llenar el ancho
  const disponible = lado - U.margen * u * 2;
  const lineas = String(datos.titulo).toUpperCase().split('\n').filter((l) => l.trim());
  let px = Number(datos.tam_titulo) * u;
  const anchoCon = (tam) => Math.max(...lineas.map(
    (l) => anchoDe(ctx, l, TIPOS.urgenteTexto, tam, -0.1 * tam)));
  const medido = anchoCon(px);
  if(medido > disponible) px = px * disponible / medido;

  const met = metricas(ctx, TIPOS.urgenteTexto, px);
  const interlinea = px * .95;
  ctx.font = fuente(TIPOS.urgenteTexto, px);
  ctx.letterSpacing = `${-0.1 * px}px`;
  const arriba = arribaBajada + pxBajada + U.separacion * u;
  lineas.forEach((linea, i) => {
    ctx.fillText(linea, centro,
      arriba + i * interlinea + (interlinea - (met.ascenso + met.descenso)) / 2 + met.ascenso);
  });
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* entrada principal                                                   */
/* ------------------------------------------------------------------ */

export function dibujar(ctx, datos, fotos, lado){
  const u = lado / LIENZO;

  ctx.clearRect(0, 0, lado, lado);
  ctx.fillStyle = datos.color_fondo;
  ctx.fillRect(0, 0, lado, lado);
  ctx.letterSpacing = '0px';

  if(datos.formato === 'urgente') dibujarUrgente(ctx, datos, fotos, u, lado);
  else dibujarNoticia(ctx, datos, fotos, u);

  if(fotos.logo){
    const L = MEDIDAS.logo;
    const ancho = L.ancho * u;
    const alto = ancho * fotos.logo.height / fotos.logo.width;
    ctx.drawImage(fotos.logo, (lado - ancho) / 2, lado - (L.abajo * u) - alto, ancho, alto);
  }
}

/* Las fuentes tienen que estar cargadas antes de medir nada. */
export async function esperarTipografias(){
  if(!document.fonts) return;
  await Promise.all([
    document.fonts.load('900 100px "Inter Tight"'),
    document.fonts.load('500 100px "Inter Tight"'),
    document.fonts.load('700 100px "Poppins"'),
    document.fonts.load('900 100px "Poppins"'),
  ]);
  await document.fonts.ready;
}
