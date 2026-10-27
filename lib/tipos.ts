// Tipos de dominio compartidos entre servidor y componentes.

// Cada generación: 1 de bienvenida + 12 mensuales + 4 trimestrales + 1 final
// (db/007 y db/008).
export type TipoEvaluacion = "bienvenida" | "mensual" | "trimestral" | "final";

/** Cuántas evaluaciones tiene una generación completa (generar_evaluaciones). */
export const EVALUACIONES_POR_GENERACION = 18;

/** Código corto de una evaluación: B (bienvenida), M1…M12, T1…T4, F (final). */
export function codigoEvaluacion(tipo: TipoEvaluacion, numero: number): string {
  if (tipo === "bienvenida") return "B";
  if (tipo === "final") return "F";
  return `${tipo === "mensual" ? "M" : "T"}${numero}`;
}

// Estado visible de una evaluación (se calcula en SQL con now()).
export type EstadoEvaluacion = "borrador" | "programada" | "abierta" | "cerrada";
