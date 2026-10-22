// Integración de la Fase 6 (administración): importación de estudiantes por CSV,
// estudiantes uno a uno, reglas del staff (incluida la concurrencia), resultados
// con filtros y exportación, generación desactivada y eliminar una generación. Se corre con `npm run test:integracion`.
import assert from "node:assert/strict";
import { casos } from "./comun.mjs";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import * as E from "@/lib/datos/estudiantes";
import * as G from "@/lib/datos/generaciones";
import * as I from "@/lib/datos/intentos";
import * as R from "@/lib/datos/resultados";
import * as S from "@/lib/datos/staff";
import { analizarCsvEstudiantes } from "@/lib/estudiantes/importar";
import { leerFiltros } from "@/lib/resultados";

const { caso, fin } = casos();
const sql = async <T extends object = Record<string, unknown>>(t: string, p: unknown[] = []) => (await query<T>(t, p)).rows;
const sufijo = Date.now().toString(36);
const correo = (n: string) => `${n}-${sufijo}@admin.test`;

async function generacion(nombre: string) {
  const [g] = await sql<{ id: number }>(
    `INSERT INTO generaciones (codigo, nombre, fecha_inicio) VALUES ($1, $2, '2026-10-01') RETURNING id`,
    [`gen-${nombre.toLowerCase()}-${sufijo}`, nombre],
  );
  await sql(`SELECT generar_evaluaciones($1)`, [g.id]);
  return g.id;
}
async function estudiante(generacionId: number, n: string, { activo = true } = {}) {
  const [e] = await sql<{ id: number }>(
    `INSERT INTO estudiantes (generacion_id, email, activo) VALUES ($1, $2, $3) RETURNING id`,
    [generacionId, correo(n), activo],
  );
  return e.id;
}
const fila = async (email: string) =>
  (
    await sql<{ generacion_id: number; activo: boolean }>(
      `SELECT generacion_id, activo FROM estudiantes WHERE email = $1`,
      [email],
    )
  )[0];
const validas = (texto: string) => {
  const a = analizarCsvEstudiantes(texto);
  if (!a.ok) throw new Error(a.error);
  return a.validas;
};

// ---------------------------------------------------------------------------
// Estudiantes por CSV
// ---------------------------------------------------------------------------
const g1 = await generacion("Uno");
const g2 = await generacion("Dos");
await estudiante(g1, "ana");
await estudiante(g2, "beto");
await estudiante(g2, "carla", { activo: false });
const idDiana = await estudiante(g1, "diana"); // no viene en el CSV: no se toca
await sql(
  `INSERT INTO staff (email, nombre, rol, password_hash) VALUES ($1, 'Staff', 'docente', 'scrypt$x$y')`,
  [correo("staff")],
);
// Con el formato de antes (columna manychat_id): esa columna se ignora.
const CSV = [
  "correo;manychat_id",
  `${correo("nuevo")};999`,
  `${correo("ana")};222`,
  `${correo("beto")};`,
  `${correo("carla")};333`,
  `${correo("staff")};`,
  "no-es-correo;",
  `${correo("NUEVO")};`,
].join("\r\n");

await caso("vista previa: nuevos, cambian de generación, sin cambios, inactivos y correos del staff", async () => {
  const c = await E.previsualizarImportacion(g1, validas(CSV));
  assert.deepEqual(c.nuevos.map((f) => f.email), [correo("nuevo")]);
  assert.deepEqual(
    c.cambianGeneracion.map((f) => [f.email, f.generacion_actual]),
    [[correo("beto"), "Dos"]],
  );
  assert.deepEqual(c.sinCambios.map((f) => f.email), [correo("ana")]);
  assert.deepEqual(c.inactivos.map((f) => f.email), [correo("carla")]);
  assert.deepEqual(c.delStaff.map((f) => f.email), [correo("staff")]);
  // La vista previa no guarda nada.
  assert.equal(await fila(correo("nuevo")), undefined);
});

