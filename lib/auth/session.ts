import "server-only";
import { cookies } from "next/headers";
import {
  COOKIE_SESION,
  DURACION_SESION,
  firmarSesion,
  verificarSesion,
  type Sesion,
} from "./token";

// Solo en Route Handlers o Server Functions (no se pueden escribir cookies
// mientras se renderiza un Server Component).
export async function setSession(sesion: Sesion): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_SESION, firmarSesion(sesion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION[sesion.tipo],
  });
}

// Solo verifica la firma y la expiración. Para saber si el usuario sigue
// activo en la BD, usar los guards de lib/auth/guards.ts.
export async function getSession(): Promise<Sesion | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESION)?.value;
  return token ? verificarSesion(token) : null;
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_SESION);
}
