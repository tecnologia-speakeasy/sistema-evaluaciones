import { celebracionPorPuntaje } from "@/lib/celebracion";
import { COLOR, escaparHtml, plantillaCorreo, type Correo } from "./plantilla";

// Correo con el resultado de un intento (resultadoEmail de a2, con la plantilla
// de Speak Easy): insignia por rango, puntaje, Grammar/Writing, la
// retroalimentación de la IA y un botón al resultado público (/resultado/[token]).
// La insignia va por URL (APP_URL): son 7 imágenes y así el correo pesa poco.

export type DatosCorreoResultado = {
  nombre: string;
  evaluacion: string;
  puntaje: number;
  grammar: { aciertos: number; total: number };
  writing: { aciertos: number; total: number };
  feedback: string;
  /** Absoluta: {APP_URL}/resultado/{token}. */
  urlResultado: string;
  /** Base absoluta para la imagen de la insignia ({APP_URL}). */
  urlBase: string;
};

export function correoResultado(d: DatosCorreoResultado): Correo {
  const c = celebracionPorPuntaje(d.puntaje);
  const nombre = d.nombre.trim().split(/\s+/)[0] || d.nombre.trim();
  const filas = (
    [
      ["Grammar", d.grammar],
      ["Writing", d.writing],
    ] as const
  ).filter(([, v]) => v.total > 0);

  const tablaPuntajes = filas.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px;">
  <tr>
    ${filas
      .map(
        ([etiqueta, v]) =>
          `<td style="padding:0 8px;"><div style="background-color:${COLOR.lavanda};border-radius:10px;padding:8px 14px;font-size:14px;color:${COLOR.tinta};white-space:nowrap;">${etiqueta} <strong>${v.aciertos}</strong><strong style="color:#e9407e;">/${v.total}</strong></div></td>`,
      )
      .join("")}
  </tr>
</table>`
    : "";

  const contenidoHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:0 0 6px;">
      <img src="${escaparHtml(`${d.urlBase}${c.img}`)}" width="96" height="96" alt="" style="display:block;border:0;width:96px;height:auto;">
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:6px 0 18px;font-size:18px;font-weight:800;color:${COLOR.violeta};">${escaparHtml(c.titulo)}</td>
  </tr>
</table>
<p style="margin:0 0 6px;">Hola <strong>${escaparHtml(nombre)}</strong>,</p>
<p style="margin:0;">Este es tu resultado de <strong>${escaparHtml(d.evaluacion)}</strong>:</p>
<p style="margin:14px 0 10px;text-align:center;font-size:40px;line-height:1;font-weight:800;color:${COLOR.rosa};">${d.puntaje}<span style="font-size:18px;color:${COLOR.grisClaro};"> / 100</span></p>
${tablaPuntajes}
<h2 style="margin:26px 0 8px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${COLOR.violeta};">Retroalimentación</h2>
<div style="background-color:#faf9fc;border:1px solid ${COLOR.borde};border-radius:14px;padding:16px 18px;font-size:15px;line-height:1.7;white-space:pre-wrap;color:${COLOR.tinta};">${escaparHtml(d.feedback)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:26px 0 8px;">
      <a href="${escaparHtml(d.urlResultado)}" style="display:inline-block;background-color:${COLOR.rosa};background-image:linear-gradient(90deg,#ff327d 0%,#6d2ebf 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 34px;border-radius:12px;">Ver mi resultado</a>
    </td>
  </tr>
</table>
<p style="margin:8px 0 0;font-size:12px;text-align:center;color:${COLOR.gris};">Si el botón no funciona, copia este enlace: <a href="${escaparHtml(d.urlResultado)}" style="color:${COLOR.violeta};">${escaparHtml(d.urlResultado)}</a></p>`;

  return {
    asunto: `Tu resultado de ${d.evaluacion} · Speak Easy`,
    html: plantillaCorreo({
      titulo: "Tu evaluación de inglés",
      resumen: `Obtuviste ${d.puntaje}/100 en ${d.evaluacion}. Mira tu retroalimentación.`,
      contenidoHtml,
    }),
    texto: [
      `Hola ${nombre},`,
      "",
      `Este es tu resultado de ${d.evaluacion}: ${d.puntaje}/100.`,
      ...filas.map(([etiqueta, v]) => `${etiqueta}: ${v.aciertos}/${v.total}`),
      "",
      "Retroalimentación:",
      d.feedback,
      "",
      `Ver mi resultado: ${d.urlResultado}`,
      "",
      "Speak Easy · Hazlo fácil con Speak Easy",
    ].join("\n"),
  };
}
