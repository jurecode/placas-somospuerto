/* Dibuja la placa en un canvas.
 *
 * Es la única fuente de verdad del diseño: la vista previa y el PNG que se
 * descarga salen los dos de acá, así que no hay forma de que se despeguen.
 *
 * Todas las medidas están en las unidades del arte original (lienzo de
 * 3000x3000) y se escalan al lado pedido, igual que hacía --u en CSS.
 */

export const LIENZO = 3000;

/* El arte dejó de ser cuadrado: el feed muestra 4:5, que ocupa más pantalla.
   3000 x 3750 es exactamente eso, y sale en 1080 x 1350.
   El alto extra se lo lleva la foto: el titular, la etiqueta y el logo están
   anclados al borde de abajo y no se mueven, así que la placa se sigue viendo
   igual y solo respira más arriba. */
export const ALTO = 3750;
export const altoDe = (ancho) => Math.round(ancho * ALTO / LIENZO);

/* Los colores del medio. Viven acá y no en marca/ porque el actualizador no
   toca esa carpeta: si la paleta estuviera allá, el cambio no le llegaría al
   sitio. El editor usa esta y deja la de marca/ para otro dibujante.
   Una línea más sobria: fondos oscuros, de puerto, y el menta de la marca
   como único acento, así todo queda en familia. En el rojo el acento va
   blanco, que el menta encima chilla. El fucsia de antes sigue al final para
   lo que lo necesite. */
export const PALETA = [
  { nombre: 'Marino',   fondo: '#0b2545', filete: '#0ae7ae', original: true },
  { nombre: 'Océano',   fondo: '#13497a', filete: '#0ae7ae' },
  { nombre: 'Acero',    fondo: '#34495e', filete: '#0ae7ae' },
  { nombre: 'Petróleo', fondo: '#0d4a52', filete: '#0ae7ae' },
  { nombre: 'Bosque',   fondo: '#1b4332', filete: '#0ae7ae' },
  { nombre: 'Grafito',  fondo: '#1c1f24', filete: '#0ae7ae' },
  { nombre: 'Vino',     fondo: '#6d1a36', filete: '#0ae7ae' },
  { nombre: 'Rojo',     fondo: '#c8102e', filete: '#ffffff' },
  { nombre: 'Fucsia',   fondo: '#ff0054', filete: '#0ae7ae' },
];

// con qué colores arranca una placa nueva, y una urgente
export const PREDETERMINADOS = { color_fondo: '#0b2545', color_filete: '#0ae7ae' };
export const COLORES_URGENTE = { color_fondo: '#c8102e', color_filete: '#ffffff' };

export const MEDIDAS = {
  /* El collage va de `y` hasta `abajo` unidades del borde inferior: se estira
     con el lienzo en vez de tener un alto fijo, que es lo que hace que el
     4:5 no obligue a recolocar nada.
     Va a sangre: de borde a borde y desde arriba del todo. Antes era un
     recuadro con márgenes de color alrededor y las esquinas redondeadas, y
     la foto —que es lo que hace que alguien se detenga en el feed— ocupaba
     poco más de la mitad de la placa. Ahora llega más abajo y se funde con
     el color justo donde empieza el titular. */
  media:    { x: 0, y: 0, ancho: 3000, abajo: 880, radio: 0, filete: 30 },
  /* El fundido de la foto con el color de la placa: desde dónde arranca, en
     % del alto de la foto, y con qué opacidad termina. Antes terminaba en
     0,933 porque la foto acababa en el borde de su recuadro; ahora la foto
     sigue de largo hasta el color liso, y si no llegara al 100 % quedaría
     una raya horizontal de lado a lado. */
  /* `curva` es cuánto tarda en tomar color: con 1,5, la del arte original,
     las primeras líneas de un titular largo quedaban blancas sobre la foto
     casi sin color debajo y se perdían en una foto clara. */
  fundido:  { desde: 50, final: 1, curva: 1.15 },
  /* El centro se da en % del collage. Con el titular más grande el círculo
     sube un poco: en el 62,6 del arte original quedaba debajo de las letras,
     y más arriba tapaba las caras de las dos fotos. */
  circulo:  { x: 50, y: 50, radio: 512, anillo: 30 },
  pie:      { x: 414, margenDerecho: 318, abajo: 479, separacion: 83 },
  /* El filete y la cinta crecen con el titular, un poco menos que él: al
     lado de letras un 45 % más grandes, con su medida de antes quedaban como
     de otra pieza. La forma y los colores de la cinta no cambian: es la
     etiqueta oficial del medio. */
  filete:   { ancho: 34, respiro: 14 },
  etiqueta: { fuente: 92, padY: 27, padX: 118, sesgo: 54, separacion: 190,
              fondo: '#ffffff', texto: '#111111' },
  // El logo entra en una caja: manda la altura, para que el aire entre el
  // titular y el pie no cambie si el logo cambia de proporción, pero se
  // acota el ancho por si el lockup es muy apaisado.
  logo:     { alto: 280, ancho: 1560, abajo: 117 },
  /* El cuerpo del titular es parte del diseño y no se toca desde el editor.
     Era 143, la medida del arte original, y en el teléfono se leía chico:
     ahora es un 45 % más grande, para que el titular sea lo primero que se
     ve. `arriba` es hasta dónde puede subir el bloque: un titular muy largo
     se achica solo lo justo para no pasar de ahí, en vez de tapar la cara
     de la foto. */
  titular:  { fuente: 207, arriba: 1900 },
  urgente:  { arriba: 790, margen: 180, bajada: 190, separacion: 166, fuente: 900 },
  /* Urgente con la noticia escrita abajo: «URGENTE / AHORA» se achica a
     `escala` y sube, y debajo va el texto. Todo el conjunto se centra entre
     `techo` (debajo de «Publicado por») y el logo, dejando `aireLogo`.
     El texto se achica solo hasta `minimo` si es largo. */
  urgenteNoticia: { escala: .6, techo: 470, aireLogo: 230, raya: 230, grosorRaya: 16,
                    antesRaya: 120, despuesRaya: 130, fuente: 178, minimo: 104,
                    interlinea: 1.2, margen: 230 },
};

/* La interlínea acompaña al tamaño de letra en la misma proporción que el
   arte original (173/143), así no hay que ajustarla a mano. */
export const PROPORCION_INTERLINEA = 173 / 143;

