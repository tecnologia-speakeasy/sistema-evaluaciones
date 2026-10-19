// Barra de progreso del examen (xs.progressRow de a2): la barra es global y el
// contador, por sección. La comparten el examen y la revisión de un intento.
export function BarraProgreso({
  actual,
  total,
  contador,
}: {
  /** Posición global, desde 1. */
  actual: number;
  total: number;
  /** "3/10" dentro de la sección. */
  contador: string;
}) {
  return (
    <div className="mb-[30px] flex items-center gap-4">
      <div
        role="progressbar"
        aria-label="Progreso de la evaluación"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={actual}
        className="h-2 flex-1 overflow-hidden rounded-full bg-[rgba(120,90,180,0.15)]"
      >
        <div
          className="degradado-progreso h-full rounded-full transition-[width] duration-300"
          style={{ width: `${(actual / total) * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-[15px] font-semibold text-gris">{contador}</span>
    </div>
  );
}
