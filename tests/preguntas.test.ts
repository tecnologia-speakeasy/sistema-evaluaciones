import { describe, expect, it } from "vitest";
import {
  aFila,
  ajustarVariantes,
  entradaDesdeEstado,
  entradaPreguntaSchema,
  estadoInicial,
  variantesDesdeEstado,
  vistaPreviaDesdeEstado,
  type EstadoFormulario,
} from "../lib/preguntas/entrada";
import { contarEspacios, posicionesPorSeccion, type PreguntaStaff } from "../lib/preguntas/tipos";
import { entradaVariantesSchema, unirVariantes } from "../lib/preguntas/variantes";
import { ErrorNegocio } from "../lib/errores";

const comunes = { seccion: "", categoria: "grammar" as const, pista: "", puntaje: 10 };

describe("contarEspacios (mismo patrón que el trigger: 3+ guiones bajos)", () => {
  it("cuenta cada grupo de ___ una vez", () => {
    expect(contarEspacios("I ___ home and she ______ there.")).toBe(2);
    expect(contarEspacios("go → ______")).toBe(1);
    expect(contarEspacios("snake_case y __ no cuentan")).toBe(0);
  });
});

describe("aFila", () => {
  it("MC: índices de correctas → textos, en el orden de las opciones", () => {
    const f = aFila(
      entradaPreguntaSchema.parse({
        tipo: "multiple_choice", ...comunes, enunciado: "x",
        opciones: ["were", "was", "is"], correctas: [2, 1, 1],
      }),
    );
    expect(f.opciones).toEqual(["were", "was", "is"]);
    expect(f.respuestas_aceptadas).toEqual(["was", "is"]);
    expect(f.rubrica).toBeNull();
  });

  it("fill_blank: una lista por espacio; translation: lista plana; open: rúbrica", () => {
    expect(
      aFila(entradaPreguntaSchema.parse({ tipo: "fill_blank", ...comunes, enunciado: "I ___.", variantes: [["was"]] }))
        .respuestas_aceptadas,
    ).toEqual([["was"]]);
    expect(
      aFila(entradaPreguntaSchema.parse({ tipo: "translation", ...comunes, enunciado: "x", traducciones: ["I was."] }))
        .respuestas_aceptadas,
    ).toEqual(["I was."]);
    const abierta = aFila(entradaPreguntaSchema.parse({ tipo: "open", ...comunes, enunciado: "x", rubrica: "  " }));
    expect(abierta.rubrica).toBeNull(); // vacía → NULL, y el trigger da el mensaje
    expect(abierta.respuestas_aceptadas).toBeNull();
  });

  it("sección y pista vacías se guardan como NULL", () => {
    const f = aFila(entradaPreguntaSchema.parse({ tipo: "translation", ...comunes, seccion: "  ", enunciado: "x", traducciones: ["a"] }));
    expect(f.seccion).toBeNull();
    expect(f.pista).toBeNull();
  });
});

describe("entradaPreguntaSchema (solo forma; las reglas por tipo son del trigger)", () => {
  const error = (v: unknown) => {
    const r = entradaPreguntaSchema.safeParse(v);
    return r.success ? null : { campo: r.error.issues[0].path[0], mensaje: r.error.issues[0].message };
  };

  it("enunciado vacío, puntaje inválido y opciones repetidas", () => {
    expect(error({ tipo: "open", ...comunes, enunciado: "  ", rubrica: "r" })).toEqual({ campo: "enunciado", mensaje: "Escribe el enunciado" });
    expect(error({ tipo: "open", ...comunes, puntaje: 0, enunciado: "x", rubrica: "r" })?.campo).toBe("puntaje");
    expect(error({ tipo: "open", ...comunes, puntaje: Number.NaN, enunciado: "x", rubrica: "r" })?.mensaje).toBe("Escribe el puntaje");
    expect(error({ tipo: "multiple_choice", ...comunes, enunciado: "x", opciones: ["Was", "was"], correctas: [0] })).toEqual({ campo: "opciones", mensaje: "Hay opciones repetidas" });
  });

  it("no repite reglas del trigger: 1 opción o 0 correctas pasan la forma", () => {
    expect(error({ tipo: "multiple_choice", ...comunes, enunciado: "x", opciones: ["was"], correctas: [] })).toBeNull();
    expect(error({ tipo: "translation", ...comunes, enunciado: "x", traducciones: [] })).toBeNull();
  });
});

