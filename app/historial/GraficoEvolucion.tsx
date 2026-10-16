import type { IntentoHistorial } from "@/lib/datos/intentos";

// Evolución de sus puntajes (SVG, sin librerías): un punto por intento ya
// calificado, en orden. Los colores son los del degradado de progreso de a2.
const ANCHO = 640;
const ALTO = 220;
const M = { arriba: 28, abajo: 34, izq: 34, der: 18 };

const codigo = (p: IntentoHistorial) => `${p.tipo === "mensual" ? "M" : "T"}${p.eval_numero}`;

export function GraficoEvolucion({ intentos }: { intentos: IntentoHistorial[] }) {
  const puntos = intentos.filter((i): i is IntentoHistorial & { puntaje_total: number } => i.puntaje_total !== null);
  if (puntos.length === 0) return null;

  const ancho = ANCHO - M.izq - M.der;
  const alto = ALTO - M.arriba - M.abajo;
  const x = (i: number) => M.izq + (puntos.length === 1 ? ancho / 2 : (i / (puntos.length - 1)) * ancho);
  const y = (p: number) => M.arriba + alto - (p / 100) * alto;
  const linea = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.puntaje_total).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const etiqueta = `Evolución de tus puntajes: ${puntos.map((p) => `${codigo(p)} ${p.puntaje_total}`).join(", ")}`;
  // Con muchos intentos no caben todas las etiquetas de abajo.
  const cada = Math.ceil(puntos.length / 12);

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={etiqueta} className="h-auto w-full">
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
      {puntos.length > 1 && <path d={area} fill="url(#evolucion-area)" />}
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
      {puntos.map((p, i) => (
        <g key={`${p.slug}-${p.numero}`}>
          <circle cx={x(i)} cy={y(p.puntaje_total)} r="5.5" fill="#fff" stroke="#ff327d" strokeWidth="3" />
          <text x={x(i)} y={y(p.puntaje_total) - 11} textAnchor="middle" fontSize="12" fontWeight="700" fill="#2b2240">
            {p.puntaje_total}
          </text>
          {i % cada === 0 && (
            <text x={x(i)} y={ALTO - 12} textAnchor="middle" fontSize="11" fontWeight="600" fill="#6b6480">
              {codigo(p)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
