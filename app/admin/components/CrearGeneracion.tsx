"use client";

import { useState, useTransition, type FormEvent } from "react";
import { crearGeneracionAction } from "@/app/admin/acciones/generaciones";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";

// Crea la generación y sus 16 evaluaciones (generar_evaluaciones), y abre su cuadrícula.
export default function CrearGeneracion() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>+ Crear generación</Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Crear generación">
        <Formulario />
      </Dialogo>
    </>
  );
}

function Formulario() {
  const [datos, setDatos] = useState({ codigo: "", nombre: "", fecha_inicio: "", fecha_fin: "" });
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const errorDe = (c: string) => (error?.campo === c ? error.mensaje : null);

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      // Si sale bien, la action redirige a la nueva generación.
      const r = await crearGeneracionAction(datos);
      if (r && !r.ok) setError({ mensaje: r.error, campo: r.campo });
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Fecha de inicio" htmlFor="gen-inicio" error={errorDe("fecha_inicio")}>
        <Entrada
          id="gen-inicio"
          type="date"
          value={datos.fecha_inicio}
          onChange={(e) => {
            const v = e.target.value;
            setDatos((d) => ({
              ...d,
              fecha_inicio: v,
              // Sugerencia: gen-AAAA-MM, mientras no escriban un código propio.
              codigo: !codigoTocado && v ? `gen-${v.slice(0, 7)}` : d.codigo,
            }));
          }}
          invalida={!!errorDe("fecha_inicio")}
        />
      </Campo>
      <Campo
        etiqueta="Código"
        htmlFor="gen-codigo"
        error={errorDe("codigo")}
        ayuda="Minúsculas, números y guiones. Va en el enlace de cada evaluación (ej. gen-2026-10-m01)."
      >
        <Entrada
          id="gen-codigo"
          value={datos.codigo}
          placeholder="gen-2026-10"
          onChange={(e) => {
            setCodigoTocado(true);
            setDatos((d) => ({ ...d, codigo: e.target.value }));
          }}
          invalida={!!errorDe("codigo")}
        />
      </Campo>
      <Campo etiqueta="Nombre" htmlFor="gen-nombre" error={errorDe("nombre")}>
        <Entrada
          id="gen-nombre"
          value={datos.nombre}
          placeholder="Generación octubre 2026"
          onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
          invalida={!!errorDe("nombre")}
        />
      </Campo>
      <Campo
        etiqueta="Fecha de fin"
        htmlFor="gen-fin"
        error={errorDe("fecha_fin")}
        ayuda="Opcional."
      >
        <Entrada
          id="gen-fin"
          type="date"
          value={datos.fecha_fin}
          onChange={(e) => setDatos((d) => ({ ...d, fecha_fin: e.target.value }))}
          invalida={!!errorDe("fecha_fin")}
        />
      </Campo>

      {error && !error.campo && <Aviso tono="error">{error.mensaje}</Aviso>}

      <p className="text-sm text-gris-oscuro">
        Se crearán las 16 evaluaciones sin publicar y sin preguntas.
      </p>
      <Boton type="submit" disabled={pendiente} ancho>
        {pendiente ? "Creando…" : "Crear generación"}
      </Boton>
    </form>
  );
}
