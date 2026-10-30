-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- 010 · Subsecciones dentro de una sección (Part 1 → Section A, B, C, D)
--
--   Como el Placement Test: la «Part 1 – Grammar & Vocabulary» se divide en
--   «Section A», «Section B»… Es opcional y solo un rótulo: la numeración y el
--   contador siguen siendo los de la sección.
--   · preguntas.subseccion: texto opcional; solo con sección (CHECK).
--   · v_preguntas_publicas: agrega subseccion (al final; lo demás igual).
--   · clonar_preguntas: copia también la subsección (lo demás como en la 009).
--
-- Correr una vez, después de 009_materiales.sql y ANTES de desplegar el código
-- que la usa (aquí y en el portal). Todo o nada; se puede correr otra vez sin
-- cambiar nada. El código anterior sigue funcionando con ella.
-- =====================================================================

SET search_path TO evaluacion, public;            -- <<< SCHEMA

BEGIN;

ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS subseccion TEXT   -- 'Section A'
    CONSTRAINT preguntas_subseccion_check
    CHECK (subseccion IS NULL OR (btrim(subseccion) <> '' AND seccion IS NOT NULL));

-- Lo único que llega al navegador del estudiante, ahora con su subsección.
CREATE OR REPLACE VIEW v_preguntas_publicas AS
SELECT p.id, p.evaluacion_id, p.orden, p.seccion, p.tipo, p.enunciado, p.pista,
       p.opciones,
       CASE WHEN p.tipo = 'fill_blank'
            THEN jsonb_array_length(p.respuestas_aceptadas) END AS espacios,
       p.material_id,
       p.subseccion
FROM preguntas p
WHERE p.activa
ORDER BY p.evaluacion_id, p.orden;

-- Copia las preguntas activas (y los materiales que usan) a una evaluación vacía.
CREATE OR REPLACE FUNCTION clonar_preguntas(p_origen INT, p_destino INT) RETURNS INT AS $$
DECLARE c INT; m materiales%ROWTYPE; nuevo INT; mapa JSONB := '{}';
BEGIN
    IF EXISTS (SELECT 1 FROM preguntas WHERE evaluacion_id = p_destino) THEN
        RAISE EXCEPTION 'La evaluación destino ya tiene preguntas';
    END IF;
    FOR m IN SELECT * FROM materiales
              WHERE evaluacion_id = p_origen
                AND id IN (SELECT material_id FROM preguntas WHERE evaluacion_id = p_origen AND activa)
              ORDER BY id LOOP
        INSERT INTO materiales (evaluacion_id, tipo, titulo, texto, audio_url)
        VALUES (p_destino, m.tipo, m.titulo, m.texto, m.audio_url)
        RETURNING id INTO nuevo;
        mapa := mapa || jsonb_build_object(m.id::text, nuevo);
    END LOOP;
    INSERT INTO preguntas (evaluacion_id, orden, seccion, subseccion, tipo, categoria, enunciado,
                           pista, opciones, respuestas_aceptadas, rubrica, puntaje, material_id)
    SELECT p_destino, orden, seccion, subseccion, tipo, categoria, enunciado,
           pista, opciones, respuestas_aceptadas, rubrica, puntaje,
           (mapa ->> material_id::text)::int
    FROM preguntas WHERE evaluacion_id = p_origen AND activa
    ORDER BY orden;
    GET DIAGNOSTICS c = ROW_COUNT;
    RETURN c;
END $$ LANGUAGE plpgsql;

COMMIT;
