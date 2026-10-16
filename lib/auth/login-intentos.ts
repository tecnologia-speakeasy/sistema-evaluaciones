import "server-only";
import { isIP } from "node:net";
import { query } from "@/lib/db";

// Límite de fuerza bruta para el login del staff:
// se bloquea el correo si acumula MAX_FALLOS fallos en los últimos VENTANA_MIN minutos.
export const MAX_FALLOS = 5;
export const VENTANA_MIN = 15;

export async function estaBloqueado(email: string): Promise<boolean> {
  const { rows } = await query<{ fallos: number }>(
    `SELECT count(*)::int AS fallos
       FROM login_intentos
      WHERE email = $1
        AND NOT exito
        AND created_at > now() - make_interval(mins => $2)`,
    [email, VENTANA_MIN],
  );
  return (rows[0]?.fallos ?? 0) >= MAX_FALLOS;
}

export async function registrarIntento(
  email: string,
  ip: string | null,
  exito: boolean,
): Promise<void> {
  await query(
    `INSERT INTO login_intentos (email, ip, exito) VALUES ($1, $2, $3)`,
    [email, ip, exito],
  );
}

// IP del cliente según el proxy (Vercel pone la real primero en x-forwarded-for).
// Se valida porque la columna es INET y un valor raro rompería el INSERT.
export function ipDeRequest(req: Request): string | null {
  const candidata =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "";
  return isIP(candidata) ? candidata : null;
}
