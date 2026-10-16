import { z } from "zod";

// Esquemas de entrada compartidos (route handlers, scripts, import CSV).

// IDs que llegan del navegador (Server Actions) o de la URL.
export const idSchema = z
  .number({ error: "Identificador inválido" })
  .int("Identificador inválido")
  .positive("Identificador inválido");
export const idUrlSchema = z.coerce.number().int().positive();

export const emailSchema = z
  .string({ error: "Escribe tu correo" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Correo inválido").max(254, "Correo demasiado largo"));

// Nombre que escribe el estudiante al entrar (como en a2). Se guarda tal cual lo
// escribe (sin cambiar mayúsculas), solo sin espacios de sobra.
export const nombreSchema = z
  .string({ error: "Escribe tu nombre" })
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(2, "Escribe tu nombre").max(120, "Nombre demasiado largo"));
