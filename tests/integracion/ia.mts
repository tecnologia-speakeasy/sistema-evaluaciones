// Integración de la Fase 5 (IA, correo, reproceso) con OpenAI simulado y el
// SMTP local. Se corre con `npm run test:integracion`.
// Por defecto las abiertas están apagadas (una sola llamada a OpenAI por
// intento); las pruebas que las usan las encienden ellas mismas (conAbiertas).
import assert from "node:assert/strict";
import { casos, conAbiertas, correosPara, openai } from "./comun.mjs";
import { query } from "@/lib/db";
import * as I from "@/lib/datos/intentos";
import * as Q from "@/lib/datos/preguntas";
import * as P from "@/lib/ia/procesar";
import { NIVELES_BLOQUE, POR_NIVEL, ubicarPregunta } from "@/lib/placement/diagnostico";

const { caso, fin } = casos();
const sql = async <T extends object = Record<string, unknown>>(t: string, p: unknown[] = []) => (await query<T>(t, p)).rows;

const sufijo = Date.now().toString(36);
const [gen] = await sql<{ id: number }>(
  `INSERT INTO generaciones (codigo, nombre, fecha_inicio) VALUES ($1, 'Integración IA', '2026-10-01') RETURNING id`,
  [`gen-ia-${sufijo}`],
);
await sql(`SELECT generar_evaluaciones($1)`, [gen.id]);
const evs = await sql<{ id: number; slug: string }>(
  `SELECT id, slug FROM evaluaciones WHERE generacion_id = $1 AND tipo = 'mensual' ORDER BY numero`,
  [gen.id],
);
const ins = (ev: number, orden: number, tipo: string, categoria: string, enunciado: string, opciones: unknown, aceptadas: unknown, rubrica: string | null = null, puntaje = 10) =>
  sql<{ id: number }>(
    `INSERT INTO preguntas (evaluacion_id, orden, tipo, categoria, enunciado, opciones, respuestas_aceptadas, rubrica, puntaje)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [ev, orden, tipo, categoria, enunciado, opciones && JSON.stringify(opciones), aceptadas && JSON.stringify(aceptadas), rubrica, puntaje],
  ).then((r) => r[0].id);
// M1: una cerrada + una abierta (10 puntos cada una).
const m1 = evs[0];
const qMc = await ins(m1.id, 1, "multiple_choice", "grammar", "Carlos ___ at home.", ["were", "was"], ["was"]);
const qOpen = await ins(m1.id, 2, "open", "writing", "Describe your favorite place.", null, null, "Tres oraciones en presente simple.");
// M2: solo cerradas.
const m2 = evs[1];
const qM2 = await ins(m2.id, 1, "multiple_choice", "grammar", "I ___ a student.", ["am", "is"], ["am"]);
await sql(`UPDATE evaluaciones SET publicada = TRUE WHERE id = ANY($1)`, [[m1.id, m2.id]]);

async function estudiante(email: string) {
  const [e] = await sql<{ id: number }>(
    `INSERT INTO estudiantes (generacion_id, email) VALUES ($1, $2) RETURNING id`,
    [gen.id, email],
  );
  return { id: e.id, nombre: "Ana María Pérez", email };
}
async function presentar(est: { id: number; nombre: string }, evId: number, respuestas: Record<string, string>) {
  const r = await I.iniciarOReanudar(evId, est);
  if (r.tipo !== "en_curso") throw new Error("no inició");
  const e = await I.enviarIntento(r.intento.id, est.id, respuestas, 0);
  return { id: r.intento.id, envio: e! };
}
const intento = async (id: number) =>
  (
    await sql<Record<string, unknown>>(
      `SELECT estado, puntaje_total, grammar_score, writing_score, feedback, email_enviado,
              ia_intentos, ia_error, envio_error, procesando_hasta, token FROM intentos WHERE id = $1`,
      [id],
    )
  )[0];

await openai.reiniciar();
const ana = await estudiante(`ana-${sufijo}@ia.test`);
let idAna = 0;

// ---------------------------------------------------------------------------
// Con abiertas encendidas (cada prueba las enciende): la IA las califica.
// ---------------------------------------------------------------------------

await caso("(abiertas) al enviar queda «pendiente»: con abierta, sin puntaje final todavía", () =>
  conAbiertas(async () => {
    const r = await presentar(ana, m1.id, { [qMc]: "was", [qOpen]: "My favorite place is the park because it is big and green." });
    idAna = r.id;
    assert.equal(r.envio.estado, "pendiente");
    const i = await intento(idAna);
    assert.deepEqual([i.estado, i.puntaje_total, i.feedback], ["pendiente", null, null]);
  }),
);

await caso("(abiertas) procesar: la IA califica la abierta (con rúbrica) y escribe el feedback con el nombre", () =>
  conAbiertas(async () => {
    assert.equal(await P.procesarIntento(idAna), "listo");
    const i = await intento(idAna);
    // Abierta: 8/10 → 8 puntos; total (10 + 8) / 20 = 90. Writing: nota ≥ 6 = acierto.
    assert.deepEqual([i.estado, i.puntaje_total, i.grammar_score, i.writing_score], ["listo", 90, 1, 1]);
    assert.match(String(i.feedback), /^Hola Ana, en tu evaluación/);
    assert.equal(i.procesando_hasta, null);
    const [r] = await sql<{ es_correcta: boolean; puntaje: string; feedback: string }>(
      `SELECT es_correcta, puntaje, feedback FROM respuestas WHERE intento_id = $1 AND pregunta_id = $2`,
      [idAna, qOpen],
    );
    assert.deepEqual(r, { es_correcta: true, puntaje: "8.00", feedback: "Buen uso del presente simple; cuida la concordancia." });
    const llamadas = await openai.llamadas();
    assert.deepEqual(llamadas.map((l) => l.tipo), ["abiertas", "feedback"]);
    assert.equal(llamadas[0].modelo, "modelo-de-prueba");
    assert.equal(llamadas[0].auth, "Bearer clave-de-prueba");
    assert.match(llamadas[0].datos.messages![1].content, /Rúbrica: Tres oraciones en presente simple\./);
    assert.equal(llamadas[0].datos.response_format?.type, "json_object");
  }),
);

await caso("correo del resultado: una sola vez, con insignia embebida, puntaje y feedback; sin enlaces", async () => {
  const lista = correosPara(ana.email);
  assert.equal(lista.length, 1);
  const c = lista[0];
  assert.equal(c.subject, "Tu resultado de Evaluación mensual 1 · Speak Easy");
  // Logo e insignia (90 → rango 81–90) adjuntos en línea y referenciados por cid.
  const cids = c.adjuntos.map((a) => a.cid).sort();
  assert.deepEqual(cids, ["insignia-resultado", "logo-speak-easy"]);
  assert.ok(c.adjuntos.every((a) => a.contentType === "image/png" && a.contentDisposition === "inline"));
  assert.ok(c.html.includes('src="cid:insignia-resultado"'));
  assert.ok(c.html.includes("¡Felicitaciones!"));
  assert.ok(c.html.includes(">90<"));
  assert.ok(!/src="https?:|<a\s|Ver mi resultado/.test(c.html), "no debe tener URLs ni botón");
  assert.match(c.text, /en tu evaluación demuestras/);
  assert.equal((await intento(idAna)).email_enviado, true);
  await P.notificarIntento(idAna);
  assert.equal(correosPara(ana.email).length, 1, "se mandó dos veces");
});

await caso("sin abiertas, una sola llamada a la IA y el correo", async () => {
  await openai.reiniciar();
  const beto = await estudiante(`beto-${sufijo}@ia.test`);
  const r = await presentar(beto, m2.id, { [qM2]: "am" });
  assert.equal((await intento(r.id)).puntaje_total, 100, "sin abiertas el puntaje ya es el final");
  assert.equal(await P.procesarIntento(r.id), "listo");
  assert.deepEqual((await openai.llamadas()).map((l) => l.tipo), ["feedback"]);
  assert.equal(correosPara(beto.email).length, 1);
});

await caso("(abiertas) dos procesos a la vez: uno trabaja, el otro ve «ocupado» (una sola llamada por paso)", () =>
  conAbiertas(async () => {
    await openai.reiniciar();
    await openai.modo({ demoraMs: 300 });
    const carla = await estudiante(`carla-${sufijo}@ia.test`);
    const r = await presentar(carla, m1.id, { [qMc]: "were", [qOpen]: "Park." });
    const rs = await Promise.all([P.procesarIntento(r.id), P.procesarIntento(r.id)]);
    assert.deepEqual(rs.sort(), ["listo", "ocupado"]);
    assert.equal((await openai.llamadas()).length, 2);
    await openai.modo({});
    // Respuesta corta: nota 4 → no cuenta como acierto en Writing.
    assert.deepEqual([(await intento(r.id)).puntaje_total, (await intento(r.id)).writing_score], [20, 0]);
  }),
);

await caso("OpenAI saturado (429 dos veces): reintenta respetando Retry-After y termina", async () => {
  await openai.reiniciar();
  await openai.modo({ falla: "429", veces: 2 });
  const dani = await estudiante(`dani-${sufijo}@ia.test`);
  const r = await presentar(dani, m2.id, { [qM2]: "is" });
  assert.equal(await P.procesarIntento(r.id), "listo");
  assert.deepEqual((await openai.llamadas()).map((l) => l.respuesta), ["429", "429", "ok"]);
});

let idEva = 0;
await caso("OpenAI caído: queda «pendiente» y suma fallos; al 3.º pasa a «error»", async () => {
  await openai.reiniciar();
  await openai.modo({ falla: "500", veces: 999 });
  const eva = await estudiante(`eva-${sufijo}@ia.test`);
  idEva = (await presentar(eva, m2.id, { [qM2]: "am" })).id;
  assert.equal(await P.procesarIntento(idEva), "fallo");
  let i = await intento(idEva);
  assert.deepEqual([i.estado, i.ia_intentos, i.procesando_hasta], ["pendiente", 1, null]);
  assert.match(String(i.ia_error), /500/);
  assert.equal(await P.procesarIntento(idEva), "fallo");
  assert.equal(await P.procesarIntento(idEva), "fallo");
  i = await intento(idEva);
  assert.deepEqual([i.estado, i.ia_intentos], ["error", 3]);
  // 4 llamadas por corrida (1 + 3 reintentos), 3 corridas.
  assert.equal((await openai.llamadas()).length, 12);
  assert.equal(correosPara(eva.email).length, 0, "sin feedback no se manda correo");
});

await caso("estado para la pantalla: pendiente/error sin nadie procesando → relanzar", async () => {
  const [est] = await sql<{ estudiante_id: number }>(`SELECT estudiante_id FROM intentos WHERE id = $1`, [idEva]);
  await sql(`UPDATE intentos SET completed_at = now() - interval '1 minute' WHERE id = $1`, [idEva]);
  assert.equal((await I.estadoIntento(idEva, est.estudiante_id))?.relanzar, true);
  await sql(`UPDATE intentos SET procesando_hasta = now() + interval '5 minutes' WHERE id = $1`, [idEva]);
  assert.equal((await I.estadoIntento(idEva, est.estudiante_id))?.relanzar, false, "alguien lo está procesando");
  await sql(`UPDATE intentos SET procesando_hasta = NULL WHERE id = $1`, [idEva]);
  assert.equal(await I.estadoIntento(idEva, est.estudiante_id + 999999), null, "de otro estudiante");
});

await caso("reproceso (opcional): retoma el «error» cuando OpenAI vuelve; correo incluido", async () => {
  await openai.modo({});
  const r = await P.reprocesarPendientes();
  assert.ok(r.listos >= 1, JSON.stringify(r));
  const i = await intento(idEva);
  assert.deepEqual([i.estado, i.ia_error], ["listo", null]);
  assert.equal(correosPara(`eva-${sufijo}@ia.test`).length, 1);
});

await caso("(abiertas) si la abierta se calificó y falla el feedback, al reintentar no se vuelve a pagar la abierta", () =>
  conAbiertas(async () => {
    await openai.reiniciar();
    const fede = await estudiante(`fede-${sufijo}@ia.test`);
    const r = await presentar(fede, m1.id, { [qMc]: "was", [qOpen]: "I like the beach because the water is warm and blue." });
    // La 1.ª llamada (abiertas) responde; las 4 del feedback fallan.
    await openai.modo({ falla: "500", veces: 4, saltar: 1 });
    assert.equal(await P.procesarIntento(r.id), "fallo");
    const [abierta] = await sql<{ es_correcta: boolean | null }>(
      `SELECT es_correcta FROM respuestas WHERE intento_id = $1 AND pregunta_id = $2`,
      [r.id, qOpen],
    );
    assert.equal(abierta.es_correcta, true, "la abierta quedó calificada");
    assert.equal((await intento(r.id)).puntaje_total, 90);
    await openai.reiniciar();
    assert.equal(await P.procesarIntento(r.id), "listo");
    assert.deepEqual((await openai.llamadas()).map((l) => l.tipo), ["feedback"]);
  }),
);

await caso("tope de 10 fallos: el reproceso ya no lo toma; el staff (forzar) sí", async () => {
  const gabi = await estudiante(`gabi-${sufijo}@ia.test`);
  const r = await presentar(gabi, m2.id, { [qM2]: "am" });
  await sql(`UPDATE intentos SET estado = 'error', ia_intentos = 10, completed_at = now() - interval '5 minutes' WHERE id = $1`, [r.id]);
  await openai.reiniciar();
  await P.reprocesarPendientes();
  assert.equal((await intento(r.id)).estado, "error");
  assert.equal(await P.procesarIntento(r.id), "ocupado");
  assert.equal(await P.procesarIntento(r.id, { forzar: true }), "listo");
});

await caso("candado vencido (el proceso murió): se retoma", async () => {
  const hugo = await estudiante(`hugo-${sufijo}@ia.test`);
  const r = await presentar(hugo, m2.id, { [qM2]: "am" });
  await sql(
    `UPDATE intentos SET estado = 'calificando', procesando_hasta = now() + interval '5 minutes',
            completed_at = now() - interval '5 minutes' WHERE id = $1`,
    [r.id],
  );
  await P.reprocesarPendientes();
  assert.equal((await intento(r.id)).estado, "calificando", "con candado vigente no se toca");
  await sql(`UPDATE intentos SET procesando_hasta = now() - interval '1 minute' WHERE id = $1`, [r.id]);
  await P.reprocesarPendientes();
  assert.equal((await intento(r.id)).estado, "listo");
});

await caso("correo que rebota: se desmarca y queda el error; al corregirlo, se manda", async () => {
  const [e] = await sql<{ id: number }>(`INSERT INTO estudiantes (generacion_id, email) VALUES ($1, $2) RETURNING id`, [
    gen.id,
    `rebota@ia${sufijo}.test`,
  ]);
  const r = await presentar({ id: e.id, nombre: "Iván" }, m2.id, { [qM2]: "am" });
  assert.equal(await P.procesarIntento(r.id), "listo");
  let i = await intento(r.id);
  assert.equal(i.email_enviado, false);
  assert.match(String(i.envio_error), /550|buzón/i);
  await sql(`UPDATE estudiantes SET email = $2 WHERE id = $1`, [e.id, `ivan-${sufijo}@ia.test`]);
  // "Reintentar envío" del staff.
  assert.equal(await P.notificarIntento(r.id), "enviado");
  i = await intento(r.id);
  assert.deepEqual([i.email_enviado, i.envio_error], [true, null]);
});

await caso("correo que no salió: el reproceso (opcional) lo reenvía", async () => {
  const [e] = await sql<{ id: number }>(`INSERT INTO estudiantes (generacion_id, email) VALUES ($1, $2) RETURNING id`, [
    gen.id,
    `rebota@ia2${sufijo}.test`,
  ]);
  const r = await presentar({ id: e.id, nombre: "Juli" }, m2.id, { [qM2]: "am" });
  await P.procesarIntento(r.id);
  assert.equal((await intento(r.id)).email_enviado, false);
  await sql(`UPDATE estudiantes SET email = $2 WHERE id = $1`, [e.id, `juli-${sufijo}@ia.test`]);
  const s = await P.reprocesarPendientes();
  assert.ok(s.envios >= 1, JSON.stringify(s));
  const i = await intento(r.id);
  assert.deepEqual([i.email_enviado, i.envio_error], [true, null]);
  assert.equal(correosPara(`juli-${sufijo}@ia.test`).length, 1);
});

await caso("«listo» sin feedback (de antes de la Fase 5): sin correo, ni por el reproceso ni por el staff", async () => {
  const leo = await estudiante(`leo-${sufijo}@ia.test`);
  const r = await presentar(leo, m2.id, { [qM2]: "am" });
  // Como lo dejó la Fase 4: listo, con puntaje, sin feedback y sin avisar.
  await sql(
    `UPDATE intentos SET estado = 'listo', puntaje_total = 100, grammar_score = 1, feedback = NULL,
            completed_at = now() - interval '1 day' WHERE id = $1`,
    [r.id],
  );
  const s = await P.reprocesarPendientes();
  assert.equal(s.envios, 0);
  assert.equal(await P.notificarIntento(r.id), "no_aplica");
  const i = await intento(r.id);
  assert.deepEqual([i.email_enviado, i.envio_error], [false, null]);
  assert.equal(correosPara(leo.email).length, 0);
  // Y el estudiante no se queda esperando un feedback que no va a llegar.
  const e = await I.estadoIntento(r.id, leo.id);
  assert.deepEqual([e?.estado, e?.relanzar], ["listo", false]);
});

await caso("revisión del estudiante: feedback, nota y comentario de la abierta ya calificada", async () => {
  const d = await I.detalleIntento(m1.slug, 1, ana.id);
  assert.match(String(d?.feedback), /^Hola Ana/);
  const abierta = d!.preguntas.find((p) => p.id === qOpen)!;
  assert.deepEqual([abierta.nota, abierta.comentario], [8, "Buen uso del presente simple; cuida la concordancia."]);
  assert.deepEqual([d!.writing_score, d!.writing_total], [1, 1]);
});

// ---------------------------------------------------------------------------
// Configuración por defecto (abiertas apagadas): como a2, UNA llamada a OpenAI
// por intento (el feedback).
// ---------------------------------------------------------------------------

await caso("abiertas apagadas: el estudiante no ve la abierta y el intento hace UNA llamada (feedback)", async () => {
  await openai.reiniciar();
  const cata = await estudiante(`cata-${sufijo}@ia.test`);
  // M1 tiene una cerrada y una abierta: solo ve la cerrada (la abierta sigue en la BD).
  const d = await I.evaluacionParaPresentar(m1.slug, cata.id, gen.id);
  assert.deepEqual(d?.preguntas.map((p) => p.tipo), ["multiple_choice"]);
  assert.equal(d?.evaluacion.preguntas, 1);
  // Aunque el navegador mande algo para la abierta, no se guarda ni cuenta.
  const r = await presentar(cata, m1.id, {
    [qMc]: "was",
    [qOpen]: "My favorite place is the beach because it is calm and beautiful.",
  });
  const filas = await sql<{ pregunta_id: number }>(`SELECT pregunta_id FROM respuestas WHERE intento_id = $1`, [r.id]);
  assert.deepEqual(filas.map((f) => f.pregunta_id), [qMc]);
  assert.equal((await intento(r.id)).puntaje_total, 100);
  assert.equal(await P.procesarIntento(r.id), "listo");
  const llamadas = await openai.llamadas();
  assert.deepEqual(llamadas.map((l) => l.tipo), ["feedback"]);
  assert.ok(!JSON.stringify(llamadas[0].datos).includes("favorite place"), "el feedback no debe ver la abierta");
  const i = await intento(r.id);
  assert.deepEqual([i.estado, i.puntaje_total, i.email_enviado], ["listo", 100, true]);
});

await caso("abierta sin nota de antes de apagarlas: no se califica ni cuenta; una sola llamada", async () => {
  const dora = await estudiante(`dora-${sufijo}@ia.test`);
  // Enviado con las abiertas encendidas: la abierta quedó pendiente.
  const r = await conAbiertas(() =>
    presentar(dora, m1.id, { [qMc]: "was", [qOpen]: "I like my house because it is big and quiet." }),
  );
  assert.equal((await intento(r.id)).puntaje_total, null, "con la abierta pendiente");
  // Ya apagadas.
  await openai.reiniciar();
  assert.equal(await P.procesarIntento(r.id), "listo");
  assert.deepEqual((await openai.llamadas()).map((l) => l.tipo), ["feedback"]);
  const i = await intento(r.id);
  assert.deepEqual([i.estado, i.puntaje_total, i.grammar_score, i.writing_score], ["listo", 100, 1, 0]);
});

await caso("no se crean abiertas: crear, cambiar el tipo y duplicar se rechazan; clonar no las copia", async () => {
  const abierta = {
    seccion: null,
    tipo: "open" as const,
    categoria: "writing" as const,
    enunciado: "Write about your weekend.",
    pista: null,
    opciones: null,
    respuestas_aceptadas: null,
    rubrica: "Pasado simple.",
    puntaje: 10,
    material_id: null,
    subseccion: null,
  };
  await assert.rejects(Q.crearPregunta(m2.id, abierta), /abiertas están desactivadas/);
  const otra = await ins(m2.id, 5, "translation", "writing", "Estoy en casa.", null, ["I am at home."]);
  await assert.rejects(Q.actualizarPregunta(otra, abierta), /abiertas están desactivadas/);
  await assert.rejects(Q.duplicarPregunta(qOpen), /abiertas están desactivadas/);
  // M1 (cerrada + abierta) a una evaluación vacía: solo la cerrada.
  const destino = evs[2];
  assert.equal(await Q.clonarPreguntas(m1.id, destino.id), 1);
  const tipos = await sql<{ tipo: string }>(`SELECT tipo FROM preguntas WHERE evaluacion_id = $1`, [destino.id]);
  assert.deepEqual(tipos.map((t) => t.tipo), ["multiple_choice"]);
  // Las demás se siguen creando.
  assert.ok(await Q.crearPregunta(m2.id, { ...abierta, tipo: "translation", rubrica: null, respuestas_aceptadas: ["I was tired."] }));
  // Y encendidas, las abiertas vuelven a crearse.
  assert.ok(await conAbiertas(() => Q.crearPregunta(destino.id, abierta)));
});

// ---------------------------------------------------------------------------
// Bienvenida con la forma del English Placement Test (desde la G2): el nivel lo
// calcula lib/placement/ y la IA solo escribe los textos.
// ---------------------------------------------------------------------------

const [bienvenida] = await sql<{ id: number }>(
  `SELECT id FROM evaluaciones WHERE generacion_id = $1 AND tipo = 'bienvenida'`,
  [gen.id],
);
const materialPlacement = (tipo: "lectura" | "audio", titulo: string) =>
  sql<{ id: number }>(
    `INSERT INTO materiales (evaluacion_id, tipo, titulo, texto, audio_url) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [bienvenida.id, tipo, titulo, tipo === "lectura" ? "Tom wakes up at seven." : null, tipo === "audio" ? "https://audios.test/r.mp3" : null],
  ).then((r) => r[0].id);