await caso("importar: una transacción; mueve, actualiza, no reactiva, no borra ni toca a los demás", async () => {
  const r = await E.importarEstudiantes(g1, validas(CSV));
  assert.deepEqual(r, { creados: 1, movidos: 1, inactivos: 1, sinCambios: 1, delStaff: 1 });
  assert.deepEqual(await fila(correo("nuevo")), { generacion_id: g1, activo: true });
  assert.deepEqual(await fila(correo("ana")), { generacion_id: g1, activo: true });
  assert.deepEqual(await fila(correo("beto")), { generacion_id: g1, activo: true });
  assert.deepEqual(await fila(correo("carla")), { generacion_id: g1, activo: false });
  assert.deepEqual(await fila(correo("diana")), { generacion_id: g1, activo: true });
  const [s] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM estudiantes WHERE email = $1`, [correo("staff")]);
  assert.equal(s.n, 0, "un correo del staff no se vuelve estudiante");
});

await caso("reimportar el mismo archivo: sin cambios", async () => {
  const r = await E.importarEstudiantes(g1, validas(CSV));
  assert.deepEqual(r, { creados: 0, movidos: 0, inactivos: 1, sinCambios: 3, delStaff: 1 });
});

await caso("dos importaciones a la vez del mismo correo nuevo: una lo crea, la otra lo ve (sin error)", async () => {
  const csv = `${correo("simultaneo")}`;
  const rs = await Promise.all([E.importarEstudiantes(g2, validas(csv)), E.importarEstudiantes(g2, validas(csv))]);
  assert.deepEqual(rs.map((r) => r.creados).sort(), [0, 1]);
});

await caso("generación que no existe o archivo sin correos válidos: error claro", async () => {
  await assert.rejects(E.importarEstudiantes(999_999, validas(CSV)), /La generación no existe/);
  await assert.rejects(E.importarEstudiantes(g1, []), /no tiene correos válidos/);
});

await caso("lista: búsqueda por correo y nombre (comodines literales) y activar/desactivar", async () => {
  let l = await E.listarEstudiantes(g1, { q: "BETO" });
  assert.deepEqual([l.total, l.filas[0]?.email], [1, correo("beto")]);
  assert.equal((await E.listarEstudiantes(g1, { q: "%" })).total, 0, "% no es comodín");
  await E.cambiarActivoEstudiante(idDiana, false);
  l = await E.listarEstudiantes(g1, { q: "diana" });
  assert.deepEqual([l.filas[0].activo, l.filas[0].intentos], [false, 0]);
  await E.cambiarActivoEstudiante(idDiana, true);
  await assert.rejects(E.cambiarActivoEstudiante(999_999, true), /no existe/);
});

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
// En esta base de prueba: dejar solo los admins de esta suite.
await sql(`UPDATE staff SET activo = FALSE WHERE rol = 'admin'`);
const [{ id: adminA }] = await sql<{ id: number }>(
  `INSERT INTO staff (email, nombre, rol, password_hash) VALUES ($1, 'Admin A', 'admin', 'scrypt$x$y') RETURNING id`,
  [correo("admin-a")],
);

let docente = 0;
await caso("crear: contraseña temporal de 16 que funciona, cambio obligatorio; correo de estudiante rechazado", async () => {
  const r = await S.crearStaff({ email: correo("docente"), nombre: "Docente Uno", rol: "docente" });
  docente = r.id;
  assert.match(r.password, /^[A-HJ-NP-Za-km-z2-9]{16}$/);
  const [d] = await sql<{ password_hash: string; debe_cambiar_password: boolean; sesion_version: number }>(
    `SELECT password_hash, debe_cambiar_password, sesion_version FROM staff WHERE id = $1`,
    [docente],
  );
  assert.equal(await verifyPassword(r.password, d.password_hash), true);
  assert.deepEqual([d.debe_cambiar_password, d.sesion_version], [true, 0]);
  await assert.rejects(S.crearStaff({ email: correo("ana"), nombre: "X", rol: "docente" }), /es de un estudiante/);
  await assert.rejects(S.crearStaff({ email: correo("docente"), nombre: "X", rol: "docente" }), (e: { constraint?: string }) =>
    e.constraint === "staff_email_key",
  );
});

await caso("sobre sí mismo: ni rol, ni desactivarse, ni restablecer", async () => {
  await assert.rejects(S.cambiarRolStaff(adminA, adminA, "docente"), /tu propio rol/);
  await assert.rejects(S.cambiarActivoStaff(adminA, adminA, false), /desactivarte a ti mismo/);
  await assert.rejects(S.restablecerPasswordStaff(adminA, adminA), /Cambiar mi contraseña/);
});

await caso("restablecer: nueva temporal, cambio obligatorio y cierra sus sesiones (sesion_version + 1)", async () => {
  await sql(`UPDATE staff SET debe_cambiar_password = FALSE WHERE id = $1`, [docente]);
  const password = await S.restablecerPasswordStaff(adminA, docente);
  const [d] = await sql<{ password_hash: string; debe_cambiar_password: boolean; sesion_version: number }>(
    `SELECT password_hash, debe_cambiar_password, sesion_version FROM staff WHERE id = $1`,
    [docente],
  );
  assert.equal(await verifyPassword(password, d.password_hash), true);
  assert.deepEqual([d.debe_cambiar_password, d.sesion_version], [true, 1]);
  // La sesión vieja (versión 0) ya no la reconoce el guard (misma condición).
  const viejas = await sql(`SELECT 1 FROM staff WHERE id = $1 AND activo AND sesion_version = 0`, [docente]);
  assert.equal(viejas.length, 0);
});

await caso("cambiar mi contraseña: valida la actual y el largo; quita la temporal y cierra otras sesiones", async () => {
  const temporal = await S.restablecerPasswordStaff(adminA, docente);
  await assert.rejects(S.cambiarMiPassword(docente, "otra-cosa", "una-frase-bien-larga"), (e: { campo?: string }) =>
    e.campo === "actual",
  );
  await assert.rejects(S.cambiarMiPassword(docente, temporal, "corta"), /al menos 12/);
  await assert.rejects(S.cambiarMiPassword(docente, temporal, temporal), /distinta/);
  const r = await S.cambiarMiPassword(docente, temporal, "una-frase-bien-larga");
  const [d] = await sql<{ debe_cambiar_password: boolean; sesion_version: number }>(
    `SELECT debe_cambiar_password, sesion_version FROM staff WHERE id = $1`,
    [docente],
  );
  assert.deepEqual([d.debe_cambiar_password, d.sesion_version, r.sesion_version, r.rol], [false, 3, 3, "docente"]);
});

await caso("siempre al menos un admin activo; quien dejó de ser admin ya no puede", async () => {
  // Solo A es admin: nadie puede dejar la base sin admins (A no puede sobre sí mismo).
  await S.cambiarRolStaff(adminA, docente, "admin");
  await S.cambiarRolStaff(docente, adminA, "docente"); // el docente ascendido quita a A
  await assert.rejects(S.cambiarActivoStaff(adminA, docente, false), /Ya no eres administrador activo/);
  await S.cambiarRolStaff(docente, adminA, "admin"); // lo devuelve
});

await caso("concurrencia: dos admins se quitan el rol el uno al otro a la vez → solo uno lo logra", async () => {
  const rs = await Promise.allSettled([
    S.cambiarRolStaff(adminA, docente, "docente"),
    S.cambiarRolStaff(docente, adminA, "docente"),
  ]);
  assert.deepEqual(rs.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  const [n] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM staff WHERE rol = 'admin' AND activo`);
  assert.equal(n.n, 1);
  // Para lo que sigue, A vuelve a ser el admin.
  await sql(`UPDATE staff SET rol = 'admin' WHERE id = $1`, [adminA]);
});

