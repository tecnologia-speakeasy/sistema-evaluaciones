// Pruebas de integración: `npm run test:integracion` (una sola: `-- ia`).
// Levanta un Postgres 17 temporal (embedded-postgres) con db/0NN_*.sql y los
// simuladores (OpenAI, ManyChat, SMTP), y corre cada suite en su propio proceso
// con un entorno armado desde cero: nunca usa el .env ni servicios reales.
// Al terminar borra todo (base, correos).
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { iniciarSimuladores } from "./simuladores.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SUITES = ["intentos.mts", "ia.mts", "migraciones.mts"];
const filtro = process.argv[2];

const puertoLibre = () =>
  new Promise((resolver, rechazar) => {
    const s = net.createServer();
    s.on("error", rechazar);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolver(port));
    });
  });

function correrSuite(suite, entorno) {
  return new Promise((resolver) => {
    const hijo = spawn(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", path.join("tests", "integracion", suite)],
      { cwd: raiz, env: entorno, stdio: "inherit" },
    );
    hijo.on("exit", (c) => resolver(c ?? 1));
  });
}

const temporal = mkdtempSync(path.join(tmpdir(), "se-integracion-"));
const puertoPg = await puertoLibre();
const servidorPg = new EmbeddedPostgres({
  databaseDir: path.join(temporal, "pg"),
  user: "postgres",
  password: "postgres",
  port: puertoPg,
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: () => {},
});
let simuladores;
let fallo = false;
try {
  await servidorPg.initialise();
  await servidorPg.start();
  await servidorPg.createDatabase("evaluaciones");
  const base = `postgresql://postgres:postgres@127.0.0.1:${puertoPg}`;
  const c = new pg.Client({ connectionString: `${base}/evaluaciones` });
  await c.connect();
  const migraciones = readdirSync(path.join(raiz, "db"))
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();
  for (const f of migraciones) await c.query(readFileSync(path.join(raiz, "db", f), "utf8"));
  await c.end();
  console.log(`Postgres temporal (127.0.0.1:${puertoPg}) con ${migraciones.join(", ")}`);

  const correos = path.join(temporal, "correos");
  simuladores = await iniciarSimuladores(correos);

  // Entorno desde cero: fuera las variables de la app que vinieran del shell
  // (así las abiertas quedan apagadas, como por defecto) y solo valores de prueba.
  const entorno = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !/^(DATABASE_|SESSION_|OPENAI_|SMTP_|MAIL_|MANYCHAT_|APP_URL|CRON_|OTP_|PREGUNTAS_|VERCEL)/.test(k),
    ),
  );
  Object.assign(entorno, {
    NODE_ENV: "production",
    DATABASE_URL: `${base}/evaluaciones?schema=evaluacion`,
    SESSION_SECRET: "secreto-de-pruebas-local-de-32-caracteres-o-mas",
    OPENAI_API_KEY: "clave-de-prueba",
    OPENAI_BASE_URL: `http://127.0.0.1:${simuladores.puertoOpenAI}/v1`,
    OPENAI_MODEL: "modelo-de-prueba",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(simuladores.puertoSmtp),
    SMTP_USER: "prueba",
    SMTP_PASS: "prueba",
    MAIL_FROM: "Speak Easy <no-responder@speakeasy.test>",
    MANYCHAT_API_TOKEN: "token-manychat-prueba",
    MANYCHAT_FLOW_RESULTADO: "content20261016",
    MANYCHAT_API_URL: `http://127.0.0.1:${simuladores.puertoManyChat}`,
    APP_URL: "https://evaluaciones.prueba",
    PRUEBAS_CORREOS: correos,
  });

  for (const suite of SUITES.filter((s) => !filtro || s.startsWith(filtro))) {
    console.log(`\n▶ ${suite}`);
    if ((await correrSuite(suite, entorno)) !== 0) fallo = true;
  }
} catch (e) {
  console.error(e);
  fallo = true;
} finally {
  await simuladores?.cerrar().catch(() => {});
  await servidorPg.stop().catch(() => {});
  rmSync(temporal, { recursive: true, force: true });
}
console.log(fallo ? "\nIntegración: CON FALLOS" : "\nIntegración: todo OK");
process.exit(fallo ? 1 : 0);
