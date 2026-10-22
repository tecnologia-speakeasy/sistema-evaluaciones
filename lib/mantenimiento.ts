// Generaciones "en mantenimiento": su inicio no muestra evaluaciones ni
// "Mi historial", solo a Spiky con el aviso «Estamos trabajando para brindarte
// una mejor experiencia», aunque tengan evaluaciones publicadas. Para quitarlo,
// sacar el código de la lista.
const GENERACIONES_EN_MANTENIMIENTO: readonly string[] = ["gen-2026-03"];

export function enMantenimiento(codigoGeneracion: string): boolean {
  return GENERACIONES_EN_MANTENIMIENTO.includes(codigoGeneracion);
}
