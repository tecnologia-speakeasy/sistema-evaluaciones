import { after } from "next/server";
import { ErrorAutorizacion, requireEstudiante } from "@/lib/auth/guards";
import { estadoIntento } from "@/lib/datos/intentos";
import { errorServidor } from "@/lib/http";
import { procesarIntento } from "@/lib/ia/procesar";
import { idUrlSchema } from "@/lib/validacion";

// La consulta la pantalla de "calificando" (y el resultado pendiente) cada
// pocos segundos, como /api/feedback de a2: mientras la IA no termina devuelve
// el estado y la pantalla sigue esperando. Si el intento quedó pendiente y
// nadie lo está procesando (falló, o se cortó el after() del envío), lo vuelve
// a lanzar; el candado evita llamadas dobles.
//   { estado, numero, slug }

export const maxDuration = 300;

export async function GET(_req: Request, ctx: RouteContext<"/api/intentos/[id]/estado">) {
  const id = idUrlSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Intento inválido." }, { status: 404 });

  try {
    const estudiante = await requireEstudiante();
    const r = await estadoIntento(id.data, estudiante.id);
    if (!r) return Response.json({ error: "Intento no encontrado." }, { status: 404 });
    if (r.relanzar) {
      after(async () => {
        await procesarIntento(id.data).catch((e) => console.error("[intentos/estado] IA", e));
      });
    }
    return Response.json(
      { estado: r.estado, numero: r.numero, slug: r.slug },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    console.error("[intentos/estado]", e);
    return errorServidor();
  }
}
