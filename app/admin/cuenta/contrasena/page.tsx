import type { Metadata } from "next";
import { Suspense } from "react";
import { staffParaPagina } from "@/lib/auth/guards";
import { MIN_PASSWORD } from "@/lib/auth/password";
import { TituloPagina } from "@/app/components/ui/Encabezado";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import { Cargando } from "@/app/admin/components/Cargando";
import FormContrasena from "./FormContrasena";

export const metadata: Metadata = { title: "Cambiar mi contraseña" };

// Cambio obligatorio al entrar con una contraseña temporal (los guards traen
// aquí desde cualquier página del panel) y "Cambiar mi contraseña" del menú.
export default function CambiarContrasena() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const staff = await staffParaPagina({ permitirPasswordTemporal: true });
  const obligatorio = staff.debe_cambiar_password;
  return (
    <>
      <TituloPagina
        titulo={obligatorio ? "Crea tu contraseña" : "Cambiar mi contraseña"}
        subtitulo={
          obligatorio
            ? "Entraste con una contraseña temporal. Crea una propia para continuar."
            : "Al cambiarla se cierran tus sesiones abiertas en otros dispositivos."
        }
      />
      <Tarjeta className="max-w-[520px]">
        <FormContrasena obligatorio={obligatorio} email={staff.email} minimo={MIN_PASSWORD} />
      </Tarjeta>
    </>
  );
}
