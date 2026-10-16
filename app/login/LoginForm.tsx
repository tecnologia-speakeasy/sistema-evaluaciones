"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { destinoSeguro } from "@/lib/auth/destino";

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

  async function identificar() {
    const { ok, data } = await postJson("/api/auth/identify", { email });
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      return;
    }
    const r = data as RespuestaIdentify;
    if (r.tipo === "staff") {
      setPaso("password");
    } else if (r.tipo === "estudiante") {
      if (r.paso === "sesion_iniciada") {
        // Recarga completa para que el proxy vea la cookie nueva.
        window.location.assign(destinoSeguro(next, "estudiante"));
        return;
      }
      // Fase OTP: aquí irá el campo del código de 6 dígitos.
      setAviso("Te enviamos un código de acceso a tu correo.");
    } else {
      setError(NO_AUTORIZADO);
    }
  }

  async function ingresarStaff() {
    const { ok, data } = await postJson("/api/auth/staff-login", {
      email,
      password,
    });
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      return;
    }
    window.location.assign(destinoSeguro(next, "staff"));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      if (paso === "email") await identificar();
      else await ingresarStaff();
    } catch {
      setError(SIN_CONEXION);
    } finally {
      setEnviando(false);
    }
  }

  function cambiarCorreo() {
    setPaso("email");
    setPassword("");
    setError(null);
  }

  const inputClass =
    "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 read-only:bg-zinc-100 read-only:text-zinc-600";

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-800">
          Correo
        </label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          required
          autoFocus
          readOnly={paso === "password"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      {paso === "password" && (
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-zinc-800">
              Contraseña
            </label>
            <button
              type="button"
              onClick={cambiarCorreo}
              className="text-xs text-zinc-600 underline hover:text-zinc-900"
            >
              Cambiar correo
            </button>
          </div>
          <input
            id="password"
            type="password"
            autoFocus
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      <div aria-live="polite" className="min-h-5 text-sm">
        {error && <p className="text-red-700">{error}</p>}
        {aviso && <p className="text-zinc-700">{aviso}</p>}
      </div>

      <button
        type="submit"
        disabled={enviando || !email.trim() || (paso === "password" && !password)}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enviando ? "Un momento…" : paso === "email" ? "Continuar" : "Ingresar"}
      </button>
    </form>
  );
}
