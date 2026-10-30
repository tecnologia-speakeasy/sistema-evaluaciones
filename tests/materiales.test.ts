import { describe, expect, it } from "vitest";
import { entradaPreguntaSchema } from "../lib/preguntas/entrada";
import { aFilaMaterial, entradaMaterialSchema } from "../lib/preguntas/materiales";

describe("entradaMaterialSchema (lecturas y audios)", () => {
  it("lectura: título y texto obligatorios; sin URL de audio", () => {
    const m = entradaMaterialSchema.parse({ tipo: "lectura", titulo: "  Reading 1 ", texto: " Texto \n largo " });
    expect(aFilaMaterial(m)).toEqual({ tipo: "lectura", titulo: "Reading 1", texto: "Texto \n largo", audio_url: null });
    expect(entradaMaterialSchema.safeParse({ tipo: "lectura", titulo: "R", texto: "  " }).success).toBe(false);
    expect(entradaMaterialSchema.safeParse({ tipo: "lectura", titulo: " ", texto: "x" }).success).toBe(false);
  });

  it("audio: enlace http(s) obligatorio; la indicación es opcional (vacía = null)", () => {
    const m = entradaMaterialSchema.parse({ tipo: "audio", titulo: "Recording 1", audio_url: " https://x.test/a.mp3 ", texto: "" });
    expect(aFilaMaterial(m)).toEqual({ tipo: "audio", titulo: "Recording 1", texto: null, audio_url: "https://x.test/a.mp3" });
    for (const url of ["", "x.mp3", "ftp://x.test/a.mp3", "https://x.test/a b.mp3"]) {
      expect(entradaMaterialSchema.safeParse({ tipo: "audio", titulo: "R", audio_url: url, texto: "" }).success).toBe(false);
    }
  });

  it("una pregunta sin lectura ni audio guarda material_id = null", () => {
    const entrada = {
      tipo: "translation" as const, seccion: "", categoria: "writing" as const, enunciado: "Hola", pista: "", puntaje: 10, traducciones: ["Hi"],
    };
    expect(entradaPreguntaSchema.parse(entrada).material_id).toBeNull();
    expect(entradaPreguntaSchema.parse({ ...entrada, material_id: 4 }).material_id).toBe(4);
    expect(entradaPreguntaSchema.safeParse({ ...entrada, material_id: 0 }).success).toBe(false);
  });
});
