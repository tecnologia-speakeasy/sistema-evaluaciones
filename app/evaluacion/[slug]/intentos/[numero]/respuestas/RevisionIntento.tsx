"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarraProgreso } from "@/app/components/examen/BarraProgreso";
import { PasosSeccion } from "@/app/components/examen/PasosSeccion";
import { PreguntaRevision, type PreguntaRevisada } from "@/app/components/preguntas/PreguntaRevision";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { Encabezado } from "@/app/components/ui/Encabezado";
import { posicionesPorSeccion } from "@/lib/preguntas/tipos";

// Revisión de un intento como en ../evaluacion-a2: la MISMA pantalla del examen
// (barra, una pregunta a la vez, pasos de la sección, Anterior / Siguiente), de
// solo lectura y marcada. Arriba, como en a2: "Ver calificación", "Repetir
// evaluación" y "Cerrar". Se puede ir a cualquier pregunta.
export default function RevisionIntento({
  preguntas,
  nombre,
  generacion,
  titulo,
  numero,
  resultado,
  repetir,
  avisoCorrectas,
}: {
  preguntas: PreguntaRevisada[];
  nombre: string;
  generacion: string;
  titulo: string;
  numero: number;
  /** Página del resultado del intento ("Ver calificación"). */
  resultado: string;
  repetir: { href: string; texto: string } | null;
  /** "Las respuestas correctas se mostrarán cuando…" (o null). */
  avisoCorrectas: string | null;
}) {
  const [indice, setIndice] = useState(0);
  const posiciones = useMemo(() => posicionesPorSeccion(preguntas), [preguntas]);
  const total = preguntas.length;
  const pregunta = preguntas[indice];
  const posicion = posiciones[indice];
  const ultima = indice >= total - 1;
  const ir = (i: number) => {
    setIndice(i);
    window.scrollTo({ top: 0 });
  };

  const siguienteClases =
    "cursor-pointer rounded-[10px] bg-rosa px-[26px] py-[11px] text-sm font-semibold text-white transition-colors hover:bg-rosa-hover";

  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Encabezado nombre={nombre} detalle={generacion}>
        <BotonEnlace href={resultado} variante="barraActivo" tamano="barra" className="max-sm:hidden">
          Ver calificación
        </BotonEnlace>
        {repetir && (
          <BotonEnlace href={repetir.href} variante="barraActivo" tamano="barra" className="max-sm:hidden">
            {repetir.texto}
          </BotonEnlace>
        )}
        <BotonEnlace href="/" variante="barra" tamano="barra">
          Cerrar
        </BotonEnlace>
      </Encabezado>

      <div className="mx-auto flex w-full max-w-[1180px] flex-1 items-start px-[18px] pt-[18px] pb-10 md:gap-7 md:px-7 md:pt-[34px] md:pb-12">
        <main className="min-w-0 flex-1">
          <h1 className="mb-3 text-sm font-semibold text-gris">
            Tus respuestas · {titulo} · Intento {numero}
          </h1>
          {total === 0 ? (
            <p className="text-[15px] text-gris-oscuro">Este intento no tiene respuestas para revisar.</p>
          ) : (
            <>
              <BarraProgreso actual={indice + 1} total={total} contador={`${posicion.numero}/${posicion.largo}`} />
              {avisoCorrectas && (
                <p className="mb-5 rounded-xl border border-borde-suave bg-lavanda px-4 py-2.5 text-sm text-gris-oscuro">
                  {avisoCorrectas}
                </p>
              )}
              <PreguntaRevision key={pregunta.id} pregunta={pregunta} numero={posicion.numero} />

              <div className="mt-9 flex justify-between gap-3">
                <button
                  type="button"
                  onClick={() => ir(Math.max(0, indice - 1))}
                  disabled={indice === 0}
                  className="cursor-pointer rounded-[10px] border-[1.5px] border-rosa bg-white px-[22px] py-[11px] text-sm font-semibold text-rosa disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Anterior
                </button>
                {ultima ? (
                  <Link href={resultado} className={siguienteClases}>
                    Ver calificación →
                  </Link>
                ) : (
                  <button type="button" onClick={() => ir(indice + 1)} className={siguienteClases}>
                    Siguiente →
                  </button>
                )}
              </div>
            </>
          )}

          {/* Celular: lo que en escritorio va en la barra superior. */}
          <div className="mt-8 flex flex-col gap-3 sm:hidden">
            <BotonEnlace href={resultado} variante="secundario" ancho className="text-center">
              Ver calificación
            </BotonEnlace>
            {repetir && (
              <BotonEnlace href={repetir.href} variante="secundario" ancho className="text-center">
                {repetir.texto}
              </BotonEnlace>
            )}
          </div>
        </main>

        {total > 0 && (
          <aside className="hidden w-[270px] shrink-0 flex-col gap-[18px] md:flex">
            <PasosSeccion
              indice={indice}
              inicio={posicion.inicio}
              largo={posicion.largo}
              puedeIr={() => true}
              onIr={ir}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
