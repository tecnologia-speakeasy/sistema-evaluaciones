import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Hash de contraseñas del staff con scrypt.
// Formato guardado en staff.password_hash: "scrypt$<salt_b64>$<hash_b64>".
// Sin "server-only": lo usa también scripts/crear-admin.ts desde Node.

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

// Hash con formato válido que nunca coincide con nada. Sirve para ejecutar el
// mismo scrypt cuando el correo no existe, así el tiempo de respuesta no lo delata.
export const HASH_RELLENO =
  "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password, salt, KEY_BYTES);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  guardado: string,
): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const salt = Buffer.from(partes[1], "base64");
  const esperado = Buffer.from(partes[2], "base64");
  if (salt.length === 0 || esperado.length === 0) return false;

  const hash = await scryptAsync(password, salt, esperado.length);
  return timingSafeEqual(hash, esperado);
}
