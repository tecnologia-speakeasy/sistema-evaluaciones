import { LOGO_ALTO, LOGO_ANCHO } from "./logo";

// Plantilla de los correos de Speak Easy, con los colores de la app (a2):
// encabezado con el degradado de la barra (morado → rosa) y el logo blanco,
// tarjeta blanca sobre lavanda, títulos morado oscuro, acentos rosa.
// HTML con tablas y estilos en línea: es lo que respetan Gmail y Outlook.
// Outlook no pinta degradados: queda el color de fondo morado.

/** Imagen embebida en el HTML con <img src="cid:...">. */
export type AdjuntoEmbebido = { cid: string; nombre: string; contenido: Buffer; tipo: string };

/** `adjuntos`: imágenes embebidas además del logo (que siempre va). */
export type Correo = { asunto: string; html: string; texto: string; adjuntos?: AdjuntoEmbebido[] };

/** Content-ID del logo adjunto (ver enviar.ts). */
export const CID_LOGO = "logo-speak-easy";

const FUENTE = "'DM Sans', Arial, Helvetica, sans-serif";

export const COLOR = {
  titulo: "#3a1d6e",
  tinta: "#2b2240",
  gris: "#6b6480",
  grisClaro: "#9a93ad",
  violeta: "#6d2ebf",
  rosa: "#ff327d",
  lavanda: "#f1ecfb",
  borde: "#d9d2ea",
} as const;

// Todo texto que venga de la BD o del usuario pasa por aquí antes de ir al HTML.
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// `contenidoHtml` ya debe venir escapado. `resumen` es el texto que los
// clientes de correo muestran junto al asunto en la bandeja.
export function plantillaCorreo({
  titulo,
  resumen,
  contenidoHtml,
}: {
  titulo: string;
  resumen: string;
  contenidoHtml: string;
}): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escaparHtml(titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${COLOR.lavanda};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escaparHtml(resumen)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.lavanda};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td align="center" style="background-color:#41276b;background-image:linear-gradient(90deg,#41276b 0%,#613ba0 55%,#e9407e 100%);border-radius:20px 20px 0 0;padding:22px 24px 18px;">
            <img src="cid:${CID_LOGO}" width="${LOGO_ANCHO}" height="${LOGO_ALTO}" alt="Speak Easy" style="display:block;border:0;outline:none;color:#ffffff;font-family:${FUENTE};font-size:20px;font-weight:700;">
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;border-radius:0 0 20px 20px;padding:32px 28px 30px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${COLOR.tinta};">
            <h1 style="margin:0 0 16px;font-family:${FUENTE};font-size:22px;line-height:1.25;font-weight:800;color:${COLOR.titulo};">${escaparHtml(titulo)}</h1>
            ${contenidoHtml}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:18px 12px 0;font-family:${FUENTE};font-size:12px;line-height:1.5;color:${COLOR.grisClaro};">
            Speak Easy · Hazlo fácil con Speak Easy
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
