-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- 004 · IA, correo y WhatsApp del resultado (Fase 5)
--
-- Al enviar, el intento queda 'pendiente'. Fuera de cualquier transacción la
-- IA califica las abiertas y escribe el feedback ('calificando' -> 'listo');
-- después salen el correo y el WhatsApp, una sola vez cada uno.
--   · procesando_hasta: candado con vencimiento. Quien procesa un intento lo
--     toma con un UPDATE; nadie más llama a la IA por él hasta que termine o
--     venza (si el proceso murió, otro lo retoma).
--   · ia_intentos / ia_error: fallos de la IA. Al 3.º el intento pasa a
--     'error' (lo ve el staff); el reproceso automático sigue hasta 10.
--   · whatsapp_enviado / envio_error: como email_enviado, para el WhatsApp, y
--     el último fallo de correo o WhatsApp.
--
-- Los intentos 'listo' de antes (Fase 4, sin abiertas) no tienen feedback ni
-- se avisaron: se marcan como avisados para que el reproceso no les mande un
-- correo ni un WhatsApp tarde y sin retroalimentación. Los 'pendiente' (con
-- abiertas) sí los toma la IA y reciben su correo al quedar listos.
--
-- Correr una vez, después de 003_ajustes.sql. Todo o nada (transacción).
-- =====================================================================

SET search_path TO evaluacion, public;            -- <<< SCHEMA

BEGIN;

ALTER TABLE intentos
    ADD COLUMN procesando_hasta TIMESTAMPTZ,
    ADD COLUMN ia_intentos      SMALLINT NOT NULL DEFAULT 0 CHECK (ia_intentos >= 0),
    ADD COLUMN ia_error         TEXT,
    ADD COLUMN whatsapp_enviado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN envio_error      TEXT;

UPDATE intentos
   SET email_enviado = TRUE, whatsapp_enviado = TRUE
 WHERE estado = 'listo' AND feedback IS NULL;

COMMIT;
