"use client";

// Interruptor (switch) con los colores de a2: rosa encendido, borde lavanda apagado.
export function Interruptor({
  activo,
  onCambio,
  etiqueta,
  deshabilitado = false,
}: {
  activo: boolean;
  onCambio: (valor: boolean) => void;
  etiqueta: string;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambio(!activo)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        activo ? "bg-rosa" : "bg-borde"
      }`}
    >
      <span
        className={`inline-block size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(43,34,64,0.25)] transition-transform duration-150 ${
          activo ? "translate-x-[23px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
