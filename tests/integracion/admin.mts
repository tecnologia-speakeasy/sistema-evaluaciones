// Integración de la Fase 6 (administración): importación de estudiantes por CSV,
// reglas del staff (incluida la concurrencia), resultados con filtros y
// exportación, y generación desactivada. Se corre con `npm run test:integracion`.
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
async function estudiante(generacionId: number, n: string, { activo = true, manychat = null as string | null } = {}) {
  const [e] = await sql<{ id: number }>(
    `INSERT INTO estudiantes (generacion_id, email, manychat_id, activo) VALUES ($1, $2, $3, $4) RETURNING id`,
    [generacionId, correo(n), manychat, activo],
  );
  return e.id;
}
const fila = async (email: string) =>
  (
    await sql<{ generacion_id: number; activo: boolean; manychat_id: string | null }>(
      `SELECT generacion_id, activo, manychat_id FROM estudiantes WHERE email = $1`,
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
await estudiante(g1, "ana", { manychat: "111" });
await estudiante(g2, "beto");
await estudiante(g2, "carla", { activo: false });
const idDiana = await estudiante(g1, "diana"); // no viene en el CSV: no se toca
await sql(
  `INSERT INTO staff (email, nombre, rol, password_hash) VALUES ($1, 'Staff', 'docente', 'scrypt$x$y')`,
  [correo("staff")],
);
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

await caso("vista previa: nuevos, cambian de generación, manychat, inactivos y correos del staff", async () => {
  const c = await E.previsualizarImportacion(g1, validas(CSV));
  assert.deepEqual(c.nuevos.map((f) => f.email), [correo("nuevo")]);
  assert.deepEqual(
    c.cambianGeneracion.map((f) => [f.email, f.generacion_actual]),
    [[correo("beto"), "Dos"]],
  );
  assert.deepEqual(
    c.actualizanManychat.map((f) => [f.email, f.manychat_actual, f.manychat_id]),
    [[correo("ana"), "111", "222"]],
  );
  assert.deepEqual(c.inactivos.map((f) => f.email), [correo("carla")]);
  assert.deepEqual(c.delStaff.map((f) => f.email), [correo("staff")]);
  assert.equal(c.sinCambios.length, 0);
  // La vista previa no guarda nada.
  assert.equal(await fila(correo("nuevo")), undefined);
});

await caso("importar: una transacción; mueve, actualiza, no reactiva, no borra ni toca a los demás", async () => {
  const r = await E.importarEstudiantes(g1, validas(CSV));
  assert.deepEqual(r, { creados: 1, movidos: 1, manychatActualizados: 1, inactivos: 1, sinCambios: 0, delStaff: 1 });
  assert.deepEqual(await fila(correo("nuevo")), { generacion_id: g1, activo: true, manychat_id: "999" });
  assert.deepEqual(await fila(correo("ana")), { generacion_id: g1, activo: true, manychat_id: "222" });
  assert.deepEqual(await fila(correo("beto")), { generacion_id: g1, activo: true, manychat_id: null });
  assert.deepEqual(await fila(correo("carla")), { generacion_id: g1, activo: false, manychat_id: "333" });
  assert.deepEqual(await fila(correo("diana")), { generacion_id: g1, activo: true, manychat_id: null });
  const [s] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM estudiantes WHERE email = $1`, [correo("staff")]);
  assert.equal(s.n, 0, "un correo del staff no se vuelve estudiante");
});

await caso("reimportar el mismo archivo: sin cambios; un manychat_id vacío no borra el que hay", async () => {
  const r = await E.importarEstudiantes(g1, validas(CSV));
  assert.deepEqual(r, { creados: 0, movidos: 0, manychatActualizados: 0, inactivos: 1, sinCambios: 3, delStaff: 1 });
  await E.importarEstudiantes(g1, validas(`correo\n${correo("ana")}`));
  assert.equal((await fila(correo("ana"))).manychat_id, "222");
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

await caso("lista: búsqueda por correo y nombre (comodines literales), activar/desactivar y manychat_id", async () => {
  let l = await E.listarEstudiantes(g1, { q: "BETO" });
  assert.deepEqual([l.total, l.filas[0]?.email], [1, correo("beto")]);
  assert.equal((await E.listarEstudiantes(g1, { q: "%" })).total, 0, "% no es comodín");
  await E.cambiarActivoEstudiante(idDiana, false);
  await E.guardarManychat(idDiana, "777");
  l = await E.listarEstudiantes(g1, { q: "diana" });
  assert.deepEqual([l.filas[0].activo, l.filas[0].manychat_id, l.filas[0].intentos], [false, "777", 0]);
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
  `SELECT id, slug FROM evaluaciones WHERE generacion_id = $1 ORDER BY tipo, numero LIMIT 2`,
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
  // Su historial y sus resultados siguen visibles; ya no puede repetir.
  assert.equal((await I.historial(flor.id)).length, 2);
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

fin();
