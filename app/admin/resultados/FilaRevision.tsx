"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { reintentarEnvioAction, reintentarIAAction } from "@/app/admin/acciones/intentos";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Insignia, type TonoInsignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { IntentoPorRevisar } from "@/lib/datos/revision";
import { formatearFechaHora } from "@/lib/fechas";

const ESTADO: Record<string, { texto: string; tono: TonoInsignia }> = {
  error: { texto: "Error de IA", tono: "rojo" },
  pendiente: { texto: "Pendiente", tono: "lavanda" },
  calificando: { texto: "Calificando", tono: "lavanda" },
  listo: { texto: "Correo sin enviar", tono: "gris" },
};

export default function FilaRevision({ intento: i }: { intento: IntentoPorRevisar }) {
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const router = useRouter();

  // Si quedó listo, la fila sale de la lista tras mostrar el aviso unos segundos.
  useEffect(() => {
    if (!resultado?.ok) return;
    const t = setTimeout(() => router.refresh(), 3000);
    return () => clearTimeout(t);
  }, [resultado, router]);
  const estado = ESTADO[i.estado] ?? { texto: i.estado, tono: "gris" as const };
  const codigo = `${i.tipo === "mensual" ? "M" : "T"}${i.eval_numero}`;

  function reintentar() {
    setResultado(null);
    iniciar(async () => {
      const r = i.problema_ia ? await reintentarIAAction(i.id) : await reintentarEnvioAction(i.id);
      setResultado(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
      // Si falló, se actualiza de una vez (nuevo conteo de fallos y último error).
      if (!r.ok) router.refresh();
    });
  }

  return (
    <Tarjeta relleno="p-4 md:px-5" className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Insignia tono={estado.tono}>{estado.texto}</Insignia>
          <span className="text-[13px] text-gris">
            {i.generacion} · {codigo} · Intento {i.numero} · {formatearFechaHora(i.completado)}
          </span>
        </div>
        <p className="font-bold text-titulo">
          {i.nombre} <span className="font-normal text-gris-oscuro">· {i.email}</span>
        </p>
        <p className="text-sm text-gris-oscuro">{i.titulo}</p>
        {i.problema_ia && i.ia_error && (
          <p className="mt-1.5 text-[13px] break-words text-error-texto">
            {i.ia_intentos} {i.ia_intentos === 1 ? "fallo" : "fallos"} de la IA. Último: {i.ia_error}
          </p>
        )}
        {i.envio_error && <p className="mt-1.5 text-[13px] break-words text-error-texto">Envío: {i.envio_error}</p>}
        {resultado && (
          <Aviso tono={resultado.ok ? "exito" : "error"} className="mt-2">
            {resultado.texto}
          </Aviso>
        )}
      </div>
      <Boton
        variante="secundario"
        tamano="sm"
        className="shrink-0"
        disabled={pendiente || resultado?.ok === true}
        onClick={reintentar}
      >
        {pendiente ? "Reintentando…" : i.problema_ia ? "Reintentar IA" : "Reintentar envío"}
      </Boton>
    </Tarjeta>
  );
}
