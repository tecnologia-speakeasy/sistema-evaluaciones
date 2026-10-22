"use server";

import { requireStaff } from "@/lib/auth/guards";
import { aResultadoError } from "@/lib/acciones";
import { notificarIntento, procesarIntento } from "@/lib/ia/procesar";
import { idSchema } from "@/lib/validacion";

// Intentos (Fase 5): admin y docente ("resultados" es de los dos roles).
// La IA tarda 10–30 s: la página que usa estas acciones fija maxDuration.
// No refrescan la página: la fila muestra el resultado y la lista se actualiza
// después (si se refrescara de una vez, la fila desaparecería con el aviso).

export type ResultadoReintento = { ok: true; mensaje: string } | { ok: false; error: string };

// "Reintentar IA": procesa ya, aunque haya pasado el tope de fallos automáticos.
export async function reintentarIAAction(intentoId: unknown): Promise<ResultadoReintento> {
  try {
    await requireStaff();
    const r = await procesarIntento(idSchema.parse(intentoId), { forzar: true });
    if (r === "listo") return { ok: true, mensaje: "Listo: calificado." };
    if (r === "ocupado") return { ok: false, error: "Ya se está procesando o ya terminó. Recarga en un momento." };
    return { ok: false, error: "La IA volvió a fallar. Mira el error y vuelve a intentar más tarde." };
  } catch (e) {
    const r = aResultadoError(e);
    return { ok: false, error: r.ok ? "" : r.error };
  }
}

// "Reintentar envío": el intento ya está listo pero el correo no salió.
export async function reintentarEnvioAction(intentoId: unknown): Promise<ResultadoReintento> {
  try {
    await requireStaff();
    if ((await notificarIntento(idSchema.parse(intentoId))) === "fallo") {
      return { ok: false, error: "El envío volvió a fallar. Mira el error." };
    }
    return { ok: true, mensaje: "Enviado." };
  } catch (e) {
    const r = aResultadoError(e);
    return { ok: false, error: r.ok ? "" : r.error };
  }
}
