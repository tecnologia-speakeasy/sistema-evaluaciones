"use client";

import { Fragment, useEffect, useRef, type KeyboardEvent } from "react";
import { Icono } from "./Icono";
import { useDesplegable } from "./useDesplegable";

// Menú "⋯" de acciones secundarias. Las acciones de peligro van en rojo,
// separadas por una línea; conviene ponerlas al final.
// Teclado: flechas para moverse, Escape para cerrar, Tab sale del menú.

export type ItemMenu = {
  texto: string;
  onSelect: () => void;
  peligro?: boolean;
  deshabilitado?: boolean;
  /** Texto pequeño debajo (p. ej. por qué está deshabilitado). */
  detalle?: string;
};

const HABILITADOS = '[role="menuitem"]:not([disabled])';

export function Menu({ etiqueta, items }: { etiqueta: string; items: ItemMenu[] }) {
  const { abierto, setAbierto, contenedor, boton } = useDesplegable();
  const lista = useRef<HTMLDivElement>(null);

  const habilitados = () => [...(lista.current?.querySelectorAll<HTMLButtonElement>(HABILITADOS) ?? [])];

  // Al abrir: que el menú quede a la vista (en celular, sin quedar debajo de la
  // barra inferior: ver scroll-mb) y el foco en la primera acción.
  useEffect(() => {
    if (!abierto) return;
    lista.current?.scrollIntoView({ block: "nearest" });
    lista.current?.querySelector<HTMLButtonElement>(HABILITADOS)?.focus({ preventScroll: true });
  }, [abierto]);

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    const items = habilitados();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      setAbierto(false);
    }
  }

  return (
    <div ref={contenedor} className="relative">
      <button
        ref={boton}
        type="button"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={`flex size-9 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-opcion hover:text-tinta ${
          abierto ? "bg-opcion text-tinta" : "text-gris-oscuro"
        }`}
      >
        <Icono nombre="mas" />
      </button>
      {abierto && (
        <div
          ref={lista}
          role="menu"
          aria-label={etiqueta}
          onKeyDown={alTeclear}
          className="absolute top-full right-0 z-30 mt-1 min-w-[210px] scroll-mb-24 rounded-xl border border-borde-suave bg-white py-1.5 shadow-[0_12px_30px_rgba(43,34,64,0.16)] sm:scroll-mb-4"
        >
          {items.map((it, i) => (
            <Fragment key={it.texto}>
              {it.peligro && i > 0 && <div role="separator" className="my-1.5 h-px bg-borde-suave" />}
              <button
                type="button"
                role="menuitem"
                disabled={it.deshabilitado}
                onClick={() => {
                  setAbierto(false);
                  it.onSelect();
                }}
                className={`flex w-full cursor-pointer flex-col items-start px-3.5 py-2 text-left text-sm font-semibold hover:bg-opcion focus:bg-opcion focus:outline-none disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent ${
                  it.peligro ? "text-error" : "text-tinta"
                }`}
              >
                {it.texto}
                {it.detalle && (
                  <span className="text-xs font-normal text-gris-oscuro">{it.detalle}</span>
                )}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