await caso("desactivar a otro y reactivarlo; listarStaff con su estado", async () => {
  await S.cambiarActivoStaff(adminA, docente, false);
  let m = (await S.listarStaff()).find((x) => x.id === docente)!;
  assert.equal(m.activo, false);
  await S.cambiarActivoStaff(adminA, docente, true);
  m = (await S.listarStaff()).find((x) => x.id === docente)!;
  assert.deepEqual([m.activo, m.email], [true, correo("docente")]);
});

// ---------------------------------------------------------------------------
// Resultados y generación desactivada
// ---------------------------------------------------------------------------
const g3 = await generacion("Tres");
const [m1, m2] = await sql<{ id: number; slug: string }>(
  `SELECT id, slug FROM evaluaciones WHERE generacion_id = $1 AND tipo = 'mensual' ORDER BY numero LIMIT 2`,
  [g3],
);
for (const ev of [m1, m2]) {
  await sql(
    `INSERT INTO preguntas (evaluacion_id, orden, tipo, categoria, enunciado, opciones, respuestas_aceptadas)
     VALUES ($1, 1, 'multiple_choice', 'grammar', 'I ___ a student.', '["am","is"]', '["am"]')`,
    [ev.id],
  );
}
await sql(`UPDATE evaluaciones SET publicada = TRUE WHERE id = ANY($1)`, [[m1.id, m2.id]]);
const eva = { id: await estudiante(g3, "eva"), nombre: "=SUMA(1;2)" }; // nombre "peligroso" para Excel
const flor = { id: await estudiante(g3, "flor"), nombre: "Flor Ríos" };
const presentar = async (est: { id: number; nombre: string }, ev: number, r: string) => {
  const i = await I.iniciarOReanudar(ev, est);
  if (i.tipo !== "en_curso") throw new Error("no inició");
  await I.enviarIntento(i.intento.id, est.id, { [String((await sql<{ id: number }>(`SELECT id FROM preguntas WHERE evaluacion_id = $1`, [ev]))[0].id)]: r }, 0);
  return i.intento.id;
};
await presentar(eva, m1.id, "am");
await presentar(flor, m1.id, "is");
await presentar(flor, m2.id, "am");
const enCurso = await I.iniciarOReanudar(m2.id, eva); // queda en progreso
if (enCurso.tipo !== "en_curso") throw new Error("no inició");
const codigo = `gen-tres-${sufijo}`;
const buscar = (p: Record<string, string>) => R.buscarResultados(leerFiltros({ generacion: codigo, ...p }));

