import type { ReactNode } from "react";

// Barra superior de ../evaluacion-a2 (xs.topbar / styles.hubTopbar):
// degradado morado → rosa, logo blanco de 42px, avatar con la inicial.

export function Encabezado({
  nombre,
  children,
  navegacion,
}: {
  /** Para el avatar con la inicial (xs.avatar). */
  nombre?: string;
  /** Botones a la derecha (Salir, etc.). */
  children?: ReactNode;
  /** Navegación: en escritorio va en la barra, en celular en una fila debajo. */
  navegacion?: ReactNode;
}) {
  const inicial = (nombre?.trim().charAt(0) ?? "").toUpperCase();
  return (
    <header className="degradado-barra text-white">
      <div className="flex items-center justify-between gap-4 px-[18px] py-3 md:px-7">
        <div className="flex min-w-0 items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- igual que a2 */}
          <img src="/logo_blanco.png" alt="Speak Easy" className="h-[42px] w-auto shrink-0" />
          {navegacion && <nav className="hidden items-center gap-2 md:flex">{navegacion}</nav>}
        </div>
        <div className="flex shrink-0 items-center gap-3.5">
          {children}
          {nombre !== undefined && (
            <span
              aria-hidden
              className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-avatar"
            >
              {inicial}
            </span>
          )}
        </div>
      </div>
      {navegacion && (
        <nav className="flex gap-2 overflow-x-auto px-[18px] pb-3 md:hidden">{navegacion}</nav>
      )}
    </header>
  );
}

// Título de página: xs.ejTitle (26px, 800, #3a1d6e) + xs.ejQuestion como subtítulo.
export function TituloPagina({
  titulo,
  subtitulo,
  antes,
  acciones,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Migas de pan o etiqueta sobre el título. */
  antes?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {antes && <div className="mb-2 text-sm text-gris">{antes}</div>}
        <h1 className="text-[22px] leading-tight font-extrabold text-titulo md:text-[26px]">
          {titulo}
        </h1>
        {subtitulo && (
          <div className="mt-2 text-[15px] leading-normal text-tinta md:text-base">{subtitulo}</div>
        )}
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{acciones}</div>}
    </div>
  );
}
