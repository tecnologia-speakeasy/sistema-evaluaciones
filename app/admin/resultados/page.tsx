import type { Metadata } from "next";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { intentosPorRevisar } from "@/lib/datos/revision";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { Cargando } from "@/app/admin/components/Cargando";
import FilaRevision from "./FilaRevision";

export const metadata: Metadata = { title: "Resultados" };

// "Reintentar IA" llama a OpenAI desde la acción (10–30 s, con reintentos).
export const maxDuration = 300;

// Fase 5: intentos que necesitan revisión. La tabla completa de resultados y
// el CSV llegan en la Fase 6.
export default function Resultados() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  await staffParaPagina();
  const intentos = await intentosPorRevisar();

  return (
    <>
      <TituloPagina
        titulo="Resultados"
        subtitulo="Intentos por revisar: la IA falló, lleva más de 10 minutos sin terminar o el correo no salió. Los resultados completos y el CSV llegan en una próxima fase."
      />
      {intentos.length === 0 ? (
        <Tarjeta className="text-center">
          <p className="font-bold text-titulo">Todo al día</p>
          <p className="mt-1 text-sm text-gris-oscuro">No hay intentos con problemas.</p>
        </Tarjeta>
      ) : (
        <ul className="flex flex-col gap-3">
          {intentos.map((i) => (
            <li key={i.id}>
              <FilaRevision intento={i} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