const materialesPlacement = {
  reading: await Promise.all(NIVELES_BLOQUE.map((_, k) => materialPlacement("lectura", `Reading ${k + 1}`))),
  listening: await Promise.all(NIVELES_BLOQUE.map((_, k) => materialPlacement("audio", `Recording ${k + 1}`))),
};
const PARTE = { grammar: "PART 1 – GRAMMAR & VOCABULARY", reading: "PART 2 – READING", listening: "PART 3 – LISTENING" };
const preguntaPlacement = async (n: number) => {
  const { nivel, habilidad } = ubicarPregunta(n)!;
  const k = NIVELES_BLOQUE.indexOf(nivel);
  const [p] = await sql<{ id: number }>(
    `INSERT INTO preguntas (evaluacion_id, orden, seccion, subseccion, tipo, categoria, enunciado, opciones,
                            respuestas_aceptadas, material_id)
     VALUES ($1, $2, $3, $4, 'multiple_choice', 'grammar', $5, '["a","b"]', '["a"]', $6) RETURNING id`,
    [
      bienvenida.id,
      n,
      PARTE[habilidad],
      habilidad === "grammar" ? `Section ${"ABCD"[k]}` : null,
      `Question ${n}`,
      habilidad === "grammar" ? null : materialesPlacement[habilidad][k],
    ],
  );
  return p.id;
};
const qPlacement: number[] = [];
for (let n = 1; n <= 87; n++) qPlacement.push(await preguntaPlacement(n));
await sql(`UPDATE evaluaciones SET publicada = TRUE WHERE id = $1`, [bienvenida.id]);

