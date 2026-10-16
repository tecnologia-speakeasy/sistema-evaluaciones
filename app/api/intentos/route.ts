import { z } from "zod";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { iniciarOReanudar } from "@/lib/datos/intentos";
import { ErrorNegocio } from "@/lib/errores";
import { errorServidor, leerJson } from "@/lib/http";
import { idSchema } from "@/lib/validacion";

// "Comenzar" / "Continuar": retoma el intento en curso o crea uno nuevo.
//   { tipo: "en_curso", intento }  → inicio, límite, hora del servidor y borrador
//   { tipo: "finalizado", numero } → el que tenía ya se pasó del plazo: se calificó
//   409 { error }                  → fuera de fecha, sin intentos, no publicada…

const schema = z.object({ evaluacionId: idSchema });

export async function POST(req: Request) {
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;
  try {
    const estudiante = await requireEstudiante();
    return Response.json(await iniciarOReanudar(entrada.data.evaluacionId, estudiante));
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    if (e instanceof ErrorNegocio) return Response.json({ error: e.message }, { status: 409 });
    console.error("[intentos/iniciar]", e);
    return errorServidor();
  }
}
