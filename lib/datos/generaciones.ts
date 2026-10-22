import { query, transaction, type Tx } from "@/lib/db";
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

// El código no lo escribe el admin: se asigna solo al crear la generación.
// gen-AAAA-MM según la fecha de inicio y, si ya hay otra con ese código (dos el
// mismo mes), gen-AAAA-MM-2, -3… Va en el enlace de cada evaluación y no cambia
// después; solo se pide escribirlo para confirmar que se elimina.
export const codigoBase = (fechaInicio: string) => `gen-${fechaInicio.slice(0, 7)}`;

async function codigoLibre(tx: Tx, fechaInicio: string): Promise<string> {
  const base = codigoBase(fechaInicio);
  const { rows } = await tx.query<{ codigo: string }>(
    `SELECT codigo FROM generaciones WHERE codigo = $1 OR codigo LIKE $1 || '-%'`,
    [base],
  );
  const usados = new Set(rows.map((r) => r.codigo));
  let codigo = base;
  for (let n = 2; usados.has(codigo); n++) codigo = `${base}-${n}`;
  return codigo;
}

// Crea la generación (con su código) y sus 17 evaluaciones en la misma
// transacción: nunca queda una generación a medias.
export async function crearGeneracion(
  datos: { nombre: string; fecha_inicio: string; fecha_fin: string | null },
  staffId: number,
): Promise<{ id: number; codigo: string }> {
  return transaction(async (tx) => {
    // Dos creaciones a la vez no deben elegir el mismo código: se ponen en fila.
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('crear-generacion'))`);
    const codigo = await codigoLibre(tx, datos.fecha_inicio);
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO generaciones (codigo, nombre, fecha_inicio, fecha_fin)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [codigo, datos.nombre, datos.fecha_inicio, datos.fecha_fin],
    );
    const id = rows[0].id;
    await tx.query(`SELECT generar_evaluaciones($1, $2)`, [id, staffId]);
    return { id, codigo };
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

// ---------------------------------------------------------------------------
// Eliminar (solo admin). Irreversible: borra la generación, sus evaluaciones con
// sus preguntas, sus estudiantes y TODOS los intentos con sus resultados (los de
// sus evaluaciones y los que sus estudiantes tengan en otras). Antes se muestra
// este resumen y se pide escribir el código de la generación.
// ---------------------------------------------------------------------------

export type ResumenEliminacion = {
  codigo: string;
  nombre: string;
  evaluaciones: number;
  preguntas: number;
  estudiantes: number;
  intentos: number;
};

const SQL_RESUMEN = `
  SELECT g.codigo, g.nombre,
         (SELECT count(*)::int FROM evaluaciones e WHERE e.generacion_id = g.id) AS evaluaciones,
         (SELECT count(*)::int FROM preguntas p JOIN evaluaciones e ON e.id = p.evaluacion_id
           WHERE e.generacion_id = g.id) AS preguntas,
         (SELECT count(*)::int FROM estudiantes s WHERE s.generacion_id = g.id) AS estudiantes,
         (SELECT count(*)::int FROM intentos i
           WHERE i.evaluacion_id IN (SELECT id FROM evaluaciones WHERE generacion_id = g.id)
              OR i.estudiante_id IN (SELECT id FROM estudiantes WHERE generacion_id = g.id)) AS intentos
    FROM generaciones g WHERE g.id = $1`;

export async function resumenEliminacion(id: number): Promise<ResumenEliminacion | null> {
  const { rows } = await query<ResumenEliminacion>(SQL_RESUMEN, [id]);
  return rows[0] ?? null;
}

// Todo en una transacción. El orden importa: respuestas → preguntas es RESTRICT,
// así que primero salen los intentos de sus evaluaciones (con sus respuestas),
// luego sus estudiantes (con sus demás intentos y códigos de acceso) y al final
// la generación (con sus evaluaciones y preguntas, en cascada).
export async function eliminarGeneracion(id: number, codigoConfirmado: string): Promise<ResumenEliminacion> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<{ codigo: string }>(`SELECT codigo FROM generaciones WHERE id = $1 FOR UPDATE`, [
      id,
    ]);
    if (!rows[0]) throw new ErrorNegocio("La generación no existe.");
    if (rows[0].codigo !== codigoConfirmado.trim()) {
      throw new ErrorNegocio(`Escribe exactamente el código «${rows[0].codigo}» para confirmar.`, "codigo");
    }
    const { rows: resumen } = await tx.query<ResumenEliminacion>(SQL_RESUMEN, [id]);
    await tx.query(
      `DELETE FROM intentos WHERE evaluacion_id IN (SELECT id FROM evaluaciones WHERE generacion_id = $1)`,
      [id],
    );
    await tx.query(`DELETE FROM estudiantes WHERE generacion_id = $1`, [id]);
    await tx.query(`DELETE FROM generaciones WHERE id = $1`, [id]);
    return resumen[0];
  });
}
