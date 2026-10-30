import { Fragment } from "react";
import type { Material } from "@/lib/preguntas/materiales";
import { contarEspacios, partirEnunciado, type TipoPregunta } from "@/lib/preguntas/tipos";
import { MaterialEstudiante } from "./MaterialEstudiante";
import { EncabezadoPregunta } from "./PreguntaEstudiante";

// Una pregunta ya respondida, en la MISMA pantalla del examen pero de solo
// lectura y marcada (revisión de ../evaluacion-a2): lo del estudiante en verde
// si acertó o en rojo si no. La correcta solo llega (y se muestra) cuando se
// puede: mostrar_correctas y sin intentos por delante o la evaluación cerrada.

export type PreguntaRevisada = {
  id: number;
  seccion: string | null;
  subseccion: string | null;
  tipo: TipoPregunta;
  enunciado: string;
  pista: string | null;
  opciones: string[] | null;
  respuesta: string | string[] | null;
  /** null = abierta pendiente de la IA. */
  es_correcta: boolean | null;
  correcta: string | string[] | null;
  nota: number | null;
  comentario: string | null;
};

type Tono = "bien" | "mal" | "neutro";

// Verde #16a34a / #22c55e y rojo #dc2626 / #ef4444 de la revisión de a2.
const CAJA: Record<Tono, string> = {
  bien: "bg-[rgba(34,197,94,0.12)] shadow-[inset_0_0_0_1.5px_#22c55e]",
  mal: "bg-[rgba(239,68,68,0.10)] shadow-[inset_0_0_0_1.5px_#ef4444]",
  neutro: "bg-opcion",
};
const TEXTO: Record<Tono, string> = { bien: "text-exito", mal: "text-error", neutro: "text-tinta" };
const ESTADO: Record<Tono, string> = { bien: "Correcta", mal: "Incorrecta", neutro: "Pendiente" };

const tonoDe = (p: PreguntaRevisada): Tono => (p.es_correcta === null ? "neutro" : p.es_correcta ? "bien" : "mal");

function LineaCorrecta({ correcta }: { correcta: string | string[] | null }) {
  if (!correcta) return null;
  return (
    <p className="mt-2 text-sm text-gris-oscuro">
      Correcta: <strong className="text-exito">{Array.isArray(correcta) ? correcta.join(" · ") : correcta}</strong>
    </p>
  );
}

export function PreguntaRevision({
  pregunta: p,
  numero,
  material,
}: {
  pregunta: PreguntaRevisada;
  numero: number;
  /** Lectura (plegada) o audio de la pregunta, si tiene. */
  material?: Material | null;
}) {
  const tono = tonoDe(p);
  return (
    <div>
      <EncabezadoPregunta
        pregunta={p}
        numero={numero}
        tipoMaterial={material?.tipo}
        material={material ? <MaterialEstudiante key={material.id} material={material} plegable /> : null}
      />
      {p.tipo === "multiple_choice" ? (
        <Opciones p={p} />
      ) : p.tipo === "fill_blank" ? (
        <Completar p={p} numero={numero} tono={tono} />
      ) : (
        <Escrita p={p} numero={numero} tono={tono} />
      )}
      {/* En selección múltiple la correcta ya se ve en verde. */}
      {p.tipo !== "multiple_choice" && !p.es_correcta && <LineaCorrecta correcta={p.correcta} />}
    </div>
  );
}

// xs.optionList / xs.option, sin poder elegir: la del estudiante en verde o rojo
// y, si se puede mostrar, la correcta en verde.
function Opciones({ p }: { p: PreguntaRevisada }) {
  const elegida = typeof p.respuesta === "string" ? p.respuesta : null;
  const correctas = typeof p.correcta === "string" ? p.correcta.split(" / ") : [];
  return (
    <>
      <ul className="flex flex-col gap-3.5">
        {(p.opciones ?? []).map((op, i) => {
          const esElegida = op === elegida;
          const tono: Tono | null =
            correctas.includes(op) || (esElegida && p.es_correcta) ? "bien" : esElegida ? "mal" : null;
          return (
            <li
              key={i}
              className={`flex w-full items-center gap-3.5 rounded-xl px-3.5 py-3 ${tono ? CAJA[tono] : "bg-opcion"}`}
            >
              <span
                className={`flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-white text-sm font-bold ${
                  tono ? TEXTO[tono] : "text-gris"
                }`}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className={`text-[15px] ${tono ? `font-semibold ${TEXTO[tono]}` : "text-tinta"}`}>{op}</span>
              {esElegida && (
                <span className={`ml-auto shrink-0 text-xs font-semibold ${tono ? TEXTO[tono] : "text-gris-oscuro"}`}>
                  Tu respuesta
                </span>
              )}
              {!esElegida && tono === "bien" && <span className="ml-auto shrink-0 text-xs font-semibold text-exito">Correcta</span>}
            </li>
          );
        })}
      </ul>
      {elegida === null && <p className="mt-3 text-sm text-gris-oscuro">No respondiste esta pregunta.</p>}
    </>
  );
}

// xs.fillBox con lo que escribió en cada espacio (xs.revFillAns de a2).
function Completar({ p, numero, tono }: { p: PreguntaRevisada; numero: number; tono: Tono }) {
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
  return (
    <div className="rounded-[14px] border-[1.5px] border-borde bg-white px-6 py-[26px] text-[17px] leading-[1.8] text-tinta">
      {numero}.{" "}
      {sinMarcas ? (
        <>
          {p.enunciado} {Array.from({ length: Math.max(1, valores.length) }, (_, i) => espacio(i))}
        </>
      ) : (
        partes.map((seg, i) => (
          <Fragment key={i}>
            {seg}
            {i < partes.length - 1 && espacio(i)}
          </Fragment>
        ))
      )}
      <span className="sr-only"> ({ESTADO[tono]})</span>
      {p.pista && (
        <>
          <br />
          <strong>{p.pista}</strong>
        </>
      )}
    </div>
  );
}

// Traducción y abierta: xs.transBox con la respuesta (xs.revAnsBox de a2) y, en
// las abiertas ya calificadas, la nota y el comentario de la IA.
function Escrita({ p, numero, tono }: { p: PreguntaRevisada; numero: number; tono: Tono }) {
  const texto = typeof p.respuesta === "string" && p.respuesta.trim() ? p.respuesta : "(vacío)";
  return (
    <div className="rounded-[14px] border-[1.5px] border-borde bg-white px-[22px] py-5">
      <p className="mb-3.5 text-base font-semibold whitespace-pre-line text-tinta">
        {numero}. {p.enunciado}
      </p>
      <p
        className={`rounded-[10px] border border-borde-suave bg-campo px-3.5 py-[11px] text-[15px] font-semibold whitespace-pre-line ${TEXTO[tono]}`}
      >
        {texto}
        <span className="sr-only"> ({ESTADO[tono]})</span>
      </p>
      {p.tipo === "open" && (
        <p className="mt-3 text-sm text-gris-oscuro">
          {p.nota !== null ? (
            <>
              Nota de la IA: <strong className={TEXTO[tono]}>{p.nota}/10</strong>
            </>
          ) : (
            "Pendiente: la calificará la IA."
          )}
        </p>
      )}
      {p.comentario && (
        <p className="mt-3 rounded-[10px] bg-lavanda px-3.5 py-2.5 text-sm leading-relaxed text-tinta">
          <strong className="text-violeta">Comentario: </strong>
          {p.comentario}
        </p>
      )}
    </div>
  );
}
