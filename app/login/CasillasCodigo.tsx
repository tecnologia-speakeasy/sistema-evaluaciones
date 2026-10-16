"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import {
  DIGITOS_CODIGO,
  escribirEnCasilla,
  repartirDigitos,
} from "@/lib/auth/codigo-compartido";

// Las 6 casillas del código de acceso, con el estilo de los campos del login
// (styles.loginInput de a2).
//   · Avanzan solas al escribir; Backspace en una vacía vuelve a la anterior.
//   · Pegar el código completo (o el autollenado del celular, que llega a la
//     primera casilla por autocomplete="one-time-code") lo reparte en todas.
export function CasillasCodigo({
  id,
  digitos,
  onCambio,
  soloLectura = false,
  invalida = false,
  autoFocus = true,
}: {
  /** id de la primera casilla (para el <label>). */
  id: string;
  digitos: string[];
  onCambio: (digitos: string[]) => void;
  /** Mientras se verifica: no se puede escribir, pero sí recibir el foco. */
  soloLectura?: boolean;
  invalida?: boolean;
  /** La primera casilla toma el foco al aparecer. */
  autoFocus?: boolean;
}) {
  const casillas = useRef<(HTMLInputElement | null)[]>([]);

  // De inmediato, no en el siguiente cuadro: al escribir rápido (o con el
  // teclado del celular) el dígito siguiente ya debe caer en la casilla siguiente.
  function enfocar(i: number) {
    const el = casillas.current[i];
    el?.focus();
    el?.select();
  }

  function aplicar({ digitos: nuevos, foco }: { digitos: string[]; foco: number }) {
    if (soloLectura) return; // readOnly no frena pegar ni Backspace en una vacía
    // Primero el foco y después avisar: así el formulario puede llevarlo a otro
    // campo (p. ej. al nombre, si falta).
    enfocar(foco);
    onCambio(nuevos);
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === "Backspace" && !digitos[i] && i > 0) {
      e.preventDefault();
      aplicar(repartirDigitos(digitos, i - 1, ""));
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      enfocar(i - 1);
    } else if (e.key === "ArrowRight" && i < DIGITOS_CODIGO - 1) {
      e.preventDefault();
      enfocar(i + 1);
    }
  }

  function alPegar(e: ClipboardEvent<HTMLInputElement>, i: number) {
    e.preventDefault();
    aplicar(repartirDigitos(digitos, i, e.clipboardData.getData("text")));
  }

  return (
    <div role="group" aria-label={`Código de ${DIGITOS_CODIGO} dígitos`} className="flex gap-2">
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            casillas.current[i] = el;
          }}
          id={i === 0 ? id : undefined}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Dígito ${i + 1} de ${DIGITOS_CODIGO}`}
          aria-invalid={invalida || undefined}
          readOnly={soloLectura}
          autoFocus={autoFocus && i === 0}
          value={d}
          onChange={(e) => aplicar(escribirEnCasilla(digitos, i, e.target.value))}
          onKeyDown={(e) => alTeclear(e, i)}
          onPaste={(e) => alPegar(e, i)}
          onFocus={(e) => e.target.select()}
          className={`h-[54px] w-full min-w-0 rounded-[11px] border bg-campo-login text-center text-[22px] font-bold text-[#333] caret-[#c84df0] transition-colors duration-150 focus:!border-[#c84df0] read-only:opacity-75 ${
            invalida ? "border-error-claro" : "border-transparent"
          }`}
        />
      ))}
    </div>
  );
}
