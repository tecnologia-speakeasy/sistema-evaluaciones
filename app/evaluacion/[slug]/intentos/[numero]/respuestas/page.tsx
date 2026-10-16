import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense, type ReactNode } from "react";
import { Encabezado } from "@/app/components/ui/Encabezado";
import { estudianteParaPagina } from "@/lib/auth/guards";
import { detalleIntento, type DetalleIntento, type DetallePregunta } from "@/lib/datos/intentos";
import { contarEspacios, partirEnunciado, posicionesPorSeccion } from "@/lib/preguntas/tipos";

export const metadata: Metadata = { title: "Tus respuestas" };

// Revisión de un intento (xs.revOverlay de a2): cada pregunta en verde o rojo.
// La respuesta correcta solo aparece si la evaluación tiene mostrar_correctas y
// ya no le quedan intentos o la evaluación cerró (la decide detalleIntento()).
export default function PaginaRespuestas({ params }: PageProps<"/evaluacion/[slug]/intentos/[numero]/respuestas">) {
  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Suspense fallback={<Encabezado />}>
        <Contenido params={params} />
      </Suspense>
    </div>
  );
}

async function Contenido({ params }: { params: Promise<{ slug: string; numero: string }> }) {
  const { slug, numero } = await params;
  const n = Number(numero);
  if (!/^[a-z0-9-]{1,100}$/.test(slug) || !Number.isInteger(n) || n < 1) notFound();
  const estudiante = await estudianteParaPagina(`/evaluacion/${slug}/intentos/${n}/respuestas`);
  const d = await detalleIntento(slug, n, estudiante.id);
  if (!d) notFound();

  return (
    <>
      <Encabezado nombre={estudiante.nombre} detalle={estudiante.generacion_nombre} salir />
      <main className="mx-auto w-full max-w-[760px] px-5 pt-[46px] pb-14">
        <Revision d={d} />
      </main>
    </>
  );
}

function Revision({ d }: { d: DetalleIntento }) {
  const posiciones = posicionesPorSeccion(d.preguntas);
  const resultado = `/evaluacion/${d.evaluacion.slug}/intentos/${d.numero}`;
  const conIntentos = d.evaluacion.intentos_permitidos !== null;

  return (
    <>
      <h1 className="mb-1.5 text-center text-[26px] font-extrabold text-titulo">Tus respuestas</h1>
      <p className="mb-[22px] text-center text-base text-gris-oscuro">
        {d.evaluacion.titulo} · Intento {d.numero} ·{" "}
        {d.puntaje_total === null ? "puntaje pendiente" : `${d.puntaje_total}/100`}
      </p>

      {d.evaluacion.mostrar_correctas && !d.correctasVisibles && (
        <p className="mb-4 rounded-xl border border-borde-suave bg-lavanda px-4 py-3 text-center text-sm text-gris-oscuro">
          {conIntentos
            ? "Las respuestas correctas se mostrarán cuando termines tus intentos."
            : "Las respuestas correctas se mostrarán cuando cierre la evaluación."}
        </p>
      )}

      {d.preguntas.map((p, i) => {
        const pos = posiciones[i];
        return (
          <Fragment key={p.id}>
            {pos.numero === 1 && (
              <h2 className="mt-[26px] mb-3.5 text-[22px] font-extrabold text-titulo">{p.seccion ?? "Ejercicios"}</h2>
            )}
            <Pregunta p={p} numero={pos.numero} />
          </Fragment>
        );
      })}

      <Link
        href={resultado}
        className="degradado-boton mt-6 block w-full rounded-xl py-3.5 text-center text-[15px] font-semibold text-white"
      >
        Volver al resultado
      </Link>
      <Link href="/historial" className="mt-3 block text-center text-sm font-semibold text-violeta hover:underline">
        Ver mi historial
      </Link>
    </>
  );
}

// Colores de la revisión de a2: verde #16a34a / #22c55e, rojo #dc2626 / #ef4444.
const TONO = {
  bien: "text-exito bg-[rgba(34,197,94,0.12)] shadow-[inset_0_0_0_1.5px_#22c55e]",
  mal: "text-error bg-[rgba(239,68,68,0.10)] shadow-[inset_0_0_0_1.5px_#ef4444]",
  neutro: "text-tinta bg-campo border border-borde-suave",
} as const;

