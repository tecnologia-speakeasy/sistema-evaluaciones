import { after } from "next/server";
import { z } from "zod";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { enviarIntento } from "@/lib/datos/intentos";
import { ErrorNegocio } from "@/lib/errores";
import { errorServidor, leerJson } from "@/lib/http";
import { procesarIntento } from "@/lib/ia/procesar";
import { cambiosPestanaSchema, respuestasSchema } from "@/lib/intentos/entrada";
import { idUrlSchema } from "@/lib/validacion";

// "Finalizar" (o el envío automático al acabar el tiempo): guarda y califica lo
// cerrado en el servidor y responde de una vez; la IA (abiertas + feedback),
// el correo y el WhatsApp corren después de responder (after()), fuera de
// cualquier transacción. La pantalla espera con GET ./estado.
// Fuera de plazo se califica lo guardado. Enviar dos veces da lo mismo.
//   { numero, estado, slug }

// La IA tarda 10–30 s (más con reintentos): after() necesita ese margen.
export const maxDuration = 300;

const schema = z.object({ respuestas: respuestasSchema, cambiosPestana: cambiosPestanaSchema });

export async function POST(req: Request, ctx: RouteContext<"/api/intentos/[id]/enviar">) {
  const id = idUrlSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Intento inválido." }, { status: 404 });
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;

  try {
    const estudiante = await requireEstudiante();
    const r = await enviarIntento(id.data, estudiante.id, entrada.data.respuestas, entrada.data.cambiosPestana);
    if (!r) return Response.json({ error: "Intento no encontrado." }, { status: 404 });
    if (r.estado === "pendiente") {
      after(async () => {
        await procesarIntento(id.data).catch((e) => console.error("[intentos/enviar] IA", e));
      });
    }
    return Response.json(r);
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    // Generación desactivada: no se califica; el intento queda en curso.
    if (e instanceof ErrorNegocio) return Response.json({ error: e.message }, { status: 409 });
    console.error("[intentos/enviar]", e);
    return errorServidor();
  }
}
