import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Encabezado } from "@/app/components/ui/Encabezado";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { detalleIntento } from "@/lib/datos/intentos";
import RevisionIntento from "./RevisionIntento";

export const metadata: Metadata = { title: "Tus respuestas" };

// Revisión de un intento: la pantalla del examen de solo lectura y marcada, como
// en a2 (RevisionIntento). La respuesta correcta solo viene si la evaluación
// tiene mostrar_correctas y ya no le quedan intentos o la evaluación cerró (la
// decide detalleIntento(); nunca llega al navegador de otra forma).
export default function PaginaRespuestas({ params }: PageProps<"/evaluacion/[slug]/intentos/[numero]/respuestas">) {
  return (
    <Suspense
      fallback={
        <div className="fondo-pagina flex min-h-screen flex-1 flex-col">
          <Encabezado />
        </div>
      }
    >
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ slug: string; numero: string }> }) {
  const { slug, numero } = await params;
  const n = Number(numero);
  if (!/^[a-z0-9-]{1,100}$/.test(slug) || !Number.isInteger(n) || n < 1) notFound();
  const estudiante = await estudianteParaPagina(`/evaluacion/${slug}/intentos/${n}/respuestas`);
  const d = await detalleIntento(slug, n, estudiante.id);
  if (!d) notFound();

  const base = `/evaluacion/${d.evaluacion.slug}`;
  const avisoCorrectas =
    d.evaluacion.mostrar_correctas && !d.correctasVisibles
      ? d.evaluacion.intentos_permitidos !== null
        ? "Las respuestas correctas se mostrarán cuando termines tus intentos."
        : "Las respuestas correctas se mostrarán cuando cierre la evaluación."
      : null;

  return (
    <RevisionIntento
      // Solo lo que se pinta (sin el token ni el feedback del intento).
      preguntas={d.preguntas.map((p) => ({
        id: p.id,
        seccion: p.seccion,
        tipo: p.tipo,
        enunciado: p.enunciado,
        pista: p.pista,
        opciones: p.opciones,
        respuesta: p.respuesta,
        es_correcta: p.es_correcta,
        correcta: p.correcta,
        nota: p.nota,
        comentario: p.comentario,
      }))}
      nombre={estudiante.nombre}
      generacion={estudiante.generacion_nombre}
      titulo={d.evaluacion.titulo}
      numero={d.numero}
      resultado={`${base}/intentos/${d.numero}`}
      repetir={d.puedeRepetir ? { href: base, texto: d.enCurso ? "Continuar intento" : "Repetir evaluación" } : null}
      avisoCorrectas={avisoCorrectas}
    />
  );
}
