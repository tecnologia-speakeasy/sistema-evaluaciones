import { z } from "zod";
import { ErrorNegocio } from "@/lib/errores";
import type { TipoPregunta } from "./tipos";

// Regla de seguridad 7: una pregunta que ya tiene respuestas solo admite AGREGAR
// variantes aceptadas. Nada de lo que ya estaba se puede quitar ni cambiar.

const respuestaTexto = z
  .string()
  .trim()
  .min(1, "Hay una respuesta vacía")
  .max(500, "Una respuesta es demasiado larga");

export const entradaVariantesSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("multiple_choice"),
    /** Textos de opciones existentes que pasan a ser correctas. */
    correctas: z.array(z.string()).max(10),
  }),
  z.object({
    tipo: z.literal("fill_blank"),
    variantes: z.array(z.array(respuestaTexto).max(30)).max(20),
  }),
  z.object({
    tipo: z.literal("translation"),
    traducciones: z.array(respuestaTexto).max(30),
  }),
]);

export type EntradaVariantes = z.input<typeof entradaVariantesSchema>;

type Actual = {
  tipo: TipoPregunta;
  opciones: string[] | null;
  respuestas_aceptadas: string[] | string[][] | null;
};

function unir(actuales: string[], nuevas: string[]): string[] {
  const resultado = [...actuales];
  for (const v of nuevas) if (!resultado.includes(v)) resultado.push(v);
  return resultado;
}

// Devuelve el nuevo respuestas_aceptadas = actuales ∪ nuevas. Nunca quita nada.
export function unirVariantes(
  actual: Actual,
  nuevas: z.output<typeof entradaVariantesSchema>,
): { respuestas_aceptadas: string[] | string[][]; agregadas: number } {
  if (actual.tipo !== nuevas.tipo) {
    throw new ErrorNegocio("El tipo de la pregunta no coincide.");
  }

  switch (nuevas.tipo) {
    case "multiple_choice": {
      const opciones = actual.opciones ?? [];
      const ajenas = nuevas.correctas.filter((c) => !opciones.includes(c));
      if (ajenas.length) {
        throw new ErrorNegocio("Solo puedes marcar opciones que ya existen.", "correctas");
      }
      const actuales = (actual.respuestas_aceptadas ?? []) as string[];
      const union = unir(actuales, nuevas.correctas);
      // En el orden de las opciones, como al crearla.
      const ordenadas = opciones.filter((o) => union.includes(o));
      return { respuestas_aceptadas: ordenadas, agregadas: ordenadas.length - actuales.length };
    }
    case "fill_blank": {
      const actuales = (actual.respuestas_aceptadas ?? []) as string[][];
      if (nuevas.variantes.length !== actuales.length) {
        throw new ErrorNegocio(
          `La pregunta tiene ${actuales.length} espacio(s); no se pueden agregar ni quitar espacios.`,
          "variantes",
        );
      }
      let agregadas = 0;
      const resultado = actuales.map((lista, i) => {
        const u = unir(lista, nuevas.variantes[i]);
        agregadas += u.length - lista.length;
        return u;
      });
      return { respuestas_aceptadas: resultado, agregadas };
    }
    case "translation": {
      const actuales = (actual.respuestas_aceptadas ?? []) as string[];
      const u = unir(actuales, nuevas.traducciones);
      return { respuestas_aceptadas: u, agregadas: u.length - actuales.length };
    }
  }
}
