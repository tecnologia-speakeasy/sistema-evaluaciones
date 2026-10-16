import { z } from "zod";
import { leerCsv, type Separador } from "@/lib/csv";
import { emailSchema } from "@/lib/validacion";

// Análisis del CSV de estudiantes (sin BD): columna "correo" y "manychat_id"
// opcional, coma o punto y coma, con o sin encabezado. Sin encabezado, la
// 1.ª columna es el correo y la 2.ª el manychat_id. La comparación con la BD
// (nuevos, ya existentes, del staff) la hace lib/datos/estudiantes.ts.

export const MAX_FILAS_CSV = 5000;
export const MAX_BYTES_CSV = 1024 * 1024;

export type FilaValida = { fila: number; email: string; manychat_id: string | null };
export type FilaInvalida = { fila: number; valor: string; motivo: string };
export type FilaDuplicada = { fila: number; email: string; primera: number };

export type AnalisisCsv =
  | { ok: false; error: string }
  | {
      ok: true;
      conEncabezado: boolean;
      separador: Separador;
      validas: FilaValida[];
      invalidas: FilaInvalida[];
      duplicadas: FilaDuplicada[];
    };

const ENCABEZADO_CORREO = /^(correo|e-?mail|correo electr[oó]nico|correo_electronico)$/i;
const ENCABEZADO_MANYCHAT = /^manychat([ _-]?id)?$/i;

/** manychat_id: solo dígitos (id de suscriptor de ManyChat); vacío = sin WhatsApp. */
export const manychatSchema = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.string().regex(/^\d{1,20}$/, "El manychat_id debe tener solo números.").nullable());

export function analizarCsvEstudiantes(texto: string): AnalisisCsv {
  if (new TextEncoder().encode(texto).length > MAX_BYTES_CSV) {
    return { ok: false, error: "El archivo pesa más de 1 MB. Divídelo en partes." };
  }
  const { filas, separador } = leerCsv(texto);
  if (filas.length === 0) return { ok: false, error: "El archivo está vacío." };

  const primera = filas[0].celdas.map((c) => c.trim());
  const iCorreo = primera.findIndex((c) => ENCABEZADO_CORREO.test(c));
  const iManychatEnc = primera.findIndex((c) => ENCABEZADO_MANYCHAT.test(c));
  const conEncabezado = iCorreo >= 0 || iManychatEnc >= 0;
  if (conEncabezado && iCorreo < 0) {
    return { ok: false, error: "El encabezado no tiene la columna «correo»." };
  }
  const colCorreo = conEncabezado ? iCorreo : 0;
  const colManychat = conEncabezado ? iManychatEnc : 1;
  const datos = conEncabezado ? filas.slice(1) : filas;
  if (datos.length === 0) return { ok: false, error: "El archivo no tiene filas con correos." };
  if (datos.length > MAX_FILAS_CSV) {
    return {
      ok: false,
      error: `El archivo tiene ${datos.length.toLocaleString("es-CO")} filas; el máximo es ${MAX_FILAS_CSV.toLocaleString("es-CO")}. Divídelo en partes.`,
    };
  }

  const validas: FilaValida[] = [];
  const invalidas: FilaInvalida[] = [];
  const duplicadas: FilaDuplicada[] = [];
  const vistos = new Map<string, number>();

  for (const { linea, celdas } of datos) {
    const valor = (celdas[colCorreo] ?? "").trim();
    if (!valor) {
      invalidas.push({ fila: linea, valor: celdas.join(separador).trim(), motivo: "Sin correo" });
      continue;
    }
    const email = emailSchema.safeParse(valor);
    if (!email.success) {
      invalidas.push({ fila: linea, valor, motivo: "Correo inválido" });
      continue;
    }
    const manychat = manychatSchema.safeParse(colManychat >= 0 ? (celdas[colManychat] ?? "") : "");
    if (!manychat.success) {
      invalidas.push({ fila: linea, valor, motivo: "manychat_id inválido (solo números)" });
      continue;
    }
    const primeraVez = vistos.get(email.data);
    if (primeraVez !== undefined) {
      duplicadas.push({ fila: linea, email: email.data, primera: primeraVez });
      continue;
    }
    vistos.set(email.data, linea);
    validas.push({ fila: linea, email: email.data, manychat_id: manychat.data });
  }

  return { ok: true, conEncabezado, separador, validas, invalidas, duplicadas };
}
