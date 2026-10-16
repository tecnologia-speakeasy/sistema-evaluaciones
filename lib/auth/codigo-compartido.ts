// Reglas del código de acceso (OTP) que necesitan tanto el servidor como el
// formulario de login. Sin dependencias de Node: se puede importar en el navegador.

export const DIGITOS_CODIGO = 6;
export const VIGENCIA_CODIGO_MIN = 10;
export const MAX_INTENTOS_CODIGO = 5;
/** Espera mínima entre dos envíos al mismo correo. */
export const ESPERA_REENVIO_S = 60;

// Lo que escribe o pega el estudiante: "123 456", "123-456" → "123456".
export function limpiarCodigo(texto: string): string {
  return texto.replace(/\D/g, "");
}

// Escribe `texto` en las casillas a partir de `indice`. Si trae el código
// completo (pegado o autollenado del celular), lo pone desde la primera casilla.
// Devuelve las casillas nuevas y cuál debe quedar con el foco.
export function repartirDigitos(
  actual: readonly string[],
  indice: number,
  texto: string,
): { digitos: string[]; foco: number } {
  const digitos = [...actual];
  const d = limpiarCodigo(texto);
  if (!d) {
    digitos[indice] = "";
    return { digitos, foco: indice };
  }
  const desde = d.length >= DIGITOS_CODIGO ? 0 : indice;
  const trozo = d.slice(0, DIGITOS_CODIGO - desde);
  for (let k = 0; k < trozo.length; k++) digitos[desde + k] = trozo[k];
  return { digitos, foco: Math.min(desde + trozo.length, DIGITOS_CODIGO - 1) };
}

// Valor nuevo de un <input> de una casilla. Al escribir sobre una casilla que ya
// tiene un dígito, el navegador junta los dos ("37"): gana el que se acaba de escribir.
export function escribirEnCasilla(
  actual: readonly string[],
  indice: number,
  valor: string,
): { digitos: string[]; foco: number } {
  const previo = actual[indice];
  const texto =
    previo && valor.length === previo.length + 1 && valor.includes(previo)
      ? valor.replace(previo, "")
      : valor;
  return repartirDigitos(actual, indice, texto);
}
