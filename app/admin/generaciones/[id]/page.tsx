import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { obtenerGeneracion } from "@/lib/datos/generaciones";
import { listarPorGeneracion, type EvaluacionResumen } from "@/lib/datos/evaluaciones";
import { formatearFecha } from "@/lib/fechas";
import { idUrlSchema } from "@/lib/validacion";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Cargando } from "@/app/admin/components/Cargando";
import GenerarFaltantes from "./GenerarFaltantes";
import TarjetaEvaluacion from "./TarjetaEvaluacion";

export const metadata: Metadata = { title: "Evaluaciones de la generación" };

export default function PaginaGeneracion({ params }: PageProps<"/admin/generaciones/[id]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const staff = await staffParaPagina();
  const id = idUrlSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const [generacion, evaluaciones] = await Promise.all([
    obtenerGeneracion(id.data),
    listarPorGeneracion(id.data),
  ]);
  if (!generacion) notFound();

  const mensuales = evaluaciones.filter((e) => e.tipo === "mensual");
  const trimestrales = evaluaciones.filter((e) => e.tipo === "trimestral");
  const publicadas = evaluaciones.filter((e) => e.publicada).length;

  return (
    <>
      <TituloPagina
        antes={
          <Link href="/admin" className="font-semibold text-gris-oscuro hover:text-violeta">
            ← Generaciones
          </Link>
        }
        titulo={generacion.nombre}
        subtitulo={
          <>
            <span className="font-semibold">{generacion.codigo}</span> · desde{" "}
            {formatearFecha(generacion.fecha_inicio)}
            {generacion.fecha_fin && ` hasta ${formatearFecha(generacion.fecha_fin)}`} ·{" "}
            {publicadas} de {evaluaciones.length} publicadas
          </>
        }
        acciones={
          staff.rol === "admin" && evaluaciones.length < 16 ? (
            <GenerarFaltantes generacionId={generacion.id} faltan={16 - evaluaciones.length} />
          ) : null
        }
      />

      <Seccion titulo="Mensuales" evaluaciones={mensuales} />
      <Seccion titulo="Trimestrales" evaluaciones={trimestrales} />
    </>
  );
}

function Seccion({ titulo, evaluaciones }: { titulo: string; evaluaciones: EvaluacionResumen[] }) {
  if (evaluaciones.length === 0) return null;
  return (
    <section className="mb-9">
      <h2 className="mb-3.5 text-[17px] font-bold text-tinta">
        {titulo} <span className="font-semibold text-gris">({evaluaciones.length})</span>
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {evaluaciones.map((e) => (
          <li key={e.id}>
            <TarjetaEvaluacion evaluacion={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}
