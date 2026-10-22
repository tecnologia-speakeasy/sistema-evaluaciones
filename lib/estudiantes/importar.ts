import { leerCsv, type Separador } from "@/lib/csv";
import { emailSchema } from "@/lib/validacion";

// Análisis del CSV de estudiantes (sin BD): columna "correo", coma o punto y
// coma, con o sin encabezado (sin encabezado, la 1.ª columna es el correo). Las
// demás columnas se ignoran (p. ej. el manychat_id de los archivos de antes).
// La comparación con la BD (nuevos, ya existentes, del staff) la hace
// lib/datos/estudiantes.ts.

export const MAX_FILAS_CSV = 5000;
export const MAX_BYTES_CSV = 1024 * 1024;

export type FilaValida = { fila: number; email: string };
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

export function analizarCsvEstudiantes(texto: string): AnalisisCsv {
  if (new TextEncoder().encode(texto).length > MAX_BYTES_CSV) {
    return { ok: false, error: "El archivo pesa más de 1 MB. Divídelo en partes." };
  }
  const { filas, separador } = leerCsv(texto);
  if (filas.length === 0) return { ok: false, error: "El archivo está vacío." };

  const iCorreo = filas[0].celdas.findIndex((c) => ENCABEZADO_CORREO.test(c.trim()));
  const conEncabezado = iCorreo >= 0;
  const colCorreo = conEncabezado ? iCorreo : 0;
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
    const primeraVez = vistos.get(email.data);
    if (primeraVez !== undefined) {
      duplicadas.push({ fila: linea, email: email.data, primera: primeraVez });
      continue;
    }
    vistos.set(email.data, linea);
    validas.push({ fila: linea, email: email.data });
  }

  return { ok: true, conEncabezado, separador, validas, invalidas, duplicadas };
}
