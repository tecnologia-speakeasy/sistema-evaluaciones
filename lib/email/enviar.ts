import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { LOGO_PNG } from "./logo";
import { CID_LOGO, type Correo } from "./plantilla";

// Envío de correo por SMTP (Google Workspace), portado de ../evaluacion-a2/lib/email.ts.
// Sale desde SMTP_USER / MAIL_FROM. SMTP_PASS es una "contraseña de aplicación"
// de Google (no la contraseña normal).

let cache: Transporter | null = null;

function transporte(): Transporter {
  if (cache) return cache;
  const port = Number(process.env.SMTP_PORT) || 465;
  cache = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = SSL · 587 = STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Un SMTP colgado no debe dejar esperando al estudiante en el login.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return cache;
}

export function smtpConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Todos los correos usan plantillaCorreo(), que muestra el logo adjunto (cid:).
export async function enviarCorreo(para: string, correo: Correo): Promise<void> {
  if (!smtpConfigurado()) {
    throw new Error("SMTP no configurado (faltan SMTP_HOST/SMTP_USER/SMTP_PASS)");
  }
  await transporte().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: para,
    subject: correo.asunto,
    html: correo.html,
    text: correo.texto,
    attachments: [
      {
        filename: "speak-easy.png",
        content: LOGO_PNG,
        contentType: "image/png",
        cid: CID_LOGO,
        contentDisposition: "inline",
      },
    ],
  });
}
