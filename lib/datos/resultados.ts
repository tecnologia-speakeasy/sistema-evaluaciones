import { escribirCsv } from "@/lib/csv";
import { query, transaction } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import { sqlALocal } from "@/lib/fechas";
import { codigoEvaluacion, etiquetaEstado, type EstadoIntento, type FiltrosResultados } from "@/lib/resultados";
import type { TipoEvaluacion } from "@/lib/tipos";
import { patronBusqueda } from "./estudiantes";

// Resultados (Fase 6, admin y docente): consultas sobre v_resultados con los
// filtros de lib/resultados.ts (los mismos para la página y la exportación).

export const POR_PAGINA_RESULTADOS = 50;
// Tope de la exportación (un CSV más grande que esto no se abre bien en Excel).
const MAX_EXPORTAR = 50_000;

function donde(f: FiltrosResultados): { sql: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.generacion) conds.push(`generacion = ${p(f.generacion)}`);
  if (f.evaluacion) conds.push(`slug = ${p(f.evaluacion)}`);
  if (f.estado === "enviados") conds.push(`estado <> 'en_progreso'`);
  else if (f.estado !== "todos") conds.push(`estado = ${p(f.estado)}::estado_intento`);
  if (f.q) {
    const patron = p(patronBusqueda(f.q));
    conds.push(`(nombre ILIKE ${patron} OR email ILIKE ${patron})`);
  }
  return { sql: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

export type FilaResultado = {
  intento_id: number;
  generacion: string;
  slug: string;
  tipo: TipoEvaluacion;
  numero: number;
  nombre: string;
  email: string;
  numero_intento: number;
  estado: EstadoIntento;
  puntaje_total: number | null;
  grammar_score: number | null;
  writing_score: number | null;
  /** null en los intentos de antes de la 011. */
  reading_score: number | null;
  listening_score: number | null;
  cambios_pestana: number;
  email_enviado: boolean;
  token: string;
  /** Hora de Colombia "YYYY-MM-DDTHH:MM". */
  inicio: string | null;
  envio: string | null;
};

const COLUMNAS = `intento_id, generacion, slug, tipo, numero, nombre, email::text AS email, numero_intento,
  estado, puntaje_total, grammar_score, writing_score, reading_score, listening_score, cambios_pestana,
  email_enviado, token,
  ${sqlALocal("started_at")} AS inicio, ${sqlALocal("completed_at")} AS envio`;
const ORDEN = `ORDER BY coalesce(completed_at, started_at) DESC, intento_id DESC`;

export async function buscarResultados(
  f: FiltrosResultados,
): Promise<{ filas: FilaResultado[]; total: number; paginas: number }> {
  const { sql, params } = donde(f);
  const { rows } = await query<FilaResultado & { total: number }>(
    `SELECT ${COLUMNAS}, count(*) OVER ()::int AS total
       FROM v_resultados ${sql} ${ORDEN}
      LIMIT ${POR_PAGINA_RESULTADOS} OFFSET ${(f.pagina - 1) * POR_PAGINA_RESULTADOS}`,
    params,
  );
  const total = rows[0]?.total ?? (f.pagina > 1 ? await contar(f) : 0);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_RESULTADOS));
  // Página fuera de rango (p. ej. después de eliminar los de la última): se
  // muestra la última que hay.
  if (rows.length === 0 && total > 0) return buscarResultados({ ...f, pagina: paginas });
  // Cada fila trae además el total (count OVER ()); no estorba.
  return { filas: rows, total, paginas };
}

