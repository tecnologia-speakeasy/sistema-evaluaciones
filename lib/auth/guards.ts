import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getSession } from "./session";
import type { RolStaff } from "./token";

// Autorización para Route Handlers, Server Actions y páginas.
// proxy.ts solo revisa la firma de la cookie; aquí además se vuelve a leer la BD,
// así un usuario desactivado (o con otro rol) pierde el acceso de inmediato
// aunque su cookie siga vigente. La sesión de staff además debe traer la
// sesion_version actual (restablecer la contraseña cierra las anteriores).

export type StaffActual = {
  id: number;
  email: string;
  nombre: string;
  rol: RolStaff;
  /** Entró con una contraseña temporal: debe cambiarla antes de usar el panel. */
  debe_cambiar_password: boolean;
};

export type EstudianteActual = {
  id: number;
  email: string;
  nombre: string;
  generacion_id: number;
  generacion_codigo: string;
  generacion_nombre: string;
  /** Generación desactivada: entra y ve su historial, pero no evaluaciones. */
  generacion_activa: boolean;
};

/** Pantalla del cambio obligatorio de contraseña (y de "Cambiar mi contraseña"). */
export const RUTA_CAMBIAR_PASSWORD = "/admin/cuenta/contrasena";

type OpcionesStaff = {
  /** Solo para cambiar la contraseña temporal: deja pasar a quien debe cambiarla. */
  permitirPasswordTemporal?: boolean;
};

export class ErrorAutorizacion extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "ErrorAutorizacion";
  }

  respuesta(): Response {
    return Response.json({ error: this.message }, { status: this.status });
  }
}

// cache(): si la página y sus componentes lo llaman varias veces en el mismo
// request, se consulta la BD una sola vez.
export const getStaffActual = cache(async (): Promise<StaffActual | null> => {
  const sesion = await getSession();
  if (sesion?.tipo !== "staff") return null;
  const { rows } = await query<StaffActual>(
    `SELECT id, email, nombre, rol, debe_cambiar_password
       FROM staff WHERE id = $1 AND activo AND sesion_version = $2`,
    [sesion.id, sesion.v],
  );
  return rows[0] ?? null;
});

// El nombre viene de la sesión (lo escribió al entrar); la BD confirma que sigue
// activo y de qué generación es.
export const getEstudianteActual = cache(
  async (): Promise<EstudianteActual | null> => {
    const sesion = await getSession();
    if (sesion?.tipo !== "estudiante") return null;
    const { rows } = await query<Omit<EstudianteActual, "nombre">>(
      `SELECT e.id, e.email, e.generacion_id, g.codigo AS generacion_codigo, g.nombre AS generacion_nombre,
              g.activa AS generacion_activa
         FROM estudiantes e
         JOIN generaciones g ON g.id = e.generacion_id
        WHERE e.id = $1 AND e.activo`,
      [sesion.id],
    );
    return rows[0] ? { ...rows[0], nombre: sesion.nombre } : null;
  },
);

// Uso en un Route Handler:
//   try { const staff = await requireStaff(["admin"]); ... }
//   catch (e) { if (e instanceof ErrorAutorizacion) return e.respuesta(); throw e; }
export async function requireStaff(
  roles: RolStaff[] = ["admin", "docente"],
  { permitirPasswordTemporal = false }: OpcionesStaff = {},
): Promise<StaffActual> {
  const staff = await getStaffActual();
  if (!staff) throw new ErrorAutorizacion(401, "Inicia sesión para continuar.");
  if (staff.debe_cambiar_password && !permitirPasswordTemporal) {
    throw new ErrorAutorizacion(403, "Cambia tu contraseña temporal para continuar.");
  }
  if (!roles.includes(staff.rol)) {
    throw new ErrorAutorizacion(403, "No tienes permiso para esta acción.");
  }
  return staff;
}

// Para páginas del dashboard: sin sesión de staff válida → al login; con
// contraseña temporal → a cambiarla primero.
export async function staffParaPagina({ permitirPasswordTemporal = false }: OpcionesStaff = {}): Promise<StaffActual> {
  const staff = await getStaffActual();
  if (!staff) redirect("/login?next=/admin");
  if (staff.debe_cambiar_password && !permitirPasswordTemporal) redirect(RUTA_CAMBIAR_PASSWORD);
  return staff;
}

// Para páginas del estudiante: sin sesión válida → al login, y de vuelta aquí.
export async function estudianteParaPagina(volverA = "/"): Promise<EstudianteActual> {
  const estudiante = await getEstudianteActual();
  if (!estudiante) redirect(volverA === "/" ? "/login" : `/login?next=${encodeURIComponent(volverA)}`);
  return estudiante;
}

export async function requireEstudiante(): Promise<EstudianteActual> {
  const estudiante = await getEstudianteActual();
  if (!estudiante) {
    throw new ErrorAutorizacion(401, "Inicia sesión para continuar.");
  }
  return estudiante;
}
