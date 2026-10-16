"use client";

import { useState, useTransition } from "react";
import { cambiarPublicadaAction } from "@/app/admin/acciones/evaluaciones";
import { Boton } from "@/app/components/ui/Boton";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Interruptor } from "@/app/components/ui/Interruptor";

// Publicar / despublicar. El servidor rechaza publicar sin preguntas activas;
// el mensaje se muestra debajo (o dentro del diálogo de confirmación).
// `confirmar`: pide confirmación antes de cambiar (fila móvil de la cuadrícula,
// donde un toque accidental es fácil).
export function InterruptorPublicar({
  evaluacionId,
  titulo,
  publicada,
  conEtiqueta = false,
  confirmar = false,
}: {
  evaluacionId: number;
  titulo: string;
  publicada: boolean;
  conEtiqueta?: boolean;
  confirmar?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  // Valor elegido que espera confirmación (diálogo abierto).
  const [porConfirmar, setPorConfirmar] = useState<boolean | null>(null);

  function cambiar(valor: boolean) {
    setError(null);
    iniciar(async () => {
      const r = await cambiarPublicadaAction(evaluacionId, valor);
      if (!r.ok) setError(r.error);
      else setPorConfirmar(null);
    });
  }

  function cerrarDialogo() {
    setPorConfirmar(null);
    setError(null);
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
          onCambio={(valor) => (confirmar ? setPorConfirmar(valor) : cambiar(valor))}
          deshabilitado={pendiente}
          etiqueta={publicada ? `Despublicar ${titulo}` : `Publicar ${titulo}`}
        />
      </div>
      {error && porConfirmar === null && (
        <p role="alert" className="max-w-[260px] text-right text-[13px] leading-snug text-error-texto">
          {error}
        </p>
      )}

      {confirmar && (
        <Dialogo
          abierto={porConfirmar !== null}
          onCerrar={cerrarDialogo}
          titulo={porConfirmar ? "¿Publicar la evaluación?" : "¿Despublicar la evaluación?"}
        >
          <div className="flex flex-col gap-4">
            <p className="text-[15px] text-tinta">
              <strong>{titulo}</strong>
              {porConfirmar
                ? ": los estudiantes de la generación la verán y podrán presentarla entre la apertura y el cierre."
                : ": los estudiantes dejarán de verla. Sus intentos anteriores no se borran."}
            </p>
            {error && (
              <p role="alert" className="text-[13px] leading-snug text-error-texto">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2.5">
              <Boton variante="secundario" onClick={cerrarDialogo}>
                Cancelar
              </Boton>
              <Boton disabled={pendiente} onClick={() => porConfirmar !== null && cambiar(porConfirmar)}>
                {pendiente
                  ? porConfirmar
                    ? "Publicando…"
                    : "Despublicando…"
                  : porConfirmar
                    ? "Publicar"
                    : "Despublicar"}
              </Boton>
            </div>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
