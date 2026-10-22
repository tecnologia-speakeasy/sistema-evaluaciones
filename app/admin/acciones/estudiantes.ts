"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guards";
import { aResultadoError, type ResultadoAccion } from "@/lib/acciones";
import * as datos from "@/lib/datos/estudiantes";
import { analizarCsvEstudiantes, MAX_BYTES_CSV, type FilaDuplicada, type FilaInvalida } from "@/lib/estudiantes/importar";
import { emailSchema, idSchema } from "@/lib/validacion";

// Estudiantes: solo admin (regla 6). Uno a uno: agregar, editar y eliminar. El
// CSV se lee en el navegador y llega como texto; aquí se vuelve a analizar todo,
// tanto en la vista previa como al confirmar (nunca se confía en lo que mostró
// el navegador).

// Margen sobre 1 MB: el límite exacto (en bytes) lo revisa el análisis.
const textoCsv = z.string().max(MAX_BYTES_CSV + 1024, "El archivo pesa más de 1 MB. Divídelo en partes.");

const error = (e: unknown) => {
  const r = aResultadoError(e);
  return { ok: false as const, error: r.ok ? "" : r.error };
};

export type VistaPreviaCsv =
  | {
      ok: true;
      conEncabezado: boolean;
      separador: "," | ";";
      clasificacion: datos.Clasificacion;
      invalidas: FilaInvalida[];
      duplicadas: FilaDuplicada[];
    }
  | { ok: false; error: string };

export async function previsualizarCsvAction(generacionId: unknown, texto: unknown): Promise<VistaPreviaCsv> {
  try {
    await requireStaff(["admin"]);
    const id = idSchema.parse(generacionId);
    const a = analizarCsvEstudiantes(textoCsv.parse(texto));
    if (!a.ok) return a;
    return {
      ok: true,
      conEncabezado: a.conEncabezado,
      separador: a.separador,
      clasificacion: await datos.previsualizarImportacion(id, a.validas),
      invalidas: a.invalidas,
      duplicadas: a.duplicadas,
    };
  } catch (e) {
    return error(e);
  }
}

export type ResultadoImportarCsv = { ok: true; resultado: datos.ResultadoImportacion } | { ok: false; error: string };

export async function importarCsvAction(generacionId: unknown, texto: unknown): Promise<ResultadoImportarCsv> {
  let resultado: datos.ResultadoImportacion;
  try {
    await requireStaff(["admin"]);
    const id = idSchema.parse(generacionId);
    const a = analizarCsvEstudiantes(textoCsv.parse(texto));
    if (!a.ok) return a;
    resultado = await datos.importarEstudiantes(id, a.validas);
  } catch (e) {
    return error(e);
  }
  refresh();
  return { ok: true, resultado };
}

async function ejecutar(fn: () => Promise<unknown>): Promise<ResultadoAccion> {
  try {
    await requireStaff(["admin"]);
    await fn();
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

export async function cambiarActivoEstudianteAction(id: unknown, activo: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => datos.cambiarActivoEstudiante(idSchema.parse(id), z.boolean().parse(activo)));
}

const datosSchema = z.object({ email: emailSchema, generacionId: idSchema });

// Un error de zod llega al formulario con su campo (aResultadoError).
export async function crearEstudianteAction(entrada: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => datos.crearEstudiante(datosSchema.parse(entrada)));
}

export async function actualizarEstudianteAction(id: unknown, entrada: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => datos.actualizarEstudiante(idSchema.parse(id), datosSchema.parse(entrada)));
}

export type ResultadoResumenEstudiante =
  | { ok: true; resumen: { email: string; intentos: number } }
  | { ok: false; error: string };

export async function resumenEliminarEstudianteAction(id: unknown): Promise<ResultadoResumenEstudiante> {
  try {
    await requireStaff(["admin"]);
    const resumen = await datos.resumenEliminarEstudiante(idSchema.parse(id));
    if (!resumen) return { ok: false, error: "El estudiante no existe." };
    return { ok: true, resumen };
  } catch (e) {
    return error(e);
  }
}

export async function eliminarEstudianteAction(id: unknown): Promise<ResultadoAccion> {
  return ejecutar(() => datos.eliminarEstudiante(idSchema.parse(id)));
}
