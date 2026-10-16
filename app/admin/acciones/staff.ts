"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guards";
import { estaBloqueado, registrarIntento, VENTANA_MIN } from "@/lib/auth/login-intentos";
import { setSession } from "@/lib/auth/session";
import { aResultadoError, errorValidacion, type ResultadoAccion } from "@/lib/acciones";
import * as datos from "@/lib/datos/staff";
import { ErrorNegocio } from "@/lib/errores";
import { emailSchema, idSchema } from "@/lib/validacion";

// Staff: solo admin (regla 6), salvo "Cambiar mi contraseña" (cualquiera del
// staff, también con la contraseña temporal pendiente). Las reglas de "a sí
// mismo" y "al menos un admin" viven en lib/datos/staff.ts.

const rolSchema = z.enum(["admin", "docente"], { error: "Elige el rol" });

const crearSchema = z.object({
  email: emailSchema,
  nombre: z.string().trim().min(2, "Escribe el nombre").max(120, "El nombre es demasiado largo"),
  rol: rolSchema,
});

export type ResultadoConPassword = { ok: true; password: string } | { ok: false; error: string; campo?: string };

function fallo(e: unknown): Extract<ResultadoAccion, { ok: false }> {
  const r = aResultadoError(e);
  return r.ok ? { ok: false, error: "" } : r;
}

export async function crearStaffAction(entrada: unknown): Promise<ResultadoConPassword> {
  let password: string;
  try {
    await requireStaff(["admin"]);
    const p = crearSchema.safeParse(entrada);
    if (!p.success) return errorValidacion(p.error.issues);
    ({ password } = await datos.crearStaff(p.data));
  } catch (e) {
    return fallo(e);
  }
  refresh();
  return { ok: true, password };
}

export async function cambiarRolStaffAction(id: unknown, rol: unknown): Promise<ResultadoAccion> {
  try {
    const actor = await requireStaff(["admin"]);
    await datos.cambiarRolStaff(actor.id, idSchema.parse(id), rolSchema.parse(rol));
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

export async function cambiarActivoStaffAction(id: unknown, activo: unknown): Promise<ResultadoAccion> {
  try {
    const actor = await requireStaff(["admin"]);
    await datos.cambiarActivoStaff(actor.id, idSchema.parse(id), z.boolean().parse(activo));
  } catch (e) {
    return aResultadoError(e);
  }
  refresh();
  return { ok: true };
}

export async function restablecerPasswordAction(id: unknown): Promise<ResultadoConPassword> {
  let password: string;
  try {
    const actor = await requireStaff(["admin"]);
    password = await datos.restablecerPasswordStaff(actor.id, idSchema.parse(id));
  } catch (e) {
    return fallo(e);
  }
  refresh();
  return { ok: true, password };
}

const cambiarSchema = z
  .object({
    actual: z.string().min(1, "Escribe tu contraseña actual").max(200),
    nueva: z.string().max(200, "La contraseña es demasiado larga"),
    confirmacion: z.string().max(200),
  })
  .refine((d) => d.nueva === d.confirmacion, { message: "Las contraseñas no coinciden.", path: ["confirmacion"] });

// Cierra las demás sesiones de esta persona y renueva la de este navegador.
// Un fallo en la contraseña actual cuenta como intento de login fallido.
export async function cambiarMiPasswordAction(entrada: unknown): Promise<ResultadoAccion> {
  try {
    const staff = await requireStaff(undefined, { permitirPasswordTemporal: true });
    const p = cambiarSchema.safeParse(entrada);
    if (!p.success) return errorValidacion(p.error.issues);
    if (await estaBloqueado(staff.email)) {
      return { ok: false, error: `Demasiados intentos fallidos. Espera ${VENTANA_MIN} minutos e inténtalo de nuevo.` };
    }
    try {
      const r = await datos.cambiarMiPassword(staff.id, p.data.actual, p.data.nueva);
      await setSession({ tipo: "staff", id: staff.id, rol: r.rol, v: r.sesion_version });
    } catch (e) {
      if (e instanceof ErrorNegocio && e.campo === "actual") await registrarIntento(staff.email, null, false);
      throw e;
    }
  } catch (e) {
    return aResultadoError(e);
  }
  return { ok: true };
}
