// Migra las evaluaciones viejas A1 y A2 de la Generación 1 (gen-2026-03) al
// sistema nuevo. Las viejas vivían en otros schemas de la misma BD, con las
// preguntas en el código de cada proyecto:
//   A1 → schema agendamiento  (proyecto Evaluaciondos-main) → gen-2026-03-t1
//   A2 → schema evaluacionados (proyecto evaluacion-a2)     → gen-2026-03-t2
//
// Uso (desde la raíz de sistema-evaluaciones, con el .env de producción):
//   npx tsx scripts/migracion-a1-a2/migrar.mts            simulación: hace todo en
//                                                         una transacción, muestra
//                                                         el informe y la revierte
//   npx tsx scripts/migracion-a1-a2/migrar.mts --aplicar  lo mismo, y la confirma
//
// Qué hace, todo o nada:
//   1. Preguntas: las de a1.json / a2.json (extraer-preguntas.mts) en la T1 / T2,
//      cada una de 10 puntos (como antes). Si ya están (otra corrida), se usan.
//   2. Estudiantes: los autorizados de los dos schemas, en gen-2026-03 (activos).
//      Un correo del staff no puede ser estudiante: se salta (y sus intentos).
//   3. Intentos: cada evaluación vieja, en orden de fecha (el trigger numera los
//      intentos de cada estudiante), con su nombre, token, feedback, cambios de
//      pestaña y fechas. El puntaje, Grammar y Writing son los ORIGINALES (los
//      que vio el estudiante). Cada respuesta se califica con calificarPregunta();
//      en la A2, los intentos de antes del 1 oct se marcan con la clave de ese
//      momento (claveAnterior) si con ella sale el puntaje guardado.
//      Quedan como avisados (email_enviado): el sistema nuevo no manda correos.
//      Un intento que ya está (mismo token) no se repite: se puede correr otra vez.
//   4. Configuración final (solo la primera vez): T1 "Evaluación A1" cerrada
//      (1 intento), T2 "Evaluación A2" abierta (intentos ilimitados); ambas
//      publicadas, 120 min de referencia. Se cambia después desde el panel; si se
//      vuelve a correr (p. ej. para traer intentos tardíos), se respeta la que haya.
//
// Aplicada en producción el 21 oct 2026: 697 estudiantes, A1 488 intentos y A2
// 247 (1 omitido: un correo del staff); los puntajes coinciden con los viejos.
// No toca los schemas viejos (solo los lee) ni el speaking de la A1 (no hay dónde).

import nextEnv from "@next/env";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// @next/env es CommonJS: desde un .mts se toma su export por defecto.
nextEnv.loadEnvConfig(process.cwd());
const { transaction } = await import("../../lib/db");
const { calificarPregunta } = await import("../../lib/grading/calificar");
const { emailSchema } = await import("../../lib/validacion");

const APLICAR = process.argv.includes("--aplicar");
const GENERACION = "gen-2026-03";
const PUNTAJE = 10;

type Pregunta = {
  orden: number;
  seccion: string;
  tipo: "multiple_choice" | "fill_blank" | "translation";
  categoria: "grammar" | "writing";
  enunciado: string;
  pista: string | null;
  opciones: string[] | null;
  respuestas_aceptadas: string[] | string[][];
};
type Datos = { preguntas: Pregunta[]; claveAnterior?: Record<string, string[] | string[][]> };

const FUENTES = [
  { nombre: "A1", schema: "agendamiento", slug: `${GENERACION}-t1`, archivo: "a1.json", titulo: "Evaluación A1", intentos: 1, cerrada: true },
  { nombre: "A2", schema: "evaluacionados", slug: `${GENERACION}-t2`, archivo: "a2.json", titulo: "Evaluación A2", intentos: null, cerrada: false },
] as const;

const datosDe = (archivo: string): Datos =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, archivo), "utf8"));

const oculto = (email: string) => email.replace(/^(.).*?(@.*)$/, "$1***$2");

class Revertir extends Error {}

type Informe = Record<string, unknown>;
const informe: Informe[] = [];
const avisos: string[] = [];

