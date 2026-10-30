"use client";

import { useState, useTransition } from "react";
import { eliminarMaterialAction } from "@/app/admin/acciones/materiales";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { ETIQUETA_MATERIAL, type MaterialStaff, type TipoMaterial } from "@/lib/preguntas/materiales";
import FormMaterial from "./FormMaterial";

// Lecturas y audios de la evaluación (db/009): cada uno con varias preguntas
// ligadas, que se eligen en el formulario de la pregunta.

type Edicion = { material: MaterialStaff | null; tipo: TipoMaterial } | null;

export default function Materiales({
  evaluacionId,
  materiales,
  subidaAudios,
}: {
  evaluacionId: number;
  materiales: MaterialStaff[];
  subidaAudios: boolean;
}) {
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [borrar, setBorrar] = useState<MaterialStaff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const titulo = !edicion
    ? ""
    : edicion.material
      ? `Editar ${ETIQUETA_MATERIAL[edicion.material.tipo].toLowerCase()}`
      : `Nueva ${edicion.tipo === "lectura" ? "lectura" : "grabación"}`;

  function eliminar(m: MaterialStaff) {
    setBorrar(null);
    setError(null);
    iniciar(async () => {
      const r = await eliminarMaterialAction(m.id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <section className="mb-9" aria-busy={pendiente}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-titulo">Lecturas y audios</h2>
          <p className="text-sm text-gris-oscuro">
            Un texto o una grabación con varias preguntas (reading / listening). Al crear o editar una pregunta, eliges
            a cuál va ligada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => setEdicion({ material: null, tipo: "lectura" })}>
            + Lectura
          </Boton>
          <Boton variante="secundario" onClick={() => setEdicion({ material: null, tipo: "audio" })}>
            + Audio
          </Boton>
        </div>
      </div>

      {error && (
        <Aviso tono="error" className="mb-4">
          {error}
        </Aviso>
      )}

      {materiales.length === 0 ? (
        <p className="text-sm text-gris">Esta evaluación aún no tiene lecturas ni audios.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {materiales.map((m) => (
            <li key={m.id}>
              <Tarjeta relleno="p-3.5 md:p-4" className="flex h-full flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Insignia tono="lavanda">{ETIQUETA_MATERIAL[m.tipo]}</Insignia>
                  <Insignia tono={m.preguntas ? "gris" : "rojo"}>
                    {m.preguntas === 0
                      ? "Sin preguntas"
                      : `${m.preguntas} ${m.preguntas === 1 ? "pregunta" : "preguntas"}`}
                  </Insignia>
                </div>
                <p className="font-semibold text-tinta">{m.titulo}</p>
                <p className="line-clamp-2 text-[13px] text-gris-oscuro">
                  {m.tipo === "lectura" ? m.texto : (m.texto ?? m.audio_url)}
                </p>
                <div className="mt-auto flex gap-4 pt-1">
                  <Boton variante="texto" className="text-[13px] !text-violeta" onClick={() => setEdicion({ material: m, tipo: m.tipo })}>
                    Editar
                  </Boton>
                  <Boton
                    variante="texto"
                    className="text-[13px] !text-error disabled:!text-gris-claro"
                    disabled={m.con_respuestas}
                    title={m.con_respuestas ? "Sus preguntas ya tienen respuestas: no se puede eliminar" : undefined}
                    onClick={() => setBorrar(m)}
                  >
                    Eliminar
                  </Boton>
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}

      <Dialogo abierto={edicion !== null} onCerrar={() => setEdicion(null)} titulo={titulo} ancho="max-w-6xl">
        {edicion && (
          <FormMaterial
            evaluacionId={evaluacionId}
            material={edicion.material}
            tipoInicial={edicion.tipo}
            subidaAudios={subidaAudios}
            onListo={() => setEdicion(null)}
            onCancelar={() => setEdicion(null)}
          />
        )}
      </Dialogo>

      <Dialogo abierto={borrar !== null} onCerrar={() => setBorrar(null)} titulo="¿Eliminar?">
        {borrar && (
          <div className="flex flex-col gap-4">
            <p className="text-[15px] text-tinta">
              Se eliminará <strong>«{borrar.titulo}»</strong>.
              {borrar.preguntas > 0 &&
                ` Sus ${borrar.preguntas === 1 ? "pregunta queda" : `${borrar.preguntas} preguntas quedan`} sin lectura ni audio (no se borran).`}
            </p>
            <div className="flex justify-end gap-2.5">
              <Boton variante="secundario" onClick={() => setBorrar(null)}>
                Cancelar
              </Boton>
              <Boton variante="peligro" onClick={() => eliminar(borrar)}>
                Eliminar
              </Boton>
            </div>
          </div>
        )}
      </Dialogo>
    </section>
  );
}
