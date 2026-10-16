import { z } from "zod";
import { query } from "@/lib/db";
import { errorServidor, leerJson } from "@/lib/http";
import { emailSchema } from "@/lib/validacion";
import {
  ErrorEnvioCodigo,
  iniciarAccesoEstudiante,
  mensajeLimite,
} from "@/lib/auth/acceso-estudiante";
import { otpActivo } from "@/lib/auth/codigo";
import { ipDeRequest } from "@/lib/auth/login-intentos";

// Paso 1 del login unificado: ¿de quién es este correo?
//   { tipo: "staff" }                         → el formulario pide la contraseña
//   { tipo: "estudiante", paso: "nombre" }    → pide el nombre (/api/auth/estudiante-login)
//   { tipo: "no_autorizado" }
// Solo con OTP_ACTIVO=true, para un estudiante:
//   { tipo: "estudiante", paso: "codigo_enviado", reenviarEn, nuevo } → nombre + código
//   429 { tipo: "estudiante", paso: "limite", reenviarEn, error }
//   "Reenviar código" vuelve a llamar a esta ruta.

const schema = z.object({ email: emailSchema });

export async function POST(req: Request) {
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;
  const { email } = entrada.data;

  try {
    const { rows } = await query<{ tipo: "staff" | "estudiante"; id: number }>(
      `SELECT 'staff' AS tipo, id FROM staff WHERE email = $1 AND activo
       UNION ALL
       SELECT 'estudiante', id FROM estudiantes WHERE email = $1 AND activo`,
      [email],
    );

    // Si un correo está en ambas tablas, gana staff.
    if (rows.some((r) => r.tipo === "staff")) {
      return Response.json({ tipo: "staff" });
    }

    const estudiante = rows.find((r) => r.tipo === "estudiante");
    if (!estudiante) return Response.json({ tipo: "no_autorizado" });

    if (!otpActivo()) return Response.json({ tipo: "estudiante", paso: "nombre" });

    const r = await iniciarAccesoEstudiante({ id: estudiante.id, email }, ipDeRequest(req));
    if (r.paso === "limite") {
      return Response.json(
        { tipo: "estudiante", paso: "limite", reenviarEn: r.reenviarEn, error: mensajeLimite(r.motivo) },
        { status: 429 },
      );
    }
    return Response.json({ tipo: "estudiante", paso: "codigo_enviado", reenviarEn: r.reenviarEn, nuevo: r.nuevo });
  } catch (e) {
    console.error("[auth/identify]", e);
    if (e instanceof ErrorEnvioCodigo) {
      return Response.json(
        { error: "No pudimos enviarte el código por correo. Inténtalo de nuevo en unos minutos." },
        { status: 503 },
      );
    }
    return errorServidor();
  }
}
