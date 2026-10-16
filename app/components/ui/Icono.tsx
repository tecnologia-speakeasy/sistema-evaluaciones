import type { ReactNode } from "react";

// Iconos de línea (24×24, trazo con currentColor). Pocos y propios, para no
// sumar una librería por media docena de dibujos.

export type NombreIcono =
  | "generaciones"
  | "resultados"
  | "estudiantes"
  | "staff"
  | "configurar"
  | "mas"
  | "salir"
  | "abajo";

const TRAZOS: Record<NombreIcono, ReactNode> = {
  // Capas apiladas
  generaciones: (
    <>
      <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  // Barras
  resultados: (
    <>
      <path d="M3 20h18" />
      <path d="M6 20v-8" />
      <path d="M11 20V5" />
      <path d="M16 20v-5" />
    </>
  ),
  // Dos personas
  estudiantes: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17.5 14.5c2.2.3 3.6 1.9 4 4.5" />
    </>
  ),
  // Escudo
  staff: (
    <>
      <path d="M12 3 19.5 6v5.5c0 4.4-3.1 8-7.5 9.5-4.4-1.5-7.5-5.1-7.5-9.5V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  // Controles deslizantes
  configurar: (
    <>
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  mas: (
    <>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  salir: (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="m10 17 5-5-5-5" />
      <path d="M15 12H4" />
    </>
  ),
  abajo: <path d="m6 9 6 6 6-6" />,
};

export function Icono({ nombre, className = "size-5" }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
