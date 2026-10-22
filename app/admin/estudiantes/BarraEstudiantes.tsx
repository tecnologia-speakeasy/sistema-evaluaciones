"use client";

import Form from "next/form";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada, Selector } from "@/app/components/ui/Campo";

export type OpcionGeneracion = { id: number; nombre: string; codigo: string; activa: boolean };

// Generación y búsqueda en la URL (?generacion=&q=): se puede compartir el enlace
// y funciona sin JavaScript. Cambiar la generación filtra de una vez.
export default function BarraEstudiantes({
  generaciones,
  generacionId,
  q,
}: {
  generaciones: OpcionGeneracion[];
  generacionId: number;
  q: string;
}) {
  return (
    <Form
      key={`${generacionId}|${q}`}
      action="/admin/estudiantes"
      className="mb-5 flex flex-col gap-3 md:flex-row md:items-end"
    >
      <Campo etiqueta="Generación" htmlFor="est-generacion" className="md:w-[340px]">
        <Selector
          id="est-generacion"
          name="generacion"
          defaultValue={generacionId}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {generaciones.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nombre}
              {g.activa ? "" : " (desactivada)"}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Buscar" htmlFor="est-q" className="flex-1">
        <div className="flex gap-2">
          <Entrada id="est-q" name="q" type="search" defaultValue={q} placeholder="Correo o nombre" />
          <Boton type="submit" variante="secundario">
            Buscar
          </Boton>
        </div>
      </Campo>
    </Form>
  );
}
