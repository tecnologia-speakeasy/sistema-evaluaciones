// Tipos de pregunta compartidos por el servidor, el dashboard y la vista del estudiante.

export const TIPOS_PREGUNTA = ["multiple_choice", "fill_blank", "translation", "open"] as const;
export type TipoPregunta = (typeof TIPOS_PREGUNTA)[number];
export type Categoria = "grammar" | "writing";

export const ETIQUETA_TIPO: Record<TipoPregunta, string> = {
  multiple_choice: "Selección múltiple",
  fill_blank: "Completar",
  translation: "Traducción",
  open: "Abierta",
};

export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  grammar: "Grammar",
  writing: "Writing",
};

// Como en a2: selección múltiple cuenta para Grammar; lo que se escribe, para Writing.
export const CATEGORIA_POR_DEFECTO: Record<TipoPregunta, Categoria> = {
  multiple_choice: "grammar",
  fill_blank: "writing",
  translation: "writing",
  open: "writing",
};

// Lo ÚNICO que llega al navegador del estudiante: las columnas de v_preguntas_publicas.
// Sin respuestas_aceptadas ni rubrica (regla de seguridad 1).
export type PreguntaPublica = {
  id: number;
  orden: number;
  seccion: string | null;
  tipo: TipoPregunta;
  enunciado: string;
  pista: string | null;
  opciones: string[] | null;
  /** fill_blank: cuántos campos mostrar. */
  espacios: number | null;
  /** Lectura o audio que va encima (lib/preguntas/materiales.ts), o null. */
  material_id: number | null;
  /** Rótulo dentro de la sección («Section A»), o null (db/010). */
  subseccion: string | null;
};

// Pregunta completa, solo para el staff.
export type PreguntaStaff = {
  id: number;
  orden: number;
  seccion: string | null;
  tipo: TipoPregunta;
  categoria: Categoria;
  enunciado: string;
  pista: string | null;
  opciones: string[] | null;
  respuestas_aceptadas: string[] | string[][] | null;
  rubrica: string | null;
  puntaje: number;
  activa: boolean;
  /** Cuántas respuestas de estudiantes tiene (si > 0, solo se pueden agregar variantes). */
  respuestas: number;
  material_id: number | null;
  subseccion: string | null;
};

// Mismo patrón que el trigger validar_pregunta: 3 o más guiones bajos = un espacio.
const PATRON_ESPACIO = /_{3,}/g;

export function contarEspacios(enunciado: string): number {
  return enunciado.match(PATRON_ESPACIO)?.length ?? 0;
}

export function partirEnunciado(enunciado: string): string[] {
  return enunciado.split(/_{3,}/);
}

// Como a2 con sus "Parts": las preguntas consecutivas con la misma sección forman
// un bloque; la numeración y el contador "n/total" reinician en cada bloque.
// La subsección no corta el bloque: en el Placement Test la numeración sigue de
// la Section A a la B.
export type PosicionEnSeccion = {
  /** Número dentro de la sección, desde 1. */
  numero: number;
  /** Índice global donde empieza la sección. */
  inicio: number;
  /** Cuántas preguntas tiene la sección. */
  largo: number;
};

export function posicionesPorSeccion(preguntas: { seccion: string | null }[]): PosicionEnSeccion[] {
  const posiciones: PosicionEnSeccion[] = [];
  let inicio = 0;
  for (let i = 0; i <= preguntas.length; i++) {
    const corta = i === preguntas.length || (i > 0 && preguntas[i].seccion !== preguntas[i - 1].seccion);
    if (corta && i > inicio) {
      for (let j = inicio; j < i; j++) {
        posiciones.push({ numero: j - inicio + 1, inicio, largo: i - inicio });
      }
      inicio = i;
    }
  }
  return posiciones;
}
