import type { Material } from "@/lib/preguntas/materiales";

// La lectura o el audio de una pregunta (db/009), como lo ve el estudiante:
// encima de cada pregunta ligada. En el examen se monta con key = material.id,
// así el audio sigue sonando al pasar entre las preguntas de la misma grabación.
// `plegable` (revisión de un intento): la lectura va cerrada para no alargar la página.

const ETIQUETA: Record<Material["tipo"], string> = { lectura: "Reading", audio: "Listening" };

export function MaterialEstudiante({ material: m, plegable = false }: { material: Material; plegable?: boolean }) {
  const chip = (
    <span className="mb-1.5 inline-block rounded-full bg-lavanda px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-violeta uppercase">
      {ETIQUETA[m.tipo]}
    </span>
  );

  if (m.tipo === "audio") {
    return (
      <section aria-label={`Listening: ${m.titulo}`} className="mb-6 rounded-[14px] border-[1.5px] border-borde bg-white px-[22px] py-5">
        {chip}
        <h2 className="text-[17px] font-extrabold text-titulo">{m.titulo}</h2>
        {m.texto && <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-line text-gris-oscuro">{m.texto}</p>}
        {m.audio_url && (
          // Sin subtítulos a propósito: es un examen de listening.
          <audio controls preload="metadata" src={m.audio_url} className="mt-3.5 w-full">
            Tu navegador no puede reproducir este audio.
          </audio>
        )}
      </section>
    );
  }

  if (plegable) {
    return (
      <details className="mb-4 rounded-[14px] border-[1.5px] border-borde bg-white px-[22px] py-4">
        <summary className="cursor-pointer text-[15px] font-extrabold text-titulo">
          {ETIQUETA.lectura}: {m.titulo}
        </summary>
        <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-tinta">{m.texto}</p>
      </details>
    );
  }

  return (
    <section aria-label={`Reading: ${m.titulo}`} className="mb-6 rounded-[14px] border-[1.5px] border-borde bg-white px-[22px] py-5">
      {chip}
      <h2 className="mb-2 text-[17px] font-extrabold text-titulo">{m.titulo}</h2>
      {/* Textos largos: se desplazan dentro de la tarjeta para que la pregunta siga a la vista. */}
      <div className="max-h-[45vh] overflow-y-auto pr-1 md:max-h-[360px]">
        <p className="text-[15px] leading-relaxed whitespace-pre-line text-tinta">{m.texto}</p>
      </div>
    </section>
  );
}
