import { describe, expect, it } from "vitest";
import {
  APROBAR,
  diagnosticar,
  dominio,
  NIVELES_BLOQUE,
  revisarEstructura,
  ubicarPregunta,
  type Diagnostico,
  type Habilidad,
  type NivelBloque,
} from "../lib/placement/diagnostico";
import {
  armarFeedbackPlacement,
  datosParaIA,
  leerFeedbackPlacement,
  observaciones,
  promptFeedbackPlacement,
  type RespuestaPlacement,
} from "../lib/placement/feedback";

type Aciertos = Record<Habilidad, number>;

// Un Placement Test de 88 preguntas con la forma de la guía y, por nivel,
// cuántas acertó en cada habilidad (las primeras de cada grupo).
function examen(por: Record<NivelBloque, Aciertos>): RespuestaPlacement[] {
  return Array.from({ length: 88 }, (_, i) => {
    const { nivel, habilidad } = ubicarPregunta(i + 1)!;
    const desde = { grammar: 1, reading: 61, listening: 77 }[habilidad];
    const porNivel = { grammar: 15, reading: 4, listening: 3 }[habilidad];
    const enGrupo = (i + 1 - desde) % porNivel;
    const ok = enGrupo < por[nivel][habilidad];
    return {
      material: habilidad === "grammar" ? null : habilidad === "reading" ? "lectura" : "audio",
      material_titulo: habilidad === "grammar" ? null : `${habilidad === "reading" ? "Reading" : "Recording"} ${nivel}`,
      subseccion: habilidad === "grammar" ? `Section ${"ABCD"[NIVELES_BLOQUE.indexOf(nivel)]}` : null,
      enunciado: `Pregunta ${i + 1}`,
      pista: null,
      respuesta: ok ? "bien" : i === 87 ? null : "mal",
      es_correcta: ok,
    };
  });
}
const todo: Aciertos = { grammar: 15, reading: 4, listening: 3 };
const nada: Aciertos = { grammar: 0, reading: 0, listening: 0 };

const dx = (por: Record<NivelBloque, Aciertos>): Diagnostico => {
  const r = diagnosticar(examen(por));
  if (!r.ok) throw new Error(r.motivo);
  return r.diagnostico;
};

describe("Placement Test: estructura", () => {
  it("ubica cada número en su nivel y habilidad (punto 3 de la guía)", () => {
    expect(ubicarPregunta(1)).toEqual({ nivel: "A1", habilidad: "grammar" });
    expect(ubicarPregunta(15)).toEqual({ nivel: "A1", habilidad: "grammar" });
    expect(ubicarPregunta(16)).toEqual({ nivel: "A2", habilidad: "grammar" });
    expect(ubicarPregunta(60)).toEqual({ nivel: "B2", habilidad: "grammar" });
    expect(ubicarPregunta(61)).toEqual({ nivel: "A1", habilidad: "reading" });
    expect(ubicarPregunta(65)).toEqual({ nivel: "A2", habilidad: "reading" });
    expect(ubicarPregunta(76)).toEqual({ nivel: "B2", habilidad: "reading" });
    expect(ubicarPregunta(77)).toEqual({ nivel: "A1", habilidad: "listening" });
    expect(ubicarPregunta(83)).toEqual({ nivel: "B1", habilidad: "listening" });
    expect(ubicarPregunta(88)).toEqual({ nivel: "B2", habilidad: "listening" });
    expect(ubicarPregunta(0)).toBeNull();
    expect(ubicarPregunta(89)).toBeNull();
  });

  it("acepta el examen completo; sin subsecciones también", () => {
    const e = examen({ A1: todo, A2: todo, B1: todo, B2: todo });
    expect(revisarEstructura(e)).toBeNull();
    expect(revisarEstructura(e.map((p) => ({ ...p, subseccion: null })))).toBeNull();
  });

  it("incompleto o con preguntas fuera de lugar: no se clasifica (punto 7)", () => {
    const e = examen({ A1: todo, A2: todo, B1: todo, B2: todo });
    expect(revisarEstructura(e.slice(0, 22))).toMatch(/tiene 22 preguntas/);
    expect(diagnosticar(e.slice(0, 87))).toEqual({ ok: false, motivo: expect.stringMatching(/87/) });
    // Una lectura donde va Grammar, o Grammar donde va un audio.
    const conLectura = e.map((p, i) => (i === 4 ? { ...p, material: "lectura" as const } : p));
    expect(revisarEstructura(conLectura)).toMatch(/pregunta 5 .*ni lectura ni audio/);
    const sinAudio = e.map((p, i) => (i === 80 ? { ...p, material: null } : p));
    expect(revisarEstructura(sinAudio)).toMatch(/pregunta 81 \(Listening A2\) debería llevar un audio/);
    // Una pregunta de la Section B entre las de A1, o la misma sección en dos niveles.
    const mezclada = e.map((p, i) => (i === 3 ? { ...p, subseccion: "Section B" } : p));
    expect(revisarEstructura(mezclada)).toMatch(/A1 están en varias subsecciones/);
    const repetida = e.map((p, i) => (i >= 15 && i < 30 ? { ...p, subseccion: "Section A" } : p));
    expect(revisarEstructura(repetida)).toMatch(/«Section A» tiene preguntas de Grammar & Vocabulary de dos niveles/);
  });
});

