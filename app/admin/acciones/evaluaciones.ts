"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guards";
import { aResultadoError, errorValidacion, type ResultadoAccion } from "@/lib/acciones";
import { actualizarConfig, cambiarPublicada } from "@/lib/datos/evaluaciones";
import { fechaHoraLocalSchema } from "@/lib/fechas";
import { idSchema } from "@/lib/validacion";

// Evaluaciones: admin y docente.

// "" = sin límite (NULL); si no, entero entre 1 y max.
function enteroOpcional(nombre: string, max: number) {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(
      z
        .number({ error: `${nombre}: escribe un número` })
        .int(`${nombre}: escribe un número entero`)
        .min(1, `${nombre}: mínimo 1 (o vacío para sin límite)`)
        .max(max, `${nombre}: máximo ${max}`)
        .nullable(),
    );
}

const configSchema = z.object({
  titulo: z.string().trim().min(1, "Escribe el título").max(200, "El título es demasiado largo"),
  descripcion: z
    .string()
    .trim()
    .max(2000, "La descripción es demasiado larga")
    .transform((v) => v || null),
  apertura: fechaHoraLocalSchema,
  cierre: fechaHoraLocalSchema,
  duracion_min: enteroOpcional("Duración", 1440),
  intentos_permitidos: enteroOpcional("Intentos", 100),
});

export type DatosConfig = z.input<typeof configSchema>;

export async function guardarConfigAction(
  evaluacionId: unknown,
  datos: unknown,
): Promise<ResultadoAccion> {
  try {
    await requireStaff();
    const p = configSchema.safeParse(datos);
    if (!p.success) return errorValidacion(p.error.issues);
    await actualizarConfig(idSchema.parse(evaluacionId), p.data);
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

export async function cambiarPublicadaAction(
  evaluacionId: unknown,
  publicada: unknown,
): Promise<ResultadoAccion> {
  try {
    await requireStaff();
    await cambiarPublicada(idSchema.parse(evaluacionId), z.boolean().parse(publicada));
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}
