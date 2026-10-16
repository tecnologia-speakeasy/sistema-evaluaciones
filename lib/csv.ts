// CSV sin dependencias: leer lo que sube el staff (estudiantes) y escribir lo
// que se exporta (resultados).
//   Lectura:   separador coma o punto y coma (se detecta en la primera línea con
//              datos), campos entre comillas ("" = una comilla), BOM, CRLF o LF.
//   Escritura: para Excel en español: UTF-8 con BOM, separador ";" y CRLF.

export type Separador = "," | ";";

export type FilaCsv = {
  /** Línea del archivo donde empieza la fila (desde 1), para los mensajes. */
  linea: number;
  celdas: string[];
};

// Cuenta comas y puntos y comas fuera de comillas en la primera línea con datos.
export function detectarSeparador(texto: string): Separador {
  const sinBom = texto.replace(/^\uFEFF/, "");
  const primera = sinBom.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  let comas = 0;
  let puntosYComas = 0;
  let comillas = false;
  for (const c of primera) {
    if (c === '"') comillas = !comillas;
    else if (!comillas && c === ",") comas++;
    else if (!comillas && c === ";") puntosYComas++;
  }
  return puntosYComas > comas ? ";" : ",";
}

export function leerCsv(texto: string, separador?: Separador): { filas: FilaCsv[]; separador: Separador } {
  const t = texto.replace(/^\uFEFF/, "");
  const sep = separador ?? detectarSeparador(t);
  const filas: FilaCsv[] = [];
  let celdas: string[] = [];
  let campo = "";
  let comillas = false;
  let linea = 1;
  let inicio = 1;

  const cerrarFila = () => {
    celdas.push(campo);
    // Las filas en blanco (o solo con separadores) no cuentan.
    if (celdas.some((c) => c.trim() !== "")) filas.push({ linea: inicio, celdas });
    celdas = [];
    campo = "";
  };

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          comillas = false;
        }
      } else {
        if (c === "\n") linea++;
        campo += c;
      }
    } else if (c === '"' && campo.trim() === "") {
      campo = "";
      comillas = true;
    } else if (c === sep) {
      celdas.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      cerrarFila();
      linea++;
      inicio = linea;
    } else {
      campo += c;
    }
  }
  if (campo !== "" || celdas.length > 0) cerrarFila();
  return { filas, separador: sep };
}

// Excel ejecuta como fórmula una celda que empieza con = + - @ (o tab / retorno):
// a los textos así se les antepone un apóstrofo. Los números van tal cual.
const FORMULA = /^[=+\-@\t\r]/;

export function celdaCsv(valor: unknown, separador: Separador = ";"): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor);
  if (typeof valor === "string" && FORMULA.test(s)) s = `'${s}`;
  return /["\r\n]/.test(s) || s.includes(separador) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function escribirCsv(filas: unknown[][], separador: Separador = ";"): string {
  return `\uFEFF${filas.map((f) => f.map((v) => celdaCsv(v, separador)).join(separador)).join("\r\n")}\r\n`;
}