export const TIPOS = {
  titular:  '900 {px}px "Inter Tight", Arial, sans-serif',
  etiqueta: '500 {px}px "Inter Tight", Arial, sans-serif',
  urgenteBajada: '700 {px}px "Poppins", Arial, sans-serif',
  urgenteTexto:  '900 {px}px "Poppins", Arial, sans-serif',
  urgenteNoticia: '700 {px}px "Inter Tight", Arial, sans-serif',
};

export const fuente = (plantilla, px) => plantilla.replace('{px}', px);

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

export function aRgb(hex){
  let h = String(hex || '').trim().replace('#', '');
  if(h.length === 3) h = h.split('').map((c) => c + c).join('');
  if(!/^[0-9a-f]{6}$/i.test(h)) h = 'ff6100';
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/* alpha(t) = DEG_FINAL * t^DEG_CURVA, con t recorriendo desde `desde`%
   hasta el borde de abajo.
   El fundido es fijo: forma parte de la identidad, no se configura por placa.
   La curva sale de medir el anillo blanco del círculo en el arte original. */
export const DEG_INICIO = 68;    // dónde arranca, en % del alto
export const DEG_FINAL  = 0.933; // opacidad en el borde de abajo
export const DEG_CURVA  = 1.5;   // exponente: arranca suave y se acelera

export function degradado(ctx, datos, x, y, ancho, alto, desde = DEG_INICIO, final = DEG_FINAL, curva = DEG_CURVA){
  const [r, g, b] = aRgb(datos.color_fondo);
  const grad = ctx.createLinearGradient(0, y, 0, y + alto);
  const inicio = desde / 100;
  const pasos = 12;
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(inicio, `rgba(${r},${g},${b},0)`);
  for(let i = 1; i <= pasos; i++){
    const t = i / pasos;
    const alfa = final * Math.pow(t, curva);
    grad.addColorStop(inicio + t * (1 - inicio), `rgba(${r},${g},${b},${alfa.toFixed(4)})`);
  }
  return grad;
}

/* Métricas reales de la fuente ya cargada: así no hay constantes mágicas
   que se rompan si cambia la tipografía. */
export function metricas(ctx, tipo, px){
  ctx.font = fuente(tipo, px);
  const m = ctx.measureText('Hxg');
  return {
    ascenso: m.fontBoundingBoxAscent,
    descenso: m.fontBoundingBoxDescent,
    mayuscula: ctx.measureText('H').actualBoundingBoxAscent,
  };
}

export function anchoDe(ctx, texto, tipo, px, interletrado){
  ctx.font = fuente(tipo, px);
  ctx.letterSpacing = `${interletrado}px`;
  return ctx.measureText(texto).width;
}

/* Las palabras entre asteriscos van resaltadas con un recuadro detrás.
   Se devuelve cada palabra con su marca para poder dibujarlas distinto. */
export function enPalabras(parrafo){
  const palabras = [];
  let marcado = false;
  for(const trozo of parrafo.split('*')){
    for(const p of trozo.split(' ')){
      if(p !== '') palabras.push({ t: p, marcado });
    }
    marcado = !marcado;   // cada asterisco abre o cierra
  }
  return palabras;
}

/* Corta cada línea del titular por ancho, como hacía el navegador.
   Mide el texto pelado, sin contar lo que ensanchan los recuadros del
   resaltado. Probé descontarlos y no conviene: el desborde real son 3 px y
   solo con cuatro o más tramos marcados —invisible—, mientras que reservar
   ese lugar hace cortar las líneas bastante antes del margen, que se nota
   mucho más y es peor. */
export function repartir(ctx, texto, tipo, px, interletrado, maxAncho){
  const lineas = [];
  for(const parrafo of String(texto).toUpperCase().split('\n')){
    let linea = [];
    for(const palabra of enPalabras(parrafo)){
      const prueba = [...linea, palabra].map((p) => p.t).join(' ');
      if(linea.length && anchoDe(ctx, prueba, tipo, px, interletrado) > maxAncho){
        lineas.push(linea);
        linea = [palabra];
      }else{
        linea.push(palabra);
      }
    }
    lineas.push(linea);
  }
  return lineas;
}

/* Blanco o casi negro según lo que se lea mejor sobre ese color. */
export function textoSobre(hex){
  const canal = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = aRgb(hex);
  const lum = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  return lum > 0.4 ? '#111111' : '#ffffff';
}

/* Dibuja una línea, con recuadro detrás de las palabras marcadas. Las
   marcadas seguidas comparten un solo recuadro, para que una frase entera
   no quede como una fila de bloques sueltos.
   Las posiciones se calculan una sola vez y recién después se dibuja: si el
   recuadro y el texto avanzaran cada uno por su cuenta, se despegarían. */
export function dibujarLinea(ctx, palabras, x, baseline, caja, tipo, px, inter, colores){
  const interMarcado = inter + caja.interExtra;
  const anchoDePalabra = (p) => anchoDe(ctx, p.t, tipo, px, p.marcado ? interMarcado : inter);
  const espacio = anchoDe(ctx, ' ', tipo, px, inter);

  const posiciones = [];
  const anchos = [];
  let cursor = x;
  for(let i = 0; i < palabras.length; i++){
    // aire extra donde el resaltado empieza o termina, para que el recuadro
    // no quede pegado a la palabra de al lado
    if(i > 0 && palabras[i - 1].marcado !== palabras[i].marcado) cursor += caja.aire;
    posiciones.push(cursor);
    anchos.push(anchoDePalabra(palabras[i]));
    cursor += anchos[i] + espacio;
  }

  // los recuadros primero, para que el texto quede encima
  ctx.fillStyle = colores.fondo;
  for(let i = 0; i < palabras.length; i++){
    if(!palabras[i].marcado) continue;
    let fin = i;
    while(fin + 1 < palabras.length && palabras[fin + 1].marcado) fin++;
    const desde = posiciones[i] - caja.padX;
    const hasta = posiciones[fin] + anchos[fin] + caja.padX;
    ctx.fillRect(desde, baseline - caja.mayuscula - caja.padY,
                 hasta - desde, caja.mayuscula + caja.padY * 2);
    i = fin;
  }

  ctx.font = fuente(tipo, px);
  for(let i = 0; i < palabras.length; i++){
    ctx.letterSpacing = `${palabras[i].marcado ? interMarcado : inter}px`;
    ctx.fillStyle = palabras[i].marcado ? colores.texto : colores.normal;
    ctx.fillText(palabras[i].t, posiciones[i], baseline);
  }
}

/* ------------------------------------------------------------------ */
/* fotos                                                               */
/* ------------------------------------------------------------------ */

/* Dibuja una foto dentro de un hueco.
   "completa": entra entera y lo que sobra se rellena con una copia
   difuminada de la misma foto. "cubrir": llena y recorta. */
/* `zoom` acerca: 1 es el encaje de siempre, 2 el doble de cerca. Con
   `posX`/`posY` se elige qué parte queda a la vista. */
export function dibujarFoto(ctx, medio, x, y, ancho, alto, ajuste, posX, posY, u, zoom = 1){
  if(!medio) return;
  /* Sirve para tres cosas distintas que miden su tamaño de tres maneras: una
     imagen usa width, un <video> usa videoWidth, y un cuadro suelto salido
     del decodificador usa displayWidth. Sin la tercera, el cuadro se
     descartaba en silencio y el video salía negro. */
  const anchoOrig = medio.displayWidth || medio.videoWidth || medio.width;
  const altoOrig  = medio.displayHeight || medio.videoHeight || medio.height;
  if(!anchoOrig || !altoOrig) return;

  ctx.save();
  /* Casi todos los videos entran más chicos que el lienzo y hay que
     agrandarlos —un 720 de ancho a 1080 es un 50% más—. Por omisión el canvas
     usa el filtro más barato; pedirle el bueno cuesta nada y mide 1,2 dB
     mejor en el ida y vuelta. Se nota justo en lo que se estaba viendo mal. */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.beginPath();
  ctx.rect(x, y, ancho, alto);
  ctx.clip();

  const encajar = (escala) => {
    const w = anchoOrig * escala, h = altoOrig * escala;
    return [x + (ancho - w) * (posX / 100), y + (alto - h) * (posY / 100), w, h];
  };

  if(ajuste === 'completa'){
    // fondo difuminado
    const cubre = Math.max(ancho / anchoOrig, alto / altoOrig) * 1.18;
    const [fx, fy, fw, fh] = encajar(cubre);
    ctx.filter = `blur(${26 * u}px) brightness(.72) saturate(1.15)`;
    ctx.drawImage(medio, fx - (fw - ancho) * .09, fy - (fh - alto) * .09, fw, fh);
    ctx.filter = 'none';
    const entra = Math.min(ancho / anchoOrig, alto / altoOrig) * zoom;
    ctx.drawImage(medio, ...encajar(entra));
  }else{
    ctx.drawImage(medio, ...encajar(Math.max(ancho / anchoOrig, alto / altoOrig) * zoom));
  }
  ctx.restore();
}

/* El logo se escala por altura y, si el resultado se pasa de ancho, se
   acota por ancho. Así entra cualquier proporción sin desbordar. */
export function medidaLogo(logo, u){
  const L = MEDIDAS.logo;
  const escala = Math.min(L.alto / logo.height, L.ancho / logo.width);
  return [logo.width * escala * u, logo.height * escala * u];
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
/* firma de quien publica                                              */
/* ------------------------------------------------------------------ */

/* Quién publicó la pieza: su foto en un círculo con un borde blanco fino,
   y al lado «Publicado por» y su nombre. Va sobre una píldora oscura y
   translúcida —la misma de la franja de la voz— para que se lea sobre
   cualquier foto, y arriba a la izquierda: abajo ya están el titular, la
   etiqueta y el logo, y arriba hay aire. En unidades del arte de 3000. */
export const FIRMA = {
  x: 110, y: 110,
  /* En el feed la placa se ve a un tercio de su tamaño: con «Publicado
     por» más chico que esto, en el teléfono no se llega a leer. */
  foto: 204, borde: 9,          // el círculo y su borde blanco
  relleno: 18,                  // entre el círculo y el borde de la píldora
  aire: 40,                     // entre el círculo y el texto
  rotulo: 52, nombre: 90,       // los dos renglones
  entre: 18,                    // entre un renglón y el otro
  derecha: 66,                  // después del texto, hasta el final de la píldora
  maxTexto: 1500,               // un nombre muy largo se achica hasta acá
};

/* `firma` es { nombre, imagen }: sin imagen van las iniciales sobre el
   color del filete. `k` es la escala (ancho del lienzo / 3000) y `x`,`y`
   la esquina, en píxeles. */
export function dibujarFirma(ctx, firma, k, x, y, color = '#0ae7ae'){
  const nombre = String(firma?.nombre || '').trim();
  if(!nombre) return;
  const F = FIRMA;
  const rotulo = 'PUBLICADO POR';
  const pxR = F.rotulo * k;
  const interR = 0.14 * pxR;
  let pxN = F.nombre * k;
  // un nombre muy largo se achica en vez de estirar la píldora sobre la placa
  const anchoN = anchoDe(ctx, nombre, TIPOS.titular, pxN, 0);
  if(anchoN > F.maxTexto * k) pxN *= F.maxTexto * k / anchoN;

  const d = F.foto * k;
  const alto = d + F.relleno * 2 * k;
  const cx = x + F.relleno * k + d / 2;
  const cy = y + alto / 2;
  const x0 = cx + d / 2 + F.aire * k;
  const anchoTexto = Math.max(anchoDe(ctx, rotulo, TIPOS.etiqueta, pxR, interR),
                              anchoDe(ctx, nombre, TIPOS.titular, pxN, 0));
  const ancho = x0 - x + anchoTexto + F.derecha * k;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, alto / 2);
  ctx.fillStyle = 'rgba(12,10,16,0.46)';
  ctx.fill();

  // la foto, recortada en círculo; sin foto, las iniciales
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.clip();
  if(firma.imagen){
    dibujarFoto(ctx, firma.imagen, cx - d / 2, cy - d / 2, d, d, 'cubrir', 50, 30, k);
  }else{
    ctx.fillStyle = color;
    ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
    const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2)
      .map((p) => p[0].toUpperCase()).join('');
    const pxI = d * 0.4;
    ctx.font = fuente(TIPOS.titular, pxI);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = textoSobre(color);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(iniciales, cx, cy + metricas(ctx, TIPOS.titular, pxI).mayuscula / 2);
  }
  ctx.restore();
  // el borde blanco fino, que la despega de la píldora
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2 - F.borde * k / 2, 0, Math.PI * 2);
  ctx.lineWidth = F.borde * k;
  ctx.strokeStyle = '#fff';
  ctx.stroke();

  // los dos renglones, centrados en alto con el círculo
  const capR = metricas(ctx, TIPOS.etiqueta, pxR).mayuscula;
  const capN = metricas(ctx, TIPOS.titular, pxN).mayuscula;
  const arriba = cy - (capR + F.entre * k + capN) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = fuente(TIPOS.etiqueta, pxR);
  ctx.letterSpacing = `${interR}px`;
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(rotulo, x0, arriba + capR);
  ctx.font = fuente(TIPOS.titular, pxN);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#fff';
  ctx.fillText(nombre, x0, arriba + capR + F.entre * k + capN);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* formatos                                                            */
