import { z } from "zod";
import { query } from "@/lib/db";
import { errorServidor, leerJson } from "@/lib/http";
import { emailSchema } from "@/lib/validacion";
import { iniciarAccesoEstudiante } from "@/lib/auth/acceso-estudiante";

// Paso 1 del login unificado: ¿de quién es este correo?
//   { tipo: "staff" }                 → el formulario pide la contraseña
//   { tipo: "estudiante", paso }      → ver lib/auth/acceso-estudiante.ts
//   { tipo: "no_autorizado" }

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
    if (estudiante) {
      const { paso } = await iniciarAccesoEstudiante(estudiante.id);
      return Response.json({ tipo: "estudiante", paso });
    }

    return Response.json({ tipo: "no_autorizado" });
  } catch (e) {
    console.error("[auth/identify]", e);
    return errorServidor();
  }
}