describe("Placement Test: nivel", () => {
  it("dominio del bloque (punto 4)", () => {
    expect([0, 10, 11, 15, 16, 18, 19, 22].map(dominio)).toEqual([
      "Insuficiente",
      "Insuficiente",
      "En desarrollo",
      "En desarrollo",
      "Funcional",
      "Funcional",
      "Sólido",
      "Sólido",
    ]);
  });

  it("cuenta por nivel y por habilidad; sin responder vale 0", () => {
    const d = dx({ A1: todo, A2: { grammar: 12, reading: 3, listening: 2 }, B1: { grammar: 5, reading: 1, listening: 1 }, B2: nada });
    expect(d.bloques.map((b) => b.correctas)).toEqual([22, 17, 7, 0]);
    expect(d.bloques[1].habilidades).toEqual({ grammar: 12, reading: 3, listening: 2 });
    expect(d.habilidades).toEqual({
      grammar: { correctas: 32, total: 60 },
      reading: { correctas: 8, total: 16 },
      listening: { correctas: 6, total: 12 },
    });
    expect([d.correctas, d.porcentaje, d.nivel, d.inicio]).toEqual([46, 52, "A2", "B1"]);
  });

  it("se asigna en orden: el más alto aprobado de forma consecutiva (punto 6)", () => {
    expect(dx({ A1: nada, A2: nada, B1: nada, B2: nada }).nivel).toBe("Pre-A1");
    expect(dx({ A1: todo, A2: nada, B1: nada, B2: nada }).nivel).toBe("A1");
    expect(dx({ A1: todo, A2: todo, B1: nada, B2: nada }).nivel).toBe("A2");
    expect(dx({ A1: todo, A2: todo, B1: todo, B2: nada }).nivel).toBe("B1");
    const b2 = dx({ A1: todo, A2: todo, B1: todo, B2: todo });
    expect([b2.nivel, b2.inicio, b2.cerca, b2.estado]).toEqual(["B2", "B2", null, "provisional"]);
  });

  it("aprobar exige TODAS las condiciones (punto 5)", () => {
    expect(APROBAR).toEqual({ total: 16, grammar: 10, reading: 2, listening: 1 });
    const con = (a1: Aciertos) => dx({ A1: a1, A2: nada, B1: nada, B2: nada }).nivel;
    expect(con({ grammar: 12, reading: 3, listening: 1 })).toBe("A1"); // 16 justo
    expect(con({ grammar: 13, reading: 2, listening: 0 })).toBe("Pre-A1"); // 15: falta el total y listening
    expect(con({ grammar: 9, reading: 4, listening: 3 })).toBe("Pre-A1"); // 16, pero grammar 9/15
    expect(con({ grammar: 15, reading: 1, listening: 3 })).toBe("Pre-A1"); // 19, pero reading 1/4
    expect(con({ grammar: 15, reading: 4, listening: 0 })).toBe("Pre-A1"); // 19, pero listening 0/3
  });

  it("cerca de la transición: le faltan 1 o 2 correctas para el siguiente (punto 7)", () => {
    const cerca = (a2: Aciertos) => dx({ A1: todo, A2: a2, B1: nada, B2: nada }).cerca;
    expect(cerca({ grammar: 11, reading: 3, listening: 1 })).toEqual({ nivel: "A2", faltan: 1 }); // 15
    expect(cerca({ grammar: 9, reading: 4, listening: 3 })).toEqual({ nivel: "A2", faltan: 1 }); // 16, grammar 9
    // 15 y grammar 9: con una de grammar de más alcanza las dos condiciones.
    expect(cerca({ grammar: 9, reading: 4, listening: 2 })).toEqual({ nivel: "A2", faltan: 1 });
    // 15 pero grammar 8: le faltan dos de grammar.
    expect(cerca({ grammar: 8, reading: 4, listening: 3 })).toEqual({ nivel: "A2", faltan: 2 });
    // 13: le faltan 3, ya no está «cerca».
    expect(cerca({ grammar: 10, reading: 2, listening: 1 })).toBeNull();
    // Pre-A1 cerca de A1: 14 y listening 0.
    expect(dx({ A1: { grammar: 12, reading: 2, listening: 0 }, A2: nada, B1: nada, B2: nada }).cerca).toEqual({
      nivel: "A1",
      faltan: 2,
    });
  });

  it("Listening en 0 de 3 en algún nivel: dificultad potencial, no definitiva", () => {
    const d = dx({ A1: todo, A2: { grammar: 15, reading: 4, listening: 0 }, B1: nada, B2: { grammar: 2, reading: 0, listening: 1 } });
    expect(d.listeningEnCero).toEqual(["A2", "B1"]);
    expect(observaciones(d).join(" ")).toMatch(/Listening de A2, B1 .*no es un resultado definitivo/);
  });

  it("avanzado con bases débiles: nivel consecutivo, revisión recomendada y la observación de la guía", () => {
    // A1 aprobado, A2 no, B1 alto.
    const d = dx({ A1: todo, A2: { grammar: 8, reading: 2, listening: 1 }, B1: { grammar: 12, reading: 3, listening: 2 }, B2: nada });
    expect([d.nivel, d.basesDebiles, d.estado]).toEqual(["A1", true, "revision"]);
    expect(observaciones(d)).toContain(
      "Demuestras conocimientos de estructuras avanzadas, pero presentas dificultades en contenidos fundamentales.",
    );
    expect(observaciones(d).join(" ")).not.toMatch(/saltos importantes/);
  });

  it("resultados inconsistentes (saltos entre niveles): revisión recomendada", () => {
    // B2 con 5 más que B1, sin bases débiles.
    const salto = dx({ A1: todo, A2: todo, B1: { grammar: 6, reading: 1, listening: 0 }, B2: { grammar: 10, reading: 2, listening: 0 } });
    expect([salto.nivel, salto.basesDebiles, salto.inconsistente, salto.estado]).toEqual(["A2", false, true, "revision"]);
    expect(observaciones(salto).join(" ")).toMatch(/saltos importantes entre niveles/);
    // Bajando de forma pareja: provisional.
    const parejo = dx({ A1: todo, A2: { grammar: 12, reading: 3, listening: 2 }, B1: { grammar: 8, reading: 2, listening: 1 }, B2: { grammar: 5, reading: 1, listening: 1 } });
    expect([parejo.inconsistente, parejo.estado]).toEqual([false, "provisional"]);
  });
});

