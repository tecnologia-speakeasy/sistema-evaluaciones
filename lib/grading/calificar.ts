import type { TipoPregunta } from "@/lib/preguntas/tipos";
import { normalize } from "./normalize";

// Calificación en el servidor (regla de seguridad 2). Puro: sin BD.
//   multiple_choice  la opción elegida está entre las correctas
//   fill_blank       cada espacio coincide con alguna de sus variantes
//   translation      coincide con alguna traducción válida
//   open             pendiente: la califica la IA (Fase 5). Vacía = 0 de una vez.
// Todo se compara con normalize() (como a2).

export type PreguntaParaCalificar = {
  id: number;
  tipo: TipoPregunta;
  categoria: "grammar" | "writing";
  puntaje: number;
  /** JSONB tal cual: string[] (mc / translation), string[][] (fill_blank), null (open). */
  respuestas_aceptadas: unknown;
};

/** Lo que manda el navegador: texto (mc, translation, open) o un texto por espacio (fill_blank). */
export type RespuestaDada = string | string[] | null | undefined;

export type Calificacion = {
  /** Lo que se guarda en respuestas.respuesta (null = sin responder). */
  respuesta: string | string[] | null;
  /** null = pendiente (abierta con respuesta, la califica la IA). */
  es_correcta: boolean | null;
  puntaje: number | null;
};

const textos = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? "")) : []);
const vacia = (s: string) => s.trim() === "";
const coincide = (dada: string, aceptadas: string[]) => {
  const n = normalize(dada);
  return n !== "" && aceptadas.some((a) => normalize(a) === n);
};

export function calificarPregunta(p: PreguntaParaCalificar, dada: RespuestaDada): Calificacion {
  const nota = (ok: boolean) => ({ es_correcta: ok, puntaje: ok ? p.puntaje : 0 });

  if (p.tipo === "fill_blank") {
    const variantes = Array.isArray(p.respuestas_aceptadas) ? p.respuestas_aceptadas.map(textos) : [];
    const espacios = Array.isArray(dada) ? variantes.map((_, i) => String(dada[i] ?? "")) : null;
    const ok =
      espacios !== null && variantes.length > 0 && variantes.every((v, i) => coincide(espacios[i], v));
    return { respuesta: espacios && espacios.some((e) => !vacia(e)) ? espacios : null, ...nota(ok) };
  }

  const texto = typeof dada === "string" && !vacia(dada) ? dada : null;
  if (p.tipo === "open") {
    return texto === null
      ? { respuesta: null, ...nota(false) }
      : { respuesta: texto, es_correcta: null, puntaje: null };
  }
  // multiple_choice y translation
  return { respuesta: texto, ...nota(texto !== null && coincide(texto, textos(p.respuestas_aceptadas))) };
}

export type ResumenIntento = {
  /** Hay abiertas esperando a la IA: sin puntaje final todavía. */
  pendiente: boolean;
  /** 0–100 = puntos obtenidos / puntos posibles × 100. null si está pendiente. */
  puntaje_total: number | null;
  /** Aciertos por categoría (como a2: "X/N"). */
  grammar_score: number;
  writing_score: number;
};

export function resumirIntento(
  calificadas: { pregunta: Pick<PreguntaParaCalificar, "categoria" | "puntaje">; calificacion: Calificacion }[],
): ResumenIntento {
  const pendiente = calificadas.some((c) => c.calificacion.es_correcta === null);
  const posibles = calificadas.reduce((s, c) => s + c.pregunta.puntaje, 0);
  const obtenidos = calificadas.reduce((s, c) => s + (c.calificacion.puntaje ?? 0), 0);
  const aciertos = (categoria: "grammar" | "writing") =>
    calificadas.filter((c) => c.pregunta.categoria === categoria && c.calificacion.es_correcta === true).length;
  return {
    pendiente,
    puntaje_total: pendiente ? null : posibles > 0 ? Math.round((obtenidos / posibles) * 100) : 0,
    grammar_score: aciertos("grammar"),
    writing_score: aciertos("writing"),
  };
}

// Respuesta correcta para mostrarle al estudiante en la revisión (solo con
// mostrar_correctas y cuando ya no le quedan intentos o la evaluación cerró):
// la primera variante aceptada; en selección múltiple, todas las correctas.
export function respuestaCorrectaVisible(
  p: Pick<PreguntaParaCalificar, "tipo" | "respuestas_aceptadas">,
): string | string[] | null {
  const lista = textos(p.respuestas_aceptadas);
  switch (p.tipo) {
    case "multiple_choice":
      return lista.length ? lista.join(" / ") : null;
    case "fill_blank":
      return Array.isArray(p.respuestas_aceptadas)
        ? p.respuestas_aceptadas.map((v) => textos(v)[0] ?? "")
        : null;
    case "translation":
      return lista[0] ?? null;
    case "open":
      return null;
  }
}
