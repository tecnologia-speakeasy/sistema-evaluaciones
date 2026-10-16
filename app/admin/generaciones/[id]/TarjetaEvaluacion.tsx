"use client";

import { useState } from "react";
import { FormConfigEvaluacion } from "@/app/admin/components/FormConfigEvaluacion";
import { InterruptorPublicar } from "@/app/admin/components/InterruptorPublicar";
import { Boton, BotonEnlace } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { InsigniaEstado } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { EvaluacionResumen } from "@/lib/datos/evaluaciones";
import { formatearFechaHora } from "@/lib/fechas";

export default function TarjetaEvaluacion({ evaluacion: e }: { evaluacion: EvaluacionResumen }) {
  const [configurando, setConfigurando] = useState(false);
  const codigo = `${e.tipo === "mensual" ? "M" : "T"}${e.numero}`;

  return (
    <Tarjeta className="flex h-full flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {/* Cuadro con el número, como xs.optionLetter de a2 */}
          <span className="flex size-[34px] items-center justify-center rounded-[9px] bg-lavanda text-sm font-bold text-violeta">
            {codigo}
          </span>
          <InsigniaEstado estado={e.estado} />
        </div>
        <InterruptorPublicar evaluacionId={e.id} titulo={e.titulo} publicada={e.publicada} />
      </div>

      <h3 className="text-base leading-snug font-extrabold text-titulo">{e.titulo}</h3>
      <p className="mt-0.5 text-[13px] break-all text-gris">{e.slug}</p>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Dato etiqueta="Preguntas" valor={e.preguntas} />
        <Dato etiqueta="Intentos" valor={e.intentos} />
        <Dato etiqueta="Promedio" valor={e.promedio ?? "—"} />
      </dl>

      <div className="mt-3 space-y-0.5 text-[13px] text-gris-oscuro">
        {e.apertura || e.cierre ? (
          <>
            {e.apertura && <p>Abre: {formatearFechaHora(e.apertura)}</p>}
            {e.cierre && <p>Cierra: {formatearFechaHora(e.cierre)}</p>}
          </>
        ) : (
          <p>Sin fechas</p>
        )}
        <p>
          {e.duracion_min ? `${e.duracion_min} min` : "Sin límite de tiempo"} ·{" "}
          {e.intentos_permitidos
            ? `${e.intentos_permitidos} ${e.intentos_permitidos === 1 ? "intento" : "intentos"}`
            : "Intentos ilimitados"}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <BotonEnlace href={`/admin/evaluaciones/${e.id}`} tamano="sm" className="flex-1">
          Preguntas
        </BotonEnlace>
        <Boton variante="secundario" tamano="sm" className="flex-1" onClick={() => setConfigurando(true)}>
          Configurar
        </Boton>
      </div>

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
    </Tarjeta>
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
