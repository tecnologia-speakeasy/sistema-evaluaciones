import type { ReactNode } from "react";

// ProgressRing de a2: anillo SVG que arranca arriba, puntas redondeadas.
// Lo usan el cronómetro del celular, "calificando", el resultado y /resultado.
export function AnilloProgreso({
  progreso,
  tamano,
  grosor,
  color = "#ff327d",
  pista = "rgba(255,255,255,0.18)",
  children,
}: {
  /** 0–100. */
  progreso: number;
  tamano: number;
  grosor: number;
  color?: string;
  pista?: string;
  /** Lo que va en el centro. */
  children?: ReactNode;
}) {
  const r = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, progreso));
  return (
    <div className="relative flex items-center justify-center" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90" aria-hidden>
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke={pista} strokeWidth={grosor} />
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia - (p / 100) * circunferencia}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  );
}
