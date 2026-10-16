// Traduce errores de Postgres (triggers y constraints de db/001_schema.sql) a
// mensajes para el formulario. Las reglas viven en la BD; aquí solo se traducen
// (ver CLAUDE.md: no duplicar los triggers en la app).

export type ErrorTraducido = { mensaje: string; campo?: string };

type ErrorPg = {
  code?: string;
  constraint?: string;
  message?: string;
};

function esErrorPg(e: unknown): e is ErrorPg {
  return typeof e === "object" && e !== null && typeof (e as ErrorPg).code === "string";
}

// RAISE EXCEPTION de validar_pregunta y de las funciones (código P0001).
// Cada regla: patrón del mensaje original → campo del formulario + mensaje.
const MENSAJES_TRIGGER: {
  patron: RegExp;
  campo?: string;
  mensaje: (m: RegExpMatchArray) => string;
}[] = [
  {
    patron: /^Selección múltiple: "opciones" debe ser una lista de al menos 2/,
    campo: "opciones",
    mensaje: () => "Agrega al menos 2 opciones.",
  },
  {
    patron: /^Selección múltiple: marca al menos una respuesta correcta/,
    campo: "correctas",
    mensaje: () => "Marca al menos una opción como correcta.",
  },
  {
    patron: /^Selección múltiple: la respuesta (.+) no está entre las opciones/,
    campo: "correctas",
    mensaje: (m) => `La respuesta correcta ${m[1]} no está entre las opciones.`,
  },
  {
    patron: /^Completar: el enunciado tiene (\d+) espacios y hay (\d+) listas de variantes/,
    campo: "enunciado",
    mensaje: (m) =>
      `El enunciado tiene ${m[1]} espacio(s) ___ pero hay respuestas para ${m[2]}. Deben coincidir.`,
  },
  {
    patron: /^Completar: define las variantes de al menos un espacio/,
    campo: "variantes",
    mensaje: () => "Agrega al menos una respuesta aceptada para el espacio.",
  },
  {
    patron: /^Completar: cada espacio necesita al menos una variante/,
    campo: "variantes",
    mensaje: () => "Cada espacio necesita al menos una respuesta aceptada.",
  },
  {
    patron: /^Traducción: agrega al menos una traducción válida/,
    campo: "traducciones",
    mensaje: () => "Agrega al menos una traducción válida.",
  },
  {
    patron: /^Traducción: cada variante debe ser un texto/,
    campo: "traducciones",
    mensaje: () => "Cada traducción debe ser un texto.",
  },
  {
    patron: /^Abierta: escribe la rúbrica/,
    campo: "rubrica",
    mensaje: () => "Escribe la rúbrica: la IA la usa para calificar.",
  },
  {
    patron: /^La evaluación destino ya tiene preguntas/,
    mensaje: () =>
      "Esta evaluación ya tiene preguntas (también cuentan las desactivadas). Solo se puede clonar en una evaluación vacía.",
  },
];

// Violaciones de UNIQUE (23505), CHECK (23514) y FK (23503) por nombre.
const MENSAJES_CONSTRAINT: Record<string, ErrorTraducido> = {
  generaciones_codigo_key: {
    campo: "codigo",
    mensaje: "Ya existe una generación con ese código.",
  },
  generaciones_codigo_check: {
    campo: "codigo",
    mensaje: "Usa solo minúsculas, números y guiones (ej. gen-2026-10).",
  },
  evaluaciones_slug_key: {
    mensaje: "Ya existe una evaluación con ese identificador.",
  },
  evaluaciones_check1: {
    campo: "cierre",
    mensaje: "El cierre debe ser posterior a la apertura.",
  },
  evaluaciones_duracion_min_check: {
    campo: "duracion_min",
    mensaje: "La duración debe ser mayor que 0 (o vacía para sin límite).",
  },
  evaluaciones_cierre_automatico_check: {
    campo: "cierre_automatico",
    mensaje: "Para cerrar al acabar el tiempo, define la duración.",
  },
  evaluaciones_intentos_permitidos_check: {
    campo: "intentos_permitidos",
    mensaje: "Los intentos deben ser mayores que 0 (o vacío para ilimitados).",
  },
  preguntas_puntaje_check: {
    campo: "puntaje",
    mensaje: "El puntaje debe ser mayor que 0.",
  },
  preguntas_evaluacion_id_orden_key: {
    mensaje: "Alguien más cambió el orden al mismo tiempo. Recarga la página e inténtalo de nuevo.",
  },
  respuestas_pregunta_id_fkey: {
    mensaje: "Esta pregunta ya tiene respuestas: desactívala en vez de borrarla.",
  },
};

// Devuelve null si no es un error de Postgres reconocido.
export function traducirErrorBD(e: unknown): ErrorTraducido | null {
  if (!esErrorPg(e)) return null;

  if (e.code === "P0001" && e.message) {
    for (const regla of MENSAJES_TRIGGER) {
      const m = e.message.match(regla.patron);
      if (m) return { mensaje: regla.mensaje(m), campo: regla.campo };
    }
    // Otro RAISE EXCEPTION de la BD: ya viene en español y pensado para el usuario.
    return { mensaje: e.message };
  }

  if (
    (e.code === "23505" || e.code === "23514" || e.code === "23503") &&
    e.constraint &&
    MENSAJES_CONSTRAINT[e.constraint]
  ) {
    return MENSAJES_CONSTRAINT[e.constraint];
  }

  switch (e.code) {
    case "22001": // texto demasiado largo
    case "22003": // número fuera de rango (SMALLINT, NUMERIC(5,2))
      return { mensaje: "Uno de los valores es demasiado grande." };
    case "40001": // serialización
    case "40P01": // deadlock
      return { mensaje: "Hubo un cruce con otro cambio al mismo tiempo. Inténtalo de nuevo." };
  }
  return null;
}
