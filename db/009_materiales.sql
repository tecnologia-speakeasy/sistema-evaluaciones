-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- 009 · Lecturas y audios con varias preguntas (reading / listening)
--
--   Un "material" es una lectura (título + texto) o un audio (título + URL del
--   archivo + indicación opcional) de una evaluación. Varias preguntas pueden
--   ligarse a él: el estudiante ve la lectura o escucha el audio encima de cada
--   una (como las «Reading» y «Recording» del Placement Test).
--   · materiales: tabla nueva (ON DELETE CASCADE con la evaluación).
--   · preguntas.material_id: opcional; al borrar el material la pregunta queda
--     sin él (SET NULL). Un trigger exige que sea de la MISMA evaluación.
--   · v_preguntas_publicas: agrega material_id (al final; lo demás igual).
--   · clonar_preguntas: copia también los materiales que usan las preguntas
--     activas y liga las copias a los nuevos.
--
-- Correr una vez, después de 008_final.sql y ANTES de desplegar el código que la
-- usa (aquí y en el portal). Todo o nada; el código anterior sigue funcionando
-- con ella (no lee las columnas nuevas).
-- =====================================================================

SET search_path TO evaluacion, public;            -- <<< SCHEMA

BEGIN;

CREATE TYPE tipo_material AS ENUM ('lectura', 'audio');

CREATE TABLE materiales (
    id             SERIAL PRIMARY KEY,
    evaluacion_id  INT NOT NULL REFERENCES evaluaciones(id) ON DELETE CASCADE,
    tipo           tipo_material NOT NULL,
    titulo         TEXT NOT NULL CHECK (btrim(titulo) <> ''),   -- 'Reading 1 – A Typical Day'
    texto          TEXT,          -- lectura: el texto; audio: indicación opcional
    audio_url      TEXT,          -- audio: URL pública del archivo (Vercel Blob u otra)
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT materiales_contenido_check CHECK (
           (tipo = 'lectura' AND texto IS NOT NULL AND btrim(texto) <> '' AND audio_url IS NULL)
        -- IS NOT NULL explícito: con NULL la regex da NULL y el CHECK lo dejaría pasar.
        OR (tipo = 'audio'   AND audio_url IS NOT NULL AND audio_url ~ '^https?://')
    )
);
CREATE INDEX materiales_evaluacion_idx ON materiales (evaluacion_id);
CREATE TRIGGER trg_materiales_updated BEFORE UPDATE ON materiales
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE preguntas ADD COLUMN material_id INT REFERENCES materiales(id) ON DELETE SET NULL;
CREATE INDEX preguntas_material_idx ON preguntas (material_id);

-- El material de una pregunta tiene que ser de su misma evaluación.
CREATE FUNCTION validar_material_pregunta() RETURNS trigger AS $$
BEGIN
    IF NEW.material_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM materiales m WHERE m.id = NEW.material_id AND m.evaluacion_id = NEW.evaluacion_id
    ) THEN
        RAISE EXCEPTION 'Material: la lectura o el audio elegido no es de esta evaluación';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_material_pregunta BEFORE INSERT OR UPDATE OF material_id, evaluacion_id ON preguntas
FOR EACH ROW EXECUTE FUNCTION validar_material_pregunta();

-- Lo único que llega al navegador del estudiante, ahora con su material.
CREATE OR REPLACE VIEW v_preguntas_publicas AS
SELECT p.id, p.evaluacion_id, p.orden, p.seccion, p.tipo, p.enunciado, p.pista,
       p.opciones,
       CASE WHEN p.tipo = 'fill_blank'
            THEN jsonb_array_length(p.respuestas_aceptadas) END AS espacios,
       p.material_id
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
    INSERT INTO preguntas (evaluacion_id, orden, seccion, tipo, categoria, enunciado,
                           pista, opciones, respuestas_aceptadas, rubrica, puntaje, material_id)
    SELECT p_destino, orden, seccion, tipo, categoria, enunciado,
           pista, opciones, respuestas_aceptadas, rubrica, puntaje,
           (mapa ->> material_id::text)::int
    FROM preguntas WHERE evaluacion_id = p_origen AND activa
    ORDER BY orden;
    GET DIAGNOSTICS c = ROW_COUNT;
    RETURN c;
END $$ LANGUAGE plpgsql;

COMMIT;
