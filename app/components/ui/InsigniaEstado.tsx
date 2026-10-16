import type { ReactNode } from "react";
import type { EstadoEvaluacion } from "@/lib/tipos";

// Píldora de ../evaluacion-a2 (xs.attemptTag: 11px, 700, padding 4px 10px).
// Los colores de estado salen de las marcas de revisión de a2
// (verde rgba(34,197,94,…), rojo rgba(239,68,68,…)) y de la paleta lavanda.

export type TonoInsignia = "rosa" | "violeta" | "verde" | "rojo" | "gris" | "lavanda";

const TONOS: Record<TonoInsignia, string> = {
  rosa: "bg-rosa text-white",
  violeta: "bg-violeta text-white",
  verde: "bg-[rgba(34,197,94,0.14)] text-exito",
  rojo: "bg-[rgba(239,68,68,0.10)] text-error",
  gris: "bg-opcion text-gris-oscuro",
  lavanda: "bg-lavanda text-violeta",
};

export function Insignia({
  tono = "gris",
  children,
  className = "",
}: {
  tono?: TonoInsignia;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] leading-none font-bold whitespace-nowrap ${TONOS[tono]} ${className}`}
    >
      {children}
    </span>
  );
}

const ESTADOS: Record<EstadoEvaluacion, { etiqueta: string; tono: TonoInsignia }> = {
  borrador: { etiqueta: "Borrador", tono: "gris" },
  programada: { etiqueta: "Programada", tono: "lavanda" },
  abierta: { etiqueta: "Abierta", tono: "verde" },
  cerrada: { etiqueta: "Cerrada", tono: "rojo" },
};

export function InsigniaEstado({ estado }: { estado: EstadoEvaluacion }) {
  const { etiqueta, tono } = ESTADOS[estado];
  return <Insignia tono={tono}>{etiqueta}</Insignia>;
}
