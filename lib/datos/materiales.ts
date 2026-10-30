import { query, transaction } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import type { Material, MaterialStaff } from "@/lib/preguntas/materiales";

// Lecturas y audios de una evaluación (db/009). Sin autorización: la hacen las
// Server Actions/páginas. Las reglas de forma (lectura con texto, audio con URL)
// las aplica materiales_contenido_check; la de "misma evaluación", un trigger.

const COLUMNAS = `m.id, m.tipo, m.titulo, m.texto, m.audio_url`;

export async function listarMateriales(evaluacionId: number): Promise<MaterialStaff[]> {
  const { rows } = await query<MaterialStaff>(
    `SELECT ${COLUMNAS},
            (SELECT count(*)::int FROM preguntas p WHERE p.material_id = m.id) AS preguntas,
            EXISTS (SELECT 1 FROM preguntas p JOIN respuestas r ON r.pregunta_id = p.id
                     WHERE p.material_id = m.id) AS con_respuestas
       FROM materiales m
      WHERE m.evaluacion_id = $1
      ORDER BY m.id`,
    [evaluacionId],
  );
  return rows;
}

/** Los materiales que usan estas preguntas (lo que el estudiante necesita ver). */
export async function materialesDe(preguntas: { material_id: number | null }[]): Promise<Material[]> {
  const ids = [...new Set(preguntas.flatMap((p) => (p.material_id ? [p.material_id] : [])))];
  if (ids.length === 0) return [];
  const { rows } = await query<Material>(
    `SELECT ${COLUMNAS} FROM materiales m WHERE m.id = ANY($1::int[]) ORDER BY m.id`,
    [ids],
  );
  return rows;
}

type FilaMaterial = Omit<Material, "id">;

export async function crearMaterial(evaluacionId: number, f: FilaMaterial): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO materiales (evaluacion_id, tipo, titulo, texto, audio_url)
     SELECT id, $2, $3, $4, $5 FROM evaluaciones WHERE id = $1
     RETURNING id`,
    [evaluacionId, f.tipo, f.titulo, f.texto, f.audio_url],
  );
  if (!rows[0]) throw new ErrorNegocio("La evaluación no existe.");
  return rows[0].id;
}

// Corregir el texto o cambiar el audio se permite aunque ya haya respuestas (el
// editor lo advierte): afecta a quienes presenten de ahí en adelante.
export async function actualizarMaterial(id: number, f: FilaMaterial): Promise<void> {
  const { rowCount } = await query(
    `UPDATE materiales SET tipo = $2, titulo = $3, texto = $4, audio_url = $5 WHERE id = $1`,
    [id, f.tipo, f.titulo, f.texto, f.audio_url],
  );
  if (!rowCount) throw new ErrorNegocio("La lectura o el audio ya no existe.");
}

// Sus preguntas quedan sin material (ON DELETE SET NULL). Si alguna ya tiene
// respuestas no se borra: los estudiantes respondieron viéndolo.
export async function eliminarMaterial(id: number): Promise<void> {
  await transaction(async (tx) => {
    const { rows } = await tx.query<{ con_respuestas: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM preguntas p JOIN respuestas r ON r.pregunta_id = p.id
                       WHERE p.material_id = m.id) AS con_respuestas
         FROM materiales m WHERE m.id = $1 FOR UPDATE`,
      [id],
    );
    if (!rows[0]) throw new ErrorNegocio("La lectura o el audio ya no existe.");
    if (rows[0].con_respuestas) {
      throw new ErrorNegocio(
        "Sus preguntas ya tienen respuestas de estudiantes: no se puede eliminar. Puedes corregir el texto o el audio.",
      );
    }
    await tx.query(`DELETE FROM materiales WHERE id = $1`, [id]);
  });
}
