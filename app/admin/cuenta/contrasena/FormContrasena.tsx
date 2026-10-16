"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { cambiarMiPasswordAction } from "@/app/admin/acciones/staff";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";

const VACIO = { actual: "", nueva: "", confirmacion: "" };

export default function FormContrasena({
  obligatorio,
  email,
  minimo,
}: {
  /** Viene de una contraseña temporal: al terminar, al panel. */
  obligatorio: boolean;
  email: string;
  minimo: number;
}) {
  const router = useRouter();
  const [datos, setDatos] = useState(VACIO);
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [listo, setListo] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const errorDe = (c: string) => (error?.campo === c ? error.mensaje : null);
  const cambiar = (c: keyof typeof VACIO, v: string) => {
    setDatos((d) => ({ ...d, [c]: v }));
    setError(null);
    setListo(false);
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await cambiarMiPasswordAction(datos);
      if (!r.ok) {
        setError({ mensaje: r.error, campo: r.campo });
        return;
      }
      setDatos(VACIO);
      if (obligatorio) {
        router.replace("/admin");
        router.refresh();
      } else {
        setListo(true);
      }
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      {/* Para que el gestor de contraseñas sepa de qué cuenta es. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Campo
        etiqueta={obligatorio ? "Contraseña temporal" : "Contraseña actual"}
        htmlFor="pw-actual"
        error={errorDe("actual")}
      >
        <Entrada
          id="pw-actual"
          type="password"
          autoComplete="current-password"
          value={datos.actual}
          onChange={(e) => cambiar("actual", e.target.value)}
          invalida={!!errorDe("actual")}
        />
      </Campo>
      <Campo
        etiqueta="Nueva contraseña"
        htmlFor="pw-nueva"
        error={errorDe("nueva")}
        ayuda={`Al menos ${minimo} caracteres. Una frase larga es más fácil de recordar.`}
      >
        <Entrada
          id="pw-nueva"
          type="password"
          autoComplete="new-password"
          value={datos.nueva}
          onChange={(e) => cambiar("nueva", e.target.value)}
          invalida={!!errorDe("nueva")}
        />
      </Campo>
      <Campo etiqueta="Repite la nueva contraseña" htmlFor="pw-confirmacion" error={errorDe("confirmacion")}>
        <Entrada
          id="pw-confirmacion"
          type="password"
          autoComplete="new-password"
          value={datos.confirmacion}
          onChange={(e) => cambiar("confirmacion", e.target.value)}
          invalida={!!errorDe("confirmacion")}
        />
      </Campo>

      {error && !error.campo && <Aviso tono="error">{error.mensaje}</Aviso>}
      {listo && <Aviso tono="exito">Listo: tu contraseña cambió. Cerramos tus otras sesiones.</Aviso>}

      <Boton type="submit" disabled={pendiente} ancho>
        {pendiente ? "Guardando…" : obligatorio ? "Guardar y continuar" : "Cambiar contraseña"}
      </Boton>
    </form>
  );
}
