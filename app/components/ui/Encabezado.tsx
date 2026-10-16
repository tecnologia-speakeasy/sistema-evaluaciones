import type { ReactNode } from "react";
import BotonSalir from "../BotonSalir";
import { MenuAvatar } from "./MenuAvatar";

// Barra superior de ../evaluacion-a2 (xs.topbar / styles.hubTopbar):
// degradado morado → rosa, logo blanco de 42px, avatar con la inicial.
//
// Con `salir`:
//   ≥ 640px  botón "Cerrar sesión" + avatar (como en a2)
//   < 640px  solo el avatar, que abre un menú con "Cerrar sesión"
// Con `cuenta` (opciones de la cuenta, p. ej. "Cambiar mi contraseña"), el
// avatar abre ese menú en todos los tamaños.
// `navegacion` va en la barra desde 768px y en una fila debajo entre 640 y 767px;
// en celular la muestra cada layout en su propia barra inferior.

export function Encabezado({
  nombre,
  detalle,
  salir = false,
  cuenta,
  children,
  navegacion,
}: {
  /** Para el avatar con la inicial (xs.avatar). */
  nombre?: string;
  /** Segunda línea del menú del avatar (rol, generación). */
  detalle?: string;
  salir?: boolean;
  /** Opciones del menú del avatar además de "Cerrar sesión" (role="menuitem"). */
  cuenta?: ReactNode;
  /** Acciones a la derecha que se ven en todos los tamaños. */
  children?: ReactNode;
  navegacion?: ReactNode;
}) {
  const inicial = (nombre?.trim().charAt(0) ?? "").toUpperCase();
  const avatarFijo = (
    <span
      aria-hidden
      className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-avatar"
    >
      {inicial}
    </span>
  );

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
          {salir && (
            <div className="hidden sm:block">
              <BotonSalir />
            </div>
          )}
          {nombre !== undefined &&
            (salir && cuenta ? (
              <MenuAvatar nombre={nombre} detalle={detalle}>
                {cuenta}
                <BotonSalir estilo="item" />
              </MenuAvatar>
            ) : salir ? (
              <>
                <div className="hidden sm:block">{avatarFijo}</div>
                <div className="sm:hidden">
                  <MenuAvatar nombre={nombre} detalle={detalle}>
                    <BotonSalir estilo="item" />
                  </MenuAvatar>
                </div>
              </>
            ) : (
              avatarFijo
            ))}
        </div>
      </div>
      {navegacion && (
        <nav className="hidden gap-2 overflow-x-auto px-[18px] pb-3 sm:flex md:hidden">{navegacion}</nav>
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
