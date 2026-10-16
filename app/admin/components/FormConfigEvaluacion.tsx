"use client";

import { useState, useTransition, type FormEvent } from "react";
import { guardarConfigAction, type DatosConfig } from "@/app/admin/acciones/evaluaciones";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { AreaTexto, Campo, Entrada } from "@/app/components/ui/Campo";
import { Interruptor } from "@/app/components/ui/Interruptor";
import type { ConfigEvaluacion } from "@/lib/datos/evaluaciones";

// Título, descripción, apertura/cierre (hora de Colombia), duración, intentos y
// dos opciones: cerrar al acabar el tiempo y mostrar las correctas en el resultado.
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
    cierre_automatico: inicial.cierre_automatico,
    mostrar_correctas: inicial.mostrar_correctas,
  });
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  type CampoTexto = Exclude<keyof DatosConfig, "cierre_automatico" | "mostrar_correctas">;
  const cambiar = (campo: CampoTexto) => (v: string) => {
    setDatos((d) => ({ ...d, [campo]: v }));
    setGuardado(false);
    setError(null);
  };
  const cambiarOpcion = (campo: "cierre_automatico" | "mostrar_correctas") => (v: boolean) => {
    setDatos((d) => ({ ...d, [campo]: v }));
    setGuardado(false);
    setError(null);
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

      <div className="flex flex-col divide-y divide-borde-suave rounded-xl border-[1.5px] border-borde-suave bg-campo">
        <Opcion
          etiqueta="Cerrar al acabar el tiempo"
          ayuda={
            datos.duracion_min.trim()
              ? "Al llegar a cero se envía sola. Apagado: el tiempo es solo una referencia."
              : "Necesita una duración. Sin ella, el tiempo es solo una referencia."
          }
          activo={datos.cierre_automatico}
          onCambio={cambiarOpcion("cierre_automatico")}
          error={errorDe("cierre_automatico")}
        />
        <Opcion
          etiqueta="Mostrar respuestas correctas en el resultado"
          ayuda="En las que falló, cuando ya no le queden intentos o la evaluación haya cerrado."
          activo={datos.mostrar_correctas}
          onCambio={cambiarOpcion("mostrar_correctas")}
        />
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

// Una opción sí/no: texto a la izquierda, interruptor a la derecha.
function Opcion({
  etiqueta,
  ayuda,
  activo,
  onCambio,
  error,
}: {
  etiqueta: string;
  ayuda: string;
  activo: boolean;
  onCambio: (v: boolean) => void;
  error?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-tinta">{etiqueta}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-gris-oscuro">{ayuda}</p>
        {error && (
          <p role="alert" className="mt-1 text-[13px] leading-snug text-error-texto">
            {error}
          </p>
        )}
      </div>
      <div className="pt-0.5">
        <Interruptor activo={activo} onCambio={onCambio} etiqueta={etiqueta} />
      </div>
    </div>
  );
}
