import { z } from "zod";
import { errorServidor, leerJson } from "@/lib/http";
import { emailSchema, nombreSchema } from "@/lib/validacion";
import { mensajeRechazo, verificarCodigoEstudiante } from "@/lib/auth/acceso-estudiante";
import { otpActivo } from "@/lib/auth/codigo";
import { DIGITOS_CODIGO, limpiarCodigo } from "@/lib/auth/codigo-compartido";
import { setSession } from "@/lib/auth/session";

// Paso 2 del login de un estudiante con OTP_ACTIVO=true: correo + nombre +
// código de 6 dígitos. Sin OTP no se usa (ver /api/auth/estudiante-login).
//   { ok: true }                                   → sesión creada
//   401 { error, motivo, intentosRestantes? }      → ver mensajeRechazo()
// Un nombre inválido se rechaza antes de mirar el código: no gasta un intento.

const schema = z.object({
  email: emailSchema,
  nombre: nombreSchema,
  codigo: z
    .string({ error: "Escribe el código" })
    .transform(limpiarCodigo)
    .pipe(z.string().length(DIGITOS_CODIGO, `Escribe los ${DIGITOS_CODIGO} dígitos del código.`)),
});

export async function POST(req: Request) {
  if (!otpActivo()) {
    return Response.json({ error: "El acceso con código no está activo." }, { status: 403 });
  }

  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;
  const { email, nombre, codigo } = entrada.data;

  try {
    const r = await verificarCodigoEstudiante(email, codigo);
    if (!r.ok) {
      return Response.json(
        { error: mensajeRechazo(r), motivo: r.motivo, intentosRestantes: r.intentosRestantes },
        { status: 401 },
      );
    }
    await setSession({ tipo: "estudiante", id: r.estudianteId, nombre });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[auth/verificar-codigo]", e);
    return errorServidor();
  }
}
