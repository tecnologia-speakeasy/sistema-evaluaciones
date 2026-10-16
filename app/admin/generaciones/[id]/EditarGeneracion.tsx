"use client";

import { useState, useTransition, type FormEvent } from "react";
import { editarGeneracionAction } from "@/app/admin/acciones/generaciones";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";
import type { Generacion } from "@/lib/datos/generaciones";

// Editar nombre y fechas (solo admin). El código no se cambia: va en el enlace
// de cada evaluación.
export default function EditarGeneracion({ generacion }: { generacion: Generacion }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Editar
      </Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Editar generación">
        <Formulario generacion={generacion} onListo={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

function Formulario({ generacion: g, onListo }: { generacion: Generacion; onListo: () => void }) {
  const [datos, setDatos] = useState({ nombre: g.nombre, fecha_inicio: g.fecha_inicio, fecha_fin: g.fecha_fin ?? "" });
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const errorDe = (c: string) => (error?.campo === c ? error.mensaje : null);
  const cambiar = (c: keyof typeof datos, v: string) => {
    setDatos((d) => ({ ...d, [c]: v }));
    setError(null);
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await editarGeneracionAction(g.id, datos);
      if (r.ok) onListo();
      else setError({ mensaje: r.error, campo: r.campo });
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Código" htmlFor="ed-codigo" ayuda="No se puede cambiar: va en el enlace de cada evaluación.">
        <Entrada id="ed-codigo" value={g.codigo} readOnly />
      </Campo>
      <Campo etiqueta="Nombre" htmlFor="ed-nombre" error={errorDe("nombre")}>
        <Entrada
          id="ed-nombre"
          value={datos.nombre}
          onChange={(e) => cambiar("nombre", e.target.value)}
          invalida={!!errorDe("nombre")}
        />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha de inicio" htmlFor="ed-inicio" error={errorDe("fecha_inicio")}>
          <Entrada
            id="ed-inicio"
            type="date"
            value={datos.fecha_inicio}
            onChange={(e) => cambiar("fecha_inicio", e.target.value)}
            invalida={!!errorDe("fecha_inicio")}
          />
        </Campo>
        <Campo etiqueta="Fecha de fin" htmlFor="ed-fin" error={errorDe("fecha_fin")} ayuda="Opcional.">
          <Entrada
            id="ed-fin"
            type="date"
            value={datos.fecha_fin}
            onChange={(e) => cambiar("fecha_fin", e.target.value)}
            invalida={!!errorDe("fecha_fin")}
          />
        </Campo>
      </div>
      {error && !error.campo && <Aviso tono="error">{error.mensaje}</Aviso>}
      <Boton type="submit" disabled={pendiente} ancho>
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </Boton>
    </form>
  );
}
