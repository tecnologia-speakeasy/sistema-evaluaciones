import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth/token";

// Primera barrera (Next 16 renombró middleware → proxy). Solo verifica la firma
// de la cookie, sin BD. Cada página y route handler vuelve a autorizar con
// lib/auth/guards.ts, que sí consulta la BD.
//
// La redirección "ya tienes sesión" fuera de /login la hace la propia página
// de login (con BD): si la hiciera el proxy, un usuario desactivado con cookie
// vigente quedaría en un bucle /admin → /login → /admin.

export function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE_SESION)?.value;
  const sesion = token ? verificarSesion(token) : null;
  const { pathname, search } = req.nextUrl;
  const esAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (!sesion) {
    const login = new URL("/login", req.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  if (esAdmin && sesion.tipo !== "staff") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (!esAdmin && sesion.tipo === "staff") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // /login, /resultado/[token] (público) y /api/* quedan fuera:
  // los route handlers autorizan por su cuenta.
  // (/historial redirige a / desde next.config.ts.)
  matcher: ["/", "/admin/:path*", "/evaluacion/:path*"],
};
