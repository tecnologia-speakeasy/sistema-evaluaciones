import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getStaffActual } from "@/lib/auth/guards";
import BotonSalir from "@/app/components/BotonSalir";
import { Encabezado } from "@/app/components/ui/Encabezado";
import NavAdmin from "./components/NavAdmin";

// Marco del dashboard: fondo FONDO.png y barra superior de a2 (xs.page / xs.topbar).
// El rol se lee dentro de <Suspense> para no bloquear el resto (Cache Components).
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Suspense fallback={<Encabezado />}>
        <EncabezadoStaff />
      </Suspense>
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-[18px] pt-[18px] pb-10 md:px-7 md:pt-[34px] md:pb-12">
        {children}
      </main>
    </div>
  );
}

async function EncabezadoStaff() {
  const staff = await getStaffActual();
  if (!staff) redirect("/login?next=/admin");
  return (
    <Encabezado nombre={staff.nombre} navegacion={<NavAdmin esAdmin={staff.rol === "admin"} />}>
      <BotonSalir />
    </Encabezado>
  );
}
