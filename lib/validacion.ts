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
