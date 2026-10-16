import type { Metadata } from "next";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { listarStaff } from "@/lib/datos/staff";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Cargando } from "@/app/admin/components/Cargando";
import { SoloAdmin } from "@/app/admin/components/SoloAdmin";
import FilaStaff from "./FilaStaff";
import NuevoMiembro from "./NuevoMiembro";

export const metadata: Metadata = { title: "Staff" };

// Staff (solo admin): crear con contraseña temporal, rol, activo y restablecer
// contraseña. Nadie se quita el rol ni se desactiva a sí mismo, y siempre queda
// al menos un admin activo (lib/datos/staff.ts).
export default function Staff() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const staff = await staffParaPagina();
  if (staff.rol !== "admin") return <SoloAdmin titulo="Staff" />;
  const miembros = await listarStaff();
  return (
    <>
      <TituloPagina
        titulo="Staff"
        subtitulo="Administradores (todo) y docentes (evaluaciones, preguntas y resultados)."
        acciones={<NuevoMiembro />}
      />
      <ul className="flex flex-col gap-2.5">
        {miembros.map((m) => (
          <li key={m.id}>
            <FilaStaff miembro={m} esYo={m.id === staff.id} />
          </li>
        ))}
      </ul>
    </>
  );
}
