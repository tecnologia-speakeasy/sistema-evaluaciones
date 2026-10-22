import { z } from "zod";

// Filtros y etiquetas de Resultados (Fase 6). Puro, sin BD: lo usan la página,
// los filtros del navegador y la exportación (lib/datos/resultados.ts consulta).
// Por defecto: los intentos enviados (sin los en progreso), más recientes primero.

export type EstadoIntento = "en_progreso" | "pendiente" | "calificando" | "listo" | "error";

export const ESTADOS_FILTRO = ["enviados", "listo", "pendiente", "calificando", "error", "en_progreso", "todos"] as const;
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number];

export const ETIQUETA_ESTADO_FILTRO: Record<EstadoFiltro, string> = {
  enviados: "Enviados",
  listo: "Listos",
  pendiente: "Pendientes",
  calificando: "Calificando",
  error: "Con error",
  en_progreso: "En progreso",
  todos: "Todos",
};

const ETIQUETA_ESTADO: Record<EstadoIntento, string> = {
  en_progreso: "En progreso",
  pendiente: "Pendiente",
  calificando: "Calificando",
  listo: "Listo",
  error: "Error de IA",
};
export const etiquetaEstado = (e: EstadoIntento) => ETIQUETA_ESTADO[e];

// Vive en lib/tipos.ts (sin dependencias); se reexporta para quien ya lo usa desde aquí.
export { codigoEvaluacion } from "@/lib/tipos";

const slug = z.string().trim().max(120).regex(/^[a-z0-9-]*$/);
export const filtrosSchema = z.object({
  generacion: slug.catch(""),
  evaluacion: slug.catch(""),
  estado: z.enum(ESTADOS_FILTRO).catch("enviados"),
  q: z.string().trim().max(120).catch(""),
  pagina: z.coerce.number().int().min(1).max(100_000).catch(1),
});
export type FiltrosResultados = z.infer<typeof filtrosSchema>;

// searchParams de la página o de la URL de exportación.
export function leerFiltros(params: Record<string, string | string[] | undefined> | URLSearchParams): FiltrosResultados {
  const valor = (k: string) => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    return (Array.isArray(v) ? v[0] : v) ?? undefined;
  };
  return filtrosSchema.parse({
    generacion: valor("generacion") ?? "",
    evaluacion: valor("evaluacion") ?? "",
    estado: valor("estado") ?? "enviados",
    q: valor("q") ?? "",
    pagina: valor("pagina") ?? 1,
  });
}

/** Filtros → query string (sin los valores por defecto). */
export function urlFiltros(f: Partial<FiltrosResultados>): string {
  const p = new URLSearchParams();
  if (f.generacion) p.set("generacion", f.generacion);
  if (f.evaluacion) p.set("evaluacion", f.evaluacion);
  if (f.estado && f.estado !== "enviados") p.set("estado", f.estado);
  if (f.q) p.set("q", f.q);
  if (f.pagina && f.pagina > 1) p.set("pagina", String(f.pagina));
  const s = p.toString();
  return s ? `?${s}` : "";
}
