"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guards";
import { aResultadoError, type ResultadoAccion } from "@/lib/acciones";
import * as datos from "@/lib/datos/preguntas";
import { aFila, entradaPreguntaSchema } from "@/lib/preguntas/entrada";
import { entradaVariantesSchema } from "@/lib/preguntas/variantes";
import { idSchema } from "@/lib/validacion";

// Preguntas: admin y docente. Cada action autoriza y valida por su cuenta;
// los errores (zod, negocio, BD) salen como { ok: false, error, campo? }.

async function ejecutar(fn: () => Promise<unknown>): Promise<ResultadoAccion> {
  try {
    await requireStaff();
    await fn();
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

/** preguntaId = null → crear al final de la evaluación. */
export async function guardarPreguntaAction(
  evaluacionId: unknown,
  preguntaId: unknown,
  entrada: unknown,
): Promise<ResultadoAccion> {
  return ejecutar(async () => {
    const fila = aFila(entradaPreguntaSchema.parse(entrada));
    if (preguntaId === null) {
      await datos.crearPregunta(idSchema.parse(evaluacionId), fila);
    } else {
      await datos.actualizarPregunta(idSchema.parse(preguntaId), fila);
    }
  });
}

export async function agregarVariantesAction(preguntaId: unknown, entrada: unknown) {
  return ejecutar(() =>
    datos.agregarVariantes(idSchema.parse(preguntaId), entradaVariantesSchema.parse(entrada)),
  );
}

export async function cambiarActivaAction(preguntaId: unknown, activa: unknown) {
  return ejecutar(() =>
    datos.cambiarActiva(idSchema.parse(preguntaId), z.boolean().parse(activa)),
  );
}

export async function eliminarPreguntaAction(preguntaId: unknown) {
  return ejecutar(() => datos.eliminarPregunta(idSchema.parse(preguntaId)));
}

export async function duplicarPreguntaAction(preguntaId: unknown) {
  return ejecutar(() => datos.duplicarPregunta(idSchema.parse(preguntaId)));
}

export async function reordenarPreguntasAction(evaluacionId: unknown, ids: unknown) {
  return ejecutar(() =>
    datos.reordenarPreguntas(idSchema.parse(evaluacionId), z.array(idSchema).max(500).parse(ids)),
  );
}

export async function clonarPreguntasAction(destinoId: unknown, origenId: unknown) {
  return ejecutar(() =>
    datos.clonarPreguntas(idSchema.parse(origenId), idSchema.parse(destinoId)),
  );
}
