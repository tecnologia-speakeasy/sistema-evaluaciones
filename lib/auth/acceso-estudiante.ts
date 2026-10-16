import "server-only";
import { query, transaction, type Tx } from "@/lib/db";
import { correoCodigo } from "@/lib/email/correo-codigo";
import { enviarCorreo, smtpConfigurado } from "@/lib/email/enviar";
import { codigoCoincide, generarCodigo, hashCodigo, limitesEnvio } from "./codigo";
import { ESPERA_REENVIO_S, MAX_INTENTOS_CODIGO, VIGENCIA_CODIGO_MIN } from "./codigo-compartido";

// Acceso de un estudiante con código (Fase 3, solo si OTP_ACTIVO=true; ver
// otpActivo()): correo → código de 6 dígitos por correo → sesión. Sin OTP entra
// con correo + nombre (/api/auth/estudiante-login).
// La tabla es codigos_acceso (db/002_otp.sql):
//   · Solo vale el último código del estudiante; pedir otro anula el anterior.
//   · Vence a los 10 min, máx. 5 intentos, un solo uso.
//   · Entre dos envíos al mismo correo hay al menos 60 s; además hay un tope de
//     envíos por correo y por IP en una ventana de tiempo (ver limitesEnvio()).

export type EstudianteAcceso = { id: number; email: string };

export type InicioAcceso =
  /** reenviarEn: segundos hasta poder pedir otro. nuevo: false = ya se había
   *  enviado uno hace menos de 60 s y no se mandó otro. */
  | { paso: "codigo_enviado"; reenviarEn: number; nuevo: boolean }
  | { paso: "limite"; motivo: "correo" | "ip"; reenviarEn: number };

/** El correo no salió (SMTP caído o sin configurar en producción). */
export class ErrorEnvioCodigo extends Error {}

