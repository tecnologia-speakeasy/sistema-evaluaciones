"use client";

import { useState, useTransition } from "react";
import {
  cambiarActivoStaffAction,
  cambiarRolStaffAction,
  restablecerPasswordAction,
} from "@/app/admin/acciones/staff";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Selector } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Interruptor } from "@/app/components/ui/Interruptor";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { MiembroStaff } from "@/lib/datos/staff";
import { formatearFechaHora } from "@/lib/fechas";
import { ContrasenaTemporal } from "./ContrasenaTemporal";

// Un miembro del staff. Sobre sí mismo no se puede cambiar el rol, desactivar ni
// restablecer la contraseña (para eso, "Cambiar mi contraseña"); el servidor
// también lo exige, junto con "siempre al menos un admin activo".
export default function FilaStaff({ miembro: m, esYo }: { miembro: MiembroStaff; esYo: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [restablecer, setRestablecer] = useState(false);

  function ejecutar(accion: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    iniciar(async () => {
      const r = await accion();
      if (!r.ok) setError(r.error ?? "No se pudo guardar.");
    });
  }

  return (
    <Tarjeta relleno="p-4 md:px-5" className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`font-bold ${m.activo ? "text-titulo" : "text-gris-oscuro"}`}>{m.nombre}</p>
          {esYo && <Insignia tono="lavanda">Tú</Insignia>}
          {!m.activo && <Insignia tono="gris">Inactivo</Insignia>}
          {m.debe_cambiar_password && <Insignia tono="rosa">Contraseña temporal</Insignia>}
        </div>
        <p className="text-sm break-all text-gris-oscuro">{m.email}</p>
        <p className="text-[13px] text-gris">
          {m.ultimo_login ? `Último ingreso: ${formatearFechaHora(m.ultimo_login)}` : "Nunca ha entrado"}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-[13px] text-error-texto">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
        <Selector
          aria-label={`Rol de ${m.nombre}`}
          value={m.rol}
          disabled={esYo || pendiente}
          title={esYo ? "No puedes cambiar tu propio rol" : undefined}
          onChange={(e) => {
            const rol = e.target.value;
            ejecutar(() => cambiarRolStaffAction(m.id, rol));
          }}
          className="!w-auto !py-2"
        >
          <option value="docente">Docente</option>
          <option value="admin">Administrador</option>
        </Selector>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-tinta">{m.activo ? "Activo" : "Inactivo"}</span>
          <Interruptor
            activo={m.activo}
            deshabilitado={esYo || pendiente}
            onCambio={(valor) => ejecutar(() => cambiarActivoStaffAction(m.id, valor))}
            etiqueta={m.activo ? `Desactivar a ${m.nombre}` : `Activar a ${m.nombre}`}
          />
        </div>
        {!esYo && (
          <Boton variante="secundario" tamano="sm" onClick={() => setRestablecer(true)}>
            Restablecer contraseña
          </Boton>
        )}
      </div>

      <Dialogo abierto={restablecer} onCerrar={() => setRestablecer(false)} titulo="Restablecer contraseña">
        <Restablecer miembro={m} onCerrar={() => setRestablecer(false)} />
      </Dialogo>
    </Tarjeta>
  );
}

function Restablecer({ miembro: m, onCerrar }: { miembro: MiembroStaff; onCerrar: () => void }) {
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (password) {
    return (
      <div className="flex flex-col gap-4">
        <ContrasenaTemporal email={m.email} password={password} />
        <Boton onClick={onCerrar} ancho>
          Listo, ya la guardé
        </Boton>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-tinta">
        Generaremos una contraseña temporal nueva para <strong>{m.nombre}</strong>. Se cerrarán sus sesiones abiertas y
        al entrar tendrá que crear su propia contraseña.
      </p>
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await restablecerPasswordAction(m.id);
              if (r.ok) setPassword(r.password);
              else setError(r.error);
            })
          }
        >
          {pendiente ? "Generando…" : "Restablecer contraseña"}
        </Boton>
      </div>
    </div>
  );
}
