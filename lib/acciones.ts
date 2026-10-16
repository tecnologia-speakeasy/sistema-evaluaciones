import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ErrorAutorizacion } from "@/lib/auth/guards";
import { traducirErrorBD } from "@/lib/db-errores";
import { ErrorNegocio } from "@/lib/errores";

// Resultado común de las Server Actions del dashboard.
export type ResultadoAccion = { ok: true } | { ok: false; error: string; campo?: string };

const ERROR_GENERICO =
  "Tuvimos un problema al guardar. Inténtalo de nuevo en un momento.";

// Convierte cualquier error de una action en { ok: false, error, campo? }.
// Deja pasar redirect()/notFound() de Next.
export function aResultadoError(e: unknown): ResultadoAccion {
  unstable_rethrow(e);
  if (e instanceof ErrorAutorizacion || e instanceof ErrorNegocio) {
    return { ok: false, error: e.message, campo: e instanceof ErrorNegocio ? e.campo : undefined };
  }
  if (e instanceof ZodError) return errorValidacion(e.issues);
  const traducido = traducirErrorBD(e);
  if (traducido) return { ok: false, error: traducido.mensaje, campo: traducido.campo };
  console.error("[accion]", e);
  return { ok: false, error: ERROR_GENERICO };
}

// Primer error de zod como resultado.
export function errorValidacion(issues: { message: string; path: PropertyKey[] }[]) {
  const issue = issues[0];
  return {
    ok: false as const,
    error: issue?.message ?? "Datos inválidos.",
    campo: issue?.path.length ? String(issue.path[0]) : undefined,
  };
}
