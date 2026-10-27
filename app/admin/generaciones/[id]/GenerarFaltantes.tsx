"use client";

import { useState, useTransition } from "react";
import { generarFaltantesAction } from "@/app/admin/acciones/generaciones";
import { Boton } from "@/app/components/ui/Boton";

// Solo admin: crea las evaluaciones que falten de las 18 (no toca las existentes).
export default function GenerarFaltantes({
  generacionId,
  faltan,
}: {
  generacionId: number;
  faltan: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Boton
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            const r = await generarFaltantesAction(generacionId);
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pendiente ? "Generando…" : faltan === 1 ? "Generar la evaluación faltante" : `Generar las ${faltan} evaluaciones faltantes`}
      </Boton>
      {error && <p className="text-[13px] text-error-texto">{error}</p>}
    </div>
  );
}
