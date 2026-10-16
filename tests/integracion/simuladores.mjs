// Servicios simulados para las pruebas de integración (nunca los reales del .env):
//   · OpenAI   POST /v1/chat/completions
//   · ManyChat POST /fb/...
//   · SMTP     recibe los correos y los guarda en una carpeta (nunca reenvía)
// Control de OpenAI y ManyChat (lo usan las suites):
//   POST /__modo {falla: "500"|"429"|"basura"|null, veces, saltar, demoraMs}
//   GET /__llamadas · POST /__reiniciar
import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";

const escuchar = (servidor) =>
  new Promise((resolver) => servidor.listen(0, "127.0.0.1", () => resolver(servidor.address().port)));
const cerrar = (servidor) => new Promise((resolver) => servidor.close(() => resolver()));

function simuladorHttp(atender) {
  const estado = { modo: { falla: null, veces: 0, demoraMs: 0 }, llamadas: [] };
  const servidor = http.createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (t) => (cuerpo += t));
    req.on("end", async () => {
      const json = (codigo, datos, extra = {}) => {
        res.writeHead(codigo, { "Content-Type": "application/json", ...extra });
        res.end(JSON.stringify(datos));
      };
      if (req.url === "/__modo") {
        estado.modo = { falla: null, veces: 0, demoraMs: 0, ...JSON.parse(cuerpo || "{}") };
        return json(200, estado.modo);
      }
      if (req.url === "/__llamadas") return json(200, estado.llamadas);
      if (req.url === "/__reiniciar") {
        estado.llamadas = [];
        estado.modo = { falla: null, veces: 0, demoraMs: 0 };
        return json(200, { ok: true });
      }
      const datos = cuerpo ? JSON.parse(cuerpo) : null;
      const llamada = { ruta: req.url, auth: req.headers.authorization ?? null, datos, at: Date.now() };
      estado.llamadas.push(llamada);
      if (estado.modo.demoraMs) await new Promise((r) => setTimeout(r, estado.modo.demoraMs));
      if (estado.modo.saltar > 0) {
        estado.modo.saltar -= 1; // deja pasar esta y falla las siguientes
      } else if (estado.modo.falla && estado.modo.veces > 0) {
        estado.modo.veces -= 1;
        llamada.respuesta = estado.modo.falla;
        if (estado.modo.falla === "basura") return json(200, { choices: [{ message: { content: "esto no es JSON" } }] });
        // Retry-After corto: la prueba no espera los segundos reales.
        return json(Number(estado.modo.falla), { error: { message: `simulado ${estado.modo.falla}` } }, { "Retry-After": "0.05" });
      }
      llamada.respuesta = "ok";
      atender(req, datos, json, llamada);
    });
  });
  return servidor;
}

// OpenAI: responde según el prompt. Abiertas: nota según el largo de la respuesta
// (vacía = 0, ≥ 8 palabras = 8, si no 4). Feedback: saluda con el nombre.
function atenderOpenAI(req, datos, json, llamada) {
  if (req.url !== "/v1/chat/completions") return json(404, { error: "ruta" });
  const usuario = datos.messages.find((m) => m.role === "user")?.content ?? "";
  llamada.modelo = datos.model;
  let contenido;
  if (usuario.includes("Califica cada una de las siguientes respuestas abiertas")) {
    llamada.tipo = "abiertas";
    const bloques = [...usuario.matchAll(/ID: (\d+)[\s\S]*?<respuesta>([\s\S]*?)<\/respuesta>/g)];
    contenido = {
      resultados: bloques.map(([, id, r]) => {
        const palabras = r.trim() === "(vacío)" ? 0 : r.trim().split(/\s+/).length;
        return {
          id: Number(id),
          score: palabras === 0 ? 0 : palabras >= 8 ? 8 : 4,
          comentario: "Buen uso del presente simple; cuida la concordancia.",
        };
      }),
    };
  } else {
    llamada.tipo = "feedback";
    const nombre = /primer nombre \(([^)]+)\)/.exec(usuario)?.[1] ?? "estudiante";
    contenido = {
      resumen_desempeño: `Hola ${nombre}, en tu evaluación demuestras un buen manejo del pasado simple.\n\nTe recomiendo practicar las oraciones con "going to" y acompañarnos en el Club conversacional. Un abrazo`,
    };
  }
  json(200, { choices: [{ message: { content: JSON.stringify(contenido) } }] });
}

// SMTP: sin TLS, cualquier usuario/clave. "rebota@..." no existe (prueba de fallos).
// Por cada correo: <n>.eml (crudo) y <n>.json (resumen).
function smtpLocal(carpeta) {
  mkdirSync(carpeta, { recursive: true });
  let n = 0;
  return new SMTPServer({
    disabledCommands: ["STARTTLS"],
    allowInsecureAuth: true,
    logger: false,
    onAuth(auth, _sesion, cb) {
      cb(null, { user: auth.username });
    },
    onRcptTo(direccion, _sesion, cb) {
      if (/^rebota@/i.test(direccion.address)) {
        return cb(Object.assign(new Error("550 El buzón no existe"), { responseCode: 550 }));
      }
      cb();
    },
    onData(stream, sesion, cb) {
      const trozos = [];
      stream.on("data", (t) => trozos.push(t));
      stream.on("end", async () => {
        try {
          const crudo = Buffer.concat(trozos);
          const correo = await simpleParser(crudo);
          n++;
          writeFileSync(`${carpeta}/${n}.eml`, crudo);
          const resumen = {
            n,
            envelopeTo: sesion.envelope.rcptTo.map((r) => r.address),
            from: correo.from?.text,
            to: correo.to?.text,
            subject: correo.subject,
            text: correo.text,
            html: correo.html,
          };
          writeFileSync(`${carpeta}/${n}.json`, JSON.stringify(resumen, null, 2));
          cb();
        } catch (e) {
          cb(e);
        }
      });
    },
  });
}

/** Levanta los tres simuladores en puertos libres. */
export async function iniciarSimuladores(carpetaCorreos) {
  const openai = simuladorHttp(atenderOpenAI);
  const manychat = simuladorHttp((_req, _datos, json) => json(200, { status: "success" }));
  const smtp = smtpLocal(carpetaCorreos);
  const [puertoOpenAI, puertoManyChat, puertoSmtp] = await Promise.all([
    escuchar(openai),
    escuchar(manychat),
    new Promise((resolver) => smtp.listen(0, "127.0.0.1", () => resolver(smtp.server.address().port))),
  ]);
  return {
    puertoOpenAI,
    puertoManyChat,
    puertoSmtp,
    cerrar: () => Promise.all([cerrar(openai), cerrar(manychat), new Promise((r) => smtp.close(r))]),
  };
}
