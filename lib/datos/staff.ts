import { query, transaction, type Tx } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import { generarPasswordTemporal, hashPassword, MIN_PASSWORD, verifyPassword } from "@/lib/auth/password";
import type { RolStaff } from "@/lib/auth/token";
import { sqlALocal } from "@/lib/fechas";

// Staff (Fase 6, solo admin). Sin autorización: la hacen las Server Actions.
// Reglas (CLAUDE.md):
//   · Nadie se quita el rol de admin ni se desactiva a sí mismo.
//   · Siempre queda al menos un admin activo. Se revisa dentro de una
//     transacción que bloquea a los admins activos: dos admins que se quitan el
//     rol el uno al otro a la vez no pueden dejar cero.
//   · La contraseña temporal (crear / restablecer) se genera aquí, se devuelve
//     una sola vez y obliga a cambiarla al entrar. Restablecer cierra las
//     sesiones abiertas (sesion_version + 1).

export type MiembroStaff = {
  id: number;
  email: string;
  nombre: string;
  rol: RolStaff;
  activo: boolean;
  debe_cambiar_password: boolean;
  /** Hora de Colombia "YYYY-MM-DDTHH:MM" o null si nunca entró. */
  ultimo_login: string | null;
};

export async function listarStaff(): Promise<MiembroStaff[]> {
  const { rows } = await query<MiembroStaff>(
    `SELECT id, email::text AS email, nombre, rol, activo, debe_cambiar_password,
            ${sqlALocal("ultimo_login")} AS ultimo_login
       FROM staff
      ORDER BY activo DESC, rol, nombre`,
  );
  return rows;
}

export async function crearStaff(datos: {
  email: string;
  nombre: string;
  rol: RolStaff;
}): Promise<{ id: number; password: string }> {
  const password = generarPasswordTemporal();
  const hash = await hashPassword(password);
  const id = await transaction(async (tx) => {
    const { rowCount } = await tx.query(`SELECT 1 FROM estudiantes WHERE email = $1`, [datos.email]);
    if (rowCount) {
      throw new ErrorNegocio("Ese correo es de un estudiante: usa otro para el staff.", "email");
    }
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO staff (email, nombre, rol, password_hash, debe_cambiar_password)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [datos.email, datos.nombre, datos.rol, hash],
    );
    return rows[0].id;
  });
  return { id, password };
}

// Bloquea a los admins activos y comprueba que quien actúa sigue siéndolo.
async function adminsBloqueados(tx: Tx, actorId: number): Promise<number[]> {
  const { rows } = await tx.query<{ id: number }>(
    `SELECT id FROM staff WHERE rol = 'admin' AND activo ORDER BY id FOR UPDATE`,
  );
  const ids = rows.map((r) => r.id);
  if (!ids.includes(actorId)) throw new ErrorNegocio("Ya no eres administrador activo.");
  return ids;
}

async function objetivo(tx: Tx, id: number) {
  const { rows } = await tx.query<{ rol: RolStaff; activo: boolean }>(
    `SELECT rol, activo FROM staff WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!rows[0]) throw new ErrorNegocio("Ese miembro del staff no existe.");
  return rows[0];
}

const ULTIMO_ADMIN = "Debe quedar al menos un administrador activo.";

export async function cambiarRolStaff(actorId: number, id: number, rol: RolStaff): Promise<void> {
  if (actorId === id) throw new ErrorNegocio("No puedes cambiar tu propio rol.");
  await transaction(async (tx) => {
    const admins = await adminsBloqueados(tx, actorId);
    const o = await objetivo(tx, id);
    if (o.rol === "admin" && rol !== "admin" && o.activo && admins.length <= 1) throw new ErrorNegocio(ULTIMO_ADMIN);
    await tx.query(`UPDATE staff SET rol = $2 WHERE id = $1`, [id, rol]);
  });
}

export async function cambiarActivoStaff(actorId: number, id: number, activo: boolean): Promise<void> {
  if (actorId === id && !activo) throw new ErrorNegocio("No puedes desactivarte a ti mismo.");
  await transaction(async (tx) => {
    const admins = await adminsBloqueados(tx, actorId);
    const o = await objetivo(tx, id);
    if (!activo && o.rol === "admin" && o.activo && admins.length <= 1) throw new ErrorNegocio(ULTIMO_ADMIN);
    await tx.query(`UPDATE staff SET activo = $2 WHERE id = $1`, [id, activo]);
  });
}

// Nueva contraseña temporal para otro miembro; cierra sus sesiones abiertas.
export async function restablecerPasswordStaff(actorId: number, id: number): Promise<string> {
  if (actorId === id) {
    throw new ErrorNegocio("Para tu propia contraseña usa «Cambiar mi contraseña» en el menú de tu cuenta.");
  }
  const password = generarPasswordTemporal();
  const hash = await hashPassword(password);
  await transaction(async (tx) => {
    await adminsBloqueados(tx, actorId);
    await objetivo(tx, id);
    await tx.query(
      `UPDATE staff
          SET password_hash = $2, debe_cambiar_password = TRUE, sesion_version = sesion_version + 1
        WHERE id = $1`,
      [id, hash],
    );
  });
  return password;
}

// "Cambiar mi contraseña" (y el cambio obligatorio de la temporal). Cierra las
// otras sesiones: devuelve la nueva versión para renovar la cookie de esta.
export async function cambiarMiPassword(
  id: number,
  actual: string,
  nueva: string,
): Promise<{ rol: RolStaff; sesion_version: number }> {
  if (nueva.length < MIN_PASSWORD) {
    throw new ErrorNegocio(`La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`, "nueva");
  }
  if (nueva === actual) throw new ErrorNegocio("La nueva contraseña debe ser distinta de la actual.", "nueva");
  const { rows } = await query<{ password_hash: string }>(`SELECT password_hash FROM staff WHERE id = $1 AND activo`, [
    id,
  ]);
  if (!rows[0] || !(await verifyPassword(actual, rows[0].password_hash))) {
    throw new ErrorNegocio("La contraseña actual no es correcta.", "actual");
  }
  const hash = await hashPassword(nueva);
  const { rows: r } = await query<{ rol: RolStaff; sesion_version: number }>(
    `UPDATE staff
        SET password_hash = $2, debe_cambiar_password = FALSE, sesion_version = sesion_version + 1
      WHERE id = $1 AND activo
      RETURNING rol, sesion_version`,
    [id, hash],
  );
  if (!r[0]) throw new ErrorNegocio("Tu cuenta ya no está activa.");
  return r[0];
}
