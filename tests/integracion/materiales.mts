// Integración de lecturas y audios (db/009, lib/datos/materiales.ts): crearlos,
// ligar varias preguntas, la regla de "misma evaluación", lo que recibe el
// estudiante, clonar, editar y eliminar (con y sin respuestas).
// Se corre con `npm run test:integracion` (ver tests/integracion/ejecutar.mjs).
import assert from "node:assert/strict";
import { casos } from "./comun.mjs";
import { query } from "@/lib/db";
import { traducirErrorBD } from "@/lib/db-errores";
import { ErrorNegocio } from "@/lib/errores";
import * as I from "@/lib/datos/intentos";
import * as M from "@/lib/datos/materiales";
import * as Q from "@/lib/datos/preguntas";
import { aFila, entradaPreguntaSchema } from "@/lib/preguntas/entrada";
import { aFilaMaterial, entradaMaterialSchema } from "@/lib/preguntas/materiales";

const { caso, fin } = casos();
const sql = async <T extends object = Record<string, unknown>>(t: string, p: unknown[] = []) => (await query<T>(t, p)).rows;
const sufijo = Date.now().toString(36);

const lectura = aFilaMaterial(
  entradaMaterialSchema.parse({ tipo: "lectura", titulo: "Reading 1 – A Typical Day", texto: "My name is Emma.\nI work at a store." }),
);
const audio = aFilaMaterial(
  entradaMaterialSchema.parse({ tipo: "audio", titulo: "Recording 1", audio_url: "https://ejemplo.test/r1.mp3", texto: "" }),
);
const pregunta = (material_id: number | null, enunciado: string) =>
  aFila(
    entradaPreguntaSchema.parse({
      tipo: "multiple_choice",
      seccion: "Part 2 – Reading",
      categoria: "grammar",
      enunciado,
      pista: "",
      puntaje: 10,
      opciones: ["A store", "A school"],
      correctas: [0],
      material_id,
    }),
  );
const materialDe = async (preguntaId: number) =>
  (await sql<{ material_id: number | null }>(`SELECT material_id FROM preguntas WHERE id = $1`, [preguntaId]))[0].material_id;

