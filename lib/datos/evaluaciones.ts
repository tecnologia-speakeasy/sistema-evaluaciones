import { query } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import { sqlALocal, sqlDesdeLocal } from "@/lib/fechas";
import type { EstadoEvaluacion, TipoEvaluacion } from "@/lib/tipos";

// Consultas de evaluaciones. Sin autorización: la hacen las Server Actions/páginas.
// apertura/cierre viajan como texto "YYYY-MM-DDTHH:MM" en hora de Colombia.

export type ConfigEvaluacion = {
  titulo: string;
  descripcion: string | null;
  apertura: string | null;
  cierre: string | null;
  duracion_min: number | null;
  intentos_permitidos: number | null;
  /** Al acabar el tiempo se envía sola (exige duracion_min). */
  cierre_automatico: boolean;
  /** En el resultado, la correcta de las que falló (cuando ya no le quedan
   *  intentos o la evaluación cerró). */
  mostrar_correctas: boolean;
};

export type EvaluacionResumen = ConfigEvaluacion & {
  id: number;
  generacion_id: number;
  slug: string;
  tipo: TipoEvaluacion;
  numero: number;
  publicada: boolean;
  estado: EstadoEvaluacion;
  preguntas: number;
  intentos: number;
  promedio: number | null;
};

export type Evaluacion = EvaluacionResumen & {
  generacion_codigo: string;
  generacion_nombre: string;
};

// Estado visible, calculado con el reloj de la BD.
const ESTADO = `CASE
    WHEN NOT e.publicada                                       THEN 'borrador'
    WHEN e.fecha_apertura IS NOT NULL AND e.fecha_apertura > now() THEN 'programada'
    WHEN e.fecha_cierre   IS NOT NULL AND e.fecha_cierre   < now() THEN 'cerrada'
    ELSE 'abierta' END`;

// v_evaluaciones_resumen trae los conteos; evaluaciones, la configuración.
const COLUMNAS_RESUMEN = `
  e.id, e.generacion_id, e.slug, e.tipo, e.numero, e.publicada, e.titulo, e.descripcion,
  ${sqlALocal("e.fecha_apertura")} AS apertura,
  ${sqlALocal("e.fecha_cierre")}   AS cierre,
  e.duracion_min, e.intentos_permitidos, e.cierre_automatico, e.mostrar_correctas,
  ${ESTADO} AS estado,
  r.preguntas::int AS preguntas, r.intentos::int AS intentos,
  r.promedio::float8 AS promedio`;

export async function listarPorGeneracion(generacionId: number): Promise<EvaluacionResumen[]> {
  const { rows } = await query<EvaluacionResumen>(
    `SELECT ${COLUMNAS_RESUMEN}
       FROM evaluaciones e
       JOIN v_evaluaciones_resumen r ON r.id = e.id
      WHERE e.generacion_id = $1
      ORDER BY e.tipo, e.numero`,
    [generacionId],
  );
  return rows;
}

export async function obtenerEvaluacion(id: number): Promise<Evaluacion | null> {
  const { rows } = await query<Evaluacion>(
    `SELECT ${COLUMNAS_RESUMEN},
            g.codigo AS generacion_codigo, g.nombre AS generacion_nombre
       FROM evaluaciones e
       JOIN v_evaluaciones_resumen r ON r.id = e.id
       JOIN generaciones g           ON g.id = e.generacion_id
      WHERE e.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function actualizarConfig(id: number, c: ConfigEvaluacion): Promise<void> {
  const { rowCount } = await query(
    `UPDATE evaluaciones
        SET titulo = $2, descripcion = $3,
            fecha_apertura = ${sqlDesdeLocal("$4")},
            fecha_cierre   = ${sqlDesdeLocal("$5")},
            duracion_min = $6, intentos_permitidos = $7,
            cierre_automatico = $8, mostrar_correctas = $9
      WHERE id = $1`,
    [
      id, c.titulo, c.descripcion, c.apertura, c.cierre, c.duracion_min, c.intentos_permitidos,
      c.cierre_automatico, c.mostrar_correctas,
    ],
  );
  if (!rowCount) throw new ErrorNegocio("La evaluación no existe.");
}

// Publicar exige al menos una pregunta activa (se comprueba en la misma sentencia).
export async function cambiarPublicada(id: number, publicada: boolean): Promise<void> {
  const { rowCount } = await query(
    `UPDATE evaluaciones e
        SET publicada = $2
      WHERE e.id = $1
        AND (NOT $2 OR EXISTS (SELECT 1 FROM preguntas p WHERE p.evaluacion_id = e.id AND p.activa))`,
    [id, publicada],
  );
  if (!rowCount) {
    throw new ErrorNegocio(
      publicada
        ? "Agrega al menos una pregunta activa antes de publicar."
        : "La evaluación no existe.",
    );
  }
}

export type CandidataClonar = {
  id: number;
  titulo: string;
  generacion_codigo: string;
  generacion_nombre: string;
  preguntas: number;
};

// Evaluaciones de cualquier generación con preguntas activas para copiar.
export async function candidatasParaClonar(destinoId: number): Promise<CandidataClonar[]> {
  const { rows } = await query<CandidataClonar>(
    `SELECT e.id, e.titulo, g.codigo AS generacion_codigo, g.nombre AS generacion_nombre,
            count(p.id)::int AS preguntas
       FROM evaluaciones e
       JOIN generaciones g ON g.id = e.generacion_id
       JOIN preguntas p    ON p.evaluacion_id = e.id AND p.activa
      WHERE e.id <> $1
      GROUP BY e.id, g.id
      ORDER BY g.fecha_inicio DESC, g.id DESC, e.tipo, e.numero`,
    [destinoId],
  );
  return rows;
}