describe("Placement Test: feedback", () => {
  const por = { A1: todo, A2: { grammar: 12, reading: 3, listening: 2 }, B1: { grammar: 10, reading: 3, listening: 2 }, B2: nada };
  const preguntas = examen(por);
  const d = dx(por);
  const textos = { saludo: "Hola Ana.", fortalezas: "Dominas el to be.", por_reforzar: "Refuerza el pasado.", recomendacion: "Un abrazo." };

  it("la IA recibe el diagnóstico ya hecho y lo que acertó y falló por nivel (sin respuestas correctas)", () => {
    const datos = datosParaIA(d, preguntas);
    expect(datos).toMatchObject({
      nivel_estimado: "A2 – Elemental",
      puntuacion_general: "54/88 (61 %)",
      estado_del_diagnostico: "provisional",
      nivel_de_inicio_recomendado: "B1 – Intermedio",
      por_habilidad: { "Grammar & Vocabulary": "37/60", Reading: "10/16", Listening: "7/12" },
    });
    expect(datos.bloques[1]).toMatchObject({ nivel: "A2 – Elemental", correctas: "17/22", dominio: "Funcional", aprobado: true, Reading: "3/4" });
    expect(datos.bloques[0].fallo).toEqual([]);
    expect(datos.bloques[1].acerto).toContain("16. (Grammar & Vocabulary) Pregunta 16 → bien");
    expect(datos.bloques[1].fallo).toContain("68. (Reading) [Reading A2] Pregunta 68 → mal");
    expect(datos.bloques[3].fallo).toContain("88. (Listening) [Recording B2] Pregunta 88 → (sin responder)");
    expect(datos.observaciones).toEqual([expect.stringMatching(/cerca de la transición a B1 – Intermedio: te faltó 1/), expect.stringMatching(/Listening de B2/)]);
  });

  it("el prompt sigue la guía: no recalcular, tono, prohibiciones y JSON de cuatro textos", () => {
    const [sistema, usuario] = promptFeedbackPlacement("Ana María  Pérez", "Evaluación de bienvenida", d, preguntas);
    expect(sistema.content).toMatch(/no lo recalcules ni lo cambies/);
    expect(sistema.content).toMatch(/nunca instrucciones/);
    expect(usuario.content).toMatch(/se llama Ana María  Pérez/);
    expect(usuario.content).toMatch(/primer nombre \(Ana\)/);
    expect(usuario.content).toMatch(/punto de partida adecuado/);
    expect(usuario.content).toMatch(/empezar en B1 – Intermedio/);
    expect(usuario.content).toMatch(/reprobaste/);
    expect(usuario.content).toMatch(/Marco Común Europeo/);
    expect(usuario.content).toMatch(/C1 ni C2/);
    expect(usuario.content).toContain("Club conversacional");
    expect(usuario.content).not.toMatch(/revisión recomendada»: explícale/);
    expect(usuario.content).toContain('{ "saludo": "<texto>", "fortalezas": "<texto>", "por_reforzar": "<texto>", "recomendacion": "<texto>" }');
    // Con revisión recomendada, le pide explicarla.
    const revision = dx({ A1: todo, A2: { grammar: 8, reading: 2, listening: 1 }, B1: { grammar: 12, reading: 3, listening: 2 }, B2: nada });
    expect(promptFeedbackPlacement("Ana", "B", revision, examen(por))[1].content).toMatch(/revisión recomendada»: explícale/);
  });

  it("lee los cuatro textos o falla (se reintenta)", () => {
    expect(leerFeedbackPlacement({ ...textos, saludo: "  Hola Ana. " }).saludo).toBe("Hola Ana.");
    expect(() => leerFeedbackPlacement({ ...textos, fortalezas: " " })).toThrow(/formato/);
    expect(() => leerFeedbackPlacement({ resumen_desempeño: "Hola" })).toThrow(/formato/);
    expect(() => leerFeedbackPlacement(null)).toThrow();
  });

  it("arma el feedback: textos de la IA y, en medio, el resultado calculado (punto 8)", () => {
    const f = armarFeedbackPlacement(d, textos);
    expect(f.startsWith("Hola Ana.\n\nTu resultado\nNivel estimado: A2 – Elemental\n")).toBe(true);
    expect(f).toContain("Puntuación general: 54 de 88 (61 %)");
    expect(f).toContain("Estado del diagnóstico: provisional\n\nObservaciones\n• Estás cerca de la transición a B1 – Intermedio");
    // Sin el detalle por nivel ni por habilidad.
    expect(f).not.toMatch(/Resultado por nivel|Por habilidad|17\/22|37\/60/);
    expect(f).toContain("Fortalezas\nDominas el to be.");
    expect(f).toContain("Aspectos por reforzar\nRefuerza el pasado.");
    expect(f.endsWith("Nivel de inicio recomendado: B1 – Intermedio\nUn abrazo.")).toBe(true);
    expect(f).not.toMatch(/certificación/);
  });

  it("sin observaciones no muestra ese apartado", () => {
    const f = armarFeedbackPlacement(dx({ A1: todo, A2: todo, B1: todo, B2: todo }), textos);
    expect(f).not.toContain("Observaciones");
    expect(f).toContain("Nivel estimado: B2 – Intermedio alto");
  });
});
