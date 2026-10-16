import "server-only";

// Cliente de OpenAI (chat completions en modo JSON), portado de
// ../evaluacion-a2/lib/openai.js: reintenta ante 429 (rate limit), 5xx, red o
// respuesta ilegible, con espera exponencial y respetando Retry-After, para
// sobrevivir cuando muchos estudiantes envían a la vez.
// Modelo: OPENAI_MODEL (por defecto gpt-4.1-mini).
// OPENAI_BASE_URL (opcional): otra URL compatible, p. ej. el simulador de las pruebas.

export type Mensaje = { role: "system" | "user"; content: string };

/** Error de la IA. `reintentable`: vale la pena volver a intentar más tarde. */
export class ErrorIA extends Error {
  constructor(
    message: string,
    readonly reintentable = true,
  ) {
    super(message);
    this.name = "ErrorIA";
  }
}

const URL_POR_DEFECTO = "https://api.openai.com/v1";
export const modeloIA = () => process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
const urlBase = () => (process.env.OPENAI_BASE_URL?.trim() || URL_POR_DEFECTO).replace(/\/+$/, "");
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const espera = (intento: number) => Math.min(1500 * 2 ** intento, 20_000) + intento * 250;

export async function llamarOpenAI(
  mensajes: Mensaje[],
  { temperatura = 0.2, reintentos = 3, tiempoMs = 40_000 } = {},
): Promise<unknown> {
  const clave = process.env.OPENAI_API_KEY?.trim();
  if (!clave) throw new ErrorIA("Falta OPENAI_API_KEY", false);

  let ultimo: unknown;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const res = await fetch(`${urlBase()}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
        body: JSON.stringify({
          model: modeloIA(),
          messages: mensajes,
          temperature: temperatura,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(tiempoMs),
      });

      // Saturada o caída: esperar y reintentar (Retry-After si viene).
      if (res.status === 429 || res.status >= 500) {
        ultimo = new ErrorIA(`OpenAI respondió ${res.status}`);
        if (intento < reintentos) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await esperar(
            Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 20_000) : espera(intento),
          );
        }
        continue;
      }
      // Otro 4xx (clave inválida, petición mal formada): reintentar no sirve.
      if (!res.ok) {
        throw new ErrorIA(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`, false);
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const contenido = data?.choices?.[0]?.message?.content;
      if (!contenido) throw new ErrorIA("OpenAI respondió sin contenido");
      return JSON.parse(contenido) as unknown;
    } catch (e) {
      if (e instanceof ErrorIA && !e.reintentable) throw e;
      ultimo = e;
      if (intento < reintentos) await esperar(espera(intento));
    }
  }
  if (ultimo instanceof ErrorIA) throw ultimo;
  throw new ErrorIA(
    ultimo instanceof Error ? `OpenAI no respondió: ${ultimo.message}` : "OpenAI no respondió",
  );
}
