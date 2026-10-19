"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  eliminarGeneracionAction,
  resumenEliminacionAction,
  type ResultadoResumenEliminacion,
} from "@/app/admin/acciones/generaciones";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";

// Eliminar la generación (solo admin). Irreversible: primero el resumen de lo que
// se borra (pedido al abrir, así está al día) y luego escribir su código.
export default function EliminarGeneracion({ generacionId }: { generacionId: number }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante="peligro" onClick={() => setAbierto(true)}>
        Eliminar
      </Boton>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="¿Eliminar la generación?">
        <Confirmacion generacionId={generacionId} onCerrar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

const cuantos = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;

function Confirmacion({ generacionId, onCerrar }: { generacionId: number; onCerrar: () => void }) {
  const [resumen, setResumen] = useState<ResultadoResumenEliminacion | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    let vigente = true;
    void resumenEliminacionAction(generacionId).then((r) => vigente && setResumen(r));
    return () => {
      vigente = false;
    };
  }, [generacionId]);

  if (!resumen) return <p className="text-[15px] text-gris-oscuro">Revisando lo que se borraría…</p>;
  if (!resumen.ok) return <Aviso tono="error">{resumen.error}</Aviso>;
  const r = resumen.resumen;
  const coincide = codigo.trim() === r.codigo;

  function eliminar() {
    setError(null);
    iniciar(async () => {
      // Si sale bien, la acción lleva a /admin.
      const res = await eliminarGeneracionAction(generacionId, codigo);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 text-[15px] text-tinta">
      <Aviso tono="error">
        <strong>Esto no se puede deshacer.</strong> Se borra <strong>{r.nombre}</strong> con todo lo suyo:
      </Aviso>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          {cuantos(r.evaluaciones, "evaluación", "evaluaciones")} y {cuantos(r.preguntas, "pregunta", "preguntas")}.
        </li>
        <li>{cuantos(r.estudiantes, "estudiante", "estudiantes")}: dejarán de poder entrar.</li>
        <li>
          {cuantos(r.intentos, "intento", "intentos")} con sus puntajes y feedback (también los que sus estudiantes
          tengan en otras generaciones).
        </li>
      </ul>
      {r.intentos > 0 && (
        <p className="text-sm text-gris-oscuro">
          ¿Necesitas los resultados?{" "}
          <Link
            href={`/admin/resultados?generacion=${encodeURIComponent(r.codigo)}&estado=todos`}
            className="font-semibold text-violeta underline-offset-2 hover:underline"
          >
            Expórtalos antes
          </Link>
          . Si solo quieres que sus estudiantes dejen de verla, desactívala en vez de eliminarla.
        </p>
      )}
      <Campo
        etiqueta={
          <>
            Escribe <span className="font-mono">{r.codigo}</span> para confirmar
          </>
        }
        htmlFor="eliminar-codigo"
      >
        <Entrada
          id="eliminar-codigo"
          autoComplete="off"
          spellCheck={false}
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            setError(null);
          }}
        />
      </Campo>
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton variante="peligro" disabled={!coincide || pendiente} onClick={eliminar}>
          {pendiente ? "Eliminando…" : "Eliminar generación"}
        </Boton>
      </div>
    </div>
  );
}
