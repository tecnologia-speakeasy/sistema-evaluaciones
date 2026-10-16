import "server-only";
import { query, transaction, type Tx } from "@/lib/db";
import { correoResultado } from "@/lib/email/correo-resultado";
import { enviarCorreo, smtpConfigurado } from "@/lib/email/enviar";
import { resumirIntento } from "@/lib/grading/calificar";
import { enviarWhatsApp, manychatConfigurado } from "@/lib/manychat";
import type { TipoPregunta } from "@/lib/preguntas/tipos";
import { urlBase, urlPublica } from "@/lib/url";
import { llamarOpenAI } from "./openai";
import {
  leerFeedback,
  leerNotasAbiertas,
  NOTA_ACIERTO,
  notaAPuntaje,
  promptAbiertas,
  promptFeedback,
  resumirParaFeedback,
} from "./prompts";

// Fase 5: después de enviar (fuera de cualquier transacción) la IA califica las
// abiertas y escribe el feedback; luego salen el correo y el WhatsApp.
//
//   pendiente ──tomar──▶ calificando ──▶ listo ──▶ correo / WhatsApp (una vez cada uno)
//                             │
//                             └─ falla ─▶ pendiente (ia_intentos + 1) ─ al 3.º ─▶ error
//
// Lo lanzan: el envío (after()), la pantalla que espera (/estado), el reproceso
// (/api/cron/procesar) y el staff ("Reintentar IA"). El candado
// (procesando_hasta) garantiza que solo uno llama a la IA por intento.

/** Al 3.er fallo el intento pasa a 'error' (lo ve el staff). */
export const FALLOS_PARA_ERROR = 3;
/** El reproceso automático se detiene aquí; después, solo el staff. */
export const MAX_FALLOS_AUTOMATICOS = 10;
/** Vence después del maxDuration de las rutas (300 s): si el proceso murió, otro lo retoma. */
const CANDADO_MIN = 6;

export type ResultadoProceso = "listo" | "fallo" | "ocupado";

type Fila = {
  respuesta_id: string;
  pregunta_id: number;
  tipo: TipoPregunta;
  categoria: "grammar" | "writing";
  puntaje_pregunta: number;
  seccion: string | null;
  enunciado: string;
  pista: string | null;
  rubrica: string | null;
  respuesta: string | string[] | null;
  es_correcta: boolean | null;
  puntaje: number | null;
};

export async function procesarIntento(
  intentoId: number,
  { forzar = false }: { forzar?: boolean } = {},
): Promise<ResultadoProceso> {
  // Tomar el candado. Sin `forzar` (staff) no pasa del tope de fallos automáticos.
  const { rows: tomado } = await query<{ nombre: string; titulo: string; feedback: string | null }>(
    `UPDATE intentos i
        SET estado = 'calificando', procesando_hasta = now() + make_interval(mins => $2)
       FROM evaluaciones e
      WHERE i.id = $1 AND e.id = i.evaluacion_id
        AND (i.estado IN ('pendiente', 'error') OR i.estado = 'calificando')
        AND (i.procesando_hasta IS NULL OR i.procesando_hasta < now())
        AND ($3 OR i.ia_intentos < $4)
      RETURNING i.nombre, e.titulo, i.feedback`,
    [intentoId, CANDADO_MIN, forzar, MAX_FALLOS_AUTOMATICOS],
  );
  const intento = tomado[0];
  if (!intento) return "ocupado";

  try {
    const { rows: filas } = await query<Fila>(
      `SELECT r.id AS respuesta_id, p.id AS pregunta_id, p.tipo, p.categoria,
              p.puntaje::float8 AS puntaje_pregunta, p.seccion, p.enunciado, p.pista, p.rubrica,
              r.respuesta, r.es_correcta, r.puntaje::float8 AS puntaje
         FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
        WHERE r.intento_id = $1
        ORDER BY p.orden`,
      [intentoId],
    );

    // 1. Abiertas sin calificar: una sola llamada con la rúbrica de cada una. Se
    //    guarda de una vez (si después falla el feedback, no se paga dos veces).
    const abiertas = filas.filter((f) => f.tipo === "open" && f.es_correcta === null);
    if (abiertas.length) {
      const notas = leerNotasAbiertas(
        await llamarOpenAI(
          promptAbiertas(
            abiertas.map((f) => ({
              id: f.pregunta_id,
              enunciado: f.enunciado,
              rubrica: f.rubrica ?? "",
              respuesta: typeof f.respuesta === "string" ? f.respuesta : "",
            })),
          ),
        ),
        abiertas.map((f) => f.pregunta_id),
      );
      const calificadas = abiertas.map((f) => {
        const n = notas.get(f.pregunta_id)!;
        f.es_correcta = n.nota >= NOTA_ACIERTO;
        f.puntaje = notaAPuntaje(n.nota, f.puntaje_pregunta);
        return { id: f.respuesta_id, es_correcta: f.es_correcta, puntaje: f.puntaje, comentario: n.comentario };
      });
      await transaction(async (tx) => {
        await tx.query(
          `UPDATE respuestas r
              SET es_correcta = x.es_correcta, puntaje = x.puntaje, feedback = x.comentario
             FROM jsonb_to_recordset($1::jsonb)
               AS x(id bigint, es_correcta boolean, puntaje numeric, comentario text)
            WHERE r.id = x.id`,
          [JSON.stringify(calificadas)],
        );
        await guardarPuntajes(tx, intentoId, filas);
      });
    }

    // 2. Feedback general (como a2), saludando con el nombre que escribió.
    const resumen = puntajes(filas);
    const feedback =
      intento.feedback ??
      leerFeedback(
        await llamarOpenAI(
          promptFeedback(
            intento.nombre,
            intento.titulo,
            resumirParaFeedback(
              filas.map((f) => ({
                ...f,
                nota: f.tipo === "open" && f.puntaje !== null ? Math.round((f.puntaje / f.puntaje_pregunta) * 10) : null,
              })),
              resumen.puntaje_total,
            ),
          ),
          { temperatura: 0.5 },
        ),
      );

    await query(
      `UPDATE intentos
          SET feedback = $2, estado = 'listo', procesando_hasta = NULL, ia_error = NULL,
              puntaje_total = $3, grammar_score = $4, writing_score = $5
        WHERE id = $1`,
      [intentoId, feedback, resumen.puntaje_total, resumen.grammar_score, resumen.writing_score],
    );
  } catch (e) {
    const mensaje = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error(`[ia] intento ${intentoId}: ${mensaje}`);
    await query(
      `UPDATE intentos
          SET ia_intentos = ia_intentos + 1, ia_error = $2, procesando_hasta = NULL,
              estado = (CASE WHEN ia_intentos + 1 >= $3 THEN 'error' ELSE 'pendiente' END)::estado_intento
        WHERE id = $1`,
      [intentoId, mensaje, FALLOS_PARA_ERROR],
    ).catch((err) => console.error(`[ia] no se pudo registrar el fallo del intento ${intentoId}`, err));
    return "fallo";
  }

  await notificarIntento(intentoId);
  return "listo";
}

