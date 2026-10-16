import pg from "pg";

const { Client } = pg;

// ─────────────────────────────────────────────────────────────────────────────
// Acceso a Postgres para serverless contra un Postgres con pocas conexiones (VPS).
//
// Estrategia: conexión EFÍMERA. Cada query abre una conexión, ejecuta y la
// CIERRA de inmediato. Así una conexión vive lo que dura la query y NUNCA se
// queda retenida durante los 10–30 s que tardan las llamadas a OpenAI.
//
// Schema: las tablas viven en el schema indicado por ?schema=... del
// DATABASE_URL (p. ej. ?schema=evaluacion). Se aplica vía search_path en cada
// conexión.
// ─────────────────────────────────────────────────────────────────────────────

// Lee el schema del parámetro ?schema=... del DATABASE_URL (por defecto public).
// Se valida porque el valor termina dentro de `options` de la conexión.
export function schemaFromUrl(connectionString: string): string {
  const m = /[?&]schema=([^&]+)/.exec(connectionString);
  const schema = m ? decodeURIComponent(m[1]) : "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Nombre de schema inválido en DATABASE_URL: "${schema}"`);
  }
  return schema;
}

function makeClient(): pg.Client {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta la variable de entorno DATABASE_URL");
  }
  const schema = schemaFromUrl(connectionString);
  const client = new Client({
    connectionString,
    // Apunta las consultas (tablas sin prefijo) al schema correcto.
    options: `-c search_path=${schema},public`,
    connectionTimeoutMillis: 10_000,
    // SSL solo si la URL lo pide (sslmode=require).
    ssl: /sslmode=require/.test(connectionString)
      ? { rejectUnauthorized: false }
      : false,
  });
  // Sin este listener, un corte de la conexión fuera de una query (p. ej. el VPS
  // se reinicia) emite 'error' sin manejar y tumba el proceso. Las queries en
  // curso igual fallan con su propio error.
  client.on("error", (e) => console.error("[db] error de conexión", e.message));
  return client;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const client = makeClient();
  await client.connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    // Cierra la conexión pase lo que pase, liberando el cupo del VPS de inmediato.
    await client.end().catch(() => {});
  }
}

// Lo que recibe el callback de transaction(): mismas consultas, una sola conexión.
export type Tx = {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>>;
};

// Transacción en UNA conexión efímera: BEGIN → fn → COMMIT (o ROLLBACK si lanza).
// La conexión vive lo que dura fn: NUNCA llamar a OpenAI, correo ni nada lento
// dentro; hacerlo antes o después de la transacción.
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = makeClient();
  await client.connect();
  try {
    await client.query("BEGIN");
    const tx: Tx = {
      query: (text, params) => client.query(text, params),
    };
    const resultado = await fn(tx);
    await client.query("COMMIT");
    return resultado;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end().catch(() => {});
  }
}
