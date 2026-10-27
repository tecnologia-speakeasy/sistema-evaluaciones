import type { MejorPorEvaluacion } from "@/lib/datos/intentos";
import type { TipoEvaluacion } from "@/lib/tipos";

// Evolución de sus puntajes (SVG, sin librerías), con el diseño de la antigua
// página /historial: las 18 evaluaciones en el orden del curso y, en cada una
// que ya presentó, su mejor puntaje. Los colores son los del degradado de
// progreso de a2.
// En el eje, cada trimestral lleva su nivel: T1 = A1 (la antigua «Evaluación
// A1»), T2 = A2, T3 = B1 y T4 = B2. La bienvenida, las trimestrales y la final,
// en rosa.

type Casilla = { tipo: TipoEvaluacion; numero: number; etiqueta: string; destacada: boolean };

const NIVEL_TRIMESTRAL = ["A1", "A2", "B1", "B2"];

// B, M1, M2, M3, A1, M4, M5, M6, A2, M7, M8, M9, B1, M10, M11, M12, B2, F.
const CURSO: Casilla[] = [
  { tipo: "bienvenida", numero: 1, etiqueta: "B", destacada: true },
  ...NIVEL_TRIMESTRAL.flatMap((nivel, t): Casilla[] => [
    ...[1, 2, 3].map((k) => ({ tipo: "mensual" as const, numero: t * 3 + k, etiqueta: `M${t * 3 + k}`, destacada: false })),
    { tipo: "trimestral", numero: t + 1, etiqueta: nivel, destacada: true },
  ]),
  { tipo: "final", numero: 1, etiqueta: "F", destacada: true },
];

const ANCHO = 640;
const ALTO = 220;
const M = { arriba: 28, abajo: 34, izq: 34, der: 18 };

export function GraficoHistorial({ mejores }: { mejores: MejorPorEvaluacion[] }) {
  const mejorDe = new Map(mejores.map((m) => [`${m.tipo}-${m.numero}`, m.mejor]));
  const casillas = CURSO.map((c, i) => ({ ...c, i, mejor: mejorDe.get(`${c.tipo}-${c.numero}`) ?? null }));
  const puntos = casillas.filter((c): c is (typeof casillas)[number] & { mejor: number } => c.mejor !== null);

  const ancho = ANCHO - M.izq - M.der;
  const alto = ALTO - M.arriba - M.abajo;
  const x = (i: number) => M.izq + (i / (CURSO.length - 1)) * ancho;
  const y = (p: number) => M.arriba + alto - (p / 100) * alto;
  const linea = puntos.map((p, n) => `${n ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.mejor).toFixed(1)}`).join(" ");
  const area =
    puntos.length > 1
      ? `${linea} L${x(puntos.at(-1)!.i).toFixed(1)},${y(0)} L${x(puntos[0].i).toFixed(1)},${y(0)} Z`
      : "";
  const etiqueta = puntos.length
    ? `Evolución de tus puntajes (el mejor de cada evaluación): ${puntos.map((p) => `${p.etiqueta} ${p.mejor}`).join(", ")}`
    : "Aún no tienes puntajes";

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={etiqueta} className="h-auto w-full min-w-[560px]">
      <defs>
        <linearGradient id="evolucion-linea" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#6d2ebf" />
          <stop offset="100%" stopColor="#ff327d" />
        </linearGradient>
        <linearGradient id="evolucion-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ff327d" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#6d2ebf" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line
            x1={M.izq}
            x2={ANCHO - M.der}
            y1={y(v)}
            y2={y(v)}
            stroke="#e3ddf0"
            strokeDasharray={v ? "4 5" : undefined}
          />
          <text x={M.izq - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#9a93ad">
            {v}
          </text>
        </g>
      ))}
      {area && <path d={area} fill="url(#evolucion-area)" />}
      {puntos.length > 1 && (
        <path
          d={linea}
          fill="none"
          stroke="url(#evolucion-linea)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {casillas.map((c) => (
        <text
          key={c.etiqueta}
          x={x(c.i)}
          y={ALTO - 12}
          textAnchor="middle"
          fontSize={c.destacada ? 12 : 11}
          fontWeight={c.destacada ? 800 : 600}
          fill={c.destacada ? "#ff327d" : "#6b6480"}
        >
          {c.etiqueta}
        </text>
      ))}
      {puntos.map((p) => (
        <g key={p.etiqueta}>
          <circle cx={x(p.i)} cy={y(p.mejor)} r="5.5" fill="#fff" stroke="#ff327d" strokeWidth="3" />
          <text x={x(p.i)} y={y(p.mejor) - 11} textAnchor="middle" fontSize="12" fontWeight="700" fill="#2b2240">
            {p.mejor}
          </text>
        </g>
      ))}
    </svg>
  );
}
