"use client";

import { useState } from "react";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Icono } from "@/app/components/ui/Icono";
import { copiarTexto } from "@/app/components/ui/portapapeles";

// La contraseña temporal se ve una sola vez (en la BD solo queda su hash).
export function ContrasenaTemporal({ email, password }: { email: string; password: string }) {
  const [copiada, setCopiada] = useState<boolean | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-tinta">
        Contraseña temporal de <strong className="break-all">{email}</strong>:
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <output
          aria-label="Contraseña temporal"
          className="flex-1 rounded-[10px] border-[1.5px] border-borde bg-campo px-3.5 py-3 font-mono text-lg tracking-wider break-all text-tinta select-all"
        >
          {password}
        </output>
        <Boton variante="secundario" onClick={async () => setCopiada(await copiarTexto(password))}>
          <span className="inline-flex items-center gap-2">
            <Icono nombre={copiada ? "listo" : "copiar"} className="size-[18px]" />
            {copiada ? "Copiada" : "Copiar"}
          </span>
        </Boton>
      </div>
      <p aria-live="polite" className="sr-only">
        {copiada === true ? "Contraseña copiada" : copiada === false ? "No se pudo copiar" : ""}
      </p>
      <Aviso>
        Se muestra <strong>una sola vez</strong>. Compártela por un canal seguro: al entrar con ella, tendrá que crear
        su propia contraseña.
      </Aviso>
    </div>
  );
}
