"use client";

import { useState, useTransition } from "react";
import { eliminarIntentosAction } from "@/app/admin/acciones/intentos";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Icono } from "@/app/components/ui/Icono";
import { Insignia, type TonoInsignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { FilaResultado } from "@/lib/datos/resultados";
import { formatearFechaHora } from "@/lib/fechas";
import { codigoEvaluacion, etiquetaEstado, type EstadoIntento } from "@/lib/resultados";

// Intentos filtrados: tabla desde 1024px y tarjetas en celular/tableta.
// Grammar, Writing, Reading y Listening son aciertos (como v_resultados). "Ver" abre el resultado
// público (/resultado/[token]); un intento en curso todavía no tiene.
// El admin elimina intentos: uno con su caneca o varios marcándolos (los de esta
// página), siempre con confirmación.

const TONO: Record<EstadoIntento, TonoInsignia> = {
  listo: "verde",
  pendiente: "lavanda",
  calificando: "lavanda",
  error: "rojo",
  en_progreso: "gris",
};

const fecha = (f: FilaResultado) => formatearFechaHora(f.envio ?? f.inicio);
const nada = (v: number | null) => (v === null ? "—" : v);
const descripcion = (f: FilaResultado) => `${codigoEvaluacion(f.tipo, f.numero)} · intento ${f.numero_intento}`;

function Ver({ f }: { f: FilaResultado }) {
  if (f.estado === "en_progreso") return null;
  return (
    <a
      href={`/resultado/${f.token}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[13px] font-semibold whitespace-nowrap text-violeta hover:underline"
    >
      Ver ↗
    </a>
  );
}

function BotonEliminar({ f, onClick }: { f: FilaResultado; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Eliminar intento"
      aria-label={`Eliminar ${descripcion(f)} de ${f.nombre}`}
      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gris hover:bg-error/10 hover:text-error"
    >
      <Icono nombre="basura" className="size-[18px]" />
    </button>
  );
}

function Casilla({ marcada, onCambio, etiqueta }: { marcada: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <input
      type="checkbox"
      checked={marcada}
      onChange={(e) => onCambio(e.target.checked)}
      aria-label={etiqueta}
      className="size-[18px] cursor-pointer accent-violeta"
    />
  );
}

export default function TablaResultados({ filas, puedeEliminar }: { filas: FilaResultado[]; puedeEliminar: boolean }) {
  const [seleccion, setSeleccion] = useState<number[]>([]);
  /** Los intentos que se van a eliminar (abre la confirmación). */
  const [aEliminar, setAEliminar] = useState<FilaResultado[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Solo cuentan los que siguen en la página (tras eliminar o refrescar).
  const elegidas = filas.filter((f) => seleccion.includes(f.intento_id));
  const todas = filas.length > 0 && elegidas.length === filas.length;
  const marcar = (id: number, v: boolean) =>
    setSeleccion((s) => (v ? [...s, id] : s.filter((x) => x !== id)));

  if (filas.length === 0) {
    return (
      <>
        {aviso && <Aviso tono="exito" className="mb-3">{aviso}</Aviso>}
        <Tarjeta className="text-center">
          <p className="font-bold text-titulo">No hay intentos con estos filtros.</p>
          <p className="mt-1 text-sm text-gris-oscuro">Prueba con otro estado o quita los filtros.</p>
        </Tarjeta>
      </>
    );
  }
  return (
    <>
      {aviso && <Aviso tono="exito" className="mb-3">{aviso}</Aviso>}
      {puedeEliminar && elegidas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border-[1.5px] border-borde bg-lavanda px-4 py-2.5">
          <p className="text-sm font-semibold text-tinta">
            {elegidas.length} {elegidas.length === 1 ? "intento seleccionado" : "intentos seleccionados"}
          </p>
          <div className="flex items-center gap-2">
            <Boton variante="texto" tamano="sm" onClick={() => setSeleccion([])}>
              Quitar selección
            </Boton>
            <Boton variante="peligro" tamano="sm" onClick={() => setAEliminar(elegidas)}>
              Eliminar seleccionados
            </Boton>
          </div>
        </div>
      )}

      <div className="hidden overflow-x-auto rounded-[14px] border-[1.5px] border-borde bg-white lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-lavanda text-[13px] text-gris-oscuro">
            <tr>
              {puedeEliminar && (
                <th scope="col" className="w-10 py-3 pr-1 pl-4">
                  <Casilla
                    marcada={todas}
                    onCambio={(v) => setSeleccion(v ? filas.map((f) => f.intento_id) : [])}
                    etiqueta="Seleccionar todos los intentos de esta página"
                  />
                </th>
              )}
              <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estudiante</th>
              <th scope="col" className="px-4 py-3 font-semibold">Evaluación</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Puntaje</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Grammar</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Writing</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Reading</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Listening</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold" title="Cambios de pestaña">
                Pestañas
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={f.intento_id}
                className={`border-t border-borde-suave align-top ${seleccion.includes(f.intento_id) ? "bg-lavanda/60" : ""}`}
              >
                {puedeEliminar && (
                  <td className="py-3 pr-1 pl-4">
                    <Casilla
                      marcada={seleccion.includes(f.intento_id)}
                      onCambio={(v) => marcar(f.intento_id, v)}
                      etiqueta={`Seleccionar ${descripcion(f)} de ${f.nombre}`}
                    />
                  </td>
                )}
                <td className="px-4 py-3 whitespace-nowrap text-gris-oscuro">{fecha(f)}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-tinta">{f.nombre}</p>
                  <p className="text-[13px] break-all text-gris-oscuro">{f.email}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="font-semibold text-tinta">{descripcion(f)}</p>
                  <p className="text-[13px] text-gris-oscuro">{f.generacion}</p>
                </td>
                <td className="px-4 py-3">
                  <Insignia tono={TONO[f.estado]}>{etiquetaEstado(f.estado)}</Insignia>
                </td>
                <td className="px-4 py-3 text-right text-[15px] font-extrabold text-titulo">{nada(f.puntaje_total)}</td>
                <td className="px-4 py-3 text-right">{nada(f.grammar_score)}</td>
                <td className="px-4 py-3 text-right">{nada(f.writing_score)}</td>
                <td className="px-4 py-3 text-right">{nada(f.reading_score)}</td>
                <td className="px-4 py-3 text-right">{nada(f.listening_score)}</td>
                <td className={`px-4 py-3 text-right ${f.cambios_pestana > 0 ? "font-semibold text-error-texto" : ""}`}>
                  {f.cambios_pestana}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Ver f={f} />
                    {puedeEliminar && <BotonEliminar f={f} onClick={() => setAEliminar([f])} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2.5 lg:hidden">
        {puedeEliminar && (
          <li>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gris-oscuro">
              <Casilla
                marcada={todas}
                onCambio={(v) => setSeleccion(v ? filas.map((f) => f.intento_id) : [])}
                etiqueta="Seleccionar todos los intentos de esta página"
              />
              Seleccionar todos
            </label>
          </li>
        )}
        {filas.map((f) => (
          <li key={f.intento_id}>
            <Tarjeta relleno="p-4" className={seleccion.includes(f.intento_id) ? "!border-violeta" : ""}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {puedeEliminar && (
                  <Casilla
                    marcada={seleccion.includes(f.intento_id)}
                    onCambio={(v) => marcar(f.intento_id, v)}
                    etiqueta={`Seleccionar ${descripcion(f)} de ${f.nombre}`}
                  />
                )}
                <Insignia tono={TONO[f.estado]}>{etiquetaEstado(f.estado)}</Insignia>
                <span className="text-[13px] text-gris">
                  {descripcion(f)} · {f.generacion}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-titulo">{f.nombre}</p>
                  <p className="text-[13px] break-all text-gris-oscuro">{f.email}</p>
                </div>
                <p className="shrink-0 text-[22px] leading-none font-extrabold text-titulo">
                  {nada(f.puntaje_total)}
                  {f.puntaje_total !== null && <span className="text-sm font-semibold text-gris">/100</span>}
                </p>
              </div>
              <p className="mt-2 text-[13px] text-gris-oscuro">
                Grammar {nada(f.grammar_score)} · Writing {nada(f.writing_score)} · Reading{" "}
                {nada(f.reading_score)} · Listening {nada(f.listening_score)} ·{" "}
                <span className={f.cambios_pestana > 0 ? "font-semibold text-error-texto" : ""}>
                  {f.cambios_pestana} {f.cambios_pestana === 1 ? "cambio" : "cambios"} de pestaña
                </span>
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="text-[13px] text-gris">{fecha(f)}</span>
                <div className="flex items-center gap-2">
                  <Ver f={f} />
                  {puedeEliminar && <BotonEliminar f={f} onClick={() => setAEliminar([f])} />}
                </div>
              </div>
            </Tarjeta>
          </li>
        ))}
      </ul>

      <Dialogo
        abierto={aEliminar !== null}
        onCerrar={() => setAEliminar(null)}
        titulo={aEliminar?.length === 1 ? "¿Eliminar el intento?" : `¿Eliminar ${aEliminar?.length ?? 0} intentos?`}
      >
        {aEliminar && (
          <ConfirmarEliminar
            filas={aEliminar}
            onCerrar={() => setAEliminar(null)}
            onListo={(n) => {
              setAEliminar(null);
              setSeleccion([]);
              setAviso(n === 1 ? "Se eliminó 1 intento." : `Se eliminaron ${n} intentos.`);
            }}
          />
        )}
      </Dialogo>
    </>
  );
}

const MAX_LISTA = 6;

// Irreversible: dice qué se borra (los primeros de la lista) y qué pasa después.
function ConfirmarEliminar({
  filas,
  onCerrar,
  onListo,
}: {
  filas: FilaResultado[];
  onCerrar: () => void;
  onListo: (eliminados: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const enCurso = filas.filter((f) => f.estado === "en_progreso").length;
  const uno = filas.length === 1;

  function eliminar() {
    setError(null);
    iniciar(async () => {
      const r = await eliminarIntentosAction(filas.map((f) => f.intento_id));
      if (r.ok) onListo(r.eliminados);
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 text-[15px] text-tinta">
      <Aviso tono="error">
        <strong>Esto no se puede deshacer.</strong>{" "}
        {uno ? "Se borra el intento" : `Se borran ${filas.length} intentos`} con sus respuestas, puntaje y feedback.
      </Aviso>
      <ul className="flex flex-col gap-1.5 text-sm">
        {filas.slice(0, MAX_LISTA).map((f) => (
          <li key={f.intento_id} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0">
              <strong className="text-titulo">{f.nombre}</strong>{" "}
              <span className="break-all text-gris-oscuro">{f.email}</span>
            </span>
            <span className="text-[13px] whitespace-nowrap text-gris-oscuro">
              {descripcion(f)} · {f.puntaje_total === null ? etiquetaEstado(f.estado) : `${f.puntaje_total}/100`}
            </span>
          </li>
        ))}
        {filas.length > MAX_LISTA && (
          <li className="text-[13px] text-gris-oscuro">y {filas.length - MAX_LISTA} más.</li>
        )}
      </ul>
      {enCurso > 0 && (
        <Aviso>
          {enCurso === 1
            ? (uno ? "Está" : "Uno está") + " en curso: el estudiante pierde lo que lleva respondido."
            : `${enCurso} están en curso: esos estudiantes pierden lo que llevan respondido.`}
        </Aviso>
      )}
      <p className="text-sm text-gris-oscuro">
        Si la evaluación tiene intentos limitados, el estudiante recupera ese intento, y sus otros intentos en esa
        evaluación se renumeran. El enlace del resultado deja de funcionar; el correo que ya recibió no se puede recoger.
      </p>
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton variante="peligro" disabled={pendiente} onClick={eliminar}>
          {pendiente ? "Eliminando…" : uno ? "Eliminar intento" : `Eliminar ${filas.length} intentos`}
        </Boton>
      </div>
    </div>
  );
}
