import { z } from "zod";
import { errorServidor, leerJson } from "@/lib/http";
import { emailSchema } from "@/lib/validacion";
import { mensajeRechazo, verificarCodigoEstudiante } from "@/lib/auth/acceso-estudiante";
import { DIGITOS_CODIGO, limpiarCodigo } from "@/lib/auth/codigo-compartido";
import { setSession } from "@/lib/auth/session";

// Paso 2 del login (solo estudiantes): correo + código de 6 dígitos.
//   { ok: true }                                   → sesión creada
//   401 { error, motivo, intentosRestantes? }      → ver mensajeRechazo()

const schema = z.object({
  email: emailSchema,
  codigo: z
    .string({ error: "Escribe el código" })
    .transform(limpiarCodigo)
    .pipe(z.string().length(DIGITOS_CODIGO, `Escribe los ${DIGITOS_CODIGO} dígitos del código.`)),
});

export async function POST(req: Request) {
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;
  const { email, codigo } = entrada.data;

  try {
    const r = await verificarCodigoEstudiante(email, codigo);
    if (!r.ok) {
      return Response.json(
        { error: mensajeRechazo(r), motivo: r.motivo, intentosRestantes: r.intentosRestantes },
        { status: 401 },
      );
    }
    await setSession({ tipo: "estudiante", id: r.estudianteId });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[auth/verificar-codigo]", e);
    return errorServidor();
  }
}
