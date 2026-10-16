"use client";

import { usePathname } from "next/navigation";
import { BotonEnlace } from "@/app/components/ui/Boton";

// Enlaces de la barra superior: activo = xs.verCalif (blanco), resto = xs.logout.
// Estudiantes y Staff solo para admin (la página también lo exige).
export default function NavAdmin({ esAdmin }: { esAdmin: boolean }) {
  const ruta = usePathname();
  const enlaces = [
    {
      href: "/admin",
      texto: "Generaciones",
      activo:
        ruta === "/admin" ||
        ruta.startsWith("/admin/generaciones") ||
        ruta.startsWith("/admin/evaluaciones"),
    },
    { href: "/admin/resultados", texto: "Resultados", activo: ruta.startsWith("/admin/resultados") },
    ...(esAdmin
      ? [
          { href: "/admin/estudiantes", texto: "Estudiantes", activo: ruta.startsWith("/admin/estudiantes") },
          { href: "/admin/staff", texto: "Staff", activo: ruta.startsWith("/admin/staff") },
        ]
      : []),
  ];

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
