-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- 006 · Sin ManyChat
--
--   Ya no se usa ManyChat: el resultado solo sale por correo.
--   · estudiantes.manychat_id: se borra (con los ids que hubiera).
--   · intentos.whatsapp_enviado: se borra (el WhatsApp salía por ManyChat).
--     envio_error sigue: ahora es solo el último fallo del correo.
--   Ninguna vista ni función las usa.
--
-- Correr una vez, después de 005_admin.sql y DESPUÉS de desplegar el código
-- sin ManyChat (ese código ya no las lee; el anterior sí). Todo o nada.
-- =====================================================================

SET search_path TO evaluacion, public;            -- <<< SCHEMA

BEGIN;

ALTER TABLE estudiantes DROP COLUMN manychat_id;
ALTER TABLE intentos    DROP COLUMN whatsapp_enviado;

COMMIT;
