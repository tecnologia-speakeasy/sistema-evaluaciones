"use client";

import { useState, useTransition, type FormEvent } from "react";
import { cambiarActivoEstudianteAction, guardarManychatAction } from "@/app/admin/acciones/estudiantes";
import { Boton } from "@/app/components/ui/Boton";
import { Entrada } from "@/app/components/ui/Campo";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Interruptor } from "@/app/components/ui/Interruptor";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { EstudianteLista } from "@/lib/datos/estudiantes";

// Un estudiante: correo, el último nombre con el que entró, sus intentos,
// manychat_id (editable) y activo. Desactivar no borra nada: deja de poder entrar.
export default function FilaEstudiante({ estudiante: e }: { estudiante: EstudianteLista }) {
  const [editando, setEditando] = useState(false);
  const [manychat, setManychat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function guardar(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await guardarManychatAction(e.id, manychat);
      if (r.ok) setEditando(false);
      else setError(r.error);
    });
  }

  function activar(valor: boolean) {
    setError(null);
    iniciar(async () => {
      const r = await cambiarActivoEstudianteAction(e.id, valor);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <Tarjeta
      relleno="p-4 md:px-5"
      className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`font-bold break-all ${e.activo ? "text-titulo" : "text-gris-oscuro"}`}>{e.email}</p>
          {!e.activo && <Insignia tono="gris">Inactivo</Insignia>}
        </div>
        <p className="mt-0.5 text-sm text-gris-oscuro">
          {e.ultimo_nombre && <span className="font-semibold text-tinta">{e.ultimo_nombre} · </span>}
          {e.intentos === 0 ? "Sin intentos" : `${e.intentos} ${e.intentos === 1 ? "intento" : "intentos"}`}
        </p>

        {editando ? (
          <form onSubmit={guardar} className="mt-2 flex flex-wrap items-center gap-2">
            <Entrada
              aria-label={`manychat_id de ${e.email}`}
              inputMode="numeric"
              maxLength={20}
              autoFocus
              value={manychat}
              onChange={(ev) => setManychat(ev.target.value)}
              placeholder="Vacío = sin WhatsApp"
              className="!w-[220px] !py-2"
              invalida={!!error}
            />
            <Boton type="submit" tamano="sm" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Boton>
            <Boton
              variante="texto"
              className="text-[13px]"
              onClick={() => {
                setEditando(false);
                setError(null);
              }}
            >
              Cancelar
            </Boton>
          </form>
        ) : (
          <p className="mt-0.5 text-sm text-gris-oscuro">
            manychat_id: <span className="font-semibold text-tinta">{e.manychat_id ?? "—"}</span>{" "}
            <Boton
              variante="texto"
              className="ml-1 text-[13px] !text-violeta"
              onClick={() => {
                setManychat(e.manychat_id ?? "");
                setEditando(true);
              }}
            >
              Editar
            </Boton>
          </p>
        )}
        {error && (
          <p role="alert" className="mt-1 text-[13px] text-error-texto">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5 md:shrink-0">
        <span className="text-sm font-semibold text-tinta">{e.activo ? "Activo" : "Inactivo"}</span>
        <Interruptor
          activo={e.activo}
          onCambio={activar}
          deshabilitado={pendiente}
          etiqueta={e.activo ? `Desactivar a ${e.email}` : `Activar a ${e.email}`}
        />
      </div>
    </Tarjeta>
  );
}
