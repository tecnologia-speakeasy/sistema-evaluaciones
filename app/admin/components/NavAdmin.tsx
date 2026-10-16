"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { Icono, type NombreIcono } from "@/app/components/ui/Icono";

// Navegación del dashboard. Estudiantes y Staff solo para admin (las páginas
// también lo exigen).

type Enlace = { href: string; texto: string; icono: NombreIcono; activo: boolean };

function useEnlaces(esAdmin: boolean): Enlace[] {
  const ruta = usePathname();
  return [
    {
      href: "/admin",
      texto: "Generaciones",
      icono: "generaciones",
      activo:
        ruta === "/admin" ||
        ruta.startsWith("/admin/generaciones") ||
        ruta.startsWith("/admin/evaluaciones"),
    },
    {
      href: "/admin/resultados",
      texto: "Resultados",
      icono: "resultados",
      activo: ruta.startsWith("/admin/resultados"),
    },
    ...(esAdmin
      ? ([
          {
            href: "/admin/estudiantes",
            texto: "Estudiantes",
            icono: "estudiantes",
            activo: ruta.startsWith("/admin/estudiantes"),
          },
          { href: "/admin/staff", texto: "Staff", icono: "staff", activo: ruta.startsWith("/admin/staff") },
        ] satisfies Enlace[])
      : []),
  ];
}

// Barra superior (≥ 640px): activo = xs.verCalif (blanco), resto = xs.logout.
export default function NavAdmin({ esAdmin }: { esAdmin: boolean }) {
  const enlaces = useEnlaces(esAdmin);
  return (
    <>
      {enlaces.map((e) => (
        <BotonEnlace
          key={e.href}
          href={e.href}
          variante={e.activo ? "barraActivo" : "barra"}
          tamano="barra"
          aria-current={e.activo ? "page" : undefined}
        >
          {e.texto}
        </BotonEnlace>
      ))}
    </>
  );
}

// Barra inferior fija con iconos (< 640px).
export function NavInferior({ esAdmin }: { esAdmin: boolean }) {
  const enlaces = useEnlaces(esAdmin);
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-borde-suave bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(65,39,107,0.08)] backdrop-blur-[6px] sm:hidden"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${enlaces.length}, minmax(0, 1fr))` }}
      >
        {enlaces.map((e) => (
          <li key={e.href}>
            <Link
              href={e.href}
              aria-current={e.activo ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold ${
                e.activo
                  ? "text-rosa before:absolute before:top-0 before:h-[3px] before:w-9 before:rounded-b-full before:bg-rosa"
                  : "text-gris-oscuro"
              }`}
            >
              <Icono nombre={e.icono} className="size-[22px]" />
              {e.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
