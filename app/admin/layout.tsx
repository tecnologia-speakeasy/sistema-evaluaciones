import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getStaffActual, RUTA_CAMBIAR_PASSWORD } from "@/lib/auth/guards";
import { Encabezado } from "@/app/components/ui/Encabezado";
import { EnlaceMenu } from "@/app/components/ui/MenuAvatar";
import NavAdmin, { NavInferior } from "./components/NavAdmin";

// Marco del dashboard: fondo FONDO.png y barra superior de a2 (xs.page / xs.topbar).
// En celular (< 640px) la navegación va en una barra inferior fija.
// El rol se lee dentro de <Suspense> para no bloquear el resto (Cache Components).
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Suspense fallback={<Encabezado />}>
        <EncabezadoStaff />
      </Suspense>
      {/* pb extra en celular: la barra inferior no tapa el final de la página */}
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-[18px] pt-[18px] pb-28 sm:pb-10 md:px-7 md:pt-[34px] md:pb-12">
        {children}
      </main>
    </div>
  );
}

async function EncabezadoStaff() {
  const staff = await getStaffActual();
  if (!staff) redirect("/login?next=/admin");
  const esAdmin = staff.rol === "admin";
  return (
    <>
      <Encabezado
        nombre={staff.nombre}
        detalle={esAdmin ? "Administrador" : "Docente"}
        salir
        cuenta={
          <EnlaceMenu href={RUTA_CAMBIAR_PASSWORD} icono="llave">
            Cambiar mi contraseña
          </EnlaceMenu>
        }
        navegacion={<NavAdmin esAdmin={esAdmin} />}
      />
      <NavInferior esAdmin={esAdmin} />
    </>
  );
}