// Por nivel, cuántas acierta en cada habilidad (las primeras de cada grupo):
// A1 completo, A2 17/22 (aprueba) y B1 15/22 (le falta 1) → A2, cerca de B1.
const aciertosPlacement = {
  A1: { grammar: 15, reading: 4, listening: 3 },
  A2: { grammar: 12, reading: 3, listening: 2 },
  B1: { grammar: 10, reading: 3, listening: 2 },
  B2: { grammar: 0, reading: 0, listening: 0 },
};
const respuestasPlacement = () =>
  Object.fromEntries(
    qPlacement.map((id, i) => {
      const { nivel, habilidad } = ubicarPregunta(i + 1)!;
      const desde = { grammar: 1, reading: 61, listening: 77 }[habilidad];
      return [id, (i + 1 - desde) % POR_NIVEL[habilidad] < aciertosPlacement[nivel][habilidad] ? "a" : "b"];
    }),
  );

await caso("bienvenida incompleta (87 de 88): sin nivel, el feedback general", async () => {
  await openai.reiniciar();
  const pia = await estudiante(`pia-${sufijo}@ia.test`);
  const r = await presentar(pia, bienvenida.id, respuestasPlacement());
  assert.equal(await P.procesarIntento(r.id), "listo");
  assert.deepEqual((await openai.llamadas()).map((l) => l.tipo), ["feedback"]);
  assert.doesNotMatch(String((await intento(r.id)).feedback), /Nivel estimado/);
});

