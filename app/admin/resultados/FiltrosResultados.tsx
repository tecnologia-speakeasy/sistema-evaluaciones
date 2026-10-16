"use client";

import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada, Selector } from "@/app/components/ui/Campo";
import {
  ESTADOS_FILTRO,
  ETIQUETA_ESTADO_FILTRO,
  type FiltrosResultados as Filtros,
} from "@/lib/resultados";

// Filtros en la URL (?generacion=&evaluacion=&estado=&q=): se pueden compartir y
// funcionan sin JavaScript. Los selectores filtran de una vez; la búsqueda, al
// pulsar Enter o "Buscar". Cambiar de generación limpia la evaluación.
export default function FiltrosResultados({
  filtros,
  generaciones,
  evaluaciones,
}: {
  filtros: Filtros;
  generaciones: { codigo: string; nombre: string }[];
  evaluaciones: { slug: string; nombre: string }[];
}) {
  const [evaluacion, setEvaluacion] = useState(filtros.evaluacion);
  const hayFiltros = filtros.generacion || filtros.evaluacion || filtros.estado !== "enviados" || filtros.q;
  const enviar = (e: { currentTarget: HTMLSelectElement }) => e.currentTarget.form?.requestSubmit();

  return (
    <Form
      key={JSON.stringify(filtros)}
      action="/admin/resultados"
      className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_190px_1.4fr]"
    >
      <Campo etiqueta="Generación" htmlFor="res-generacion">
        <Selector
          id="res-generacion"
          name="generacion"
          defaultValue={filtros.generacion}
          onChange={(e) => {
            // La evaluación elegida es de otra generación: se limpia antes de enviar.
            const form = e.currentTarget.form;
            const ev = form?.elements.namedItem("evaluacion");
            if (ev instanceof HTMLSelectElement) ev.value = "";
            setEvaluacion("");
            form?.requestSubmit();
          }}
        >
          <option value="">Todas</option>
          {generaciones.map((g) => (
            <option key={g.codigo} value={g.codigo}>
              {g.nombre}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Evaluación" htmlFor="res-evaluacion">
        <Selector
          id="res-evaluacion"
          name="evaluacion"
          value={evaluacion}
          disabled={!filtros.generacion}
          title={filtros.generacion ? undefined : "Elige primero una generación"}
          onChange={(e) => {
            setEvaluacion(e.target.value);
            enviar(e);
          }}
        >
          <option value="">{filtros.generacion ? "Todas" : "Elige una generación"}</option>
          {evaluaciones.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.nombre}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Estado" htmlFor="res-estado">
        <Selector id="res-estado" name="estado" defaultValue={filtros.estado} onChange={enviar}>
          {ESTADOS_FILTRO.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO_FILTRO[e]}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo
        etiqueta="Buscar"
        htmlFor="res-q"
        accion={
          hayFiltros ? (
            <Link href="/admin/resultados" className="text-[13px] font-semibold text-violeta hover:underline">
              Quitar filtros
            </Link>
          ) : undefined
        }
      >
        <div className="flex gap-2">
          <Entrada id="res-q" name="q" type="search" defaultValue={filtros.q} placeholder="Correo o nombre" />
          <Boton type="submit" variante="secundario">
            Buscar
          </Boton>
        </div>
      </Campo>
    </Form>
  );
}