try {
  await transaction(async (tx) => {
    // Las altas de estudiantes (CSV, uno a uno) y esta migración no se cruzan.
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('importar-estudiantes'))`);

    const { rows: gens } = await tx.query<{ id: number; activa: boolean }>(
      `SELECT id, activa FROM generaciones WHERE codigo = $1 FOR UPDATE`,
      [GENERACION],
    );
    const gen = gens[0];
    if (!gen) throw new Error(`No existe la generación ${GENERACION}.`);
    if (!gen.activa) throw new Error(`La generación ${GENERACION} está desactivada (el trigger no deja crear intentos).`);

    // ── 2. Estudiantes ─────────────────────────────────────────────────────
    const { rows: autorizados } = await tx.query<{ email: string }>(
      `SELECT DISTINCT lower(trim(email)) AS email FROM (
         SELECT email FROM agendamiento.estudiantes_autorizados
         UNION ALL SELECT email FROM evaluacionados.estudiantes_autorizados
         UNION ALL SELECT email FROM agendamiento.evaluaciones
         UNION ALL SELECT email FROM evaluacionados.evaluaciones) x
        WHERE email IS NOT NULL AND trim(email) <> ''`,
    );
    const { rows: staff } = await tx.query<{ email: string }>(`SELECT lower(email::text) AS email FROM staff`);
    const delStaff = new Set(staff.map((s) => s.email));
    const validos: string[] = [];
    for (const { email } of autorizados) {
      if (delStaff.has(email)) avisos.push(`Estudiante omitido (es del staff): ${oculto(email)}`);
      else if (!emailSchema.safeParse(email).success) avisos.push(`Estudiante omitido (correo inválido): ${email}`);
      else validos.push(email);
    }
    const { rows: enOtra } = await tx.query<{ email: string; codigo: string }>(
      `SELECT s.email::text AS email, g.codigo FROM estudiantes s JOIN generaciones g ON g.id = s.generacion_id
        WHERE s.email = ANY($1::citext[]) AND s.generacion_id <> $2`,
      [validos, gen.id],
    );
    if (enOtra.length) {
      throw new Error(
        `${enOtra.length} estudiantes ya están en otra generación (p. ej. ${oculto(enOtra[0].email)} en ${enOtra[0].codigo}). Revísalo antes de migrar.`,
      );
    }
    const { rowCount: estudiantesNuevos } = await tx.query(
      `INSERT INTO estudiantes (generacion_id, email) SELECT $1, unnest($2::citext[]) ON CONFLICT (email) DO NOTHING`,
      [gen.id, validos],
    );
    const { rows: est } = await tx.query<{ id: number; email: string; activo: boolean }>(
      `SELECT id, lower(email::text) AS email, activo FROM estudiantes WHERE generacion_id = $1`,
      [gen.id],
    );
    const idPorEmail = new Map(est.map((e) => [e.email, e.id]));
    const inactivos = est.filter((e) => !e.activo && validos.includes(e.email));
    if (inactivos.length) throw new Error(`${inactivos.length} estudiantes de ${GENERACION} están inactivos: el trigger no deja migrar sus intentos.`);
    informe.push({ paso: "estudiantes", autorizados: autorizados.length, nuevos: estudiantesNuevos, en_la_generacion: est.length });

    // ── Por evaluación: preguntas, intentos y configuración ─────────────────
    for (const f of FUENTES) {
      const { preguntas, claveAnterior } = datosDe(f.archivo);
      const { rows: evs } = await tx.query<{ id: number }>(
        `SELECT id FROM evaluaciones WHERE slug = $1 AND generacion_id = $2 FOR UPDATE`,
        [f.slug, gen.id],
      );
      const ev = evs[0];
      if (!ev) throw new Error(`No existe la evaluación ${f.slug}.`);

      // 1. Preguntas (o las de una corrida anterior, si coinciden).
      const { rows: yaHay } = await tx.query<{ id: number; orden: number; enunciado: string }>(
        `SELECT id, orden, enunciado FROM preguntas WHERE evaluacion_id = $1 ORDER BY orden`,
        [ev.id],
      );
      let idPorOrden: Map<number, number>;
      const primeraVez = yaHay.length === 0;
      if (primeraVez) {
        const { rows } = await tx.query<{ id: number; orden: number }>(
          `INSERT INTO preguntas (evaluacion_id, orden, seccion, tipo, categoria, enunciado, pista,
                                  opciones, respuestas_aceptadas, puntaje)
           SELECT $1, p.orden, p.seccion, p.tipo::tipo_pregunta, p.categoria::categoria_pregunta, p.enunciado, p.pista,
                  p.opciones, p.respuestas_aceptadas, $3
             FROM jsonb_to_recordset($2::jsonb) AS p(orden int, seccion text, tipo text, categoria text,
                  enunciado text, pista text, opciones jsonb, respuestas_aceptadas jsonb)
           RETURNING id, orden`,
          [ev.id, JSON.stringify(preguntas), PUNTAJE],
        );
        idPorOrden = new Map(rows.map((r) => [r.orden, r.id]));
      } else {
        const iguales =
          yaHay.length === preguntas.length &&
          preguntas.every((p) => yaHay.find((y) => y.orden === p.orden)?.enunciado === p.enunciado);
        if (!iguales) throw new Error(`${f.slug} ya tiene preguntas distintas a las de ${f.archivo}: no se toca.`);
        idPorOrden = new Map(yaHay.map((y) => [y.orden, y.id]));
      }

      // Abierta y sin límites mientras se cargan los intentos (validar_intento).
      // Lo de antes se guarda para devolverlo si esta no es la primera corrida.
      const { rows: antes } = await tx.query<{ publicada: boolean; fecha_apertura: Date | null; fecha_cierre: Date | null; intentos_permitidos: number | null }>(
        `SELECT publicada, fecha_apertura, fecha_cierre, intentos_permitidos FROM evaluaciones WHERE id = $1`,
        [ev.id],
      );
      await tx.query(
        `UPDATE evaluaciones SET publicada = TRUE, fecha_apertura = NULL, fecha_cierre = NULL,
                intentos_permitidos = NULL WHERE id = $1`,
        [ev.id],
      );

      // 3. Intentos.
      const { rows: viejos } = await tx.query<{
        id: number; nombre: string | null; email: string; puntaje_total: number; grammar_score: number;
        writing_score: number; respuestas: Record<string, unknown> | null; feedback: string | null;
        cambios_pestana: number | null; token: string | null; created_at: Date; completed_at: Date | null;
      }>(
        `SELECT id, nombre, lower(trim(email)) AS email, puntaje_total, grammar_score, writing_score, respuestas,
                feedback, cambios_pestana, token, created_at, completed_at
           FROM ${f.schema}.evaluaciones ORDER BY created_at, id`,
      );
      const { rows: tokens } = await tx.query<{ token: string; evaluacion_id: number }>(`SELECT token, evaluacion_id FROM intentos`);
      const tokenEn = new Map(tokens.map((t) => [t.token, t.evaluacion_id]));

      const cuenta = { viejos: viejos.length, migrados: 0, ya_estaban: 0, omitidos: 0, clave_anterior: 0, distinto_al_original: 0, respuestas: 0 };
      for (const v of viejos) {
        if (v.token && tokenEn.get(v.token) === ev.id) {
          cuenta.ya_estaban++;
          continue;
        }
        const estudianteId = idPorEmail.get(v.email);
        if (!estudianteId) {
          cuenta.omitidos++;
          avisos.push(`${f.nombre}: intento ${v.id} omitido (${oculto(v.email)} no es estudiante: staff o correo inválido)`);
          continue;
        }
        const token = v.token && !tokenEn.has(v.token) ? v.token : randomBytes(24).toString("base64url");
        if (v.token && token !== v.token) avisos.push(`${f.nombre}: intento ${v.id} con token repetido; se le dio uno nuevo`);

        // Califica cada respuesta; en la A2 prueba también la clave de antes del 1 oct.
        const dadas = v.respuestas ?? {};
        const calificar = (clave?: Record<string, string[] | string[][]>) =>
          preguntas.map((p) => ({
            p,
            c: calificarPregunta(
              { id: 0, tipo: p.tipo, categoria: p.categoria, puntaje: PUNTAJE, respuestas_aceptadas: clave?.[p.orden] ?? p.respuestas_aceptadas },
              dadas[String(p.orden)] as never,
            ),
          }));
        const resumen = (cs: ReturnType<typeof calificar>) => {
          const ok = (cat: string) => cs.filter((x) => x.p.categoria === cat && x.c.es_correcta).length;
          const obtenidos = cs.reduce((s, x) => s + (x.c.puntaje ?? 0), 0);
          return [Math.round((obtenidos / (cs.length * PUNTAJE)) * 100), ok("grammar"), ok("writing")].join("/");
        };
        const original = [v.puntaje_total, v.grammar_score, v.writing_score].join("/");
        let calificadas = calificar();
        if (claveAnterior && resumen(calificadas) !== original) {
          const conAnterior = calificar(claveAnterior);
          if (resumen(conAnterior) === original) {
            calificadas = conAnterior;
            cuenta.clave_anterior++;
          }
        }
        if (resumen(calificadas) !== original) cuenta.distinto_al_original++;

        const borrador = Object.fromEntries(
          preguntas.filter((p) => dadas[String(p.orden)] !== undefined).map((p) => [String(idPorOrden.get(p.orden)), dadas[String(p.orden)]]),
        );
        const { rows } = await tx.query<{ id: number }>(
          `INSERT INTO intentos (evaluacion_id, estudiante_id, token, nombre, estado, puntaje_total, grammar_score,
                                 writing_score, feedback, cambios_pestana, email_enviado, started_at, completed_at,
                                 respuestas_borrador)
           VALUES ($1, $2, $3, $4, 'listo'::estado_intento, $5, $6, $7, $8, $9, TRUE, $10, $11, $12::jsonb)
           RETURNING id`,
          [
            ev.id, estudianteId, token, (v.nombre ?? "").trim() || "Estudiante", v.puntaje_total, v.grammar_score,
            v.writing_score, v.feedback, v.cambios_pestana ?? 0, v.created_at, v.completed_at ?? v.created_at,
            JSON.stringify(borrador),
          ],
        );
        await tx.query(
          `INSERT INTO respuestas (intento_id, pregunta_id, respuesta, es_correcta, puntaje)
           SELECT $1, r.pregunta_id, NULLIF(r.respuesta, 'null'::jsonb), r.es_correcta, r.puntaje
             FROM jsonb_to_recordset($2::jsonb) AS r(pregunta_id int, respuesta jsonb, es_correcta boolean, puntaje numeric)`,
          [
            rows[0].id,
            JSON.stringify(
              calificadas.map(({ p, c }) => ({
                pregunta_id: idPorOrden.get(p.orden),
                respuesta: c.respuesta,
                es_correcta: c.es_correcta,
                puntaje: c.puntaje,
              })),
            ),
          ],
        );
        tokenEn.set(token, ev.id);
        cuenta.migrados++;
        cuenta.respuestas += calificadas.length;
      }

      // 4. Configuración final: la de la migración la primera vez; en otra
      //    corrida, la que ya tenía (lo que el admin haya cambiado se respeta).
      if (primeraVez) {
        await tx.query(
          `UPDATE evaluaciones
              SET titulo = $2, publicada = TRUE, fecha_apertura = NULL,
                  fecha_cierre = CASE WHEN $3 THEN now() ELSE NULL END,
                  duracion_min = 120, cierre_automatico = FALSE, intentos_permitidos = $4
            WHERE id = $1`,
          [ev.id, f.titulo, f.cerrada, f.intentos],
        );
      } else {
        const a = antes[0];
        await tx.query(
          `UPDATE evaluaciones SET publicada = $2, fecha_apertura = $3, fecha_cierre = $4, intentos_permitidos = $5
            WHERE id = $1`,
          [ev.id, a.publicada, a.fecha_apertura, a.fecha_cierre, a.intentos_permitidos],
        );
      }

      // Comprobación: lo del sistema nuevo contra lo viejo.
      const [{ rows: nuevo }, { rows: viejo }] = [
        await tx.query<{ intentos: number; respuestas: number; puntos: number; estudiantes: number; por_numero: string }>(
          `SELECT count(*)::int AS intentos,
                  (SELECT count(*)::int FROM respuestas r JOIN intentos i2 ON i2.id = r.intento_id WHERE i2.evaluacion_id = $1) AS respuestas,
                  sum(puntaje_total)::int AS puntos, count(DISTINCT estudiante_id)::int AS estudiantes,
                  (SELECT string_agg(numero_intento || ':' || n, ' ' ORDER BY numero_intento)
                     FROM (SELECT numero_intento, count(*) n FROM intentos WHERE evaluacion_id = $1 GROUP BY 1) x) AS por_numero
             FROM intentos WHERE evaluacion_id = $1`,
          [ev.id],
        ),
        await tx.query<{ intentos: number; puntos: number; estudiantes: number }>(
          `SELECT count(*)::int AS intentos, sum(puntaje_total)::int AS puntos,
                  count(DISTINCT lower(trim(email)))::int AS estudiantes FROM ${f.schema}.evaluaciones`,
        ),
      ];
      informe.push({
        paso: `${f.nombre} → ${f.slug}`,
        preguntas: idPorOrden.size,
        ...cuenta,
        nuevo_intentos: nuevo[0].intentos,
        viejo_intentos: viejo[0].intentos,
        nuevo_puntos: nuevo[0].puntos,
        viejo_puntos: viejo[0].puntos,
        nuevo_estudiantes: nuevo[0].estudiantes,
        viejo_estudiantes: viejo[0].estudiantes,
        respuestas_en_bd: nuevo[0].respuestas,
        intentos_por_numero: nuevo[0].por_numero,
      });
    }

    if (!APLICAR) throw new Revertir();
  });
  console.log("✓ Migración APLICADA.");
} catch (e) {
  if (!(e instanceof Revertir)) {
    console.error("✗ La migración falló; no se guardó nada:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } else {
    console.log("Simulación: todo se revirtió (para guardarlo, corre otra vez con --aplicar).");
  }
}
for (const r of informe) console.log(JSON.stringify(r, null, 1).replace(/\n\s*/g, " "));
if (avisos.length) console.log(`Avisos (${avisos.length}):\n  ${avisos.join("\n  ")}`);
