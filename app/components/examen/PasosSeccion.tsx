// Pasos de la sección actual (xs.stepperCard de a2): ventana de 9 "Ejercicio N".
// La comparten el examen (solo deja ir a las alcanzadas o respondidas) y la
// revisión de un intento (deja ir a cualquiera).
const VENTANA_PASOS = 9;

export function PasosSeccion({
  indice,
  inicio,
  largo,
  puedeIr,
  onIr,
}: {
  /** Pregunta actual (índice global). */
  indice: number;
  /** Índice global donde empieza la sección y cuántas preguntas tiene. */
  inicio: number;
  largo: number;
  puedeIr: (global: number) => boolean;
  onIr: (global: number) => void;
}) {
  const enSeccion = indice - inicio;
  const desde = largo > VENTANA_PASOS ? Math.min(Math.max(0, enSeccion - 4), largo - VENTANA_PASOS) : 0;
  const cuantos = Math.min(largo, VENTANA_PASOS);

  return (
    <nav aria-label="Ejercicios de la sección" className="max-h-[380px] overflow-y-auto rounded-2xl bg-lavanda px-[22px] py-[18px]">
      <ol>
        {Array.from({ length: cuantos }, (_, j) => {
          const pos = desde + j;
          const global = inicio + pos;
          const hecho = pos <= enSeccion;
          const actual = pos === enSeccion;
          return (
            <li key={global}>
              <button
                type="button"
                disabled={!puedeIr(global)}
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
