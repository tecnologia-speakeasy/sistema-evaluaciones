"use client";

import { useCallback, useEffect, useState } from "react";

// Cuenta regresiva en segundos (p. ej. "Reenviar código en 0:42").
// La hora solo se lee en el navegador (al iniciar y en el intervalo).
export function useCuentaRegresiva() {
  const [hasta, setHasta] = useState(0); // marca de tiempo (ms) en que termina
  const [ahora, setAhora] = useState(0);

  useEffect(() => {
    if (!hasta) return;
    const t = setInterval(() => {
      const n = Date.now();
      setAhora(n);
      if (n >= hasta) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [hasta]);

  const iniciar = useCallback((segundos: number) => {
    const n = Date.now();
    setAhora(n);
    setHasta(n + segundos * 1000);
  }, []);

  return { restante: Math.max(0, Math.ceil((hasta - ahora) / 1000)), iniciar };
}

// 42 → "0:42", 754 → "12:34".
export function formatearCuenta(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}
