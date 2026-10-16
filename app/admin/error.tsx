"use client";

import { Boton } from "@/app/components/ui/Boton";
import { Tarjeta } from "@/app/components/ui/Tarjeta";

// Si falla la BD u otra cosa inesperada en el dashboard.
export default function ErrorAdmin({ reset }: { error: Error; reset: () => void }) {
  return (
    <Tarjeta className="mx-auto mt-6 max-w-lg text-center">
      <p className="text-lg font-extrabold text-titulo">No pudimos cargar esta página</p>
      <p className="mt-1 mb-5 text-sm text-gris-oscuro">
        Puede ser un problema momentáneo de conexión con la base de datos.
      </p>
      <Boton onClick={reset}>Reintentar</Boton>
    </Tarjeta>
  );
}
