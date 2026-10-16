"use client";

import { Boton } from "@/app/components/ui/Boton";
import { Entrada } from "@/app/components/ui/Campo";

const MAX_OPCIONES = 10;

// Opciones de selección múltiple + casillas para marcar la(s) correcta(s).
// soloAgregar (pregunta con respuestas): las opciones no se editan; solo se
// pueden marcar más correctas, y las que ya lo eran no se pueden desmarcar.
export function OpcionesMultiple({
  opciones,
  correctas,
  onCambio,
  soloAgregar = false,
  correctasFijas = [],
}: {
  opciones: string[];
  correctas: number[];
  onCambio: (opciones: string[], correctas: number[]) => void;
  soloAgregar?: boolean;
  correctasFijas?: number[];
}) {
  function cambiarTexto(i: number, texto: string) {
    onCambio(opciones.map((o, j) => (j === i ? texto : o)), correctas);
  }

  function alternarCorrecta(i: number) {
    onCambio(
      opciones,
      correctas.includes(i) ? correctas.filter((c) => c !== i) : [...correctas, i],
    );
  }

  function quitar(i: number) {
    onCambio(
      opciones.filter((_, j) => j !== i),
      correctas.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)),
    );
  }

  return (
    <div>
      <ul className="flex flex-col gap-2.5">
        {opciones.map((op, i) => {
          const esCorrecta = correctas.includes(i);
          const fija = correctasFijas.includes(i);
          return (
            <li key={i} className="flex items-center gap-2.5">
              <label
                className={`flex shrink-0 items-center gap-1.5 text-[13px] font-semibold ${
                  esCorrecta ? "text-exito" : "text-gris-oscuro"
                } ${fija ? "cursor-not-allowed" : "cursor-pointer"}`}
                title={fija ? "Ya tiene respuestas: no se puede desmarcar" : undefined}
              >
                <input
                  type="checkbox"
                  checked={esCorrecta}
                  disabled={fija}
                  onChange={() => alternarCorrecta(i)}
                  className="size-[18px] cursor-pointer accent-exito disabled:cursor-not-allowed"
                />
                <span className="sr-only md:not-sr-only">Correcta</span>
              </label>
              {/* Letra como xs.optionLetter */}
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-opcion text-sm font-bold text-gris">
                {String.fromCharCode(65 + i)}
              </span>
              <Entrada
                value={op}
                onChange={(e) => cambiarTexto(i, e.target.value)}
                readOnly={soloAgregar}
                placeholder={`Opción ${String.fromCharCode(65 + i)}`}
                aria-label={`Opción ${String.fromCharCode(65 + i)}`}
                className="!py-2.5"
              />
              {!soloAgregar && (
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  disabled={opciones.length <= 2}
                  aria-label={`Quitar opción ${String.fromCharCode(65 + i)}`}
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-xl text-gris hover:bg-opcion hover:text-error disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!soloAgregar && opciones.length < MAX_OPCIONES && (
        <Boton
          variante="texto"
          className="mt-2.5 text-sm"
          onClick={() => onCambio([...opciones, ""], correctas)}
        >
          + Agregar opción
        </Boton>
      )}
    </div>
  );
}
