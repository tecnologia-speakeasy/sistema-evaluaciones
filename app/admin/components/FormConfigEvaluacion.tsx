"use client";

import { useState, useTransition, type FormEvent } from "react";
import { guardarConfigAction, type DatosConfig } from "@/app/admin/acciones/evaluaciones";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { AreaTexto, Campo, Entrada } from "@/app/components/ui/Campo";
import type { ConfigEvaluacion } from "@/lib/datos/evaluaciones";

// Título, descripción, apertura/cierre (hora de Colombia), duración e intentos.
export function FormConfigEvaluacion({
  evaluacionId,
  inicial,
  onGuardado,
}: {
  evaluacionId: number;
  inicial: ConfigEvaluacion;
  onGuardado?: () => void;
}) {
  const [datos, setDatos] = useState<DatosConfig>({
    titulo: inicial.titulo,
    descripcion: inicial.descripcion ?? "",
    apertura: inicial.apertura ?? "",
    cierre: inicial.cierre ?? "",
    duracion_min: inicial.duracion_min?.toString() ?? "",
    intentos_permitidos: inicial.intentos_permitidos?.toString() ?? "",
  });
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const cambiar = (campo: keyof DatosConfig) => (v: string) => {
    setDatos((d) => ({ ...d, [campo]: v }));
    setGuardado(false);
  };
  const errorDe = (campo: string) => (error?.campo === campo ? error.mensaje : null);

  function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await guardarConfigAction(evaluacionId, datos);
      if (!r.ok) {
        setError({ mensaje: r.error, campo: r.campo });
        return;
      }
      setGuardado(true);
      onGuardado?.();
    });
  }

  const id = (c: string) => `config-${evaluacionId}-${c}`;

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Título" htmlFor={id("titulo")} error={errorDe("titulo")}>
        <Entrada
          id={id("titulo")}
          value={datos.titulo}
          onChange={(e) => cambiar("titulo")(e.target.value)}
          invalida={!!errorDe("titulo")}
        />
      </Campo>
      <Campo
        etiqueta="Descripción"
        htmlFor={id("descripcion")}
        error={errorDe("descripcion")}
        ayuda="Opcional. La verá el estudiante antes de empezar."
      >
        <AreaTexto
          id={id("descripcion")}
          rows={2}
          value={datos.descripcion}
          onChange={(e) => cambiar("descripcion")(e.target.value)}
        />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Apertura"
          htmlFor={id("apertura")}
          error={errorDe("apertura")}
          ayuda="Hora de Colombia. Vacío = desde que se publique."
        >
          <Entrada
            id={id("apertura")}
            type="datetime-local"
            value={datos.apertura}
            onChange={(e) => cambiar("apertura")(e.target.value)}
            invalida={!!errorDe("apertura")}
          />
        </Campo>
        <Campo
          etiqueta="Cierre"
          htmlFor={id("cierre")}
          error={errorDe("cierre")}
          ayuda="Hora de Colombia. Vacío = sin cierre."
        >
          <Entrada
            id={id("cierre")}
            type="datetime-local"
            value={datos.cierre}
            onChange={(e) => cambiar("cierre")(e.target.value)}
            invalida={!!errorDe("cierre")}
          />
        </Campo>
        <Campo
          etiqueta="Duración (minutos)"
          htmlFor={id("duracion")}
          error={errorDe("duracion_min")}
          ayuda="Vacío = sin límite de tiempo."
        >
          <Entrada
            id={id("duracion")}
            type="number"
            inputMode="numeric"
            min={1}
            value={datos.duracion_min}
            onChange={(e) => cambiar("duracion_min")(e.target.value)}
            invalida={!!errorDe("duracion_min")}
          />
        </Campo>
        <Campo
          etiqueta="Intentos permitidos"
          htmlFor={id("intentos")}
          error={errorDe("intentos_permitidos")}
          ayuda="Vacío = ilimitados."
        >
          <Entrada
            id={id("intentos")}
            type="number"
            inputMode="numeric"
            min={1}
            value={datos.intentos_permitidos}
            onChange={(e) => cambiar("intentos_permitidos")(e.target.value)}
            invalida={!!errorDe("intentos_permitidos")}
          />
        </Campo>
      </div>

      {error && !error.campo && <Aviso tono="error">{error.mensaje}</Aviso>}
      {guardado && !onGuardado && <Aviso tono="exito">Cambios guardados.</Aviso>}

      <div className="flex justify-end">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </Boton>
      </div>
    </form>
  );
}
