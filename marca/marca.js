/* Quién es el medio.
 *
 * Esta carpeta es lo único que cambia entre un sitio y otro, y es la única
 * que el actualizador no toca nunca. Así dos medios distintos viven del mismo
 * GitHub: se actualizan juntos y cada uno conserva su identidad.
 *
 * Para montar otro medio: se copia esta carpeta con su logo y su cierre, se
 * cambian los colores y el nombre, y listo. La base de datos, la clave y el
 * token de Instagram ya eran de cada sitio, en api/config.php y en su panel.
 */

export const MARCA = {
  nombre: 'Somos Puerto',
  cuenta: '@somospuertochile',

  /* El logo va al pie de cada placa; el cierre es la lámina que termina cada
     publicación. Los dos viven acá, no en assets/, justamente para que una
     actualización no los reemplace por los de otro medio. */
  logo:   'marca/logo.png',
  cierre: 'marca/cierre.png',

  /* Las paletas. El filete es siempre uno de los dos colores de marca, así
     todo queda en familia aunque cambie el fondo. Los fondos se eligieron con
     contraste suficiente para el titular blanco. */
  paleta: [
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
  ],

  /* Las secciones del medio, las que aparecen como botones bajo la etiqueta. */
  etiquetas: ['Farándula', 'Noticia', 'Contingencia', 'Policial',
              'Deportes', 'Política', 'Espectáculos', 'Comunidad'],

  /* Qué dibujante usa. Por ahora hay uno solo; cuando entre un medio con otra
     pieza gráfica, va a tener el suyo y se elige por acá. */
  dibujo: 'somos-puerto',
};
