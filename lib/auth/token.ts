import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Token de sesión firmado con HMAC-SHA256: "<payload_b64url>.<firma_b64url>".
// Módulo puro (sin next/headers) para poder usarlo desde proxy.ts, desde
// lib/auth/session.ts y en tests.

export const COOKIE_SESION = "se_sesion";

export type RolStaff = "admin" | "docente";

// El estudiante no tiene nombre en la BD: lo escribe al entrar (como en a2),
// viaja en la sesión y se copia a cada intento.
export type Sesion =
  | { tipo: "estudiante"; id: number; nombre: string }
  | { tipo: "staff"; id: number; rol: RolStaff };

// Duración de la sesión en segundos, según el tipo de usuario.
export const DURACION_SESION: Record<Sesion["tipo"], number> = {
  estudiante: 60 * 60 * 24 * 7, // 7 días
  staff: 60 * 60 * 12, // 12 horas
};

const payloadSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("estudiante"),
    id: z.number().int().positive(),
    nombre: z.string().min(1).max(120),
    exp: z.number().int(),
  }),
  z.object({
    tipo: z.literal("staff"),
    id: z.number().int().positive(),
    rol: z.enum(["admin", "docente"]),
    exp: z.number().int(),
  }),
]);

// Se lee en cada llamada (no al cargar el módulo) para que `next build` no
// falle si la variable aún no está definida en ese entorno.
// También firma los códigos de acceso (lib/auth/codigo.ts), con otra clave derivada.
export function secreto(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET no está definida o tiene menos de 32 caracteres",
    );
  }
  return s;
}

function firmar(cuerpo: string): string {
  return createHmac("sha256", secreto()).update(cuerpo).digest("base64url");
}

export function firmarSesion(sesion: Sesion, ahoraMs = Date.now()): string {
  const exp = Math.floor(ahoraMs / 1000) + DURACION_SESION[sesion.tipo];
  const cuerpo = Buffer.from(JSON.stringify({ ...sesion, exp })).toString(
    "base64url",
  );
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function verificarSesion(
  token: string,
  ahoraMs = Date.now(),
): Sesion | null {
  const [cuerpo, firma, sobra] = token.split(".");
  if (!cuerpo || !firma || sobra !== undefined) return null;

  // Comparación en tiempo constante.
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (
    recibida.length !== esperada.length ||
    !timingSafeEqual(recibida, esperada)
  ) {
    return null;
  }

  let datos: unknown;
  try {
    datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString());
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(datos);
  if (!parsed.success) return null;
  const d = parsed.data;
  if (d.exp <= Math.floor(ahoraMs / 1000)) return null;

  return d.tipo === "staff"
    ? { tipo: "staff", id: d.id, rol: d.rol }
    : { tipo: "estudiante", id: d.id, nombre: d.nombre };
}
