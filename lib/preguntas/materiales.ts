import { z } from "zod";

// Lecturas y audios (db/009): un texto o una grabación con varias preguntas
// ligadas (preguntas.material_id), como las «Reading» y «Recording» del Placement
// Test. El estudiante lo ve encima de cada pregunta ligada.

export const TIPOS_MATERIAL = ["lectura", "audio"] as const;
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number];

export const ETIQUETA_MATERIAL: Record<TipoMaterial, string> = {
  lectura: "Lectura",
  audio: "Audio",
};

/** Lo que ve el estudiante (no tiene nada secreto). */
export type Material = {
  id: number;
  tipo: TipoMaterial;
  titulo: string;
  /** Lectura: el texto. Audio: indicación opcional (ej. "Listen to Emma…"). */
  texto: string | null;
  audio_url: string | null;
};

/** Para el editor del staff. */
export type MaterialStaff = Material & {
  /** Preguntas ligadas (activas o no). */
  preguntas: number;
  /** Alguna de sus preguntas ya tiene respuestas de estudiantes. */
  con_respuestas: boolean;
};

const titulo = z
  .string({ error: "Escribe el título" })
  .trim()
  .min(1, "Escribe el título")
  .max(200, "El título es demasiado largo");

export const entradaMaterialSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("lectura"),
    titulo,
    texto: z
      .string({ error: "Escribe el texto" })
      .trim()
      .min(1, "Escribe el texto de la lectura")
      .max(20000, "El texto es demasiado largo"),
  }),
  z.object({
    tipo: z.literal("audio"),
    titulo,
    audio_url: z
      .string({ error: "Sube el audio o pega su enlace" })
      .trim()
      .min(1, "Sube el audio o pega su enlace")
      .max(1000, "El enlace es demasiado largo")
      .refine((v) => /^https?:\/\/\S+$/i.test(v), "El enlace debe empezar por https://"),
    texto: z
      .string()
      .trim()
      .max(2000, "La indicación es demasiado larga")
      .transform((v) => v || null),
  }),
]);

export type EntradaMaterial = z.input<typeof entradaMaterialSchema>;

/** Fila de la tabla `materiales` a partir de la entrada validada. */
export function aFilaMaterial(m: z.output<typeof entradaMaterialSchema>): Omit<Material, "id"> {
  return m.tipo === "lectura"
    ? { tipo: "lectura", titulo: m.titulo, texto: m.texto, audio_url: null }
    : { tipo: "audio", titulo: m.titulo, texto: m.texto, audio_url: m.audio_url };
}

// Audios: tipos de archivo y tamaño que acepta la subida (Vercel Blob).
export const TIPOS_AUDIO = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
];
export const MAX_AUDIO_MB = 50;
