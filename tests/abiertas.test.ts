import { describe, expect, it } from "vitest";
import { abiertasActivas, sqlSinAbiertas } from "../lib/preguntas/abiertas";

describe("PREGUNTAS_ABIERTAS_ACTIVAS", () => {
  it("apagadas por defecto (sin variable, vacía o false)", () => {
    expect(abiertasActivas({})).toBe(false);
    expect(abiertasActivas({ PREGUNTAS_ABIERTAS_ACTIVAS: "" })).toBe(false);
    expect(abiertasActivas({ PREGUNTAS_ABIERTAS_ACTIVAS: "false" })).toBe(false);
    expect(abiertasActivas({ PREGUNTAS_ABIERTAS_ACTIVAS: "no" })).toBe(false);
  });

  it("se encienden con true (como OTP_ACTIVO: también 1 / sí)", () => {
    for (const v of ["true", " TRUE ", "1", "si", "sí"]) {
      expect(abiertasActivas({ PREGUNTAS_ABIERTAS_ACTIVAS: v })).toBe(true);
    }
  });

  it("filtro SQL: apagadas deja fuera las abiertas; encendidas no filtra", () => {
    expect(sqlSinAbiertas("tipo", {})).toBe("tipo <> 'open'");
    expect(sqlSinAbiertas("p.tipo", {})).toBe("p.tipo <> 'open'");
    expect(sqlSinAbiertas("p.tipo", { PREGUNTAS_ABIERTAS_ACTIVAS: "true" })).toBe("TRUE");
  });
});
