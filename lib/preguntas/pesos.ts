// Peso de cada pregunta (su `puntaje`). Por ahora apagado salvo con
// PESOS_POR_PREGUNTA=true. Apagado:
//   · todas las preguntas valen lo mismo: 100 ÷ número de preguntas (10
//     preguntas = 10 puntos cada una);
//   · el editor no pide el puntaje ni lo muestra en cada pregunta.
// El `puntaje` se sigue guardando (10 por defecto, o el que ya tuviera) para
// cuando se encienda: entonces cada pregunta vuelve a pesar lo suyo.

export function pesosPorPregunta(env: Record<string, string | undefined> = process.env): boolean {
  return /^(true|1|si|sí)$/i.test(env.PESOS_POR_PREGUNTA?.trim() ?? "");
}
