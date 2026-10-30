import { z } from "zod";
import {
  CATEGORIA_POR_DEFECTO,
  CATEGORIAS,
  contarEspacios,
  type Categoria,
  type PreguntaPublica,
  type PreguntaStaff,
  type TipoPregunta,
} from "./tipos";
import type { EntradaVariantes } from "./variantes";

// Entrada del formulario de preguntas → fila de la tabla `preguntas`.
// zod solo valida la FORMA (tipos, textos no vacíos, puntaje > 0). Las reglas de
// cada tipo (≥ 2 opciones, espacios = listas, rúbrica…) las aplica el trigger
// validar_pregunta y sus errores se traducen en lib/db-errores.ts.

const comunes = {
  seccion: z
    .string()
    .trim()
    .max(120, "La sección es demasiado larga")
    .transform((v) => v || null),
  /** «Section A» dentro de la sección (db/010). Opcional; exige sección. */
  subseccion: z
    .string()
    .trim()
    .max(120, "La subsección es demasiado larga")
    .optional()
    .transform((v) => v || null),
  categoria: z.enum(CATEGORIAS, { error: "Elige la categoría" }),
  enunciado: z
    .string({ error: "Escribe el enunciado" })
    .trim()
    .min(1, "Escribe el enunciado")
    .max(2000, "El enunciado es demasiado largo"),
  pista: z
    .string()
    .trim()
    .max(200, "La pista es demasiado larga")
    .transform((v) => v || null),
  puntaje: z
    .number({ error: "Escribe el puntaje" })
    .positive("El puntaje debe ser mayor que 0")
    .max(999.99, "El puntaje máximo es 999.99"),
  /** Lectura o audio de la evaluación al que se liga (db/009); el trigger exige que sea de ella. */
  material_id: z.number().int().positive().nullable().default(null),
};

const respuestaTexto = z
  .string()
  .trim()
  .min(1, "Hay una respuesta vacía")
  .max(500, "Una respuesta es demasiado larga");

export const entradaPreguntaSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("multiple_choice"),
    ...comunes,
    opciones: z
      .array(z.string().trim().min(1, "Hay una opción vacía").max(300, "Una opción es demasiado larga"))
      .max(10, "Máximo 10 opciones")
      .refine(
        (ops) => new Set(ops.map((o) => o.toLowerCase())).size === ops.length,
        "Hay opciones repetidas",
      ),
    /** Índices de las opciones correctas. */
    correctas: z.array(z.number().int().min(0)).max(10),
  }),
  z.object({
    tipo: z.literal("fill_blank"),
    ...comunes,
    /** Una lista de variantes aceptadas por cada espacio ___. */
    variantes: z.array(z.array(respuestaTexto).max(30)).max(20),
  }),
  z.object({
    tipo: z.literal("translation"),
    ...comunes,
    traducciones: z.array(respuestaTexto).max(30),
  }),
  z.object({
    tipo: z.literal("open"),
    ...comunes,
    rubrica: z.string().trim().max(4000, "La rúbrica es demasiado larga"),
  }),
]).refine((p) => !p.subseccion || p.seccion, {
  path: ["subseccion"],
  error: "Elige primero la sección: la subsección va dentro de ella.",
});

export type EntradaPregunta = z.input<typeof entradaPreguntaSchema>;
export type EntradaPreguntaValida = z.output<typeof entradaPreguntaSchema>;

export type FilaPregunta = {
  seccion: string | null;
  subseccion: string | null;
  tipo: TipoPregunta;
  categoria: Categoria;
  enunciado: string;
  pista: string | null;
  opciones: string[] | null;
  respuestas_aceptadas: string[] | string[][] | null;
  rubrica: string | null;
  puntaje: number;
  material_id: number | null;
};

export function aFila(p: EntradaPreguntaValida): FilaPregunta {
  const base = {
    seccion: p.seccion,
    subseccion: p.subseccion,
    tipo: p.tipo,
    categoria: p.categoria,
    enunciado: p.enunciado,
    pista: p.pista,
    puntaje: p.puntaje,
    material_id: p.material_id,
  };
  switch (p.tipo) {
    case "multiple_choice": {
      // Índices → textos, en el orden de las opciones.
      const correctas = [...new Set(p.correctas)]
        .filter((i) => i < p.opciones.length)
        .sort((a, b) => a - b)
        .map((i) => p.opciones[i]);
      return { ...base, opciones: p.opciones, respuestas_aceptadas: correctas, rubrica: null };
    }
    case "fill_blank":
      return { ...base, opciones: null, respuestas_aceptadas: p.variantes, rubrica: null };
    case "translation":
      return { ...base, opciones: null, respuestas_aceptadas: p.traducciones, rubrica: null };
    case "open":
      return { ...base, opciones: null, respuestas_aceptadas: null, rubrica: p.rubrica || null };
  }
}

// ─── Estado del formulario (todos los campos de todos los tipos) ──────────────

export type EstadoFormulario = {
  tipo: TipoPregunta;
  categoria: Categoria;
  seccion: string;
  subseccion: string;
  enunciado: string;
  pista: string;
  puntaje: string;
  opciones: string[];
  correctas: number[];
  variantes: string[][];
  traducciones: string[];
  rubrica: string;
  /** Lectura o audio ligado (id), o null. */
  material_id: number | null;
};

