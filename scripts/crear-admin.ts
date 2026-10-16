// Crea el primer admin del staff (o le cambia la contraseña con --actualizar).
//
// Uso:
//   npm run crear-admin -- --email ana@ejemplo.com --nombre "Ana Pérez"
//   npm run crear-admin -- --email ana@ejemplo.com --actualizar
//
// La contraseña se pide oculta en la terminal, nunca como argumento (quedaría
// en el historial del shell). Para automatizar, --password-stdin la lee de la
// primera línea de la entrada estándar:
//   Get-Content clave.txt | npm run crear-admin -- --email ... --password-stdin
//
// --actualizar cambia la contraseña, reactiva al usuario y lo deja como admin.
// Carga las variables de entorno igual que Next.js (.env.local, .env, ...).

import { loadEnvConfig } from "@next/env";
import { parseArgs } from "node:util";
import { query } from "../lib/db";
import { hashPassword } from "../lib/auth/password";
import { emailSchema } from "../lib/validacion";

loadEnvConfig(process.cwd());

const MIN_PASSWORD = 12;

function fallar(mensaje: string): never {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

// Lee una línea sin mostrar lo que se escribe.
function preguntarOculto(pregunta: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(pregunta);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();

    let valor = "";
    const terminar = () => {
      stdin.off("data", alEscribir);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const alEscribir = (chunk: string) => {
      if (chunk.startsWith("\u001b")) return; // flechas y otras teclas especiales
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          terminar();
          resolve(valor);
          return;
        }
        if (ch === "\u0003") {
          terminar();
          process.exit(130); // Ctrl+C
        }
        if (ch === "\u007f" || ch === "\b") valor = valor.slice(0, -1);
        else valor += ch;
      }
    };
    stdin.on("data", alEscribir);
  });
}

async function primeraLineaDeStdin(): Promise<string> {
  const partes: Buffer[] = [];
  for await (const parte of process.stdin) partes.push(Buffer.from(parte));
  return Buffer.concat(partes).toString("utf8").split(/\r?\n/)[0] ?? "";
}

async function leerPassword(desdeStdin: boolean): Promise<string> {
  if (desdeStdin) return primeraLineaDeStdin();
  if (!process.stdin.isTTY) {
    fallar(
      "No hay una terminal interactiva para pedir la contraseña. Ejecútalo desde " +
        "PowerShell, CMD o la terminal de VS Code, o usa --password-stdin.",
    );
  }
  const password = await preguntarOculto("Contraseña: ");
  const confirmacion = await preguntarOculto("Repite la contraseña: ");
  if (password !== confirmacion) fallar("Las contraseñas no coinciden.");
  return password;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      nombre: { type: "string" },
      actualizar: { type: "boolean", default: false },
      "password-stdin": { type: "boolean", default: false },
    },
  });

  const parsedEmail = emailSchema.safeParse(values.email ?? "");
  if (!parsedEmail.success) fallar("Indica un --email válido.");
  const email = parsedEmail.data;
  const nombre = values.nombre?.trim() || null;

  const { rows } = await query<{ id: number; rol: string }>(
    `SELECT id, rol FROM staff WHERE email = $1`,
    [email],
  );
  const existente = rows[0];
  if (existente && !values.actualizar) {
    fallar(
      `Ya existe un usuario del staff con ${email}. Usa --actualizar para cambiarle la contraseña.`,
    );
  }
  if (!existente && values.actualizar) {
    fallar(`No existe un usuario del staff con ${email}; quita --actualizar para crearlo.`);
  }
  if (!existente && !nombre) fallar('Indica --nombre "Nombre Apellido".');

  const password = await leerPassword(values["password-stdin"]);
  if (password.length < MIN_PASSWORD) {
    fallar(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }
  const hash = await hashPassword(password);

  if (existente) {
    await query(
      `UPDATE staff
          SET password_hash = $2, rol = 'admin', activo = TRUE,
              nombre = COALESCE($3, nombre)
        WHERE id = $1`,
      [existente.id, hash, nombre],
    );
    const antes = existente.rol === "admin" ? "" : ` (antes era ${existente.rol})`;
    console.log(`✓ Admin actualizado: ${email}, id ${existente.id}${antes}.`);
  } else {
    const { rows: creados } = await query<{ id: number }>(
      `INSERT INTO staff (email, nombre, rol, password_hash)
       VALUES ($1, $2, 'admin', $3)
       RETURNING id`,
      [email, nombre, hash],
    );
    console.log(`✓ Admin creado: ${email}, id ${creados[0].id}.`);
  }
}

// exit explícito: en Windows la entrada estándar puede dejar el proceso vivo.
main().then(
  () => process.exit(0),
  (e: unknown) => fallar(e instanceof Error ? e.message : String(e)),
);
