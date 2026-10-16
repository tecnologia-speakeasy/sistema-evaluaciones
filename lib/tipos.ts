// Tipos de dominio compartidos entre servidor y componentes.

export type TipoEvaluacion = "mensual" | "trimestral";

// Estado visible de una evaluación (se calcula en SQL con now()).
export type EstadoEvaluacion = "borrador" | "programada" | "abierta" | "cerrada";