await caso("resultados: por defecto los enviados; filtros de evaluación, estado y búsqueda", async () => {
  assert.equal((await buscar({})).total, 3);
  assert.equal((await buscar({ estado: "en_progreso" })).total, 1);
  assert.equal((await buscar({ estado: "todos" })).total, 4);
  assert.equal((await buscar({ evaluacion: m1.slug })).total, 2);
  assert.equal((await buscar({ q: "ríos" })).total, 2, "por nombre, sin importar mayúsculas");
  assert.equal((await buscar({ q: correo("eva") })).total, 1, "por correo");
  const r = await buscar({});
  assert.ok(r.filas.every((f) => f.generacion === codigo && f.estado !== "en_progreso"));
  assert.equal(r.paginas, 1);
  // Filtros inválidos en la URL: se ignoran (no rompen la página).
  assert.deepEqual(leerFiltros({ estado: "x", pagina: "-3", generacion: "DROP TABLE" }), {
    generacion: "",
    evaluacion: "",
    estado: "enviados",
    q: "",
    pagina: 1,
  });
});

await caso("exportar: BOM, ; , hora de Colombia, fórmulas neutralizadas; mismos filtros", async () => {
  const { csv, filas } = await R.exportarResultados(leerFiltros({ generacion: codigo }));
  assert.equal(filas, 3);
  assert.ok(csv.startsWith("\uFEFFGeneración;Evaluación;Slug;Nombre;Correo;"));
  const lineas = csv.trimEnd().split("\r\n");
  assert.equal(lineas.length, 4);
  assert.ok(lineas.some((l) => l.includes(";'=SUMA(1;2)") || l.includes(`;"'=SUMA(1;2)"`)), "fórmula neutralizada");
  assert.match(lineas[1], /;\d{4}-\d{2}-\d{2} \d{2}:\d{2};\d{4}-\d{2}-\d{2} \d{2}:\d{2};(Sí|No)$/);
  const [h] = await sql<{ local: string }>(
    `SELECT to_char(completed_at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI') AS local
       FROM intentos i JOIN evaluaciones e ON e.id = i.evaluacion_id
      WHERE e.generacion_id = $1 AND i.estado <> 'en_progreso' ORDER BY completed_at DESC, i.id DESC LIMIT 1`,
    [g3],
  );
  assert.ok(lineas[1].endsWith(`;${h.local};No`) || lineas[1].endsWith(`;${h.local};Sí`), lineas[1]);
});

