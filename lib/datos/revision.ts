import { query } from "@/lib/db";
import { sqlALocal } from "@/lib/fechas";
import type { TipoEvaluacion } from "@/lib/tipos";
import type { EstadoIntento } from "./intentos";

// Intentos que necesitan que el staff los mire (Fase 5): la IA falló varias
// veces ('error'), lleva más de 10 min sin terminar, o el correo no salió.
// Sin reproceso programado (como a2), el staff es quien los destraba con
// "Reintentar IA" / "Reintentar envío" (/admin/resultados).
// Sin autorización: la hace la página / la acción con requireStaff().

export type IntentoPorRevisar = {
  id: number;
  nombre: string;
  email: string;
  generacion: string;
  titulo: string;
  tipo: TipoEvaluacion;
  eval_numero: number;
  numero: number;
  estado: EstadoIntento;
  ia_intentos: number;
  ia_error: string | null;
  email_enviado: boolean;
  envio_error: string | null;
  /** Hora de Colombia "YYYY-MM-DDTHH:MM". */
  completado: string | null;
  /** Problema de la IA (si no, solo falta el correo). */
  problema_ia: boolean;
};

const PROBLEMA_IA = `(i.estado = 'error'
   OR (i.estado IN ('pendiente', 'calificando') AND i.completed_at < now() - interval '10 minutes'))`;

const POR_REVISAR = `(${PROBLEMA_IA}
   OR (i.estado = 'listo' AND i.feedback IS NOT NULL AND NOT i.email_enviado
       AND i.completed_at < now() - interval '10 minutes'))`;

export async function intentosPorRevisar(): Promise<IntentoPorRevisar[]> {
  const { rows } = await query<IntentoPorRevisar>(
    `SELECT i.id, i.nombre, s.email, g.codigo AS generacion, e.titulo, e.tipo, e.numero AS eval_numero,
            i.numero_intento AS numero, i.estado, i.ia_intentos, i.ia_error, i.email_enviado, i.envio_error,
            ${sqlALocal("i.completed_at")} AS completado, ${PROBLEMA_IA} AS problema_ia
       FROM intentos i
       JOIN estudiantes s  ON s.id = i.estudiante_id
       JOIN evaluaciones e ON e.id = i.evaluacion_id
       JOIN generaciones g ON g.id = e.generacion_id
      WHERE ${POR_REVISAR}
      ORDER BY i.completed_at DESC
      LIMIT 100`,
  );
  return rows;
}

// Para el aviso del inicio del staff.
export async function contarIntentosPorRevisar(): Promise<number> {
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM intentos i WHERE ${POR_REVISAR}`);
  return rows[0]?.n ?? 0;
}
