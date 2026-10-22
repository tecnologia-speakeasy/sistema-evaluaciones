import { timingSafeEqual } from "node:crypto";
import { reprocesarPendientes } from "@/lib/ia/procesar";

// Reproceso de lo que quedó sin terminar: intentos 'pendiente' / 'error' /
// 'calificando' atascados (hasta 10 fallos; después solo el staff) y correos
// sin enviar. OPCIONAL y hoy SIN PROGRAMAR: como a2, lo resuelven el
// after() del envío, la pantalla que espera (relanza la IA) y el staff
// ("Reintentar IA" / "Reintentar envío"). Queda lista por si algún día se
// programa (Cron de Vercel o n8n, ver CLAUDE.md).
// Protegido con Authorization: Bearer CRON_SECRET. Sin CRON_SECRET la app
// funciona igual y esta ruta solo responde 401.

export const maxDuration = 300;

function autorizado(req: Request): boolean {
  const secreto = process.env.CRON_SECRET?.trim();
  if (!secreto || secreto.length < 16) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(req.headers.get("authorization") ?? "");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

export async function GET(req: Request) {
  if (!autorizado(req)) return Response.json({ error: "No autorizado." }, { status: 401 });
  try {
    const r = await reprocesarPendientes();
    console.info("[cron/procesar]", JSON.stringify(r));
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/procesar]", e);
    return Response.json({ error: "Falló el reproceso." }, { status: 500 });
  }
}
