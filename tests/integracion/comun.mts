// Ayudas de las suites de integración. Solo corren con `npm run test:integracion`
// (ejecutar.mjs): Postgres temporal y servicios simulados, nunca los reales.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const local = (url: string | undefined) => !!url && /^(postgresql|http):\/\/[^/]*127\.0\.0\.1[:/]/.test(url);
if (!local(process.env.DATABASE_URL) || !local(process.env.OPENAI_BASE_URL) || !process.env.PRUEBAS_CORREOS) {
  console.error("Las suites de integración se corren con: npm run test:integracion");
  process.exit(1);
}
// Configuración por defecto: preguntas abiertas apagadas.
delete process.env.PREGUNTAS_ABIERTAS_ACTIVAS;

export function casos() {
  let ok = 0;
  let fallos = 0;
  async function caso(nombre: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      ok++;
      console.log(`  ✓ ${nombre}`);
    } catch (e) {
      fallos++;
      console.log(`  ✗ ${nombre}\n    ${e instanceof Error ? e.stack : e}`);
      process.exitCode = 1;
    }
  }
  const fin = () => console.log(`\n${ok} casos OK${fallos ? `, ${fallos} con fallos` : ""}`);
  return { caso, fin };
}

/** La prueba que necesita preguntas abiertas las enciende solo mientras corre. */
export async function conAbiertas<T>(fn: () => Promise<T>): Promise<T> {
  process.env.PREGUNTAS_ABIERTAS_ACTIVAS = "true";
  try {
    return await fn();
  } finally {
    delete process.env.PREGUNTAS_ABIERTAS_ACTIVAS;
  }
}

// Simuladores de OpenAI y ManyChat (tests/integracion/simuladores.mjs).
export type Llamada = {
  ruta: string;
  auth: string | null;
  respuesta?: string;
  tipo?: "abiertas" | "feedback";
  modelo?: string;
  datos: {
    messages?: { role: string; content: string }[];
    response_format?: { type: string };
    subscriber_id?: number;
    field_name?: string;
    field_value?: unknown;
    flow_ns?: string;
  };
};
type Modo = { falla?: "500" | "429" | "basura"; veces?: number; saltar?: number; demoraMs?: number };

function simulador(origen: string) {
  const pedir = async (ruta: string, cuerpo?: unknown) =>
    (
      await fetch(`${origen}${ruta}`, {
        method: cuerpo === undefined ? "GET" : "POST",
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      })
    ).json();
  return {
    llamadas: () => pedir("/__llamadas") as Promise<Llamada[]>,
    modo: (m: Modo) => pedir("/__modo", m),
    reiniciar: () => pedir("/__reiniciar", {}),
  };
}
export const openai = simulador(new URL(process.env.OPENAI_BASE_URL!).origin);
export const manychat = simulador(new URL(process.env.MANYCHAT_API_URL!).origin);

// Correos que recibió el SMTP local.
export type Correo = {
  n: number;
  envelopeTo: string[];
  subject: string;
  text: string;
  html: string;
  adjuntos: { cid?: string; contentType: string; contentDisposition: string; size: number }[];
};
export function correosPara(para: string): Correo[] {
  const carpeta = process.env.PRUEBAS_CORREOS!;
  return (existsSync(carpeta) ? readdirSync(carpeta) : [])
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(`${carpeta}/${f}`, "utf8")) as Correo)
    .filter((c) => c.envelopeTo.includes(para))
    .sort((a, b) => a.n - b.n);
}