// Si la página pedida está fuera de rango, igual hace falta el total.
async function contar(f: FiltrosResultados): Promise<number> {
  const { sql, params } = donde(f);
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM v_resultados ${sql}`, params);
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Eliminar intentos (solo admin; uno o varios a la vez). Irreversible: se van
// sus respuestas (FK en cascada), su puntaje, su feedback y su enlace
// /resultado/[token]; el correo que ya recibió el estudiante no se recoge.
// Como validar_intento cuenta los intentos que tiene, el estudiante recupera
// ese intento si la evaluación tiene tope. Y como numera el siguiente con
// "cuántos tiene + 1", los que le quedan en esa evaluación se renumeran 1, 2, 3…
// (si no, el siguiente chocaría con uno que ya existe).
// No se elimina uno que la IA está calificando (candado vigente).
// ---------------------------------------------------------------------------

export const MAX_ELIMINAR_INTENTOS = 100;

export async function eliminarIntentos(ids: number[]): Promise<number> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number; evaluacion_id: number; estudiante_id: number; nombre: string; ocupado: boolean }>(
      `SELECT id, evaluacion_id, estudiante_id, nombre,
              (estado = 'calificando' AND coalesce(procesando_hasta > now(), FALSE)) AS ocupado
         FROM intentos WHERE id = ANY($1::int[])
        ORDER BY id
        FOR UPDATE`,
      [ids],
    );
    const ocupados = rows.filter((r) => r.ocupado);
    if (ocupados.length > 0) {
      throw new ErrorNegocio(
        ocupados.length === 1
          ? `El intento de ${ocupados[0].nombre} se está calificando en este momento. Intenta de nuevo en unos minutos.`
          : `${ocupados.length} de esos intentos se están calificando en este momento. Intenta de nuevo en unos minutos.`,
      );
    }
    // Los que ya no existen (otra persona los borró) simplemente no cuentan.
    if (rows.length === 0) return 0;
    await tx.query(`DELETE FROM intentos WHERE id = ANY($1::int[])`, [rows.map((r) => r.id)]);

    const pares = new Map(rows.map((r) => [`${r.evaluacion_id}:${r.estudiante_id}`, r]));
    for (const { evaluacion_id, estudiante_id } of pares.values()) {
      const { rows: quedan } = await tx.query<{ id: number; numero_intento: number }>(
        `SELECT id, numero_intento FROM intentos
          WHERE evaluacion_id = $1 AND estudiante_id = $2
          ORDER BY numero_intento
          FOR UPDATE`,
        [evaluacion_id, estudiante_id],
      );
      // De menor a mayor, cada número nuevo ya está libre (nunca supera al actual),
      // así el índice único no choca a mitad de camino.
      for (const [i, q] of quedan.entries()) {
        if (q.numero_intento !== i + 1) {
          await tx.query(`UPDATE intentos SET numero_intento = $2 WHERE id = $1`, [q.id, i + 1]);
        }
      }
    }
    return rows.length;
  });
}

// CSV para Excel en español (separador ;, UTF-8 con BOM); horas de Colombia.
export async function exportarResultados(f: FiltrosResultados): Promise<{ csv: string; filas: number }> {
  const { sql, params } = donde(f);
  const { rows } = await query<FilaResultado>(
    `SELECT ${COLUMNAS} FROM v_resultados ${sql} ${ORDEN} LIMIT ${MAX_EXPORTAR}`,
    params,
  );
  const hora = (v: string | null) => (v ? v.replace("T", " ") : "");
  const csv = escribirCsv([
    [
      "Generación",
      "Evaluación",
      "Slug",
      "Nombre",
      "Correo",
      "Intento",
      "Estado",
      "Puntaje",
      "Grammar (aciertos)",
      "Writing (aciertos)",
      "Reading (aciertos)",
      "Listening (aciertos)",
      "Cambios de pestaña",
      "Inicio",
      "Envío",
      "Correo enviado",
    ],
    ...rows.map((r) => [
      r.generacion,
      codigoEvaluacion(r.tipo, r.numero),
      r.slug,
      r.nombre,
      r.email,
      r.numero_intento,
      etiquetaEstado(r.estado),
      r.puntaje_total,
      r.grammar_score,
      r.writing_score,
      r.reading_score,
      r.listening_score,
      r.cambios_pestana,
      hora(r.inicio),
      hora(r.envio),
      r.email_enviado ? "Sí" : "No",
    ]),
  ]);
  return { csv, filas: rows.length };
}
