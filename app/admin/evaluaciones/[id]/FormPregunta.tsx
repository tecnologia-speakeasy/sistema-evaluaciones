"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  agregarVariantesAction,
  guardarPreguntaAction,
} from "@/app/admin/acciones/preguntas";
import {
  PreguntaEstudiante,
  type RespuestaEstudiante,
} from "@/app/components/preguntas/PreguntaEstudiante";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { AreaTexto, Campo, Entrada, Selector } from "@/app/components/ui/Campo";
import {
  ajustarVariantes,
  entradaDesdeEstado,
  estadoInicial,
  variantesDesdeEstado,
  vistaPreviaDesdeEstado,
  type EstadoFormulario,
} from "@/lib/preguntas/entrada";
import { ETIQUETA_MATERIAL, type MaterialStaff } from "@/lib/preguntas/materiales";
import {
  CATEGORIAS,
  categoriaSugerida,
  contarEspacios,
  ETIQUETA_CATEGORIA,
  ETIQUETA_TIPO,
  TIPOS_PREGUNTA,
  type PreguntaStaff,
  type TipoPregunta,
} from "@/lib/preguntas/tipos";
import { EspaciosFillBlank } from "./editores/EspaciosFillBlank";
import { OpcionesMultiple } from "./editores/OpcionesMultiple";
import { SelectorSeccion, TEXTOS_SUBSECCION } from "./editores/SelectorSeccion";
import { Traducciones } from "./editores/Traducciones";

const AYUDA_ENUNCIADO: Record<TipoPregunta, string> = {
  multiple_choice: "La oración o pregunta. Puedes usar ___ para marcar dónde va la respuesta.",
  fill_blank: "Escribe ___ (tres guiones bajos) donde va cada espacio.",
  translation: "La frase en español que el estudiante traducirá al inglés.",
  open: "La consigna que verá el estudiante.",
};

const CAMPOS_COMUNES = ["tipo", "categoria", "puntaje", "seccion", "subseccion", "material_id", "enunciado"];
const CAMPOS_TIPO: Record<TipoPregunta, string[]> = {
  multiple_choice: ["opciones", "correctas"],
  fill_blank: ["pista", "variantes"],
  translation: ["traducciones"],
  open: ["rubrica"],
};

