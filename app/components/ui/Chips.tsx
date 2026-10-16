"use client";

import { useState } from "react";
import { clasesEntrada } from "./Campo";
import { clasesBoton } from "./Boton";

// Lista de textos como chips. Enter (o "Agregar") agrega; × quita.
// No usa la coma como separador: una respuesta puede llevar comas ("Yes, I do.").
// `bloqueados`: los primeros N chips no se pueden quitar (pregunta con respuestas).
export function Chips({
  id,
  valores,
  onCambio,
  bloqueados = 0,
  placeholder = "Escribe y pulsa Enter",
  invalida = false,
}: {
  id?: string;
  valores: string[];
  onCambio: (valores: string[]) => void;
  bloqueados?: number;
  placeholder?: string;
  invalida?: boolean;
}) {
  const [texto, setTexto] = useState("");

  function agregar() {
    const v = texto.trim();
    if (!v) return;
    if (!valores.includes(v)) onCambio([...valores, v]);
    setTexto("");
  }

  return (
    <div>
      {valores.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {valores.map((v, i) => {
            const fijo = i < bloqueados;
            return (
              <li
                key={v}
                title={fijo ? "Ya tiene respuestas: no se puede quitar" : undefined}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-3 text-[13px] font-semibold ${
                  fijo ? "bg-opcion pr-3 text-gris-oscuro" : "bg-lavanda pr-1.5 text-violeta"
                }`}
              >
                <span className="break-words">{v}</span>
                {!fijo && (
                  <button
                    type="button"
                    onClick={() => onCambio(valores.filter((x) => x !== v))}
                    aria-label={`Quitar ${v}`}
                    className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-base leading-none hover:bg-violeta/15"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar();
            }
          }}
          placeholder={placeholder}
          aria-invalid={invalida || undefined}
          className={clasesEntrada("claro", invalida)}
        />
        <button
          type="button"
          onClick={agregar}
          disabled={!texto.trim()}
          className={clasesBoton({ variante: "secundario", tamano: "sm", className: "shrink-0" })}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
