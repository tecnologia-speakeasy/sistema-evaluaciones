"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  cambiarActivaAction,
  duplicarPreguntaAction,
  eliminarPreguntaAction,
  reordenarPreguntasAction,
} from "@/app/admin/acciones/preguntas";
import type { ResultadoAccion } from "@/lib/acciones";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Menu, type ItemMenu } from "@/app/components/ui/Menu";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { ETIQUETA_CATEGORIA, ETIQUETA_TIPO, type PreguntaStaff } from "@/lib/preguntas/tipos";

// Lista ordenable de preguntas activas + lista de desactivadas.
// Al soltar, el orden cambia en pantalla y se guarda en una transacción;
// si falla, vuelve al orden anterior.

const INSTRUCCIONES_LECTOR = {
  draggable:
    "Para mover la pregunta, pulsa espacio o Enter. Usa las flechas para moverla y espacio o Enter para soltarla. Escape cancela.",
};

export default function ListaPreguntas({
  evaluacionId,
  activas,
  desactivadas,
  abiertasActivas,
  onEditar,
}: {
  evaluacionId: number;
  activas: PreguntaStaff[];
  desactivadas: PreguntaStaff[];
  abiertasActivas: boolean;
  onEditar: (p: PreguntaStaff) => void;
}) {
  const [orden, setOrden] = useState(activas);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<PreguntaStaff | null>(null);
  const [pendiente, iniciar] = useTransition();

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function ejecutar(accion: () => Promise<ResultadoAccion>, siFalla?: () => void) {
    setError(null);
    iniciar(async () => {
      const r = await accion();
      if (!r.ok) {
        siFalla?.();
        setError(r.error);
      }
    });
  }

  function alSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previo = orden;
    const nuevo = arrayMove(
      orden,
      orden.findIndex((p) => p.id === active.id),
      orden.findIndex((p) => p.id === over.id),
    );
    setOrden(nuevo);
    ejecutar(
      () => reordenarPreguntasAction(evaluacionId, nuevo.map((p) => p.id)),
      () => setOrden(previo),
    );
  }

  // Abiertas apagadas: las que ya existen no las ve el estudiante ni se duplican.
  const oculta = (p: PreguntaStaff) => p.tipo === "open" && !abiertasActivas;
  const acciones = (p: PreguntaStaff) => ({
    oculta: oculta(p),
    editar: () => onEditar(p),
    duplicar: () => ejecutar(() => duplicarPreguntaAction(p.id)),
    desactivar: () => ejecutar(() => cambiarActivaAction(p.id, false)),
    reactivar: () => ejecutar(() => cambiarActivaAction(p.id, true)),
    eliminar: () => setConfirmarBorrar(p),
  });

  return (
    <div aria-busy={pendiente}>
      {error && (
        <Aviso tono="error" className="mb-4">
          {error}
        </Aviso>
      )}

      <DndContext
        id="lista-preguntas"
        sensors={sensores}
        collisionDetection={closestCenter}
        onDragEnd={alSoltar}
        accessibility={{ screenReaderInstructions: INSTRUCCIONES_LECTOR }}
      >
        <SortableContext items={orden.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-3">
            {orden.map((p, i) => (
              <FilaOrdenable key={p.id} pregunta={p} posicion={i + 1} acciones={acciones(p)} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {desactivadas.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-[15px] font-bold text-gris-oscuro">
            Desactivadas ({desactivadas.length}) — no las ve el estudiante
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {desactivadas.map((p) => (
              <li key={p.id}>
                <Fila pregunta={p} acciones={acciones(p)} />
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialogo
        abierto={confirmarBorrar !== null}
        onCerrar={() => setConfirmarBorrar(null)}
        titulo="¿Eliminar la pregunta?"
      >
        {confirmarBorrar && (
          <div className="flex flex-col gap-4">
            <p className="text-[15px] text-tinta">
              Se eliminará definitivamente: <strong>«{confirmarBorrar.enunciado}»</strong>. No tiene
              respuestas de estudiantes, así que no afecta ninguna nota.
            </p>
            <div className="flex justify-end gap-2.5">
              <Boton variante="secundario" onClick={() => setConfirmarBorrar(null)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                onClick={() => {
                  const id = confirmarBorrar.id;
                  setConfirmarBorrar(null);
                  ejecutar(() => eliminarPreguntaAction(id));
                }}
              >
                Eliminar
              </Boton>
            </div>
          </div>
        )}
      </Dialogo>
    </div>
  );
}

type Acciones = {
  /** Abierta con las abiertas apagadas. */
  oculta: boolean;
  editar: () => void;
  duplicar: () => void;
  desactivar: () => void;
  reactivar: () => void;
  eliminar: () => void;
};

function FilaOrdenable({
  pregunta,
  posicion,
  acciones,
}: {
  pregunta: PreguntaStaff;
  posicion: number;
  acciones: Acciones;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: pregunta.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-90 shadow-[0_12px_30px_rgba(65,39,107,0.2)]" : ""}
    >
      <Fila
        pregunta={pregunta}
        posicion={posicion}
        acciones={acciones}
        asa={
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Mover la pregunta ${posicion}`}
            className="flex h-10 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-lg text-gris-claro hover:bg-opcion hover:text-gris-oscuro active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        }
      />
    </li>
  );
}

function resumenRespuestas(p: PreguntaStaff): string {
  const r = p.respuestas_aceptadas;
  switch (p.tipo) {
    case "multiple_choice":
      return `Correcta: ${((r as string[]) ?? []).join(" / ")}`;
    case "fill_blank":
      return ((r as string[][]) ?? [])
        .map((l, i) => `Espacio ${i + 1}: ${l.join(" / ")}`)
        .join(" · ");
    case "translation":
      return `Válidas: ${((r as string[]) ?? []).join(" / ")}`;
    case "open":
      return `Rúbrica: ${p.rubrica ?? ""}`;
  }
}

function Fila({
  pregunta: p,
  posicion,
  acciones,
  asa,
}: {
  pregunta: PreguntaStaff;
  posicion?: number;
  acciones: Acciones;
  asa?: ReactNode;
}) {
  const conRespuestas = p.respuestas > 0;
  // Visible solo la acción principal; el resto en "⋯" (Eliminar al final, en rojo).
  const masAcciones: ItemMenu[] = [
    {
      texto: "Duplicar",
      onSelect: acciones.duplicar,
      deshabilitado: acciones.oculta,
      detalle: acciones.oculta ? "Las abiertas están desactivadas" : undefined,
    },
    ...(p.activa ? [{ texto: "Desactivar", onSelect: acciones.desactivar }] : []),
    {
      texto: "Eliminar",
      onSelect: acciones.eliminar,
      peligro: true,
      deshabilitado: conRespuestas,
      detalle: conRespuestas ? "Tiene respuestas: desactívala" : undefined,
    },
  ];
  return (
    <Tarjeta relleno="p-3.5 md:p-4" className={`flex gap-3 ${p.activa ? "" : "opacity-75"}`}>
      {asa}
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-lavanda text-sm font-bold text-violeta">
        {posicion ?? "–"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <Insignia tono="lavanda">{ETIQUETA_TIPO[p.tipo]}</Insignia>
          <Insignia tono="gris">{ETIQUETA_CATEGORIA[p.categoria]}</Insignia>
          <Insignia tono="gris">{p.puntaje} pts</Insignia>
          {conRespuestas && (
            <Insignia tono="rosa">
              {p.respuestas} {p.respuestas === 1 ? "respuesta" : "respuestas"}
            </Insignia>
          )}
          {acciones.oculta && <Insignia tono="rojo">No la ven los estudiantes</Insignia>}
          {p.seccion && <span className="text-[13px] font-semibold text-gris">{p.seccion}</span>}
        </div>
        <p className="line-clamp-2 text-[15px] leading-snug font-semibold text-tinta">
          {p.enunciado}
          {p.pista && <span className="font-bold"> {p.pista}</span>}
        </p>
        <p className="mt-1 line-clamp-1 text-[13px] text-gris-oscuro">{resumenRespuestas(p)}</p>

        <div className="mt-2.5">
          {p.activa ? (
            <Boton variante="texto" className="text-[13px] !text-violeta" onClick={acciones.editar}>
              {conRespuestas ? (p.tipo === "open" ? "Ver" : "Agregar variantes") : "Editar"}
            </Boton>
          ) : (
            <Boton variante="texto" className="text-[13px] !text-violeta" onClick={acciones.reactivar}>
              Reactivar
            </Boton>
          )}
        </div>
      </div>
      <div className="-mt-1 -mr-1 shrink-0">
        <Menu
          etiqueta={posicion ? `Más acciones de la pregunta ${posicion}` : `Más acciones de «${p.enunciado.slice(0, 40)}»`}
          items={masAcciones}
        />
      </div>
    </Tarjeta>
  );
}