describe("estado del formulario", () => {
  const base = (): EstadoFormulario => ({ ...estadoInicial(null), enunciado: "x" });

  it("quitar opciones vacías recalcula los índices de las correctas", () => {
    const e = { ...base(), opciones: ["", "was", "", "were"], correctas: [3] };
    const entrada = entradaDesdeEstado(e);
    expect(entrada).toMatchObject({ opciones: ["was", "were"], correctas: [1] });
  });

  it("las listas de variantes siguen a los ___ del enunciado sin perder lo escrito", () => {
    expect(ajustarVariantes([["a"]], "x ___ y ___ z ___")).toEqual([["a"], [], []]);
    expect(ajustarVariantes([["a"], ["b"]], "sin espacios")).toEqual([["a"]]);
  });

  it("la pista solo viaja en completar", () => {
    const e = { ...base(), pista: "(be)" };
    expect(entradaDesdeEstado({ ...e, tipo: "translation" }).pista).toBe("");
    expect(entradaDesdeEstado({ ...e, tipo: "fill_blank" }).pista).toBe("(be)");
  });

  it("puntaje con coma decimal", () => {
    expect(entradaDesdeEstado({ ...base(), puntaje: "2,5" }).puntaje).toBe(2.5);
  });

  it("estadoInicial ↔ pregunta guardada (MC marca las correctas por texto)", () => {
    const p: PreguntaStaff = {
      id: 1, orden: 1, seccion: null, tipo: "multiple_choice", categoria: "grammar",
      enunciado: "x", pista: null, opciones: ["a", "b", "c"], respuestas_aceptadas: ["c", "a"],
      rubrica: null, puntaje: 5, activa: true, respuestas: 0,
    };
    expect(estadoInicial(p)).toMatchObject({ correctas: [0, 2], puntaje: "5" });
  });

  it("vista previa: sin respuestas, con espacios para completar", () => {
    const v = vistaPreviaDesdeEstado({ ...base(), tipo: "fill_blank", enunciado: "a ___ b ___", variantes: [["x"], ["y"]] });
    expect(v).toMatchObject({ tipo: "fill_blank", espacios: 2, opciones: null });
    expect(Object.keys(v)).not.toContain("respuestas_aceptadas");
  });

  it("variantesDesdeEstado: MC manda textos; open no admite variantes", () => {
    expect(variantesDesdeEstado({ ...base(), opciones: ["a", "b"], correctas: [1] })).toEqual({ tipo: "multiple_choice", correctas: ["b"] });
    expect(variantesDesdeEstado({ ...base(), tipo: "open" })).toBeNull();
  });
});

describe("unirVariantes (regla 7: solo agregar)", () => {
  const parse = (v: unknown) => entradaVariantesSchema.parse(v);

  it("nunca quita lo que había, aunque el cliente lo omita", () => {
    const r = unirVariantes(
      { tipo: "translation", opciones: null, respuestas_aceptadas: ["I was home.", "I was at home."] },
      parse({ tipo: "translation", traducciones: ["I was at home.", "I've been home."] }),
    );
    expect(r).toEqual({ respuestas_aceptadas: ["I was home.", "I was at home.", "I've been home."], agregadas: 1 });
  });

  it("fill_blank: une espacio por espacio y no permite cambiar el número de espacios", () => {
    const actual = { tipo: "fill_blank" as const, opciones: null, respuestas_aceptadas: [["is going to"], ["will"]] };
    expect(unirVariantes(actual, parse({ tipo: "fill_blank", variantes: [["'s going to"], []] }))).toEqual({
      respuestas_aceptadas: [["is going to", "'s going to"], ["will"]],
      agregadas: 1,
    });
    expect(() => unirVariantes(actual, parse({ tipo: "fill_blank", variantes: [["x"]] }))).toThrow(ErrorNegocio);
  });

  it("MC: solo opciones existentes, resultado en el orden de las opciones", () => {
    const actual = { tipo: "multiple_choice" as const, opciones: ["a", "b", "c"], respuestas_aceptadas: ["c"] };
    expect(unirVariantes(actual, parse({ tipo: "multiple_choice", correctas: ["a"] }))).toEqual({ respuestas_aceptadas: ["a", "c"], agregadas: 1 });
    expect(() => unirVariantes(actual, parse({ tipo: "multiple_choice", correctas: ["z"] }))).toThrow(/existen/);
  });

  it("rechaza cambiar el tipo", () => {
    expect(() =>
      unirVariantes({ tipo: "open", opciones: null, respuestas_aceptadas: null }, parse({ tipo: "translation", traducciones: ["x"] })),
    ).toThrow(ErrorNegocio);
  });
});

describe("posicionesPorSeccion (numeración por Part, como a2)", () => {
  it("reinicia el número en cada sección consecutiva", () => {
    const pos = posicionesPorSeccion([
      { seccion: "Part 1" }, { seccion: "Part 1" }, { seccion: "Part 2" }, { seccion: null }, { seccion: null },
    ]);
    expect(pos.map((p) => `${p.numero}/${p.largo}@${p.inicio}`)).toEqual(["1/2@0", "2/2@0", "1/1@2", "1/2@3", "2/2@3"]);
  });
  it("lista vacía", () => {
    expect(posicionesPorSeccion([])).toEqual([]);
  });
});
