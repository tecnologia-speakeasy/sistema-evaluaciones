import { randomBytes } from "node:crypto";
import { query, transaction, type Tx } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import { sqlALocal } from "@/lib/fechas";
import {
  calificarPregunta,
  respuestaCorrectaVisible,
  resumirIntento,
  type PreguntaParaCalificar,
  type RespuestaDada,
} from "@/lib/grading/calificar";
import { GRACIA_S } from "@/lib/intentos/reloj";
import type { PreguntaPublica, TipoPregunta } from "@/lib/preguntas/tipos";
import type { TipoEvaluacion } from "@/lib/tipos";

// Intentos del estudiante (Fase 4). Sin autorización: la hacen las rutas y
// páginas con requireEstudiante() y aquí siempre se filtra por estudiante_id.
// Reglas (CLAUDE.md, "Reglas del examen"):
//   · Un solo intento en_progreso por estudiante y evaluación: se retoma.
//   · respuestas_borrador = autoguardado; respuestas = solo calificadas.
//   · Se aceptan respuestas hasta limite_at + 2 min; después se califica lo guardado.

const A_TIEMPO = `(i.limite_at IS NULL OR now() <= i.limite_at + make_interval(secs => ${GRACIA_S}))`;

export type Respuestas = Record<string, string | string[]>;
export type EstadoIntento = "en_progreso" | "pendiente" | "calificando" | "listo" | "error";

// ---------------------------------------------------------------------------
// Hub: evaluaciones publicadas de su generación
// ---------------------------------------------------------------------------

export type EvaluacionEstudiante = {
  id: number;
  slug: string;
  titulo: string;
  descripcion: string | null;
  tipo: TipoEvaluacion;
  numero: number;
  apertura: string | null;
  cierre: string | null;
  duracion_min: number | null;
  intentos_permitidos: number | null;
  cierre_automatico: boolean;
  estado: "programada" | "abierta" | "cerrada";
  preguntas: number;
  intentos_usados: number;
  en_curso: boolean;
  mejor_puntaje: number | null;
  /** Último intento enviado (para "Ver resultado"). */
  ultimo_numero: number | null;
};

const COLUMNAS_EVALUACION = `
  e.id, e.slug, e.titulo, e.descripcion, e.tipo, e.numero,
  ${sqlALocal("e.fecha_apertura")} AS apertura,
  ${sqlALocal("e.fecha_cierre")} AS cierre,
  e.duracion_min, e.intentos_permitidos, e.cierre_automatico,
  CASE WHEN e.fecha_apertura IS NOT NULL AND e.fecha_apertura > now() THEN 'programada'
       WHEN e.fecha_cierre   IS NOT NULL AND e.fecha_cierre   < now() THEN 'cerrada'
       ELSE 'abierta' END AS estado,
  (SELECT count(*)::int FROM preguntas p WHERE p.evaluacion_id = e.id AND p.activa) AS preguntas,
  count(i.id)::int AS intentos_usados,
  coalesce(bool_or(i.estado = 'en_progreso'), false) AS en_curso,
  max(i.puntaje_total)::int AS mejor_puntaje,
  max(i.numero_intento) FILTER (WHERE i.estado <> 'en_progreso')::int AS ultimo_numero`;

export async function evaluacionesDelEstudiante(
  estudianteId: number,
  generacionId: number,
): Promise<EvaluacionEstudiante[]> {
  const { rows } = await query<EvaluacionEstudiante>(
    `SELECT ${COLUMNAS_EVALUACION}
       FROM evaluaciones e
       LEFT JOIN intentos i ON i.evaluacion_id = e.id AND i.estudiante_id = $1
      WHERE e.generacion_id = $2 AND e.publicada
      GROUP BY e.id
      ORDER BY e.tipo, e.numero`,
    [estudianteId, generacionId],
  );
  return rows;
}

// ¿Puede empezar otro intento? (el trigger validar_intento lo vuelve a revisar)
export function puedePresentar(e: EvaluacionEstudiante): boolean {
  return (
    e.estado === "abierta" &&
    e.preguntas > 0 &&
    (e.en_curso || e.intentos_permitidos === null || e.intentos_usados < e.intentos_permitidos)
  );
}

// ---------------------------------------------------------------------------
// Presentar
// ---------------------------------------------------------------------------

