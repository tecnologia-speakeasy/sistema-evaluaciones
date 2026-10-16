// Lluvia de confeti de la pantalla de resultado (Confetti de a2: 70 piezas,
// mismos colores y tiempos). Los valores "al azar" salen de una secuencia fija:
// el render es puro y el servidor y el navegador pintan lo mismo.

const COLORES = ["#FF327D", "#6D2EBF", "#22c55e", "#facc15", "#38bdf8", "#fb923c", "#f472b6"];

// mulberry32: números en [0, 1) a partir de una semilla.
function secuencia(semilla: number) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const azar = secuencia(2026);
const PIEZAS = Array.from({ length: 70 }, () => ({
  left: azar() * 100,
  color: COLORES[Math.floor(azar() * COLORES.length)],
  delay: azar() * 3.5,
  duracion: 2.6 + azar() * 2.6,
  tamano: 6 + azar() * 7,
}));

export function Confeti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {PIEZAS.map((p, i) => (
        <span
          key={i}
          className="absolute -top-[12vh] rounded-[2px] motion-reduce:hidden"
          style={{
            left: `${p.left}%`,
            width: p.tamano,
            height: p.tamano * 0.55,
            background: p.color,
            animation: `confetti-fall ${p.duracion}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
