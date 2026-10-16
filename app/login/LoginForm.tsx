"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { destinoSeguro } from "@/lib/auth/destino";
import { DIGITOS_CODIGO, VIGENCIA_CODIGO_MIN } from "@/lib/auth/codigo-compartido";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";
import { CasillasCodigo } from "./CasillasCodigo";
import { formatearCuenta, useCuentaRegresiva } from "./useCuentaRegresiva";

// Login unificado: primero el correo (/api/auth/identify).
//   · staff      → campo de contraseña (/api/auth/staff-login)
//   · estudiante → escribe su nombre, como en a2 (/api/auth/estudiante-login).
//                  Con OTP_ACTIVO=true, además el código de 6 dígitos que le
//                  llega por correo (/api/auth/verificar-codigo); "Reenviar
//                  código" vuelve a identify.
// El nombre se recuerda en este navegador para la próxima vez.

type RespuestaIdentify =
  | { tipo: "staff" }
  | { tipo: "estudiante"; paso: "nombre" }
  | { tipo: "estudiante"; paso: "codigo_enviado"; reenviarEn: number; nuevo: boolean }
  | { tipo: "estudiante"; paso: "limite"; reenviarEn: number; error: string }
  | { tipo: "no_autorizado" };

const NO_AUTORIZADO =
  "Este correo no está autorizado. Si crees que es un error, escribe a tu coordinador académico.";
const SIN_CONEXION =
  "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
const YA_ENVIADO = "Ya te enviamos un código hace un momento. Revisa tu correo.";
const CODIGO_NUEVO = "Te enviamos un código nuevo. El anterior ya no sirve.";
const FALTA_NOMBRE = "Escribe tu nombre.";

const ID_CODIGO = "codigo";
const ID_NOMBRE = "nombre";
const CLAVE_NOMBRE = "se_nombre_estudiante";
const casillasVacias = () => Array<string>(DIGITOS_CODIGO).fill("");
const nombreValido = (n: string) => n.replace(/\s+/g, " ").trim().length >= 2;

