"use client";

import { useState } from "react";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { MejorPorEvaluacion } from "@/lib/datos/intentos";
import { GraficoHistorial } from "./GraficoHistorial";

// "Mi historial" del inicio: abre un pop-up con la tarjeta «Evolución» (la de la
// antigua página /historial, sin la lista de intentos): su mejor puntaje en cada
// evaluación, con el promedio y el mejor de esos puntajes.
export function BotonHistorial({ mejores }: { mejores: MejorPorEvaluacion[] }) {
  const [abierto, setAbierto] = useState(false);
  const puntajes = mejores.flatMap((m) => (m.mejor === null ? [] : [m.mejor]));
  const promedio = puntajes.length ? Math.round(puntajes.reduce((s, p) => s + p, 0) / puntajes.length) : null;

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Mi historial
      </Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} etiqueta="Mi historial" ancho="max-w-4xl">
        <Tarjeta as="section" aria-labelledby="titulo-evolucion">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="titulo-evolucion" className="text-lg font-extrabold text-titulo">
              Evolución
            </h2>
            {promedio !== null && (
              <p className="text-sm text-gris-oscuro">
                Promedio <strong className="text-tinta">{promedio}/100</strong> · Mejor{" "}
                <strong className="text-tinta">{Math.max(...puntajes)}/100</strong>
              </p>
            )}
          </div>
          {/* En celular la gráfica se desliza a los lados: las 17 evaluaciones no caben a lo ancho. */}
          <div className="overflow-x-auto">
            <GraficoHistorial mejores={mejores} />
          </div>
        </Tarjeta>
      </Dialogo>
    </>
  );
}
