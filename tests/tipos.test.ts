import { describe, expect, it } from "vitest";
import { codigoEvaluacion, EVALUACIONES_POR_GENERACION } from "../lib/tipos";
import { codigoEvaluacion as desdeResultados } from "../lib/resultados";

describe("codigoEvaluacion", () => {
  it("bienvenida es B; mensuales M1…M12, trimestrales T1…T4 y la final F", () => {
    expect(codigoEvaluacion("bienvenida", 1)).toBe("B");
    expect(codigoEvaluacion("mensual", 1)).toBe("M1");
    expect(codigoEvaluacion("mensual", 12)).toBe("M12");
    expect(codigoEvaluacion("trimestral", 4)).toBe("T4");
    expect(codigoEvaluacion("final", 1)).toBe("F");
  });

  it("lib/resultados reexporta la misma función", () => {
    expect(desdeResultados).toBe(codigoEvaluacion);
  });

  it("una generación completa tiene 18 (1 + 12 + 4 + 1, como generar_evaluaciones)", () => {
    expect(EVALUACIONES_POR_GENERACION).toBe(1 + 12 + 4 + 1);
  });
});
