import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { cerrarVencidos, evaluacionParaPresentar, puedePresentar } from "@/lib/datos/intentos";
import Examen from "./Examen";

export const metadata: Metadata = { title: "Evaluación" };

// Presentar una evaluación de su generación. Solo llegan preguntas de
// v_preguntas_publicas (sin respuestas ni rúbrica: regla de seguridad 1).
export default function PaginaEvaluacion({ params }: PageProps<"/evaluacion/[slug]">) {
  return (
    <Suspense fallback={<div className="fondo-intro min-h-screen flex-1" />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) notFound();
  const estudiante = await estudianteParaPagina(`/evaluacion/${slug}`);
  await cerrarVencidos(estudiante.id);
  const datos = await evaluacionParaPresentar(slug, estudiante.id, estudiante.generacion_id);
  if (!datos) notFound();

  // Next conserva (oculta) la página ya visitada: sin esta key, al volver con
  // "Repetir evaluación" reaparecería el examen del intento anterior, ya enviado.
  // Cambia cuando hay otro intento usado o en curso → estado nuevo.
  const clave = `${datos.evaluacion.id}:${datos.evaluacion.intentos_usados}:${datos.enCurso?.id ?? 0}`;
  return (
    <Examen
      key={clave}
      evaluacion={datos.evaluacion}
      preguntas={datos.preguntas}
      materiales={datos.materiales}
      enCurso={datos.enCurso}
      puedeEmpezar={puedePresentar(datos.evaluacion)}
      nombre={estudiante.nombre}
      generacion={estudiante.generacion_nombre}
    />
  );
}
