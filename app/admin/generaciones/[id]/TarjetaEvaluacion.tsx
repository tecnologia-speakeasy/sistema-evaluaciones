"use client";

import Link from "next/link";
import { useState } from "react";
import { FormConfigEvaluacion } from "@/app/admin/components/FormConfigEvaluacion";
import { InterruptorPublicar } from "@/app/admin/components/InterruptorPublicar";
import { Boton, BotonEnlace } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Icono } from "@/app/components/ui/Icono";
import { InsigniaEstado } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { EvaluacionResumen } from "@/lib/datos/evaluaciones";
import { formatearFechaHora } from "@/lib/fechas";

// Una evaluación de la cuadrícula.
//   ≥ 640px: tarjeta; toda la tarjeta lleva a Preguntas (enlace estirado sobre
//            el título; el interruptor y "Configurar" quedan por encima).
//   < 640px: fila compacta (código, título, estado, interruptor) que se
//            expande al tocarla.
export default function TarjetaEvaluacion({ evaluacion: e }: { evaluacion: EvaluacionResumen }) {
  const [configurando, setConfigurando] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const codigo = `${e.tipo === "mensual" ? "M" : "T"}${e.numero}`;
  const hrefPreguntas = `/admin/evaluaciones/${e.id}`;
  const idDetalle = `detalle-evaluacion-${e.id}`;

  const cuadroCodigo = (
    // Cuadro con el número, como xs.optionLetter de a2
    <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-lavanda text-sm font-bold text-violeta">
      {codigo}
    </span>
  );
  const interruptor = (confirmar: boolean) => (
    <InterruptorPublicar
      evaluacionId={e.id}
      titulo={e.titulo}
      publicada={e.publicada}
      confirmar={confirmar}
    />
  );

  return (
    <>
      {/* Escritorio y tablet */}
      <Tarjeta className="relative hidden h-full flex-col transition-shadow duration-150 hover:shadow-[0_6px_20px_rgba(65,39,107,0.12)] sm:flex">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {cuadroCodigo}
            <InsigniaEstado estado={e.estado} />
          </div>
          {/* Por encima del enlace estirado */}
          <div className="relative z-10 flex items-start gap-2">
            <Boton
              variante="secundario"
              tamano="icono"
              aria-label={`Configurar ${e.titulo}`}
              title="Configurar fechas, duración e intentos"
              className="!size-[30px] shrink-0 !rounded-lg"
              onClick={() => setConfigurando(true)}
            >
              <Icono nombre="configurar" className="size-4" />
            </Boton>
            <div className="pt-[3px]">{interruptor(false)}</div>
          </div>
        </div>

        <h3 className="text-base leading-snug font-extrabold text-titulo">
          <Link
            href={hrefPreguntas}
            className="after:absolute after:inset-0 after:rounded-[14px] hover:text-violeta"
          >
            {e.titulo}
          </Link>
        </h3>
        <p className="mt-0.5 text-[13px] break-all text-gris">{e.slug}</p>

        <Datos evaluacion={e} />

        <div className="mt-auto pt-3">
          <Configuracion evaluacion={e} />
        </div>
      </Tarjeta>

      {/* Celular: el interruptor va aparte, tras una línea divisoria, y pide
          confirmación (un toque al chevron no debe publicar por accidente). */}
      <Tarjeta relleno="p-0" className="sm:hidden">
        <div className="flex items-stretch">
          <button
            type="button"
            aria-expanded={expandida}
            aria-controls={idDetalle}
            onClick={() => setExpandida((x) => !x)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pr-3 pl-3 text-left"
          >
            {cuadroCodigo}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold text-titulo">{e.titulo}</span>
              <span className="mt-1 block">
                <InsigniaEstado estado={e.estado} />
              </span>
            </span>
            <Icono
              nombre="abajo"
              className={`size-5 shrink-0 text-gris transition-transform duration-150 ${expandida ? "rotate-180" : ""}`}
            />
          </button>
          <div className="my-2.5 flex items-center border-l border-borde-suave px-3.5">
            {interruptor(true)}
          </div>
        </div>
        {expandida && (
          <div id={idDetalle} className="border-t border-borde-suave px-3.5 pt-3 pb-3.5">
            <p className="text-[13px] break-all text-gris">{e.slug}</p>
            <Datos evaluacion={e} />
            <div className="mt-3">
              <Configuracion evaluacion={e} />
            </div>
            <div className="mt-3.5 flex gap-2">
              <BotonEnlace href={hrefPreguntas} tamano="sm" className="flex-1">
                Ver preguntas
              </BotonEnlace>
              <Boton variante="secundario" tamano="sm" className="flex-1" onClick={() => setConfigurando(true)}>
                <Icono nombre="configurar" className="size-4" />
                Configurar
              </Boton>
            </div>
          </div>
        )}
      </Tarjeta>

      <Dialogo
        abierto={configurando}
        onCerrar={() => setConfigurando(false)}
        titulo={`Configurar · ${e.titulo}`}
      >
        <FormConfigEvaluacion
          evaluacionId={e.id}
          inicial={e}
          onGuardado={() => setConfigurando(false)}
        />
      </Dialogo>
    </>
  );
}

function Datos({ evaluacion: e }: { evaluacion: EvaluacionResumen }) {
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
      <Dato etiqueta="Preguntas" valor={e.preguntas} />
      <Dato etiqueta="Intentos" valor={e.intentos} />
      <Dato etiqueta="Promedio" valor={e.promedio ?? "—"} />
    </dl>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number | string }) {
  return (
    <div className="flex flex-col-reverse rounded-[10px] bg-campo px-1 py-2">
      <dt className="text-[11px] font-semibold text-gris">{etiqueta}</dt>
      <dd className="text-[17px] leading-tight font-semibold text-tinta">{valor}</dd>
    </div>
  );
}

// Fechas, duración e intentos. Sin nada configurado: una sola línea.
function Configuracion({ evaluacion: e }: { evaluacion: EvaluacionResumen }) {
  if (!e.apertura && !e.cierre && !e.duracion_min && !e.intentos_permitidos) {
    return <p className="text-[13px] text-gris">Sin configurar</p>;
  }
  return (
    <div className="min-w-0 space-y-0.5 text-[13px] text-gris-oscuro">
      {e.apertura && <p>Abre: {formatearFechaHora(e.apertura)}</p>}
      {e.cierre && <p>Cierra: {formatearFechaHora(e.cierre)}</p>}
      {/* Cada dato completo en su línea si no caben juntos: nunca se parte. */}
      <p className="flex flex-wrap gap-x-1.5">
        <span className="whitespace-nowrap">
          {e.duracion_min ? `${e.duracion_min} min` : "Sin límite de tiempo"}
        </span>
        <span aria-hidden>·</span>
        <span className="whitespace-nowrap">
          {e.intentos_permitidos
            ? `${e.intentos_permitidos} ${e.intentos_permitidos === 1 ? "intento" : "intentos"}`
            : "Intentos ilimitados"}
        </span>
      </p>
    </div>
  );
}
