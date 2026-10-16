"use client";

import { Fragment } from "react";
import {
  contarEspacios,
  partirEnunciado,
  type PreguntaPublica,
  type TipoPregunta,
} from "@/lib/preguntas/tipos";

// Una pregunta tal como la ve el estudiante. Réplica de la pantalla del examen
// de ../evaluacion-a2 (EnglishExam.jsx, objeto `xs`): mismos tamaños, colores y
// textos. Solo recibe PreguntaPublica: por tipos no puede llegarle una respuesta
// correcta ni la rúbrica. La usan la vista previa del staff y, en la fase de
// estudiante, la presentación de la evaluación.

export type RespuestaEstudiante = string | string[] | null;

// a2 tenía una instrucción por "Part"; aquí no hay columna para eso, así que va
// una por tipo, en inglés como las de a2.
export const INSTRUCCION_POR_TIPO: Record<TipoPregunta, string> = {
  multiple_choice: "Choose the correct option to complete each sentence.",
  fill_blank: "Complete each sentence.",
  translation: "Translate the sentences into English.",
  open: "Write your answer in English.",
};

export function PreguntaEstudiante({
  pregunta,
  numero,
  respuesta,
  onCambio,
}: {
  pregunta: PreguntaPublica;
  /** Número dentro de su sección (a2 reinicia la numeración en cada Part). */
  numero: number;
  respuesta: RespuestaEstudiante;
  onCambio: (r: RespuestaEstudiante) => void;
}) {
  const titulo = pregunta.seccion ?? `Ejercicio ${numero}`;
  const instruccion = INSTRUCCION_POR_TIPO[pregunta.tipo];
  const esMultiple = pregunta.tipo === "multiple_choice";

  return (
    <div>
      {/* Escritorio: xs.ejTitle + xs.ejQuestion */}
      <div className="hidden md:block">
        <h1 className="mb-2.5 text-[26px] font-extrabold text-titulo">{titulo}</h1>
        {esMultiple && (
          <p className="mb-[26px] text-base leading-normal text-tinta">{instruccion}</p>
        )}
      </div>
      {/* Celular: xs.mCard (tarjeta morada), variante sin cronómetro */}
      <div className="degradado-tarjeta-movil mt-[46px] mb-[26px] rounded-[20px] px-[22px] pt-[26px] pb-7 text-center text-white md:hidden">
        <h2 className="mb-2 text-[22px] font-extrabold text-white">{titulo}</h2>
        {esMultiple && <p className="text-[15px] leading-normal text-white/90">{instruccion}</p>}
      </div>

      {/* xs.instr */}
      <p className="mb-4 text-[15px] font-bold text-tinta">
        {esMultiple ? `${numero}. ${pregunta.enunciado}` : instruccion}
      </p>

      {pregunta.tipo === "multiple_choice" && (
        <OpcionesMultiple
          opciones={pregunta.opciones ?? []}
          valor={typeof respuesta === "string" ? respuesta : null}
          onCambio={onCambio}
        />
      )}
      {pregunta.tipo === "fill_blank" && (
        <Completar
          pregunta={pregunta}
          numero={numero}
          valores={Array.isArray(respuesta) ? respuesta : []}
          onCambio={onCambio}
        />
      )}
      {(pregunta.tipo === "translation" || pregunta.tipo === "open") && (
        // xs.transBox + xs.transSentence + xs.transInput
        <div className="rounded-[14px] border-[1.5px] border-borde bg-white px-[22px] py-5">
          <p className="mb-3.5 text-base font-semibold whitespace-pre-line text-tinta">
            {numero}. {pregunta.enunciado}
          </p>
          <textarea
            value={typeof respuesta === "string" ? respuesta : ""}
            onChange={(e) => onCambio(e.target.value)}
            placeholder={
              pregunta.tipo === "translation"
                ? "Write the sentence in English…"
                : "Write your answer here…"
            }
            rows={pregunta.tipo === "translation" ? 2 : 6}
            className="w-full resize-y rounded-[10px] border-[1.5px] border-borde bg-campo px-3.5 py-3 font-[inherit] text-[15px] text-tinta outline-none"
          />
        </div>
      )}
    </div>
  );
}

// xs.optionList / xs.option / xs.optionSelected / xs.optionLetter / xs.optionText
function OpcionesMultiple({
  opciones,
  valor,
  onCambio,
}: {
  opciones: string[];
  valor: string | null;
  onCambio: (r: RespuestaEstudiante) => void;
}) {
  return (
    <div role="radiogroup" className="flex flex-col gap-3.5">
      {opciones.map((op, i) => {
        const elegida = valor === op;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={elegida}
            onClick={() => onCambio(op)}
            className={`flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-3.5 py-3 text-left outline-none transition-all duration-150 ${
              elegida ? "degradado-opcion" : "bg-opcion"
            }`}
          >
            <span
              className={`flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-white text-sm font-bold ${
                elegida ? "text-morado-oscuro" : "text-gris"
              }`}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span className={`text-[15px] ${elegida ? "font-semibold text-white" : "text-tinta"}`}>
              {op}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// xs.fillBox / xs.fillInput: la oración con los espacios como campos en línea.
function Completar({
  pregunta,
  numero,
  valores,
  onCambio,
}: {
  pregunta: PreguntaPublica;
  numero: number;
  valores: string[];
  onCambio: (r: RespuestaEstudiante) => void;
}) {
  const espacios = pregunta.espacios ?? 1;
  const partes = partirEnunciado(pregunta.enunciado);
  // Sin ___ en el enunciado: los campos van al final de la oración.
  const sinMarcas = contarEspacios(pregunta.enunciado) === 0;

  const campo = (i: number) => (
    <input
      key={`campo-${i}`}
      type="text"
      aria-label={`Espacio ${i + 1}`}
      value={valores[i] ?? ""}
      onChange={(e) => {
        const nuevos = Array.from({ length: espacios }, (_, j) => valores[j] ?? "");
        nuevos[i] = e.target.value;
        onCambio(nuevos);
      }}
      className="mx-1.5 min-w-[110px] border-0 border-b-2 border-tinta bg-transparent px-2 py-0.5 text-center font-[inherit] text-[17px] font-semibold text-tinta outline-none"
    />
  );

  return (
    <div className="rounded-[14px] border-[1.5px] border-borde bg-white px-6 py-[26px] text-[17px] leading-[1.8] text-tinta">
      {numero}.{" "}
      {sinMarcas ? (
        <>
          {pregunta.enunciado}{" "}
          {Array.from({ length: espacios }, (_, i) => campo(i))}
        </>
      ) : (
        partes.map((seg, i) => (
          <Fragment key={i}>
            {seg}
            {i < partes.length - 1 && campo(i)}
          </Fragment>
        ))
      )}
      {pregunta.pista && (
        <>
          <br />
          <strong>{pregunta.pista}</strong>
        </>
      )}
    </div>
  );
}
