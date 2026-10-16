import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnilloProgreso } from "@/app/components/examen/AnilloProgreso";
import { BotonCopiarEnlace } from "@/app/components/examen/BotonCopiarEnlace";
import { Confeti } from "@/app/components/examen/Confeti";
import { EsperarResultado } from "@/app/components/examen/EsperarResultado";
import { VerFeedback } from "@/app/components/examen/VerFeedback";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { celebracionPorPuntaje } from "@/lib/celebracion";
import { detalleIntento, type DetalleIntento } from "@/lib/datos/intentos";
import { formatearFechaHora } from "@/lib/fechas";

export const metadata: Metadata = { title: "Resultado" };

// Resultado de un intento (celebración de a2: xs.celebOverlay). Solo el dueño,
// con su sesión. El detalle por pregunta está en ./respuestas.
export default function PaginaResultado({ params }: PageProps<"/evaluacion/[slug]/intentos/[numero]">) {
  return (
    <Suspense fallback={<div className="fondo-intro min-h-screen flex-1" />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ slug: string; numero: string }> }) {
  const { slug, numero } = await params;
  const n = Number(numero);
  if (!/^[a-z0-9-]{1,100}$/.test(slug) || !Number.isInteger(n) || n < 1) notFound();
  const estudiante = await estudianteParaPagina(`/evaluacion/${slug}/intentos/${n}`);
  const d = await detalleIntento(slug, n, estudiante.id);
  if (!d) notFound();
  return <Celebracion d={d} />;
}