await caso("generación desactivada: sin evaluaciones; no empieza, no continúa, no envía (ni el trigger)", async () => {
  assert.deepEqual(await G.resumenGeneracion(g3), { estudiantes: 2, en_curso: 1 });
  await I.guardarBorrador(enCurso.intento.id, eva.id, { x: "borrador" }, 0);
  await G.cambiarActivaGeneracion(g3, false);
  assert.deepEqual(await I.evaluacionesDelEstudiante(eva.id, g3), []);
  assert.equal(await I.evaluacionParaPresentar(m2.slug, eva.id, g3), null);
  await assert.rejects(I.iniciarOReanudar(m2.id, eva), /generación está desactivada/);
  await assert.rejects(I.iniciarOReanudar(m1.id, flor), /generación está desactivada/);
  assert.deepEqual(await I.guardarBorrador(enCurso.intento.id, eva.id, { x: "nuevo" }, 0), {
    ok: false,
    motivo: "generacion_inactiva",
  });
  await assert.rejects(I.enviarIntento(enCurso.intento.id, eva.id, {}, 0), /generación está desactivada/);
  // Aunque esté vencido, cerrarVencidos no lo califica: se conserva.
  await sql(`UPDATE intentos SET limite_at = now() - interval '1 hour' WHERE id = $1`, [enCurso.intento.id]);
  await I.cerrarVencidos(eva.id);
  const [i] = await sql<{ estado: string; respuestas_borrador: unknown }>(
    `SELECT estado, respuestas_borrador FROM intentos WHERE id = $1`,
    [enCurso.intento.id],
  );
  assert.deepEqual(i, { estado: "en_progreso", respuestas_borrador: { x: "borrador" } });
  // validar_intento (005) también lo rechaza directo en la BD.
  await assert.rejects(
    sql(`INSERT INTO intentos (evaluacion_id, estudiante_id, token, nombre) VALUES ($1, $2, $3, 'X')`, [
      m1.id,
      flor.id,
      `tok-${sufijo}`,
    ]),
    /generación de la evaluación .* está desactivada/,
  );
  // Su historial (M1 y M2) y sus resultados siguen visibles; ya no puede repetir.
  assert.equal((await I.mejoresPorEvaluacion(flor.id)).length, 2);
  const d = await I.detalleIntento(m1.slug, 1, flor.id);
  assert.deepEqual([d?.numero, d?.puedeRepetir], [1, false]);
});

