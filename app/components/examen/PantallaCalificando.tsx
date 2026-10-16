"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnilloProgreso } from "./AnilloProgreso";
import { Spiky } from "./Spiky";

// "Calificando" de a2 (xs.loadOverlay / loadCard): Spiky y un anillo que avanza
// solo hasta 90 % (cada 600 ms, de 2 a 10 %) y llega a 100 cuando el servidor
// responde (`listo`). Spiky se ve también en celular, más pequeño.
// `demorado`: la IA tarda más de lo normal; se ofrece salir (llega por correo).
export function PantallaCalificando({ listo, demorado = null }: { listo: boolean; demorado?: string | null }) {
  const [avance, setAvance] = useState(4);

  useEffect(() => {
    if (listo) return;
    const t = setInterval(() => setAvance((p) => Math.min(90, p + 2 + Math.floor(Math.random() * 9))), 600);
    return () => clearInterval(t);
  }, [listo]);
  const progreso = listo ? 100 : avance;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fondo-intro fixed inset-0 z-[300] flex flex-wrap content-center items-center justify-center gap-6 overflow-y-auto p-6 md:gap-9"
    >
      <Spiky className="w-[min(260px,70vw)] rounded-2xl md:order-2 md:w-[min(440px,82vw)]" />
      <div className="flex w-[300px] flex-col items-center rounded-3xl border border-white/14 bg-white/12 px-10 py-[34px] backdrop-blur-[6px] md:order-1">
        <p className="mb-[22px] text-[15px] text-white/85">Espera un momento...</p>
        <div className="mb-[22px]">
          <AnilloProgreso progreso={progreso} tamano={130} grosor={9}>
            <span className="text-[30px] font-extrabold text-white">{progreso}%</span>
          </AnilloProgreso>
        </div>
        <p className="text-center text-[15px] leading-snug text-white/85">Estamos revisando tus respuestas</p>
        {demorado && !listo && (
          <div className="mt-5 flex flex-col items-center gap-3 border-t border-white/14 pt-4 text-center">
            <p className="text-[13px] leading-snug text-white/75">
              Está tardando un poco más de lo normal. Puedes esperar aquí o volver más tarde: te enviaremos el
              resultado a tu correo.
            </p>
            <Link
              href={demorado}
              className="rounded-xl border-[1.5px] border-white/45 bg-white/12 px-4 py-2 text-sm font-semibold text-white hover:bg-white/18"
            >
              Ver mi intento
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
