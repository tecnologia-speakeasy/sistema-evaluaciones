import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getStaffActual } from "@/lib/auth/guards";
import BotonSalir from "@/app/components/BotonSalir";

export const metadata: Metadata = { title: "Panel" };

// Resumen del staff. Fase 2: generaciones y evaluaciones.
export default function AdminInicio() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Cargando…</p>}>
        <Resumen />
      </Suspense>
    </main>
  );
}

async function Resumen() {
  const staff = await getStaffActual();
  if (!staff) redirect("/login?next=/admin");

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">
            {staff.rol === "admin" ? "Administrador" : "Docente"}
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Hola, {staff.nombre}
          </h1>
        </div>
        <BotonSalir />
      </header>
      <p className="mt-8 text-zinc-600">
        Aquí irán las generaciones y sus evaluaciones.
      </p>
    </>
  );
}
