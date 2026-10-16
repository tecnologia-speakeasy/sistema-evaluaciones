"use client";

import { useEffect, useState } from "react";
import { Icono } from "@/app/components/ui/Icono";

// Copia el enlace público del resultado (/resultado/[token]) y avisa
// "Enlace copiado". Si el navegador no deja usar el portapapeles (sin HTTPS,
// permisos), cae en el método viejo con un campo temporal.
export function BotonCopiarEnlace({ ruta }: { ruta: string }) {
  const [estado, setEstado] = useState<"listo" | "copiado" | "error">("listo");

  useEffect(() => {
    if (estado === "listo") return;
    const t = setTimeout(() => setEstado("listo"), 2500);
    return () => clearTimeout(t);
  }, [estado]);

  async function copiar() {
    const url = new URL(ruta, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setEstado("copiado");
    } catch {
      setEstado(copiarConCampo(url) ? "copiado" : "error");
    }
  }

  return (
    <div className="relative mt-5 flex flex-col items-center">
      <button
        type="button"
        onClick={() => void copiar()}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-white/45 bg-white/12 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/18"
      >
        <Icono nombre={estado === "copiado" ? "listo" : "copiar"} className="size-[18px]" />
        Copiar enlace para compartir
      </button>
      <p aria-live="polite" className="mt-2 h-5 text-[13px] font-semibold">
        {estado === "copiado" && <span className="text-[#86efac]">Enlace copiado</span>}
        {estado === "error" && <span className="text-error-claro">No pudimos copiarlo. Inténtalo de nuevo.</span>}
      </p>
    </div>
  );
}

function copiarConCampo(texto: string): boolean {
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.opacity = "0";
  document.body.appendChild(campo);
  campo.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    campo.remove();
  }
}
