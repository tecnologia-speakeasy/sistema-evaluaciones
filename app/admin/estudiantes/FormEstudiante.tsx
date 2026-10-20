"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { actualizarEstudianteAction, crearEstudianteAction } from "@/app/admin/acciones/estudiantes";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada, Selector } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";
import type { EstudianteLista } from "@/lib/datos/estudiantes";
import type { OpcionGeneracion } from "./BarraEstudiantes";

// Agregar un estudiante o editarlo (solo admin): correo, generación y
// manychat_id. Las reglas (correo del staff, correo repetido) las revisa el
// servidor. Al agregarlo o moverlo de generación, la lista lo muestra.

const urlEstudiante = (generacionId: number, email: string) =>
  `/admin/estudiantes?${new URLSearchParams({ generacion: String(generacionId), q: email })}`;

export default function AgregarEstudiante({
  generaciones,
  generacionId,
}: {
  generaciones: OpcionGeneracion[];
  generacionId: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        + Agregar estudiante
      </Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Agregar estudiante">
        <Formulario
          generaciones={generaciones}
          inicial={{ email: "", generacionId, manychat_id: "" }}
          textoBoton="Agregar estudiante"
          textoPendiente="Agregando…"
          guardar={(d) => crearEstudianteAction(d)}
          onListo={(d) => {
            setAbierto(false);
            router.push(urlEstudiante(d.generacionId, d.email));
          }}
          ayudaEmail="Entra con este correo; el nombre lo escribe al entrar."
        />
      </Dialogo>
    </>
  );
}

export function EditarEstudiante({
  estudiante: e,
  generacionId,
  generaciones,
  onCerrar,
}: {
  estudiante: EstudianteLista;
  generacionId: number;
  generaciones: OpcionGeneracion[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  return (
    <Formulario
      generaciones={generaciones}
      inicial={{ email: e.email, generacionId, manychat_id: e.manychat_id ?? "" }}
      textoBoton="Guardar cambios"
      textoPendiente="Guardando…"
      guardar={(d) => actualizarEstudianteAction(e.id, d)}
      onListo={(d) => {
        onCerrar();
        // Movido a otra generación: se va de esta lista; se muestra allá.
        if (d.generacionId !== generacionId) router.push(urlEstudiante(d.generacionId, d.email));
      }}
      ayudaGeneracion={
        e.intentos > 0 ? "Si lo cambias de generación, sus intentos y resultados se conservan." : undefined
      }
    />
  );
}

type Datos = { email: string; generacionId: number; manychat_id: string };

function Formulario({
  generaciones,
  inicial,
  textoBoton,
  textoPendiente,
  guardar,
  onListo,
  ayudaEmail,
  ayudaGeneracion,
}: {
  generaciones: OpcionGeneracion[];
  inicial: Datos;
  textoBoton: string;
  textoPendiente: string;
  guardar: (d: Datos) => Promise<{ ok: true } | { ok: false; error: string; campo?: string }>;
  onListo: (d: Datos) => void;
  ayudaEmail?: string;
  ayudaGeneracion?: string;
}) {
  const [datos, setDatos] = useState(inicial);
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const errorDe = (c: string) => (error?.campo === c ? error.mensaje : null);
  const cambiar = (d: Partial<Datos>) => {
    setDatos((v) => ({ ...v, ...d }));
    setError(null);
  };

  function enviar(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await guardar(datos);
      if (r.ok) onListo({ ...datos, email: datos.email.trim().toLowerCase() });
      else setError({ mensaje: r.error, campo: r.campo });
    });
  }

  const enCampo = error?.campo === "email" || error?.campo === "manychat_id";
  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Correo" htmlFor="estudiante-email" error={errorDe("email")} ayuda={ayudaEmail}>
        <Entrada
          id="estudiante-email"
          type="email"
          autoComplete="off"
          spellCheck={false}
          value={datos.email}
          onChange={(ev) => cambiar({ email: ev.target.value })}
          invalida={!!errorDe("email")}
        />
      </Campo>
      <Campo etiqueta="Generación" htmlFor="estudiante-generacion" ayuda={ayudaGeneracion}>
        <Selector
          id="estudiante-generacion"
          value={datos.generacionId}
          onChange={(ev) => cambiar({ generacionId: Number(ev.target.value) })}
        >
          {generaciones.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nombre}
              {g.activa ? "" : " (desactivada)"}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo
        etiqueta="manychat_id (opcional)"
        htmlFor="estudiante-manychat"
        error={errorDe("manychat_id")}
        ayuda="Solo números. Vacío = no recibe el resultado por WhatsApp."
      >
        <Entrada
          id="estudiante-manychat"
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          value={datos.manychat_id}
          onChange={(ev) => cambiar({ manychat_id: ev.target.value })}
          invalida={!!errorDe("manychat_id")}
        />
      </Campo>
      {error && !enCampo && <Aviso tono="error">{error.mensaje}</Aviso>}
      <Boton type="submit" disabled={pendiente} ancho>
        {pendiente ? textoPendiente : textoBoton}
      </Boton>
    </form>
  );
}