function puntajes(filas: Fila[]) {
  return resumirIntento(
    filas.map((f) => ({
      pregunta: { categoria: f.categoria, puntaje: f.puntaje_pregunta },
      calificacion: { respuesta: f.respuesta, es_correcta: f.es_correcta, puntaje: f.puntaje },
    })),
  );
}

async function guardarPuntajes(tx: Tx, intentoId: number, filas: Fila[]) {
  const r = puntajes(filas);
  await tx.query(
    `UPDATE intentos SET puntaje_total = $2, grammar_score = $3, writing_score = $4 WHERE id = $1`,
    [intentoId, r.puntaje_total, r.grammar_score, r.writing_score],
  );
}

// ---------------------------------------------------------------------------
// Correo y WhatsApp: solo con el intento 'listo' y una sola vez cada uno. Se
// marca antes de enviar (dos procesos a la vez no mandan dos) y, si falla, se
// desmarca para que el reproceso lo intente de nuevo.
// ---------------------------------------------------------------------------

export type ResultadoEnvio = "enviado" | "no_aplica" | "fallo";

export async function notificarIntento(intentoId: number): Promise<{ correo: ResultadoEnvio; whatsapp: ResultadoEnvio }> {
  return { correo: await enviarCorreoResultado(intentoId), whatsapp: await enviarWhatsAppResultado(intentoId) };
}

async function registrarFalloEnvio(intentoId: number, columna: "email_enviado" | "whatsapp_enviado", error: string) {
  await query(`UPDATE intentos SET ${columna} = FALSE, envio_error = $2 WHERE id = $1`, [
    intentoId,
    error.slice(0, 500),
  ]).catch(() => {});
}

