// Extrae las preguntas de las evaluaciones viejas A1 y A2 a archivos JSON fijos
// (a1.json, a2.json) que usa migrar.mts. Se corrió una vez; queda para poder
// revisar de dónde sale cada dato. Necesita los proyectos viejos al lado:
//   ../Evaluaciondos-main  (A1, schema agendamiento)
//   ../evaluacion-a2       (A2, schema evaluacionados; con su historial de git)
//
// Uso: npx tsx scripts/migracion-a1-a2/extraer-preguntas.mts
//
// De cada proyecto:
//   · app/components/EnglishExam.jsx → lo que vio el estudiante: enunciado,
//     opciones (selección múltiple), pista y las "Part" (secciones).
//   · lib/exam.js → con qué se calificaba (respuestas aceptadas).
// A2 además: la clave anterior al commit 6b37ae9 ("Se modificaron dos
// preguntas", 1 oct 2026), con la que se calificaron los intentos del 28 sep al
// 1 oct; migrar.mts la usa para marcar bien esas respuestas.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const raiz = path.resolve(import.meta.dirname, "../../..");
const salida = import.meta.dirname;

type PreguntaVieja = {
  id: number;
  type: "multiple_choice" | "fill_blank" | "translation";
  question: string;
  options?: string[];
  hint?: string;
  correct?: string;
  accepts?: string[] | string[][];
};
type Parte = { from: number; to: number; title: string; sections?: { from: number; to: number; header: string }[] };

// Toma el literal `const NOMBRE = [ ... ];` de un archivo y lo evalúa (son
// objetos literales sin variables).
function literal<T>(texto: string, nombre: string): T {
  const inicio = texto.indexOf(`const ${nombre} = [`);
  if (inicio < 0) throw new Error(`No encontré ${nombre}`);
  let i = texto.indexOf("[", inicio);
  const desde = i;
  let nivel = 0;
  let cadena: string | null = null;
  for (; i < texto.length; i++) {
    const c = texto[i];
    if (cadena) {
      if (c === "\\") i++;
      else if (c === cadena) cadena = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") cadena = c;
    else if (c === "/" && texto[i + 1] === "/") i = texto.indexOf("\n", i);
    else if (c === "[") nivel++;
    else if (c === "]" && --nivel === 0) break;
  }
  return new Function(`return ${texto.slice(desde, i + 1)}`)() as T;
}

async function cargarExam(archivo: string): Promise<PreguntaVieja[]> {
  const m = await import(pathToFileURL(archivo).href);
  return m.QUESTIONS as PreguntaVieja[];
}

// Respuestas aceptadas en el formato de la tabla preguntas.
function aceptadas(q: PreguntaVieja): string[] | string[][] {
  if (q.type === "multiple_choice") return [q.correct!];
  if (q.type === "fill_blank") return q.accepts as string[][];
  return q.accepts as string[];
}

function seccionDe(partes: Parte[], id: number): string {
  const p = partes.find((x) => id >= x.from && id <= x.to);
  if (!p) throw new Error(`La pregunta ${id} no está en ninguna Part`);
  const s = p.sections?.find((x) => id >= x.from && id <= x.to);
  return s ? `${p.title} · ${s.header}` : p.title;
}

async function extraer(proyecto: string, nombreLista: string) {
  const componente = readFileSync(path.join(raiz, proyecto, "app/components/EnglishExam.jsx"), "utf8");
  const vistas = literal<PreguntaVieja[]>(componente, nombreLista);
  const partes = literal<Parte[]>(componente, "EXAM_PARTS");
  const claves = await cargarExam(path.join(raiz, proyecto, "lib/exam.js"));
  const porId = new Map(claves.map((q) => [q.id, q]));

  const preguntas = vistas.map((v) => {
    const clave = porId.get(v.id);
    if (!clave) throw new Error(`${proyecto}: la pregunta ${v.id} no está en exam.js`);
    if (clave.type !== v.type) throw new Error(`${proyecto}: la pregunta ${v.id} cambia de tipo`);
    return {
      orden: v.id,
      seccion: seccionDe(partes, v.id),
      tipo: v.type,
      categoria: v.type === "multiple_choice" ? "grammar" : "writing",
      enunciado: v.question,
      pista: v.hint ?? null,
      opciones: v.type === "multiple_choice" ? v.options! : null,
      respuestas_aceptadas: aceptadas(clave),
    };
  });
  if (preguntas.length !== claves.length) throw new Error(`${proyecto}: ${preguntas.length} vistas y ${claves.length} en exam.js`);
  return preguntas;
}

// Solo la clave (orden → aceptadas) de una versión anterior de exam.js.
async function claveDeGit(proyecto: string, commit: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "clave-"));
  const archivo = path.join(dir, "exam.mjs");
  writeFileSync(archivo, execFileSync("git", ["-C", path.join(raiz, proyecto), "show", `${commit}:lib/exam.js`]));
  const claves = await cargarExam(archivo);
  return Object.fromEntries(claves.map((q) => [q.id, aceptadas(q)]));
}

const a1 = await extraer("Evaluaciondos-main", "EXAM_QUESTIONS");
const a2 = await extraer("evaluacion-a2", "ALL_EXAM_QUESTIONS");
const a2Anterior = await claveDeGit("evaluacion-a2", "25cd477");

writeFileSync(path.join(salida, "a1.json"), JSON.stringify({ preguntas: a1 }, null, 2) + "\n");
writeFileSync(path.join(salida, "a2.json"), JSON.stringify({ preguntas: a2, claveAnterior: a2Anterior }, null, 2) + "\n");

for (const [nombre, ps] of [["A1", a1], ["A2", a2]] as const) {
  const porTipo = ps.reduce<Record<string, number>>((m, p) => ({ ...m, [p.tipo]: (m[p.tipo] ?? 0) + 1 }), {});
  console.log(`${nombre}: ${ps.length} preguntas ${JSON.stringify(porTipo)} · secciones: ${[...new Set(ps.map((p) => p.seccion))].length}`);
}
const cambian = Object.keys(a2Anterior).filter(
  (k) => JSON.stringify(a2Anterior[k]) !== JSON.stringify(a2.find((p) => p.orden === Number(k))?.respuestas_aceptadas),
);
console.log(`A2: la clave anterior (25cd477) difiere en las preguntas ${cambian.join(", ") || "(ninguna)"}`);
