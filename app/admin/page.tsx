import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { listarGeneraciones } from "@/lib/datos/generaciones";
import { contarIntentosPorRevisar } from "@/lib/datos/revision";
import { formatearFecha } from "@/lib/fechas";
import { Aviso } from "@/app/components/ui/Aviso";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Insignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import CrearGeneracion from "./components/CrearGeneracion";
import { Cargando } from "./components/Cargando";

export const metadata: Metadata = { title: "Generaciones" };

export default function Generaciones() {
  return (
    <Suspense fallback={<Cargando />}>
      <ListaGeneraciones />
    </Suspense>
  );
}

async function ListaGeneraciones() {
  const staff = await staffParaPagina();
  const [generaciones, porRevisar] = await Promise.all([listarGeneraciones(), contarIntentosPorRevisar()]);

  return (
    <>
      <TituloPagina
        titulo="Generaciones"
        subtitulo="Cada generación tiene 12 evaluaciones mensuales y 4 trimestrales."
        acciones={staff.rol === "admin" ? <CrearGeneracion /> : null}
      />

      {porRevisar > 0 && (
        <Aviso tono="error" className="mb-5">
          {porRevisar === 1 ? "Hay 1 intento" : `Hay ${porRevisar} intentos`} por revisar (la IA o el correo
          no terminaron).{" "}
          <Link href="/admin/resultados" className="font-bold underline">
            Revisar
          </Link>
        </Aviso>
      )}

      {generaciones.length === 0 ? (
        <Tarjeta className="text-center">
          <p className="font-bold text-titulo">Aún no hay generaciones.</p>
          <p className="mt-1 text-sm text-gris-oscuro">
            {staff.rol === "admin"
              ? "Crea la primera con el botón «Crear generación»."
              : "Pídele a un administrador que cree la primera."}
          </p>
        </Tarjeta>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {generaciones.map((g) => (
            <li key={g.id}>
              <Link
                href={`/admin/generaciones/${g.id}`}
                className="group block rounded-[14px] focus-visible:outline-2 focus-visible:outline-rosa"
              >
                <Tarjeta className="h-full transition-shadow duration-150 group-hover:shadow-[0_6px_20px_rgba(65,39,107,0.12)]">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Insignia tono="lavanda">{g.codigo}</Insignia>
                    {!g.activa && <Insignia tono="gris">Inactiva</Insignia>}
                    {g.evaluaciones < 16 && (
                      <Insignia tono="rojo">Faltan {16 - g.evaluaciones} evaluaciones</Insignia>
                    )}
                  </div>
                  <h2 className="text-lg font-extrabold text-titulo group-hover:text-violeta">
                    {g.nombre}
                  </h2>
                  <p className="mt-0.5 text-sm text-gris-oscuro">
                    Desde {formatearFecha(g.fecha_inicio)}
                    {g.fecha_fin && ` hasta ${formatearFecha(g.fecha_fin)}`}
                  </p>
                  <dl className="mt-4 flex gap-6 text-sm">
                    <div>
                      <dt className="text-gris">Publicadas</dt>
                      <dd className="text-[17px] font-semibold text-tinta">
                        {g.publicadas}
                        <span className="font-extrabold text-rosa-hover">/{g.evaluaciones}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gris">Estudiantes activos</dt>
                      <dd className="text-[17px] font-semibold text-tinta">{g.estudiantes}</dd>
                    </div>
                  </dl>
                </Tarjeta>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
