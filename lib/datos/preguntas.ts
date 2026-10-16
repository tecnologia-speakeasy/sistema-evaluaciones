import { query, transaction, type Tx } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import { abiertasActivas, MENSAJE_ABIERTAS_APAGADAS, sqlSinAbiertas } from "@/lib/preguntas/abiertas";
import type { FilaPregunta } from "@/lib/preguntas/entrada";
import type { PreguntaPublica, PreguntaStaff, TipoPregunta } from "@/lib/preguntas/tipos";
import { unirVariantes, type entradaVariantesSchema } from "@/lib/preguntas/variantes";
import type { z } from "zod";

// Consultas de preguntas. Sin autorización: la hacen las Server Actions/páginas.
// JSONB se envía con JSON.stringify (pg convertiría un array JS en array de Postgres).

const json = (v: unknown) => (v === null ? null : JSON.stringify(v));

export async function listarPreguntas(evaluacionId: number): Promise<PreguntaStaff[]> {
  const { rows } = await query<PreguntaStaff>(
    `SELECT p.id, p.orden, p.seccion, p.tipo, p.categoria, p.enunciado, p.pista,
            p.opciones, p.respuestas_aceptadas, p.rubrica, p.puntaje::float8 AS puntaje,
            p.activa,
            (SELECT count(*)::int FROM respuestas r WHERE r.pregunta_id = p.id) AS respuestas
       FROM preguntas p
      WHERE p.evaluacion_id = $1
      ORDER BY p.activa DESC, p.orden`,
    [evaluacionId],
  );
  return rows;
}

// Exactamente lo que recibirá el estudiante (vista sin respuestas; sin las
// abiertas si están apagadas, lib/preguntas/abiertas.ts).
export async function listarPublicas(evaluacionId: number): Promise<PreguntaPublica[]> {
  const { rows } = await query<PreguntaPublica>(
    `SELECT id, orden, seccion, tipo, enunciado, pista, opciones, espacios
       FROM v_preguntas_publicas
      WHERE evaluacion_id = $1 AND ${sqlSinAbiertas()}
      ORDER BY orden`,
    [evaluacionId],
  );
  return rows;
}

// Bloquea la evaluación: serializa altas y reordenamientos simultáneos.
async function bloquearEvaluacion(tx: Tx, evaluacionId: number) {
  const { rowCount } = await tx.query(
    `SELECT 1 FROM evaluaciones WHERE id = $1 FOR UPDATE`,
    [evaluacionId],
  );
  if (!rowCount) throw new ErrorNegocio("La evaluación no existe.");
}

const SIGUIENTE_ORDEN = `(SELECT COALESCE(max(orden), 0) + 1 FROM preguntas WHERE evaluacion_id = $1)`;

// Con las abiertas apagadas no se crea ninguna (tampoco cambiando el tipo de otra).
function rechazarAbiertaApagada(tipo: TipoPregunta) {
  if (tipo === "open" && !abiertasActivas()) throw new ErrorNegocio(MENSAJE_ABIERTAS_APAGADAS, "tipo");
}

export async function crearPregunta(evaluacionId: number, f: FilaPregunta): Promise<number> {
  rechazarAbiertaApagada(f.tipo);
  return transaction(async (tx) => {
    await bloquearEvaluacion(tx, evaluacionId);
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO preguntas (evaluacion_id, orden, seccion, tipo, categoria, enunciado, pista,
                              opciones, respuestas_aceptadas, rubrica, puntaje)
       VALUES ($1, ${SIGUIENTE_ORDEN}, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        evaluacionId, f.seccion, f.tipo, f.categoria, f.enunciado, f.pista,
        json(f.opciones), json(f.respuestas_aceptadas), f.rubrica, f.puntaje,
      ],
    );
    return rows[0].id;
  });
}

// Edición completa: solo si la pregunta NO tiene respuestas (regla 7).
export async function actualizarPregunta(id: number, f: FilaPregunta): Promise<void> {
  rechazarAbiertaApagada(f.tipo);
  await transaction(async (tx) => {
    const { rows } = await tx.query<{ respuestas: number }>(
      `SELECT (SELECT count(*)::int FROM respuestas r WHERE r.pregunta_id = p.id) AS respuestas
         FROM preguntas p WHERE p.id = $1 FOR UPDATE`,
      [id],
    );
    if (!rows[0]) throw new ErrorNegocio("La pregunta no existe.");
    if (rows[0].respuestas > 0) {
      throw new ErrorNegocio(
        "Esta pregunta ya tiene respuestas: solo puedes agregar variantes aceptadas.",
      );
    }
    await tx.query(
      `UPDATE preguntas
          SET seccion = $2, tipo = $3, categoria = $4, enunciado = $5, pista = $6,
              opciones = $7, respuestas_aceptadas = $8, rubrica = $9, puntaje = $10
        WHERE id = $1`,
      [
        id, f.seccion, f.tipo, f.categoria, f.enunciado, f.pista,
        json(f.opciones), json(f.respuestas_aceptadas), f.rubrica, f.puntaje,
      ],
    );
  });
}