function Estado({ p }: { p: DetallePregunta }) {
  const bien = "bg-[rgba(34,197,94,0.12)] text-exito";
  const mal = "bg-[rgba(239,68,68,0.10)] text-error";
  const [texto, clases] =
    p.es_correcta === null
      ? ["Pendiente: la calificará la IA", "bg-opcion text-gris-oscuro"]
      : p.nota !== null
        ? [`Nota de la IA: ${p.nota}/10`, p.es_correcta ? bien : mal] // abierta ya calificada
        : p.es_correcta
          ? ["Correcta", bien]
          : ["Incorrecta", mal];
  return <span className={`ml-2 inline-block rounded-full px-2.5 py-0.5 align-middle text-xs font-bold ${clases}`}>{texto}</span>;
}

function LineaCorrecta({ correcta }: { correcta: DetallePregunta["correcta"] }) {
  if (!correcta) return null;
  return (
    <p className="mt-2 text-sm text-gris-oscuro">
      Correcta:{" "}
      <strong className="text-exito">{Array.isArray(correcta) ? correcta.join(" · ") : correcta}</strong>
    </p>
  );
}

function Pregunta({ p, numero }: { p: DetallePregunta; numero: number }) {
  const tono = p.es_correcta === null ? "neutro" : p.es_correcta ? "bien" : "mal";
  let cuerpo: ReactNode;

  if (p.tipo === "multiple_choice") {
    const elegida = typeof p.respuesta === "string" ? p.respuesta : null;
    const correctas = typeof p.correcta === "string" ? p.correcta.split(" / ") : [];
    cuerpo = (
      <>
        <p className="mb-2.5 text-[15px] leading-snug">
          {numero}. {p.enunciado}
          <Estado p={p} />
        </p>
        <ul className="flex flex-col gap-2.5">
          {(p.opciones ?? []).map((op, i) => {
            const esElegida = op === elegida;
            const marca = esElegida ? (p.es_correcta ? "bien" : "mal") : correctas.includes(op) ? "bien" : null;
            return (
              <li
                key={i}
                className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 ${marca ? TONO[marca] : "bg-opcion text-tinta"}`}
              >
                <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-white text-sm font-bold text-gris">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className={`text-[15px] ${marca ? "font-semibold" : ""}`}>{op}</span>
                {esElegida && <span className="ml-auto text-xs font-semibold">Tu respuesta</span>}
              </li>
            );
          })}
        </ul>
      </>
    );
  } else if (p.tipo === "fill_blank") {
    const valores = Array.isArray(p.respuesta) ? p.respuesta : [];
    const partes = partirEnunciado(p.enunciado);
    const sinMarcas = contarEspacios(p.enunciado) === 0;
    const espacio = (i: number) => (
      <span
        key={`e-${i}`}
        className={`mx-1 inline-block min-w-[60px] border-b-2 px-2 text-center font-bold ${
          tono === "bien" ? "border-exito-borde text-exito" : "border-error-borde text-error"
        }`}
      >
        {valores[i]?.trim() ? valores[i] : "—"}
      </span>
    );
    const cuantos = sinMarcas ? Math.max(1, valores.length) : partes.length - 1;
    cuerpo = (
      <div className="rounded-[14px] border-[1.5px] border-borde bg-white px-5 py-4 text-base leading-[1.9]">
        {numero}.{" "}
        {sinMarcas ? (
          <>
            {p.enunciado} {Array.from({ length: cuantos }, (_, i) => espacio(i))}
          </>
        ) : (
          partes.map((seg, i) => (
            <Fragment key={i}>
              {seg}
              {i < partes.length - 1 && espacio(i)}
            </Fragment>
          ))
        )}
        <Estado p={p} />
        {p.pista && (
          <>
            <br />
            <strong>{p.pista}</strong>
          </>
        )}
      </div>
    );
  } else {
    cuerpo = (
      <div className="rounded-[14px] border-[1.5px] border-borde bg-white px-5 py-4">
        <p className="text-[15px] font-semibold whitespace-pre-line">
          {numero}. {p.enunciado}
          <Estado p={p} />
        </p>
        <p className={`mt-3 rounded-[10px] px-3.5 py-[11px] text-[15px] font-semibold whitespace-pre-line ${TONO[tono]}`}>
          {typeof p.respuesta === "string" ? p.respuesta : "(vacío)"}
        </p>
        {p.comentario && (
          <p className="mt-3 rounded-[10px] bg-lavanda px-3.5 py-2.5 text-sm leading-relaxed text-tinta">
            <strong className="text-violeta">Comentario: </strong>
            {p.comentario}
          </p>
        )}
      </div>
    );
  }

  return (
    <article className="mb-[22px]">
      {cuerpo}
      {/* En selección múltiple ya lo dice la opción en verde. */}
      {p.tipo !== "multiple_choice" && <LineaCorrecta correcta={p.correcta} />}
    </article>
  );
}
