"use client";

import { useState, useTransition } from "react";
import { cambiarActivaGeneracionAction } from "@/app/admin/acciones/generaciones";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Interruptor } from "@/app/components/ui/Interruptor";

// Activar / desactivar la generación (solo admin), siempre con confirmación y el
// resumen de a quién afecta. Desactivar no borra nada.
export default function InterruptorGeneracion({
  generacionId,
  nombre,
  activa,
  estudiantes,
  enCurso,
}: {
  generacionId: number;
  nombre: string;
  activa: boolean;
  estudiantes: number;
  enCurso: number;
}) {
  const [porConfirmar, setPorConfirmar] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function cerrar() {
    setPorConfirmar(null);
    setError(null);
  }

  function confirmar() {
    if (porConfirmar === null) return;
    const valor = porConfirmar;
    iniciar(async () => {
      const r = await cambiarActivaGeneracionAction(generacionId, valor);
      if (r.ok) setPorConfirmar(null);
      else setError(r.error);
    });
  }

  const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-sm font-semibold text-tinta">{activa ? "Activa" : "Desactivada"}</span>
      <Interruptor
        activo={activa}
        onCambio={(v) => setPorConfirmar(v)}
        deshabilitado={pendiente}
        etiqueta={activa ? `Desactivar ${nombre}` : `Activar ${nombre}`}
      />
      <Dialogo
        abierto={porConfirmar !== null}
        onCerrar={cerrar}
        titulo={porConfirmar ? "¿Activar la generación?" : "¿Desactivar la generación?"}
      >
        <div className="flex flex-col gap-4 text-[15px] text-tinta">
          {porConfirmar ? (
            <p>
              Los estudiantes de <strong>{nombre}</strong> volverán a ver sus evaluaciones publicadas y podrán continuar
              los intentos que dejaron en curso.
            </p>
          ) : (
            <>
              <p>
                Los {plural(estudiantes, "estudiante activo", "estudiantes activos")} de <strong>{nombre}</strong>{" "}
                podrán entrar y ver su historial, pero <strong>no verán evaluaciones</strong> ni podrán empezar o
                continuar intentos.
              </p>
              {enCurso > 0 && (
                <p>
                  Hay {plural(enCurso, "intento en curso", "intentos en curso")}: se conservan con lo que llevan
                  respondido y se podrán retomar si la reactivas.
                </p>
              )}
              <p className="text-sm text-gris-oscuro">No se borra nada. Puedes reactivarla cuando quieras.</p>
            </>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-error-texto">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton variante={porConfirmar ? "primario" : "peligro"} disabled={pendiente} onClick={confirmar}>
              {pendiente ? "Guardando…" : porConfirmar ? "Activar" : "Desactivar"}
            </Boton>
          </div>
        </div>
      </Dialogo>
    </div>
  );
}
