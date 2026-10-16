import { z } from "zod";
import { query } from "@/lib/db";
import { errorServidor, leerJson } from "@/lib/http";
import { emailSchema } from "@/lib/validacion";
import { HASH_RELLENO, verifyPassword } from "@/lib/auth/password";
import { setSession } from "@/lib/auth/session";
import type { RolStaff } from "@/lib/auth/token";
import {
  VENTANA_MIN,
  estaBloqueado,
  ipDeRequest,
  registrarIntento,
} from "@/lib/auth/login-intentos";

// Paso 2 del login (solo staff): correo + contraseña.

const schema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Escribe tu contraseña" })
    .min(1, "Escribe tu contraseña")
    .max(200, "Contraseña demasiado larga"),
});

const CREDENCIALES_INCORRECTAS = "Correo o contraseña incorrectos.";

export async function POST(req: Request) {
  const entrada = await leerJson(req, schema);
  if (!entrada.ok) return entrada.respuesta;
  const { email, password } = entrada.data;

  try {
    if (await estaBloqueado(email)) {
      return Response.json(
        {
          error: `Demasiados intentos fallidos. Espera ${VENTANA_MIN} minutos e inténtalo de nuevo.`,
        },
        { status: 429 },
      );
    }

    const { rows } = await query<{
      id: number;
      rol: RolStaff;
      password_hash: string;
      sesion_version: number;
    }>(
      `SELECT id, rol, password_hash, sesion_version FROM staff WHERE email = $1 AND activo`,
      [email],
    );
    const staff = rows[0];

    // Si el correo no existe se ejecuta igual scrypt (contra HASH_RELLENO)
    // para que el tiempo de respuesta no delate qué correos son válidos.
    const coincide = await verifyPassword(
      password,
      staff?.password_hash ?? HASH_RELLENO,
    );
    const exito = Boolean(staff) && coincide;
    await registrarIntento(email, ipDeRequest(req), exito);

    if (!staff || !exito) {
      return Response.json({ error: CREDENCIALES_INCORRECTAS }, { status: 401 });
    }

    await query(`UPDATE staff SET ultimo_login = now() WHERE id = $1`, [
      staff.id,
    ]);
    // Con contraseña temporal, el panel lo manda primero a cambiarla (guards).
    await setSession({ tipo: "staff", id: staff.id, rol: staff.rol, v: staff.sesion_version });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[auth/staff-login]", e);
    return errorServidor();
  }
}
