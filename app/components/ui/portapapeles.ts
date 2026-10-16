// Copiar texto al portapapeles. Si el navegador no deja usar la API moderna
// (sin HTTPS, permisos), cae en el método viejo con un campo temporal.
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return copiarConCampo(texto);
  }
}

function copiarConCampo(texto: string): boolean {
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.opacity = "0";
  document.body.appendChild(campo);
  campo.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    campo.remove();
  }
}
