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
  generarFaltantes,
} from "@/lib/datos/generaciones";
import { fechaSchema } from "@/lib/fechas";
import { idSchema } from "@/lib/validacion";

// Generaciones: solo admin (regla 6: el docente no toca generaciones).

const crearSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Escribe el código")
      .max(40, "El código es demasiado largo")
      .regex(/^[a-z0-9-]+$/, "Usa solo minúsculas, números y guiones (ej. gen-2026-10)."),
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
    id = await crearGeneracion(p.data, staff.id);
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
