"use client";

import { Chips } from "@/app/components/ui/Chips";

// Traducciones válidas: la respuesta del estudiante debe coincidir con alguna
// (mayúsculas, tildes, apóstrofes y contracciones los resuelve normalize()).
export function Traducciones({
  traducciones,
  onCambio,
  bloqueadas = 0,
  invalida = false,
}: {
  traducciones: string[];
  onCambio: (traducciones: string[]) => void;
  bloqueadas?: number;
  invalida?: boolean;
}) {
  return (
    <Chips
      id="traducciones"
      valores={traducciones}
      onCambio={onCambio}
      bloqueados={bloqueadas}
      placeholder="Traducción válida y Enter (ej. I was at home yesterday.)"
      invalida={invalida}
    />
  );
}
