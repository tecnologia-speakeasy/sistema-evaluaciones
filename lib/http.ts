import "server-only";
import type { z } from "zod";

// Utilidades para Route Handlers.

// Lee el cuerpo JSON y lo valida. Si falla, devuelve la respuesta 400 lista
// con el primer mensaje de error.
export async function leerJson<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; respuesta: Response }> {
  const body: unknown = await req.json().catch(() => undefined);
  if (typeof body !== "object" || body === null) {
    return { ok: false, respuesta: error400("Solicitud inválida.") };
  }
  const parsed = schema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    respuesta: error400(parsed.error.issues[0]?.message ?? "Datos inválidos."),
  };
}

function error400(mensaje: string): Response {
  return Response.json({ error: mensaje }, { status: 400 });
}

export function errorServidor(): Response {
  return Response.json(
    { error: "Tuvimos un problema en el servidor. Inténtalo de nuevo en un momento." },
    { status: 500 },
  );
}
