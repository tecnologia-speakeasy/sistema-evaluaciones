"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// "Revisa tu Feedback" de a2: abre la pantalla de retroalimentación
// (xs.fbOverlay / fbCard / fbScroll) con "Ver mis respuestas", "Repetir
// evaluación" y "Cerrar". Escape también cierra.
export function VerFeedback({
  feedback,
  hrefRespuestas,
  repetir,
}: {
  feedback: string;
  hrefRespuestas: string;
  repetir: { href: string; texto: string } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    cerrar.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierto]);

  const secundario =
    "block w-[min(560px,92vw)] rounded-xl border-[1.5px] border-white/45 bg-white/12 py-[13px] text-center text-[15px] font-semibold text-white hover:bg-white/18";

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="degradado-boton w-[min(420px,82vw)] cursor-pointer rounded-xl py-3.5 text-[15px] font-semibold text-white"
      >
        Revisa tu feedback
      </button>
      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-feedback"
          className="fondo-intro fixed inset-0 z-[250] flex flex-col items-center overflow-y-auto p-6"
        >
          <div className="my-auto flex flex-col items-center gap-[22px] py-6">
            <h2 id="titulo-feedback" className="text-[clamp(24px,5vw,30px)] font-extrabold text-white">
              Tu retroalimentación
            </h2>
            <div className="w-[min(560px,92vw)] rounded-[22px] border border-white/16 bg-white/10 p-[18px]">
              <div className="scroll-claro max-h-[min(56vh,460px)] overflow-y-auto rounded-2xl border border-white/14 px-5 py-4">
                <p className="text-justify text-[15px] leading-[1.7] whitespace-pre-wrap text-white/92">{feedback}</p>
              </div>
            </div>
            <Link href={hrefRespuestas} className={secundario}>
              Ver mis respuestas
            </Link>
            {repetir && (
              <Link href={repetir.href} className={secundario}>
                {repetir.texto}
              </Link>
            )}
            <button
              ref={cerrar}
              type="button"
              onClick={() => setAbierto(false)}
              className="degradado-boton w-[min(560px,92vw)] cursor-pointer rounded-xl py-3.5 text-[15px] font-semibold text-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