export function estadoInicial(
  p: PreguntaStaff | null,
  seccionSugerida = "",
  subseccionSugerida = "",
): EstadoFormulario {
  if (!p) {
    return {
      tipo: "multiple_choice",
      categoria: CATEGORIA_POR_DEFECTO.multiple_choice,
      seccion: seccionSugerida,
      subseccion: seccionSugerida ? subseccionSugerida : "",
      enunciado: "",
      pista: "",
      puntaje: "10",
      opciones: ["", ""],
      correctas: [],
      variantes: [[]],
      traducciones: [],
      rubrica: "",
      material_id: null,
    };
  }
  const opciones = p.opciones ?? ["", ""];
  const aceptadas = p.respuestas_aceptadas ?? [];
  return {
    tipo: p.tipo,
    categoria: p.categoria,
    seccion: p.seccion ?? "",
    subseccion: p.subseccion ?? "",
    enunciado: p.enunciado,
    pista: p.pista ?? "",
    puntaje: String(p.puntaje),
    opciones,
    correctas:
      p.tipo === "multiple_choice"
        ? opciones.flatMap((o, i) => ((aceptadas as string[]).includes(o) ? [i] : []))
        : [],
    variantes: p.tipo === "fill_blank" ? (aceptadas as string[][]) : [[]],
    traducciones: p.tipo === "translation" ? (aceptadas as string[]) : [],
    rubrica: p.rubrica ?? "",
    material_id: p.material_id,
  };
}

// Cuántas listas de variantes pide un fill_blank: una por ___, o una si no hay ___.
export function listasNecesarias(enunciado: string): number {
  return Math.max(1, contarEspacios(enunciado));
}

// Ajusta las listas de variantes al número de espacios, conservando las existentes.
export function ajustarVariantes(variantes: string[][], enunciado: string): string[][] {
  const n = listasNecesarias(enunciado);
  return Array.from({ length: n }, (_, i) => variantes[i] ?? []);
}

export function entradaDesdeEstado(e: EstadoFormulario): EntradaPregunta {
  const comunesEntrada = {
    seccion: e.seccion,
    subseccion: e.subseccion,
    categoria: e.categoria,
    enunciado: e.enunciado,
    // La pista solo se muestra en preguntas de completar (como en a2).
    pista: e.tipo === "fill_blank" ? e.pista : "",
    puntaje: e.puntaje.trim() === "" ? Number.NaN : Number(e.puntaje.replace(",", ".")),
    material_id: e.material_id,
  };
  switch (e.tipo) {
    case "multiple_choice":
      return {
        tipo: "multiple_choice",
        ...comunesEntrada,
        // Las opciones vacías del final no cuentan (filas sin llenar).
        opciones: e.opciones.map((o) => o.trim()).filter(Boolean),
        correctas: mapearCorrectas(e.opciones, e.correctas),
      };
    case "fill_blank":
      return {
        tipo: "fill_blank",
        ...comunesEntrada,
        variantes: ajustarVariantes(e.variantes, e.enunciado),
      };
    case "translation":
      return { tipo: "translation", ...comunesEntrada, traducciones: e.traducciones };
    case "open":
      return { tipo: "open", ...comunesEntrada, rubrica: e.rubrica };
  }
}

// Al quitar las opciones vacías los índices se corren: recalcularlos.
function mapearCorrectas(opciones: string[], correctas: number[]): number[] {
  const nuevos: number[] = [];
  let j = 0;
  opciones.forEach((o, i) => {
    if (!o.trim()) return;
    if (correctas.includes(i)) nuevos.push(j);
    j++;
  });
  return nuevos;
}

// Pregunta con respuestas: solo se envían las listas (el servidor une con lo que ya hay).
// open no admite variantes → null.
export function variantesDesdeEstado(e: EstadoFormulario): EntradaVariantes | null {
  switch (e.tipo) {
    case "multiple_choice":
      return { tipo: "multiple_choice", correctas: e.correctas.map((i) => e.opciones[i]) };
    case "fill_blank":
      return { tipo: "fill_blank", variantes: e.variantes };
    case "translation":
      return { tipo: "translation", traducciones: e.traducciones };
    case "open":
      return null;
  }
}

// Lo que vería el estudiante con el estado actual del formulario.
export function vistaPreviaDesdeEstado(e: EstadoFormulario): PreguntaPublica {
  return {
    id: 0,
    orden: 1,
    seccion: e.seccion.trim() || null,
    tipo: e.tipo,
    enunciado: e.enunciado,
    pista: e.tipo === "fill_blank" ? e.pista.trim() || null : null,
    opciones:
      e.tipo === "multiple_choice" ? e.opciones.map((o) => o.trim()).filter(Boolean) : null,
    espacios: e.tipo === "fill_blank" ? listasNecesarias(e.enunciado) : null,
    material_id: e.material_id,
    subseccion: e.seccion.trim() ? e.subseccion.trim() || null : null,
  };
}