/* ------------------------------------------------------------------ */

/* El recuadro de la foto, en píxeles. */
function cajaFoto(u, altoLienzo){
  const M = MEDIDAS.media;
  const x = M.x * u, y = M.y * u, ancho = M.ancho * u;
  /* El borde de abajo, en un píxel entero. A 1080 de ancho caía en 1033,2:
     la fila de ese borde quedaba tapada a medias dos veces —por la foto y
     por el fundido—, y se veía una raya oscura de un píxel de lado a lado,
     también en lo publicado. */
  return { x, y, ancho, alto: Math.round(altoLienzo - y - M.abajo * u), radio: M.radio * u };
}

/* La foto de la placa —el collage y el círculo—, sin el fundido ni nada
   encima. Va separada del texto para que la placa con voz pueda moverla
   sola, debajo de un texto quieto. */
function fotoNoticia(ctx, datos, fotos, u, altoLienzo){
  const M = MEDIDAS.media;
  const { x, y, ancho, alto, radio } = cajaFoto(u, altoLienzo);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, radio);
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
    const cx = x + ancho * (datos.circulo_x ?? C.x) / 100;
    const cy = y + alto * (datos.circulo_y ?? C.y) / 100;
    const radioC = C.radio * u;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radioC - C.anillo * u, 0, Math.PI * 2);
    ctx.clip();
    const lado = (radioC - C.anillo * u) * 2;
    dibujarFoto(ctx, fotos.cen, cx - lado / 2, cy - lado / 2, lado, lado,
      datos.foto_cen_ajuste, datos.foto_cen_x, datos.foto_cen_y, u);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, radioC - C.anillo * u / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = C.anillo * u;
    ctx.stroke();
  }
  ctx.restore();
}