await caso("bienvenida con la forma del Placement Test: nivel calculado y los textos de la IA, en pantalla y correo", async () => {
  qPlacement.push(await preguntaPlacement(88));
  await openai.reiniciar();
  const raul = await estudiante(`raul-${sufijo}@ia.test`);
  const r = await presentar(raul, bienvenida.id, respuestasPlacement());
  assert.equal(await P.procesarIntento(r.id), "listo");
  const llamadas = await openai.llamadas();
  assert.deepEqual(llamadas.map((l) => l.tipo), ["placement"], "una sola llamada a OpenAI");
  const prompt = llamadas[0].datos.messages![1].content;
  assert.match(prompt, /"nivel_estimado": "A2 – Elemental"/);
  assert.match(prompt, /"16\. \(Grammar & Vocabulary\) Question 16 → a"/);
  assert.match(prompt, /"64\. \(Reading\) \[Reading 1\] Question 64 → a"/);
  assert.match(prompt, /"88\. \(Listening\) \[Recording 4\] Question 88 → b"/);

  const i = await intento(r.id);
  assert.equal(i.puntaje_total, 61, "54 de 88");
  const f = String(i.feedback);
  assert.match(f, /^Hola Ana, esta prueba nos ayuda a encontrar tu punto de partida\.\n\nTu resultado\nNivel estimado: A2 – Elemental\n/);
  assert.match(f, /Puntuación general: 54 de 88 \(61 %\)/);
  assert.match(f, /• B1 – Intermedio: 15\/22 \(68 %\), en desarrollo\. Grammar & Vocabulary 10\/15 · Reading 3\/4 · Listening 2\/3/);
  assert.match(f, /Estás cerca de la transición a B1 – Intermedio: te faltó 1 respuesta correcta/);
  assert.match(f, /Nivel de inicio recomendado: B1 – Intermedio\nAprovecha el material de estudio/);

  const [correo] = correosPara(raul.email);
  assert.equal(correo.subject, "Tu resultado de Evaluación de bienvenida · Speak Easy");
  assert.match(correo.text, /Nivel estimado: A2 – Elemental/);
});

fin();
process.exit();
