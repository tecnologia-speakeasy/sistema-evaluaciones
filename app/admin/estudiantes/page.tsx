import type { Metadata } from "next";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { listarEstudiantes, POR_PAGINA_ESTUDIANTES } from "@/lib/datos/estudiantes";
import { listarGeneraciones } from "@/lib/datos/generaciones";
import { idUrlSchema } from "@/lib/validacion";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Paginacion } from "@/app/components/ui/Paginacion";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { Cargando } from "@/app/admin/components/Cargando";
import { SoloAdmin } from "@/app/admin/components/SoloAdmin";
import BarraEstudiantes from "./BarraEstudiantes";
import FilaEstudiante from "./FilaEstudiante";
import ImportarCsv from "./ImportarCsv";

export const metadata: Metadata = { title: "Estudiantes" };

// Estudiantes por generación (solo admin): buscador, activar/desactivar,
// manychat_id y carga por CSV. Estar en la lista = estar autorizado; nunca se
// borran, se desactivan.
export default function Estudiantes({ searchParams }: PageProps<"/admin/estudiantes">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function url(generacion: number, q: string, pagina = 1) {
  const p = new URLSearchParams({ generacion: String(generacion) });
  if (q) p.set("q", q);
  if (pagina > 1) p.set("pagina", String(pagina));
  return `/admin/estudiantes?${p}`;
}

async function Contenido({ searchParams }: { searchParams: PageProps<"/admin/estudiantes">["searchParams"] }) {
  const staff = await staffParaPagina();
  if (staff.rol !== "admin") return <SoloAdmin titulo="Estudiantes" />;
  const sp = await searchParams;
  const generaciones = await listarGeneraciones();

  if (generaciones.length === 0) {
    return (
      <>
        <TituloPagina titulo="Estudiantes" />
        <Tarjeta className="text-center">
          <p className="font-bold text-titulo">Aún no hay generaciones.</p>
          <p className="mt-1 text-sm text-gris-oscuro">Crea una en «Generaciones» y luego carga sus estudiantes.</p>
        </Tarjeta>
      </>
    );
  }

  // Por defecto, la generación activa más reciente (la lista viene de la más nueva).
  const pedida = idUrlSchema.safeParse(primero(sp.generacion));
  const generacion =
    (pedida.success && generaciones.find((g) => g.id === pedida.data)) ||
    generaciones.find((g) => g.activa) ||
    generaciones[0];
  const q = primero(sp.q).trim().slice(0, 120);
  const pagina = Math.max(1, Number.parseInt(primero(sp.pagina), 10) || 1);
  const { filas, total } = await listarEstudiantes(generacion.id, { q, pagina });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_ESTUDIANTES));
  const opciones = generaciones.map((g) => ({ id: g.id, nombre: g.nombre, codigo: g.codigo, activa: g.activa }));

  return (
    <>
      <TituloPagina
        titulo="Estudiantes"
        subtitulo="Estar en la lista = estar autorizado para entrar. Se cargan por CSV y nunca se borran: se desactivan."
        acciones={<ImportarCsv generaciones={opciones} generacionId={generacion.id} />}
      />
      <BarraEstudiantes generaciones={opciones} generacionId={generacion.id} q={q} />

      <p className="mb-3 text-sm text-gris-oscuro">
        <strong className="text-tinta">{total.toLocaleString("es-CO")}</strong>{" "}
        {total === 1 ? "estudiante" : "estudiantes"}
        {q && <> que coinciden con «{q}»</>} en {generacion.nombre}
        {!generacion.activa && " (generación desactivada: sus estudiantes no ven evaluaciones)"}
      </p>

      {filas.length === 0 ? (
        <Tarjeta className="text-center">
          <p className="font-bold text-titulo">{q ? "Ningún estudiante coincide." : "Esta generación aún no tiene estudiantes."}</p>
          <p className="mt-1 text-sm text-gris-oscuro">
            {q ? "Busca por correo, nombre o manychat_id." : "Cárgalos con «Cargar CSV»."}
          </p>
        </Tarjeta>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filas.map((e) => (
            <li key={e.id}>
              <FilaEstudiante estudiante={e} />
            </li>
          ))}
        </ul>
      )}
      <Paginacion pagina={pagina} paginas={paginas} href={(p) => url(generacion.id, q, p)} />
    </>
  );
}
