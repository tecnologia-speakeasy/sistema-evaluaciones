import type { ComponentProps, ReactNode } from "react";

// Campos de formulario de ../evaluacion-a2:
//   tono "claro"  = xs.transInput (borde #d9d2ea 1.5px, fondo #faf9fc, radio 10)
//   tono "oscuro" = styles.loginInput / loginLabel (sobre la tarjeta del login)

export type TonoCampo = "claro" | "oscuro";

const ENTRADA: Record<TonoCampo, string> = {
  claro:
    "w-full rounded-[10px] border-[1.5px] border-borde bg-campo px-3.5 py-3 text-[15px] text-tinta placeholder:text-gris-claro disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-opcion",
  // Foco #c84df0 como .login-input:focus de a2.
  oscuro:
    "w-full rounded-[11px] border border-transparent bg-campo-login px-4 py-[13px] text-sm text-[#333] placeholder:text-[#9a9aa8] read-only:opacity-75 focus:!border-[#c84df0]",
};

const ETIQUETA: Record<TonoCampo, string> = {
  claro: "mb-1.5 block text-sm font-semibold text-tinta",
  oscuro: "mb-2 block text-sm font-normal text-white",
};

const ERROR: Record<TonoCampo, string> = {
  claro: "mt-1.5 text-[13px] leading-snug text-error-texto",
  oscuro: "mt-1.5 text-[13px] leading-snug text-error-claro",
};

export function clasesEntrada(tono: TonoCampo = "claro", invalida = false) {
  return `${ENTRADA[tono]} ${invalida ? "!border-error-borde" : ""}`;
}

export function Campo({
  etiqueta,
  htmlFor,
  error,
  ayuda,
  tono = "claro",
  accion,
  children,
  className = "",
}: {
  etiqueta?: ReactNode;
  htmlFor?: string;
  error?: string | null;
  ayuda?: ReactNode;
  tono?: TonoCampo;
  /** Elemento a la derecha de la etiqueta (p. ej. "Cambiar correo"). */
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {(etiqueta || accion) && (
        <div className="flex items-baseline justify-between gap-3">
          {etiqueta && (
            <label htmlFor={htmlFor} className={ETIQUETA[tono]}>
              {etiqueta}
            </label>
          )}
          {accion}
        </div>
      )}
      {children}
      {ayuda && !error && (
        <p className={`mt-1.5 text-[13px] ${tono === "oscuro" ? "text-white/70" : "text-gris-oscuro"}`}>
          {ayuda}
        </p>
      )}
      {error && (
        <p role="alert" className={ERROR[tono]}>
          {error}
        </p>
      )}
    </div>
  );
}

type PropsEntrada = { tono?: TonoCampo; invalida?: boolean };

export function Entrada({
  tono = "claro",
  invalida = false,
  className = "",
  ...props
}: PropsEntrada & ComponentProps<"input">) {
  return (
    <input
      aria-invalid={invalida || undefined}
      className={`${clasesEntrada(tono, invalida)} ${className}`}
      {...props}
    />
  );
}

export function AreaTexto({
  tono = "claro",
  invalida = false,
  className = "",
  ...props
}: PropsEntrada & ComponentProps<"textarea">) {
  return (
    <textarea
      aria-invalid={invalida || undefined}
      className={`${clasesEntrada(tono, invalida)} resize-y leading-relaxed ${className}`}
      {...props}
    />
  );
}

export function Selector({
  tono = "claro",
  invalida = false,
  className = "",
  ...props
}: PropsEntrada & ComponentProps<"select">) {
  return (
    <select
      aria-invalid={invalida || undefined}
      className={`${clasesEntrada(tono, invalida)} cursor-pointer ${className}`}
      {...props}
    />
  );
}
