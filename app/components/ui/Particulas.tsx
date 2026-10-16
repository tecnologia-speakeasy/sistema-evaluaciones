// Partículas flotantes del login de ../evaluacion-a2 (función Particles).
// Posiciones deterministas: se puede renderizar en el servidor sin desajustes.
export function Particulas() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {Array.from({ length: 60 }, (_, i) => {
        const size = 2 + (i % 4);
        const paleta = i % 4;
        const fondo = [
          "rgba(255,50,125,0.6)",
          "rgba(255,138,185,0.55)",
          "rgba(184,107,196,0.5)",
          "rgba(255,255,255,0.45)",
        ][paleta];
        const brillo = [
          "0 0 10px rgba(255,50,125,0.55)",
          "0 0 8px rgba(255,138,185,0.5)",
          "0 0 9px rgba(184,107,196,0.5)",
          "0 0 6px rgba(255,255,255,0.35)",
        ][paleta];
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              bottom: -10,
              left: `${(i * 17 + 7) % 100}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              background: fondo,
              boxShadow: brillo,
              filter: `blur(${i % 5 === 0 ? "1px" : "0"})`,
              animation: `particle-drift ${9 + (i % 10)}s ${(i * 0.7) % 12}s infinite linear`,
            }}
          />
        );
      })}
    </div>
  );
}
