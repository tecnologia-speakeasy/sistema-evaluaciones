"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnilloProgreso } from "@/app/components/examen/AnilloProgreso";
import { PantallaCalificando } from "@/app/components/examen/PantallaCalificando";
import { useAntitrampa } from "@/app/components/examen/useAntitrampa";
import { useAutoguardado, type EstadoGuardado } from "@/app/components/examen/useAutoguardado";
import { PreguntaEstudiante, type RespuestaEstudiante } from "@/app/components/preguntas/PreguntaEstudiante";
import { Encabezado } from "@/app/components/ui/Encabezado";
import type { EvaluacionEstudiante, IntentoEnCurso, Respuestas } from "@/lib/datos/intentos";
import { formatearFechaHora } from "@/lib/fechas";
import {
  AVISO_S,
  CONSULTA_ESTADO_MS,
  DEMORA_IA_MS,
  formatearReloj,
  MIN_CALIFICANDO_MS,
  segundosRestantes,
  textoDuracion,
} from "@/lib/intentos/reloj";
import { contarEspacios, posicionesPorSeccion, type PreguntaPublica } from "@/lib/preguntas/tipos";

// Presentar una evaluación, con el UX de ../evaluacion-a2 (EnglishExam.jsx):
//   intro → examen (una pregunta por pantalla) → "Estás finalizando el test" →
//   calificando → resultado (/evaluacion/[slug]/intentos/[n]).
// El intento lo crea el servidor al tocar "Comenzar" y se retoma si recarga.
// Las respuestas se guardan solas; el reloj se cuenta con la hora del servidor.

type Intento = { id: number; numero: number; inicioMs: number; desfaseMs: number };

const ROJO = "#e11d48";
const VENTANA_PASOS = 9;
const SIN_CONEXION = "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";

const clave = (p: PreguntaPublica) => String(p.id);

function respondida(p: PreguntaPublica, r: RespuestaEstudiante | undefined): boolean {
  if (p.tipo === "fill_blank") {
    const espacios = p.espacios ?? Math.max(1, contarEspacios(p.enunciado));
    return Array.isArray(r) && r.length >= espacios && r.slice(0, espacios).every((x) => x.trim() !== "");
  }
  return typeof r === "string" && r.trim() !== "";
}