await caso("reactivar: retoma el intento en curso con lo guardado y puede enviarlo", async () => {
  await sql(`UPDATE intentos SET limite_at = NULL WHERE id = $1`, [enCurso.intento.id]);
  await G.cambiarActivaGeneracion(g3, true);
  const r = await I.iniciarOReanudar(m2.id, eva);
  assert.equal(r.tipo, "en_curso");
  assert.deepEqual(r.tipo === "en_curso" && [r.intento.id, r.intento.borrador], [enCurso.intento.id, { x: "borrador" }]);
  assert.equal((await I.enviarIntento(enCurso.intento.id, eva.id, {}, 0))?.estado, "pendiente");
  assert.equal((await I.evaluacionesDelEstudiante(eva.id, g3)).length, 2);
});

await caso("editar generación: nombre y fechas; la que no existe da error", async () => {
  await G.actualizarGeneracion(g3, { nombre: "Tres (editada)", fecha_inicio: "2026-11-01", fecha_fin: "2027-10-31" });
  const g = await G.obtenerGeneracion(g3);
  assert.deepEqual([g?.nombre, g?.fecha_inicio, g?.fecha_fin, g?.codigo], [
    "Tres (editada)",
    "2026-11-01",
    "2027-10-31",
    codigo,
  ]);
  await assert.rejects(G.actualizarGeneracion(999_999, { nombre: "x", fecha_inicio: "2026-01-01", fecha_fin: null }), /no existe/);
});

await caso("crear generación: el código se asigna solo (gen-AAAA-MM; -2, -3… si se repite el mes), con sus 17", async () => {
  const { rows: [staff] } = await query<{ id: number }>(`SELECT id FROM staff ORDER BY id LIMIT 1`);
  const crear = (nombre: string, fecha_inicio: string) => G.crearGeneracion({ nombre, fecha_inicio, fecha_fin: null }, staff.id);
  const a = await crear("Marzo A", "2031-03-02");
  const b = await crear("Marzo B", "2031-03-20");
  // Dos a la vez el mismo mes: el candado las pone en fila y no chocan.
  const [c, d] = await Promise.all([crear("Marzo C", "2031-03-05"), crear("Marzo D", "2031-03-06")]);
  assert.deepEqual(
    [a.codigo, b.codigo, [c.codigo, d.codigo].sort()],
    ["gen-2031-03", "gen-2031-03-2", ["gen-2031-03-3", "gen-2031-03-4"]],
  );
  const { rows } = await query(
    `SELECT count(*)::int AS n, min(slug) FILTER (WHERE tipo = 'bienvenida') AS bienvenida
       FROM evaluaciones WHERE generacion_id = $1`,
    [b.id],
  );
  assert.deepEqual(rows[0], { n: 17, bienvenida: "gen-2031-03-2-bienvenida" });
});

