import { query, transaction, type Tx } from "@/lib/db";
import { ErrorNegocio } from "@/lib/errores";
import type { FilaValida } from "@/lib/estudiantes/importar";
import { sqlALocal } from "@/lib/fechas";

// Estudiantes (Fase 6, solo admin). Sin autorización: la hacen las Server Actions
// y la página. Nunca se borran: se desactivan. En la BD el estudiante es solo su
// correo (+ manychat_id y activo); su nombre es el que escribe al entrar y queda
// en cada intento (aquí se muestra el último que usó).

export const POR_PAGINA_ESTUDIANTES = 50;

export type EstudianteLista = {
  id: number;
  email: string;
  manychat_id: string | null;
  activo: boolean;
  /** El último nombre con el que entró (de sus intentos). */
  ultimo_nombre: string | null;
  intentos: number;
  /** Hora de Colombia "YYYY-MM-DDTHH:MM". */
  creado: string;
};

// Búsqueda con ILIKE: los comodines que escriba el usuario van literales.
export const patronBusqueda = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listarEstudiantes(
  generacionId: number,
  { q = "", pagina = 1 }: { q?: string; pagina?: number } = {},
): Promise<{ filas: EstudianteLista[]; total: number }> {
  const { rows } = await query<EstudianteLista & { total: number }>(
    `SELECT s.id, s.email::text AS email, s.manychat_id, s.activo,
            (SELECT i.nombre FROM intentos i WHERE i.estudiante_id = s.id
              ORDER BY i.started_at DESC LIMIT 1) AS ultimo_nombre,
            (SELECT count(*)::int FROM intentos i WHERE i.estudiante_id = s.id) AS intentos,
            ${sqlALocal("s.created_at")} AS creado,
            count(*) OVER ()::int AS total
       FROM estudiantes s
      WHERE s.generacion_id = $1
        AND ($2 = '' OR s.email ILIKE $3 OR s.manychat_id ILIKE $3
             OR EXISTS (SELECT 1 FROM intentos i WHERE i.estudiante_id = s.id AND i.nombre ILIKE $3))
      ORDER BY s.email
      LIMIT $4 OFFSET $5`,
    [generacionId, q, patronBusqueda(q), POR_PAGINA_ESTUDIANTES, (pagina - 1) * POR_PAGINA_ESTUDIANTES],
  );
  // Cada fila trae además el total (count OVER ()); no estorba.
  return { filas: rows, total: rows[0]?.total ?? 0 };
}

export async function cambiarActivoEstudiante(id: number, activo: boolean): Promise<void> {
  const { rowCount } = await query(`UPDATE estudiantes SET activo = $2 WHERE id = $1`, [id, activo]);
  if (!rowCount) throw new ErrorNegocio("El estudiante no existe.");
}

export async function guardarManychat(id: number, manychatId: string | null): Promise<void> {
  const { rowCount } = await query(`UPDATE estudiantes SET manychat_id = $2 WHERE id = $1`, [id, manychatId]);
  if (!rowCount) throw new ErrorNegocio("El estudiante no existe.");
}

// ---------------------------------------------------------------------------
// Importación por CSV: vista previa y confirmación (lib/estudiantes/importar.ts
// analiza el archivo; aquí se compara con la BD). Nunca borra.
//   · nuevo: se crea activo en la generación elegida.
//   · existente activo de otra generación: se mueve (sus intentos se conservan).
//   · existente de la misma generación: sin cambios, salvo el manychat_id si
//     el CSV trae uno distinto (vacío no borra el que tiene).
//   · existente inactivo: se mueve / actualiza igual, pero sigue inactivo (se
//     reactiva desde la lista).
//   · correo del staff: se rechaza (el login le daría prioridad al staff).
// ---------------------------------------------------------------------------

export type FilaExistente = FilaValida & { generacion_actual: string; manychat_actual: string | null };

export type Clasificacion = {
  nuevos: FilaValida[];
  cambianGeneracion: FilaExistente[];
  actualizanManychat: FilaExistente[];
  sinCambios: FilaExistente[];
  inactivos: FilaExistente[];
  delStaff: FilaValida[];
};

type Consultor = Pick<Tx, "query">;

