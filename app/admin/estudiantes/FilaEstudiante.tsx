"use client";

import { useEffect, useState, useTransition } from "react";
import {
  cambiarActivoEstudianteAction,
  eliminarEstudianteAction,
  resumenEliminarEstudianteAction,
  type ResultadoResumenEstudiante,
} from "@/app/admin/acciones/estudiantes";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Interruptor } from "@/app/components/ui/Interruptor";
import { Menu } from "@/app/components/ui/Menu";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { EstudianteLista } from "@/lib/datos/estudiantes";
import type { OpcionGeneracion } from "./BarraEstudiantes";
import { EditarEstudiante } from "./FormEstudiante";

// Un estudiante: correo, el último nombre con el que entró, sus intentos,
// manychat_id y activo. "⋯": editar (correo, generación, manychat_id) y
// eliminar. Desactivar no borra nada: deja de poder entrar.
export default function FilaEstudiante({
  estudiante: e,
  generacionId,
  generaciones,
}: {
  estudiante: EstudianteLista;
  generacionId: number;
  generaciones: OpcionGeneracion[];
}) {
  const [dialogo, setDialogo] = useState<"editar" | "eliminar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cerrar = () => setDialogo(null);

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
        <p className="mt-0.5 text-sm text-gris-oscuro">
          manychat_id: <span className="font-semibold text-tinta">{e.manychat_id ?? "—"}</span>
        </p>
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
        <Menu
          etiqueta={`Acciones de ${e.email}`}
          items={[
            { texto: "Editar", onSelect: () => setDialogo("editar") },
            { texto: "Eliminar", peligro: true, onSelect: () => setDialogo("eliminar") },
          ]}
        />
      </div>

      <Dialogo abierto={dialogo === "editar"} onCerrar={cerrar} titulo="Editar estudiante">
        <EditarEstudiante estudiante={e} generacionId={generacionId} generaciones={generaciones} onCerrar={cerrar} />
      </Dialogo>
      <Dialogo abierto={dialogo === "eliminar"} onCerrar={cerrar} titulo="¿Eliminar al estudiante?">
        <Eliminar estudiante={e} onCerrar={cerrar} />
      </Dialogo>
    </Tarjeta>
  );
}

// Irreversible: primero el resumen (pedido al abrir, así está al día). Si solo
// se quiere que no entre, se ofrece desactivarlo.
function Eliminar({ estudiante: e, onCerrar }: { estudiante: EstudianteLista; onCerrar: () => void }) {
  const [resumen, setResumen] = useState<ResultadoResumenEstudiante | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<"desactivar" | "eliminar" | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    let vigente = true;
    void resumenEliminarEstudianteAction(e.id).then((r) => vigente && setResumen(r));
    return () => {
      vigente = false;
    };
  }, [e.id]);

  if (!resumen) return <p className="text-[15px] text-gris-oscuro">Revisando lo que se borraría…</p>;
  if (!resumen.ok) return <Aviso tono="error">{resumen.error}</Aviso>;
  const { intentos } = resumen.resumen;

  function ejecutar(
    cual: "desactivar" | "eliminar",
    accion: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) {
    setError(null);
    setEnCurso(cual);
    iniciar(async () => {
      const r = await accion();
      if (r.ok) onCerrar();
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 text-[15px] text-tinta">
      <Aviso tono="error">
        <strong>Esto no se puede deshacer.</strong> Se borra <strong className="break-words">{resumen.resumen.email}</strong>
        {intentos === 0
          ? "; no tiene intentos."
          : ` con ${intentos === 1 ? "su intento" : `sus ${intentos.toLocaleString("es-CO")} intentos`} (puntajes y feedback).`}
      </Aviso>
      <p className="text-sm text-gris-oscuro">
        Dejará de poder entrar. Si solo quieres eso y conservar sus resultados, desactívalo en vez de eliminarlo.
      </p>
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
        {e.activo && (
          <Boton
            variante="secundario"
            disabled={pendiente}
            onClick={() => ejecutar("desactivar", () => cambiarActivoEstudianteAction(e.id, false))}
          >
            {pendiente && enCurso === "desactivar" ? "Desactivando…" : "Desactivar"}
          </Boton>
        )}
        <Boton
          variante="peligro"
          disabled={pendiente}
          onClick={() => ejecutar("eliminar", () => eliminarEstudianteAction(e.id))}
        >
          {pendiente && enCurso === "eliminar" ? "Eliminando…" : "Eliminar estudiante"}
        </Boton>
      </div>
    </div>
  );
}
