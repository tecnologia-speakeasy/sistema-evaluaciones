import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Encabezado } from "@/app/components/ui/Encabezado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { cerrarVencidos, historial, type IntentoHistorial } from "@/lib/datos/intentos";
import { formatearFechaHora } from "@/lib/fechas";
import { codigoEvaluacion } from "@/lib/tipos";
import { GraficoEvolucion } from "./GraficoEvolucion";

export const metadata: Metadata = { title: "Mi historial" };

// Todos sus intentos de todas las evaluaciones y la evolución de sus puntajes.
export default function PaginaHistorial() {
  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Suspense fallback={<Encabezado />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

async function Contenido() {
  const estudiante = await estudianteParaPagina("/historial");
  await cerrarVencidos(estudiante.id);
  const intentos = await historial(estudiante.id);
  const puntajes = intentos.flatMap((i) => (i.puntaje_total === null ? [] : [i.puntaje_total]));
  const promedio = puntajes.length ? Math.round(puntajes.reduce((s, p) => s + p, 0) / puntajes.length) : null;

  return (
    <>
      <Encabezado nombre={estudiante.nombre} detalle={estudiante.generacion_nombre} salir />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-[18px] pt-8 pb-12 md:px-7 md:pt-10">
        <Link href="/" className="text-sm font-semibold text-gris-oscuro hover:text-violeta">
          ← Mis evaluaciones
        </Link>
        <h1 className="mt-3 text-[clamp(26px,4vw,34px)] leading-tight font-extrabold text-marca">Mi historial</h1>
        <p className="mt-1.5 mb-7 text-[15px] text-gris-hub">Todos tus intentos y cómo han ido tus puntajes.</p>

        {intentos.length === 0 ? (
          <Tarjeta className="text-center text-[15px] text-gris-oscuro">
            Aún no has presentado ninguna evaluación.
          </Tarjeta>
        ) : (
          <>
            {puntajes.length > 0 && (
              <Tarjeta as="section" aria-labelledby="titulo-evolucion" className="mb-6">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="titulo-evolucion" className="text-lg font-extrabold text-titulo">
                    Evolución
                  </h2>
                  <p className="text-sm text-gris-oscuro">
                    Promedio <strong className="text-tinta">{promedio}/100</strong> · Mejor{" "}
                    <strong className="text-tinta">{Math.max(...puntajes)}/100</strong>
                  </p>
                </div>
                <GraficoEvolucion intentos={intentos} />
              </Tarjeta>
            )}
            <h2 className="mb-3 text-lg font-extrabold text-titulo">Intentos</h2>
            <ul className="flex flex-col gap-3">
              {[...intentos].reverse().map((i) => (
                <li key={`${i.slug}-${i.numero}`}>
                  <FilaIntento i={i} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}

function FilaIntento({ i }: { i: IntentoHistorial }) {
  const codigo = codigoEvaluacion(i.tipo, i.eval_numero);
  return (
    <Tarjeta
      relleno="p-4"
      className="relative flex items-center gap-3.5 transition-shadow hover:shadow-[0_6px_20px_rgba(65,39,107,0.12)]"
    >
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-lavanda text-sm font-bold text-violeta">
        {codigo}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-extrabold text-titulo">
          {/* Toda la fila lleva al resultado (enlace estirado). */}
          <Link href={`/evaluacion/${i.slug}/intentos/${i.numero}`} className="after:absolute after:inset-0 after:rounded-[14px]">
            {i.titulo}
          </Link>
        </p>
        <p className="text-[13px] text-gris-oscuro">
          Intento {i.numero} · {formatearFechaHora(i.completado)}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-gris-oscuro">
          {i.grammar_total > 0 && (
            <span className="whitespace-nowrap">
              Grammar <strong className="text-tinta">{i.grammar_score}/{i.grammar_total}</strong>
            </span>
          )}
          {i.writing_total > 0 && (
            <span className="whitespace-nowrap">
              Writing <strong className="text-tinta">{i.writing_score}/{i.writing_total}</strong>
            </span>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[22px] leading-tight font-extrabold text-tinta">
          {i.puntaje_total ?? "…"}
          <span className="text-sm font-bold text-rosa-hover">/100</span>
        </p>
        <p className="text-xs font-semibold text-violeta">{i.puntaje_total === null ? "Pendiente" : "Ver →"}</p>
      </div>
    </Tarjeta>
  );
}
