import { z } from "zod";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { enviarIntento } from "@/lib/datos/intentos";
import { errorServidor, leerJson } from "@/lib/http";
import { cambiosPestanaSchema, respuestasSchema } from "@/lib/intentos/entrada";
import { idUrlSchema } from "@/lib/validacion";

// "Finalizar" (o el envío automático al acabar el tiempo): califica en el
// servidor. Fuera de plazo se califica lo guardado. Enviar dos veces da lo mismo.
//   { numero, estado, slug } → el navegador va a /evaluacion/[slug]/intentos/[numero]

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
    return Response.json(r);
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    console.error("[intentos/enviar]", e);
    return errorServidor();
  }
}
