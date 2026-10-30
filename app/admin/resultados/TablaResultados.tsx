import { Insignia, type TonoInsignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import type { FilaResultado } from "@/lib/datos/resultados";
import { formatearFechaHora } from "@/lib/fechas";
import { codigoEvaluacion, etiquetaEstado, type EstadoIntento } from "@/lib/resultados";

// Intentos filtrados: tabla desde 1024px y tarjetas en celular/tableta.
// Grammar, Writing, Reading y Listening son aciertos (como v_resultados). "Ver" abre el resultado
// público (/resultado/[token]); un intento en curso todavía no tiene.

const TONO: Record<EstadoIntento, TonoInsignia> = {
  listo: "verde",
  pendiente: "lavanda",
  calificando: "lavanda",
  error: "rojo",
  en_progreso: "gris",
};

const fecha = (f: FilaResultado) => formatearFechaHora(f.envio ?? f.inicio);
const nada = (v: number | null) => (v === null ? "—" : v);

function Ver({ f }: { f: FilaResultado }) {
  if (f.estado === "en_progreso") return null;
  return (
    <a
      href={`/resultado/${f.token}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[13px] font-semibold whitespace-nowrap text-violeta hover:underline"
    >
      Ver ↗
    </a>
  );
}

export default function TablaResultados({ filas }: { filas: FilaResultado[] }) {
  if (filas.length === 0) {
    return (
      <Tarjeta className="text-center">
        <p className="font-bold text-titulo">No hay intentos con estos filtros.</p>
        <p className="mt-1 text-sm text-gris-oscuro">Prueba con otro estado o quita los filtros.</p>
      </Tarjeta>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto rounded-[14px] border-[1.5px] border-borde bg-white lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-lavanda text-[13px] text-gris-oscuro">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estudiante</th>
              <th scope="col" className="px-4 py-3 font-semibold">Evaluación</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Puntaje</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Grammar</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Writing</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Reading</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Listening</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold" title="Cambios de pestaña">
                Pestañas
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Resultado</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.intento_id} className="border-t border-borde-suave align-top">
                <td className="px-4 py-3 whitespace-nowrap text-gris-oscuro">{fecha(f)}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-tinta">{f.nombre}</p>
                  <p className="text-[13px] break-all text-gris-oscuro">{f.email}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="font-semibold text-tinta">
                    {codigoEvaluacion(f.tipo, f.numero)} · intento {f.numero_intento}
                  </p>
                  <p className="text-[13px] text-gris-oscuro">{f.generacion}</p>
                </td>
                <td className="px-4 py-3">
                  <Insignia tono={TONO[f.estado]}>{etiquetaEstado(f.estado)}</Insignia>
                </td>
                <td className="px-4 py-3 text-right text-[15px] font-extrabold text-titulo">{nada(f.puntaje_total)}</td>
                <td className="px-4 py-3 text-right">{nada(f.grammar_score)}</td>
                <td className="px-4 py-3 text-right">{nada(f.writing_score)}</td>
                <td className="px-4 py-3 text-right">{nada(f.reading_score)}</td>
                <td className="px-4 py-3 text-right">{nada(f.listening_score)}</td>
                <td className={`px-4 py-3 text-right ${f.cambios_pestana > 0 ? "font-semibold text-error-texto" : ""}`}>
                  {f.cambios_pestana}
                </td>
                <td className="px-4 py-3 text-right">
                  <Ver f={f} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2.5 lg:hidden">
        {filas.map((f) => (
          <li key={f.intento_id}>
            <Tarjeta relleno="p-4">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Insignia tono={TONO[f.estado]}>{etiquetaEstado(f.estado)}</Insignia>
                <span className="text-[13px] text-gris">
                  {codigoEvaluacion(f.tipo, f.numero)} · intento {f.numero_intento} · {f.generacion}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-titulo">{f.nombre}</p>
                  <p className="text-[13px] break-all text-gris-oscuro">{f.email}</p>
                </div>
                <p className="shrink-0 text-[22px] leading-none font-extrabold text-titulo">
                  {nada(f.puntaje_total)}
                  {f.puntaje_total !== null && <span className="text-sm font-semibold text-gris">/100</span>}
                </p>
              </div>
              <p className="mt-2 text-[13px] text-gris-oscuro">
                Grammar {nada(f.grammar_score)} · Writing {nada(f.writing_score)} · Reading{" "}
                {nada(f.reading_score)} · Listening {nada(f.listening_score)} ·{" "}
                <span className={f.cambios_pestana > 0 ? "font-semibold text-error-texto" : ""}>
                  {f.cambios_pestana} {f.cambios_pestana === 1 ? "cambio" : "cambios"} de pestaña
                </span>
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="text-[13px] text-gris">{fecha(f)}</span>
                <Ver f={f} />
              </div>
            </Tarjeta>
          </li>
        ))}
      </ul>
    </>
  );
}