async function main() {
  const [gen] = await sql<{ id: number }>(
    `INSERT INTO generaciones (codigo, nombre, fecha_inicio) VALUES ($1, 'Integración materiales', '2026-10-01') RETURNING id`,
    [`gen-mat-${sufijo}`],
  );
  await sql(`SELECT generar_evaluaciones($1)`, [gen.id]);
  const [m1, m2, m3] = await sql<{ id: number; slug: string }>(
    `SELECT id, slug FROM evaluaciones WHERE generacion_id = $1 AND tipo = 'mensual' ORDER BY numero LIMIT 3`,
    [gen.id],
  );
  let idLectura = 0;
  let idAudio = 0;
  let q1 = 0;
  let q2 = 0;
  let q3 = 0;

  await caso("crear: una lectura y un audio en M1 (sin preguntas todavía)", async () => {
    idLectura = await M.crearMaterial(m1.id, lectura);
    idAudio = await M.crearMaterial(m1.id, audio);
    const lista = await M.listarMateriales(m1.id);
    assert.deepEqual(
      lista.map((m) => [m.tipo, m.titulo, m.texto, m.audio_url, m.preguntas, m.con_respuestas]),
      [
        ["lectura", "Reading 1 – A Typical Day", "My name is Emma.\nI work at a store.", null, 0, false],
        ["audio", "Recording 1", null, "https://ejemplo.test/r1.mp3", 0, false],
      ],
    );
    await assert.rejects(M.crearMaterial(999_999, lectura), /La evaluación no existe/);
  });

  await caso("la BD exige texto a la lectura y un enlace http(s) al audio", async () => {
    for (const [tipo, texto, url] of [["lectura", " ", null], ["audio", null, "ftp://x.mp3"], ["audio", null, null]]) {
      const e = await sql(
        `INSERT INTO materiales (evaluacion_id, tipo, titulo, texto, audio_url) VALUES ($1, $2, 'X', $3, $4)`,
        [m1.id, tipo, texto, url],
      ).catch((x) => x);
      assert.match(String(e?.constraint), /materiales_contenido_check/);
      assert.match(traducirErrorBD(e)?.mensaje ?? "", /lectura necesita su texto/);
    }
  });

  await caso("ligar: varias preguntas a la misma lectura; la vista pública trae material_id", async () => {
    q1 = await Q.crearPregunta(m1.id, pregunta(idLectura, "Where does Emma work?"));
    q2 = await Q.crearPregunta(m1.id, pregunta(idLectura, "Who lives with Emma?"));
    q3 = await Q.crearPregunta(m1.id, pregunta(idAudio, "What time does the class start?"));
    const publicas = await Q.listarPublicas(m1.id);
    assert.deepEqual(publicas.map((p) => p.material_id), [idLectura, idLectura, idAudio]);
    const materiales = await M.materialesDe(publicas);
    assert.deepEqual(materiales.map((m) => [m.id, m.tipo]), [[idLectura, "lectura"], [idAudio, "audio"]]);
    assert.deepEqual((await M.listarMateriales(m1.id)).map((m) => m.preguntas), [2, 1]);
  });

  await caso("no se puede ligar a una lectura de otra evaluación (trigger)", async () => {
    const e = await Q.crearPregunta(m2.id, pregunta(idLectura, "Otra")).catch((x) => x);
    assert.deepEqual(traducirErrorBD(e), { campo: "material_id", mensaje: "Esa lectura o audio no es de esta evaluación." });
    const [{ n }] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM preguntas WHERE evaluacion_id = $1`, [m2.id]);
    assert.equal(n, 0);
  });

  await caso("duplicar conserva la lectura; editar la cambia o la quita", async () => {
    const copia = await Q.duplicarPregunta(q2);
    assert.equal(await materialDe(copia), idLectura);
    await Q.actualizarPregunta(copia, pregunta(idAudio, "Who lives with Emma?"));
    assert.equal(await materialDe(copia), idAudio);
    await Q.actualizarPregunta(copia, pregunta(null, "Who lives with Emma?"));
    assert.equal(await materialDe(copia), null);
    await Q.eliminarPregunta(copia);
  });

  const [est] = await sql<{ id: number }>(
    `INSERT INTO estudiantes (generacion_id, email) VALUES ($1, $2) RETURNING id`,
    [gen.id, `mat-${sufijo}@int.test`],
  );

  await caso("el estudiante recibe la lectura y el audio de sus preguntas al presentar", async () => {
    await sql(`UPDATE evaluaciones SET publicada = TRUE WHERE id = $1`, [m1.id]);
    const d = await I.evaluacionParaPresentar(m1.slug, est.id, gen.id);
    assert.ok(d);
    assert.deepEqual(d!.preguntas.map((p) => p.material_id), [idLectura, idLectura, idAudio]);
    assert.deepEqual(d!.materiales.map((m) => m.titulo), ["Reading 1 – A Typical Day", "Recording 1"]);
    // Lo que llega al navegador no trae respuestas.
    assert.ok(!("respuestas_aceptadas" in d!.preguntas[0]));
  });

  await caso("clonar copia las lecturas y audios y liga las copias a los nuevos", async () => {
    assert.equal(await Q.clonarPreguntas(m1.id, m3.id), 3);
    const copias = await M.listarMateriales(m3.id);
    assert.deepEqual(copias.map((m) => [m.tipo, m.titulo, m.preguntas]), [["lectura", "Reading 1 – A Typical Day", 2], ["audio", "Recording 1", 1]]);
    assert.ok(copias.every((m) => m.id !== idLectura && m.id !== idAudio));
    const ligadas = await sql<{ material_id: number }>(
      `SELECT p.material_id FROM preguntas p JOIN materiales m ON m.id = p.material_id
        WHERE p.evaluacion_id = $1 AND m.evaluacion_id = $1 ORDER BY p.orden`,
      [m3.id],
    );
    assert.equal(ligadas.length, 3);
  });

  await caso("eliminar: sin respuestas sus preguntas quedan sin él; con respuestas no se deja", async () => {
    await M.eliminarMaterial(idAudio);
    assert.equal(await materialDe(q3), null);
    // Un intento con respuesta a una pregunta de la lectura.
    const [i] = await sql<{ id: number }>(
      `INSERT INTO intentos (evaluacion_id, estudiante_id, token, nombre) VALUES ($1, $2, $3, 'Mat') RETURNING id`,
      [m1.id, est.id, `tok-mat-${sufijo}`],
    );
    await sql(
      `INSERT INTO respuestas (intento_id, pregunta_id, respuesta, es_correcta, puntaje) VALUES ($1, $2, '"A store"', TRUE, 10)`,
      [i.id, q1],
    );
    assert.deepEqual((await M.listarMateriales(m1.id)).map((m) => [m.id, m.con_respuestas]), [[idLectura, true]]);
    await assert.rejects(
      M.eliminarMaterial(idLectura),
      (e) => e instanceof ErrorNegocio && /ya tienen respuestas/.test(e.message),
    );
    await assert.rejects(M.eliminarMaterial(999_999), /ya no existe/);
  });

  await caso("editar: corregir el texto se permite aunque ya haya respuestas", async () => {
    await M.actualizarMaterial(idLectura, { ...lectura, texto: "My name is Emma. I work at a clothing store." });
    const [m] = await M.listarMateriales(m1.id);
    assert.equal(m.texto, "My name is Emma. I work at a clothing store.");
    await assert.rejects(M.actualizarMaterial(999_999, lectura), /ya no existe/);
  });

  await caso("subsección (db/010): crear, editar, duplicar, la recibe el estudiante y clonar la copia", async () => {
    const [m4, m5] = await sql<{ id: number; slug: string }>(
      `SELECT id, slug FROM evaluaciones WHERE generacion_id = $1 AND tipo = 'mensual' AND numero IN (4, 5) ORDER BY numero`,
      [gen.id],
    );
    const conSub = (subseccion: string, enunciado: string) =>
      aFila(
        entradaPreguntaSchema.parse({
          tipo: "multiple_choice", seccion: "Part 1 – Grammar & Vocabulary", subseccion, categoria: "grammar",
          enunciado, pista: "", puntaje: 10, opciones: ["is", "are"], correctas: [0],
        }),
      );
    const a = await Q.crearPregunta(m4.id, conSub("Section A", "She ___ a nurse."));
    const b = await Q.crearPregunta(m4.id, conSub("Section A", "He ___ tall."));
    await Q.actualizarPregunta(b, conSub("Section B", "He ___ tall."));
    const copia = await Q.duplicarPregunta(b);
    assert.deepEqual(
      (await Q.listarPreguntas(m4.id)).map((p) => [p.id, p.subseccion]),
      [[a, "Section A"], [b, "Section B"], [copia, "Section B"]],
    );
    // Sin sección la BD la rechaza y el error se traduce al campo.
    const e = await Q.actualizarPregunta(a, { ...conSub("Section A", "x"), seccion: null }).catch((x) => x);
    assert.deepEqual(traducirErrorBD(e), {
      campo: "subseccion",
      mensaje: "La subsección va dentro de una sección: elige primero la sección.",
    });
    await sql(`UPDATE evaluaciones SET publicada = TRUE WHERE id = $1`, [m4.id]);
    const d = await I.evaluacionParaPresentar(m4.slug, est.id, gen.id);
    assert.deepEqual(d!.preguntas.map((p) => p.subseccion), ["Section A", "Section B", "Section B"]);
    assert.equal(await Q.clonarPreguntas(m4.id, m5.id), 3);
    assert.deepEqual((await Q.listarPublicas(m5.id)).map((p) => p.subseccion), ["Section A", "Section B", "Section B"]);
  });
}

main()
  .then(fin)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
