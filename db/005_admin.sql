-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- 005 · Administración (Fase 6)
--
--   · staff.debe_cambiar_password: entró (o le restablecieron la contraseña)
--     con una contraseña temporal; hasta cambiarla no puede usar el panel.
--   · staff.sesion_version: viaja en la cookie de sesión. Restablecer la
--     contraseña (o cambiarla) la incrementa y así cierra las sesiones abiertas
--     de esa persona. Las sesiones de antes de esta migración valen como 0.
--   · validar_intento: además rechaza intentos nuevos si la generación está
--     desactivada (sus estudiantes no ven evaluaciones; ver CLAUDE.md).
--
-- Correr una vez, después de 004_ia.sql. Todo o nada (transacción).
-- =====================================================================

SET search_path TO evaluacion, public;            -- <<< SCHEMA

BEGIN;

ALTER TABLE staff
    ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN sesion_version        INT     NOT NULL DEFAULT 0 CHECK (sesion_version >= 0);

CREATE OR REPLACE FUNCTION validar_intento() RETURNS trigger AS $$
DECLARE ev evaluaciones%ROWTYPE; previos INT;
BEGIN
    SELECT * INTO ev FROM evaluaciones WHERE id = NEW.evaluacion_id;

    IF NOT ev.publicada THEN
        RAISE EXCEPTION 'La evaluación % no está publicada', ev.slug;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM generaciones WHERE id = ev.generacion_id AND activa) THEN
        RAISE EXCEPTION 'La generación de la evaluación % está desactivada', ev.slug;
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

COMMIT;
