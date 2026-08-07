/* Publica el carrusel en Instagram.
 *
 * Corre en el servidor y no en el navegador por dos motivos: el token no
 * puede quedar en el JavaScript que cualquiera puede abrir, y la API de
 * Instagram no acepta que le subas archivos — exige una URL pública que
 * ella misma va a buscar. Por eso las imágenes pasan primero por Blob.
 *
 * Variables de entorno que hay que definir en Vercel:
 *   IG_USER_ID              id de la cuenta profesional de Instagram
 *   IG_ACCESS_TOKEN         token de larga duración
 *   PUBLICAR_CLAVE          clave propia, para que no publique cualquiera
 *   BLOB_READ_WRITE_TOKEN   lo agrega Vercel solo al conectar el store
 */

import { put, del } from '@vercel/blob';

export const config = { maxDuration: 60 };

const API = 'https://graph.instagram.com/v25.0';
const MAX_LAMINAS = 10;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function graph(ruta, token, cuerpo){
  const url = new URL(`${API}/${ruta}`);
  const params = new URLSearchParams({ ...cuerpo, access_token: token });
  const res = await fetch(url, { method: 'POST', body: params });
  const datos = await res.json().catch(() => ({}));
  if(!res.ok || datos.error){
    const e = new Error(datos.error?.error_user_msg || datos.error?.message || `Error ${res.status}`);
    e.detalle = datos.error;
    throw e;
  }
  return datos;
}

/* Instagram descarga la imagen en segundo plano: hay que esperar a que el
   contenedor quede FINISHED antes de publicarlo. */
async function esperarContenedor(id, token, intentos = 20){
  for(let i = 0; i < intentos; i++){
    const res = await fetch(`${API}/${id}?fields=status_code&access_token=${token}`);
    const { status_code } = await res.json().catch(() => ({}));
    if(status_code === 'FINISHED') return;
    if(status_code === 'ERROR' || status_code === 'EXPIRED'){
      throw new Error(`Instagram rechazó una de las imágenes (${status_code})`);
    }
    await esperar(1500);
  }
  throw new Error('Instagram tardó demasiado en procesar las imágenes');
}

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { IG_USER_ID, IG_ACCESS_TOKEN, PUBLICAR_CLAVE } = process.env;
  if(!IG_USER_ID || !IG_ACCESS_TOKEN){
    return res.status(503).json({
      error: 'Falta configurar IG_USER_ID e IG_ACCESS_TOKEN en Vercel.' });
  }

  const { clave, imagenes, caption = '', colaboradores = '' } = req.body || {};

  if(!PUBLICAR_CLAVE){
    return res.status(503).json({
      error: 'Falta definir PUBLICAR_CLAVE en Vercel: sin eso el endpoint queda abierto.' });
  }
  if(clave !== PUBLICAR_CLAVE) return res.status(401).json({ error: 'Clave incorrecta' });

  if(!Array.isArray(imagenes) || !imagenes.length){
    return res.status(400).json({ error: 'No llegó ninguna imagen' });
  }
  if(imagenes.length > MAX_LAMINAS){
    return res.status(400).json({ error: `Instagram acepta hasta ${MAX_LAMINAS} imágenes` });
  }

  const subidas = [];
  let aviso = null;
  try{
    // 1. las imágenes tienen que estar en una URL pública para que IG las lea
    for(const [i, dataUrl] of imagenes.entries()){
      const base64 = String(dataUrl).split(',')[1] || '';
      const blob = await put(`placas/${Date.now()}-${i}.jpg`, Buffer.from(base64, 'base64'), {
        access: 'public', contentType: 'image/jpeg', addRandomSuffix: true,
      });
      subidas.push(blob);
    }

    const cuentas = colaboradores.split(/[,\s]+/)
      .map((c) => c.replace('@', '').trim()).filter(Boolean).slice(0, 3);

    // 2. un contenedor por imagen
    const hijos = [];
    for(const blob of subidas){
      const { id } = await graph(`${IG_USER_ID}/media`, IG_ACCESS_TOKEN, {
        image_url: blob.url,
        ...(imagenes.length > 1 ? { is_carousel_item: 'true' } : { caption }),
      });
      hijos.push(id);
    }
    for(const id of hijos) await esperarContenedor(id, IG_ACCESS_TOKEN);

    // 3. si son varias, el contenedor del carrusel; si es una sola, ya está
    let contenedor = hijos[0];
    if(imagenes.length > 1){
      const armar = (conColaboradores) => graph(`${IG_USER_ID}/media`, IG_ACCESS_TOKEN, {
        media_type: 'CAROUSEL',
        children: hijos.join(','),
        caption,
        ...(conColaboradores && cuentas.length ? { collaborators: JSON.stringify(cuentas) } : {}),
      });
      try{
        contenedor = (await armar(true)).id;
      }catch(e){
        // los colaboradores dependen de la cuenta y del permiso; si no pasan,
        // se publica igual y se avisa en vez de fallar entero
        if(!cuentas.length) throw e;
        contenedor = (await armar(false)).id;
        aviso = 'no se pudieron agregar los colaboradores (' + e.message + ')';
      }
      await esperarContenedor(contenedor, IG_ACCESS_TOKEN);
    }

    // 4. publicar
    const { id } = await graph(`${IG_USER_ID}/media_publish`, IG_ACCESS_TOKEN, {
      creation_id: contenedor,
    });

    const enlace = await fetch(`${API}/${id}?fields=permalink&access_token=${IG_ACCESS_TOKEN}`)
      .then((r) => r.json()).then((d) => d.permalink).catch(() => null);

    return res.status(200).json({
      ok: true, id, enlace, laminas: imagenes.length,
      aviso,
    });
  }catch(e){
    return res.status(502).json({ error: e.message, detalle: e.detalle || null });
  }finally{
    // las imágenes ya fueron descargadas por Instagram: no hace falta
    // seguir pagando por tenerlas ahí
    await Promise.allSettled(subidas.map((b) => del(b.url)));
  }
}
