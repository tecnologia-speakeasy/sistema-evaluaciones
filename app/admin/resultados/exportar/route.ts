import { unstable_rethrow } from "next/navigation";
import { ErrorAutorizacion, requireStaff } from "@/lib/auth/guards";
import { exportarResultados } from "@/lib/datos/resultados";
import { ZONA_HORARIA } from "@/lib/fechas";
import { leerFiltros } from "@/lib/resultados";

// Exporta a CSV lo filtrado en /admin/resultados (mismos parámetros de la URL).
// Admin y docente. Para Excel en español: separador ";", UTF-8 con BOM y horas
// de Colombia (lib/datos/resultados.ts).
export async function GET(req: Request) {
  try {
    await requireStaff();
    const f = leerFiltros(new URL(req.url).searchParams);
    const { csv } = await exportarResultados(f);
    // Fecha de hoy en Colombia (en-CA da AAAA-MM-DD). El código ya viene validado.
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date());
    const nombre = `resultados-${f.generacion || "todas"}-${hoy}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // Deja pasar lo interno de Next (p. ej. al prerenderizar en el build).
    unstable_rethrow(e);
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    console.error("[resultados/exportar]", e);
    return new Response("No pudimos exportar los resultados. Inténtalo de nuevo.", { status: 500 });
  }
}
