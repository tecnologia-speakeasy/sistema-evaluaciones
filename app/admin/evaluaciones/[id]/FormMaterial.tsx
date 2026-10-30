"use client";

import { upload } from "@vercel/blob/client";
import { useState, useTransition, type FormEvent } from "react";
import { guardarMaterialAction } from "@/app/admin/acciones/materiales";
import { MaterialEstudiante } from "@/app/components/preguntas/MaterialEstudiante";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { AreaTexto, Campo, Entrada } from "@/app/components/ui/Campo";
import {
  ETIQUETA_MATERIAL,
  MAX_AUDIO_MB,
  TIPOS_MATERIAL,
  type EntradaMaterial,
  type MaterialStaff,
  type TipoMaterial,
} from "@/lib/preguntas/materiales";

// Crear o editar una lectura o un audio (db/009). El audio se sube directo a
// Vercel Blob (/api/admin/audios) o se pega su enlace. A la derecha, cómo lo
// verá el estudiante.

type Estado = { tipo: TipoMaterial; titulo: string; texto: string; audio_url: string };

const CAMPOS = ["tipo", "titulo", "texto", "audio_url"];

// "Recording 1 (final).mp3" → "recording-1-final.mp3"
function nombreArchivo(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  const base = (punto > 0 ? nombre.slice(0, punto) : nombre)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const ext = punto > 0 ? nombre.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "mp3";
  return `${base || "audio"}.${ext}`;
}

