import { escribirCsv } from "@/lib/csv";
import { query } from "@/lib/db";
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
  return {
    // Cada fila trae además el total (count OVER ()); no estorba.
    filas: rows,
    total,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA_RESULTADOS)),
  };
}

// Si la página pedida está fuera de rango, igual hace falta el total.
async function contar(f: FiltrosResultados): Promise<number> {
  const { sql, params } = donde(f);
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM v_resultados ${sql}`, params);
  return rows[0]?.n ?? 0;
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
