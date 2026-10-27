import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { obtenerGeneracion, resumenGeneracion } from "@/lib/datos/generaciones";
import { listarPorGeneracion, type EvaluacionResumen } from "@/lib/datos/evaluaciones";
import { formatearFecha } from "@/lib/fechas";
import { EVALUACIONES_POR_GENERACION } from "@/lib/tipos";
import { idUrlSchema } from "@/lib/validacion";
import { Aviso } from "@/app/components/ui/Aviso";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Cargando } from "@/app/admin/components/Cargando";
import EditarGeneracion from "./EditarGeneracion";
import EliminarGeneracion from "./EliminarGeneracion";
import GenerarFaltantes from "./GenerarFaltantes";
import InterruptorGeneracion from "./InterruptorGeneracion";
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

  const esAdmin = staff.rol === "admin";
  const [generacion, evaluaciones, resumen] = await Promise.all([
    obtenerGeneracion(id.data),
    listarPorGeneracion(id.data),
    // Lo que muestra la confirmación de desactivar (solo admin).
    esAdmin ? resumenGeneracion(id.data) : null,
  ]);
  if (!generacion) notFound();

  const bienvenida = evaluaciones.filter((e) => e.tipo === "bienvenida");
  const mensuales = evaluaciones.filter((e) => e.tipo === "mensual");
  const trimestrales = evaluaciones.filter((e) => e.tipo === "trimestral");
  const final = evaluaciones.filter((e) => e.tipo === "final");
  const publicadas = evaluaciones.filter((e) => e.publicada).length;
  const faltan = EVALUACIONES_POR_GENERACION - evaluaciones.length;

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
          esAdmin && resumen ? (
            <>
              {faltan > 0 && <GenerarFaltantes generacionId={generacion.id} faltan={faltan} />}
              <EditarGeneracion generacion={generacion} />
              <InterruptorGeneracion
                generacionId={generacion.id}
                nombre={generacion.nombre}
                activa={generacion.activa}
                estudiantes={resumen.estudiantes}
                enCurso={resumen.en_curso}
              />
              <EliminarGeneracion generacionId={generacion.id} />
            </>
          ) : null
        }
      />

      {!generacion.activa && (
        <Aviso className="mb-6">
          Esta generación está <strong>desactivada</strong>: sus estudiantes entran y ven su historial, pero no ven
          evaluaciones ni pueden empezar o continuar intentos.
        </Aviso>
      )}

      <Seccion titulo="Bienvenida" evaluaciones={bienvenida} />
      <Seccion titulo="Mensuales" evaluaciones={mensuales} />
      <Seccion titulo="Trimestrales" evaluaciones={trimestrales} />
      <Seccion titulo="Final" evaluaciones={final} />
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
      <ul className="grid gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {evaluaciones.map((e) => (
          <li key={e.id}>
            <TarjetaEvaluacion evaluacion={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}
