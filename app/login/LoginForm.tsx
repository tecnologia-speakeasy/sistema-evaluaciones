"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { destinoSeguro } from "@/lib/auth/destino";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";

// Login unificado: primero el correo (/api/auth/identify); si es staff aparece
// el campo de contraseña (/api/auth/staff-login).

type RespuestaIdentify =
  | { tipo: "staff" }
  | { tipo: "estudiante"; paso: "sesion_iniciada" | "codigo_enviado" }
  | { tipo: "no_autorizado" };

const NO_AUTORIZADO =
  "Este correo no está autorizado. Si crees que es un error, escribe a tu coordinador académico.";
const SIN_CONEXION =
  "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";

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
  const [paso, setPaso] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Devuelven true si ya se está navegando a otra página.
  async function identificar(): Promise<boolean> {
    const { ok, data } = await postJson("/api/auth/identify", { email });
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      return false;
    }
    const r = data as RespuestaIdentify;
    if (r.tipo === "staff") {
      setPaso("password");
    } else if (r.tipo === "estudiante") {
      if (r.paso === "sesion_iniciada") {
        // Recarga completa para que el proxy vea la cookie nueva.
        window.location.assign(destinoSeguro(next, "estudiante"));
        return true;
      }
      // Fase OTP: aquí irá el campo del código de 6 dígitos.
      setAviso("Te enviamos un código de acceso a tu correo.");
    } else {
      setError(NO_AUTORIZADO);
    }
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setEnviando(true);
    let navegando = false;
    try {
      navegando = paso === "email" ? await identificar() : await ingresarStaff();
    } catch {
      setError(SIN_CONEXION);
    } finally {
      // Si ya navega, el botón sigue en "Ingresando…" hasta que cambie la página.
      if (!navegando) setEnviando(false);
    }
  }

  function cambiarCorreo() {
    setPaso("email");
    setPassword("");
    setError(null);
  }

  const puedeEnviar = Boolean(email.trim()) && (paso === "email" || Boolean(password));

  // Estilos de styles.loginLabel / loginInput / loginError / loginBtn de a2.
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <Campo etiqueta="Correo electrónico" htmlFor="email" tono="oscuro" className="mb-[18px]">
        <Entrada
          id="email"
          tono="oscuro"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Ej. maria.garcia@email.com"
          required
          autoFocus
          readOnly={paso === "password"}
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
          accion={
            <button
              type="button"
              onClick={cambiarCorreo}
              className="mb-2 cursor-pointer text-[13px] text-white/80 underline-offset-2 hover:text-white hover:underline"
            >
              Cambiar correo
            </button>
          }
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
        {enviando ? "Ingresando…" : "Ingresar"}
      </Boton>
    </form>
  );
}
