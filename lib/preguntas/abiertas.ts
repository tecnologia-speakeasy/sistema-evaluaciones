// Preguntas abiertas: las califica la IA con la rúbrica de cada una (Fase 5).
// No existían en a2 y por ahora no se usan: están apagadas salvo con
// PREGUNTAS_ABIERTAS_ACTIVAS=true. Apagadas:
//   · no se pueden crear (ni cambiando el tipo de otra, ni duplicando, ni al
//     copiar las preguntas de otra evaluación);
//   · las que ya existan no las ve el estudiante ni cuentan en el puntaje;
//   · la IA solo escribe el feedback general: una llamada por intento, como a2.

export function abiertasActivas(env: Record<string, string | undefined> = process.env): boolean {
  return /^(true|1|si|sí)$/i.test(env.PREGUNTAS_ABIERTAS_ACTIVAS?.trim() ?? "");
}

/** Condición SQL (sin parámetros) que deja fuera las abiertas cuando están apagadas. */
export function sqlSinAbiertas(columnaTipo = "tipo", env: Record<string, string | undefined> = process.env): string {
  return abiertasActivas(env) ? "TRUE" : `${columnaTipo} <> 'open'`;
}

export const MENSAJE_ABIERTAS_APAGADAS = "Las preguntas abiertas están desactivadas.";
