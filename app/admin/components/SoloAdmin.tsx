import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";

// Lo que ve un docente si entra a una sección solo de admin (Estudiantes, Staff).
// Las acciones de esas secciones también lo exigen en el servidor.
export function SoloAdmin({ titulo }: { titulo: string }) {
  return (
    <>
      <TituloPagina titulo={titulo} />
      <Tarjeta>Esta sección es solo para administradores.</Tarjeta>
    </>
  );
}
