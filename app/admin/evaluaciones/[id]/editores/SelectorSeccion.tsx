"use client";

import { useState } from "react";
import { Entrada, Selector } from "@/app/components/ui/Campo";

const NUEVA = "__nueva__";

// Sección de la pregunta: se elige entre las ya usadas en la evaluación (así no
// quedan variantes escritas distinto) o se escribe una nueva.
export function SelectorSeccion({
  id,
  valor,
  secciones,
  onCambio,
  deshabilitado = false,
  invalida = false,
}: {
  id: string;
  valor: string;
  secciones: string[];
  onCambio: (seccion: string) => void;
  deshabilitado?: boolean;
  invalida?: boolean;
}) {
  // Modo "nueva" si la eligen en el selector o si el valor no está en la lista.
  const [nueva, setNueva] = useState(() => valor.trim() !== "" && !secciones.includes(valor));

  return (
    <div className="flex flex-col gap-2">
      <Selector
        id={id}
        value={nueva ? NUEVA : valor}
        disabled={deshabilitado}
        invalida={invalida && !nueva}
        onChange={(e) => {
          const v = e.target.value;
          setNueva(v === NUEVA);
          onCambio(v === NUEVA ? "" : v);
        }}
      >
        <option value="">Sin sección</option>
        {secciones.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value={NUEVA}>+ Nueva sección…</option>
      </Selector>
      {nueva && (
        <Entrada
          aria-label="Nombre de la nueva sección"
          autoFocus
          value={valor}
          readOnly={deshabilitado}
          placeholder="Part 2 – Past Simple Verbs"
          onChange={(e) => onCambio(e.target.value)}
          invalida={invalida}
        />
      )}
    </div>
  );
}
