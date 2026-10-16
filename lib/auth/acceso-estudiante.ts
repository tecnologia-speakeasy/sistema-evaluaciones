import "server-only";
import { setSession } from "./session";

// Segundo paso del login de un estudiante, una vez identificado por su correo.
//
// HOY: crea la sesión directamente.
// FASE OTP (ver CLAUDE.md): esta función generará un código de 6 dígitos,
// lo enviará por correo y devolverá { paso: "codigo_enviado" } SIN crear la
// sesión; la sesión se creará al verificar el código en otra ruta.
// /api/auth/identify ya devuelve `paso` y el formulario de login solo navega
// cuando es "sesion_iniciada"; falta agregar ahí el campo del código.

export type PasoAccesoEstudiante = "sesion_iniciada" | "codigo_enviado";

export async function iniciarAccesoEstudiante(
  estudianteId: number,
): Promise<{ paso: PasoAccesoEstudiante }> {
  await setSession({ tipo: "estudiante", id: estudianteId });
  return { paso: "sesion_iniciada" };
}
