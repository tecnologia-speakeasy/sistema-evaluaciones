import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { Cargando } from "./Cargando";

// Páginas de la navegación que llegan en una fase posterior. Ya exigen el rol.
export function Proximamente({
  titulo,
  descripcion,
  soloAdmin = false,
}: {
  titulo: string;
  descripcion: string;
  soloAdmin?: boolean;
}) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido titulo={titulo} descripcion={descripcion} soloAdmin={soloAdmin} />
    </Suspense>
  );
}

async function Contenido({
  titulo,
  descripcion,
  soloAdmin,
}: {
  titulo: string;
  descripcion: string;
  soloAdmin: boolean;
}) {
  const staff = await staffParaPagina();
  if (soloAdmin && staff.rol !== "admin") {
    return (
      <>
        <TituloPagina titulo={titulo} />
        <Tarjeta>Esta sección es solo para administradores.</Tarjeta>
      </>
    );
  }
  return (
    <>
      <TituloPagina titulo={titulo} subtitulo={descripcion} />
      <Tarjeta className="text-gris-oscuro">Disponible en una próxima fase.</Tarjeta>
    </>
  );
}
