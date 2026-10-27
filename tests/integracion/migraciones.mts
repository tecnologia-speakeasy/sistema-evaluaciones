// db/004_ia.sql, db/005_admin.sql, db/006_sin_manychat.sql, db/007_bienvenida.sql y db/008_final.sql
// sobre una base "de producción" con 001 + 002 + 003 e intentos de la Fase 4. Usa una base aparte (migra004) del Postgres
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

  // 007 sobre la misma base: la generación de antes tiene sus 16 (una publicada,
  // con intentos) y recibe solo su bienvenida. Se corre como en producción: el
  // archivo entero en un solo envío (el paso 1 se confirma solo).
  await q("SET search_path TO evaluacion");
  const antes007 = await q("SELECT id, slug, publicada FROM evaluaciones ORDER BY id");
  await q(sqlDe("007_bienvenida.sql"));
  await q("SET search_path TO evaluacion");
  const deTipo = async () =>
    q<{ tipo: string; n: number }>(
      `SELECT tipo::text AS tipo, count(*)::int AS n FROM evaluaciones WHERE generacion_id = 1 GROUP BY tipo ORDER BY tipo`,
    );
  const completa = [
    { tipo: "bienvenida", n: 1 },
    { tipo: "mensual", n: 12 },
    { tipo: "trimestral", n: 4 },
  ];

  await caso("007: la generación de antes recibe su bienvenida (sin publicar) y queda primera en orden", async () => {
    assert.deepEqual(await deTipo(), completa);
    const [primera] = await q(
      "SELECT slug, titulo, numero, publicada FROM evaluaciones WHERE generacion_id = 1 ORDER BY tipo, numero LIMIT 1",
    );
    assert.deepEqual(primera, {
      slug: "gen-2026-10-bienvenida",
      titulo: "Evaluación de bienvenida",
      numero: 1,
      publicada: false,
    });
  });
  await caso("007: las 16 de antes y sus intentos no cambian", async () => {
    const ahora = await q("SELECT id, slug, publicada FROM evaluaciones WHERE tipo <> 'bienvenida' ORDER BY id");
    assert.deepEqual(ahora, antes007);
    const [r] = await q<{ n: number }>("SELECT count(*)::int AS n FROM intentos");
    assert.equal(r.n, 4);
  });
  await caso("007: generar_evaluaciones crea las 17 en una generación nueva y es idempotente", async () => {
    const [g] = await q<{ id: number }>(
      `INSERT INTO generaciones (codigo, nombre, fecha_inicio) VALUES ('gen-2027-01', 'Enero 2027', '2027-01-01') RETURNING id`,
    );
    const [c1] = await q<{ n: number }>("SELECT generar_evaluaciones($1) AS n", [g.id]);
    const [c2] = await q<{ n: number }>("SELECT generar_evaluaciones($1) AS n", [g.id]);
    assert.deepEqual([c1.n, c2.n], [17, 0]);
  });
  await caso("007: el CHECK solo deja una bienvenida con numero 1", async () => {
    await assert.rejects(
      q(`INSERT INTO evaluaciones (generacion_id, slug, titulo, tipo, numero)
         VALUES (1, 'gen-2026-10-bienvenida-2', 'Otra', 'bienvenida', 2)`),
      /evaluaciones_check/,
    );
  });
  await caso("007 se puede correr otra vez sin cambiar nada", async () => {
    await q(sqlDe("007_bienvenida.sql"));
    await q("SET search_path TO evaluacion");
    assert.deepEqual(await deTipo(), completa);
  });

  // 008 sobre la misma base: las generaciones de antes (con sus 17; la primera
  // con una publicada e intentos) reciben solo su final. Igual que en producción.
  const antes008 = await q("SELECT id, slug, publicada FROM evaluaciones ORDER BY id");
  await q(sqlDe("008_final.sql"));
  await q("SET search_path TO evaluacion");
  // deTipo ordena por el texto del tipo (alfabético): la final va segunda.
  const completa008 = [completa[0], { tipo: "final", n: 1 }, ...completa.slice(1)];

  await caso("008: cada generación de antes recibe su final (sin publicar) y queda de última en orden", async () => {
    assert.deepEqual(await deTipo(), completa008);
    const [ultima] = await q(
      "SELECT slug, titulo, numero, publicada FROM evaluaciones WHERE generacion_id = 1 ORDER BY tipo DESC, numero DESC LIMIT 1",
    );
    assert.deepEqual(ultima, { slug: "gen-2026-10-final", titulo: "Evaluación final", numero: 1, publicada: false });
    const [sinFinal] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM generaciones g
        WHERE NOT EXISTS (SELECT 1 FROM evaluaciones e WHERE e.generacion_id = g.id AND e.tipo = 'final')`,
    );
    assert.equal(sinFinal.n, 0);
  });
  await caso("008: las 17 de antes y sus intentos no cambian", async () => {
    const ahora = await q("SELECT id, slug, publicada FROM evaluaciones WHERE tipo <> 'final' ORDER BY id");
    assert.deepEqual(ahora, antes008);
    const [r] = await q<{ n: number }>("SELECT count(*)::int AS n FROM intentos");
    assert.equal(r.n, 4);
  });
  await caso("008: generar_evaluaciones crea las 18 en una generación nueva y es idempotente", async () => {
    const [g] = await q<{ id: number }>(
      `INSERT INTO generaciones (codigo, nombre, fecha_inicio) VALUES ('gen-2027-02', 'Febrero 2027', '2027-02-01') RETURNING id`,
    );
    const [c1] = await q<{ n: number }>("SELECT generar_evaluaciones($1) AS n", [g.id]);
    const [c2] = await q<{ n: number }>("SELECT generar_evaluaciones($1) AS n", [g.id]);
    assert.deepEqual([c1.n, c2.n], [18, 0]);
  });
  await caso("008: el CHECK solo deja una final con numero 1 (y la bienvenida sigue igual)", async () => {
    for (const [tipo, slug] of [["final", "gen-2026-10-final-2"], ["bienvenida", "gen-2026-10-bienvenida-2"]]) {
      await assert.rejects(
        q(`INSERT INTO evaluaciones (generacion_id, slug, titulo, tipo, numero) VALUES (1, $1, 'Otra', $2, 2)`, [slug, tipo]),
        /evaluaciones_check/,
      );
    }
  });
  await caso("008 se puede correr otra vez sin cambiar nada", async () => {
    await q(sqlDe("008_final.sql"));
    await q("SET search_path TO evaluacion");
    assert.deepEqual(await deTipo(), completa008);
    const [g] = await q<{ n: number }>("SELECT count(*)::int AS n FROM evaluaciones WHERE tipo = 'final'");
    const [gens] = await q<{ n: number }>("SELECT count(*)::int AS n FROM generaciones");
    assert.equal(g.n, gens.n);
  });
} finally {
  await c.end();
  await admin.query("DROP DATABASE IF EXISTS migra004");
  await admin.end();
}
fin();
