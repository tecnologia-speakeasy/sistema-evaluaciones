import { describe, expect, it } from "vitest";
import { traducirErrorBD } from "../lib/db-errores";
import { formatearFecha, formatearFechaHora, fechaHoraLocalSchema } from "../lib/fechas";

// Mensajes y nombres tal como los produce db/001_schema.sql en Postgres 17
// (verificados contra una base real en la integración).
const trigger = (message: string) => ({ code: "P0001", message });
const constraint = (code: string, constraint: string) => ({ code, constraint, message: "x" });

describe("traducirErrorBD: mensajes de validar_pregunta → campo del formulario", () => {
  it.each([
    ['Selección múltiple: "opciones" debe ser una lista de al menos 2', "opciones"],
    ["Selección múltiple: marca al menos una respuesta correcta", "correctas"],
    ['Selección múltiple: la respuesta "was" no está entre las opciones', "correctas"],
    ["Completar: define las variantes de al menos un espacio", "variantes"],
    ["Completar: cada espacio necesita al menos una variante", "variantes"],
    ["Completar: el enunciado tiene 2 espacios y hay 1 listas de variantes", "enunciado"],
    ["Traducción: agrega al menos una traducción válida", "traducciones"],
    ["Traducción: cada variante debe ser un texto", "traducciones"],
    ["Abierta: escribe la rúbrica para la calificación con IA", "rubrica"],
  ])("%s → %s", (mensaje, campo) => {
    expect(traducirErrorBD(trigger(mensaje))?.campo).toBe(campo);
  });

  it("incluye los números del enunciado con espacios", () => {
    expect(traducirErrorBD(trigger("Completar: el enunciado tiene 3 espacios y hay 1 listas de variantes"))?.mensaje).toBe(
      "El enunciado tiene 3 espacio(s) ___ pero hay respuestas para 1. Deben coincidir.",
    );
  });

  it("otro RAISE EXCEPTION pasa tal cual (ya está en español)", () => {
    expect(traducirErrorBD(trigger("La evaluación gen-1-m01 está fuera de fecha"))).toEqual({
      mensaje: "La evaluación gen-1-m01 está fuera de fecha",
    });
  });
});

describe("traducirErrorBD: constraints", () => {
  it.each([
    ["23505", "generaciones_codigo_key", "codigo"],
    ["23514", "generaciones_codigo_check", "codigo"],
    ["23514", "evaluaciones_check1", "cierre"],
    ["23514", "evaluaciones_duracion_min_check", "duracion_min"],
    ["23514", "evaluaciones_intentos_permitidos_check", "intentos_permitidos"],
    ["23514", "preguntas_puntaje_check", "puntaje"],
  ])("%s %s → %s", (code, nombre, campo) => {
    expect(traducirErrorBD(constraint(code, nombre))?.campo).toBe(campo);
  });

  it("borrar una pregunta con respuestas (FK RESTRICT)", () => {
    expect(traducirErrorBD(constraint("23503", "respuestas_pregunta_id_fkey"))?.mensaje).toMatch(/desactívala/);
  });

  it("lo no reconocido devuelve null (la action lo registra y da un mensaje genérico)", () => {
    expect(traducirErrorBD(constraint("23505", "otra_cosa"))).toBeNull();
    expect(traducirErrorBD(new Error("x"))).toBeNull();
    expect(traducirErrorBD(null)).toBeNull();
  });
});

describe("fechas (hora de Colombia, sin conversiones en el cliente)", () => {
  it("formatea datetime-local y date", () => {
    expect(formatearFechaHora("2026-11-03T08:05")).toBe("3 nov 2026, 8:05 a. m.");
    expect(formatearFechaHora("2026-11-03T00:30")).toBe("3 nov 2026, 12:30 a. m.");
    expect(formatearFechaHora("2026-11-03T12:00")).toBe("3 nov 2026, 12:00 p. m.");
    expect(formatearFechaHora("2026-11-03T20:30")).toBe("3 nov 2026, 8:30 p. m.");
    expect(formatearFecha("2026-10-01")).toBe("1 oct 2026");
    expect(formatearFechaHora(null)).toBe("");
  });

  it("valida el valor del input: vacío = sin fecha", () => {
    expect(fechaHoraLocalSchema.parse("")).toBeNull();
    expect(fechaHoraLocalSchema.parse("2026-11-03T08:00")).toBe("2026-11-03T08:00");
    expect(fechaHoraLocalSchema.safeParse("mañana").success).toBe(false);
  });
});