export default function Examen({
  evaluacion: ev,
  preguntas,
  enCurso,
  puedeEmpezar,
  nombre,
  generacion,
}: {
  evaluacion: EvaluacionEstudiante;
  preguntas: PreguntaPublica[];
  enCurso: IntentoEnCurso | null;
  /** Hay un intento en curso o puede empezar otro. */
  puedeEmpezar: boolean;
  nombre: string;
  generacion: string;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<"intro" | "examen" | "confirmar" | "calificando">("intro");
  const [intento, setIntento] = useState<Intento | null>(null);
  const [respuestas, setRespuestas] = useState<Respuestas>({});
  const [indice, setIndice] = useState(0);
  const [ahora, setAhora] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorIntro, setErrorIntro] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [calificado, setCalificado] = useState(false);
  // La IA está tardando más de lo normal: se ofrece salir (llegará por correo).
  const [demorado, setDemorado] = useState<{ numero: number } | null>(null);
  const [cambiosPestana, setCambiosPestana] = useState(enCurso?.cambiosPestana ?? 0);
  const enviando = useRef(false);
  // Al salir de la pantalla (o quedar oculta) se deja de consultar.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const posiciones = useMemo(() => posicionesPorSeccion(preguntas), [preguntas]);
  const total = preguntas.length;
  const pregunta = preguntas[indice];
  const posicion = posiciones[indice];
  const activo = fase === "examen" || fase === "confirmar";

  const { aviso } = useAntitrampa(activo, enCurso?.cambiosPestana ?? 0, setCambiosPestana);

  // enviar() se define abajo; el autoguardado y el reloj lo llaman por aquí.
  const enviarRef = useRef<() => Promise<void>>(async () => {});
  const {
    estado: estadoGuardado,
    marcarGuardado,
    detener: detenerGuardado,
    reanudar: reanudarGuardado,
  } = useAutoguardado({
    intentoId: intento?.id ?? null,
    datos: { respuestas, cambiosPestana },
    alCerrarse: (motivo) => {
      // Se acabó el plazo: el servidor califica lo guardado. Ya enviado: al resultado.
      if (motivo === "fuera_de_plazo") void enviarRef.current();
      else if (intento) router.replace(`/evaluacion/${ev.slug}/intentos/${intento.numero}`);
    },
  });

  // Consulta el estado cada 4 s hasta que la IA termine (sin límite, como a2).
  // A los 45 s avisa que tarda. Devuelve false si el estudiante salió.
  const esperarIA = useCallback(
    async (id: number, desde: number, alDemorar: () => void): Promise<boolean> => {
      let avisado = false;
      while (montado.current) {
        await new Promise((r) => setTimeout(r, CONSULTA_ESTADO_MS));
        if (!montado.current) return false;
        if (!avisado && Date.now() - desde > DEMORA_IA_MS) {
          avisado = true;
          alDemorar();
        }
        try {
          const res = await fetch(`/api/intentos/${id}/estado`, { cache: "no-store" });
          if (res.ok && (await res.json())?.estado === "listo") return true;
        } catch {
          // Sin conexión: sigue esperando.
        }
      }
      return false;
    },
    [],
  );

  const enviar = useCallback(async () => {
    if (!intento || enviando.current) return;
    enviando.current = true;
    detenerGuardado();
    setError(null);
    setCalificado(false);
    setFase("calificando");
    const desde = Date.now();
    try {
      const res = await fetch(`/api/intentos/${intento.id}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuestas, cambiosPestana }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.numero) throw new Error(data?.error ?? SIN_CONEXION);
      // La IA (abiertas + feedback) corre en el servidor: esperar a que quede
      // lista, como a2. No se pierde nada si cierra: llega por correo.
      if (data.estado !== "listo") {
        const listo = await esperarIA(intento.id, desde, () => setDemorado({ numero: data.numero }));
        if (!listo) return;
      }
      // Como a2: el anillo llega a 100 y a los 600 ms pasa al resultado.
      setCalificado(true);
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_CALIFICANDO_MS - (Date.now() - desde)) + 600));
      router.replace(`/evaluacion/${ev.slug}/intentos/${data.numero}`);
    } catch {
      enviando.current = false;
      reanudarGuardado();
      setFase("examen");
      setError("No pudimos enviar tu evaluación. Revisa tu conexión e inténtalo de nuevo: tus respuestas están guardadas.");
    }
  }, [intento, respuestas, cambiosPestana, ev.slug, router, detenerGuardado, reanudarGuardado, esperarIA]);

  useEffect(() => {
    enviarRef.current = enviar;
  });

  // Reloj: cada segundo. Con cierre automático, al llegar a 0 se envía sola.
  const duracion = ev.duracion_min;
  useEffect(() => {
    if (!intento || !duracion || !activo) return;
    const t = setInterval(() => {
      const n = Date.now();
      setAhora(n);
      if (ev.cierre_automatico && segundosRestantes(intento.inicioMs, duracion, n + intento.desfaseMs) === 0) {
        clearInterval(t);
        void enviarRef.current();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [intento, duracion, activo, ev.cierre_automatico]);

  async function comenzar() {
    setIniciando(true);
    setErrorIntro(null);
    try {
      const res = await fetch("/api/intentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluacionId: ev.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? SIN_CONEXION);
      if (data.tipo === "finalizado") {
        router.replace(`/evaluacion/${ev.slug}/intentos/${data.numero}`);
        return;
      }
      const i = data.intento as IntentoEnCurso;
      const n = Date.now();
      setIntento({ id: i.id, numero: i.numero, inicioMs: Date.parse(i.inicio), desfaseMs: Date.parse(i.ahora) - n });
      setAhora(n);
      setRespuestas(i.borrador);
      setCambiosPestana(i.cambiosPestana);
      marcarGuardado({ respuestas: i.borrador, cambiosPestana: i.cambiosPestana });
      // Retoma en la primera pregunta sin responder.
      const pendiente = preguntas.findIndex((p) => !respondida(p, i.borrador[clave(p)]));
      setIndice(pendiente === -1 ? Math.max(0, total - 1) : pendiente);
      setFase("examen");
    } catch (e) {
      setErrorIntro(e instanceof Error && e.message ? e.message : SIN_CONEXION);
    } finally {
      setIniciando(false);
    }
  }

  if (fase === "intro") {
    return (
      <Intro
        ev={ev}
        enCurso={Boolean(enCurso)}
        puedeEmpezar={puedeEmpezar}
        iniciando={iniciando}
        error={errorIntro}
        onComenzar={comenzar}
      />
    );
  }

  if (!intento || !pregunta || !posicion) return null;

  const restante = duracion ? segundosRestantes(intento.inicioMs, duracion, ahora + intento.desfaseMs) : null;
  const critico = restante !== null && restante > 0 && restante <= AVISO_S;
  const cumplido = restante === 0;
  const textoReloj = restante !== null ? formatearReloj(restante) : "";
  const respuestaActual = respuestas[clave(pregunta)];
  const actualRespondida = respondida(pregunta, respuestaActual);
  const ultima = indice >= total - 1;

  function cambiarRespuesta(r: RespuestaEstudiante) {
    setRespuestas((prev) => {
      const nuevas = { ...prev };
      if (r === null) delete nuevas[clave(pregunta)];
      else nuevas[clave(pregunta)] = r;
      return nuevas;
    });
    setError(null);
  }

  function siguiente() {
    if (!actualRespondida) return;
    if (ultima) setFase("confirmar");
    else setIndice((i) => i + 1);
  }

  return (
    <div className="fondo-pagina flex min-h-screen flex-1 flex-col text-tinta">
      <Encabezado nombre={nombre} detalle={generacion} salir />
      {aviso && <AvisoSeguridad mensaje={aviso} />}

      <div className="mx-auto flex w-full max-w-[1180px] flex-1 items-start px-[18px] pt-[18px] pb-10 md:gap-7 md:px-7 md:pt-[34px] md:pb-12">
        <main className="min-w-0 flex-1">
          {/* La barra es global; el contador, por sección (como a2) */}
          <div className="mb-[30px] flex items-center gap-4">
            <div
              role="progressbar"
              aria-label="Progreso de la evaluación"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={indice + 1}
              className="h-2 flex-1 overflow-hidden rounded-full bg-[rgba(120,90,180,0.15)]"
            >
              <div
                className="degradado-progreso h-full rounded-full transition-[width] duration-300"
                style={{ width: `${((indice + 1) / total) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-[15px] font-semibold text-gris">
              {posicion.numero}/{posicion.largo}
            </span>
          </div>

          <PreguntaEstudiante
            key={pregunta.id}
            pregunta={pregunta}
            numero={posicion.numero}
            respuesta={respuestaActual ?? null}
            onCambio={cambiarRespuesta}
            cronometro={
              restante !== null ? (
                <AnilloProgreso
                  progreso={(restante / (duracion! * 60)) * 100}
                  tamano={80}
                  grosor={5}
                  color={critico || cumplido ? ROJO : "#ff327d"}
                  pista="#efe7fb"
                >
                  <span
                    aria-label={cumplido ? "Tiempo cumplido" : `Tiempo restante ${textoReloj}`}
                    className={`text-xs font-extrabold ${critico ? "animate-timer-pulse text-alerta" : cumplido ? "text-alerta" : "text-tinta"}`}
                  >
                    {textoReloj}
                  </span>
                </AnilloProgreso>
              ) : undefined
            }
          />

          {error && (
            <div
              role="alert"
              className="mt-[22px] rounded-[10px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3.5 py-2.5 text-sm text-error-texto"
            >
              {error}
            </div>
          )}

          <div className="mt-9 flex justify-between gap-3">
            <button
              type="button"
              onClick={() => setIndice((i) => Math.max(0, i - 1))}
              disabled={indice === 0}
              className="cursor-pointer rounded-[10px] border-[1.5px] border-rosa bg-white px-[22px] py-[11px] text-sm font-semibold text-rosa disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={siguiente}
              disabled={!actualRespondida}
              title={actualRespondida ? undefined : "Responde la pregunta para continuar"}
              className="cursor-pointer rounded-[10px] bg-rosa px-[26px] py-[11px] text-sm font-semibold text-white transition-colors hover:bg-rosa-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-rosa"
            >
              {ultima ? "Finalizar ✓" : "Siguiente →"}
            </button>
          </div>
          <IndicadorGuardado estado={estadoGuardado} />
        </main>

        {/* Escritorio: cronómetro + pasos de la sección (xs.sidebar) */}
        <aside className="hidden w-[270px] shrink-0 flex-col gap-[18px] md:flex">
          {restante !== null && (
            <div className="rounded-2xl bg-lavanda px-5 py-4 text-center">
              <p className="mb-1 text-[13px] text-gris">{cumplido ? "Tiempo cumplido" : "Tiempo restante"}</p>
              <p
                className={`text-[28px] font-extrabold tracking-[1px] ${
                  critico ? "animate-timer-pulse text-alerta" : cumplido ? "text-alerta" : "text-tinta"
                }`}
              >
                {textoReloj}
              </p>
            </div>
          )}
          <PasosSeccion
            preguntas={preguntas}
            respuestas={respuestas}
            indice={indice}
            inicio={posicion.inicio}
            largo={posicion.largo}
            onIr={(i) => {
              setIndice(i);
              setError(null);
            }}
          />
        </aside>
      </div>

      {fase === "confirmar" && (
        <div className="fondo-intro fixed inset-0 z-[200] flex flex-col items-center justify-center p-6 text-center">
          <button
            type="button"
            onClick={() => setFase("examen")}
            className="absolute top-6 right-8 cursor-pointer text-base text-white/85 hover:text-white"
          >
            Cerrar ✕
          </button>
          <h2 className="mb-7 max-w-[560px] text-[clamp(30px,6vw,46px)] leading-[1.2] font-extrabold text-white">
            Estás finalizando el test
          </h2>
          <p className="mb-[18px] text-base text-white/80">¿Desea continuar?</p>
          <button
            type="button"
            onClick={() => void enviar()}
            autoFocus
            className="degradado-boton w-[min(420px,80vw)] cursor-pointer rounded-xl py-3.5 text-[15px] font-semibold text-white"
          >
            Finalizar
          </button>
        </div>
      )}

      {fase === "calificando" && (
        <PantallaCalificando
          listo={calificado}
          demorado={demorado ? `/evaluacion/${ev.slug}/intentos/${demorado.numero}` : null}
        />
      )}
    </div>
  );
}

// Aviso de la antitrampa (styles.securityOverlay / securityToast de a2).
function AvisoSeguridad({ mensaje }: { mensaje: string }) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-[rgba(30,20,50,0.25)] p-6 backdrop-blur-[5px]">
      <div
        role="alert"
        className="max-w-[460px] rounded-2xl bg-[linear-gradient(90deg,#ef4444,#dc2626)] px-6 py-4 text-center text-base font-semibold text-white shadow-[0_16px_40px_rgba(220,38,38,0.35)]"
      >
        {mensaje}
      </div>
    </div>
  );
}

function IndicadorGuardado({ estado }: { estado: EstadoGuardado }) {
  if (!estado) return null;
  const texto = {
    guardado: "✓ Respuestas guardadas",
    guardando: "Guardando…",
    sin_conexion: "Sin conexión: reintentando guardar…",
  }[estado];
  return (
    <p
      aria-live="polite"
      className={`mt-4 text-right text-[13px] ${estado === "sin_conexion" ? "text-error-texto" : "text-gris"}`}
    >
      {texto}
    </p>
  );
}

// Pasos de la sección actual (xs.stepperCard): ventana de 9 "Ejercicio N".
// Se puede ir a una ya alcanzada o ya respondida, no saltar adelante.
function PasosSeccion({
  preguntas,
  respuestas,
  indice,
  inicio,
  largo,
  onIr,
}: {
  preguntas: PreguntaPublica[];
  respuestas: Respuestas;
  indice: number;
  inicio: number;
  largo: number;
  onIr: (i: number) => void;
}) {
  const enSeccion = indice - inicio;
  const desde =
    largo > VENTANA_PASOS ? Math.min(Math.max(0, enSeccion - 4), largo - VENTANA_PASOS) : 0;
  const cuantos = Math.min(largo, VENTANA_PASOS);

  return (
    <nav aria-label="Ejercicios de la sección" className="max-h-[380px] overflow-y-auto rounded-2xl bg-lavanda px-[22px] py-[18px]">
      <ol>
        {Array.from({ length: cuantos }, (_, j) => {
          const pos = desde + j;
          const global = inicio + pos;
          const hecho = pos <= enSeccion;
          const actual = pos === enSeccion;
          const puedeIr = global <= indice || respondida(preguntas[global], respuestas[clave(preguntas[global])]);
          return (
            <li key={global}>
              <button
                type="button"
                disabled={!puedeIr}
                aria-current={actual ? "step" : undefined}
                onClick={() => onIr(global)}
                className="flex h-[34px] w-full cursor-pointer items-center gap-3 text-left disabled:cursor-not-allowed"
              >
                <span className="relative flex h-[34px] w-[18px] shrink-0 items-center justify-center">
                  {j > 0 && (
                    <span className={`absolute top-0 h-[17px] w-0.5 ${pos <= enSeccion ? "bg-rosa" : "bg-linea-paso"}`} />
                  )}
                  {j < cuantos - 1 && (
                    <span className={`absolute top-[17px] h-[17px] w-0.5 ${pos < enSeccion ? "bg-rosa" : "bg-linea-paso"}`} />
                  )}
                  <span
                    className={`z-[1] rounded-full ${actual ? "size-[15px] shadow-[0_0_0_4px_rgba(255,50,125,0.18)]" : "size-[13px]"} ${
                      hecho ? "bg-rosa" : "border-2 border-borde-paso bg-white"
                    }`}
                  />
                </span>
                <span
                  className={`text-sm ${actual ? "font-bold text-tinta" : hecho ? "font-medium text-gris-oscuro" : "font-medium text-gris-claro"}`}
                >
                  Ejercicio {pos + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Pantalla previa (styles.introPage de a2). También explica por qué no puede
// presentar (aún no abre, cerró, sin intentos).
function Intro({
  ev,
  enCurso,
  puedeEmpezar,
  iniciando,
  error,
  onComenzar,
}: {
  ev: EvaluacionEstudiante;
  enCurso: boolean;
  puedeEmpezar: boolean;
  iniciando: boolean;
  error: string | null;
  onComenzar: () => void;
}) {
  const verResultado = ev.ultimo_numero ? `/evaluacion/${ev.slug}/intentos/${ev.ultimo_numero}` : null;

  let titulo: string;
  let texto: string;
  if (puedeEmpezar) {
    titulo = enCurso ? "Continúa tu test" : "Estás dando inicio al test";
    const tiempo = !ev.duracion_min
      ? "Tus respuestas se guardan solas mientras avanzas."
      : ev.cierre_automatico
        ? "Cuando el cronómetro llegue a cero, el test se enviará automáticamente con lo que hayas respondido."
        : "El cronómetro es solo una referencia: si llega a cero puedes terminar el test.";
    const restantes = ev.intentos_permitidos === null ? null : ev.intentos_permitidos - ev.intentos_usados;
    const intentos = enCurso
      ? "Tus respuestas están guardadas: sigues donde ibas."
      : restantes === null
        ? "Si quieres, luego podrás repetir la evaluación."
        : restantes === 1
          ? `Te queda 1 intento${ev.intentos_permitidos === 1 ? "" : ` de ${ev.intentos_permitidos}`}.`
          : `Te quedan ${restantes} de ${ev.intentos_permitidos} intentos.`;
    texto = `Antes de comenzar, asegúrate de tener tiempo suficiente. ${tiempo} ${intentos}`;
  } else if (ev.estado === "programada") {
    titulo = "Esta evaluación aún no abre";
    texto = `Podrás presentarla desde el ${formatearFechaHora(ev.apertura)}.`;
  } else if (ev.estado === "cerrada") {
    titulo = "Esta evaluación ya cerró";
    texto = ev.cierre ? `Cerró el ${formatearFechaHora(ev.cierre)}.` : "Ya no recibe respuestas.";
  } else if (ev.preguntas === 0) {
    titulo = "Esta evaluación aún no está lista";
    texto = "Vuelve más tarde.";
  } else {
    titulo = "Ya usaste tus intentos";
    texto = `Presentaste esta evaluación ${ev.intentos_usados} ${ev.intentos_usados === 1 ? "vez" : "veces"}.`;
  }

  return (
    <div className="fondo-intro relative flex min-h-screen flex-1 flex-col items-center justify-center p-6 text-white">
      <Link href="/" className="absolute top-[22px] right-[30px] z-[2] text-[15px] text-white/85 hover:text-white">
        Cerrar ✕
      </Link>
      <div className="flex w-full max-w-[800px] animate-fade-up flex-col items-center text-center">
        <p className="mb-3 text-sm font-semibold tracking-wide text-white/60">{ev.titulo}</p>
        <div className="mb-[54px] max-w-full text-left">
          <h1 className="mb-[18px] text-[clamp(24px,5.2vw,44px)] leading-[1.1] font-extrabold sm:whitespace-nowrap">
            {titulo}
          </h1>
          <div className="flex gap-[11px] text-left sm:w-0 sm:min-w-full">
            <span
              aria-hidden
              className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-white/55 text-xs font-bold text-white/80"
            >
              i
            </span>
            <p className="text-[17px] leading-relaxed text-white/85">{texto}</p>
          </div>
          {ev.descripcion && puedeEmpezar && (
            <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-white/70">{ev.descripcion}</p>
          )}
        </div>

        {puedeEmpezar ? (
          <>
            <p className="mb-4 text-[15px] text-white/55">
              {ev.duracion_min
                ? `Este test tiene una duración de ${textoDuracion(ev.duracion_min)}`
                : "Este test no tiene límite de tiempo"}
              {ev.cierre && !enCurso ? ` · cierra el ${formatearFechaHora(ev.cierre)}` : ""}
            </p>
            <button
              type="button"
              onClick={onComenzar}
              disabled={iniciando}
              className="degradado-boton w-full max-w-[320px] cursor-pointer rounded-xl border-2 border-rosa px-6 py-[15px] text-base font-bold text-white shadow-[0_10px_34px_rgba(255,50,125,0.4)] transition-transform hover:-translate-y-px disabled:cursor-wait disabled:opacity-90"
            >
              {iniciando ? "Un momento…" : enCurso ? "Continuar" : "Comenzar"}
            </button>
            {verResultado && !enCurso && (
              <Link href={verResultado} className="mt-4 text-sm text-white/75 underline-offset-2 hover:text-white hover:underline">
                Ver mis resultados anteriores
              </Link>
            )}
          </>
        ) : (
          <Link
            href={verResultado ?? "/"}
            className="degradado-boton w-full max-w-[320px] rounded-xl border-2 border-rosa px-6 py-[15px] text-base font-bold text-white shadow-[0_10px_34px_rgba(255,50,125,0.4)]"
          >
            {verResultado ? "Ver mi resultado" : "Volver al inicio"}
          </Link>
        )}
        {error && (
          <p role="alert" className="mt-4 max-w-[420px] text-sm text-error-claro">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
