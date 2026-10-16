import type { ReactNode } from "react";

// Cajas de mensaje de ../evaluacion-a2:
//   error = xs.errorBox (rojo translúcido, texto #c0294b)
//   info  = xs.revFeedback (lavanda)
//   exito = verde de las marcas de revisión

export type TonoAviso = "error" | "info" | "exito";

const TONOS: Record<TonoAviso, string> = {
  error: "bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-error-texto",
  info: "bg-lavanda border border-borde-suave text-tinta",
  exito: "bg-[rgba(34,197,94,0.10)] border border-[rgba(34,197,94,0.35)] text-exito",
};

export function Aviso({
  tono = "info",
  children,
  className = "",
}: {
  tono?: TonoAviso;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      className={`rounded-[10px] px-3.5 py-2.5 text-sm leading-normal ${TONOS[tono]} ${className}`}
    >
      {children}
    </div>
  );
}
