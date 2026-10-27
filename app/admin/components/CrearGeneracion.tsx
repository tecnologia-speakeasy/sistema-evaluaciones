"use client";

import { useState, useTransition, type FormEvent } from "react";
import { crearGeneracionAction } from "@/app/admin/acciones/generaciones";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";

// Crea la generación y sus 18 evaluaciones (generar_evaluaciones), y abre su
// cuadrícula. El código no se escribe: el servidor lo asigna a partir de la
// fecha de inicio (lib/datos/generaciones.ts).
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
  const [datos, setDatos] = useState({ nombre: "", fecha_inicio: "", fecha_fin: "" });
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const errorDe = (c: string) => (error?.campo === c ? error.mensaje : null);
  // Lo que asignará el servidor (o con -2, -3… si ya hay otra ese mes).
  const codigo = datos.fecha_inicio ? `gen-${datos.fecha_inicio.slice(0, 7)}` : null;

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
        etiqueta="Fecha de inicio"
        htmlFor="gen-inicio"
        error={errorDe("fecha_inicio")}
        ayuda={
          codigo
            ? `Su código será ${codigo} (o ${codigo}-2 si ya hay otra ese mes). Se asigna solo.`
            : "El código de la generación se asigna solo a partir de esta fecha."
        }
      >
        <Entrada
          id="gen-inicio"
          type="date"
          value={datos.fecha_inicio}
          onChange={(e) => setDatos((d) => ({ ...d, fecha_inicio: e.target.value }))}
          invalida={!!errorDe("fecha_inicio")}
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
        Se crearán las 18 evaluaciones (bienvenida, 12 mensuales, 4 trimestrales y la final) sin publicar y sin preguntas.
      </p>
      <Boton type="submit" disabled={pendiente} ancho>
        {pendiente ? "Creando…" : "Crear generación"}
      </Boton>
    </form>
  );
}