export type IntentoEnCurso = {
  id: number;
  numero: number;
  /** ISO. El reloj se cuenta desde aquí. */
  inicio: string;
  /** ISO o null (sin límite). */
  limite: string | null;
  /** Hora del servidor (ISO), para corregir el reloj del navegador. */
  ahora: string;
  borrador: Respuestas;
  cambiosPestana: number;
};

export type DatosPresentar = {
  evaluacion: EvaluacionEstudiante;
  preguntas: PreguntaPublica[];
  enCurso: IntentoEnCurso | null;
};

export async function evaluacionParaPresentar(
  slug: string,
  estudianteId: number,
  generacionId: number,
): Promise<DatosPresentar | null> {
  const { rows } = await query<EvaluacionEstudiante>(
    `SELECT ${COLUMNAS_EVALUACION}
       FROM evaluaciones e
       LEFT JOIN intentos i ON i.evaluacion_id = e.id AND i.estudiante_id = $2
      WHERE e.slug = $1 AND e.generacion_id = $3 AND e.publicada
      GROUP BY e.id`,
    [slug, estudianteId, generacionId],
  );
  const evaluacion = rows[0];
  if (!evaluacion) return null;

  const [preguntas, enCurso] = await Promise.all([
    query<PreguntaPublica>(
      `SELECT id, orden, seccion, tipo, enunciado, pista, opciones, espacios
         FROM v_preguntas_publicas WHERE evaluacion_id = $1 ORDER BY orden`,
      [evaluacion.id],
    ),
    query<FilaEnCurso>(`SELECT ${COLUMNAS_EN_CURSO} FROM intentos i
       WHERE i.evaluacion_id = $1 AND i.estudiante_id = $2 AND i.estado = 'en_progreso'`, [
      evaluacion.id,
      estudianteId,
    ]),
  ]);
  return {
    evaluacion,
    preguntas: preguntas.rows,
    enCurso: enCurso.rows[0] ? aEnCurso(enCurso.rows[0]) : null,
  };
}

type FilaEnCurso = {
  id: number;
  numero_intento: number;
  started_at: Date;
  limite_at: Date | null;
  ahora: Date;
  respuestas_borrador: Respuestas;
  cambios_pestana: number;
  a_tiempo: boolean;
};
const COLUMNAS_EN_CURSO = `i.id, i.numero_intento, i.started_at, i.limite_at, now() AS ahora,
  i.respuestas_borrador, i.cambios_pestana, ${A_TIEMPO} AS a_tiempo`;

const aEnCurso = (f: FilaEnCurso): IntentoEnCurso => ({
  id: f.id,
  numero: f.numero_intento,
  inicio: f.started_at.toISOString(),
  limite: f.limite_at?.toISOString() ?? null,
  ahora: f.ahora.toISOString(),
  borrador: f.respuestas_borrador ?? {},
  cambiosPestana: f.cambios_pestana,
});

// Mensajes de validar_intento (db/001_schema.sql) para el estudiante.
const MENSAJES_INICIO: [RegExp, string][] = [
  [/no está publicada/, "Esta evaluación no está disponible."],
  [/fuera de fecha/, "Esta evaluación no está abierta en este momento."],
  [/no autorizado/, "Tu correo no está inscrito en esta generación."],
  [/intentos permitidos/, "Ya usaste todos tus intentos de esta evaluación."],
];

export type InicioIntento =
  | { tipo: "en_curso"; intento: IntentoEnCurso }
  /** Tenía uno en curso que ya se pasó del plazo: se calificó con lo guardado. */
  | { tipo: "finalizado"; numero: number };

