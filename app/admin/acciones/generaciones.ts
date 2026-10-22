"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guards";
import { aResultadoError, errorValidacion, type ResultadoAccion } from "@/lib/acciones";
import {
  actualizarGeneracion,
  cambiarActivaGeneracion,
  crearGeneracion,
  eliminarGeneracion,
  generarFaltantes,
  resumenEliminacion,
  type ResumenEliminacion,
} from "@/lib/datos/generaciones";
import { fechaSchema } from "@/lib/fechas";
import { idSchema } from "@/lib/validacion";

// Generaciones: solo admin (regla 6: el docente no toca generaciones).

// El código no se pide: crearGeneracion lo asigna a partir de la fecha de inicio.
const crearSchema = z
  .object({
    nombre: z.string().trim().min(1, "Escribe el nombre").max(120, "El nombre es demasiado largo"),
    fecha_inicio: z.string().min(1, "Elige la fecha de inicio").pipe(fechaSchema),
    fecha_fin: z
      .string()
      .trim()
      .transform((v) => v || null)
      .pipe(fechaSchema.nullable()),
  })
  .refine((d) => !d.fecha_fin || d.fecha_fin >= d.fecha_inicio, {
    message: "La fecha de fin debe ser posterior al inicio.",
    path: ["fecha_fin"],
  });

export async function crearGeneracionAction(datos: unknown): Promise<ResultadoAccion> {
  let id: number;
  try {
    const staff = await requireStaff(["admin"]);
    const p = crearSchema.safeParse(datos);
    if (!p.success) return errorValidacion(p.error.issues);
    id = (await crearGeneracion(p.data, staff.id)).id;
  } catch (e) {
    return aResultadoError(e);
  }
  redirect(`/admin/generaciones/${id}`);
}

export async function generarFaltantesAction(generacionId: unknown): Promise<ResultadoAccion> {
  try {
    const staff = await requireStaff(["admin"]);
    await generarFaltantes(idSchema.parse(generacionId), staff.id);
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

// Editar (Fase 6): nombre y fechas; el código no cambia (va en los slugs).
const editarSchema = z
  .object({
    nombre: z.string().trim().min(1, "Escribe el nombre").max(120, "El nombre es demasiado largo"),
    fecha_inicio: z.string().min(1, "Elige la fecha de inicio").pipe(fechaSchema),
    fecha_fin: z
      .string()
      .trim()
      .transform((v) => v || null)
      .pipe(fechaSchema.nullable()),
  })
  .refine((d) => !d.fecha_fin || d.fecha_fin >= d.fecha_inicio, {
    message: "La fecha de fin debe ser posterior al inicio.",
    path: ["fecha_fin"],
  });

export async function editarGeneracionAction(generacionId: unknown, datos: unknown): Promise<ResultadoAccion> {
  try {
    await requireStaff(["admin"]);
    const p = editarSchema.safeParse(datos);
    if (!p.success) return errorValidacion(p.error.issues);
    await actualizarGeneracion(idSchema.parse(generacionId), p.data);
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

// Desactivar no borra nada (ver lib/datos/generaciones.ts).
export async function cambiarActivaGeneracionAction(generacionId: unknown, activa: unknown): Promise<ResultadoAccion> {
  try {
    await requireStaff(["admin"]);
    await cambiarActivaGeneracion(idSchema.parse(generacionId), z.boolean().parse(activa));
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

// Eliminar (irreversible): el resumen se pide al abrir la confirmación (así está
// al día) y el borrado exige escribir el código de la generación.
export type ResultadoResumenEliminacion =
  | { ok: true; resumen: ResumenEliminacion }
  | { ok: false; error: string };

export async function resumenEliminacionAction(generacionId: unknown): Promise<ResultadoResumenEliminacion> {
  try {
    await requireStaff(["admin"]);
    const resumen = await resumenEliminacion(idSchema.parse(generacionId));
    return resumen ? { ok: true, resumen } : { ok: false, error: "La generación no existe." };
  } catch (e) {
    const r = aResultadoError(e);
    return { ok: false, error: r.ok ? "" : r.error };
  }
}

export async function eliminarGeneracionAction(generacionId: unknown, codigo: unknown): Promise<ResultadoAccion> {
  let nombre: string;
  try {
    await requireStaff(["admin"]);
    const r = await eliminarGeneracion(
      idSchema.parse(generacionId),
      z.string({ error: "Escribe el código" }).max(60).parse(codigo),
    );
    nombre = r.nombre;
  } catch (e) {
    return aResultadoError(e);
  }
  redirect(`/admin?eliminada=${encodeURIComponent(nombre)}`);
}
