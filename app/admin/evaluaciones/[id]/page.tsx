import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { candidatasParaClonar, obtenerEvaluacion } from "@/lib/datos/evaluaciones";
import { listarPreguntas } from "@/lib/datos/preguntas";
import { abiertasActivas } from "@/lib/preguntas/abiertas";
import { idUrlSchema } from "@/lib/validacion";
import { Aviso } from "@/app/components/ui/Aviso";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { InsigniaEstado } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { Cargando } from "@/app/admin/components/Cargando";
import { FormConfigEvaluacion } from "@/app/admin/components/FormConfigEvaluacion";
import { InterruptorPublicar } from "@/app/admin/components/InterruptorPublicar";
import EditorPreguntas from "./EditorPreguntas";

export const metadata: Metadata = { title: "Editar evaluación" };

export default function PaginaEvaluacion({ params }: PageProps<"/admin/evaluaciones/[id]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await staffParaPagina();
  const id = idUrlSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const [evaluacion, preguntas] = await Promise.all([
    obtenerEvaluacion(id.data),
    listarPreguntas(id.data),
  ]);
  if (!evaluacion) notFound();
  // Clonar solo se ofrece si no tiene ninguna pregunta (lo exige clonar_preguntas).
  const candidatas = preguntas.length === 0 ? await candidatasParaClonar(id.data) : [];

  return (
    <>
      <TituloPagina
        antes={
          <Link
            href={`/admin/generaciones/${evaluacion.generacion_id}`}
            className="font-semibold text-gris-oscuro hover:text-violeta"
          >
            ← {evaluacion.generacion_nombre}
          </Link>
        }
        titulo={evaluacion.titulo}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <InsigniaEstado estado={evaluacion.estado} />
            <span className="text-sm break-all text-gris-oscuro">{evaluacion.slug}</span>
          </span>
        }
        acciones={
          <>
            <BotonEnlace
              href={`/admin/evaluaciones/${evaluacion.id}/vista-previa`}
              variante="secundario"
            >
              Vista previa
            </BotonEnlace>
            <InterruptorPublicar
              evaluacionId={evaluacion.id}
              titulo={evaluacion.titulo}
              publicada={evaluacion.publicada}
              conEtiqueta
            />
          </>
        }
      />

      {evaluacion.publicada && (
        <Aviso className="mb-6">
          Esta evaluación está <strong>publicada</strong>: los estudiantes ven los cambios de
          inmediato. Las preguntas que ya tienen respuestas solo admiten agregar respuestas
          aceptadas.
        </Aviso>
      )}

      <Tarjeta className="mb-8" relleno="p-0">
        <details>
          <summary className="cursor-pointer px-5 py-4 text-[15px] font-bold text-tinta md:px-[22px]">
            Configuración: título, fechas, duración e intentos
          </summary>
          <div className="border-t border-borde-suave px-5 py-5 md:px-[22px]">
            <FormConfigEvaluacion evaluacionId={evaluacion.id} inicial={evaluacion} />
          </div>
        </details>
      </Tarjeta>

      <EditorPreguntas
        evaluacionId={evaluacion.id}
        preguntas={preguntas}
        candidatasClonar={candidatas}
        abiertasActivas={abiertasActivas()}
      />
    </>
  );
}