// ---------------------------------------------------------------------------
// Eliminar una generación (todo lo suyo, confirmando con su código)
// ---------------------------------------------------------------------------
async function m1Publicada(generacionId: number) {
  const [ev] = await sql<{ id: number }>(
    `SELECT id FROM evaluaciones WHERE generacion_id = $1 AND tipo = 'mensual' ORDER BY numero LIMIT 1`,
    [generacionId],
  );
  await sql(
    `INSERT INTO preguntas (evaluacion_id, orden, tipo, categoria, enunciado, opciones, respuestas_aceptadas)
     VALUES ($1, 1, 'multiple_choice', 'grammar', 'I ___ a student.', '["am","is"]', '["am"]')`,
    [ev.id],
  );
  await sql(`UPDATE evaluaciones SET publicada = TRUE WHERE id = $1`, [ev.id]);
  return ev.id;
}
const gx = await generacion("Borrar");
const gy = await generacion("Queda");
const evX = await m1Publicada(gx);
const evY = await m1Publicada(gy);
const evaluacionesX = (await sql<{ id: number }>(`SELECT id FROM evaluaciones WHERE generacion_id = $1`, [gx])).map((e) => e.id);
const x1 = { id: await estudiante(gx, "x1"), nombre: "Equis Uno" };
await estudiante(gx, "x2");
const sale = { id: await estudiante(gx, "sale"), nombre: "Sale" }; // presentó en gx y luego pasó a gy
const entra = { id: await estudiante(gy, "entra"), nombre: "Entra" }; // presentó en gy y luego pasó a gx
const y1 = { id: await estudiante(gy, "y1"), nombre: "Ye Uno" };
const intentoX1 = await presentar(x1, evX, "am");
const intentoSale = await presentar(sale, evX, "is");
const intentoEntra = await presentar(entra, evY, "am");
const intentoY1 = await presentar(y1, evY, "am");
await sql(`UPDATE estudiantes SET generacion_id = $2 WHERE id = $1`, [sale.id, gy]);
await sql(`UPDATE estudiantes SET generacion_id = $2 WHERE id = $1`, [entra.id, gx]);
const existe = async (tabla: string, id: number) =>
  (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabla} WHERE id = $1`, [id]))[0].n === 1;

await caso("eliminar: el resumen cuenta evaluaciones, preguntas, estudiantes e intentos (también fuera)", async () => {
  assert.deepEqual(await G.resumenEliminacion(gx), {
    codigo: `gen-borrar-${sufijo}`,
    nombre: "Borrar",
    evaluaciones: 17,
    preguntas: 1,
    estudiantes: 3, // x1, x2 y "entra"
    intentos: 3, // x1 y "sale" en sus evaluaciones + "entra" en otra generación
  });
  assert.equal(await G.resumenEliminacion(999_999), null);
});

await caso("eliminar: con otro código no borra nada", async () => {
  await assert.rejects(G.eliminarGeneracion(gx, "gen-otra"), (e: { campo?: string; message: string }) =>
    e.campo === "codigo" && /Escribe exactamente el código/.test(e.message),
  );
  assert.equal(await existe("generaciones", gx), true);
  assert.equal((await G.resumenEliminacion(gx))?.intentos, 3);
  await assert.rejects(G.eliminarGeneracion(999_999, "x"), /no existe/);
});

await caso("eliminar: borra la generación con todo lo suyo y no toca lo demás", async () => {
  const r = await G.eliminarGeneracion(gx, ` gen-borrar-${sufijo} `);
  assert.deepEqual([r.estudiantes, r.intentos], [3, 3]);
  assert.equal(await existe("generaciones", gx), false);
  const [restos] = await sql<{ ev: number; pr: number; res: number }>(
    `SELECT (SELECT count(*)::int FROM evaluaciones WHERE id = ANY($1)) AS ev,
            (SELECT count(*)::int FROM preguntas WHERE evaluacion_id = ANY($1)) AS pr,
            (SELECT count(*)::int FROM respuestas WHERE intento_id = ANY($2)) AS res`,
    [evaluacionesX, [intentoX1, intentoSale, intentoEntra]],
  );
  assert.deepEqual(restos, { ev: 0, pr: 0, res: 0 });
  // Sus estudiantes (y sus intentos en otras generaciones) se van; el que ya se había ido, queda.
  assert.deepEqual(
    [await existe("estudiantes", x1.id), await existe("estudiantes", entra.id), await existe("estudiantes", sale.id)],
    [false, false, true],
  );
  assert.deepEqual(
    [await existe("intentos", intentoX1), await existe("intentos", intentoSale), await existe("intentos", intentoEntra)],
    [false, false, false],
  );
  // La otra generación sigue entera.
  assert.equal(await existe("intentos", intentoY1), true);
  assert.equal((await G.resumenEliminacion(gy))?.evaluaciones, 17);
});

// ---------------------------------------------------------------------------
// Estudiantes uno a uno (agregar, editar y eliminar)
// ---------------------------------------------------------------------------
let idSuelto = 0;
let intentoSuelto = 0;
const datos = (n: string, generacionId: number) => ({ email: correo(n), generacionId });

await caso("agregar: activo en su generación; correo del staff, ya inscrito o generación inexistente, rechazados", async () => {
  idSuelto = await E.crearEstudiante(datos("suelto", g1));
  assert.deepEqual(await fila(correo("suelto")), { generacion_id: g1, activo: true });
  await assert.rejects(E.crearEstudiante(datos("staff", g1)), (e: { campo?: string; message: string }) =>
    e.campo === "email" && /es del staff/.test(e.message),
  );
  // citext: con mayúsculas es el mismo correo; el aviso dice en qué generación está.
  await assert.rejects(
    E.crearEstudiante({ ...datos("suelto", g2), email: correo("suelto").toUpperCase() }),
    /ya está inscrito en Uno/,
  );
  await assert.rejects(E.crearEstudiante(datos("otro", 999_999)), /La generación no existe/);
  assert.equal((await sql(`SELECT 1 FROM estudiantes WHERE email = $1`, [correo("otro")])).length, 0);
});

await caso("agregar el mismo correo dos veces a la vez: uno lo crea y el otro recibe el aviso", async () => {
  const rs = await Promise.allSettled([1, 2].map(() => E.crearEstudiante(datos("doble", g2))));
  assert.deepEqual(rs.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  assert.match(String((rs.find((r) => r.status === "rejected") as PromiseRejectedResult).reason), /ya está inscrito/);
});

await caso("editar: correo y generación (conserva sus intentos); correo repetido o del staff, rechazados", async () => {
  await E.actualizarEstudiante(idSuelto, datos("suelto2", gy));
  assert.deepEqual(await fila(correo("suelto2")), { generacion_id: gy, activo: true });
  intentoSuelto = await presentar({ id: idSuelto, nombre: "Suelto" }, evY, "am");
  await E.actualizarEstudiante(idSuelto, datos("suelto2", g2));
  const [i] = await sql<{ estudiante_id: number }>(`SELECT estudiante_id FROM intentos WHERE id = $1`, [intentoSuelto]);
  assert.equal(i.estudiante_id, idSuelto, "moverlo conserva sus intentos");
  await assert.rejects(E.actualizarEstudiante(idSuelto, datos("ana", g2)), (e: { constraint?: string }) =>
    e.constraint === "estudiantes_email_key",
  );
  await assert.rejects(E.actualizarEstudiante(idSuelto, datos("staff", g2)), /es del staff/);
  await assert.rejects(E.actualizarEstudiante(idSuelto, datos("suelto2", 999_999)), /La generación no existe/);
  await assert.rejects(E.actualizarEstudiante(999_999, datos("nadie", g2)), /no existe/);
  assert.deepEqual(await fila(correo("suelto2")), { generacion_id: g2, activo: true });
});

await caso("eliminar: el resumen cuenta sus intentos; se va con sus respuestas y códigos, y nadie más", async () => {
  await sql(
    `INSERT INTO codigos_acceso (estudiante_id, codigo_hash, expira_at) VALUES ($1, 'x', now() + interval '10 minutes')`,
    [idSuelto],
  );
  assert.deepEqual(await E.resumenEliminarEstudiante(idSuelto), { email: correo("suelto2"), intentos: 1 });
  await E.eliminarEstudiante(idSuelto);
  const [restos] = await sql<{ est: number; int: number; res: number; cod: number }>(
    `SELECT (SELECT count(*)::int FROM estudiantes WHERE id = $1) AS est,
            (SELECT count(*)::int FROM intentos WHERE estudiante_id = $1) AS int,
            (SELECT count(*)::int FROM respuestas WHERE intento_id = $2) AS res,
            (SELECT count(*)::int FROM codigos_acceso WHERE estudiante_id = $1) AS cod`,
    [idSuelto, intentoSuelto],
  );
  assert.deepEqual(restos, { est: 0, int: 0, res: 0, cod: 0 });
  assert.equal(await existe("intentos", intentoY1), true, "los demás no se tocan");
  assert.equal(await E.resumenEliminarEstudiante(idSuelto), null);
  await assert.rejects(E.eliminarEstudiante(idSuelto), /no existe/);
});

fin();
