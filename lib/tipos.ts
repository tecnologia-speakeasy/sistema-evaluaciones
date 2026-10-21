// Tipos de dominio compartidos entre servidor y componentes.

// Cada generación: 1 de bienvenida + 12 mensuales + 4 trimestrales (db/007).
export type TipoEvaluacion = "bienvenida" | "mensual" | "trimestral";

/** Cuántas evaluaciones tiene una generación completa (generar_evaluaciones). */
export const EVALUACIONES_POR_GENERACION = 17;

/** Código corto de una evaluación: B (bienvenida), M1…M12, T1…T4. */
export function codigoEvaluacion(tipo: TipoEvaluacion, numero: number): string {
  if (tipo === "bienvenida") return "B";
  return `${tipo === "mensual" ? "M" : "T"}${numero}`;
}

// Estado visible de una evaluación (se calcula en SQL con now()).
export type EstadoEvaluacion = "borrador" | "programada" | "abierta" | "cerrada";