/* El fundido de la foto con el color de la placa. */
function fundidoNoticia(ctx, datos, u, altoLienzo){
  const { x, y, ancho, alto, radio } = cajaFoto(u, altoLienzo);
  const F = MEDIDAS.fundido;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, radio);
  ctx.clip();
  ctx.fillStyle = degradado(ctx, datos, x, y, ancho, alto, F.desde, F.final, F.curva);
  ctx.fillRect(x, y, ancho, alto);
  ctx.restore();
}

/* El titular, el filete y la etiqueta, anclados por abajo.
   `tope` es hasta dónde puede subir el bloque, en unidades del arte: la
   placa con voz lo baja para dejar lugar a su franja.
   `anim`, si viene, mueve cada pieza en la entrada animada:
   { linea(i) → {dy, alfa}, etiqueta: {dy, alfa}, filete: 0..1 }.
   Devuelve dónde quedó todo, para poder poner algo encima. */
function textoNoticia(ctx, datos, u, altoLienzo, tope = MEDIDAS.titular.arriba, anim = null){
  // El margen derecho es el del pie: antes se tomaba del recuadro de la
  // foto, que ya no tiene márgenes.
  const maxAncho = (LIENZO - MEDIDAS.pie.margenDerecho - MEDIDAS.pie.x - MEDIDAS.pie.separacion) * u;
  const respiro = MEDIDAS.filete.respiro * u;
  const abajoCaja = altoLienzo - MEDIDAS.pie.abajo * u - respiro;
  const topePx = tope * u;

  /* Se prueba con el cuerpo del arte y, si el bloque se saldría por arriba,
     se baja de a poco hasta que entre. Sin esto un titular muy largo se corta
     contra el borde y no hay forma de darse cuenta hasta verlo publicado. */
  let px = MEDIDAS.titular.fuente * u;
  let interlinea, inter, lineas, met, arribaTexto;
  for(let intento = 0; intento < 12; intento++){
    interlinea = px * PROPORCION_INTERLINEA;
    inter = 0.008 * px;
    lineas = repartir(ctx, datos.titulo, TIPOS.titular, px, inter, maxAncho);
    met = metricas(ctx, TIPOS.titular, px);
    arribaTexto = abajoCaja - lineas.length * interlinea;
    if(arribaTexto >= topePx) break;
    px *= 0.92;
  }
  const medioInterlineado = (interlinea - (met.ascenso + met.descenso)) / 2;

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  const equis = (MEDIDAS.pie.x + MEDIDAS.pie.separacion) * u + MEDIDAS.filete.ancho * u;
  // el resaltado usa el color del filete, que es el opuesto de la paleta
  const colores = {
    normal: '#fff',
    fondo: datos.color_filete,
    texto: textoSobre(datos.color_filete),
  };
  const caja = {
    mayuscula: met.mayuscula,
    padX: 26 * u, padY: 16 * u,
    aire: 30 * u,               // separación entre el recuadro y lo de al lado
    interExtra: 0.022 * px,     // las destacadas van con las letras más sueltas
  };
  lineas.forEach((linea, i) => {
    const mov = anim ? anim.linea(i) : null;
    if(mov && mov.alfa <= 0) return;
    if(mov){ ctx.save(); ctx.globalAlpha = mov.alfa; ctx.translate(0, mov.dy * u); }
    dibujarLinea(ctx, linea, equis,
      arribaTexto + i * interlinea + medioInterlineado + met.ascenso,
      caja, TIPOS.titular, px, inter, colores);
    if(mov) ctx.restore();
  });
  ctx.restore();

  // filete: mide exactamente lo mismo que el bloque de texto; en la entrada
  // crece de arriba hacia abajo
  const largoFilete = lineas.length * interlinea + respiro * 2;
  ctx.fillStyle = datos.color_filete;
  ctx.fillRect(MEDIDAS.pie.x * u, arribaTexto - respiro,
    MEDIDAS.filete.ancho * u, largoFilete * (anim ? anim.filete : 1));

  let arribaEtiqueta;
  if(anim){
    ctx.save();
    ctx.globalAlpha = anim.etiqueta.alfa;
    ctx.translate(0, anim.etiqueta.dy * u);
    arribaEtiqueta = dibujarEtiqueta(ctx, datos, u, arribaTexto - respiro);
    ctx.restore();
  }else{
    arribaEtiqueta = dibujarEtiqueta(ctx, datos, u, arribaTexto - respiro);
  }
  return { arribaTexto, arribaEtiqueta, lineas: lineas.length };
}

function dibujarNoticia(ctx, datos, fotos, u, altoLienzo){
  fotoNoticia(ctx, datos, fotos, u, altoLienzo);
  fundidoNoticia(ctx, datos, u, altoLienzo);
  return textoNoticia(ctx, datos, u, altoLienzo);
}

