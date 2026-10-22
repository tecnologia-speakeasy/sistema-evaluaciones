// Integración de lib/datos/intentos.ts (Fase 4): iniciar, retomar, guardar,
// enviar y calificar, plazos, revisión, hub, historial (mejor por evaluación) y resultado público.
// Se corre con `npm run test:integracion` (ver tests/integracion/ejecutar.mjs).
import assert from "node:assert/strict";
import { casos, conAbiertas } from "./comun.mjs";
import { query } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import * as I from "@/lib/datos/intentos";

const { caso, fin } = casos();
const sql = async <T extends object = Record<string, unknown>>(t: string, p: unknown[] = []) => (await query<T>(t, p)).rows;
const sufijo = Date.now().toString(36);

async function main() {
  const [gen] = await sql<{ id: number }>(
    `INSERT INTO generaciones (codigo, nombre, fecha_inicio) VALUES ($1, 'Integración intentos', '2026-10-01') RETURNING id`,
    [`gen-int-${sufijo}`],
  );
  await sql(`SELECT generar_evaluaciones($1)`, [gen.id]);
  const evs = await sql<{ id: number; slug: string }>(
    `SELECT id, slug FROM evaluaciones WHERE generacion_id = $1 AND tipo = 'mensual' ORDER BY numero`,
    [gen.id],
  );
  const estudiante = async (n: string) => {
    const [e] = await sql<{ id: number }>(
      `INSERT INTO estudiantes (generacion_id, email) VALUES ($1, $2) RETURNING id`,
      [gen.id, `${n}-${sufijo}@int.test`],
    );
    return { id: e.id, nombre: `Estudiante ${n}` };
  };
  // M1: una pregunta de cada tipo. Puntajes 10, 20, 10, 10.
  const m1 = evs[0];
  const ins = (evId: number, orden: number, tipo: string, categoria: string, enunciado: string, opciones: unknown, aceptadas: unknown, puntaje = 10, rubrica: string | null = null) =>
    sql<{ id: number }>(
      `INSERT INTO preguntas (evaluacion_id, orden, tipo, categoria, enunciado, opciones, respuestas_aceptadas, puntaje, rubrica)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [evId, orden, tipo, categoria, enunciado, opciones && JSON.stringify(opciones), aceptadas && JSON.stringify(aceptadas), puntaje, rubrica],
    ).then((r) => r[0].id);
  const pMc = await ins(m1.id, 1, "multiple_choice", "grammar", "Carlos ___ at home.", ["were", "was", "is"], ["was"]);
  const pFill = await ins(m1.id, 2, "fill_blank", "writing", "They ___ visit ___.", null, [["are going to", "'re going to"], ["Ana"]], 20);
  const pTr = await ins(m1.id, 3, "translation", "writing", "Yo estaba en casa.", null, ["I was at home."]);
  const pOpen = await ins(m1.id, 4, "open", "writing", "Describe your house.", null, null, 10, "Usa 3 oraciones.");
  await sql(`UPDATE evaluaciones SET publicada = TRUE, mostrar_correctas = TRUE, intentos_permitidos = 2 WHERE id = $1`, [m1.id]);

  const ana = await estudiante("ana");
  let intentoAna = 0;

  await caso("iniciar: crea el intento con el nombre de la sesión, token y sin límite", async () => {
    const r = await I.iniciarOReanudar(m1.id, ana);
    assert.equal(r.tipo, "en_curso");
    if (r.tipo !== "en_curso") return;
    intentoAna = r.intento.id;
    assert.equal(r.intento.numero, 1);
    assert.equal(r.intento.limite, null);
    assert.deepEqual(r.intento.borrador, {});
    const [i] = await sql<{ nombre: string; token: string }>(`SELECT nombre, token FROM intentos WHERE id = $1`, [intentoAna]);
    assert.equal(i.nombre, "Estudiante ana");
    assert.match(i.token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(Math.abs(Date.parse(r.intento.ahora) - Date.now()) < 5000);
  });

  await caso("recargar: retoma el mismo intento con lo guardado (no gasta otro)", async () => {
    assert.equal((await I.guardarBorrador(intentoAna, ana.id, { [pMc]: "was" }, 2)).ok, true);
    // Un conteo menor (otra pestaña) no lo baja.
    assert.equal((await I.guardarBorrador(intentoAna, ana.id, { [pMc]: "was" }, 1)).ok, true);
    const r = await I.iniciarOReanudar(m1.id, ana);
    assert.equal(r.tipo, "en_curso");
    if (r.tipo !== "en_curso") return;
    assert.equal(r.intento.id, intentoAna);
    assert.deepEqual(r.intento.borrador, { [pMc]: "was" });
    assert.equal(r.intento.cambiosPestana, 2, "cambios_pestana nunca baja");
    const [n] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM intentos WHERE estudiante_id = $1`, [ana.id]);
    assert.equal(n.n, 1);
  });

  await caso("5 «Comenzar» a la vez (dos pestañas): un solo intento", async () => {
    const beto = await estudiante("beto");
    const rs = await Promise.all(Array.from({ length: 5 }, () => I.iniciarOReanudar(m1.id, beto)));
    const ids = new Set(rs.map((r) => (r.tipo === "en_curso" ? r.intento.id : -1)));
    assert.equal(ids.size, 1);
  });

  await caso("otro estudiante no puede guardar ni enviar un intento ajeno", async () => {
    const intruso = await estudiante("intruso");
    assert.deepEqual(await I.guardarBorrador(intentoAna, intruso.id, {}, 0), { ok: false, motivo: "no_existe" });
    assert.equal(await I.enviarIntento(intentoAna, intruso.id, {}, 0), null);
  });

  // Con abiertas encendidas: la abierta queda pendiente para la IA. Este intento
  // (pendiente, sin puntaje) lo usan después "enviar dos veces", el hub y el historial.
  await caso("enviar (abiertas encendidas): califica en el servidor; la abierta queda pendiente", () => conAbiertas(async () => {
    const r = await I.enviarIntento(
      intentoAna,
      ana.id,
      { [pMc]: "was", [pFill]: ["’re going to", "visit"], [pTr]: "i was at HOME", [pOpen]: "My house is big." },
      3,
    );
    assert.deepEqual(r, { numero: 1, estado: "pendiente", slug: m1.slug });
    const [i] = await sql<Record<string, unknown>>(
      `SELECT estado, puntaje_total, grammar_score, writing_score, cambios_pestana, completed_at IS NOT NULL AS completo
         FROM intentos WHERE id = $1`,
      [intentoAna],
    );
    assert.deepEqual(i, { estado: "pendiente", puntaje_total: null, grammar_score: 1, writing_score: 1, cambios_pestana: 3, completo: true });
    const rs = await sql<{ pregunta_id: number; respuesta: unknown; es_correcta: boolean | null; puntaje: string | null }>(
      `SELECT pregunta_id, respuesta, es_correcta, puntaje FROM respuestas WHERE intento_id = $1 ORDER BY pregunta_id`,
      [intentoAna],
    );
    assert.deepEqual(
      rs.map((x) => [x.pregunta_id, x.es_correcta, x.puntaje]),
      [
        [pMc, true, "10.00"],
        [pFill, false, "0.00"],
        [pTr, true, "10.00"],
        [pOpen, null, null],
      ],
    );
  }));

  await caso("enviar dos veces da lo mismo y no duplica respuestas; ya no se puede guardar", async () => {
    assert.deepEqual(await I.enviarIntento(intentoAna, ana.id, {}, 0), { numero: 1, estado: "pendiente", slug: m1.slug });
    const [n] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM respuestas WHERE intento_id = $1`, [intentoAna]);
    assert.equal(n.n, 4);
    assert.deepEqual(await I.guardarBorrador(intentoAna, ana.id, {}, 0), { ok: false, motivo: "enviado" });
  });

  // M2: sin abiertas, para el puntaje final. Sin PESOS_POR_PREGUNTA (por
  // defecto) las dos valen lo mismo aunque una tenga puntaje 30.
  const m2 = evs[1];
  const q1 = await ins(m2.id, 1, "multiple_choice", "grammar", "A ___", ["x", "y"], ["x"], 10);
  const q2 = await ins(m2.id, 2, "translation", "writing", "B", null, ["b"], 30);
  await sql(`UPDATE evaluaciones SET publicada = TRUE, mostrar_correctas = TRUE, intentos_permitidos = 2 WHERE id = $1`, [m2.id]);

  await caso("sin abiertas: «pendiente» (espera el feedback de la IA) con el puntaje ya final (1 de 2 = 50, sin pesos) y vacías = incorrectas", async () => {
    const r = await I.iniciarOReanudar(m2.id, ana);
    if (r.tipo !== "en_curso") throw new Error("no inició");
    const e = await I.enviarIntento(r.intento.id, ana.id, { [q1]: "x" }, 0);
    assert.equal(e?.estado, "pendiente");
    const [i] = await sql<{ puntaje_total: number }>(`SELECT puntaje_total FROM intentos WHERE id = $1`, [r.intento.id]);
    assert.equal(i.puntaje_total, 50);
    const [vacia] = await sql<{ respuesta: unknown; es_correcta: boolean }>(
      `SELECT respuesta, es_correcta FROM respuestas WHERE intento_id = $1 AND pregunta_id = $2`,
      [r.intento.id, q2],
    );
    assert.deepEqual(vacia, { respuesta: null, es_correcta: false });
  });

  await caso("revisión: con intentos por delante NO se ven las correctas", async () => {
    const d = await I.detalleIntento(m2.slug, 1, ana.id);
    assert.ok(d);
    assert.equal(d!.correctasVisibles, false);
    assert.ok(d!.preguntas.every((p) => p.correcta === null));
    assert.equal(d!.puedeRepetir, true);
    assert.ok(!JSON.stringify(d).includes("respuestas_aceptadas"), "se filtró respuestas_aceptadas");
    assert.deepEqual([d!.grammar_score, d!.grammar_total, d!.writing_score, d!.writing_total], [1, 1, 0, 1]);
  });

  await caso("al usar el último intento: se ven las correctas, solo de las falladas", async () => {
    const r = await I.iniciarOReanudar(m2.id, ana);
    if (r.tipo !== "en_curso") throw new Error("no inició");
    await I.enviarIntento(r.intento.id, ana.id, { [q1]: "y", [q2]: "b" }, 0);
    const d = await I.detalleIntento(m2.slug, 2, ana.id);
    assert.equal(d!.correctasVisibles, true);
    assert.deepEqual(
      d!.preguntas.map((p) => [p.id, p.es_correcta, p.correcta]),
      [
        [q1, false, "x"],
        [q2, true, null],
      ],
    );
    assert.equal(d!.puedeRepetir, false);
    // Y el primer intento también las muestra ya.
    assert.equal((await I.detalleIntento(m2.slug, 1, ana.id))!.correctasVisibles, true);
    assert.deepEqual(d!.intentos.map((x) => x.numero), [1, 2]);
  });

  await caso("sin intentos: no deja empezar otro (mensaje claro)", async () => {
    await assert.rejects(I.iniciarOReanudar(m2.id, ana), (e) => e instanceof ErrorNegocio && /Ya usaste todos tus intentos/.test(e.message));
  });

  await caso("mostrar_correctas apagado: nunca se ven", async () => {
    await sql(`UPDATE evaluaciones SET mostrar_correctas = FALSE WHERE id = $1`, [m2.id]);
    const d = await I.detalleIntento(m2.slug, 2, ana.id);
    assert.equal(d!.correctasVisibles, false);
    assert.ok(d!.preguntas.every((p) => p.correcta === null));
  });

  // M3: cierre automático (30 min).
  const m3 = evs[2];
  const r1 = await ins(m3.id, 1, "multiple_choice", "grammar", "A ___", ["x", "y"], ["x"]);
  await sql(`UPDATE evaluaciones SET publicada = TRUE, duracion_min = 30, cierre_automatico = TRUE WHERE id = $1`, [m3.id]);

  await caso("cierre automático: limite_at = inicio + duración", async () => {
    const carla = await estudiante("carla");
    const r = await I.iniciarOReanudar(m3.id, carla);
    if (r.tipo !== "en_curso") throw new Error("no inició");
    const diff = (Date.parse(r.intento.limite!) - Date.parse(r.intento.inicio)) / 60000;
    assert.equal(Math.round(diff), 30);
  });

  await caso("fuera de plazo (+2 min de gracia): rechaza lo nuevo y califica lo guardado", async () => {
    const dani = await estudiante("dani");
    const r = await I.iniciarOReanudar(m3.id, dani);
    if (r.tipo !== "en_curso") throw new Error("no inició");
    await I.guardarBorrador(r.intento.id, dani.id, { [r1]: "x" }, 0);
    // Dentro de la gracia todavía acepta.
    await sql(`UPDATE intentos SET limite_at = now() - interval '1 minute' WHERE id = $1`, [r.intento.id]);
    assert.equal((await I.guardarBorrador(r.intento.id, dani.id, { [r1]: "x" }, 0)).ok, true);
    // Pasada la gracia, no.
    await sql(`UPDATE intentos SET limite_at = now() - interval '3 minutes' WHERE id = $1`, [r.intento.id]);
    assert.deepEqual(await I.guardarBorrador(r.intento.id, dani.id, { [r1]: "y" }, 0), { ok: false, motivo: "fuera_de_plazo" });
    // Envía "y" (incorrecta) tarde: se califica lo guardado ("x", correcta).
    assert.equal((await I.enviarIntento(r.intento.id, dani.id, { [r1]: "y" }, 0))?.estado, "pendiente");
    const [i] = await sql<{ puntaje_total: number }>(`SELECT puntaje_total FROM intentos WHERE id = $1`, [r.intento.id]);
    assert.equal(i.puntaje_total, 100);
  });

  await caso("si vuelve con un intento vencido: se califica solo y «Comenzar» lo informa", async () => {
    const eva = await estudiante("eva");
    const r = await I.iniciarOReanudar(m3.id, eva);
    if (r.tipo !== "en_curso") throw new Error("no inició");
    await I.guardarBorrador(r.intento.id, eva.id, { [r1]: "x" }, 0);
    await sql(`UPDATE intentos SET limite_at = now() - interval '5 minutes' WHERE id = $1`, [r.intento.id]);
    assert.deepEqual(await I.iniciarOReanudar(m3.id, eva), { tipo: "finalizado", numero: 1 });
    const [i] = await sql<{ estado: string; puntaje_total: number }>(`SELECT estado, puntaje_total FROM intentos WHERE id = $1`, [r.intento.id]);
    assert.deepEqual(i, { estado: "pendiente", puntaje_total: 100 });
  });

  await caso("cerrarVencidos (al abrir el inicio): califica los que se pasaron del plazo", async () => {
    const fede = await estudiante("fede");
    const r = await I.iniciarOReanudar(m3.id, fede);
    if (r.tipo !== "en_curso") throw new Error("no inició");
    await sql(`UPDATE intentos SET limite_at = now() - interval '5 minutes' WHERE id = $1`, [r.intento.id]);
    await I.cerrarVencidos(fede.id);
    const [i] = await sql<{ estado: string; puntaje_total: number }>(`SELECT estado, puntaje_total FROM intentos WHERE id = $1`, [r.intento.id]);
    assert.deepEqual(i, { estado: "pendiente", puntaje_total: 0 });
  });

  await caso("la fecha de cierre también es límite (sin cierre automático)", async () => {
    const m4 = evs[3];
    await ins(m4.id, 1, "multiple_choice", "grammar", "A ___", ["x", "y"], ["x"]);
    await sql(`UPDATE evaluaciones SET publicada = TRUE, fecha_cierre = now() + interval '20 minutes' WHERE id = $1`, [m4.id]);
    const gabi = await estudiante("gabi");
    const r = await I.iniciarOReanudar(m4.id, gabi);
    if (r.tipo !== "en_curso") throw new Error("no inició");
    const [e] = await sql<{ fecha_cierre: Date }>(`SELECT fecha_cierre FROM evaluaciones WHERE id = $1`, [m4.id]);
    assert.equal(Date.parse(r.intento.limite!), e.fecha_cierre.getTime());
  });

  await caso("fuera de fecha o sin publicar: mensajes para el estudiante", async () => {
    const m5 = evs[4];
    await ins(m5.id, 1, "multiple_choice", "grammar", "A ___", ["x", "y"], ["x"]);
    const hugo = await estudiante("hugo");
    await assert.rejects(I.iniciarOReanudar(m5.id, hugo), /no está disponible/);
    await sql(`UPDATE evaluaciones SET publicada = TRUE, fecha_apertura = now() + interval '1 day' WHERE id = $1`, [m5.id]);
    await assert.rejects(I.iniciarOReanudar(m5.id, hugo), /no está abierta en este momento/);
  });

  await caso("hub: estado, intentos usados, mejor puntaje, en curso y último resultado", async () => {
    const lista = await I.evaluacionesDelEstudiante(ana.id, gen.id);
    const e1 = lista.find((e) => e.id === m1.id)!;
    const e2 = lista.find((e) => e.id === m2.id)!;
    assert.deepEqual(
      [e1.intentos_usados, e1.mejor_puntaje, e1.en_curso, e1.ultimo_numero],
      [1, null, false, 1],
    );
    // 2.º intento: falla la de 10, acierta la de 30 → sin pesos, 1 de 2 = 50
    // (con PESOS_POR_PREGUNTA serían 30/40 = 75).
    assert.deepEqual([e2.intentos_usados, e2.mejor_puntaje, e2.ultimo_numero], [2, 50, 2]);
    assert.equal(I.puedePresentar(e2), false);
    assert.equal(I.puedePresentar(e1), true);
    const m5 = lista.find((e) => e.id === evs[4].id)!;
    assert.equal(m5.estado, "programada");
    assert.equal(lista.some((e) => e.id === evs[5].id), false, "las no publicadas no aparecen");
  });

  await caso("historial (mejor puntaje por evaluación) y resultado público (solo resumen; token inválido o en curso → nada)", async () => {
    // M1: un intento con la abierta pendiente (sin puntaje); M2: dos intentos de 50.
    assert.deepEqual(await I.mejoresPorEvaluacion(ana.id), [
      { tipo: "mensual", numero: 1, mejor: null },
      { tipo: "mensual", numero: 2, mejor: 50 },
    ]);
    // Con solo un intento en curso (no cuenta): nada.
    const [soloEnCurso] = await sql<{ estudiante_id: number }>(
      `SELECT i.estudiante_id FROM intentos i
        WHERE i.estado = 'en_progreso'
          AND NOT EXISTS (SELECT 1 FROM intentos o WHERE o.estudiante_id = i.estudiante_id AND o.estado <> 'en_progreso')
        LIMIT 1`,
    );
    assert.ok(soloEnCurso, "hay un estudiante con solo un intento en curso");
    assert.deepEqual(await I.mejoresPorEvaluacion(soloEnCurso.estudiante_id), []);
    const [t] = await sql<{ token: string }>(`SELECT token FROM intentos WHERE evaluacion_id = $1 AND estudiante_id = $2 AND numero_intento = 2`, [m2.id, ana.id]);
    const pub = await I.resultadoPublico(t.token);
    assert.equal(pub?.nombre, "Estudiante ana");
    assert.equal(pub?.puntaje_total, 50);
    assert.ok(!("preguntas" in pub!));
    assert.equal(await I.resultadoPublico("no es un token"), null);
    const [enCurso] = await sql<{ token: string }>(`SELECT token FROM intentos WHERE estado = 'en_progreso' LIMIT 1`);
    assert.equal(await I.resultadoPublico(enCurso.token), null);
  });
}

main()
  .then(fin)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
