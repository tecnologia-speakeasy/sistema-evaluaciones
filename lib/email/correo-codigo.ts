import { VIGENCIA_CODIGO_MIN } from "@/lib/auth/codigo-compartido";
import { COLOR, escaparHtml, plantillaCorreo, type Correo } from "./plantilla";

// Correo con el código de acceso del estudiante. El código va en el asunto
// para que se vea en la notificación del celular sin abrir el correo.
export function correoCodigo(nombre: string, codigo: string): Correo {
  const primerNombre = nombre.trim().split(/\s+/)[0] || nombre;
  const vigencia = `${VIGENCIA_CODIGO_MIN} minutos`;

  const contenidoHtml = `
<p style="margin:0 0 6px;">Hola <strong>${escaparHtml(primerNombre)}</strong>,</p>
<p style="margin:0;">Usa este código para entrar a tus evaluaciones de inglés:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:24px 0;">
      <div style="display:inline-block;background-color:${COLOR.lavanda};border:1.5px solid ${COLOR.borde};border-radius:14px;padding:14px 16px 14px 26px;font-size:34px;line-height:1.2;font-weight:700;letter-spacing:10px;color:${COLOR.violeta};">${escaparHtml(codigo)}</div>
    </td>
  </tr>
</table>
<p style="margin:0 0 14px;">Vence en <strong style="color:${COLOR.rosa};">${vigencia}</strong> y sirve una sola vez. Si pides otro código, este deja de funcionar.</p>
<p style="margin:0;font-size:13px;color:${COLOR.gris};">Si no intentaste entrar, ignora este correo: nadie puede ingresar a tu cuenta sin este código.</p>`;

  return {
    asunto: `${codigo} es tu código de Speak Easy`,
    html: plantillaCorreo({
      titulo: "Tu código de acceso",
      resumen: `Vence en ${vigencia}. Úsalo para entrar a tus evaluaciones.`,
      contenidoHtml,
    }),
    texto: [
      `Hola ${primerNombre},`,
      "",
      "Usa este código para entrar a tus evaluaciones de inglés:",
      "",
      `    ${codigo}`,
      "",
      `Vence en ${vigencia} y sirve una sola vez. Si pides otro código, este deja de funcionar.`,
      "",
      "Si no intentaste entrar, ignora este correo: nadie puede ingresar a tu cuenta sin este código.",
      "",
      "Speak Easy · Hazlo fácil con Speak Easy",
    ].join("\n"),
  };
}
