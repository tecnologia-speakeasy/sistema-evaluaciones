-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- 011 · Categorías Reading y Listening
--
--   Hasta ahora una pregunta solo podía ser de Grammar o de Writing, así que las
--   de las lecturas y los audios (Reading y Listening del Placement Test)
--   quedaban en Grammar.
--   · categoria_pregunta: nuevos valores 'reading' y 'listening'.
--   · intentos.reading_score / listening_score: aciertos de esas categorías,
--     como grammar_score y writing_score. Los intentos de antes quedan en NULL
--     (no tenían ninguna de esas preguntas), salvo los del punto siguiente.
--   · v_resultados: agrega reading_score y listening_score (al final).
--   · Preguntas que ya existen: las de Grammar ligadas a una lectura pasan a
--     Reading y las ligadas a un audio, a Listening (en producción: la
--     bienvenida y la M1 de gen-2026-11). En sus intentos se recuentan Grammar,
--     Reading y Listening con las respuestas guardadas: el puntaje, las
--     respuestas y el feedback no cambian.
--
-- Correr una vez, después de 010_subsecciones.sql y ANTES de desplegar el
-- código que la usa (aquí y en el portal). Dos pasos, como la 007: Postgres no
-- deja usar un valor nuevo de un enum en la misma transacción que lo crea, así
-- que el paso 1 se confirma solo. Con psql, el COMMIT del paso 1 avisa "there is
-- no transaction in progress": es normal. Se puede correr otra vez sin cambiar
-- nada.
-- =====================================================================

SET search_path TO evaluacion, public;            -- <<< SCHEMA

-- 1. Las categorías nuevas, confirmadas antes de usarlas.
ALTER TYPE categoria_pregunta ADD VALUE IF NOT EXISTS 'reading';
ALTER TYPE categoria_pregunta ADD VALUE IF NOT EXISTS 'listening';
COMMIT;

-- 2. Lo demás, todo o nada.
BEGIN;

ALTER TABLE intentos
    ADD COLUMN IF NOT EXISTS reading_score   SMALLINT,   -- aciertos de categoría reading
    ADD COLUMN IF NOT EXISTS listening_score SMALLINT;   -- aciertos de categoría listening

-- Igual que la de la 003, con las dos columnas nuevas al final.
CREATE OR REPLACE VIEW v_resultados AS
SELECT g.codigo AS generacion, e.slug, e.tipo, e.numero,
       i.nombre, s.email,
       i.id AS intento_id, i.numero_intento, i.estado,
       i.puntaje_total, i.grammar_score, i.writing_score,
       i.cambios_pestana, i.email_enviado, i.token,
       i.started_at, i.completed_at,
       i.reading_score, i.listening_score
FROM intentos i
JOIN evaluaciones e ON e.id = i.evaluacion_id
JOIN generaciones g ON g.id = e.generacion_id
JOIN estudiantes  s ON s.id = i.estudiante_id;

-- Las preguntas de una lectura son de Reading y las de un audio, de Listening.
UPDATE preguntas p
   SET categoria = (CASE m.tipo WHEN 'lectura' THEN 'reading' ELSE 'listening' END)::categoria_pregunta
  FROM materiales m
 WHERE m.id = p.material_id AND p.categoria = 'grammar';

-- Sus intentos, recontados con las respuestas guardadas (writing no cambia).
UPDATE intentos i
   SET grammar_score   = c.grammar,
       reading_score   = c.reading,
       listening_score = c.listening
  FROM (SELECT r.intento_id,
               count(*) FILTER (WHERE r.es_correcta AND p.categoria = 'grammar')   AS grammar,
               count(*) FILTER (WHERE r.es_correcta AND p.categoria = 'reading')   AS reading,
               count(*) FILTER (WHERE r.es_correcta AND p.categoria = 'listening') AS listening
          FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
         GROUP BY r.intento_id
        HAVING bool_or(p.categoria IN ('reading', 'listening'))) c
 WHERE c.intento_id = i.id AND i.estado <> 'en_progreso';

COMMIT;