export async function iniciarAccesoEstudiante(
  estudiante: EstudianteAcceso,
  ip: string | null,
): Promise<InicioAcceso> {
  const limites = limitesEnvio();
  const codigo = generarCodigo();

  // Transacción corta: decide si se envía y guarda el hash. El correo se manda
  // después, fuera de la transacción (lib/db.ts: nada lento con la conexión abierta).
  const reserva = await transaction(async (tx): Promise<InicioAcceso | { codigoId: string }> => {
    // Un envío a la vez por estudiante: dos clics seguidos no mandan dos correos.
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('codigos_acceso'), $1)`, [estudiante.id]);

    // Los códigos de más de un día ya no sirven ni cuentan para los límites.
    await tx.query(
      `DELETE FROM codigos_acceso WHERE estudiante_id = $1 AND created_at < now() - interval '1 day'`,
      [estudiante.id],
    );

    // Hace menos de 60 s que se envió uno que sigue sin usar: no se reenvía.
    // (Recargar la página y volver a escribir el correo no manda otro.)
    const { rows: ultimo } = await tx.query<{ espera: number }>(
      `SELECT CASE WHEN usado_at IS NULL
                   THEN ceil(extract(epoch FROM created_at + make_interval(secs => $2) - now()))::int
                   ELSE 0 END AS espera
         FROM codigos_acceso
        WHERE estudiante_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [estudiante.id, ESPERA_REENVIO_S],
    );
    if ((ultimo[0]?.espera ?? 0) > 0) {
      return { paso: "codigo_enviado", reenviarEn: ultimo[0].espera, nuevo: false };
    }

    const esperaCorreo = await esperaPorLimite(tx, "estudiante_id", estudiante.id, limites.porCorreo, limites.ventanaMin);
    if (esperaCorreo > 0) return { paso: "limite", motivo: "correo", reenviarEn: esperaCorreo };
    // El de IP es aproximado con envíos simultáneos de varios estudiantes desde
    // la misma red (el bloqueo es por estudiante); basta para frenar un script.
    if (ip) {
      const esperaIp = await esperaPorLimite(tx, "ip", ip, limites.porIp, limites.ventanaMin);
      if (esperaIp > 0) return { paso: "limite", motivo: "ip", reenviarEn: esperaIp };
    }

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO codigos_acceso (estudiante_id, codigo_hash, expira_at, ip)
       VALUES ($1, $2, now() + make_interval(mins => $3), $4)
       RETURNING id`,
      [estudiante.id, hashCodigo(estudiante.id, codigo), VIGENCIA_CODIGO_MIN, ip],
    );
    return { codigoId: rows[0].id };
  });

  if (!("codigoId" in reserva)) return reserva;

  try {
    await entregarCodigo(estudiante, codigo);
  } catch (e) {
    // No salió: se borra para que no cuente en los límites y siga valiendo el anterior.
    await query(`DELETE FROM codigos_acceso WHERE id = $1`, [reserva.codigoId]).catch(() => {});
    throw new ErrorEnvioCodigo("No se pudo enviar el código de acceso", { cause: e });
  }
  return { paso: "codigo_enviado", reenviarEn: ESPERA_REENVIO_S, nuevo: true };
}

// Si ya hay `maximo` envíos en la ventana, segundos hasta que el más antiguo de
// ellos salga de la ventana; si no, 0.
async function esperaPorLimite(
  tx: Tx,
  columna: "estudiante_id" | "ip",
  valor: number | string,
  maximo: number,
  ventanaMin: number,
): Promise<number> {
  const { rows } = await tx.query<{ espera: number }>(
    `SELECT ceil(extract(epoch FROM created_at + make_interval(mins => $3) - now()))::int AS espera
       FROM codigos_acceso
      WHERE ${columna} = $1 AND created_at > now() - make_interval(mins => $3)
      ORDER BY created_at DESC
      OFFSET $2 LIMIT 1`,
    [valor, maximo - 1, ventanaMin],
  );
  return Math.max(rows[0]?.espera ?? 0, 0);
}

async function entregarCodigo(estudiante: EstudianteAcceso, codigo: string): Promise<void> {
  if (!smtpConfigurado()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP no configurado (faltan SMTP_HOST/SMTP_USER/SMTP_PASS)");
    }
    // Solo en desarrollo y sin SMTP. En producción el código nunca va a los logs.
    console.info(
      `[codigo-acceso] SMTP no configurado (desarrollo): código para ${estudiante.email}: ${codigo}`,
    );
    return;
  }
  await enviarCorreo(estudiante.email, correoCodigo(codigo));
}

export type MotivoRechazo = "incorrecto" | "sin_intentos" | "vencido" | "usado" | "sin_codigo";

export type Verificacion =
  | { ok: true; estudianteId: number }
  | { ok: false; motivo: MotivoRechazo; intentosRestantes?: number };

export async function verificarCodigoEstudiante(email: string, codigo: string): Promise<Verificacion> {
  return transaction(async (tx): Promise<Verificacion> => {
    const { rows: estudiantes } = await tx.query<{ id: number }>(
      `SELECT id FROM estudiantes WHERE email = $1 AND activo`,
      [email],
    );
    const estudiante = estudiantes[0];
    if (!estudiante) return { ok: false, motivo: "sin_codigo" };

    // FOR UPDATE: intentos simultáneos se cuentan de a uno (nunca pasan de 5).
    const { rows: codigos } = await tx.query<{
      id: string;
      codigo_hash: string;
      intentos: number;
      usado: boolean;
      vencido: boolean;
    }>(
      `SELECT id, codigo_hash, intentos, usado_at IS NOT NULL AS usado, expira_at <= now() AS vencido
         FROM codigos_acceso
        WHERE estudiante_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1
          FOR UPDATE`,
      [estudiante.id],
    );
    const c = codigos[0];
    if (!c) return { ok: false, motivo: "sin_codigo" };
    if (c.usado) return { ok: false, motivo: "usado" };
    if (c.vencido) return { ok: false, motivo: "vencido" };
    if (c.intentos >= MAX_INTENTOS_CODIGO) return { ok: false, motivo: "sin_intentos" };

    if (!codigoCoincide(estudiante.id, codigo, c.codigo_hash)) {
      const { rows } = await tx.query<{ intentos: number }>(
        `UPDATE codigos_acceso SET intentos = intentos + 1 WHERE id = $1 RETURNING intentos`,
        [c.id],
      );
      const restantes = MAX_INTENTOS_CODIGO - rows[0].intentos;
      return restantes > 0
        ? { ok: false, motivo: "incorrecto", intentosRestantes: restantes }
        : { ok: false, motivo: "sin_intentos" };
    }

    await tx.query(`UPDATE codigos_acceso SET usado_at = now() WHERE id = $1`, [c.id]);
    return { ok: true, estudianteId: estudiante.id };
  });
}

const PIDE_OTRO = "Pide uno nuevo con «Reenviar código».";

export function mensajeRechazo(r: { motivo: MotivoRechazo; intentosRestantes?: number }): string {
  switch (r.motivo) {
    case "incorrecto":
      return r.intentosRestantes === 1
        ? "El código no es correcto. Te queda 1 intento."
        : `El código no es correcto. Te quedan ${r.intentosRestantes} intentos.`;
    case "sin_intentos":
      return `Demasiados intentos con este código. ${PIDE_OTRO}`;
    case "vencido":
      return `El código venció (dura ${VIGENCIA_CODIGO_MIN} minutos). ${PIDE_OTRO}`;
    case "usado":
      return `Este código ya se usó. ${PIDE_OTRO}`;
    case "sin_codigo":
      return `No hay un código vigente para este correo. ${PIDE_OTRO}`;
  }
}

export function mensajeLimite(motivo: "correo" | "ip"): string {
  const { porCorreo, ventanaMin } = limitesEnvio();
  return motivo === "correo"
    ? `Ya pediste ${porCorreo} códigos en los últimos ${ventanaMin} minutos. Usa el último que te llegó o espera para pedir otro.`
    : "Se pidieron muchos códigos desde esta red. Espera un momento para pedir otro.";
}
