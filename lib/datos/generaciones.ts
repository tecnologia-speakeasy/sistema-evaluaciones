import { query, transaction } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";

// Consultas de generaciones. Sin autorización: la hacen las Server Actions/páginas.
// Las fechas DATE se leen como texto para que no se corran por la zona horaria.

export type Generacion = {
  id: number;
  codigo: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  activa: boolean;
};

export type GeneracionResumen = Generacion & {
  evaluaciones: number;
  publicadas: number;
  estudiantes: number;
};

const COLUMNAS = `g.id, g.codigo, g.nombre, g.fecha_inicio::text AS fecha_inicio,
                  g.fecha_fin::text AS fecha_fin, g.activa`;

export async function listarGeneraciones(): Promise<GeneracionResumen[]> {
  const { rows } = await query<GeneracionResumen>(
    `SELECT ${COLUMNAS},
            (SELECT count(*)::int FROM evaluaciones e WHERE e.generacion_id = g.id) AS evaluaciones,
            (SELECT count(*)::int FROM evaluaciones e
              WHERE e.generacion_id = g.id AND e.publicada)                          AS publicadas,
            (SELECT count(*)::int FROM estudiantes s
              WHERE s.generacion_id = g.id AND s.activo)                             AS estudiantes
       FROM generaciones g
      ORDER BY g.fecha_inicio DESC, g.id DESC`,
  );
  return rows;
}

export async function obtenerGeneracion(id: number): Promise<Generacion | null> {
  const { rows } = await query<Generacion>(
    `SELECT ${COLUMNAS} FROM generaciones g WHERE g.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// Crea la generación y sus 16 evaluaciones en la misma transacción: nunca queda
// una generación a medias.
export async function crearGeneracion(
  datos: { codigo: string; nombre: string; fecha_inicio: string; fecha_fin: string | null },
  staffId: number,
): Promise<number> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO generaciones (codigo, nombre, fecha_inicio, fecha_fin)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [datos.codigo, datos.nombre, datos.fecha_inicio, datos.fecha_fin],
    );
    const id = rows[0].id;
    await tx.query(`SELECT generar_evaluaciones($1, $2)`, [id, staffId]);
    return id;
  });
}

// Crea las evaluaciones que falten (generar_evaluaciones es idempotente).
export async function generarFaltantes(id: number, staffId: number): Promise<number> {
  const { rows } = await query<{ creadas: number }>(
    `SELECT generar_evaluaciones($1, $2) AS creadas`,
    [id, staffId],
  );
  return rows[0].creadas;
}

// Editar (Fase 6): nombre y fechas. El código no se edita: va en el slug de cada
// evaluación.
export async function actualizarGeneracion(
  id: number,
  datos: { nombre: string; fecha_inicio: string; fecha_fin: string | null },
): Promise<void> {
  const { rowCount } = await query(
    `UPDATE generaciones SET nombre = $2, fecha_inicio = $3, fecha_fin = $4 WHERE id = $1`,
    [id, datos.nombre, datos.fecha_inicio, datos.fecha_fin],
  );
  if (!rowCount) throw new ErrorNegocio("La generación no existe.");
}

// Desactivar no borra nada: sus estudiantes entran y ven su historial, pero no
// ven evaluaciones ni empiezan o continúan intentos (también validar_intento).
// Los intentos en curso se conservan y se retoman al reactivarla.
export async function cambiarActivaGeneracion(id: number, activa: boolean): Promise<void> {
  const { rowCount } = await query(`UPDATE generaciones SET activa = $2 WHERE id = $1`, [id, activa]);
  if (!rowCount) throw new ErrorNegocio("La generación no existe.");
}

// Lo que se muestra antes de desactivar.
export async function resumenGeneracion(id: number): Promise<{ estudiantes: number; en_curso: number }> {
  const { rows } = await query<{ estudiantes: number; en_curso: number }>(
    `SELECT (SELECT count(*)::int FROM estudiantes s WHERE s.generacion_id = $1 AND s.activo) AS estudiantes,
            (SELECT count(*)::int FROM intentos i JOIN evaluaciones e ON e.id = i.evaluacion_id
              WHERE e.generacion_id = $1 AND i.estado = 'en_progreso') AS en_curso`,
    [id],
  );
  return rows[0];
}
