"use client";

import { useState, useTransition, type FormEvent } from "react";
import { crearStaffAction } from "@/app/admin/acciones/staff";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada, Selector } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { ContrasenaTemporal } from "./ContrasenaTemporal";

// Crea un docente o admin con una contraseña temporal generada por el sistema.
export default function NuevoMiembro() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>+ Nuevo miembro</Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Nuevo miembro del staff">
        <Formulario onCerrar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

function Formulario({ onCerrar }: { onCerrar: () => void }) {
  const [datos, setDatos] = useState({ email: "", nombre: "", rol: "docente" });
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);
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
      const r = await crearStaffAction(datos);
      if (r.ok) setCreado({ email: datos.email.trim().toLowerCase(), password: r.password });
      else setError({ mensaje: r.error, campo: r.campo });
    });
  }

  if (creado) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="exito">Listo: creamos la cuenta.</Aviso>
        <ContrasenaTemporal email={creado.email} password={creado.password} />
        <Boton onClick={onCerrar} ancho>
          Listo, ya la guardé
        </Boton>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Correo" htmlFor="staff-email" error={errorDe("email")}>
        <Entrada
          id="staff-email"
          type="email"
          autoComplete="off"
          value={datos.email}
          onChange={(e) => cambiar("email", e.target.value)}
          invalida={!!errorDe("email")}
        />
      </Campo>
      <Campo etiqueta="Nombre" htmlFor="staff-nombre" error={errorDe("nombre")}>
        <Entrada
          id="staff-nombre"
          autoComplete="off"
          value={datos.nombre}
          onChange={(e) => cambiar("nombre", e.target.value)}
          invalida={!!errorDe("nombre")}
        />
      </Campo>
      <Campo
        etiqueta="Rol"
        htmlFor="staff-rol"
        error={errorDe("rol")}
        ayuda="Docente: evaluaciones, preguntas y resultados. Administrador: además generaciones, estudiantes y staff."
      >
        <Selector id="staff-rol" value={datos.rol} onChange={(e) => cambiar("rol", e.target.value)}>
          <option value="docente">Docente</option>
          <option value="admin">Administrador</option>
        </Selector>
      </Campo>
      {error && !error.campo && <Aviso tono="error">{error.mensaje}</Aviso>}
      <p className="text-sm text-gris-oscuro">
        Generaremos una contraseña temporal que verás una sola vez; al entrar, tendrá que cambiarla.
      </p>
      <Boton type="submit" disabled={pendiente} ancho>
        {pendiente ? "Creando…" : "Crear y generar contraseña"}
      </Boton>
    </form>
  );
}
