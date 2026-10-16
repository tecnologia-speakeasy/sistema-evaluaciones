import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getEstudianteActual } from "@/lib/auth/guards";
import { Encabezado } from "@/app/components/ui/Encabezado";

// Inicio del estudiante (styles.hubPage de a2).
// Fase de vista estudiante: lista de evaluaciones publicadas de su generación.
export default function Inicio() {
  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col">
      <Suspense fallback={<Encabezado />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

async function Contenido() {
  const estudiante = await getEstudianteActual();
  if (!estudiante) redirect("/login");

  return (
    <>
      <Encabezado nombre={estudiante.nombre} detalle={estudiante.generacion_nombre} salir />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="mb-2 text-sm font-semibold text-gris">{estudiante.generacion_nombre}</p>
        <h1 className="mb-1.5 text-[clamp(26px,4vw,34px)] font-extrabold text-marca">
          Hola, {estudiante.nombre}
        </h1>
        <p className="text-[15px] text-gris-hub">Aquí verás tus evaluaciones publicadas.</p>
      </main>
    </>
  );
}
