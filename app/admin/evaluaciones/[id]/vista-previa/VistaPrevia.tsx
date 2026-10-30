"use client";

import { useState } from "react";
import {
  PreguntaEstudiante,
  type RespuestaEstudiante,
} from "@/app/components/preguntas/PreguntaEstudiante";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton, BotonEnlace } from "@/app/components/ui/Boton";
import { Encabezado } from "@/app/components/ui/Encabezado";
import type { Material } from "@/lib/preguntas/materiales";
import { posicionesPorSeccion, type PreguntaPublica } from "@/lib/preguntas/tipos";

// Pantalla del examen de ../evaluacion-a2 (xs.page, xs.topbar, xs.progressRow,
// xs.navRow, xs.sidebar), con las preguntas de v_preguntas_publicas.
// Cubre todo el dashboard (como el modo revisión de a2) y no guarda nada.

const VENTANA = 9; // a2 muestra 9 pasos en la barra lateral

function duracionTexto(min: number | null) {
  if (!min) return "Sin límite";
  const h = Math.floor(min / 60);
  return `${String(h).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
}

export default function VistaPrevia({
  preguntas,
  materiales,
  duracionMin,
  volverA,
}: {
  preguntas: PreguntaPublica[];
  /** Lecturas y audios de las preguntas (db/009). */
  materiales: Material[];
  duracionMin: number | null;
  volverA: string;
}) {
  const [actual, setActual] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<number, RespuestaEstudiante>>({});
  const posiciones = posicionesPorSeccion(preguntas);
  const total = preguntas.length;

  const cerrar = (
    <BotonEnlace href={volverA} variante="barra" tamano="barra">
      Cerrar vista previa
    </BotonEnlace>
  );

  if (total === 0) {
    return (
      <div className="fondo-pagina fixed inset-0 z-50 overflow-y-auto text-tinta">
        <Encabezado nombre="Estudiante">{cerrar}</Encabezado>
        <div className="mx-auto max-w-[760px] px-[18px] py-12 text-center">
          <p className="text-lg font-bold text-titulo">Esta evaluación no tiene preguntas activas.</p>
        </div>
      </div>
    );
  }

  const p = preguntas[actual];
  const pos = posiciones[actual];
  const pct = ((actual + 1) / total) * 100;
  const esUltima = actual >= total - 1;

  // Pasos de la barra lateral: ventana de 9 dentro de la sección actual.
  const idxEnSeccion = pos.numero - 1;
  const desdeVentana =
    pos.largo > VENTANA ? Math.min(Math.max(0, idxEnSeccion - 4), pos.largo - VENTANA) : 0;
  const pasos = Array.from(
    { length: Math.min(VENTANA, pos.largo) },
    (_, j) => desdeVentana + j,
  );

  return (
    <div className="fondo-pagina fixed inset-0 z-50 overflow-y-auto text-tinta">
      <Encabezado nombre="Estudiante">{cerrar}</Encabezado>

      <div className="mx-auto flex w-full max-w-[1180px] items-start px-[18px] pt-[18px] pb-10 md:gap-7 md:px-7 md:pt-[34px] md:pb-12">
        <main className="min-w-0 flex-1">
          <Aviso className="mb-5">
            <strong>Vista previa:</strong> así verá el estudiante esta evaluación. Lo que respondas aquí no se guarda.
          </Aviso>

          {/* xs.progressRow */}
          <div className="mb-[30px] flex items-center gap-4">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgba(120,90,180,0.15)]">
              <div
                className="degradado-progreso h-full rounded-full transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 text-[15px] font-semibold text-gris">
              {pos.numero}/{pos.largo}
            </span>
          </div>

          {/* Sin key por pregunta, como en el examen: el audio sigue entre las de la misma grabación. */}
          <PreguntaEstudiante
            pregunta={p}
            numero={pos.numero}
            respuesta={respuestas[p.id] ?? null}
            onCambio={(r) => setRespuestas((prev) => ({ ...prev, [p.id]: r }))}
            material={p.material_id ? materiales.find((m) => m.id === p.material_id) : null}
          />

          {/* xs.navRow */}
          <div className="mt-9 flex justify-between">
            <Boton
              variante="secundario"
              onClick={() => setActual((i) => Math.max(0, i - 1))}
              disabled={actual === 0}
              className="disabled:!opacity-40"
            >
              ← Anterior
            </Boton>
            <Boton
              onClick={() => setActual((i) => Math.min(total - 1, i + 1))}
              disabled={esUltima}
              title={esUltima ? "En la vista previa no se envía" : undefined}
              className="!px-[26px]"
            >
              {esUltima ? "Finalizar ✓" : "Siguiente →"}
            </Boton>
          </div>
        </main>

        {/* xs.sidebar: tiempo + pasos (solo escritorio) */}
        <aside className="hidden w-[270px] shrink-0 flex-col gap-[18px] md:flex">
          <div className="rounded-2xl bg-lavanda px-5 py-4 text-center">
            <p className="mb-1 text-[13px] text-gris">Tiempo restante</p>
            <p className="text-[28px] font-extrabold tracking-[1px] text-tinta">
              {duracionTexto(duracionMin)}
            </p>
          </div>
          <div className="max-h-[380px] overflow-y-auto rounded-2xl bg-lavanda px-[22px] py-[18px]">
            {pasos.map((enSeccion, j) => {
              const global = pos.inicio + enSeccion;
              const hecho = enSeccion <= idxEnSeccion;
              const esActual = enSeccion === idxEnSeccion;
              return (
                <button
                  key={global}
                  type="button"
                  onClick={() => setActual(global)}
                  className="flex h-[34px] w-full cursor-pointer items-center gap-3 text-left"
                >
                  <span className="relative flex h-[34px] w-[18px] shrink-0 items-center justify-center">
                    {j > 0 && (
                      <span
                        className={`absolute top-0 h-[17px] w-0.5 ${enSeccion <= idxEnSeccion ? "bg-rosa" : "bg-linea-paso"}`}
                      />
                    )}
                    {j < pasos.length - 1 && (
                      <span
                        className={`absolute top-[17px] h-[17px] w-0.5 ${enSeccion < idxEnSeccion ? "bg-rosa" : "bg-linea-paso"}`}
                      />
                    )}
                    <span
                      className={`z-10 rounded-full ${esActual ? "size-[15px] shadow-[0_0_0_4px_rgba(255,50,125,0.18)]" : "size-[13px]"} ${
                        hecho ? "bg-rosa" : "border-2 border-borde-paso bg-white"
                      }`}
                    />
                  </span>
                  <span
                    className={`text-sm ${esActual ? "font-bold text-tinta" : hecho ? "font-medium text-gris-oscuro" : "font-medium text-gris-claro"}`}
                  >
                    Ejercicio {enSeccion + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