// Pregunta con respuestas: solo se agregan variantes (actuales ∪ nuevas).
export async function agregarVariantes(
  id: number,
  nuevas: z.output<typeof entradaVariantesSchema>,
): Promise<number> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<Pick<PreguntaStaff, "tipo" | "opciones" | "respuestas_aceptadas">>(
      `SELECT tipo, opciones, respuestas_aceptadas FROM preguntas WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!rows[0]) throw new ErrorNegocio("La pregunta no existe.");
    const { respuestas_aceptadas, agregadas } = unirVariantes(rows[0], nuevas);
    if (agregadas === 0) throw new ErrorNegocio("No agregaste ninguna variante nueva.");
    await tx.query(`UPDATE preguntas SET respuestas_aceptadas = $2 WHERE id = $1`, [
      id,
      json(respuestas_aceptadas),
    ]);
    return agregadas;
  });
}

export async function cambiarActiva(id: number, activa: boolean): Promise<void> {
  const { rowCount } = await query(`UPDATE preguntas SET activa = $2 WHERE id = $1`, [id, activa]);
  if (!rowCount) throw new ErrorNegocio("La pregunta no existe.");
}

// Si tiene respuestas, la FK (ON DELETE RESTRICT) lo impide y el error se traduce.
export async function eliminarPregunta(id: number): Promise<void> {
  const { rowCount } = await query(`DELETE FROM preguntas WHERE id = $1`, [id]);
  if (!rowCount) throw new ErrorNegocio("La pregunta no existe.");
}

// Copia editable al final de la misma evaluación (activa, sin respuestas).
export async function duplicarPregunta(id: number): Promise<number> {
  return transaction(async (tx) => {
    const { rows: origen } = await tx.query<{ evaluacion_id: number; tipo: TipoPregunta }>(
      `SELECT evaluacion_id, tipo FROM preguntas WHERE id = $1`,
      [id],
    );
    if (!origen[0]) throw new ErrorNegocio("La pregunta no existe.");
    rechazarAbiertaApagada(origen[0].tipo);
    const evaluacionId = origen[0].evaluacion_id;
    await bloquearEvaluacion(tx, evaluacionId);
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO preguntas (evaluacion_id, orden, seccion, tipo, categoria, enunciado, pista,
                              opciones, respuestas_aceptadas, rubrica, puntaje)
       SELECT evaluacion_id, ${SIGUIENTE_ORDEN}, seccion, tipo, categoria, enunciado, pista,
              opciones, respuestas_aceptadas, rubrica, puntaje
         FROM preguntas WHERE id = $2
       RETURNING id`,
      [evaluacionId, id],
    );
    return rows[0].id;
  });
}

// Nuevo orden de las preguntas ACTIVAS. Las desactivadas quedan después, en su
// orden relativo. Se reescribe todo `orden` en una transacción (el UNIQUE es
// DEFERRABLE, así que los valores pueden cruzarse a mitad de camino).
export async function reordenarPreguntas(evaluacionId: number, idsActivas: number[]): Promise<void> {
  await transaction(async (tx) => {
    await bloquearEvaluacion(tx, evaluacionId);
    const { rows } = await tx.query<{ id: number; activa: boolean }>(
      `SELECT id, activa FROM preguntas WHERE evaluacion_id = $1 ORDER BY orden FOR UPDATE`,
      [evaluacionId],
    );
    const activas = rows.filter((r) => r.activa).map((r) => r.id);
    const mismas =
      activas.length === idsActivas.length &&
      new Set(idsActivas).size === idsActivas.length &&
      idsActivas.every((id) => activas.includes(id));
    if (!mismas) {
      throw new ErrorNegocio(
        "La lista de preguntas cambió mientras ordenabas. Recarga la página e inténtalo de nuevo.",
      );
    }
    const inactivas = rows.filter((r) => !r.activa).map((r) => r.id);
    await tx.query(
      `UPDATE preguntas p
          SET orden = v.orden
         FROM unnest($2::int[]) WITH ORDINALITY AS v(id, orden)
        WHERE p.id = v.id AND p.evaluacion_id = $1`,
      [evaluacionId, [...idsActivas, ...inactivas]],
    );
  });
}

// clonar_preguntas exige que el destino esté vacío; su error se traduce. Con
// las abiertas apagadas, las copias de abiertas se quitan en la misma transacción.
export async function clonarPreguntas(origenId: number, destinoId: number): Promise<number> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<{ copiadas: number }>(
      `SELECT clonar_preguntas($1, $2) AS copiadas`,
      [origenId, destinoId],
    );
    if (abiertasActivas()) return rows[0].copiadas;
    const { rowCount } = await tx.query(`DELETE FROM preguntas WHERE evaluacion_id = $1 AND tipo = 'open'`, [
      destinoId,
    ]);
    return rows[0].copiadas - (rowCount ?? 0);
  });
}
