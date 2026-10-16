import Link from "next/link";
import type { ComponentProps } from "react";

// Botones de ../evaluacion-a2:
//   primario   = xs.btnNext   (rosa sólido)
//   secundario = xs.btnPrev   (borde rosa, fondo blanco)
//   degradado  = styles.loginBtn / xs.confirmBtn (rosa → violeta con sombra)
//   barra      = xs.logout    (translúcido sobre la barra superior)
//   barraActivo= xs.verCalif  (blanco con texto rosa sobre la barra)
//   peligro    = como secundario, en rojo (acciones destructivas del staff)
//   texto      = enlace discreto sin caja

export type VarianteBoton =
  | "primario"
  | "secundario"
  | "degradado"
  | "barra"
  | "barraActivo"
  | "peligro"
  | "texto";

const VARIANTES: Record<VarianteBoton, string> = {
  primario: "rounded-[10px] bg-rosa text-white font-semibold hover:bg-rosa-hover",
  secundario:
    "rounded-[10px] border-[1.5px] border-rosa bg-white text-rosa font-semibold hover:bg-rosa/5",
  degradado:
    "rounded-[11px] border-2 border-rosa degradado-boton text-white font-bold shadow-[0_10px_34px_rgba(255,50,125,0.4)] hover:-translate-y-px",
  barra:
    "rounded-[10px] border border-white/30 bg-white/15 text-white font-medium hover:bg-white/25",
  barraActivo: "rounded-[10px] bg-white text-rosa-hover font-bold",
  peligro:
    "rounded-[10px] border-[1.5px] border-error bg-white text-error font-semibold hover:bg-error/5",
  texto: "text-gris-oscuro font-semibold underline-offset-2 hover:text-tinta hover:underline",
};

const TAMANOS = {
  // xs.btnNext: 14px, padding 11px 26px
  md: "text-sm px-[22px] py-[11px]",
  // xs.logout: 14px, padding 9px 18px
  barra: "text-sm px-[18px] py-[9px]",
  sm: "text-[13px] px-3.5 py-1.5",
  // styles.loginBtn: 15px, padding 14px 24px
  lg: "text-[15px] px-6 py-[14px]",
};

export type TamanoBoton = keyof typeof TAMANOS;

export function clasesBoton({
  variante = "primario",
  tamano = "md",
  ancho = false,
  className = "",
}: {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  ancho?: boolean;
  className?: string;
}) {
  const caja = variante === "texto" ? "" : TAMANOS[tamano];
  return [
    "inline-flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer whitespace-nowrap",
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0",
    VARIANTES[variante],
    caja,
    ancho ? "w-full" : "",
    className,
  ].join(" ");
}

type PropsComunes = {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  ancho?: boolean;
};

export function Boton({
  variante,
  tamano,
  ancho,
  className,
  type = "button",
  ...props
}: PropsComunes & ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={clasesBoton({ variante, tamano, ancho, className })}
      {...props}
    />
  );
}

export function BotonEnlace({
  variante,
  tamano,
  ancho,
  className,
  ...props
}: PropsComunes & ComponentProps<typeof Link>) {
  return (
    <Link className={clasesBoton({ variante, tamano, ancho, className })} {...props} />
  );
}
