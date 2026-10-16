// A dónde ir después del login según ?next=. Solo rutas internas y del área
// correcta para el tipo de usuario: evita usar ?next= para mandar al usuario a
// otro sitio (//evil.com, /\evil.com). Puro: se usa en el navegador (LoginForm).
export function destinoSeguro(
  next: string | null,
  tipo: "staff" | "estudiante",
): string {
  const base = tipo === "staff" ? "/admin" : "/";
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return base;
  }
  const esAdmin = /^\/admin(\/|\?|$)/.test(next);
  return (tipo === "staff") === esAdmin ? next : base;
}
