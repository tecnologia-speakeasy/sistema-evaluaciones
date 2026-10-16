import { z } from "zod";

// Esquemas de entrada compartidos (route handlers, scripts, import CSV).

export const emailSchema = z
  .string({ error: "Escribe tu correo" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Correo inválido").max(254, "Correo demasiado largo"));
