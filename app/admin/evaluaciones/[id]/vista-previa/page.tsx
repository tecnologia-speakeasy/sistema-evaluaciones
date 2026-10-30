import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { obtenerEvaluacion } from "@/lib/datos/evaluaciones";
import { materialesDe } from "@/lib/datos/materiales";
import { listarPublicas } from "@/lib/datos/preguntas";
import { idUrlSchema } from "@/lib/validacion";
import { Cargando } from "@/app/admin/components/Cargando";
import VistaPrevia from "./VistaPrevia";

export const metadata: Metadata = { title: "Vista previa" };

export default function PaginaVistaPrevia({
  params,
}: PageProps<"/admin/evaluaciones/[id]/vista-previa">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

// Lee de v_preguntas_publicas: exactamente lo que recibirá el estudiante.
async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await staffParaPagina();
  const id = idUrlSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const [evaluacion, preguntas] = await Promise.all([
    obtenerEvaluacion(id.data),
    listarPublicas(id.data),
  ]);
  if (!evaluacion) notFound();

  return (
    <VistaPrevia
      preguntas={preguntas}
      materiales={await materialesDe(preguntas)}
      duracionMin={evaluacion.duracion_min}
      volverA={`/admin/evaluaciones/${evaluacion.id}`}
    />
  );
}
