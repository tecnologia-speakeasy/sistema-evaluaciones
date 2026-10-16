import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { DIGITOS_CODIGO } from "./codigo-compartido";
import { secreto } from "./token";

// Código de acceso de un solo uso (OTP) para estudiantes. Módulo puro (sin BD
// ni next/headers) para poder probarlo; el flujo está en acceso-estudiante.ts.

// "048213": siempre 6 dígitos, con crypto (no Math.random).
export function generarCodigo(): string {
  return randomInt(0, 10 ** DIGITOS_CODIGO)
    .toString()
    .padStart(DIGITOS_CODIGO, "0");
}

// HMAC-SHA256 con una clave derivada de SESSION_SECRET. No scrypt: con 6 dígitos
// solo hay un millón de códigos, y cualquier hash sin clave (por lento que sea)
// se adivina fuera de línea si se filtra la base; sin el secreto, el HMAC no.
// Va ligado al estudiante: el mismo código de otro estudiante da otro hash.
export function hashCodigo(estudianteId: number, codigo: string): string {
  const clave = createHmac("sha256", secreto()).update("codigo-acceso").digest();
  return createHmac("sha256", clave).update(`${estudianteId}:${codigo}`).digest("base64url");
}

// Comparación en tiempo constante.
export function codigoCoincide(estudianteId: number, codigo: string, hashGuardado: string): boolean {
  const guardado = Buffer.from(hashGuardado);
  const recibido = Buffer.from(hashCodigo(estudianteId, codigo));
  return guardado.length === recibido.length && timingSafeEqual(guardado, recibido);
}

// OTP_ACTIVO=true: el estudiante entra con un código que le llega por correo.
// Por defecto (false): entra solo con correo + nombre, como en a2.
export function otpActivo(env: Record<string, string | undefined> = process.env): boolean {
  return /^(true|1|si|sí)$/i.test(env.OTP_ACTIVO?.trim() ?? "");
}

// Límites de envío de códigos (protegen el cupo diario del SMTP):
//   OTP_MAX_ENVIOS_POR_CORREO (3) y OTP_MAX_ENVIOS_POR_IP (30)
//   cada OTP_VENTANA_ENVIOS_MIN (15) minutos.
// El de IP es más alto porque un salón o el club comparten la misma red.
export type LimitesEnvio = { porCorreo: number; porIp: number; ventanaMin: number };

export function limitesEnvio(env: Record<string, string | undefined> = process.env): LimitesEnvio {
  return {
    porCorreo: enteroPositivo(env, "OTP_MAX_ENVIOS_POR_CORREO", 3),
    porIp: enteroPositivo(env, "OTP_MAX_ENVIOS_POR_IP", 30),
    ventanaMin: enteroPositivo(env, "OTP_VENTANA_ENVIOS_MIN", 15),
  };
}

function enteroPositivo(env: Record<string, string | undefined>, nombre: string, porDefecto: number): number {
  const valor = env[nombre]?.trim();
  if (!valor) return porDefecto;
  const n = Number(valor);
  if (Number.isInteger(n) && n > 0) return n;
  console.warn(`[codigo-acceso] ${nombre}="${valor}" no es un entero positivo; se usa ${porDefecto}.`);
  return porDefecto;
}
