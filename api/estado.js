/* Diagnóstico de la configuración de Instagram.
 *
 * Nunca devuelve el valor de una credencial: solo si está puesta o no, y el
 * resultado de probarla contra la API. El token se queda en las variables de
 * entorno de Vercel, que es el único lugar de este proyecto donde está a
 * salvo — Blob es de lectura pública y ahí quedaría expuesto.
 */

const API = 'https://graph.instagram.com/v25.0';

export default async function handler(req, res){
  const { IG_USER_ID, IG_ACCESS_TOKEN, PUBLICAR_CLAVE, BLOB_READ_WRITE_TOKEN } = process.env;

  const variables = {
    IG_USER_ID: !!IG_USER_ID,
    IG_ACCESS_TOKEN: !!IG_ACCESS_TOKEN,
    PUBLICAR_CLAVE: !!PUBLICAR_CLAVE,
    BLOB_READ_WRITE_TOKEN: !!BLOB_READ_WRITE_TOKEN,
  };
  const faltan = Object.entries(variables).filter(([, ok]) => !ok).map(([k]) => k);

  // Sin clave definida no hay nada que proteger todavía: se informa qué falta
  // para poder configurarlo, y nada más.
  if(!PUBLICAR_CLAVE){
    return res.status(200).json({
      listo: false, variables, faltan,
      mensaje: 'Todavía no hay clave definida. Publicar está bloqueado hasta que exista PUBLICAR_CLAVE.',
    });
  }

  const clave = req.headers['x-clave'] || req.query?.clave;
  if(clave !== PUBLICAR_CLAVE) return res.status(401).json({ error: 'Clave incorrecta' });

  if(!IG_USER_ID || !IG_ACCESS_TOKEN){
    return res.status(200).json({ listo: false, variables, faltan });
  }

  // probar el token de verdad contra la API
  let cuenta = null, tokenError = null;
  try{
    const r = await fetch(
      `${API}/${IG_USER_ID}?fields=id,username,account_type&access_token=${IG_ACCESS_TOKEN}`);
    const d = await r.json();
    if(d.error) tokenError = d.error.message;
    else cuenta = d;
  }catch(e){ tokenError = e.message; }

  return res.status(200).json({
    listo: !!cuenta && !faltan.length,
    variables, faltan, cuenta, tokenError,
  });
}
