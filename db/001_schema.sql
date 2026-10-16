-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- Schema: evaluacion   (para usar otro nombre, cambia solo las 2 líneas
--                       marcadas con <<< SCHEMA)
--
-- Contenido:
--   generaciones · estudiantes · staff (admin/docente) · evaluaciones
--   preguntas (4 tipos) · intentos · respuestas · login_intentos
--
-- Cada generación: 12 evaluaciones mensuales + 4 trimestrales = 16.
-- Idempotente solo en la creación del schema; correr una vez sobre vacío.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;            -- emails sin distinguir mayúsculas

CREATE SCHEMA IF NOT EXISTS evaluacion;           -- <<< SCHEMA
SET search_path TO evaluacion, public;            -- <<< SCHEMA

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
CREATE TYPE rol_staff         AS ENUM ('admin', 'docente');
CREATE TYPE tipo_evaluacion   AS ENUM ('mensual', 'trimestral');
CREATE TYPE tipo_pregunta     AS ENUM ('multiple_choice', 'fill_blank', 'translation', 'open');
CREATE TYPE categoria_pregunta AS ENUM ('grammar', 'writing');
CREATE TYPE estado_intento    AS ENUM ('en_progreso', 'pendiente', 'calificando', 'listo', 'error');

-- updated_at automático
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 1. Generaciones (cohortes)
-- ---------------------------------------------------------------------
CREATE TABLE generaciones (
    id           SERIAL PRIMARY KEY,
    codigo       TEXT UNIQUE NOT NULL CHECK (codigo ~ '^[a-z0-9-]+$'), -- 'gen-2026-10'
    nombre       TEXT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin    DATE,
    activa       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. Estudiantes  (estar aquí = estar autorizado; se cargan por CSV)
-- ---------------------------------------------------------------------
CREATE TABLE estudiantes (
    id            SERIAL PRIMARY KEY,
    generacion_id INT NOT NULL REFERENCES generaciones(id),
    email         CITEXT UNIQUE NOT NULL,
    nombre        TEXT NOT NULL,
    manychat_id   TEXT,
    activo        BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE = bloquear sin borrar
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_estudiantes_generacion ON estudiantes (generacion_id);

-- ---------------------------------------------------------------------
-- 3. Staff (admin hace todo; docente: evaluaciones, preguntas, resultados)
--    password_hash = scrypt generado por la app: 'scrypt$<salt>$<hash>'
-- ---------------------------------------------------------------------
CREATE TABLE staff (
    id            SERIAL PRIMARY KEY,
    email         CITEXT UNIQUE NOT NULL,
    nombre        TEXT NOT NULL,
    rol           rol_staff NOT NULL DEFAULT 'docente',
    password_hash TEXT NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_login  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registro de intentos de login del staff (para limitar fuerza bruta:
-- la app bloquea si hay >= 5 fallos del mismo email en 15 min).
CREATE TABLE login_intentos (
    id         BIGSERIAL PRIMARY KEY,
    email      CITEXT NOT NULL,
    ip         INET,
    exito      BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_intentos_email ON login_intentos (email, created_at DESC);

-- ---------------------------------------------------------------------
-- 4. Evaluaciones
-- ---------------------------------------------------------------------
CREATE TABLE evaluaciones (
    id                  SERIAL PRIMARY KEY,
    generacion_id       INT NOT NULL REFERENCES generaciones(id) ON DELETE CASCADE,
    slug                TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
    titulo              TEXT NOT NULL,
    descripcion         TEXT,
    tipo                tipo_evaluacion NOT NULL,
    numero              SMALLINT NOT NULL,
    fecha_apertura      TIMESTAMPTZ,
    fecha_cierre        TIMESTAMPTZ,
    duracion_min        SMALLINT CHECK (duracion_min > 0),   -- NULL = sin límite
    intentos_permitidos SMALLINT CHECK (intentos_permitidos > 0), -- NULL = ilimitado
    publicada           BOOLEAN NOT NULL DEFAULT FALSE,      -- activar / desactivar
    creado_por          INT REFERENCES staff(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (generacion_id, tipo, numero),
    CHECK ( (tipo = 'mensual'    AND numero BETWEEN 1 AND 12)
         OR (tipo = 'trimestral' AND numero BETWEEN 1 AND 4) ),
    CHECK (fecha_cierre IS NULL OR fecha_apertura IS NULL OR fecha_cierre > fecha_apertura)
);
CREATE TRIGGER trg_evaluaciones_updated BEFORE UPDATE ON evaluaciones
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Preguntas
--
--   tipo             opciones                  respuestas_aceptadas
--   ---------------  ------------------------  -------------------------------------
--   multiple_choice  ["were","was","is","be"]  ["was"]                (1 o más correctas)
--   fill_blank       NULL                      [["is going to","'s going to"]]  (una
--                                              lista de variantes POR CADA espacio)
--   translation      NULL                      ["I was at home yesterday.", "..."]
--   open             NULL                      NULL   (la IA califica con `rubrica`)
--
--   Mayúsculas, tildes, apóstrofes y contracciones los resuelve normalize()
--   en la app; aquí solo van las variantes que cambian la frase.
-- ---------------------------------------------------------------------
CREATE TABLE preguntas (
    id                   SERIAL PRIMARY KEY,
    evaluacion_id        INT NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
    orden                SMALLINT NOT NULL,
    seccion              TEXT,                 -- título visible: 'Part 7 - Future Form'
    tipo                 tipo_pregunta NOT NULL,
    categoria            categoria_pregunta NOT NULL,
    enunciado            TEXT NOT NULL,
    pista                TEXT,                 -- ej. '(be)'
    opciones             JSONB,
    respuestas_aceptadas JSONB,
    rubrica              TEXT,
    puntaje              NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (puntaje > 0),
    activa               BOOLEAN NOT NULL DEFAULT TRUE, -- desactivar en vez de borrar
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evaluacion_id, orden) DEFERRABLE INITIALLY DEFERRED -- permite reordenar
);
CREATE TRIGGER trg_preguntas_updated BEFORE UPDATE ON preguntas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Valida que opciones / respuestas_aceptadas tengan la forma correcta según el tipo.
CREATE FUNCTION validar_pregunta() RETURNS trigger AS $$
DECLARE r JSONB := NEW.respuestas_aceptadas; o JSONB := NEW.opciones; e JSONB;
        espacios INT;
BEGIN
    CASE NEW.tipo
    WHEN 'multiple_choice' THEN
        IF o IS NULL OR jsonb_typeof(o) <> 'array' OR jsonb_array_length(o) < 2 THEN
            RAISE EXCEPTION 'Selección múltiple: "opciones" debe ser una lista de al menos 2';
        END IF;
        IF r IS NULL OR jsonb_typeof(r) <> 'array' OR jsonb_array_length(r) < 1 THEN
            RAISE EXCEPTION 'Selección múltiple: marca al menos una respuesta correcta';
        END IF;
        FOR e IN SELECT * FROM jsonb_array_elements(r) LOOP
            IF NOT o @> jsonb_build_array(e) THEN
                RAISE EXCEPTION 'Selección múltiple: la respuesta % no está entre las opciones', e;
            END IF;
        END LOOP;

    WHEN 'fill_blank' THEN
        IF r IS NULL OR jsonb_typeof(r) <> 'array' OR jsonb_array_length(r) < 1 THEN
            RAISE EXCEPTION 'Completar: define las variantes de al menos un espacio';
        END IF;
        FOR e IN SELECT * FROM jsonb_array_elements(r) LOOP
            IF jsonb_typeof(e) <> 'array' OR jsonb_array_length(e) < 1 THEN
                RAISE EXCEPTION 'Completar: cada espacio necesita al menos una variante';
            END IF;
        END LOOP;
        -- Si el enunciado tiene espacios "___", deben coincidir con las listas.
        espacios := (SELECT count(*) FROM regexp_matches(NEW.enunciado, '_{3,}', 'g'));
        IF espacios > 0 AND espacios <> jsonb_array_length(r) THEN
            RAISE EXCEPTION 'Completar: el enunciado tiene % espacios y hay % listas de variantes',
                            espacios, jsonb_array_length(r);
        END IF;

    WHEN 'translation' THEN
        IF r IS NULL OR jsonb_typeof(r) <> 'array' OR jsonb_array_length(r) < 1 THEN
            RAISE EXCEPTION 'Traducción: agrega al menos una traducción válida';
        END IF;
        FOR e IN SELECT * FROM jsonb_array_elements(r) LOOP
            IF jsonb_typeof(e) <> 'string' THEN
                RAISE EXCEPTION 'Traducción: cada variante debe ser un texto';
            END IF;
        END LOOP;

    WHEN 'open' THEN
        IF NEW.rubrica IS NULL OR btrim(NEW.rubrica) = '' THEN
            RAISE EXCEPTION 'Abierta: escribe la rúbrica para la calificación con IA';
        END IF;
    END CASE;

    IF NEW.tipo <> 'multiple_choice' THEN NEW.opciones := NULL; END IF;
    IF NEW.tipo = 'open' THEN NEW.respuestas_aceptadas := NULL; END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_pregunta BEFORE INSERT OR UPDATE ON preguntas
FOR EACH ROW EXECUTE FUNCTION validar_pregunta();

-- ---------------------------------------------------------------------
-- 6. Intentos (una presentación de un estudiante)
-- ---------------------------------------------------------------------
CREATE TABLE intentos (
    id              SERIAL PRIMARY KEY,
    evaluacion_id   INT NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
    estudiante_id   INT NOT NULL REFERENCES estudiantes(id)  ON DELETE CASCADE,
    numero_intento  SMALLINT NOT NULL,          -- lo calcula el trigger
    token           TEXT UNIQUE NOT NULL,       -- enlace /resultado/[token]
    estado          estado_intento NOT NULL DEFAULT 'en_progreso',
    puntaje_total   SMALLINT CHECK (puntaje_total BETWEEN 0 AND 100),
    grammar_score   SMALLINT,                   -- aciertos de categoría grammar
    writing_score   SMALLINT,                   -- aciertos de categoría writing
    feedback        TEXT,
    cambios_pestana SMALLINT NOT NULL DEFAULT 0,
    email_enviado   BOOLEAN NOT NULL DEFAULT FALSE,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    UNIQUE (evaluacion_id, estudiante_id, numero_intento)
);
CREATE INDEX idx_intentos_estudiante ON intentos (estudiante_id, started_at DESC);
CREATE INDEX idx_intentos_evaluacion ON intentos (evaluacion_id);
CREATE INDEX idx_intentos_por_procesar ON intentos (estado)
    WHERE estado IN ('pendiente', 'calificando', 'error') OR email_enviado = FALSE;

CREATE FUNCTION validar_intento() RETURNS trigger AS $$
DECLARE ev evaluaciones%ROWTYPE; previos INT;
BEGIN
    SELECT * INTO ev FROM evaluaciones WHERE id = NEW.evaluacion_id;

    IF NOT ev.publicada THEN
        RAISE EXCEPTION 'La evaluación % no está publicada', ev.slug;
    END IF;
    IF (ev.fecha_apertura IS NOT NULL AND now() < ev.fecha_apertura)
    OR (ev.fecha_cierre   IS NOT NULL AND now() > ev.fecha_cierre) THEN
        RAISE EXCEPTION 'La evaluación % está fuera de fecha', ev.slug;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM estudiantes
                   WHERE id = NEW.estudiante_id
                     AND generacion_id = ev.generacion_id
                     AND activo) THEN
        RAISE EXCEPTION 'Estudiante no autorizado para esta generación';
    END IF;

    SELECT count(*) INTO previos FROM intentos
     WHERE evaluacion_id = NEW.evaluacion_id AND estudiante_id = NEW.estudiante_id;
    NEW.numero_intento := previos + 1;

    IF ev.intentos_permitidos IS NOT NULL AND NEW.numero_intento > ev.intentos_permitidos THEN
        RAISE EXCEPTION 'Se superó el número de intentos permitidos';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_intento BEFORE INSERT ON intentos
FOR EACH ROW EXECUTE FUNCTION validar_intento();

-- ---------------------------------------------------------------------
-- 7. Respuestas (detalle por pregunta, congelado al calificar)
--    Una pregunta con respuestas NO se puede borrar (RESTRICT): se desactiva.
--    Así editar una pregunta nunca cambia en silencio notas ya dadas.
-- ---------------------------------------------------------------------
CREATE TABLE respuestas (
    id          BIGSERIAL PRIMARY KEY,
    intento_id  INT NOT NULL REFERENCES intentos(id)  ON DELETE CASCADE,
    pregunta_id INT NOT NULL REFERENCES preguntas(id) ON DELETE RESTRICT,
    respuesta   JSONB,            -- "was" | ["is going to"] | "I was at home..."
    es_correcta BOOLEAN,          -- NULL mientras la IA califica una abierta
    puntaje     NUMERIC(5,2),
    feedback    TEXT,             -- comentario de la IA (abiertas)
    UNIQUE (intento_id, pregunta_id)
);
CREATE INDEX idx_respuestas_pregunta ON respuestas (pregunta_id);

-- =====================================================================
-- Funciones de apoyo para el dashboard
-- =====================================================================

-- Crea las 16 evaluaciones (sin publicar) de una generación.
CREATE FUNCTION generar_evaluaciones(p_generacion INT, p_staff INT DEFAULT NULL)
RETURNS INT AS $$
DECLARE g generaciones%ROWTYPE; n INT; creadas INT := 0; c INT;
BEGIN
    SELECT * INTO g FROM generaciones WHERE id = p_generacion;
    IF NOT FOUND THEN RAISE EXCEPTION 'Generación % no existe', p_generacion; END IF;
    FOR n IN 1..12 LOOP
        INSERT INTO evaluaciones (generacion_id, slug, titulo, tipo, numero, creado_por)
        VALUES (g.id, g.codigo || '-m' || lpad(n::text, 2, '0'),
                'Evaluación mensual ' || n, 'mensual', n, p_staff)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS c = ROW_COUNT; creadas := creadas + c;
    END LOOP;
    FOR n IN 1..4 LOOP
        INSERT INTO evaluaciones (generacion_id, slug, titulo, tipo, numero, creado_por)
        VALUES (g.id, g.codigo || '-t' || n,
                'Evaluación trimestral ' || n, 'trimestral', n, p_staff)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS c = ROW_COUNT; creadas := creadas + c;
    END LOOP;
    RETURN creadas;
END $$ LANGUAGE plpgsql;

-- Copia todas las preguntas activas de una evaluación a otra (vacía).
CREATE FUNCTION clonar_preguntas(p_origen INT, p_destino INT) RETURNS INT AS $$
DECLARE c INT;
BEGIN
    IF EXISTS (SELECT 1 FROM preguntas WHERE evaluacion_id = p_destino) THEN
        RAISE EXCEPTION 'La evaluación destino ya tiene preguntas';
    END IF;
    INSERT INTO preguntas (evaluacion_id, orden, seccion, tipo, categoria, enunciado,
                           pista, opciones, respuestas_aceptadas, rubrica, puntaje)
    SELECT p_destino, orden, seccion, tipo, categoria, enunciado,
           pista, opciones, respuestas_aceptadas, rubrica, puntaje
    FROM preguntas WHERE evaluacion_id = p_origen AND activa
    ORDER BY orden;
    GET DIAGNOSTICS c = ROW_COUNT;
    RETURN c;
END $$ LANGUAGE plpgsql;

-- =====================================================================
-- Vistas
-- =====================================================================

-- Preguntas SIN respuestas, lo único que debe llegar al navegador del estudiante.
CREATE VIEW v_preguntas_publicas AS
SELECT p.id, p.evaluacion_id, p.orden, p.seccion, p.tipo, p.enunciado, p.pista,
       p.opciones,
       CASE WHEN p.tipo = 'fill_blank'
            THEN jsonb_array_length(p.respuestas_aceptadas) END AS espacios
FROM preguntas p
WHERE p.activa
ORDER BY p.evaluacion_id, p.orden;

-- Resumen de cada evaluación para el dashboard.
CREATE VIEW v_evaluaciones_resumen AS
SELECT e.id, g.codigo AS generacion, e.slug, e.titulo, e.tipo, e.numero, e.publicada,
       e.fecha_apertura, e.fecha_cierre,
       (SELECT count(*) FROM preguntas p WHERE p.evaluacion_id = e.id AND p.activa) AS preguntas,
       (SELECT count(*) FROM intentos i WHERE i.evaluacion_id = e.id)              AS intentos,
       (SELECT round(avg(i.puntaje_total)) FROM intentos i
         WHERE i.evaluacion_id = e.id AND i.estado = 'listo')                     AS promedio
FROM evaluaciones e
JOIN generaciones g ON g.id = e.generacion_id;

-- Resultados por intento (reportes, n8n, exportar CSV).
CREATE VIEW v_resultados AS
SELECT g.codigo AS generacion, e.slug, e.tipo, e.numero,
       s.nombre, s.email,
       i.id AS intento_id, i.numero_intento, i.estado,
       i.puntaje_total, i.grammar_score, i.writing_score,
       i.cambios_pestana, i.email_enviado, i.token,
       i.started_at, i.completed_at
FROM intentos i
JOIN evaluaciones e ON e.id = i.evaluacion_id
JOIN generaciones g ON g.id = e.generacion_id
JOIN estudiantes  s ON s.id = i.estudiante_id;

-- Preguntas que más se fallan (para que el docente revise).
CREATE VIEW v_dificultad_preguntas AS
SELECT p.evaluacion_id, p.id AS pregunta_id, p.orden, p.tipo, p.enunciado,
       count(r.id)                                         AS respondidas,
       round(100.0 * avg((r.es_correcta)::int), 1)         AS pct_acierto
FROM preguntas p
LEFT JOIN respuestas r ON r.pregunta_id = p.id AND r.es_correcta IS NOT NULL
GROUP BY p.id;
