"use client";

import { useEffect, useRef, useState } from "react";

// Antitrampa de a2 (EnglishExam.jsx), activa mientras presenta:
//   · copiar / cortar / pegar y atajos (Ctrl/Cmd + C V X A P U S): bloqueados con aviso
//   · F12, Ctrl+Shift+I/J/C, clic derecho, arrastrar y seleccionar texto fuera de
//     los campos: bloqueados sin aviso
//   · salir de la pestaña: se cuenta (cambios_pestana) y se avisa
// El aviso dura 2,8 s. `alSalir` recibe el conteo nuevo (para guardarlo).
const DURACION_AVISO_MS = 2800;

export function useAntitrampa(activo: boolean, conteoInicial: number, alSalir: (conteo: number) => void) {
  const [aviso, setAviso] = useState<string | null>(null);
  const conteo = useRef(conteoInicial);
  const alSalirRef = useRef(alSalir);
  useEffect(() => {
    alSalirRef.current = alSalir;
  });

  useEffect(() => {
    if (!activo) return;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const avisar = (mensaje: string) => {
      setAviso(mensaje);
      clearTimeout(temporizador);
      temporizador = setTimeout(() => setAviso(null), DURACION_AVISO_MS);
    };
    const esCampo = (destino: EventTarget | null) => {
      const el = destino instanceof Element ? destino : (destino as Node | null)?.parentElement;
      return el?.tagName === "INPUT" || el?.tagName === "TEXTAREA";
    };

    const portapapeles = (e: Event) => {
      e.preventDefault();
      avisar("Copiar y pegar está deshabilitado durante la evaluación.");
    };
    const teclas = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "F12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k))) {
        e.preventDefault();
      } else if (mod && ["c", "v", "x", "a", "p", "u", "s"].includes(k)) {
        e.preventDefault();
        avisar("Esa acción está deshabilitada durante la evaluación.");
      }
    };
    const bloquear = (e: Event) => e.preventDefault();
    const seleccion = (e: Event) => {
      if (!esCampo(e.target)) e.preventDefault();
    };
    const visibilidad = () => {
      if (!document.hidden) return;
      conteo.current += 1;
      alSalirRef.current(conteo.current);
      avisar("Saliste de la evaluación. Esto queda registrado.");
    };

    const oyentes: [string, EventListener][] = [
      ["copy", portapapeles],
      ["cut", portapapeles],
      ["paste", portapapeles],
      ["keydown", teclas as EventListener],
      ["contextmenu", bloquear],
      ["dragstart", bloquear],
      ["selectstart", seleccion],
      ["visibilitychange", visibilidad],
    ];
    for (const [tipo, fn] of oyentes) document.addEventListener(tipo, fn);
    return () => {
      clearTimeout(temporizador);
      for (const [tipo, fn] of oyentes) document.removeEventListener(tipo, fn);
    };
  }, [activo]);

  return { aviso, conteo };
}
