import { z } from "zod";

// Las fechas de apertura/cierre se escriben y muestran en hora de Colombia,
// sin importar la zona del servidor (Vercel corre en UTC). La conversión se hace
// en SQL con AT TIME ZONE; la app maneja textos "YYYY-MM-DDTHH:MM" (datetime-local).
export const ZONA_HORARIA = "America/Bogota";

// timestamptz → "YYYY-MM-DDTHH:MM" en hora local (valor para <input type="datetime-local">).
export function sqlALocal(columna: string): string {
  return `to_char(${columna} AT TIME ZONE '${ZONA_HORARIA}', 'YYYY-MM-DD"T"HH24:MI')`;
}

// Parámetro "YYYY-MM-DDTHH:MM" (hora local) → timestamptz.
export function sqlDesdeLocal(parametro: string): string {
  return `(${parametro}::timestamp AT TIME ZONE '${ZONA_HORARIA}')`;
}

// Valor de un datetime-local: vacío = sin fecha.
export const fechaHoraLocalSchema = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora inválidas")
      .nullable(),
  );

export const fechaSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

// "2026-11-03T08:05" → "3 nov 2026, 8:05 a. m." (sin conversiones: ya es hora local).
export function formatearFechaHora(local: string | null): string {
  if (!local) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return local;
  const [, anio, mes, dia, hh, mm] = m;
  const h = Number(hh);
  const sufijo = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${Number(dia)} ${MESES[Number(mes) - 1]} ${anio}, ${h12}:${mm} ${sufijo}`;
}

// "2026-10-01" → "1 oct 2026".
export function formatearFecha(fecha: string | null): string {
  if (!fecha) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return fecha;
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
}
