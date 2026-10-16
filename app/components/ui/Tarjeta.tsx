import type { HTMLAttributes } from "react";

// Tarjetas de ../evaluacion-a2:
//   blanca  = xs.transBox / xs.fillBox (borde lavanda 1.5px, radio 14)
//   lavanda = xs.timerCard / xs.stepperCard (fondo #f1ecfb, radio 16)
//   vidrio  = styles.loginCard (translúcida sobre morado)

export type VarianteTarjeta = "blanca" | "lavanda" | "vidrio";

const VARIANTES: Record<VarianteTarjeta, string> = {
  blanca: "rounded-[14px] border-[1.5px] border-borde bg-white",
  lavanda: "rounded-2xl bg-lavanda",
  vidrio:
    "rounded-[26px] border border-white/15 fondo-vidrio backdrop-blur-[6px] text-white",
};

export function Tarjeta({
  as: Elemento = "div",
  variante = "blanca",
  relleno = "p-5 md:px-[22px] md:py-5",
  className = "",
  ...props
}: {
  as?: "div" | "section" | "article" | "li";
  variante?: VarianteTarjeta;
  relleno?: string;
} & HTMLAttributes<HTMLElement>) {
  return <Elemento className={`${VARIANTES[variante]} ${relleno} ${className}`} {...props} />;
}
