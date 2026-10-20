// db/004_ia.sql, db/005_admin.sql y db/006_sin_manychat.sql sobre una base "de
// producción" con 001 + 002 + 003 e intentos de la Fase 4. Usa una base aparte (migra004) del Postgres
// temporal y la borra al final. Se corre con `npm run test:integracion`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { casos } from "./comun.mjs";

const { caso, fin } = casos();
const sqlDe = (f: string) => readFileSync(`db/${f}`, "utf8");
const url = (base: string) => {
  const u = new URL(process.env.DATABASE_URL!);
  u.pathname = `/${base}`;
  u.search = "";
  return u.toString();
};

const admin = new pg.Client({ connectionString: url("postgres") });
await admin.connect();
await admin.query("DROP DATABASE IF EXISTS migra004");
await admin.query("CREATE DATABASE migra004");

const c = new pg.Client({ connectionString: url("migra004") });
await c.connect();
const q = async <T extends object = Record<string, unknown>>(t: string, p?: unknown[]) => (await c.query<T>(t, p)).rows;

try {
  await q(sqlDe("001_schema.sql"));
  await q(`SET search_path TO evaluacion;
    INSERT INTO generaciones (codigo, nombre, fecha_inicio) VALUES ('gen-2026-10', 'Generación octubre 2026', '2026-10-01');
    INSERT INTO estudiantes (generacion_id, email, nombre) VALUES (1, 'ana@ejemplo.com', 'Ana Estudiante');`);
  await q(sqlDe("002_otp.sql"));
  await q(sqlDe("003_ajustes.sql"));
  await q("SET search_path TO evaluacion");
  await q("SELECT generar_evaluaciones(1)");
  const [ev] = await q<{ id: number }>("SELECT id FROM evaluaciones WHERE generacion_id = 1 ORDER BY tipo, numero LIMIT 1");
  await q("UPDATE evaluaciones SET publicada = TRUE WHERE id = $1", [ev.id]);
  const [ana] = await q<{ id: number }>("SELECT id FROM estudiantes WHERE email = 'ana@ejemplo.com'");
  // Como los dejó la Fase 4: listo sin feedback (sin abiertas), pendiente (con abiertas) y uno en curso.
  for (const [token, estado, puntaje] of [
    ["f4-listo", "listo", 80],
    ["f4-pendiente", "pendiente", null],
    ["f4-curso", "en_progreso", null],
  ] as const) {
    await q(
      `INSERT INTO intentos (evaluacion_id, estudiante_id, token, nombre, estado, puntaje_total, completed_at)
       VALUES ($1, $2, $3, 'Ana', $4::estado_intento, $5,
               CASE WHEN $4::text = 'en_progreso' THEN NULL ELSE now() - interval '1 day' END)`,
      [ev.id, ana.id, token, estado, puntaje],
    );
  }

  await q(sqlDe("004_ia.sql"));
  await q("SET search_path TO evaluacion");

  await caso("004: las 5 columnas nuevas existen (consulta de comprobación de CLAUDE.md)", async () => {
    const [r] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = 'evaluacion' AND table_name = 'intentos'
          AND column_name IN ('procesando_hasta', 'ia_intentos', 'ia_error', 'whatsapp_enviado', 'envio_error')`,
    );
    assert.equal(r.n, 5);
  });
  await caso("004: listo de la Fase 4 queda como avisado (sin correo ni WhatsApp tardíos)", async () => {
    const [i] = await q("SELECT email_enviado, whatsapp_enviado, ia_intentos FROM intentos WHERE token = 'f4-listo'");
    assert.deepEqual(i, { email_enviado: true, whatsapp_enviado: true, ia_intentos: 0 });
  });
  await caso("004: pendiente y en curso quedan sin tocar", async () => {
    const r = await q(
      `SELECT token, estado, email_enviado, whatsapp_enviado FROM intentos
        WHERE token IN ('f4-pendiente', 'f4-curso') ORDER BY token`,
    );
    assert.deepEqual(r, [
      { token: "f4-curso", estado: "en_progreso", email_enviado: false, whatsapp_enviado: false },
      { token: "f4-pendiente", estado: "pendiente", email_enviado: false, whatsapp_enviado: false },
    ]);
  });
  await caso("004 es atómica: correrla otra vez falla sin dejar nada a medias", async () => {
    await assert.rejects(q(sqlDe("004_ia.sql")), /already exists/);
    await q("ROLLBACK").catch(() => {});
    await q("SET search_path TO evaluacion");
    const [r] = await q<{ n: number }>("SELECT count(*)::int AS n FROM intentos");
    assert.equal(r.n, 3);
  });

  // 005 sobre la misma base (con un admin de antes).
  await q(
    `INSERT INTO staff (email, nombre, rol, password_hash) VALUES ('admin@ejemplo.com', 'Admin', 'admin', 'scrypt$x$y')`,
  );
  await q(sqlDe("005_admin.sql"));
  await q("SET search_path TO evaluacion");

  await caso("005: el staff de antes queda sin cambio obligatorio y en la versión 0 (su sesión sigue)", async () => {
    const [s] = await q("SELECT debe_cambiar_password, sesion_version FROM staff WHERE email = 'admin@ejemplo.com'");
    assert.deepEqual(s, { debe_cambiar_password: false, sesion_version: 0 });
  });
  await caso("005: validar_intento rechaza intentos nuevos de una generación desactivada", async () => {
    await q("UPDATE intentos SET estado = 'listo' WHERE token = 'f4-curso'");
    await q("UPDATE generaciones SET activa = FALSE WHERE id = 1");
    await assert.rejects(
      q(`INSERT INTO intentos (evaluacion_id, estudiante_id, token, nombre) VALUES ($1, $2, 'f5-nuevo', 'Ana')`, [
        ev.id,
        ana.id,
      ]),
      /generación de la evaluación .* está desactivada/,
    );
    await q("UPDATE generaciones SET activa = TRUE WHERE id = 1");
    await q(`INSERT INTO intentos (evaluacion_id, estudiante_id, token, nombre) VALUES ($1, $2, 'f5-nuevo', 'Ana')`, [
      ev.id,
      ana.id,
    ]);
  });
  await caso("005 es atómica: correrla otra vez falla sin dejar nada a medias", async () => {
    await assert.rejects(q(sqlDe("005_admin.sql")), /already exists/);
    await q("ROLLBACK").catch(() => {});
  });

  // 006 sobre la misma base (con un manychat_id de antes).
  await q("SET search_path TO evaluacion");
  await q("UPDATE estudiantes SET manychat_id = '123' WHERE id = $1", [ana.id]);
  await q(sqlDe("006_sin_manychat.sql"));
  await q("SET search_path TO evaluacion");
  const columnas = async () =>
    (
      await q<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'evaluacion'
            AND ((table_name = 'estudiantes' AND column_name = 'manychat_id')
              OR (table_name = 'intentos' AND column_name = 'whatsapp_enviado'))`,
      )
    )[0].n;

  await caso("006: sin manychat_id ni whatsapp_enviado (consulta de comprobación de CLAUDE.md)", async () => {
    assert.equal(await columnas(), 0);
  });
  await caso("006: estudiantes e intentos se conservan con lo demás (correo enviado incluido)", async () => {
    const [s] = await q("SELECT email::text AS email, activo FROM estudiantes WHERE id = $1", [ana.id]);
    assert.deepEqual(s, { email: "ana@ejemplo.com", activo: true });
    const r = await q("SELECT token, email_enviado FROM intentos ORDER BY token");
    assert.deepEqual(r, [
      { token: "f4-curso", email_enviado: false },
      { token: "f4-listo", email_enviado: true },
      { token: "f4-pendiente", email_enviado: false },
      { token: "f5-nuevo", email_enviado: false },
    ]);
  });
  await caso("006 es atómica: correrla otra vez falla sin dejar nada a medias", async () => {
    await assert.rejects(q(sqlDe("006_sin_manychat.sql")), /does not exist/);
    await q("ROLLBACK").catch(() => {});
    await q("SET search_path TO evaluacion");
    assert.equal(await columnas(), 0);
    const [r] = await q<{ n: number }>("SELECT count(*)::int AS n FROM intentos");
    assert.equal(r.n, 4);
  });
} finally {
  await c.end();
  await admin.query("DROP DATABASE IF EXISTS migra004");
  await admin.end();
}
fin();