function Celebracion({ d }: { d: DetalleIntento }) {
  // Sin puntaje: hay abiertas que la IA no ha calificado. En proceso: la IA
  // todavía no termina (la página se actualiza sola cuando queda listo). Los
  // intentos 'listo' de antes de la Fase 5 no tienen feedback: no se espera.
  const sinPuntaje = d.puntaje_total === null;
  const enProceso = d.estado !== "listo";
  const c = celebracionPorPuntaje(d.puntaje_total);
  const base = `/evaluacion/${d.evaluacion.slug}`;
  const hrefRespuestas = `${base}/intentos/${d.numero}/respuestas`;
  const repetir = d.puedeRepetir
    ? { href: base, texto: d.enCurso ? "Continuar intento en curso" : "Repetir evaluación" }
    : null;
  const filas = [
    ["Writing score", d.writing_score, d.writing_total],
    ["Grammar score", d.grammar_score, d.grammar_total],
  ] as const;
  const secundario =
    "flex-1 rounded-xl border-[1.5px] border-white/45 bg-white/12 px-3 py-[13px] text-[15px] font-semibold whitespace-nowrap text-white hover:bg-white/18";

  return (
    <div className="fondo-intro relative flex min-h-screen flex-1 flex-col items-center overflow-x-hidden p-6 text-center">
      {!sinPuntaje && <Confeti />}
      {enProceso && <EsperarResultado intentoId={d.id} />}
      <Link href="/" className="absolute top-[22px] right-[30px] z-[2] text-[15px] text-white/85 hover:text-white">
        Cerrar ✕
      </Link>

      <div className="relative z-[1] my-auto flex flex-col items-center pt-8">
        <p className="mb-4 text-sm font-semibold text-white/60">
          {d.evaluacion.titulo} · Intento {d.numero}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- igual que a2 */}
        <img
          src={sinPuntaje ? "/spiky-calificando.png" : c.img}
          alt=""
          className="mb-4 h-auto w-[150px] drop-shadow-[0_10px_24px_rgba(0,0,0,0.3)]"
        />
        <h1 className="mb-2.5 text-[clamp(28px,5vw,38px)] font-extrabold text-white">
          {sinPuntaje ? "¡Recibimos tu evaluación!" : c.titulo}
        </h1>
        <p className="mb-7 max-w-[430px] text-[15px] leading-[1.45] text-white/82">
          {sinPuntaje
            ? "Tu respuesta abierta la calificará la IA. Cuando esté lista, aquí verás tu puntaje final."
            : c.sub}
        </p>

        <div className="mb-7 flex flex-wrap items-center justify-center gap-[30px] rounded-[20px] border border-white/14 bg-white/10 px-[30px] py-[26px]">
          <AnilloProgreso progreso={d.puntaje_total ?? 0} tamano={140} grosor={9}>
            <span className="text-[40px] leading-none font-extrabold text-white">{d.puntaje_total ?? "…"}</span>
            <span className="mt-0.5 text-[13px] text-white/70">{sinPuntaje ? "Pendiente" : "Puntaje"}</span>
          </AnilloProgreso>
          <div className="flex flex-col gap-2.5">
            {filas
              .filter(([, , totalCat]) => totalCat > 0)
              .map(([etiqueta, aciertos, totalCat]) => (
                <div
                  key={etiqueta}
                  className="flex min-w-[210px] items-center justify-between gap-6 rounded-[10px] bg-white px-4 py-[11px]"
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

        {enProceso && (
          <p role="status" className="mb-4 max-w-[420px] text-[14px] leading-snug text-white/80">
            Tu retroalimentación está en camino. Te avisaremos por correo cuando esté lista.
          </p>
        )}

        {/* Como a2: la acción principal es "Revisa tu feedback". */}
        {d.feedback ? (
          <VerFeedback feedback={d.feedback} hrefRespuestas={hrefRespuestas} repetir={repetir} />
        ) : (
          <Link
            href={hrefRespuestas}
            className="degradado-boton w-[min(420px,82vw)] rounded-xl py-3.5 text-[15px] font-semibold text-white"
          >
            Ver mis respuestas
          </Link>
        )}
        <div className="mt-3 flex w-[min(420px,82vw)] flex-col gap-3 sm:flex-row sm:flex-wrap">
          {d.feedback && (
            <Link href={hrefRespuestas} className={secundario}>
              Ver mis respuestas
            </Link>
          )}
          {repetir && (
            <Link href={repetir.href} className={secundario}>
              {repetir.texto}
            </Link>
          )}
          <Link href="/" className={secundario}>
            Volver al inicio
          </Link>
        </div>

        <BotonCopiarEnlace ruta={`/resultado/${d.token}`} />

        {d.intentos.length > 1 && <TusIntentos d={d} />}
      </div>
    </div>
  );
}

// Selector de intentos (xs.attemptsWrap de a2): cada uno lleva a su resultado.
function TusIntentos({ d }: { d: DetalleIntento }) {
  return (
    <nav aria-label="Tus intentos" className="mt-[26px] flex w-[min(420px,82vw)] flex-col gap-2.5 text-left">
      <p className="mb-0.5 ml-1 text-xs font-bold tracking-[1.2px] text-white/60 uppercase">Tus intentos</p>
      {d.intentos.map((a) => {
        const activo = a.numero === d.numero;
        const contenido = (
          <>
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold text-white ${
                activo ? "bg-[linear-gradient(135deg,#ff327d_0%,#6d2ebf_100%)]" : "bg-white/14"
              }`}
            >
              {a.numero}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-white">Ver intento {a.numero}</span>
              <span className="text-xs text-white/60">{formatearFechaHora(a.completado)}</span>
            </span>
            <span className="shrink-0 text-lg font-extrabold text-white">
              {a.puntaje_total ?? "…"}
              <span className="ml-px text-[13px] font-bold text-[#ff7aae]">/100</span>
            </span>
            <span className="min-w-[58px] shrink-0 text-center text-xs font-semibold text-white/75">
              {activo ? (
                <span className="inline-block rounded-full bg-rosa px-2.5 py-1 text-[11px] font-bold text-white">Viendo</span>
              ) : (
                <span aria-hidden className="text-lg">→</span>
              )}
            </span>
          </>
        );
        const clases = "flex w-full items-center gap-3.5 rounded-[14px] border px-3.5 py-2.5 text-white transition-colors";
        return activo ? (
          <div key={a.numero} aria-current="page" className={`${clases} border-rosa bg-[rgba(255,50,125,0.16)]`}>
            {contenido}
          </div>
        ) : (
          <Link
            key={a.numero}
            href={`/evaluacion/${d.evaluacion.slug}/intentos/${a.numero}`}
            className={`${clases} border-white/16 bg-white/8 hover:-translate-y-px hover:border-white/32 hover:bg-white/15`}
          >
            {contenido}
          </Link>
        );
      })}
    </nav>
  );
}
