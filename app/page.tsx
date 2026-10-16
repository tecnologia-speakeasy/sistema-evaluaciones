import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getEstudianteActual } from "@/lib/auth/guards";
import BotonSalir from "@/app/components/BotonSalir";

// Inicio del estudiante. Fase 4: lista de evaluaciones publicadas de su generación.
export default function Inicio() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Cargando…</p>}>
        <Bienvenida />
      </Suspense>
    </main>
  );
}

async function Bienvenida() {
  const estudiante = await getEstudianteActual();
  if (!estudiante) redirect("/login");

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">{estudiante.generacion_nombre}</p>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Hola, {estudiante.nombre}
          </h1>
        </div>
        <BotonSalir />
      </header>
      <p className="mt-8 text-zinc-600">
        Aquí verás tus evaluaciones publicadas.
      </p>
    </>
  );
}
