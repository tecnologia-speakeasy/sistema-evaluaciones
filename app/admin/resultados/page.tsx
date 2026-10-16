import type { Metadata } from "next";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { listarPorGeneracion } from "@/lib/datos/evaluaciones";
import { listarGeneraciones } from "@/lib/datos/generaciones";
import { buscarResultados } from "@/lib/datos/resultados";
import { intentosPorRevisar } from "@/lib/datos/revision";
import { codigoEvaluacion, leerFiltros, urlFiltros } from "@/lib/resultados";
import { clasesBoton } from "@/app/components/ui/Boton";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Icono } from "@/app/components/ui/Icono";
import { Paginacion } from "@/app/components/ui/Paginacion";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { Cargando } from "@/app/admin/components/Cargando";
import FilaRevision from "./FilaRevision";
import FiltrosResultados from "./FiltrosResultados";
import TablaResultados from "./TablaResultados";

export const metadata: Metadata = { title: "Resultados" };

// "Reintentar IA" llama a OpenAI desde la acción (10–30 s, con reintentos).
export const maxDuration = 300;

// Resultados (admin y docente): arriba los intentos por revisar (Fase 5) y
// debajo todos los intentos de v_resultados con filtros en la URL, paginación y
// exportación a CSV de lo filtrado (./exportar).
export default function Resultados({ searchParams }: PageProps<"/admin/resultados">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: { searchParams: PageProps<"/admin/resultados">["searchParams"] }) {
  await staffParaPagina();
  const f = leerFiltros(await searchParams);
  const [revisar, generaciones, resultado] = await Promise.all([
    intentosPorRevisar(),
    listarGeneraciones(),
    buscarResultados(f),
  ]);
  const generacion = generaciones.find((g) => g.codigo === f.generacion);
  const evaluaciones = generacion ? await listarPorGeneracion(generacion.id) : [];

  return (
    <>
      <TituloPagina
        titulo="Resultados"
        subtitulo="Los intentos de los estudiantes. Filtra y exporta lo filtrado a CSV (se abre en Excel)."
      />

      <section aria-labelledby="titulo-revisar" className="mb-10">
        <h2 id="titulo-revisar" className="mb-1 text-lg font-extrabold text-titulo">
          Intentos por revisar
        </h2>
        <p className="mb-3.5 text-sm text-gris-oscuro">
          La IA falló, lleva más de 10 minutos sin terminar o el correo no salió.
        </p>
        {revisar.length === 0 ? (
          <Tarjeta relleno="px-5 py-4" className="text-[15px]">
            <strong className="text-titulo">Todo al día:</strong>{" "}
            <span className="text-gris-oscuro">no hay intentos con problemas.</span>
          </Tarjeta>
        ) : (
          <ul className="flex flex-col gap-3">
            {revisar.map((i) => (
              <li key={i.id}>
                <FilaRevision intento={i} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-intentos">
        <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
          <h2 id="titulo-intentos" className="text-lg font-extrabold text-titulo">
            Todos los intentos
          </h2>
          {/* Enlace normal (no <Link>): es una descarga, no una página. */}
          <a
            href={`/admin/resultados/exportar${urlFiltros({ ...f, pagina: 1 })}`}
            download
            className={clasesBoton({ variante: "secundario" })}
          >
            <span className="inline-flex items-center gap-2">
              <Icono nombre="descargar" className="size-[18px]" />
              Exportar CSV
            </span>
          </a>
        </div>
        <FiltrosResultados
          filtros={f}
          generaciones={generaciones.map((g) => ({ codigo: g.codigo, nombre: g.nombre }))}
          evaluaciones={evaluaciones.map((e) => ({
            slug: e.slug,
            nombre: `${codigoEvaluacion(e.tipo, e.numero)} · ${e.titulo}`,
          }))}
        />
        <p className="mb-3 text-sm text-gris-oscuro">
          <strong className="text-tinta">{resultado.total.toLocaleString("es-CO")}</strong>{" "}
          {resultado.total === 1 ? "intento" : "intentos"}
        </p>
        <TablaResultados filas={resultado.filas} />
        <Paginacion
          pagina={Math.min(f.pagina, resultado.paginas)}
          paginas={resultado.paginas}
          href={(p) => `/admin/resultados${urlFiltros({ ...f, pagina: p })}`}
        />
      </section>
    </>
  );
}
