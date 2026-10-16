import { celebracionPorPuntaje } from "@/lib/celebracion";
import { INSIGNIAS_CORREO } from "./insignias";
import { COLOR, escaparHtml, plantillaCorreo, type AdjuntoEmbebido, type Correo } from "./plantilla";

// Correo con el resultado de un intento (resultadoEmail de a2, con la plantilla
// de Speak Easy): la insignia del rango, su título, el puntaje, Grammar/Writing
// y la retroalimentación de la IA. Sin enlaces: no depende de ninguna URL.
// La insignia va embebida (cid:), como el logo; solo la del puntaje.

/** Content-ID de la insignia adjunta. */
export const CID_INSIGNIA = "insignia-resultado";

export type DatosCorreoResultado = {
  evaluacion: string;
  puntaje: number;
  grammar: { aciertos: number; total: number };
  writing: { aciertos: number; total: number };
  feedback: string;
};

export function correoResultado(d: DatosCorreoResultado): Correo {
  const c = celebracionPorPuntaje(d.puntaje);
  const insignia = INSIGNIAS_CORREO[c.img];
  const adjuntos: AdjuntoEmbebido[] = insignia
    ? [{ cid: CID_INSIGNIA, nombre: "insignia.png", contenido: insignia.png, tipo: "image/png" }]
    : [];
  const filas = (
    [
      ["Grammar", d.grammar],
      ["Writing", d.writing],
    ] as const
  ).filter(([, v]) => v.total > 0);

  const imagen = insignia
    ? `<tr>
    <td align="center" style="padding:0 0 6px;">
      <img src="cid:${CID_INSIGNIA}" width="${insignia.ancho}" height="${insignia.alto}" alt="" style="display:block;border:0;width:${insignia.ancho}px;height:${insignia.alto}px;">
    </td>
  </tr>`
    : "";

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
  ${imagen}
  <tr>
    <td align="center" style="padding:6px 0 4px;font-size:18px;font-weight:800;color:${COLOR.violeta};">${escaparHtml(c.titulo)}</td>
  </tr>
</table>
<p style="margin:10px 0 10px;text-align:center;font-size:40px;line-height:1;font-weight:800;color:${COLOR.rosa};">${d.puntaje}<span style="font-size:18px;color:${COLOR.grisClaro};"> / 100</span></p>
${tablaPuntajes}
<h2 style="margin:26px 0 8px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${COLOR.violeta};">Retroalimentación</h2>
<div style="background-color:#faf9fc;border:1px solid ${COLOR.borde};border-radius:14px;padding:16px 18px;font-size:15px;line-height:1.7;white-space:pre-wrap;color:${COLOR.tinta};">${escaparHtml(d.feedback)}</div>`;

  return {
    asunto: `Tu resultado de ${d.evaluacion} · Speak Easy`,
    html: plantillaCorreo({
      titulo: "Tu evaluación de inglés",
      resumen: `Obtuviste ${d.puntaje}/100 en ${d.evaluacion}. Mira tu retroalimentación.`,
      contenidoHtml,
    }),
    texto: [
      c.titulo,
      "",
      `${d.evaluacion}: ${d.puntaje}/100`,
      ...filas.map(([etiqueta, v]) => `${etiqueta}: ${v.aciertos}/${v.total}`),
      "",
      "Retroalimentación:",
      d.feedback,
      "",
      "Speak Easy · Hazlo fácil con Speak Easy",
    ].join("\n"),
    adjuntos,
  };
}
