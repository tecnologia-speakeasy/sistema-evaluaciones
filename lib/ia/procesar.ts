import "server-only";
import { query, transaction, type Tx } from "@/lib/db";
import { correoResultado } from "@/lib/email/correo-resultado";
import { enviarCorreo, smtpConfigurado } from "@/lib/email/enviar";
import { resumirIntento } from "@/lib/grading/calificar";
import { diagnosticar } from "@/lib/placement/diagnostico";
import { armarFeedbackPlacement, leerFeedbackPlacement, promptFeedbackPlacement } from "@/lib/placement/feedback";
import { abiertasActivas } from "@/lib/preguntas/abiertas";
import type { TipoMaterial } from "@/lib/preguntas/materiales";
import type { TipoPregunta } from "@/lib/preguntas/tipos";
import type { TipoEvaluacion } from "@/lib/tipos";
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
// abiertas (solo con PREGUNTAS_ABIERTAS_ACTIVAS) y escribe el feedback; luego
// sale el correo. Con las abiertas apagadas (por defecto): una sola llamada a
// OpenAI por intento, como a2.
//
//   pendiente ──tomar──▶ calificando ──▶ listo ──▶ correo (una sola vez)
//                             │
//                             └─ falla ─▶ pendiente (ia_intentos + 1) ─ al 3.º ─▶ error
//
// Lo lanzan: el envío (after()), la pantalla que espera (/estado, que lo
// relanza mientras el estudiante espera, como a2), el staff ("Reintentar IA")
// y el reproceso opcional (/api/cron/procesar, hoy sin programar). El candado
// (procesando_hasta) garantiza que solo uno llama a la IA por intento.

/** Al 3.er fallo el intento pasa a 'error' (lo ve el staff). */
export const FALLOS_PARA_ERROR = 3;
/** Relanzar solo (pantalla que espera o reproceso) se detiene aquí; después, solo el staff. */
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
  subseccion: string | null;
  enunciado: string;
  pista: string | null;
  rubrica: string | null;
  material: TipoMaterial | null;
  material_titulo: string | null;
  respuesta: string | string[] | null;
  es_correcta: boolean | null;
  puntaje: number | null;
};

type IntentoTomado = { nombre: string; titulo: string; tipo: TipoEvaluacion; feedback: string | null };

