-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- 003 · Ajustes antes de la vista del estudiante (Fase 4)
--
--   · El nombre lo escribe el estudiante al entrar (como en a2) y se guarda
--     en cada intento: estudiantes queda solo con correo, manychat_id y activo.
--   · Evaluaciones: cierre_automatico (al acabar el tiempo se envía sola) y
--     mostrar_correctas (en el resultado, la correcta de las que falló).
--   · Intentos: respuestas_borrador (autoguardado mientras responde) y
--     limite_at (hasta cuándo se aceptan respuestas, fijado al empezar).
--     Un solo intento en_progreso por estudiante y evaluación: recargar o
--     abrir otra pestaña retoma el mismo y no gasta otro.
--
-- Correr una vez, después de 002_otp.sql. Todo o nada (transacción).
-- =====================================================================

SET search_path TO evaluacion, public;            -- <<< SCHEMA

BEGIN;

-- 1. Nombre en cada intento: los que ya existan toman el que tenía el estudiante.
ALTER TABLE intentos ADD COLUMN nombre TEXT;
UPDATE intentos i SET nombre = s.nombre FROM estudiantes s WHERE s.id = i.estudiante_id;
ALTER TABLE intentos ALTER COLUMN nombre SET NOT NULL;

-- 2. Estudiantes sin nombre. v_resultados lo leía de ahí: se recrea con el del intento.
DROP VIEW v_resultados;
ALTER TABLE estudiantes DROP COLUMN nombre;

CREATE VIEW v_resultados AS
SELECT g.codigo AS generacion, e.slug, e.tipo, e.numero,
       i.nombre, s.email,
       i.id AS intento_id, i.numero_intento, i.estado,
       i.puntaje_total, i.grammar_score, i.writing_score,
       i.cambios_pestana, i.email_enviado, i.token,
       i.started_at, i.completed_at
FROM intentos i
JOIN evaluaciones e ON e.id = i.evaluacion_id
JOIN generaciones g ON g.id = e.generacion_id
JOIN estudiantes  s ON s.id = i.estudiante_id;

-- 3. Opciones por evaluación. Cerrar al acabar el tiempo exige una duración.
ALTER TABLE evaluaciones
    ADD COLUMN cierre_automatico BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN mostrar_correctas BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT evaluaciones_cierre_automatico_check
        CHECK (NOT cierre_automatico OR duracion_min IS NOT NULL);

-- 4. Autoguardado y plazo de cada intento.
--    limite_at = el primero entre (inicio + duración, si cierre_automatico) y la
--    fecha de cierre; NULL = sin límite. La app acepta respuestas hasta
--    limite_at + 2 min de gracia; después califica lo que quedó guardado.
ALTER TABLE intentos
    ADD COLUMN respuestas_borrador JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN limite_at TIMESTAMPTZ;

CREATE UNIQUE INDEX uq_intentos_en_progreso ON intentos (evaluacion_id, estudiante_id)
    WHERE estado = 'en_progreso';

COMMIT;
