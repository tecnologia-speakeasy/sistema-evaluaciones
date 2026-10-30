"use client";

import { useState } from "react";
import { Entrada, Selector } from "@/app/components/ui/Campo";

const NUEVA = "__nueva__";

type Textos = { ninguna: string; nueva: string; nombreNueva: string; ejemplo: string };
const TEXTOS_SECCION: Textos = {
  ninguna: "Sin sección",
  nueva: "+ Nueva sección…",
  nombreNueva: "Nombre de la nueva sección",
  ejemplo: "Part 2 – Past Simple Verbs",
};
export const TEXTOS_SUBSECCION: Textos = {
  ninguna: "Sin subsección",
  nueva: "+ Nueva subsección…",
  nombreNueva: "Nombre de la nueva subsección",
  ejemplo: "Section A",
};

// Sección de la pregunta: se elige entre las ya usadas en la evaluación (así no
// quedan variantes escritas distinto) o se escribe una nueva. Sirve también
// para la subsección (textos = TEXTOS_SUBSECCION).
export function SelectorSeccion({
  id,
  valor,
  secciones,
  onCambio,
  deshabilitado = false,
  invalida = false,
  textos = TEXTOS_SECCION,
}: {
  id: string;
  valor: string;
  secciones: string[];
  onCambio: (seccion: string) => void;
  deshabilitado?: boolean;
  invalida?: boolean;
  textos?: Textos;
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
        <option value="">{textos.ninguna}</option>
        {secciones.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value={NUEVA}>{textos.nueva}</option>
      </Selector>
      {nueva && (
        <Entrada
          aria-label={textos.nombreNueva}
          autoFocus
          value={valor}
          readOnly={deshabilitado}
          placeholder={textos.ejemplo}
          onChange={(e) => onCambio(e.target.value)}
          invalida={invalida}
        />
      )}
    </div>
  );
}
