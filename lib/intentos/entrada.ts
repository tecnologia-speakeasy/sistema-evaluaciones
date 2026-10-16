import { z } from "zod";

// Lo que manda el navegador mientras presenta: { [pregunta_id]: respuesta }.
// Texto (selección múltiple, traducción, abierta) o un texto por espacio (completar).
// Los límites solo frenan abusos; las preguntas que no son de la evaluación se
// ignoran al calificar.
export const respuestasSchema = z
  .record(
    z.string().regex(/^\d{1,9}$/, "Pregunta inválida"),
    z.union([z.string().max(5000, "Respuesta demasiado larga"), z.array(z.string().max(500)).max(30)]),
  )
  .refine((r) => Object.keys(r).length <= 500, "Demasiadas respuestas");

export const cambiosPestanaSchema = z.number().int().min(0).max(10_000);
