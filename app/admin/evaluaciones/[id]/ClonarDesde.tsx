"use client";

import { useState, useTransition } from "react";
import { clonarPreguntasAction } from "@/app/admin/acciones/preguntas";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Selector } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";
import type { CandidataClonar } from "@/lib/datos/evaluaciones";

// Copia las preguntas activas de otra evaluación (clonar_preguntas). Es una acción
// masiva: muestra cuántas se copiarán y pide confirmación.
export default function ClonarDesde({
  destinoId,
  candidatas,
}: {
  destinoId: number;
  candidatas: CandidataClonar[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [origenId, setOrigenId] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const origen = candidatas.find((c) => c.id === origenId) ?? null;

  // Agrupadas por generación para el <select>.
  const grupos = new Map<string, CandidataClonar[]>();
  for (const c of candidatas) {
    const clave = `${c.generacion_nombre} (${c.generacion_codigo})`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), c]);
  }

  function cerrar() {
    setAbierto(false);
    setConfirmando(false);
    setError(null);
  }

  function clonar() {
    if (!origen) return;
    setError(null);
    iniciar(async () => {
      const r = await clonarPreguntasAction(destinoId, origen.id);
      if (!r.ok) {
        setError(r.error);
        setConfirmando(false);
        return;
      }
      cerrar();
    });
  }

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Clonar preguntas desde…
      </Boton>
      <Dialogo abierto={abierto} onCerrar={cerrar} titulo="Clonar preguntas desde otra evaluación">
        {!confirmando ? (
          <div className="flex flex-col gap-4">
            <Campo
              etiqueta="Evaluación de origen"
              htmlFor="clonar-origen"
              ayuda="Se copian solo las preguntas activas, en el mismo orden."
            >
              <Selector
                id="clonar-origen"
                value={origenId ?? ""}
                onChange={(e) => setOrigenId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Elige una evaluación…</option>
                {[...grupos].map(([grupo, lista]) => (
                  <optgroup key={grupo} label={grupo}>
                    {lista.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.titulo} — {c.preguntas} {c.preguntas === 1 ? "pregunta" : "preguntas"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Selector>
            </Campo>
            {error && <Aviso tono="error">{error}</Aviso>}
            <Boton disabled={!origen} onClick={() => setConfirmando(true)} ancho>
              Continuar
            </Boton>
          </div>
        ) : (
          origen && (
            <div className="flex flex-col gap-4">
              <Aviso>
                Se copiarán <strong>{origen.preguntas}</strong>{" "}
                {origen.preguntas === 1 ? "pregunta activa" : "preguntas activas"} de{" "}
                <strong>«{origen.titulo}»</strong> ({origen.generacion_codigo}) a esta evaluación.
                Después podrás editarlas sin afectar la original.
              </Aviso>
              <div className="flex justify-end gap-2.5">
                <Boton variante="secundario" onClick={() => setConfirmando(false)} disabled={pendiente}>
                  Atrás
                </Boton>
                <Boton onClick={clonar} disabled={pendiente}>
                  {pendiente ? "Clonando…" : `Clonar ${origen.preguntas} preguntas`}
                </Boton>
              </div>
            </div>
          )
        )}
      </Dialogo>
    </>
  );
}