async function enviarCorreoResultado(intentoId: number): Promise<ResultadoEnvio> {
  const { rows } = await query<{
    nombre: string;
    token: string;
    puntaje_total: number;
    grammar_score: number;
    writing_score: number;
    feedback: string;
    email: string;
    titulo: string;
    grammar_total: number;
    writing_total: number;
  }>(
    `WITH tomado AS (
       UPDATE intentos i SET email_enviado = TRUE
        WHERE i.id = $1 AND i.estado = 'listo' AND i.feedback IS NOT NULL AND NOT i.email_enviado
        RETURNING i.id, i.nombre, i.token, i.puntaje_total, i.grammar_score, i.writing_score,
                  i.feedback, i.estudiante_id, i.evaluacion_id)
     SELECT t.nombre, t.token, t.puntaje_total, coalesce(t.grammar_score, 0) AS grammar_score,
            coalesce(t.writing_score, 0) AS writing_score, t.feedback, s.email, e.titulo,
            c.grammar_total, c.writing_total
       FROM tomado t
       JOIN estudiantes s  ON s.id = t.estudiante_id
       JOIN evaluaciones e ON e.id = t.evaluacion_id
       CROSS JOIN LATERAL (
         SELECT count(*) FILTER (WHERE p.categoria = 'grammar' AND r.es_correcta IS NOT NULL)::int AS grammar_total,
                count(*) FILTER (WHERE p.categoria = 'writing' AND r.es_correcta IS NOT NULL)::int AS writing_total
           FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
          WHERE r.intento_id = t.id) c`,
    [intentoId],
  );
  const d = rows[0];
  if (!d) return "no_aplica";

  if (!smtpConfigurado()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[correo-resultado] SMTP no configurado (desarrollo): no se envía a ${d.email}`);
    }
    await registrarFalloEnvio(intentoId, "email_enviado", "SMTP no configurado");
    return "fallo";
  }
  try {
    await enviarCorreo(
      d.email,
      correoResultado({
        nombre: d.nombre,
        evaluacion: d.titulo,
        puntaje: d.puntaje_total,
        grammar: { aciertos: d.grammar_score, total: d.grammar_total },
        writing: { aciertos: d.writing_score, total: d.writing_total },
        feedback: d.feedback,
        urlResultado: urlPublica(`/resultado/${d.token}`),
        urlBase: urlBase(),
      }),
    );
    await query(`UPDATE intentos SET envio_error = NULL WHERE id = $1`, [intentoId]).catch(() => {});
    return "enviado";
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[correo-resultado] intento ${intentoId}: ${mensaje}`);
    await registrarFalloEnvio(intentoId, "email_enviado", `Correo: ${mensaje}`);
    return "fallo";
  }
}

async function enviarWhatsAppResultado(intentoId: number): Promise<ResultadoEnvio> {
  if (!manychatConfigurado()) return "no_aplica";
  const { rows } = await query<{ manychat_id: string; puntaje_total: number; token: string }>(
    `UPDATE intentos i SET whatsapp_enviado = TRUE
       FROM estudiantes s
      WHERE i.id = $1 AND s.id = i.estudiante_id
        AND i.estado = 'listo' AND i.feedback IS NOT NULL AND NOT i.whatsapp_enviado
        AND coalesce(trim(s.manychat_id), '') <> ''
      RETURNING s.manychat_id, i.puntaje_total, i.token`,
    [intentoId],
  );
  const d = rows[0];
  if (!d) return "no_aplica";
  try {
    // Como a2: la plantilla arma el botón /resultado/<token> con el campo "feedback".
    await enviarWhatsApp(d.manychat_id, process.env.MANYCHAT_FLOW_RESULTADO!.trim(), {
      se_puntaje: d.puntaje_total,
      feedback: d.token,
    });
    return "enviado";
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[whatsapp] intento ${intentoId}: ${mensaje}`);
    await registrarFalloEnvio(intentoId, "whatsapp_enviado", `WhatsApp: ${mensaje}`);
    return "fallo";
  }
}

// ---------------------------------------------------------------------------
// Reproceso (/api/cron/procesar): intentos sin terminar y envíos pendientes.
// ---------------------------------------------------------------------------

export type Reproceso = {
  revisados: number;
  listos: number;
  fallos: number;
  ocupados: number;
  envios: number;
};

export async function reprocesarPendientes({
  limite = 5,
  presupuestoMs = 200_000,
}: { limite?: number; presupuestoMs?: number } = {}): Promise<Reproceso> {
  const inicio = Date.now();
  // Un minuto de margen: el envío recién hecho lo está procesando after().
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM intentos
      WHERE estado IN ('pendiente', 'error', 'calificando')
        AND (procesando_hasta IS NULL OR procesando_hasta < now())
        AND ia_intentos < $1
        AND completed_at < now() - interval '1 minute'
      ORDER BY completed_at
      LIMIT $2`,
    [MAX_FALLOS_AUTOMATICOS, limite],
  );
  const r: Reproceso = { revisados: 0, listos: 0, fallos: 0, ocupados: 0, envios: 0 };
  for (const { id } of rows) {
    if (Date.now() - inicio > presupuestoMs) break;
    r.revisados += 1;
    const resultado = await procesarIntento(id);
    if (resultado === "listo") r.listos += 1;
    else if (resultado === "fallo") r.fallos += 1;
    else r.ocupados += 1;
  }

  // Correos / WhatsApp que no salieron (de la última semana).
  const { rows: envios } = await query<{ id: number }>(
    `SELECT i.id FROM intentos i JOIN estudiantes s ON s.id = i.estudiante_id
      WHERE i.estado = 'listo' AND i.feedback IS NOT NULL AND i.completed_at > now() - interval '7 days'
        AND (NOT i.email_enviado
             OR ($1 AND NOT i.whatsapp_enviado AND coalesce(trim(s.manychat_id), '') <> ''))
      ORDER BY i.completed_at
      LIMIT 20`,
    [manychatConfigurado()],
  );
  for (const { id } of envios) {
    if (Date.now() - inicio > presupuestoMs) break;
    const e = await notificarIntento(id);
    if (e.correo === "enviado" || e.whatsapp === "enviado") r.envios += 1;
  }
  return r;
}
