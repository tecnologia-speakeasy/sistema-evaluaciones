import type { Metadata } from "next";
import { Suspense } from "react";
import { AnilloProgreso } from "@/app/components/examen/AnilloProgreso";
import { celebracionPorPuntaje } from "@/lib/celebracion";
import { resultadoPublico, type ResultadoPublico } from "@/lib/datos/intentos";

// Público (el enlace que copia el estudiante en su resultado y "Ver ↗" de
// Resultados): solo el resumen, como la página /resultado de a2. Nunca el detalle por pregunta ni respuestas correctas.
export const metadata: Metadata = { title: "Resultado", robots: { index: false, follow: false } };

export default function PaginaResultadoPublico({ params }: PageProps<"/resultado/[token]">) {
  return (
    <main className="fondo-intro flex min-h-screen flex-1 items-center justify-center p-6 text-white">
      <Suspense fallback={null}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  const r = await resultadoPublico((await params).token);
  return (
    <div className="flex max-h-[88vh] w-[min(560px,94vw)] flex-col items-center overflow-y-auto rounded-3xl border border-white/14 bg-white/10 px-6 py-8 text-center sm:px-9">
      {r ? <Resumen r={r} /> : <NoEncontrado />}
      <p className="mt-7 text-xs text-white/50">Speak Easy · Hazlo fácil con Speak Easy</p>
    </div>
  );
}

function NoEncontrado() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-extrabold">Resultado no encontrado</h1>
      <p className="text-[15px] text-white/80">El enlace no es válido o ya no está disponible.</p>
    </>
  );
}

function Resumen({ r }: { r: ResultadoPublico }) {
  const pendiente = r.estado !== "listo";
  const c = celebracionPorPuntaje(r.puntaje_total);
  const primerNombre = r.nombre.trim().split(/\s+/)[0] || r.nombre;
  const filas = [
    ["Writing score", r.writing_score, r.writing_total],
    ["Grammar score", r.grammar_score, r.grammar_total],
    ["Reading score", r.reading_score, r.reading_total],
    ["Listening score", r.listening_score, r.listening_total],
  ] as const;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- igual que a2 */}
      <img
        src={pendiente ? "/spiky-calificando.png" : c.img}
        alt=""
        className="mb-3 h-auto w-[110px] drop-shadow-[0_10px_24px_rgba(0,0,0,0.3)]"
      />
      <h1 className="mb-2 text-[clamp(24px,5vw,32px)] font-extrabold">
        {pendiente ? "¡Recibimos tu evaluación!" : c.titulo}
      </h1>
      <p className="mb-6 max-w-[430px] text-[15px] leading-normal text-white/85">
        Hola <strong className="text-white">{primerNombre}</strong>, este es tu resultado de{" "}
        <strong className="text-white">{r.titulo}</strong>.
        {pendiente && " Tu respuesta abierta la calificará la IA; vuelve más tarde para ver tu puntaje final."}
      </p>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-6">
        <AnilloProgreso progreso={r.puntaje_total ?? 0} tamano={132} grosor={9}>
          <span className="text-[38px] leading-none font-extrabold">{r.puntaje_total ?? "…"}</span>
          <span className="mt-0.5 text-[13px] text-white/70">{pendiente ? "Pendiente" : "Puntaje"}</span>
        </AnilloProgreso>
        <div className="flex flex-col gap-2.5">
          {filas
            .filter(([, , totalCat]) => totalCat > 0)
            .map(([etiqueta, aciertos, totalCat]) => (
              <div
                key={etiqueta}
                className="flex min-w-[200px] items-center justify-between gap-6 rounded-[10px] bg-white px-4 py-[11px]"
              >
                <span className="text-sm text-tinta">{etiqueta}</span>
                <span className="text-[17px] font-semibold text-tinta">
                  {aciertos}
                  <span className="ml-px font-extrabold text-rosa-hover">/{totalCat}</span>
                </span>
              </div>
            ))}
        </div>
      </div>
      {r.feedback && (
        <section className="mt-6 w-full text-left">
          <h2 className="mb-2 text-xs font-bold tracking-[1.2px] text-[rgba(255,120,180,0.85)] uppercase">
            Retroalimentación
          </h2>
          <div className="scroll-claro max-h-[min(40vh,320px)] overflow-y-auto rounded-2xl border border-white/14 px-5 py-4">
            <p className="text-justify text-[15px] leading-[1.7] whitespace-pre-wrap text-white/92">{r.feedback}</p>
          </div>
        </section>
      )}
    </>
  );
}
