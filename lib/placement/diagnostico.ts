import type { TipoMaterial } from "@/lib/preguntas/materiales";

// English Placement Test: la evaluación de bienvenida desde la Generación 2
// (gen-2026-11). Reglas de la «Guía IA - English Test» de Speak Easy: 88
// preguntas de selección múltiple, 22 por nivel (A1, A2, B1, B2), cada bloque
// con 15 de Grammar & Vocabulary, 4 de Reading y 3 de Listening.
//
// El nivel se calcula AQUÍ, con reglas fijas (puro, con tests): la IA solo lo
// comunica (feedback.ts), nunca lo decide ni lo cambia.

export const NIVELES_BLOQUE = ["A1", "A2", "B1", "B2"] as const;
export type NivelBloque = (typeof NIVELES_BLOQUE)[number];
export type Nivel = "Pre-A1" | NivelBloque;

export const NOMBRE_NIVEL: Record<Nivel, string> = {
  "Pre-A1": "Inicial",
  A1: "Básico",
  A2: "Elemental",
  B1: "Intermedio",
  B2: "Intermedio alto",
};
/** «A2 – Elemental». */
export const etiquetaNivel = (n: Nivel) => `${n} – ${NOMBRE_NIVEL[n]}`;

export const HABILIDADES = ["grammar", "reading", "listening"] as const;
export type Habilidad = (typeof HABILIDADES)[number];
export const NOMBRE_HABILIDAD: Record<Habilidad, string> = {
  grammar: "Grammar & Vocabulary",
  reading: "Reading",
  listening: "Listening",
};

// Punto 3 de la guía: desde qué número de pregunta (1–88, en el orden del
// examen) va cada habilidad, cuántas por nivel y con qué material. Los niveles
// van seguidos de A1 a B2: Grammar 1–15 es A1, 16–30 A2…; Reading 61–64 A1…
const DISTRIBUCION: Record<Habilidad, { desde: number; porNivel: number; material: TipoMaterial | null }> = {
  grammar: { desde: 1, porNivel: 15, material: null },
  reading: { desde: 61, porNivel: 4, material: "lectura" },
  listening: { desde: 77, porNivel: 3, material: "audio" },
};
export const TOTAL_PLACEMENT = 88;
export const POR_BLOQUE = 22;
/** Preguntas de cada habilidad en un nivel: 15, 4 y 3. */
export const POR_NIVEL = Object.fromEntries(HABILIDADES.map((h) => [h, DISTRIBUCION[h].porNivel])) as Record<
  Habilidad,
  number
>;

// Punto 5: para aprobar un bloque se cumplen TODAS a la vez. Son umbrales
// internos de Speak Easy: se podrán ajustar después de validar el examen.
export const APROBAR = { total: 16, grammar: 10, reading: 2, listening: 1 } as const;

// «Saltos importantes entre niveles» (punto 7): un bloque más alto con al menos
// tantas correctas más que uno más bajo. La guía no da el número: ajustable.
export const SALTO_INCONSISTENTE = 5;

// Punto 8.9: nivel del programa por el que conviene empezar según el nivel
// estimado (el siguiente al demostrado; con B2, B2). Ajustable.
export const INICIO_RECOMENDADO: Record<Nivel, NivelBloque> = {
  "Pre-A1": "A1",
  A1: "A2",
  A2: "B1",
  B1: "B2",
  B2: "B2",
};

/** Nivel y habilidad de la pregunta número `numero` (desde 1). */
export function ubicarPregunta(numero: number): { nivel: NivelBloque; habilidad: Habilidad } | null {
  for (const habilidad of HABILIDADES) {
    const { desde, porNivel } = DISTRIBUCION[habilidad];
    const i = numero - desde;
    if (i >= 0 && i < porNivel * NIVELES_BLOQUE.length) {
      return { nivel: NIVELES_BLOQUE[Math.floor(i / porNivel)], habilidad };
    }
  }
  return null;
}

export type PreguntaPlacement = {
  /** Tipo del material ligado (lectura o audio), o null. */
  material: TipoMaterial | null;
  subseccion: string | null;
  /** null = sin calificar (no debería pasar: son de selección múltiple). */
  es_correcta: boolean | null;
};

// Antes de clasificar, el examen debe tener la forma del Placement Test: si no
// (incompleto, preguntas fuera de su lugar), no se da un nivel (punto 7,
// «preguntas inválidas»). Devuelve null si está bien o el motivo si no.
export function revisarEstructura(preguntas: Pick<PreguntaPlacement, "material" | "subseccion">[]): string | null {
  if (preguntas.length !== TOTAL_PLACEMENT) {
    return `tiene ${preguntas.length} preguntas (el Placement Test tiene ${TOTAL_PLACEMENT})`;
  }
  const subsecciones = new Map<NivelBloque, Set<string | null>>();
  for (const [i, p] of preguntas.entries()) {
    const { nivel, habilidad } = ubicarPregunta(i + 1)!;
    const esperado = DISTRIBUCION[habilidad].material;
    if (p.material !== esperado) {
      const debe = esperado === "lectura" ? "una lectura" : esperado === "audio" ? "un audio" : "ni lectura ni audio";
      return `la pregunta ${i + 1} (${NOMBRE_HABILIDAD[habilidad]} ${nivel}) debería llevar ${debe}`;
    }
    if (habilidad === "grammar") {
      subsecciones.set(nivel, (subsecciones.get(nivel) ?? new Set()).add(p.subseccion?.trim() || null));
    }
  }
  // Grammar: cada nivel en una sola subsección (Section A, B…), distinta de las demás.
  const vistas = new Set<string>();
  for (const [nivel, s] of subsecciones) {
    const [unica] = s;
    if (s.size > 1) return `las preguntas de Grammar & Vocabulary ${nivel} están en varias subsecciones`;
    if (unica && vistas.has(unica)) return `«${unica}» tiene preguntas de Grammar & Vocabulary de dos niveles`;
    if (unica) vistas.add(unica);
  }
  return null;
}