export async function procesarIntento(
  intentoId: number,
  { forzar = false }: { forzar?: boolean } = {},
): Promise<ResultadoProceso> {
  // Tomar el candado. Sin `forzar` (staff) no pasa del tope de fallos automáticos.
  const { rows: tomado } = await query<IntentoTomado>(
    `UPDATE intentos i
        SET estado = 'calificando', procesando_hasta = now() + make_interval(mins => $2)
       FROM evaluaciones e
      WHERE i.id = $1 AND e.id = i.evaluacion_id
        AND (i.estado IN ('pendiente', 'error') OR i.estado = 'calificando')
        AND (i.procesando_hasta IS NULL OR i.procesando_hasta < now())
        AND ($3 OR i.ia_intentos < $4)
      RETURNING i.nombre, e.titulo, e.tipo, i.feedback`,
    [intentoId, CANDADO_MIN, forzar, MAX_FALLOS_AUTOMATICOS],
  );
  const intento = tomado[0];
  if (!intento) return "ocupado";

  try {
    const { rows: filas } = await query<Fila>(
      `SELECT r.id AS respuesta_id, p.id AS pregunta_id, p.tipo, p.categoria,
              p.puntaje::float8 AS puntaje_pregunta, p.seccion, p.subseccion, p.enunciado, p.pista, p.rubrica,
              m.tipo AS material, m.titulo AS material_titulo,
              r.respuesta, r.es_correcta, r.puntaje::float8 AS puntaje
         FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
         LEFT JOIN materiales m ON m.id = p.material_id
        WHERE r.intento_id = $1
        ORDER BY p.orden`,
      [intentoId],
    );

    // 1. Abiertas sin calificar (solo con PREGUNTAS_ABIERTAS_ACTIVAS): una sola
    //    llamada con la rúbrica de cada una. Se guarda de una vez (si después
    //    falla el feedback, no se paga dos veces).
    const conAbiertas = abiertasActivas();
    const abiertas = conAbiertas ? filas.filter((f) => f.tipo === "open" && f.es_correcta === null) : [];
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

    // Apagadas, una abierta sin nota (de antes de apagarlas) no se califica ni
    // cuenta: el intento queda con lo demás y la IA solo escribe el feedback.
    const cuentan = conAbiertas ? filas : filas.filter((f) => !(f.tipo === "open" && f.es_correcta === null));

    // 2. Feedback (como a2), saludando con el nombre que escribió.
    const resumen = puntajes(cuentan);
    const feedback = intento.feedback ?? (await escribirFeedback(intentoId, intento, cuentan, resumen.puntaje_total));

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

// La bienvenida con la forma del English Placement Test (desde la G2) lleva el
// nivel estimado: lo calcula lib/placement/ con las reglas de Speak Easy y la
// IA solo lo comunica. Cualquier otra evaluación (o una bienvenida con otra
// forma), el feedback general de a2.
async function escribirFeedback(
  intentoId: number,
  intento: IntentoTomado,
  filas: Fila[],
  puntajeTotal: number | null,
): Promise<string> {
  if (intento.tipo === "bienvenida") {
    const placement = diagnosticar(filas);
    if (placement.ok) {
      const d = placement.diagnostico;
      const salida = await llamarOpenAI(promptFeedbackPlacement(intento.nombre, intento.titulo, d, filas), {
        temperatura: 0.5,
      });
      return armarFeedbackPlacement(d, leerFeedbackPlacement(salida));
    }
    console.warn(`[ia] intento ${intentoId}: sin nivel del Placement Test, la bienvenida ${placement.motivo}`);
  }
  return leerFeedback(
    await llamarOpenAI(
      promptFeedback(
        intento.nombre,
        intento.titulo,
        resumirParaFeedback(
          filas.map((f) => ({
            ...f,
            nota: f.tipo === "open" && f.puntaje !== null ? Math.round((f.puntaje / f.puntaje_pregunta) * 10) : null,
          })),
          puntajeTotal,
        ),
      ),
      { temperatura: 0.5 },
    ),
  );
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
// Correo del resultado: solo con el intento 'listo' y una sola vez. Se marca
// antes de enviar (dos procesos a la vez no mandan dos) y, si falla, se desmarca
// (queda envio_error) para reintentarlo: "Reintentar envío" del staff o el
// reproceso opcional.
// ---------------------------------------------------------------------------

export type ResultadoEnvio = "enviado" | "no_aplica" | "fallo";

async function registrarFalloEnvio(intentoId: number, error: string) {
  await query(`UPDATE intentos SET email_enviado = FALSE, envio_error = $2 WHERE id = $1`, [
    intentoId,
    error.slice(0, 500),
  ]).catch(() => {});
}

export async function notificarIntento(intentoId: number): Promise<ResultadoEnvio> {
  const { rows } = await query<{
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
        RETURNING i.id, i.puntaje_total, i.grammar_score, i.writing_score,
                  i.feedback, i.estudiante_id, i.evaluacion_id)
     SELECT t.puntaje_total, coalesce(t.grammar_score, 0) AS grammar_score,
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
    await registrarFalloEnvio(intentoId, "SMTP no configurado");
    return "fallo";
  }
  try {
    await enviarCorreo(
      d.email,
      correoResultado({
        evaluacion: d.titulo,
        puntaje: d.puntaje_total,
        grammar: { aciertos: d.grammar_score, total: d.grammar_total },
        writing: { aciertos: d.writing_score, total: d.writing_total },
        feedback: d.feedback,
      }),
    );
    await query(`UPDATE intentos SET envio_error = NULL WHERE id = $1`, [intentoId]).catch(() => {});
    return "enviado";
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[correo-resultado] intento ${intentoId}: ${mensaje}`);
    await registrarFalloEnvio(intentoId, `Correo: ${mensaje}`);
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

  // Correos que no salieron (de la última semana).
  const { rows: envios } = await query<{ id: number }>(
    `SELECT id FROM intentos
      WHERE estado = 'listo' AND feedback IS NOT NULL AND completed_at > now() - interval '7 days'
        AND NOT email_enviado
      ORDER BY completed_at
      LIMIT 20`,
  );
  for (const { id } of envios) {
    if (Date.now() - inicio > presupuestoMs) break;
    if ((await notificarIntento(id)) === "enviado") r.envios += 1;
  }
  return r;
}
