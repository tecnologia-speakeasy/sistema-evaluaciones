"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icono, type NombreIcono } from "./Icono";
import { useDesplegable } from "./useDesplegable";

// Avatar de la barra superior (xs.avatar de a2) que abre un menú con el nombre
// y las acciones de la cuenta. Se usa en celular, donde no cabe "Cerrar sesión",
// y en el panel del staff también en escritorio ("Cambiar mi contraseña").
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
          // Al elegir una opción el menú se cierra (los enlaces no recargan el layout).
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[role="menuitem"]')) setAbierto(false);
          }}
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

// Opción del menú que lleva a otra página.
export function EnlaceMenu({ href, icono, children }: { href: string; icono: NombreIcono; children: ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-tinta hover:bg-opcion focus:bg-opcion focus:outline-none"
    >
      <Icono nombre={icono} className="size-[18px] text-gris-oscuro" />
      {children}
    </Link>
  );
}
