import { z } from "zod";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { guardarBorrador, MENSAJE_GENERACION_INACTIVA } from "@/lib/datos/intentos";
import { errorServidor, leerJson } from "@/lib/http";
import { cambiosPestanaSchema, respuestasSchema } from "@/lib/intentos/entrada";
import { idUrlSchema } from "@/lib/validacion";

// Guardado automático mientras responde (también con keepalive al cerrar la pestaña).
//   { guardado }                          → hora del servidor
//   409 { motivo: "fuera_de_plazo" | "enviado" } → el navegador debe enviar / ir al resultado

const schema = z.object({ respuestas: respuestasSchema, cambiosPestana: cambiosPestanaSchema });

export async function PUT(req: Request, ctx: RouteContext<"/api/intentos/[id]/borrador">) {
  const id = idUrlSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Intento inválido." }, { status: 404 });
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;

  try {
    const estudiante = await requireEstudiante();
    const r = await guardarBorrador(id.data, estudiante.id, entrada.data.respuestas, entrada.data.cambiosPestana);
    if (r.ok) return Response.json({ guardado: r.guardado });
    if (r.motivo === "no_existe") return Response.json({ error: "Intento no encontrado." }, { status: 404 });
    // Generación desactivada: no se guarda; el navegador conserva lo respondido.
    if (r.motivo === "generacion_inactiva") {
      return Response.json({ error: MENSAJE_GENERACION_INACTIVA }, { status: 403 });
    }
    return Response.json(
      {
        motivo: r.motivo,
        error:
          r.motivo === "fuera_de_plazo"
            ? "Se acabó el tiempo para responder: calificamos lo que quedó guardado."
            : "Este intento ya se envió.",
      },
      { status: 409 },
    );
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    console.error("[intentos/borrador]", e);
    return errorServidor();
  }
}
