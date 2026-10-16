// Tiempo del examen. Puro: lo usan el servidor y el navegador.
//   · El reloj se cuenta desde started_at con la hora del servidor (el
//     navegador corrige la diferencia con su propia hora).
//   · El servidor acepta respuestas hasta limite_at + GRACIA_S.

/** Gracia después del límite para que lleguen las últimas respuestas (2 min). */
export const GRACIA_S = 120;
/** Con estos segundos o menos, el cronómetro se pone rojo y palpita (a2: 3 min). */
export const AVISO_S = 180;
/** La pantalla de "calificando" se ve al menos este tiempo. */
export const MIN_CALIFICANDO_MS = 2500;

export function segundosRestantes(inicioMs: number, duracionMin: number, ahoraMs: number): number {
  return Math.max(0, Math.ceil((inicioMs + duracionMin * 60_000 - ahoraMs) / 1000));
}

// 5025 → "01:23:45" (como a2: siempre HH:MM:SS).
export function formatearReloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

// Para "Este test tiene una duración de …" (a2: "2:00 horas").
export function textoDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(minutos / 60);
  const m = String(minutos % 60).padStart(2, "0");
  return `${h}:${m} ${minutos === 60 ? "hora" : "horas"}`;
}
