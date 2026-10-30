"use client";

import { useState } from "react";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { CandidataClonar } from "@/lib/datos/evaluaciones";
import type { MaterialStaff } from "@/lib/preguntas/materiales";
import type { PreguntaStaff } from "@/lib/preguntas/tipos";
import ClonarDesde from "./ClonarDesde";
import FormPregunta from "./FormPregunta";
import ListaPreguntas from "./ListaPreguntas";
import Materiales from "./Materiales";

type Edicion = { pregunta: PreguntaStaff | null } | null;

export default function EditorPreguntas({
  evaluacionId,
  preguntas,
  materiales,
  candidatasClonar,
  abiertasActivas,
  pesosPorPregunta,
  subidaAudios,
}: {
  evaluacionId: number;
  preguntas: PreguntaStaff[];
  /** Lecturas y audios de la evaluación (db/009). */
  materiales: MaterialStaff[];
  candidatasClonar: CandidataClonar[];
  /** PREGUNTAS_ABIERTAS_ACTIVAS: apagadas, no se crean y el estudiante no ve las que haya. */
  abiertasActivas: boolean;
  /** PESOS_POR_PREGUNTA: apagado, todas valen lo mismo y no se pide el puntaje. */
  pesosPorPregunta: boolean;
  /** BLOB_READ_WRITE_TOKEN configurada: los audios se pueden subir (si no, solo enlace). */
  subidaAudios: boolean;
}) {
  const [edicion, setEdicion] = useState<Edicion>(null);
  const activas = preguntas.filter((p) => p.activa);
  const desactivadas = preguntas.filter((p) => !p.activa);
  const secciones = [...new Set(preguntas.map((p) => p.seccion).filter((s): s is string => !!s))];
  // Las subsecciones ya usadas en cada sección, en el orden de las preguntas.
  const subsecciones: Record<string, string[]> = {};
  for (const p of preguntas) {
    if (!p.seccion || !p.subseccion) continue;
    const lista = (subsecciones[p.seccion] ??= []);
    if (!lista.includes(p.subseccion)) lista.push(p.subseccion);
  }
  // Las que cuentan para el estudiante (sin las abiertas si están apagadas) y lo
  // que vale la evaluación: la suma de sus puntajes, o 100 repartido entre todas.
  const cuentan = activas.filter((p) => abiertasActivas || p.tipo !== "open");
  const valor = pesosPorPregunta
    ? `${cuentan.reduce((s, p) => s + p.puntaje, 0)} puntos en total`
    : cuentan.length > 0 &&
      `cada una vale ${(100 / cuentan.length).toLocaleString("es-CO", { maximumFractionDigits: 2 })} puntos`;
  // Una pregunta nueva sugiere la sección, la subsección y la lectura/audio de la última.
  const seccionSugerida = activas.at(-1)?.seccion ?? "";
  const subseccionSugerida = activas.at(-1)?.subseccion ?? "";
  const materialSugerido = activas.at(-1)?.material_id ?? null;
  // Si cambian los datos del servidor (orden, altas, bajas, material), la lista arranca de nuevo.
  const firma = preguntas.map((p) => `${p.id}:${p.orden}:${p.activa}:${p.material_id}`).join(",");

  const tituloDialogo = !edicion
    ? ""
    : !edicion.pregunta
      ? "Nueva pregunta"
      : edicion.pregunta.respuestas > 0
        ? "Agregar respuestas aceptadas"
        : "Editar pregunta";

  return (
    <>
      <Materiales evaluacionId={evaluacionId} materiales={materiales} subidaAudios={subidaAudios} />
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-titulo">Preguntas</h2>
            <p className="text-sm text-gris-oscuro">
              {activas.length} {activas.length === 1 ? "activa" : "activas"}
              {valor && ` · ${valor}`}
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
            abiertasActivas={abiertasActivas}
            pesosPorPregunta={pesosPorPregunta}
            materiales={materiales}
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
              subsecciones={subsecciones}
              subseccionSugerida={subseccionSugerida}
              abiertasActivas={abiertasActivas}
              pesosPorPregunta={pesosPorPregunta}
              materiales={materiales}
              materialSugerido={materialSugerido}
              onListo={() => setEdicion(null)}
              onCancelar={() => setEdicion(null)}
            />
          )}
        </Dialogo>
      </section>
    </>
  );
}