async function clasificar(
  db: Consultor,
  generacionId: number,
  validas: FilaValida[],
  bloquear: boolean,
): Promise<Clasificacion> {
  const emails = validas.map((v) => v.email);
  const [{ rows: existentes }, { rows: staff }] = await Promise.all([
    db.query<{ email: string; generacion_id: number; generacion: string; activo: boolean; manychat_id: string | null }>(
      `SELECT s.email::text AS email, s.generacion_id, g.nombre AS generacion, s.activo, s.manychat_id
         FROM estudiantes s JOIN generaciones g ON g.id = s.generacion_id
        WHERE s.email = ANY($1::citext[])
        ${bloquear ? "FOR UPDATE OF s" : ""}`,
      [emails],
    ),
    db.query<{ email: string }>(`SELECT email::text AS email FROM staff WHERE email = ANY($1::citext[])`, [emails]),
  ]);
  const porEmail = new Map(existentes.map((e) => [e.email.toLowerCase(), e]));
  const delStaff = new Set(staff.map((s) => s.email.toLowerCase()));

  const c: Clasificacion = {
    nuevos: [],
    cambianGeneracion: [],
    actualizanManychat: [],
    sinCambios: [],
    inactivos: [],
    delStaff: [],
  };
  for (const v of validas) {
    if (delStaff.has(v.email)) {
      c.delStaff.push(v);
      continue;
    }
    const e = porEmail.get(v.email);
    if (!e) {
      c.nuevos.push(v);
      continue;
    }
    const fila: FilaExistente = { ...v, generacion_actual: e.generacion, manychat_actual: e.manychat_id };
    if (!e.activo) c.inactivos.push(fila);
    else if (e.generacion_id !== generacionId) c.cambianGeneracion.push(fila);
    else if (v.manychat_id && v.manychat_id !== e.manychat_id) c.actualizanManychat.push(fila);
    else c.sinCambios.push(fila);
  }
  return c;
}

async function exigirGeneracion(db: Consultor, generacionId: number, bloquear = false) {
  const { rows } = await db.query<{ nombre: string }>(
    `SELECT nombre FROM generaciones WHERE id = $1 ${bloquear ? "FOR UPDATE" : ""}`,
    [generacionId],
  );
  if (!rows[0]) throw new ErrorNegocio("La generación no existe.", "generacion");
  return rows[0];
}

export async function previsualizarImportacion(generacionId: number, validas: FilaValida[]): Promise<Clasificacion> {
  const db = { query };
  await exigirGeneracion(db, generacionId);
  return clasificar(db, generacionId, validas, false);
}

export type ResultadoImportacion = {
  creados: number;
  movidos: number;
  manychatActualizados: number;
  inactivos: number;
  sinCambios: number;
  delStaff: number;
};

// Todo o nada. Vuelve a clasificar dentro de la transacción (con las filas
// bloqueadas): lo que se guarda es lo que hay en la BD en ese momento, no lo
// que vio la vista previa. Dos importaciones a la vez se ponen en fila.
export async function importarEstudiantes(generacionId: number, validas: FilaValida[]): Promise<ResultadoImportacion> {
  if (validas.length === 0) throw new ErrorNegocio("El archivo no tiene correos válidos para importar.");
  return transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('importar-estudiantes'))`);
    await exigirGeneracion(tx, generacionId, true);
    const c = await clasificar(tx, generacionId, validas, true);

    if (c.nuevos.length) {
      await tx.query(
        `INSERT INTO estudiantes (generacion_id, email, manychat_id)
         SELECT $1, x.email, x.manychat_id
           FROM jsonb_to_recordset($2::jsonb) AS x(email text, manychat_id text)`,
        [generacionId, JSON.stringify(c.nuevos.map(({ email, manychat_id }) => ({ email, manychat_id })))],
      );
    }
    const actualizar = [...c.cambianGeneracion, ...c.actualizanManychat, ...c.inactivos];
    if (actualizar.length) {
      await tx.query(
        `UPDATE estudiantes s
            SET generacion_id = $1, manychat_id = COALESCE(x.manychat_id, s.manychat_id)
           FROM jsonb_to_recordset($2::jsonb) AS x(email text, manychat_id text)
          WHERE s.email = x.email::citext`,
        [generacionId, JSON.stringify(actualizar.map(({ email, manychat_id }) => ({ email, manychat_id })))],
      );
    }
    return {
      creados: c.nuevos.length,
      movidos: c.cambianGeneracion.length,
      manychatActualizados: c.actualizanManychat.length,
      inactivos: c.inactivos.length,
      sinCambios: c.sinCambios.length,
      delStaff: c.delStaff.length,
    };
  });
}
