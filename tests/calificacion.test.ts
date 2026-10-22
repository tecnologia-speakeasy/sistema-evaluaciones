import { describe, expect, it } from "vitest";
import {
  calificarPregunta,
  respuestaCorrectaVisible,
  resumirIntento,
  type PreguntaParaCalificar,
} from "../lib/grading/calificar";
import { normalize } from "../lib/grading/normalize";
import { celebracionPorPuntaje } from "../lib/celebracion";
import { formatearReloj, segundosRestantes, textoDuracion } from "../lib/intentos/reloj";

describe("normalize (portado de a2)", () => {
  it.each([
    ["  I WAS at home. ", "i was at home"],
    ["Sofía", "sofia"],
    ["doesn't", "does not"],
    ["doesn´t", "does not"],
    ["doesn’t", "does not"],
    ["Can't", "can not"],
    ["cannot", "can not"],
    ["won't", "will not"],
    ["isnt", "is not"],
    ["dont", "do not"],
    ["cant", "can not"],
    ["She's going to", "shes going to"],
    ["John's car", "johns car"],
    ["cell phone", "phone"],
    ["cellphone", "phone"],
    ["Clean up the room", "clean the room"],
    ["My dad and my mom", "my father and my mother"],
    ["¿Where are you?", "where are you"],
    ["a    b", "a b"],
    [null, ""],
  ])("%j → %j", (entrada, salida) => {
    expect(normalize(entrada)).toBe(salida);
  });

  it("las contracciones positivas no se expanden (se aceptan como variante)", () => {
    expect(normalize("I'm")).toBe("im");
    expect(normalize("I am")).not.toBe(normalize("I'm"));
  });
});

const pregunta = (p: Partial<PreguntaParaCalificar> & Pick<PreguntaParaCalificar, "tipo">): PreguntaParaCalificar => ({
  id: 1,
  categoria: "grammar",
  puntaje: 10,
  respuestas_aceptadas: null,
  ...p,
});

describe("calificarPregunta", () => {
  const mc = pregunta({ tipo: "multiple_choice", respuestas_aceptadas: ["was", "Were"] });

  it("selección múltiple: cualquiera de las correctas, normalizada", () => {
    expect(calificarPregunta(mc, "was")).toEqual({ respuesta: "was", es_correcta: true, puntaje: 10 });
    expect(calificarPregunta(mc, "were").es_correcta).toBe(true);
    expect(calificarPregunta(mc, "is")).toEqual({ respuesta: "is", es_correcta: false, puntaje: 0 });
  });

  it("sin responder = incorrecta, respuesta null", () => {
    for (const vacia of [undefined, null, "", "   ", ["a"]]) {
      expect(calificarPregunta(mc, vacia as never)).toEqual({ respuesta: null, es_correcta: false, puntaje: 0 });
    }
  });

  const fill = pregunta({
    tipo: "fill_blank",
    categoria: "writing",
    puntaje: 5,
    respuestas_aceptadas: [["is going to", "'s going to"], ["visit"]],
  });

  it("completar: todos los espacios con alguna de sus variantes", () => {
    expect(calificarPregunta(fill, ["IS going to", "visit."])).toEqual({
      respuesta: ["IS going to", "visit."],
      es_correcta: true,
      puntaje: 5,
    });
    expect(calificarPregunta(fill, ["’s going to", "visit"]).es_correcta).toBe(true);
  });

  it("completar: un espacio mal o vacío = incorrecta (se guarda lo que escribió)", () => {
    expect(calificarPregunta(fill, ["is going to", "visits"])).toMatchObject({ es_correcta: false, puntaje: 0 });
    expect(calificarPregunta(fill, ["is going to"])).toEqual({
      respuesta: ["is going to", ""],
      es_correcta: false,
      puntaje: 0,
    });
    expect(calificarPregunta(fill, ["", ""]).respuesta).toBeNull();
    expect(calificarPregunta(fill, "is going to").respuesta).toBeNull();
  });

  it("traducción: coincide con alguna variante", () => {
    const t = pregunta({ tipo: "translation", respuestas_aceptadas: ["I was at home yesterday.", "Yesterday I was at home."] });
    expect(calificarPregunta(t, "yesterday i was at home").es_correcta).toBe(true);
    expect(calificarPregunta(t, "I am at home").es_correcta).toBe(false);
  });

  it("abierta: con respuesta queda pendiente (IA); vacía vale 0 de una vez", () => {
    const o = pregunta({ tipo: "open" });
    expect(calificarPregunta(o, "My name is Ana")).toEqual({ respuesta: "My name is Ana", es_correcta: null, puntaje: null });
    expect(calificarPregunta(o, "  ")).toEqual({ respuesta: null, es_correcta: false, puntaje: 0 });
  });
});

