"use client";

import type { ReactNode } from "react";
import { useDesplegable } from "./useDesplegable";

// Avatar de la barra superior (xs.avatar de a2) que abre un menú con el nombre
// y las acciones de la cuenta. Se usa en celular, donde no cabe "Cerrar sesión".
export function MenuAvatar({
  nombre,
  detalle,
  children,
}: {
  nombre: string;
  detalle?: string;
  /** Acciones del menú (role="menuitem"). */
  children: ReactNode;
}) {
  const { abierto, setAbierto, contenedor, boton } = useDesplegable();
  const inicial = nombre.trim().charAt(0).toUpperCase();

  return (
    <div ref={contenedor} className="relative">
      <button
        ref={boton}
        type="button"
        aria-label={`Menú de ${nombre}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="flex size-[38px] cursor-pointer items-center justify-center rounded-full bg-white text-lg font-bold text-avatar ring-white/40 transition-shadow hover:ring-4"
      >
        {inicial}
      </button>
      {abierto && (
        <div
          role="menu"
          aria-label={`Menú de ${nombre}`}
          className="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-borde-suave bg-white p-1.5 text-tinta shadow-[0_12px_30px_rgba(43,34,64,0.2)]"
        >
          <div className="px-3 py-2">
            <p className="truncate text-[15px] font-bold">{nombre}</p>
            {detalle && <p className="truncate text-[13px] text-gris-oscuro">{detalle}</p>}
          </div>
          <div role="separator" className="my-1 h-px bg-borde-suave" />
          {children}
        </div>
      )}
    </div>
  );
}
