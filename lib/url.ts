// Dirección pública de la app, para enlaces fuera del navegador (correo, WhatsApp).
// APP_URL; si falta, en Vercel el dominio de producción del proyecto
// (VERCEL_PROJECT_PRODUCTION_URL, que Vercel define solo); si no, localhost.
export function urlBase(env: Record<string, string | undefined> = process.env): string {
  const app = env.APP_URL?.trim();
  if (app) return app.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

export function urlPublica(ruta: string, env?: Record<string, string | undefined>): string {
  return `${urlBase(env)}${ruta.startsWith("/") ? "" : "/"}${ruta}`;
}