describe("resumirIntento", () => {
  const item = (categoria: "grammar" | "writing", puntaje: number, es_correcta: boolean | null) => ({
    pregunta: { categoria, puntaje },
    calificacion: { respuesta: "x", es_correcta, puntaje: es_correcta === null ? null : es_correcta ? puntaje : 0 },
  });

  it("sin pesos (por defecto): todas valen lo mismo, sin importar su puntaje", () => {
    // 2 de 3 preguntas = 67, aunque la que falló «pesaba» 15 de 30.
    expect(resumirIntento([item("grammar", 10, true), item("writing", 5, true), item("writing", 15, false)])).toEqual({
      pendiente: false,
      puntaje_total: 67,
      grammar_score: 1,
      writing_score: 1,
    });
    // 10 preguntas: 10 puntos cada una.
    const diez = Array.from({ length: 10 }, (_, i) => item("grammar", i === 0 ? 20 : 10, i < 7));
    expect(resumirIntento(diez).puntaje_total).toBe(70);
  });

  it("sin pesos: una abierta aporta su nota (8 de 10 → 0,8 de una pregunta)", () => {
    const abierta = { pregunta: { categoria: "writing" as const, puntaje: 20 }, calificacion: { respuesta: "x", es_correcta: true, puntaje: 16 } };
    // (1 + 0,8) / 2 = 90
    expect(resumirIntento([item("grammar", 10, true), abierta]).puntaje_total).toBe(90);
  });

  it("con PESOS_POR_PREGUNTA: ponderado por el puntaje de cada pregunta, 0–100 redondeado", () => {
    // 10 + 5 de 10 + 5 + 15 = 15/30 = 50
    expect(
      resumirIntento([item("grammar", 10, true), item("writing", 5, true), item("writing", 15, false)], true),
    ).toEqual({
      pendiente: false,
      puntaje_total: 50,
      grammar_score: 1,
      writing_score: 1,
    });
    expect(resumirIntento([item("grammar", 1, true), item("grammar", 1, true), item("grammar", 1, false)], true).puntaje_total).toBe(67);
  });

  it("con una abierta pendiente: sin puntaje final; los aciertos cerrados sí cuentan", () => {
    for (const pesos of [false, true]) {
      expect(resumirIntento([item("grammar", 10, true), item("writing", 10, null)], pesos)).toEqual({
        pendiente: true,
        puntaje_total: null,
        grammar_score: 1,
        writing_score: 0,
      });
    }
  });

  it("sin preguntas: 0", () => {
    expect(resumirIntento([]).puntaje_total).toBe(0);
    expect(resumirIntento([], true).puntaje_total).toBe(0);
  });
});

describe("respuestaCorrectaVisible", () => {
  it("la primera variante (en selección múltiple, todas las correctas)", () => {
    expect(respuestaCorrectaVisible({ tipo: "multiple_choice", respuestas_aceptadas: ["was", "were"] })).toBe("was / were");
    expect(respuestaCorrectaVisible({ tipo: "fill_blank", respuestas_aceptadas: [["is going to", "'s going to"], ["visit"]] })).toEqual([
      "is going to",
      "visit",
    ]);
    expect(respuestaCorrectaVisible({ tipo: "translation", respuestas_aceptadas: ["I was at home.", "x"] })).toBe("I was at home.");
    expect(respuestaCorrectaVisible({ tipo: "open", respuestas_aceptadas: null })).toBeNull();
  });
});

describe("celebración por puntaje (rangos de a2, límite superior incluido)", () => {
  it.each([
    [0, "/calificaciones/20.png", "¡Gracias por intentarlo!"],
    [20, "/calificaciones/20.png", "¡Gracias por intentarlo!"],
    [21, "/calificaciones/50.png", "¡Gracias por intentarlo!"],
    [60, "/calificaciones/60.png", "¡Gracias por intentarlo!"],
    [70, "/calificaciones/70.png", "¡Gracias por intentarlo!"],
    [71, "/calificaciones/80.png", "¡Lo estás haciendo bien!"],
    [90, "/calificaciones/90.png", "¡Felicitaciones!"],
    [91, "/calificaciones/100.png", "¡Felicitaciones!"],
    [100, "/calificaciones/100.png", "¡Felicitaciones!"],
    [null, "/TROFEO.png", "¡Felicitaciones!"],
    [101, "/TROFEO.png", "¡Felicitaciones!"],
  ])("%j → %s", (puntaje, img, titulo) => {
    expect(celebracionPorPuntaje(puntaje)).toMatchObject({ img, titulo });
  });
});

describe("reloj del examen", () => {
  it("segundos restantes desde el inicio, nunca negativos", () => {
    const inicio = Date.UTC(2026, 9, 16, 15, 0, 0);
    expect(segundosRestantes(inicio, 45, inicio)).toBe(2700);
    expect(segundosRestantes(inicio, 45, inicio + 1500)).toBe(2699); // redondea hacia arriba
    expect(segundosRestantes(inicio, 45, inicio + 46 * 60_000)).toBe(0);
  });

  it("formato HH:MM:SS y texto de duración como a2", () => {
    expect(formatearReloj(5025)).toBe("01:23:45");
    expect(formatearReloj(0)).toBe("00:00:00");
    expect(textoDuracion(120)).toBe("2:00 horas");
    expect(textoDuracion(90)).toBe("1:30 horas");
    expect(textoDuracion(60)).toBe("1:00 hora");
    expect(textoDuracion(45)).toBe("45 minutos");
    expect(textoDuracion(1)).toBe("1 minuto");
  });
});
