"use client";

import { useEffect, useState } from "react";
import { Icono } from "@/app/components/ui/Icono";
import { copiarTexto } from "@/app/components/ui/portapapeles";

// Copia el enlace público del resultado (/resultado/[token]) y avisa
// "Enlace copiado".
export function BotonCopiarEnlace({ ruta }: { ruta: string }) {
  const [estado, setEstado] = useState<"listo" | "copiado" | "error">("listo");

  useEffect(() => {
    if (estado === "listo") return;
    const t = setTimeout(() => setEstado("listo"), 2500);
    return () => clearTimeout(t);
  }, [estado]);

  async function copiar() {
    const url = new URL(ruta, window.location.origin).toString();
    setEstado((await copiarTexto(url)) ? "copiado" : "error");
  }

  return (
    <div className="relative mt-5 flex flex-col items-center">
      <button
        type="button"
        onClick={() => void copiar()}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-white/45 bg-white/12 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/18"
      >
        <Icono nombre={estado === "copiado" ? "listo" : "copiar"} className="size-[18px]" />
        Compartir mi resultado
      </button>
      <p aria-live="polite" className="mt-2 h-5 text-[13px] font-semibold">
        {estado === "copiado" && <span className="text-[#86efac]">Enlace copiado</span>}
        {estado === "error" && <span className="text-error-claro">No pudimos copiarlo. Inténtalo de nuevo.</span>}
      </p>
    </div>
  );
}

