"use client";

import { useState, useTransition } from "react";
import { cambiarPublicadaAction } from "@/app/admin/acciones/evaluaciones";
import { Interruptor } from "@/app/components/ui/Interruptor";

// Publicar / despublicar. El servidor rechaza publicar sin preguntas activas;
// el mensaje se muestra debajo.
export function InterruptorPublicar({
  evaluacionId,
  titulo,
  publicada,
  conEtiqueta = false,
}: {
  evaluacionId: number;
  titulo: string;
  publicada: boolean;
  conEtiqueta?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function cambiar(valor: boolean) {
    setError(null);
    iniciar(async () => {
      const r = await cambiarPublicadaAction(evaluacionId, valor);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2.5">
        {conEtiqueta && (
          <span className="text-sm font-semibold text-tinta">
            {publicada ? "Publicada" : "Sin publicar"}
          </span>
        )}
        <Interruptor
          activo={publicada}
          onCambio={cambiar}
          deshabilitado={pendiente}
          etiqueta={publicada ? `Despublicar ${titulo}` : `Publicar ${titulo}`}
        />
      </div>
      {error && (
        <p role="alert" className="max-w-[260px] text-right text-[13px] leading-snug text-error-texto">
          {error}
        </p>
      )}
    </div>
  );
}
