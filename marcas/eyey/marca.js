/* eyey.cl — publica.eyey.cl
 *
 * Para montar el sitio: se instala el paquete y después se copian estos tres
 * archivos dentro de la carpeta marca/. Desde ahí el actualizador no los toca
 * nunca más, así que las próximas versiones llegan sin pisar la identidad.
 */

export const MARCA = {
  nombre: 'eyey',
  cuenta: '@eyey.cl',

  logo:   'marca/logo.png',
  /* Todavía no hay lámina de cierre para este medio: vacío quiere decir que
     el post termina en la última foto, sin firma al final. */
  cierre: 'marca/cierre.png',

  /* Lo que va en la huincha de abajo, a la izquierda de las flechas. */
  pie: 'SIGUENOS EYEY.CL',

  /* En este diseño la huincha y el resaltado del titular son el mismo color,
     así que las dos casillas de cada paleta van iguales. El degradado negro
     no entra acá: es fijo, parte del diseño. */
  paleta: [
    { nombre: 'Rojo',     fondo: '#ff0000', filete: '#ff0000', original: true },
    { nombre: 'Blanco',   fondo: '#ffffff', filete: '#ffffff' },
    { nombre: 'Negro',    fondo: '#101014', filete: '#101014' },
    { nombre: 'Amarillo', fondo: '#ffd400', filete: '#ffd400' },
    { nombre: 'Menta',    fondo: '#0ae7ae', filete: '#0ae7ae' },
    { nombre: 'Azul',     fondo: '#0b3fd4', filete: '#0b3fd4' },
  ],

  etiquetas: ['Musica', 'Farándula', 'Policial', 'Deportes',
              'Actualidad', 'Cine', 'Virales', 'Tendencias'],

  dibujo: 'eyey',

  /* Con qué arranca una placa nueva de este medio. */
  predeterminados: {
    color_fondo: '#ff0000',
    color_filete: '#ff0000',
    etiqueta: 'Musica',
    diseno: 'unica',
  },

  /* Una sola foto de fondo: no hay armados que elegir. */
  disenos: false,

  /* Por ahora solo la placa normal. El urgente y el reel están dibujados con
     la pieza gráfica del otro medio, así que se esconden hasta tener la de
     este: más vale que falten a que salga publicado algo que no es de la casa. */
  formatos: ['noticia'],
};
