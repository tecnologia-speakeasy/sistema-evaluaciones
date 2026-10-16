"use client";

import { Aviso } from "@/app/components/ui/Aviso";
import { Chips } from "@/app/components/ui/Chips";
import { contarEspacios, partirEnunciado } from "@/lib/preguntas/tipos";

// Un campo de chips por cada ___ del enunciado (se detectan mientras se escribe).
// Cada chip es una respuesta aceptada para ese espacio.
export function EspaciosFillBlank({
  enunciado,
  variantes,
  onCambio,
  bloqueadas = [],
  invalida = false,
}: {
  enunciado: string;
  variantes: string[][];
  onCambio: (variantes: string[][]) => void;
  /** Por espacio, cuántas variantes ya existían (no se pueden quitar). */
  bloqueadas?: number[];
  invalida?: boolean;
}) {
  const detectados = contarEspacios(enunciado);
  const partes = partirEnunciado(enunciado);

  // Un poco del texto alrededor de cada espacio, para reconocerlo.
  const contexto = (i: number) => {
    const antes = partes[i]?.slice(-24).trimStart() ?? "";
    const despues = partes[i + 1]?.slice(0, 24).trimEnd() ?? "";
    return `${antes.length === 24 ? "…" : ""}${antes}___${despues}${despues.length === 24 ? "…" : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {detectados === 0 && (
        <Aviso>
          El enunciado no tiene <strong>___</strong>: el estudiante verá un campo al final de
          la oración. Escribe ___ (tres guiones bajos) donde va cada espacio.
        </Aviso>
      )}
      {variantes.map((lista, i) => (
        <div key={i}>
          <p className="mb-1.5 text-sm font-semibold text-tinta">
            Espacio {i + 1}
            {detectados > 0 && (
              <span className="ml-2 font-normal text-gris-oscuro">{contexto(i)}</span>
            )}
          </p>
          <Chips
            id={`espacio-${i}`}
            valores={lista}
            onCambio={(nuevos) => onCambio(variantes.map((l, j) => (j === i ? nuevos : l)))}
            bloqueados={bloqueadas[i] ?? 0}
            placeholder="Respuesta aceptada y Enter (ej. is going to)"
            invalida={invalida && lista.length === 0}
          />
        </div>
      ))}
    </div>
  );
}