export default function FormPregunta({
  evaluacionId,
  pregunta,
  secciones,
  seccionSugerida,
  subsecciones,
  subseccionSugerida,
  abiertasActivas,
  pesosPorPregunta,
  materiales,
  materialSugerido,
  onListo,
  onCancelar,
}: {
  evaluacionId: number;
  /** null = nueva pregunta. */
  pregunta: PreguntaStaff | null;
  secciones: string[];
  seccionSugerida: string;
  /** Subsecciones ya usadas en cada sección («Section A»…). */
  subsecciones: Record<string, string[]>;
  subseccionSugerida: string;
  /** Apagadas: "Abierta" no se ofrece (el servidor también la rechaza). */
  abiertasActivas: boolean;
  /** Apagado: no se pide el puntaje; se guarda el que tenía (10 si es nueva). */
  pesosPorPregunta: boolean;
  /** Lecturas y audios de la evaluación, para ligar la pregunta (db/009). */
  materiales: MaterialStaff[];
  /** Una pregunta nueva arranca ligada al material de la última (o a ninguno). */
  materialSugerido: number | null;
  onListo: () => void;
  onCancelar: () => void;
}) {
  // Regla 7: con respuestas de estudiantes solo se agregan variantes aceptadas.
  const soloAgregar = (pregunta?.respuestas ?? 0) > 0;
  // Una abierta que ya existe se sigue viendo como tal; nuevas, solo si están activas.
  const tipos = TIPOS_PREGUNTA.filter((t) => t !== "open" || abiertasActivas || pregunta?.tipo === "open");
  // La categoría que propone un material: Reading (lectura) o Listening (audio).
  const tipoMaterial = (id: number | null) => materiales.find((m) => m.id === id)?.tipo ?? null;
  const [original] = useState(() => {
    const inicial = estadoInicial(pregunta, seccionSugerida, subseccionSugerida);
    if (pregunta) return inicial;
    return {
      ...inicial,
      material_id: materialSugerido,
      categoria: categoriaSugerida(inicial.tipo, tipoMaterial(materialSugerido)),
    };
  });
  const [e, setE] = useState<EstadoFormulario>(original);
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [respuestaPrevia, setRespuestaPrevia] = useState<RespuestaEstudiante>(null);
  const [pendiente, iniciar] = useTransition();
  const enunciadoRef = useRef<HTMLTextAreaElement>(null);

  // Cualquier cambio borra el error anterior: ya no describe lo que hay en pantalla.
  const cambiar = (parcial: Partial<EstadoFormulario>) => {
    setE((x) => ({ ...x, ...parcial }));
    setError(null);
  };
  const errorDe = (campo: string) => (error?.campo === campo ? error.mensaje : null);
  // Sin pesos el puntaje no se ve: su error (si lo hubiera) va arriba, como general.
  const visibles = [...CAMPOS_COMUNES.filter((c) => pesosPorPregunta || c !== "puntaje"), ...CAMPOS_TIPO[e.tipo]];
  const errorGeneral = error && (!error.campo || !visibles.includes(error.campo)) ? error.mensaje : null;

  function cambiarTipo(tipo: TipoPregunta) {
    setE((x) => ({
      ...x,
      tipo,
      categoria: categoriaSugerida(tipo, tipoMaterial(x.material_id)),
      variantes: ajustarVariantes(x.variantes, x.enunciado),
    }));
    setRespuestaPrevia(null);
    setError(null);
  }

  function cambiarEnunciado(enunciado: string) {
    setE((x) => ({
      ...x,
      enunciado,
      // Un campo de variantes por cada ___ escrito.
      variantes: x.tipo === "fill_blank" ? ajustarVariantes(x.variantes, enunciado) : x.variantes,
    }));
    setError(null);
  }

  function insertarEspacio() {
    const el = enunciadoRef.current;
    const ini = el?.selectionStart ?? e.enunciado.length;
    const fin = el?.selectionEnd ?? ini;
    cambiarEnunciado(`${e.enunciado.slice(0, ini)}___${e.enunciado.slice(fin)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + 3, ini + 3);
    });
  }

  function guardar(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    iniciar(async () => {
      let r;
      if (soloAgregar) {
        const variantes = variantesDesdeEstado(e);
        if (!variantes || !pregunta) return;
        r = await agregarVariantesAction(pregunta.id, variantes);
      } else {
        r = await guardarPreguntaAction(evaluacionId, pregunta?.id ?? null, entradaDesdeEstado(e));
      }
      if (!r.ok) {
        setError({ mensaje: r.error, campo: r.campo });
        return;
      }
      onListo();
    });
  }

  const sinNadaQueAgregar = soloAgregar && e.tipo === "open";
  const textoBoton = soloAgregar
    ? "Agregar variantes"
    : pregunta
      ? "Guardar cambios"
      : "Crear pregunta";

  return (
    <form
      onSubmit={guardar}
      noValidate
      className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 flex-col gap-5">
        {soloAgregar && (
          <Aviso>
            Esta pregunta ya tiene <strong>{pregunta?.respuestas}</strong>{" "}
            {pregunta?.respuestas === 1 ? "respuesta" : "respuestas"} de estudiantes: solo puedes
            agregar respuestas aceptadas. Para otros cambios, duplícala y desactiva esta.
          </Aviso>
        )}

        {/* Tipo: botones con el estilo de las opciones de a2. Solo se anima el
            color de fondo (hover): el degradado cambia de golpe y, si el texto
            se animara, por un instante quedaría oscuro sobre el degradado. */}
        <Campo etiqueta="Tipo de pregunta" error={errorDe("tipo")}>
          <div role="radiogroup" aria-label="Tipo de pregunta" className={`grid grid-cols-2 gap-2 ${tipos.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            {tipos.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={e.tipo === t}
                disabled={soloAgregar}
                onClick={() => cambiarTipo(t)}
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-sm font-semibold transition-[background-color] duration-150 disabled:cursor-not-allowed ${
                  e.tipo === t
                    ? "degradado-opcion text-white"
                    : "bg-opcion text-tinta hover:bg-lavanda disabled:opacity-50"
                }`}
              >
                {ETIQUETA_TIPO[t]}
              </button>
            ))}
          </div>
        </Campo>

        <div className={`grid gap-4 ${pesosPorPregunta ? "sm:grid-cols-[1fr_150px]" : ""}`}>
          <Campo etiqueta="Categoría" htmlFor="p-categoria" error={errorDe("categoria")}>
            <Selector
              id="p-categoria"
              value={e.categoria}
              disabled={soloAgregar}
              onChange={(x) => cambiar({ categoria: x.target.value as EstadoFormulario["categoria"] })}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CATEGORIA[c]}
                </option>
              ))}
            </Selector>
          </Campo>
          {pesosPorPregunta && (
            <Campo etiqueta="Puntaje" htmlFor="p-puntaje" error={errorDe("puntaje")}>
              <Entrada
                id="p-puntaje"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="any"
                value={e.puntaje}
                readOnly={soloAgregar}
                onChange={(x) => cambiar({ puntaje: x.target.value })}
                invalida={!!errorDe("puntaje")}
              />
            </Campo>
          )}
        </div>

        <Campo
          etiqueta="Sección"
          htmlFor="p-seccion"
          error={errorDe("seccion")}
          ayuda="Como las «Part» de a2: su título se ve arriba de cada pregunta y la numeración reinicia en cada sección."
        >
          <SelectorSeccion
            id="p-seccion"
            valor={e.seccion}
            secciones={secciones}
            // Otra sección: la subsección de antes ya no aplica.
            onCambio={(seccion) => cambiar({ seccion, subseccion: seccion === e.seccion ? e.subseccion : "" })}
            deshabilitado={soloAgregar}
            invalida={!!errorDe("seccion")}
          />
        </Campo>

        <Campo
          etiqueta="Subsección"
          htmlFor="p-subseccion"
          error={errorDe("subseccion")}
          ayuda="Opcional, dentro de la sección: «Section A», «Section B»… Se ve debajo del título de la sección y no cambia la numeración."
        >
          <SelectorSeccion
            // Al cambiar de sección arranca de nuevo, con las subsecciones de esa.
            key={e.seccion}
            id="p-subseccion"
            valor={e.subseccion}
            secciones={subsecciones[e.seccion.trim()] ?? []}
            textos={TEXTOS_SUBSECCION}
            onCambio={(subseccion) => cambiar({ subseccion })}
            deshabilitado={soloAgregar || !e.seccion.trim()}
            invalida={!!errorDe("subseccion")}
          />
        </Campo>

        {materiales.length > 0 && (
          <Campo
            etiqueta="Lectura o audio"
            htmlFor="p-material"
            error={errorDe("material_id")}
            ayuda="Opcional. Si la pregunta es sobre un texto o una grabación, el estudiante lo verá encima. Al elegirlo, la categoría pasa a Reading o Listening."
          >
            <Selector
              id="p-material"
              value={e.material_id ?? ""}
              disabled={soloAgregar}
              onChange={(x) => {
                const material_id = x.target.value ? Number(x.target.value) : null;
                cambiar({ material_id, categoria: categoriaSugerida(e.tipo, tipoMaterial(material_id)) });
              }}
            >
              <option value="">Ninguno</option>
              {materiales.map((m) => (
                <option key={m.id} value={m.id}>
                  {ETIQUETA_MATERIAL[m.tipo]} · {m.titulo}
                </option>
              ))}
            </Selector>
          </Campo>
        )}

        <Campo
          etiqueta="Enunciado"
          htmlFor="p-enunciado"
          error={errorDe("enunciado")}
          ayuda={
            e.tipo === "fill_blank"
              ? `${AYUDA_ENUNCIADO.fill_blank} Detectados: ${contarEspacios(e.enunciado)}.`
              : AYUDA_ENUNCIADO[e.tipo]
          }
          accion={
            e.tipo === "fill_blank" && !soloAgregar ? (
              <Boton variante="texto" className="mb-1.5 text-[13px]" onClick={insertarEspacio}>
                Insertar ___
              </Boton>
            ) : null
          }
        >
          <AreaTexto
            id="p-enunciado"
            ref={enunciadoRef}
            rows={3}
            value={e.enunciado}
            readOnly={soloAgregar}
            onChange={(x) => cambiarEnunciado(x.target.value)}
            invalida={!!errorDe("enunciado")}
          />
        </Campo>

        {e.tipo === "fill_blank" && (
          <Campo
            etiqueta="Pista"
            htmlFor="p-pista"
            error={errorDe("pista")}
            ayuda="Opcional. Va en negrita debajo de la oración, ej. (be) o (be going to)."
          >
            <Entrada
              id="p-pista"
              value={e.pista}
              readOnly={soloAgregar}
              onChange={(x) => cambiar({ pista: x.target.value })}
            />
          </Campo>
        )}

        {e.tipo === "multiple_choice" && (
          <Campo
            etiqueta="Opciones"
            error={errorDe("opciones") ?? errorDe("correctas")}
            ayuda="Marca la(s) correcta(s). Puede haber más de una."
          >
            <OpcionesMultiple
              opciones={e.opciones}
              correctas={e.correctas}
              onCambio={(opciones, correctas) => cambiar({ opciones, correctas })}
              soloAgregar={soloAgregar}
              correctasFijas={soloAgregar ? original.correctas : []}
            />
          </Campo>
        )}

        {e.tipo === "fill_blank" && (
          <Campo
            etiqueta="Respuestas aceptadas por espacio"
            error={errorDe("variantes")}
            ayuda="Solo las variantes que cambian la frase. Mayúsculas, tildes, apóstrofes y contracciones ya se toleran."
          >
            <EspaciosFillBlank
              enunciado={e.enunciado}
              variantes={e.variantes}
              onCambio={(variantes) => cambiar({ variantes })}
              bloqueadas={soloAgregar ? original.variantes.map((l) => l.length) : []}
              invalida={!!errorDe("variantes")}
            />
          </Campo>
        )}

        {e.tipo === "translation" && (
          <Campo
            etiqueta="Traducciones válidas"
            error={errorDe("traducciones")}
            ayuda="La respuesta del estudiante debe coincidir con alguna."
          >
            <Traducciones
              traducciones={e.traducciones}
              onCambio={(traducciones) => cambiar({ traducciones })}
              bloqueadas={soloAgregar ? original.traducciones.length : 0}
              invalida={!!errorDe("traducciones")}
            />
          </Campo>
        )}

        {e.tipo === "open" && (
          <Campo
            etiqueta="Rúbrica"
            htmlFor="p-rubrica"
            error={errorDe("rubrica")}
            ayuda="Criterios para que la IA califique de 0 a 10: qué debe incluir, extensión, gramática… El estudiante no la ve."
          >
            <AreaTexto
              id="p-rubrica"
              rows={5}
              value={e.rubrica}
              readOnly={soloAgregar}
              onChange={(x) => cambiar({ rubrica: x.target.value })}
              invalida={!!errorDe("rubrica")}
            />
          </Campo>
        )}

        {errorGeneral && <Aviso tono="error">{errorGeneral}</Aviso>}

        <div className="flex flex-wrap justify-end gap-2.5 border-t border-borde-suave pt-4">
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
          {!sinNadaQueAgregar && (
            <Boton type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : textoBoton}
            </Boton>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-sm font-bold text-gris">Vista previa · así lo verá el estudiante</p>
        <div className="fondo-pagina rounded-2xl border-[1.5px] border-borde-suave p-4 md:p-6 lg:sticky lg:top-0">
          <PreguntaEstudiante
            pregunta={vistaPreviaDesdeEstado(e)}
            numero={1}
            respuesta={respuestaPrevia}
            onCambio={setRespuestaPrevia}
            material={materiales.find((m) => m.id === e.material_id) ?? null}
          />
        </div>
      </div>
    </form>
  );
}
