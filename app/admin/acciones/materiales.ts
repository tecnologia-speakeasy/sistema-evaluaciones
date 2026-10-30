"use server";

import { refresh } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { aResultadoError, type ResultadoAccion } from "@/lib/acciones";
import * as datos from "@/lib/datos/materiales";
import { aFilaMaterial, entradaMaterialSchema } from "@/lib/preguntas/materiales";
import { idSchema } from "@/lib/validacion";

// Lecturas y audios (db/009): admin y docente, como las preguntas. Cada action
// autoriza y valida por su cuenta; los errores salen como { ok: false, error, campo? }.

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

/** materialId = null → crear en la evaluación. */
export async function guardarMaterialAction(
  evaluacionId: unknown,
  materialId: unknown,
  entrada: unknown,
): Promise<ResultadoAccion> {
  return ejecutar(async () => {
    const fila = aFilaMaterial(entradaMaterialSchema.parse(entrada));
    if (materialId === null) {
      await datos.crearMaterial(idSchema.parse(evaluacionId), fila);
    } else {
      await datos.actualizarMaterial(idSchema.parse(materialId), fila);
    }
  });
}

export async function eliminarMaterialAction(materialId: unknown) {
  return ejecutar(() => datos.eliminarMaterial(idSchema.parse(materialId)));
}