function nombreRecordado(): string {
  try {
    return localStorage.getItem(CLAVE_NOMBRE) ?? "";
  } catch {
    return "";
  }
}
function recordarNombre(nombre: string) {
  try {
    localStorage.setItem(CLAVE_NOMBRE, nombre.replace(/\s+/g, " ").trim());
  } catch {
    // Sin almacenamiento (modo privado): la próxima vez lo vuelve a escribir.
  }
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

export default function LoginForm() {
  const next = useSearchParams().get("next");
  const [paso, setPaso] = useState<"email" | "password" | "nombre" | "codigo">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [digitos, setDigitos] = useState(casillasVacias);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const espera = useCuentaRegresiva();

  // Foco en la primera casilla (si ya están en pantalla; al aparecer, autoFocus).
  const enfocarCodigo = () => document.getElementById(ID_CODIGO)?.focus();

  function reiniciarCasillas() {
    setDigitos(casillasVacias());
    enfocarCodigo();
  }

  // Al pasar al paso del estudiante: el nombre de la última vez en este navegador.
  function irAPasoEstudiante(siguiente: "nombre" | "codigo") {
    if (paso !== siguiente && !nombre) setNombre(nombreRecordado());
    setPaso(siguiente);
  }

  // Respuesta de identify para un estudiante con OTP (primer envío o
  // "Reenviar código"). Devuelve false si no era de ese tipo.
  function recibirCodigo(data: RespuestaIdentify | null, reenvio: boolean): boolean {
    if (data?.tipo !== "estudiante" || data.paso === "nombre") return false;
    irAPasoEstudiante("codigo");
    espera.iniciar(data.reenviarEn);
    if (data.paso === "limite") {
      setError(data.error);
      enfocarCodigo(); // puede escribir el último código que le llegó
    } else if (!data.nuevo) {
      setAviso(YA_ENVIADO);
    } else if (reenvio) {
      setAviso(CODIGO_NUEVO);
      reiniciarCasillas();
    }
    return true;
  }

  // Devuelven true si ya se está navegando a otra página.
  async function identificar(): Promise<boolean> {
    const { ok, data } = await postJson("/api/auth/identify", { email });
    if (recibirCodigo(data, false)) return false;
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      return false;
    }
    const r = data as RespuestaIdentify;
    if (r.tipo === "staff") setPaso("password");
    else if (r.tipo === "estudiante") irAPasoEstudiante("nombre");
    else setError(NO_AUTORIZADO);
    return false;
  }

  async function ingresarStaff(): Promise<boolean> {
    const { ok, data } = await postJson("/api/auth/staff-login", {
      email,
      password,
    });
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      return false;
    }
    window.location.assign(destinoSeguro(next, "staff"));
    return true;
  }

  async function ingresarEstudiante(): Promise<boolean> {
    const { ok, data } = await postJson("/api/auth/estudiante-login", { email, nombre });
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      return false;
    }
    recordarNombre(nombre);
    // Recarga completa para que el proxy vea la cookie nueva.
    window.location.assign(destinoSeguro(next, "estudiante"));
    return true;
  }

  async function verificarCodigo(codigo: string): Promise<boolean> {
    const { ok, data } = await postJson("/api/auth/verificar-codigo", { email, nombre, codigo });
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      reiniciarCasillas();
      return false;
    }
    recordarNombre(nombre);
    window.location.assign(destinoSeguro(next, "estudiante"));
    return true;
  }

  async function enviar(accion: () => Promise<boolean>) {
    setError(null);
    setAviso(null);
    setEnviando(true);
    let navegando = false;
    try {
      navegando = await accion();
    } catch {
      setError(SIN_CONEXION);
    } finally {
      // Si ya navega, el botón sigue en "Ingresando…" hasta que cambie la página.
      if (!navegando) setEnviando(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (paso === "codigo" && !nombreValido(nombre)) {
      setError(FALTA_NOMBRE);
      document.getElementById(ID_NOMBRE)?.focus();
      return;
    }
    if (!puedeEnviar) return;
    if (paso === "email") void enviar(identificar);
    else if (paso === "password") void enviar(ingresarStaff);
    else if (paso === "nombre") void enviar(ingresarEstudiante);
    else void enviar(() => verificarCodigo(digitos.join("")));
  }

  // Al completar las 6 casillas se envía solo (si ya escribió su nombre).
  function cambiarDigitos(nuevos: string[]) {
    setDigitos(nuevos);
    setError(null);
    if (!nuevos.every(Boolean) || enviando) return;
    if (!nombreValido(nombre)) {
      setError(FALTA_NOMBRE);
      document.getElementById(ID_NOMBRE)?.focus();
      return;
    }
    void enviar(() => verificarCodigo(nuevos.join("")));
  }

  async function reenviarCodigo() {
    setError(null);
    setAviso(null);
    setReenviando(true);
    try {
      const { data } = await postJson("/api/auth/identify", { email });
      if (!recibirCodigo(data, true)) setError(data?.error ?? SIN_CONEXION);
    } catch {
      setError(SIN_CONEXION);
    } finally {
      setReenviando(false);
    }
  }

  function cambiarCorreo() {
    setPaso("email");
    setPassword("");
    setDigitos(casillasVacias());
    setError(null);
    setAviso(null);
  }

  const puedeEnviar =
    Boolean(email.trim()) &&
    (paso === "email" ||
      (paso === "password" && Boolean(password)) ||
      (paso === "nombre" && nombreValido(nombre)) ||
      (paso === "codigo" && digitos.every(Boolean)));

  const botonCambiarCorreo = (
    <button
      type="button"
      onClick={cambiarCorreo}
      className="mb-2 cursor-pointer text-[13px] text-white/80 underline-offset-2 hover:text-white hover:underline"
    >
      Cambiar correo
    </button>
  );
  const esEstudiante = paso === "nombre" || paso === "codigo";

  // Estilos de styles.loginLabel / loginInput / loginError / loginBtn de a2.
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <Campo
        etiqueta="Correo electrónico"
        htmlFor="email"
        tono="oscuro"
        className="mb-[18px]"
        accion={esEstudiante ? botonCambiarCorreo : null}
      >
        <Entrada
          id="email"
          tono="oscuro"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Ej. maria.garcia@email.com"
          required
          autoFocus
          readOnly={paso !== "email"}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
      </Campo>

      {paso === "password" && (
        <Campo
          etiqueta="Contraseña"
          htmlFor="password"
          tono="oscuro"
          className="mb-[18px]"
          accion={botonCambiarCorreo}
        >
          <Entrada
            id="password"
            tono="oscuro"
            type="password"
            autoFocus
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Campo>
      )}

      {esEstudiante && (
        <Campo
          etiqueta="Nombre"
          htmlFor={ID_NOMBRE}
          tono="oscuro"
          className="mb-[18px]"
          ayuda={paso === "nombre" ? "Así aparecerá en tus resultados." : undefined}
        >
          <Entrada
            id={ID_NOMBRE}
            tono="oscuro"
            name="name"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Ej. María García López"
            maxLength={120}
            required
            // Sin código: el nombre es lo único que falta. Con código: si ya lo
            // recordamos, el foco va a las casillas.
            autoFocus={paso === "nombre" || !nombre}
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setError(null);
            }}
          />
        </Campo>
      )}

      {paso === "codigo" && (
        <Campo
          etiqueta="Código de acceso"
          htmlFor={ID_CODIGO}
          tono="oscuro"
          className="mb-[18px]"
          ayuda={`Te lo enviamos a tu correo. Vence en ${VIGENCIA_CODIGO_MIN} minutos; si no lo ves, revisa spam o promociones.`}
        >
          <CasillasCodigo
            id={ID_CODIGO}
            digitos={digitos}
            onCambio={cambiarDigitos}
            soloLectura={enviando}
            invalida={Boolean(error) && error !== FALTA_NOMBRE}
            autoFocus={Boolean(nombre)}
          />
        </Campo>
      )}

      <div aria-live="polite">
        {error && <p className="-mt-2.5 mb-3.5 text-[13px] leading-snug text-error-claro">{error}</p>}
        {aviso && <p className="-mt-2.5 mb-3.5 text-[13px] leading-snug text-white/90">{aviso}</p>}
      </div>

      <Boton
        type="submit"
        variante="degradado"
        tamano="lg"
        ancho
        className="mt-1.5 disabled:!opacity-90"
        disabled={enviando || !puedeEnviar}
      >
        {enviando ? (paso === "codigo" ? "Verificando…" : "Ingresando…") : "Ingresar"}
      </Boton>

      {paso === "codigo" && (
        <button
          type="button"
          onClick={reenviarCodigo}
          disabled={reenviando || espera.restante > 0}
          className="mx-auto mt-4 cursor-pointer text-[13px] font-semibold text-white underline-offset-2 hover:underline disabled:cursor-default disabled:font-normal disabled:text-white/70 disabled:no-underline"
        >
          {reenviando ? (
            "Enviando…"
          ) : espera.restante > 0 ? (
            <>
              Reenviar código en <span className="tabular-nums">{formatearCuenta(espera.restante)}</span>
            </>
          ) : (
            "¿No te llegó? Reenviar código"
          )}
        </button>
      )}
    </form>
  );
}
