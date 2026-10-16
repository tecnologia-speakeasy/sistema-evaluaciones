import "server-only";
import { cache } from "react";
import { query } from "@/lib/db";
import { getSession } from "./session";
import type { RolStaff } from "./token";

// Autorización para Route Handlers, Server Actions y páginas.
// proxy.ts solo revisa la firma de la cookie; aquí además se vuelve a leer la BD,
// así un usuario desactivado (o con otro rol) pierde el acceso de inmediato
// aunque su cookie siga vigente.

export type StaffActual = {
  id: number;
  email: string;
  nombre: string;
  rol: RolStaff;
};

export type EstudianteActual = {
  id: number;
  email: string;
  nombre: string;
  generacion_id: number;
  generacion_nombre: string;
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
    `SELECT id, email, nombre, rol FROM staff WHERE id = $1 AND activo`,
    [sesion.id],
  );
  return rows[0] ?? null;
});

export const getEstudianteActual = cache(
  async (): Promise<EstudianteActual | null> => {
    const sesion = await getSession();
    if (sesion?.tipo !== "estudiante") return null;
    const { rows } = await query<EstudianteActual>(
      `SELECT e.id, e.email, e.nombre, e.generacion_id,
              g.nombre AS generacion_nombre
         FROM estudiantes e
         JOIN generaciones g ON g.id = e.generacion_id
        WHERE e.id = $1 AND e.activo`,
      [sesion.id],
    );
    return rows[0] ?? null;
  },
);

// Uso en un Route Handler:
//   try { const staff = await requireStaff(["admin"]); ... }
//   catch (e) { if (e instanceof ErrorAutorizacion) return e.respuesta(); throw e; }
export async function requireStaff(
  roles: RolStaff[] = ["admin", "docente"],
): Promise<StaffActual> {
  const staff = await getStaffActual();
  if (!staff) throw new ErrorAutorizacion(401, "Inicia sesión para continuar.");
  if (!roles.includes(staff.rol)) {
    throw new ErrorAutorizacion(403, "No tienes permiso para esta acción.");
  }
  return staff;
}

export async function requireEstudiante(): Promise<EstudianteActual> {
  const estudiante = await getEstudianteActual();
  if (!estudiante) {
    throw new ErrorAutorizacion(401, "Inicia sesión para continuar.");
  }
  return estudiante;
}