export type Dominio = "Insuficiente" | "En desarrollo" | "Funcional" | "Sólido";
/** Punto 4: dominio del bloque según sus correctas (de 22). */
export const dominio = (correctas: number): Dominio =>
  correctas >= 19 ? "Sólido" : correctas >= 16 ? "Funcional" : correctas >= 11 ? "En desarrollo" : "Insuficiente";

export type Bloque = {
  nivel: NivelBloque;
  /** De 22. */
  correctas: number;
  /** De 15, 4 y 3. */
  habilidades: Record<Habilidad, number>;
  dominio: Dominio;
  /** Respuestas correctas que le faltaron para aprobarlo (0 = aprobado). */
  faltan: number;
};

export type Diagnostico = {
  nivel: Nivel;
  /** De 88. */
  correctas: number;
  porcentaje: number;
  bloques: Bloque[];
  habilidades: Record<Habilidad, { correctas: number; total: number }>;
  /** «Revisión recomendada» con bases débiles o resultados inconsistentes. */
  estado: "provisional" | "revision";
  /** Resultados altos en B1 o B2 sin aprobar A1 o A2. */
  basesDebiles: boolean;
  /** Saltos importantes entre niveles. */
  inconsistente: boolean;
  /** A 1 o 2 respuestas de aprobar el siguiente nivel. */
  cerca: { nivel: NivelBloque; faltan: number } | null;
  /** Niveles con 0 de 3 en Listening. */
  listeningEnCero: NivelBloque[];
  inicio: NivelBloque;
};

// Lo mínimo que le faltó para aprobar: cada correcta de más suma a su habilidad
// y al total, así que son las que faltan en las habilidades o, si son más, las
// del total.
function faltanParaAprobar(correctas: number, h: Record<Habilidad, number>): number {
  const enHabilidades = HABILIDADES.reduce((s, x) => s + Math.max(0, APROBAR[x] - h[x]), 0);
  return Math.max(APROBAR.total - correctas, enHabilidades);
}

export type ResultadoPlacement = { ok: true; diagnostico: Diagnostico } | { ok: false; motivo: string };

/** Las preguntas del intento en el orden del examen (respuestas por p.orden). */
export function diagnosticar(preguntas: PreguntaPlacement[]): ResultadoPlacement {
  const motivo = revisarEstructura(preguntas);
  if (motivo) return { ok: false, motivo };

  const bloques: Bloque[] = NIVELES_BLOQUE.map((nivel) => ({
    nivel,
    correctas: 0,
    habilidades: { grammar: 0, reading: 0, listening: 0 },
    dominio: "Insuficiente",
    faltan: 0,
  }));
  preguntas.forEach((p, i) => {
    if (p.es_correcta !== true) return; // incorrecta o sin responder: 0 (punto 2)
    const { nivel, habilidad } = ubicarPregunta(i + 1)!;
    const b = bloques[NIVELES_BLOQUE.indexOf(nivel)];
    b.correctas += 1;
    b.habilidades[habilidad] += 1;
  });
  for (const b of bloques) {
    b.dominio = dominio(b.correctas);
    b.faltan = faltanParaAprobar(b.correctas, b.habilidades);
  }

  // Punto 6: el nivel más alto aprobado de forma consecutiva desde A1. Nunca por
  // el total del examen.
  const primeroSinAprobar = bloques.findIndex((b) => b.faltan > 0);
  const aprobados = primeroSinAprobar === -1 ? bloques.length : primeroSinAprobar;
  const nivel: Nivel = aprobados === 0 ? "Pre-A1" : NIVELES_BLOQUE[aprobados - 1];

  // Punto 7, casos especiales.
  const siguiente = bloques[aprobados];
  const cerca = siguiente && siguiente.faltan <= 2 ? { nivel: siguiente.nivel, faltan: siguiente.faltan } : null;
  const altos = (n: NivelBloque) => bloques[NIVELES_BLOQUE.indexOf(n)].correctas >= APROBAR.total;
  const basesDebiles = aprobados < 2 && (altos("B1") || altos("B2"));
  const inconsistente =
    bloques.some((b, i) => i > aprobados && b.faltan === 0) ||
    bloques.some((alto, j) => bloques.slice(0, j).some((bajo) => alto.correctas - bajo.correctas >= SALTO_INCONSISTENTE));

  const correctas = bloques.reduce((s, b) => s + b.correctas, 0);
  const habilidades = Object.fromEntries(
    HABILIDADES.map((h) => [
      h,
      {
        correctas: bloques.reduce((s, b) => s + b.habilidades[h], 0),
        total: POR_NIVEL[h] * NIVELES_BLOQUE.length,
      },
    ]),
  ) as Diagnostico["habilidades"];

  return {
    ok: true,
    diagnostico: {
      nivel,
      correctas,
      porcentaje: Math.round((correctas / TOTAL_PLACEMENT) * 100),
      bloques,
      habilidades,
      estado: basesDebiles || inconsistente ? "revision" : "provisional",
      basesDebiles,
      inconsistente,
      cerca,
      listeningEnCero: bloques.filter((b) => b.habilidades.listening === 0).map((b) => b.nivel),
      inicio: INICIO_RECOMENDADO[nivel],
    },
  };
}