// Retoma el intento en curso o crea uno nuevo (con el nombre de la sesión).
export async function iniciarOReanudar(
  evaluacionId: number,
  estudiante: { id: number; nombre: string },
): Promise<InicioIntento> {
  try {
    return await transaction(async (tx) => {
      // Dos pestañas a la vez: una espera a la otra y ambas ven el mismo intento.
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext('intento-' || $1::text), $2)`, [
        evaluacionId,
        estudiante.id,
      ]);
      const { rows: actual } = await tx.query<FilaEnCurso>(
        `SELECT ${COLUMNAS_EN_CURSO} FROM intentos i
          WHERE i.evaluacion_id = $1 AND i.estudiante_id = $2 AND i.estado = 'en_progreso'
            FOR UPDATE`,
        [evaluacionId, estudiante.id],
      );
      if (actual[0]) {
        if (actual[0].a_tiempo) return { tipo: "en_curso" as const, intento: aEnCurso(actual[0]) };
        await finalizar(tx, actual[0].id, null, 0);
        return { tipo: "finalizado" as const, numero: actual[0].numero_intento };
      }

      // limite_at: el primero entre fin del tiempo (si cierra solo) y la fecha de cierre.
      const { rows } = await tx.query<FilaEnCurso>(
        `WITH nuevo AS (
           INSERT INTO intentos (evaluacion_id, estudiante_id, nombre, token, limite_at)
           SELECT e.id, $2, $3, $4,
                  LEAST(CASE WHEN e.cierre_automatico AND e.duracion_min IS NOT NULL
                             THEN now() + make_interval(mins => e.duracion_min) END,
                        e.fecha_cierre)
             FROM evaluaciones e WHERE e.id = $1
           RETURNING *)
         SELECT ${COLUMNAS_EN_CURSO} FROM nuevo i`,
        [evaluacionId, estudiante.id, estudiante.nombre, randomBytes(32).toString("base64url")],
      );
      if (!rows[0]) throw new ErrorNegocio("Esta evaluación no está disponible.");
      return { tipo: "en_curso" as const, intento: aEnCurso(rows[0]) };
    });
  } catch (e) {
    const mensaje = (e as { code?: string; message?: string })?.code === "P0001" ? (e as Error).message : "";
    const amigable = MENSAJES_INICIO.find(([patron]) => patron.test(mensaje));
    if (amigable) throw new ErrorNegocio(amigable[1]);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Guardado automático
// ---------------------------------------------------------------------------

export type ResultadoGuardado =
  | { ok: true; guardado: string }
  | { ok: false; motivo: "no_existe" | "enviado" | "fuera_de_plazo" };

export async function guardarBorrador(
  intentoId: number,
  estudianteId: number,
  respuestas: Respuestas,
  cambiosPestana: number,
): Promise<ResultadoGuardado> {
  const { rows } = await query<{ guardado: Date }>(
    `UPDATE intentos i
        SET respuestas_borrador = $3::jsonb,
            cambios_pestana = GREATEST(i.cambios_pestana, $4)
      WHERE i.id = $1 AND i.estudiante_id = $2 AND i.estado = 'en_progreso' AND ${A_TIEMPO}
      RETURNING now() AS guardado`,
    [intentoId, estudianteId, JSON.stringify(respuestas), cambiosPestana],
  );
  if (rows[0]) return { ok: true, guardado: rows[0].guardado.toISOString() };

  const { rows: info } = await query<{ estado: EstadoIntento }>(
    `SELECT estado FROM intentos WHERE id = $1 AND estudiante_id = $2`,
    [intentoId, estudianteId],
  );
  if (!info[0]) return { ok: false, motivo: "no_existe" };
  return { ok: false, motivo: info[0].estado === "en_progreso" ? "fuera_de_plazo" : "enviado" };
}

// ---------------------------------------------------------------------------
// Enviar y calificar
// ---------------------------------------------------------------------------

export type Envio = { numero: number; estado: EstadoIntento; slug: string };

// Califica y cierra el intento. Si llega fuera de plazo, ignora lo que manda el
// navegador y califica lo que quedó guardado. Enviar dos veces devuelve lo mismo.
export async function enviarIntento(
  intentoId: number,
  estudianteId: number,
  respuestas: Respuestas | null,
  cambiosPestana: number,
): Promise<Envio | null> {
  return transaction(async (tx) => {
    const { rows } = await tx.query<{ estado: EstadoIntento; numero_intento: number; slug: string }>(
      `SELECT i.estado, i.numero_intento, e.slug
         FROM intentos i JOIN evaluaciones e ON e.id = i.evaluacion_id
        WHERE i.id = $1 AND i.estudiante_id = $2
          FOR UPDATE OF i`,
      [intentoId, estudianteId],
    );
    const intento = rows[0];
    if (!intento) return null;
    const estado =
      intento.estado === "en_progreso"
        ? await finalizar(tx, intentoId, respuestas, cambiosPestana)
        : intento.estado;
    return { numero: intento.numero_intento, estado, slug: intento.slug };
  });
}

// Dentro de una transacción con el intento bloqueado (FOR UPDATE).
async function finalizar(
  tx: Tx,
  intentoId: number,
  respuestas: Respuestas | null,
  cambiosPestana: number,
): Promise<EstadoIntento> {
  const { rows: datos } = await tx.query<{
    evaluacion_id: number;
    a_tiempo: boolean;
    respuestas_borrador: Respuestas;
  }>(`SELECT i.evaluacion_id, ${A_TIEMPO} AS a_tiempo, i.respuestas_borrador FROM intentos i WHERE i.id = $1`, [
    intentoId,
  ]);
  const { evaluacion_id, a_tiempo, respuestas_borrador } = datos[0];
  const finales: Respuestas = a_tiempo && respuestas ? respuestas : (respuestas_borrador ?? {});

  const { rows: preguntas } = await tx.query<PreguntaParaCalificar>(
    `SELECT id, tipo, categoria, puntaje::float8 AS puntaje, respuestas_aceptadas
       FROM preguntas WHERE evaluacion_id = $1 AND activa ORDER BY orden`,
    [evaluacion_id],
  );
  const calificadas = preguntas.map((pregunta) => ({
    pregunta,
    calificacion: calificarPregunta(pregunta, finales[String(pregunta.id)] as RespuestaDada),
  }));
  const resumen = resumirIntento(calificadas);

  await tx.query(
    `INSERT INTO respuestas (intento_id, pregunta_id, respuesta, es_correcta, puntaje)
     SELECT $1, r.pregunta_id, NULLIF(r.respuesta, 'null'::jsonb), r.es_correcta, r.puntaje
       FROM jsonb_to_recordset($2::jsonb)
         AS r(pregunta_id int, respuesta jsonb, es_correcta boolean, puntaje numeric)`,
    [
      intentoId,
      JSON.stringify(
        calificadas.map(({ pregunta, calificacion: c }) => ({
          pregunta_id: pregunta.id,
          respuesta: c.respuesta,
          es_correcta: c.es_correcta,
          puntaje: c.puntaje,
        })),
      ),
    ],
  );
  const estado: EstadoIntento = resumen.pendiente ? "pendiente" : "listo";
  await tx.query(
    `UPDATE intentos
        SET estado = $2, puntaje_total = $3, grammar_score = $4, writing_score = $5,
            respuestas_borrador = $6::jsonb, cambios_pestana = GREATEST(cambios_pestana, $7),
            completed_at = now()
      WHERE id = $1`,
    [
      intentoId,
      estado,
      resumen.puntaje_total,
      resumen.grammar_score,
      resumen.writing_score,
      JSON.stringify(finales),
      cambiosPestana,
    ],
  );
  return estado;
}

// Los intentos en curso que ya se pasaron del plazo se califican con lo
// guardado (p. ej. cerró el navegador y la evaluación cerró). Idempotente.
export async function cerrarVencidos(estudianteId: number): Promise<void> {
  const { rows } = await query<{ id: number }>(
    `SELECT i.id FROM intentos i
      WHERE i.estudiante_id = $1 AND i.estado = 'en_progreso' AND NOT ${A_TIEMPO}`,
    [estudianteId],
  );
  for (const { id } of rows) await enviarIntento(id, estudianteId, null, 0);
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

export type ResumenIntentoEnviado = {
  numero: number;
  estado: EstadoIntento;
  puntaje_total: number | null;
  /** Hora de Colombia "YYYY-MM-DDTHH:MM". */
  completado: string | null;
};

export type DetallePregunta = {
  id: number;
  seccion: string | null;
  tipo: TipoPregunta;
  categoria: "grammar" | "writing";
  enunciado: string;
  pista: string | null;
  opciones: string[] | null;
  respuesta: string | string[] | null;
  es_correcta: boolean | null;
  /** Solo si se puede mostrar (ver correctasVisibles). Nunca viene de otra forma. */
  correcta: string | string[] | null;
};

export type DetalleIntento = {
  numero: number;
  estado: EstadoIntento;
  nombre: string;
  puntaje_total: number | null;
  grammar_score: number;
  writing_score: number;
  grammar_total: number;
  writing_total: number;
  completado: string | null;
  token: string;
  evaluacion: {
    slug: string;
    titulo: string;
    tipo: TipoEvaluacion;
    numero: number;
    mostrar_correctas: boolean;
    intentos_permitidos: number | null;
  };
  /** mostrar_correctas y (sin intentos por delante o evaluación cerrada). */
  correctasVisibles: boolean;
  /** Puede presentar otra vez (o retomar uno en curso). */
  puedeRepetir: boolean;
  enCurso: boolean;
  preguntas: DetallePregunta[];
  intentos: ResumenIntentoEnviado[];
};

export async function detalleIntento(
  slug: string,
  numero: number,
  estudianteId: number,
): Promise<DetalleIntento | null> {
  const { rows } = await query<{
    id: number;
    numero_intento: number;
    estado: EstadoIntento;
    nombre: string;
    puntaje_total: number | null;
    grammar_score: number | null;
    writing_score: number | null;
    completado: string | null;
    token: string;
    evaluacion_id: number;
    slug: string;
    titulo: string;
    tipo: TipoEvaluacion;
    eval_numero: number;
    mostrar_correctas: boolean;
    intentos_permitidos: number | null;
    cerrada: boolean;
    abierta: boolean;
    usados: number;
    en_curso: boolean;
  }>(
    `SELECT i.id, i.numero_intento, i.estado, i.nombre, i.puntaje_total, i.grammar_score,
            i.writing_score, ${sqlALocal("i.completed_at")} AS completado, i.token,
            e.id AS evaluacion_id, e.slug, e.titulo, e.tipo, e.numero AS eval_numero,
            e.mostrar_correctas, e.intentos_permitidos,
            (e.fecha_cierre IS NOT NULL AND e.fecha_cierre < now()) AS cerrada,
            (e.publicada AND (e.fecha_apertura IS NULL OR e.fecha_apertura <= now())
                         AND (e.fecha_cierre IS NULL OR e.fecha_cierre >= now())) AS abierta,
            (SELECT count(*)::int FROM intentos x
              WHERE x.evaluacion_id = e.id AND x.estudiante_id = i.estudiante_id) AS usados,
            EXISTS (SELECT 1 FROM intentos x WHERE x.evaluacion_id = e.id
                       AND x.estudiante_id = i.estudiante_id AND x.estado = 'en_progreso') AS en_curso
       FROM intentos i JOIN evaluaciones e ON e.id = i.evaluacion_id
      WHERE e.slug = $1 AND i.numero_intento = $2 AND i.estudiante_id = $3
        AND i.estado <> 'en_progreso'`,
    [slug, numero, estudianteId],
  );
  const f = rows[0];
  if (!f) return null;

  const sinMasIntentos = f.intentos_permitidos !== null && f.usados >= f.intentos_permitidos && !f.en_curso;
  const correctasVisibles = f.mostrar_correctas && (f.cerrada || sinMasIntentos);

  const [{ rows: preguntas }, { rows: intentos }] = await Promise.all([
    query<Omit<DetallePregunta, "correcta"> & { respuestas_aceptadas: unknown }>(
      `SELECT p.id, p.seccion, p.tipo, p.categoria, p.enunciado, p.pista, p.opciones,
              p.respuestas_aceptadas, r.respuesta, r.es_correcta
         FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
        WHERE r.intento_id = $1
        ORDER BY p.orden`,
      [f.id],
    ),
    intentosEnviados(f.evaluacion_id, estudianteId),
  ]);

  return {
    numero: f.numero_intento,
    estado: f.estado,
    nombre: f.nombre,
    puntaje_total: f.puntaje_total,
    grammar_score: f.grammar_score ?? 0,
    writing_score: f.writing_score ?? 0,
    // Solo las ya calificadas: una abierta pendiente no cuenta todavía.
    grammar_total: preguntas.filter((p) => p.categoria === "grammar" && p.es_correcta !== null).length,
    writing_total: preguntas.filter((p) => p.categoria === "writing" && p.es_correcta !== null).length,
    completado: f.completado,
    token: f.token,
    evaluacion: {
      slug: f.slug,
      titulo: f.titulo,
      tipo: f.tipo,
      numero: f.eval_numero,
      mostrar_correctas: f.mostrar_correctas,
      intentos_permitidos: f.intentos_permitidos,
    },
    correctasVisibles,
    puedeRepetir: f.en_curso || (f.abierta && (f.intentos_permitidos === null || f.usados < f.intentos_permitidos)),
    enCurso: f.en_curso,
    // respuestas_aceptadas se queda aquí: al navegador solo llega `correcta`,
    // y solo de las falladas cuando está permitido (regla de seguridad 1).
    preguntas: preguntas.map(({ respuestas_aceptadas, ...p }) => ({
      ...p,
      correcta:
        correctasVisibles && p.es_correcta === false
          ? respuestaCorrectaVisible({ tipo: p.tipo, respuestas_aceptadas })
          : null,
    })),
    intentos,
  };
}

async function intentosEnviados(evaluacionId: number, estudianteId: number) {
  return query<ResumenIntentoEnviado>(
    `SELECT numero_intento AS numero, estado, puntaje_total, ${sqlALocal("completed_at")} AS completado
       FROM intentos
      WHERE evaluacion_id = $1 AND estudiante_id = $2 AND estado <> 'en_progreso'
      ORDER BY numero_intento`,
    [evaluacionId, estudianteId],
  );
}

export type IntentoHistorial = ResumenIntentoEnviado & {
  grammar_score: number;
  writing_score: number;
  grammar_total: number;
  writing_total: number;
  /** Para la gráfica (ms). */
  completado_ms: number;
  slug: string;
  titulo: string;
  tipo: TipoEvaluacion;
  eval_numero: number;
};

export async function historial(estudianteId: number): Promise<IntentoHistorial[]> {
  const { rows } = await query<IntentoHistorial>(
    `SELECT i.numero_intento AS numero, i.estado, i.puntaje_total,
            ${sqlALocal("i.completed_at")} AS completado,
            (extract(epoch FROM i.completed_at) * 1000)::float8 AS completado_ms,
            coalesce(i.grammar_score, 0) AS grammar_score, coalesce(i.writing_score, 0) AS writing_score,
            t.grammar_total, t.writing_total,
            e.slug, e.titulo, e.tipo, e.numero AS eval_numero
       FROM intentos i
       JOIN evaluaciones e ON e.id = i.evaluacion_id
       CROSS JOIN LATERAL (
         SELECT count(*) FILTER (WHERE p.categoria = 'grammar' AND r.es_correcta IS NOT NULL)::int AS grammar_total,
                count(*) FILTER (WHERE p.categoria = 'writing' AND r.es_correcta IS NOT NULL)::int AS writing_total
           FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
          WHERE r.intento_id = i.id) t
      WHERE i.estudiante_id = $1 AND i.estado <> 'en_progreso'
      ORDER BY i.completed_at, i.id`,
    [estudianteId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// /resultado/[token] (público): solo el resumen, nunca el detalle por pregunta.
// ---------------------------------------------------------------------------

export type ResultadoPublico = {
  nombre: string;
  estado: EstadoIntento;
  puntaje_total: number | null;
  grammar_score: number;
  writing_score: number;
  grammar_total: number;
  writing_total: number;
  feedback: string | null;
  titulo: string;
  completado: string | null;
};

const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

export async function resultadoPublico(token: string): Promise<ResultadoPublico | null> {
  if (!TOKEN.test(token)) return null;
  const { rows } = await query<ResultadoPublico>(
    `SELECT i.nombre, i.estado, i.puntaje_total,
            coalesce(i.grammar_score, 0) AS grammar_score, coalesce(i.writing_score, 0) AS writing_score,
            t.grammar_total, t.writing_total, i.feedback, e.titulo,
            ${sqlALocal("i.completed_at")} AS completado
       FROM intentos i
       JOIN evaluaciones e ON e.id = i.evaluacion_id
       CROSS JOIN LATERAL (
         SELECT count(*) FILTER (WHERE p.categoria = 'grammar' AND r.es_correcta IS NOT NULL)::int AS grammar_total,
                count(*) FILTER (WHERE p.categoria = 'writing' AND r.es_correcta IS NOT NULL)::int AS writing_total
           FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
          WHERE r.intento_id = i.id) t
      WHERE i.token = $1 AND i.estado <> 'en_progreso'`,
    [token],
  );
  return rows[0] ?? null;
}
