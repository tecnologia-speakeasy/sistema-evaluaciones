import { Suspense } from "react";
import Link from "next/link";
import { BotonEnlace } from "@/app/components/ui/Boton";
import { Encabezado } from "@/app/components/ui/Encabezado";
import { Insignia, type TonoInsignia } from "@/app/components/ui/InsigniaEstado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { estudianteParaPagina } from "@/lib/auth/guards";
import {
  cerrarVencidos,
  evaluacionesDelEstudiante,
  historial,
  puedePresentar,
  type EvaluacionEstudiante,
} from "@/lib/datos/intentos";
import { formatearFechaHora } from "@/lib/fechas";
import { textoDuracion } from "@/lib/intentos/reloj";

// Inicio del estudiante (styles.hubPage de a2): sus evaluaciones publicadas de
// su generación, con estado, mejor puntaje e intentos usados.
export default function Inicio() {
  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Suspense fallback={<Encabezado />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

async function Contenido() {
  const estudiante = await estudianteParaPagina();
  await cerrarVencidos(estudiante.id);
  const evaluaciones = await evaluacionesDelEstudiante(estudiante.id, estudiante.generacion_id);
  // Generación desactivada: no ve evaluaciones, pero sí su historial.
  const inactiva = !estudiante.generacion_activa;
  const hayIntentos = inactiva
    ? (await historial(estudiante.id)).length > 0
    : evaluaciones.some((e) => e.ultimo_numero !== null);

  return (
    <>
      <Encabezado nombre={estudiante.nombre} detalle={estudiante.generacion_nombre} salir />
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-[18px] pt-8 pb-12 md:px-7 md:pt-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-gris">{estudiante.generacion_nombre}</p>
            <h1 className="text-[clamp(26px,4vw,34px)] leading-tight font-extrabold text-marca">
              Hola, {estudiante.nombre}
            </h1>
            <p className="mt-1.5 text-[15px] text-gris-hub">
              {evaluaciones.length ? "Estas son tus evaluaciones." : "Aquí verás tus evaluaciones publicadas."}
            </p>
          </div>
          {hayIntentos && (
            <BotonEnlace href="/historial" variante="secundario">
              Mi historial
            </BotonEnlace>
          )}
        </div>

        {evaluaciones.length === 0 ? (
          <Tarjeta className="mx-auto flex max-w-[580px] flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- igual que a2 */}
            <img src="/Felipe_test.png" alt="" className="mb-4 h-auto w-full max-w-[360px]" />
            <p className="text-[15px] text-gris-oscuro">
              {inactiva
                ? `Tu generación está desactivada por ahora: no hay evaluaciones disponibles.${
                    hayIntentos ? " Tus resultados siguen en «Mi historial»." : ""
                  }`
                : "Todavía no hay evaluaciones publicadas. Cuando tu coordinador publique una, aparecerá aquí."}
            </p>
          </Tarjeta>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {evaluaciones.map((e) => (
              <li key={e.id}>
                <TarjetaEvaluacion e={e} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function estadoParaEstudiante(e: EvaluacionEstudiante): { texto: string; tono: TonoInsignia } {
  if (e.en_curso) return { texto: "En curso", tono: "rosa" };
  if (e.estado === "programada") return { texto: "Próximamente", tono: "lavanda" };
  if (e.estado === "cerrada") return { texto: "Cerrada", tono: "gris" };
  if (e.ultimo_numero !== null) return { texto: "Presentada", tono: "violeta" };
  return { texto: "Disponible", tono: "verde" };
}

function TarjetaEvaluacion({ e }: { e: EvaluacionEstudiante }) {
  const codigo = `${e.tipo === "mensual" ? "M" : "T"}${e.numero}`;
  const estado = estadoParaEstudiante(e);
  const puede = puedePresentar(e);
  const resultado = e.ultimo_numero ? `/evaluacion/${e.slug}/intentos/${e.ultimo_numero}` : null;
  const intentos =
    e.intentos_permitidos === null
      ? `${e.intentos_usados} ${e.intentos_usados === 1 ? "intento" : "intentos"}`
      : `${e.intentos_usados} de ${e.intentos_permitidos} ${e.intentos_permitidos === 1 ? "intento" : "intentos"}`;

  let accion: { texto: string; href: string; variante: "primario" | "secundario" } | null = null;
  if (e.en_curso) accion = { texto: "Continuar", href: `/evaluacion/${e.slug}`, variante: "primario" };
  else if (puede)
    accion = { texto: e.ultimo_numero ? "Presentar otra vez" : "Presentar", href: `/evaluacion/${e.slug}`, variante: "primario" };

  return (
    <Tarjeta className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-lavanda text-sm font-bold text-violeta">
          {codigo}
        </span>
        <Insignia tono={estado.tono}>{estado.texto}</Insignia>
      </div>
      <h2 className="text-base leading-snug font-extrabold text-titulo">{e.titulo}</h2>
      <div className="mt-1.5 space-y-0.5 text-[13px] text-gris-oscuro">
        {e.estado === "programada" && e.apertura && <p>Abre: {formatearFechaHora(e.apertura)}</p>}
        {e.estado === "abierta" && e.cierre && <p>Cierra: {formatearFechaHora(e.cierre)}</p>}
        <p className="flex flex-wrap gap-x-1.5">
          <span className="whitespace-nowrap">{e.duracion_min ? textoDuracion(e.duracion_min) : "Sin límite de tiempo"}</span>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap">{intentos}</span>
        </p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-[11px] font-semibold text-gris">Mejor puntaje</p>
          <p className="text-[22px] leading-tight font-extrabold text-tinta">
            {e.mejor_puntaje ?? "—"}
            {e.mejor_puntaje !== null && <span className="text-sm font-bold text-rosa-hover">/100</span>}
          </p>
        </div>
        {resultado && (
          <Link href={resultado} className="text-sm font-semibold text-violeta hover:underline">
            Ver resultado →
          </Link>
        )}
      </div>

      {accion && (
        <BotonEnlace href={accion.href} variante={accion.variante} ancho className="mt-4">
          {accion.texto}
        </BotonEnlace>
      )}
    </Tarjeta>
  );
}
