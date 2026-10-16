"use client";

import { useState } from "react";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { CandidataClonar } from "@/lib/datos/evaluaciones";
import type { PreguntaStaff } from "@/lib/preguntas/tipos";
import ClonarDesde from "./ClonarDesde";
import FormPregunta from "./FormPregunta";
import ListaPreguntas from "./ListaPreguntas";

type Edicion = { pregunta: PreguntaStaff | null } | null;

export default function EditorPreguntas({
  evaluacionId,
  preguntas,
  candidatasClonar,
}: {
  evaluacionId: number;
  preguntas: PreguntaStaff[];
  candidatasClonar: CandidataClonar[];
}) {
  const [edicion, setEdicion] = useState<Edicion>(null);
  const activas = preguntas.filter((p) => p.activa);
  const desactivadas = preguntas.filter((p) => !p.activa);
  const secciones = [...new Set(preguntas.map((p) => p.seccion).filter((s): s is string => !!s))];
  const puntos = activas.reduce((s, p) => s + p.puntaje, 0);
  // Una pregunta nueva sugiere la sección de la última.
  const seccionSugerida = activas.at(-1)?.seccion ?? "";
  // Si cambian los datos del servidor (orden, altas, bajas), la lista arranca de nuevo.
  const firma = preguntas.map((p) => `${p.id}:${p.orden}:${p.activa}`).join(",");

  const tituloDialogo = !edicion
    ? ""
    : !edicion.pregunta
      ? "Nueva pregunta"
      : edicion.pregunta.respuestas > 0
        ? "Agregar respuestas aceptadas"
        : "Editar pregunta";

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-titulo">Preguntas</h2>
          <p className="text-sm text-gris-oscuro">
            {activas.length} {activas.length === 1 ? "activa" : "activas"} · {puntos} puntos en total
            {activas.length > 1 && " · arrastra ⠿ para reordenar"}
          </p>
        </div>
        <Boton onClick={() => setEdicion({ pregunta: null })}>+ Nueva pregunta</Boton>
      </div>

      {preguntas.length === 0 ? (
        <Tarjeta className="flex flex-col items-center gap-4 py-8 text-center">
          <div>
            <p className="font-bold text-titulo">Esta evaluación aún no tiene preguntas.</p>
            <p className="mt-1 text-sm text-gris-oscuro">
              Crea la primera o copia las de otra evaluación.
            </p>
          </div>
          {candidatasClonar.length > 0 && (
            <ClonarDesde destinoId={evaluacionId} candidatas={candidatasClonar} />
          )}
        </Tarjeta>
      ) : (
        <ListaPreguntas
          key={firma}
          evaluacionId={evaluacionId}
          activas={activas}
          desactivadas={desactivadas}
          onEditar={(p) => setEdicion({ pregunta: p })}
        />
      )}

      <Dialogo
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
        titulo={tituloDialogo}
        ancho="max-w-6xl"
      >
        {edicion && (
          <FormPregunta
            evaluacionId={evaluacionId}
            pregunta={edicion.pregunta}
            secciones={secciones}
            seccionSugerida={seccionSugerida}
            onListo={() => setEdicion(null)}
            onCancelar={() => setEdicion(null)}
          />
        )}
      </Dialogo>
    </section>
  );
}
