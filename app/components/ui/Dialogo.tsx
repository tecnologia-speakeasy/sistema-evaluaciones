"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Diálogo modal con <dialog> nativo (Esc y foco atrapado los da el navegador).
// Fondo difuminado como styles.securityOverlay de a2.
// El contenido solo se monta mientras está abierto, así cada apertura arranca limpia.
// Sin `titulo`: solo el contenido con una ✕ arriba a la derecha (`etiqueta` lo
// nombra para lectores de pantalla).
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  etiqueta,
  children,
  ancho = "max-w-lg",
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo?: ReactNode;
  /** Nombre accesible cuando no hay título visible. */
  etiqueta?: string;
  children: ReactNode;
  /** Clase de ancho máximo de Tailwind. */
  ancho?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    else if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      aria-label={titulo ? undefined : etiqueta}
      // Clic en el fondo (fuera de la caja) cierra.
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className={`m-auto w-[calc(100%-24px)] ${ancho} max-h-[calc(100dvh-24px)] overflow-hidden rounded-[20px] bg-white p-0 text-tinta shadow-[0_16px_50px_rgba(43,34,64,0.25)] backdrop:bg-[rgba(30,20,50,0.25)] backdrop:backdrop-blur-[5px]`}
    >
      {abierto &&
        (titulo ? (
          <div className="flex max-h-[calc(100dvh-24px)] flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-borde-suave px-5 py-4 md:px-6">
              <h2 className="text-lg font-extrabold text-titulo md:text-xl">{titulo}</h2>
              <button
                type="button"
                onClick={onCerrar}
                className="cursor-pointer rounded-[10px] bg-[rgba(43,34,64,0.08)] px-3 py-1.5 text-sm font-semibold text-tinta hover:bg-[rgba(43,34,64,0.14)]"
              >
                Cerrar ✕
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 md:px-6">{children}</div>
          </div>
        ) : (
          <div className="relative max-h-[calc(100dvh-24px)] overflow-y-auto px-5 pt-12 pb-6 md:px-12 md:pb-10">
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="absolute top-3 right-3 flex size-9 cursor-pointer items-center justify-center rounded-full text-lg text-gris-oscuro hover:bg-[rgba(43,34,64,0.08)] hover:text-tinta"
            >
              ✕
            </button>
            {children}
          </div>
        ))}
    </dialog>
  );
}
