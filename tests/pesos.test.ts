import { describe, expect, it } from "vitest";
import { pesosPorPregunta } from "../lib/preguntas/pesos";

describe("PESOS_POR_PREGUNTA", () => {
  it("apagado por defecto (sin variable, vacía o false): todas valen lo mismo", () => {
    expect(pesosPorPregunta({})).toBe(false);
    expect(pesosPorPregunta({ PESOS_POR_PREGUNTA: "" })).toBe(false);
    expect(pesosPorPregunta({ PESOS_POR_PREGUNTA: "false" })).toBe(false);
    expect(pesosPorPregunta({ PESOS_POR_PREGUNTA: "no" })).toBe(false);
  });

  it("se enciende con true (como PREGUNTAS_ABIERTAS_ACTIVAS: también 1 / sí)", () => {
    for (const v of ["true", " TRUE ", "1", "si", "sí"]) {
      expect(pesosPorPregunta({ PESOS_POR_PREGUNTA: v })).toBe(true);
    }
  });
});
