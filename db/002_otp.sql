-- =====================================================================
-- Speak Easy · Sistema de evaluaciones
-- 002 · Códigos de acceso (OTP) para estudiantes
--
-- El estudiante entra con su correo + un código de 6 dígitos que recibe
-- por correo (lib/auth/acceso-estudiante.ts):
--   · El código nunca se guarda: solo su HMAC-SHA256 (codigo_hash).
--   · Vence a los 10 min (expira_at), máx. 5 intentos, un solo uso (usado_at).
--   · Solo vale el último código del estudiante: pedir otro anula el anterior.
--   · ip y created_at alimentan los límites de envío (por correo y por IP).
--
-- Correr una vez, después de 001_schema.sql.
-- =====================================================================

SET search_path TO evaluacion, public;            -- <<< SCHEMA

CREATE TABLE codigos_acceso (
    id            BIGSERIAL PRIMARY KEY,
    estudiante_id INT NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    codigo_hash   TEXT NOT NULL,
    expira_at     TIMESTAMPTZ NOT NULL,
    intentos      SMALLINT NOT NULL DEFAULT 0 CHECK (intentos >= 0),
    usado_at      TIMESTAMPTZ,
    ip            INET,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Último código del estudiante y envíos recientes a su correo.
CREATE INDEX idx_codigos_acceso_estudiante ON codigos_acceso (estudiante_id, created_at DESC);
-- Envíos recientes desde una IP.
CREATE INDEX idx_codigos_acceso_ip ON codigos_acceso (ip, created_at DESC) WHERE ip IS NOT NULL;