export default function FormMaterial({
  evaluacionId,
  material,
  tipoInicial,
  subidaAudios,
  onListo,
  onCancelar,
}: {
  evaluacionId: number;
  /** null = nuevo. */
  material: MaterialStaff | null;
  tipoInicial: TipoMaterial;
  /** BLOB_READ_WRITE_TOKEN configurada: se puede subir el archivo. */
  subidaAudios: boolean;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [e, setE] = useState<Estado>(() => ({
    tipo: material?.tipo ?? tipoInicial,
    titulo: material?.titulo ?? "",
    texto: material?.texto ?? "",
    audio_url: material?.audio_url ?? "",
  }));
  const [error, setError] = useState<{ mensaje: string; campo?: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const cambiar = (parcial: Partial<Estado>) => {
    setE((x) => ({ ...x, ...parcial }));
    setError(null);
  };
  const errorDe = (campo: string) => (error?.campo === campo ? error.mensaje : null);
  const errorGeneral = error && (!error.campo || !CAMPOS.includes(error.campo)) ? error.mensaje : null;

  async function subir(archivo: File) {
    if (archivo.size > MAX_AUDIO_MB * 1024 * 1024) {
      setError({ campo: "audio_url", mensaje: `El audio pesa más de ${MAX_AUDIO_MB} MB.` });
      return;
    }
    setSubiendo(true);
    setError(null);
    try {
      const blob = await upload(`evaluaciones/audios/${nombreArchivo(archivo.name)}`, archivo, {
        access: "public",
        handleUploadUrl: "/api/admin/audios",
        contentType: archivo.type || undefined,
      });
      cambiar({ audio_url: blob.url });
    } catch {
      setError({
        campo: "audio_url",
        mensaje: `No pudimos subir el audio. Revisa que sea un archivo de audio (mp3, m4a, wav…) de máximo ${MAX_AUDIO_MB} MB e inténtalo de nuevo.`,
      });
    } finally {
      setSubiendo(false);
    }
  }

  function entrada(): EntradaMaterial {
    return e.tipo === "lectura"
      ? { tipo: "lectura", titulo: e.titulo, texto: e.texto }
      : { tipo: "audio", titulo: e.titulo, audio_url: e.audio_url, texto: e.texto };
  }

  function guardar(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await guardarMaterialAction(evaluacionId, material?.id ?? null, entrada());
      if (!r.ok) {
        setError({ mensaje: r.error, campo: r.campo });
        return;
      }
      onListo();
    });
  }

  const previa = {
    id: material?.id ?? 0,
    tipo: e.tipo,
    titulo: e.titulo.trim() || (e.tipo === "lectura" ? "Reading" : "Recording"),
    texto: e.texto.trim() || (e.tipo === "lectura" ? "El texto de la lectura aparecerá aquí." : null),
    audio_url: e.tipo === "audio" && /^https?:\/\//i.test(e.audio_url.trim()) ? e.audio_url.trim() : null,
  };

  return (
    <form onSubmit={guardar} noValidate className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        {material?.con_respuestas && (
          <Aviso>
            Sus preguntas ya tienen respuestas de estudiantes: los cambios los verán quienes presenten de aquí en
            adelante.
          </Aviso>
        )}

        <Campo etiqueta="Tipo" error={errorDe("tipo")}>
          <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-2">
            {TIPOS_MATERIAL.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={e.tipo === t}
                onClick={() => cambiar({ tipo: t })}
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-sm font-semibold transition-[background-color] duration-150 ${
                  e.tipo === t ? "degradado-opcion text-white" : "bg-opcion text-tinta hover:bg-lavanda"
                }`}
              >
                {ETIQUETA_MATERIAL[t]}
              </button>
            ))}
          </div>
        </Campo>

        <Campo
          etiqueta="Título"
          htmlFor="m-titulo"
          error={errorDe("titulo")}
          ayuda={e.tipo === "lectura" ? "Ej. Reading 1 – A Typical Day" : "Ej. Recording 1"}
        >
          <Entrada
            id="m-titulo"
            value={e.titulo}
            onChange={(x) => cambiar({ titulo: x.target.value })}
            invalida={!!errorDe("titulo")}
          />
        </Campo>

        {e.tipo === "lectura" ? (
          <Campo
            etiqueta="Texto"
            htmlFor="m-texto"
            error={errorDe("texto")}
            ayuda="El estudiante lo verá encima de cada pregunta ligada. Los saltos de línea se respetan."
          >
            <AreaTexto
              id="m-texto"
              rows={12}
              value={e.texto}
              onChange={(x) => cambiar({ texto: x.target.value })}
              invalida={!!errorDe("texto")}
            />
          </Campo>
        ) : (
          <>
            <Campo
              etiqueta="Audio"
              htmlFor="m-audio"
              error={errorDe("audio_url")}
              ayuda={
                subidaAudios
                  ? `Sube el archivo (mp3, m4a, wav… hasta ${MAX_AUDIO_MB} MB) o pega el enlace de un audio que ya esté en internet.`
                  : "Pega el enlace del audio (https://…). La subida de archivos no está configurada en este servidor."
              }
            >
              <div className="flex flex-col gap-2.5">
                {subidaAudios && (
                  <label
                    className={`inline-flex w-fit cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] border-rosa bg-white px-4 py-2 text-sm font-semibold text-rosa hover:bg-rosa/5 ${
                      subiendo ? "pointer-events-none opacity-60" : ""
                    }`}
                  >
                    {subiendo ? "Subiendo…" : e.audio_url ? "Cambiar archivo" : "Subir archivo"}
                    <input
                      type="file"
                      accept="audio/*"
                      className="sr-only"
                      disabled={subiendo}
                      onChange={(x) => {
                        const archivo = x.target.files?.[0];
                        x.target.value = "";
                        if (archivo) void subir(archivo);
                      }}
                    />
                  </label>
                )}
                <Entrada
                  id="m-audio"
                  inputMode="url"
                  placeholder="https://…"
                  value={e.audio_url}
                  onChange={(x) => cambiar({ audio_url: x.target.value })}
                  invalida={!!errorDe("audio_url")}
                />
              </div>
            </Campo>
            <Campo
              etiqueta="Indicación"
              htmlFor="m-indicacion"
              error={errorDe("texto")}
              ayuda="Opcional. Ej. Listen to Emma talking about her weekend."
            >
              <AreaTexto
                id="m-indicacion"
                rows={2}
                value={e.texto}
                onChange={(x) => cambiar({ texto: x.target.value })}
              />
            </Campo>
          </>
        )}

        {errorGeneral && <Aviso tono="error">{errorGeneral}</Aviso>}

        <div className="flex flex-wrap justify-end gap-2.5 border-t border-borde-suave pt-4">
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={pendiente || subiendo}>
            {pendiente ? "Guardando…" : material ? "Guardar cambios" : `Crear ${ETIQUETA_MATERIAL[e.tipo].toLowerCase()}`}
          </Boton>
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-sm font-bold text-gris">Vista previa · así lo verá el estudiante</p>
        <div className="fondo-pagina rounded-2xl border-[1.5px] border-borde-suave p-4 md:p-6 lg:sticky lg:top-0">
          <MaterialEstudiante key={previa.audio_url ?? "sin-audio"} material={previa} />
        </div>
      </div>
    </form>
  );
}
