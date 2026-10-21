-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- 007 · Evaluación de bienvenida
--
--   Cada generación tiene ahora 17 evaluaciones: 1 de bienvenida + 12
--   mensuales + 4 trimestrales. La de bienvenida funciona igual que las demás
--   (preguntas, puntaje, IA y correo); solo es otro tipo, el primero en orden.
--   · tipo_evaluacion: nuevo valor 'bienvenida', ANTES de 'mensual' (así
--     ORDER BY tipo la pone primero sin tocar ninguna consulta).
--   · evaluaciones_check: bienvenida solo con numero = 1.
--   · generar_evaluaciones: crea también la de bienvenida (slug <codigo>-bienvenida).
--   · Generaciones que ya existen: se les crea su bienvenida (sin publicar y
--     sin preguntas). Las demás evaluaciones no se tocan.
--
-- Correr una vez, después de 006_sin_manychat.sql y ANTES de desplegar el
-- código que la usa. Dos pasos: Postgres no deja usar un valor nuevo de un enum
-- en la misma transacción que lo crea, así que el paso 1 se confirma solo. Si el
-- paso 2 falla, se puede correr el archivo otra vez (el paso 1 no repite nada).
-- Con psql, el COMMIT del paso 1 avisa "there is no transaction in progress":
-- es normal.
-- =====================================================================

SET search_path TO evaluacion, public;            -- <<< SCHEMA

-- 1. El tipo nuevo, confirmado antes de usarlo.
ALTER TYPE tipo_evaluacion ADD VALUE IF NOT EXISTS 'bienvenida' BEFORE 'mensual';
COMMIT;

-- 2. Lo demás, todo o nada.
BEGIN;

ALTER TABLE evaluaciones DROP CONSTRAINT evaluaciones_check;
ALTER TABLE evaluaciones ADD CONSTRAINT evaluaciones_check
    CHECK ( (tipo = 'bienvenida' AND numero = 1)
         OR (tipo = 'mensual'    AND numero BETWEEN 1 AND 12)
         OR (tipo = 'trimestral' AND numero BETWEEN 1 AND 4) );

-- Crea las 17 evaluaciones (sin publicar) de una generación. Idempotente.
CREATE OR REPLACE FUNCTION generar_evaluaciones(p_generacion INT, p_staff INT DEFAULT NULL)
RETURNS INT AS $$
DECLARE g generaciones%ROWTYPE; n INT; creadas INT := 0; c INT;
BEGIN
    SELECT * INTO g FROM generaciones WHERE id = p_generacion;
    IF NOT FOUND THEN RAISE EXCEPTION 'Generación % no existe', p_generacion; END IF;
    INSERT INTO evaluaciones (generacion_id, slug, titulo, tipo, numero, creado_por)
    VALUES (g.id, g.codigo || '-bienvenida', 'Evaluación de bienvenida', 'bienvenida', 1, p_staff)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS c = ROW_COUNT; creadas := creadas + c;
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

-- La bienvenida de las generaciones que ya existen (solo esa).
INSERT INTO evaluaciones (generacion_id, slug, titulo, tipo, numero)
SELECT g.id, g.codigo || '-bienvenida', 'Evaluación de bienvenida', 'bienvenida', 1
  FROM generaciones g
ON CONFLICT DO NOTHING;

COMMIT;