/* Parte un texto en renglones que entren en `disponible`. Respeta los
   saltos de línea que se escribieron a mano. */
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

function dibujarUrgente(ctx, datos, fotos, u, ancho, alto){
  const U = MEDIDAS.urgente;
  const N = MEDIDAS.urgenteNoticia;
  const noticia = String(datos.noticia || '').trim();

  // fondo: color de la paleta oscurecido hacia el negro por abajo
  ctx.fillStyle = datos.color_fondo;
  ctx.fillRect(0, 0, ancho, alto);
  const sombra = ctx.createLinearGradient(0, 0, 0, alto);
  [[0, .28], [.26, 0], [.44, 0], [.74, .50], [1, .96]]
    .forEach(([p, a]) => sombra.addColorStop(p, `rgba(0,0,0,${a})`));
  ctx.fillStyle = sombra;
  ctx.fillRect(0, 0, ancho, alto);

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const centro = ancho / 2;

  /* Con noticia, «URGENTE / AHORA» va más chico y arriba; sin ella, como
     siempre: grande y al medio. */
  const k = noticia ? N.escala : 1;
  const pxBajada = U.bajada * u * k;
  const metBajada = metricas(ctx, TIPOS.urgenteBajada, pxBajada);

  // la palabra grande se estira hasta llenar el ancho (con noticia, una fracción)
  const disponible = (ancho - U.margen * u * 2) * k;
  const lineas = String(datos.titulo).toUpperCase().split('\n').filter((l) => l.trim());
  let px = U.fuente * u * k;
  const anchoCon = (tam) => Math.max(...lineas.map(
    (l) => anchoDe(ctx, l, TIPOS.urgenteTexto, tam, -0.1 * tam)));
  const medido = anchoCon(px);
  if(medido > disponible) px = px * disponible / medido;
  const met = metricas(ctx, TIPOS.urgenteTexto, px);
  const interlinea = px * .95;
  const separacion = U.separacion * u * k;
  const altoBloque = pxBajada + separacion + lineas.length * interlinea;

  /* La noticia: renglones que entren en el ancho, achicando la letra si no
     caben entre el bloque de arriba y el logo. */
  let renglones = [], pxNoticia = 0, altoNoticia = 0;
  const abajoLibre = alto - (MEDIDAS.logo.abajo + MEDIDAS.logo.alto + N.aireLogo) * u;
  const extra = (N.antesRaya + N.grosorRaya + N.despuesRaya) * u;
  if(noticia){
    const anchoNoticia = ancho - N.margen * u * 2;
    const cabe = abajoLibre - N.techo * u - altoBloque - extra;
    for(pxNoticia = N.fuente * u; ; pxNoticia *= .94){
      renglones = enRenglones(ctx, noticia, TIPOS.urgenteNoticia, pxNoticia, anchoNoticia);
      altoNoticia = renglones.length * pxNoticia * N.interlinea;
      if(altoNoticia <= cabe || pxNoticia <= N.minimo * u) break;
    }
  }

  // acá no hay foto que estire: sin noticia, el bloque baja la mitad del
  // alto que ganó el lienzo, y así queda a la misma altura del centro que en
  // cuadrado; con noticia, el conjunto se centra en el espacio libre
  const arribaBajada = noticia
    ? N.techo * u + Math.max(0, (abajoLibre - N.techo * u - (altoBloque + extra + altoNoticia)) / 2)
    : U.arriba * u + (alto - ancho) / 2;

  // "URGENTE", fijo
  ctx.font = fuente(TIPOS.urgenteBajada, pxBajada);
  ctx.letterSpacing = `${-0.01 * pxBajada}px`;
  ctx.fillText('URGENTE', centro,
    arribaBajada + (pxBajada - (metBajada.ascenso + metBajada.descenso)) / 2 + metBajada.ascenso);

  ctx.font = fuente(TIPOS.urgenteTexto, px);
  ctx.letterSpacing = `${-0.1 * px}px`;
  const arriba = arribaBajada + pxBajada + separacion;
  lineas.forEach((linea, i) => {
    ctx.fillText(linea, centro,
      arriba + i * interlinea + (interlinea - (met.ascenso + met.descenso)) / 2 + met.ascenso);
  });

  if(noticia){
    // una raya corta separa el aviso de la noticia
    const yRaya = arriba + lineas.length * interlinea + N.antesRaya * u;
    ctx.fillRect(centro - N.raya * u / 2, yRaya, N.raya * u, N.grosorRaya * u);
    const metN = metricas(ctx, TIPOS.urgenteNoticia, pxNoticia);
    const paso = pxNoticia * N.interlinea;
    const desde = yRaya + (N.grosorRaya + N.despuesRaya) * u;
    ctx.font = fuente(TIPOS.urgenteNoticia, pxNoticia);
    ctx.letterSpacing = `${-0.01 * pxNoticia}px`;
    renglones.forEach((r, i) => {
      ctx.fillText(r, centro, desde + i * paso + (paso - (metN.ascenso + metN.descenso)) / 2 + metN.ascenso);
    });
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* entrada principal                                                   */
/* ------------------------------------------------------------------ */

/* Se pide el ancho y el alto sale solo: la proporción es parte del diseño,
   no algo que cada quien elija. El canvas tiene que venir de ese tamaño. */
export function dibujar(ctx, datos, fotos, ancho){
  const u = ancho / LIENZO;
  const alto = altoDe(ancho);

  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = datos.color_fondo;
  ctx.fillRect(0, 0, ancho, alto);
  ctx.letterSpacing = '0px';

  if(datos.formato === 'urgente') dibujarUrgente(ctx, datos, fotos, u, ancho, alto);
  else dibujarNoticia(ctx, datos, fotos, u, alto);

  if(fotos.logo){
    const L = MEDIDAS.logo;
    const [anchoLogo, altoLogo] = medidaLogo(fotos.logo, u);
    ctx.drawImage(fotos.logo, (ancho - anchoLogo) / 2,
      alto - (L.abajo * u) - altoLogo, anchoLogo, altoLogo);
  }
  if(fotos.firma) dibujarFirma(ctx, fotos.firma, u, FIRMA.x * u, FIRMA.y * u, datos.color_filete);
}

/* Lámina suelta del carrusel: la foto a sangre, ocupando el cuadro entero,
   con el logo encima y un fundido al color del medio solo en la franja de
   abajo, para que el logo se lea sobre cualquier foto. */
export const LAMINA_DEG_INICIO = 82;

/* La lámina de cierre: el color de la paleta y encima el arte de siempre,
   que ya viene con el logo, el «síguenos y comparte» y los iconos.
   El arte está dibujado cuadrado, de cuando la placa lo era, y es un PNG
   transparente: solo pinta el dibujo y el resto deja ver el color de abajo.
   Por eso entra entero y centrado en vez de recortado: agrandarlo hasta
   llenar el 4:5 le comía los márgenes —«COMPARTE» quedaba tocando el borde—
   y no hacía falta, porque lo que sobra arriba y abajo es el mismo color de
   la paleta que ya está pintado. No se ve ninguna franja.
   El día que haya un arte hecho en 4:5, llena el lienzo justo. */
export function dibujarCierre(ctx, datos, arte, ancho){
  const alto = altoDe(ancho);
  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = datos.color_fondo || '#111111';
  ctx.fillRect(0, 0, ancho, alto);
  if(!arte) return;
  const escala = Math.min(ancho / arte.width, alto / arte.height);
  const w = arte.width * escala, h = arte.height * escala;
  ctx.drawImage(arte, (ancho - w) / 2, (alto - h) / 2, w, h);
}

export function dibujarLamina(ctx, datos, lamina, foto, logo, ancho){
  const u = ancho / LIENZO;
  const alto = altoDe(ancho);

  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.letterSpacing = '0px';

  dibujarFoto(ctx, foto, 0, 0, ancho, alto,
    lamina.ajuste || 'completa', lamina.x ?? 50, lamina.y ?? 50, u, lamina.zoom ?? 1);

  ctx.fillStyle = degradado(ctx, datos, 0, 0, ancho, alto, LAMINA_DEG_INICIO);
  ctx.fillRect(0, 0, ancho, alto);

  if(logo){
    const L = MEDIDAS.logo;
    const [anchoLogo, altoLogo] = medidaLogo(logo, u);
    ctx.drawImage(logo, (ancho - anchoLogo) / 2,
      alto - (L.abajo * u) - altoLogo, anchoLogo, altoLogo);
  }
}

/* Las fuentes tienen que estar cargadas antes de medir nada. */
export async function esperarTipografias(){
  if(!document.fonts) return;
  await Promise.all([
    document.fonts.load('900 100px "Inter Tight"'),
    document.fonts.load('500 100px "Inter Tight"'),
    document.fonts.load('700 100px "Inter Tight"'),
    document.fonts.load('700 100px "Poppins"'),
    document.fonts.load('900 100px "Poppins"'),
  ]);
  await document.fonts.ready;
}

/* ------------------------------------------------------------------ */
/* reel: vertical 9:16, con el titular animado al entrar               */
/* ------------------------------------------------------------------ */

/* Medidas en el espacio de 1080 de ancho, que es el del reel. */
export const REEL = {
  ancho: 1080, alto: 1920,
  margen: 70, filete: 12, sangria: 30,
  titular: 66, interlinea: 1.2,
  etiqueta: { fuente: 30, padY: 11, padX: 40, sesgo: 18, separacion: 44 },
  logo: { alto: 108, ancho: 620, abajo: 92 },
  degradado: 46,          // dónde arranca el fundido, en % del alto
};

const suave = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/* Cada pieza entra por separado: la etiqueta primero, después las líneas
   del titular una tras otra, y el logo al final. `avance` va de 0 a 1. */
function entrada(avance, desde, dura){
  return suave((avance - desde) / dura);
}

/* Con `soloEncima` dibuja únicamente lo que va sobre el video —degradado,
   titular, filete, etiqueta y logo— sobre fondo transparente. Así la vista
   previa puede poner esta capa arriba del video crudo y el texto se ve
   cambiar mientras se escribe, sin tener que volver a quemar nada. */
export function dibujarReel(ctx, datos, medio, logo, ancho, alto, avance = 1, soloEncima = false, firma = null){
  const u = ancho / REEL.ancho;
  const R = REEL;

  ctx.clearRect(0, 0, ancho, alto);
  ctx.letterSpacing = '0px';

  if(!soloEncima){
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, ancho, alto);
    // el video llena el cuadro
    // con el recorte que se eligió: qué parte del video y qué tan cerca
    dibujarFoto(ctx, medio, 0, 0, ancho, alto, 'cubrir',
      datos.reel_x ?? 50, datos.reel_y ?? 50, u, datos.reel_zoom ?? 1);
  }

  // fundido al color del medio, para que el texto se lea
  ctx.fillStyle = degradado(ctx, datos, 0, 0, ancho, alto, R.degradado);
  ctx.fillRect(0, 0, ancho, alto);

  // quién publica: arriba, pero más abajo que en la placa, porque en los
  // reels Instagram pone su barra encima de la parte de arriba del video
  if(firma) dibujarFirma(ctx, firma, ancho / LIENZO, R.margen * u, 150 * u, datos.color_filete);

  const px = R.titular * u;
  const interlinea = px * R.interlinea;
  const inter = 0.008 * px;
  const izquierda = (R.margen + R.filete + R.sangria) * u;
  const maxAncho = ancho - izquierda - R.margen * u;
  const lineas = repartir(ctx, datos.titulo, TIPOS.titular, px, inter, maxAncho);
  const met = metricas(ctx, TIPOS.titular, px);

  // el logo abajo, y encima el titular
  let abajo = alto - R.logo.abajo * u;
  if(logo){
    const escala = Math.min(R.logo.alto / logo.height, R.logo.ancho / logo.width) * u;
    const anchoL = logo.width * escala, altoL = logo.height * escala;
    const e = entrada(avance, .55, .4);
    ctx.save();
    ctx.globalAlpha = e;
    ctx.drawImage(logo, (ancho - anchoL) / 2, abajo - altoL + (1 - e) * 40 * u, anchoL, altoL);
    ctx.restore();
    abajo -= altoL + 54 * u;
  }

  const arribaTexto = abajo - lineas.length * interlinea;
  const medioInterlineado = (interlinea - (met.ascenso + met.descenso)) / 2;
  const colores = {
    normal: '#fff',
    fondo: datos.color_filete,
    texto: textoSobre(datos.color_filete),
  };
  const caja = {
    mayuscula: met.mayuscula,
    padX: 16 * u, padY: 11 * u, aire: 20 * u, interExtra: 0.022 * px,
  };

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  lineas.forEach((linea, i) => {
    const e = entrada(avance, .14 + i * .09, .38);
    if(e <= 0) return;
    ctx.globalAlpha = e;
    ctx.save();
    ctx.translate(0, (1 - e) * 46 * u);
    dibujarLinea(ctx, linea, izquierda,
      arribaTexto + i * interlinea + medioInterlineado + met.ascenso,
      caja, TIPOS.titular, px, inter, colores);
    ctx.restore();
  });
  ctx.restore();

  // el filete crece con las líneas que ya entraron
  const visibles = lineas.filter((_, i) => entrada(avance, .14 + i * .09, .38) > 0).length;
  if(visibles){
    const respiro = 10 * u;
    ctx.globalAlpha = Math.min(1, entrada(avance, .14, .38) + .2);
    ctx.fillStyle = datos.color_filete;
    ctx.fillRect(R.margen * u, arribaTexto - respiro,
      R.filete * u, visibles * interlinea + respiro * 2);
    ctx.globalAlpha = 1;
  }

  // la etiqueta, arriba del titular
  const texto = String(datos.etiqueta || '').trim().toUpperCase();
  if(texto){
    const E = R.etiqueta;
    const pxE = E.fuente * u;
    const interE = 0.04 * pxE;
    const metE = metricas(ctx, TIPOS.etiqueta, pxE);
    const altoE = metE.mayuscula + E.padY * u * 2;
    const anchoE = anchoDe(ctx, texto, TIPOS.etiqueta, pxE, interE) + E.padX * u * 2;
    const xE = R.margen * u;
    const e = entrada(avance, 0, .3);
    const yE = arribaTexto - E.separacion * u - altoE + (1 - e) * 40 * u;

    ctx.save();
    ctx.globalAlpha = e;
    ctx.beginPath();
    ctx.moveTo(xE + E.sesgo * u, yE);
    ctx.lineTo(xE + anchoE, yE);
    ctx.lineTo(xE + anchoE - E.sesgo * u, yE + altoE);
    ctx.lineTo(xE, yE + altoE);
    ctx.closePath();
    ctx.fillStyle = MEDIDAS.etiqueta.fondo;
    ctx.fill();
    ctx.fillStyle = MEDIDAS.etiqueta.texto;
    ctx.font = fuente(TIPOS.etiqueta, pxE);
    ctx.letterSpacing = `${interE}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(texto, xE + E.padX * u, yE + E.padY * u + metE.mayuscula);
    ctx.restore();
  }
}


/* ------------------------------------------------------------------ */
/* placa con voz                                                       */
/* ------------------------------------------------------------------ */

/* La placa de noticia hecha video: la misma foto, el mismo titular, y una
   franja de reproductor arriba de la etiqueta con un ecualizador que se
   mueve con la voz. Todo lo que no se mueve se dibuja una sola vez y cada
   cuadro solo lo copia: así armar treinta cuadros por segundo sale barato,
   y el video no depende de lo rápido que sea el aparato. */
export const VOZ = {
  ritmo: 30,                  // cuadros por segundo, siempre los mismos
  bandas: 12,                 // bandas del ecualizador; se dibujan en espejo: 23 barras
  acercar: 0.07,              // la foto crece un 7 % de punta a punta
  /* El titular cede lugar a la franja: uno muy largo se achica antes de
     subir hasta acá, para que la franja no termine encima de las caras. */
  tituloArriba: 2050,
  franja: { alto: 300, separacion: 40, mic: 118, anillo: 12, aire: 70, reloj: 66 },
  // la entrada, en segundos
  entrada: { franja: [0.15, 0.6], etiqueta: [0.25, 0.55], filete: [0.35, 0.6],
             lineas: 0.45, entreLineas: 0.11, linea: 0.5, sube: 70 },
};

const lienzoNuevo = (w, h) => {
  /* Un lienzo de la página y no uno fuera de pantalla cuando se puede: el
     de fuera de pantalla no siempre respeta el espaciado entre letras, y el
     titular salía distinto que en la placa. */
  if(typeof document !== 'undefined'){
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
};

const minutos = (s) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/* Cuándo termina de entrar el titular: cuando llega la última línea. */
function finDeEntrada(lineas){
  const E = VOZ.entrada;
  return E.lineas + Math.max(0, lineas - 1) * E.entreLineas + E.linea;
}

/* Dónde está cada pieza del titular en el segundo `t` de la entrada. */
function entradaVoz(t){
  const E = VOZ.entrada;
  const tramo = ([a, b]) => suave((t - a) / (b - a));
  const etiqueta = tramo(E.etiqueta);
  return {
    linea: (i) => {
      const e = suave((t - E.lineas - i * E.entreLineas) / E.linea);
      return { dy: (1 - e) * E.sube, alfa: e };
    },
    etiqueta: { dy: (1 - etiqueta) * E.sube * 0.6, alfa: etiqueta },
    filete: tramo(E.filete),
  };
}

/* Un micrófono simple, en el color que se lea sobre el filete. */
function dibujarMic(ctx, cx, cy, s, color){
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.17;
  const w = s * 0.64;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - s * 0.98, w, s * 1.12, w / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.2, s * 0.6, 0.08 * Math.PI, 0.92 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.42);
  ctx.lineTo(cx, cy + s * 0.78);
  ctx.moveTo(cx - s * 0.36, cy + s * 0.78);
  ctx.lineTo(cx + s * 0.36, cy + s * 0.78);
  ctx.stroke();
  ctx.restore();
}

/* La franja del reproductor: el micrófono que late con la voz y marca cuánto
   va, el ecualizador, y el tiempo. `bandas` son los niveles del momento, de
   0 a 1, de la más grave a la más aguda; sin audio todavía se dibuja una
   onda de muestra, para ver el diseño. */
/* `lados` deja que otro diseño ponga la franja entre sus propios márgenes
   ({ izquierda, derecha }, en unidades del lienzo). Sin él, los de acá. */
export function dibujarFranja(ctx, datos, u, abajo, t, duracion, bandas, volumen, aparece, lados = null){
  if(aparece <= 0) return;
  const F = VOZ.franja;
  const alto = F.alto * u;
  const cy = abajo - F.separacion * u - alto / 2;
  const r = F.mic * u;
  const cx = (lados?.izquierda ?? MEDIDAS.pie.x) * u + r;
  const voz = Math.min(1, Math.max(0, volumen || 0));

  const aro = r + F.anillo * u * 1.4;
  const derecha = (lados?.derecha ?? (LIENZO - MEDIDAS.pie.margenDerecho)) * u;

  ctx.save();
  ctx.globalAlpha = aparece;
  ctx.translate(0, (1 - aparece) * 50 * u);

  /* Una píldora oscura y translúcida debajo, como una nota de voz: sin
     ella, sobre una foto clara las barras blancas no se veían. */
  const altoPildora = (aro + F.anillo * u) * 2 + 36 * u;
  ctx.beginPath();
  ctx.roundRect(cx - altoPildora / 2, cy - altoPildora / 2,
    derecha + 56 * u - (cx - altoPildora / 2), altoPildora, altoPildora / 2);
  ctx.fillStyle = 'rgba(12,10,16,0.42)';
  ctx.fill();

  // el latido: un halo que crece y se aclara cuando hay voz
  ctx.beginPath();
  ctx.arc(cx, cy, r * (1.18 + 0.34 * voz), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${(0.08 + 0.2 * voz).toFixed(3)})`;
  ctx.fill();

  // cuánto va: un aro blanco alrededor del micrófono
  const progreso = duracion > 0 ? Math.min(1, Math.max(0, t / duracion)) : 0;
  ctx.lineWidth = F.anillo * u;
  ctx.beginPath();
  ctx.arc(cx, cy, aro, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.stroke();
  if(progreso > 0){
    ctx.beginPath();
    ctx.arc(cx, cy, aro, -Math.PI / 2, -Math.PI / 2 + progreso * Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = datos.color_filete;
  ctx.fill();
  dibujarMic(ctx, cx, cy, r * 0.5, textoSobre(datos.color_filete));

  // el tiempo, a la derecha
  const pxReloj = F.reloj * u;
  // el total redondeado: un audio de 11,998 s es «0:12», no «0:11»
  const texto = `${minutos(t)} / ${minutos(Math.round(duracion))}`;
  const metReloj = metricas(ctx, TIPOS.etiqueta, pxReloj);
  const anchoReloj = anchoDe(ctx, `${minutos(Math.round(duracion))} / ${minutos(Math.round(duracion))}`, TIPOS.etiqueta, pxReloj, 0);
  ctx.font = fuente(TIPOS.etiqueta, pxReloj);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(texto, derecha, cy + metReloj.mayuscula / 2);
  ctx.textAlign = 'left';

  // el ecualizador: las bandas en espejo, las graves al medio
  const B = VOZ.bandas;
  const total = B * 2 - 1;
  const x0 = cx + aro + F.anillo * u + F.aire * u;
  const x1 = derecha - anchoReloj - F.aire * u;
  const paso = (x1 - x0) / total;
  const ancho = paso * 0.62;
  const mitad = alto / 2 * 0.94;
  for(let k = 0; k < total; k++){
    const b = Math.abs(k - (B - 1));
    const nivel = bandas
      ? Math.min(1, Math.max(0, bandas[b]))
      : 0.18 + 0.55 * Math.abs(Math.sin(k * 0.9 + 0.6)) * (1 - b / B * 0.6);
    const h = Math.max(ancho, nivel * mitad * 2);
    ctx.fillStyle = `rgba(255,255,255,${(0.6 + 0.4 * nivel).toFixed(3)})`;
    ctx.beginPath();
    ctx.roundRect(x0 + k * paso + (paso - ancho) / 2, cy - h / 2, ancho, h, ancho / 2);
    ctx.fill();
  }
  ctx.restore();
}

/* Arma la placa con voz y devuelve con qué dibujar cada cuadro.
   `cuadro(ctx, t, bandas, volumen)` dibuja el segundo `t`, con los niveles
   de la voz en ese momento. `portada` es un buen segundo para la tapa:
   cuando el titular ya terminó de entrar. */
export function prepararVoz(datos, fotos, ancho, duracion){
  const u = ancho / LIENZO;
  const alto = altoDe(ancho);
  const caja = cajaFoto(u, alto);
  const Z = 1 + VOZ.acercar;

  /* La foto, dibujada una vez ya agrandada: acercarla en cada cuadro es
     solo copiarla un poco más chica. Recomponerla cada vez —con el fondo
     difuminado de «completa», que es lo más caro del dibujo— no llegaba a
     treinta cuadros por segundo en un teléfono. */
  const capaFoto = lienzoNuevo(Math.round(ancho * Z), Math.round(alto * Z));
  fotoNoticia(capaFoto.getContext('2d'), datos, fotos, u * Z, alto * Z);

  const capaFundido = lienzoNuevo(ancho, alto);
  const cf = capaFundido.getContext('2d');
  fundidoNoticia(cf, datos, u, alto);
  if(fotos.logo){
    const L = MEDIDAS.logo;
    const [anchoLogo, altoLogo] = medidaLogo(fotos.logo, u);
    cf.drawImage(fotos.logo, (ancho - anchoLogo) / 2, alto - (L.abajo * u) - altoLogo, anchoLogo, altoLogo);
  }

  if(fotos.firma) dibujarFirma(cf, fotos.firma, u, FIRMA.x * u, FIRMA.y * u, datos.color_filete);

  const capaTexto = lienzoNuevo(ancho, alto);
  const lugar = textoNoticia(capaTexto.getContext('2d'), datos, u, alto, VOZ.tituloArriba);
  const termina = finDeEntrada(lugar.lineas);

  // se acerca hacia un poco arriba del centro, que es donde suelen estar las caras
  const centroX = caja.x + caja.ancho / 2;
  const centroY = caja.y + caja.alto * 0.42;

  return {
    alto,
    finEntrada: termina,
    portada: Math.max(0, Math.min(duracion - 0.1, termina + 0.3)),
    cuadro(ctx, t, bandas = null, volumen = 0){
      ctx.save();
      ctx.letterSpacing = '0px';
      ctx.fillStyle = datos.color_fondo;
      ctx.fillRect(0, 0, ancho, alto);

      const a = duracion > 0 ? Math.min(1, Math.max(0, t / duracion)) : 0;
      const s = 1 + VOZ.acercar * a * a * (3 - 2 * a);   // arranca y termina sin tirón
      ctx.save();
      ctx.beginPath();
      ctx.rect(caja.x, caja.y, caja.ancho, caja.alto);
      ctx.clip();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(capaFoto, centroX * (1 - s), centroY * (1 - s), ancho * s, alto * s);
      ctx.restore();

      ctx.drawImage(capaFundido, 0, 0);
      if(t < termina) textoNoticia(ctx, datos, u, alto, VOZ.tituloArriba, entradaVoz(t));
      else ctx.drawImage(capaTexto, 0, 0);

      const [d0, d1] = VOZ.entrada.franja;
      dibujarFranja(ctx, datos, u, lugar.arribaEtiqueta, t, duracion, bandas, volumen,
        suave((t - d0) / (d1 - d0)));
      ctx.restore();
    },
  };
}
