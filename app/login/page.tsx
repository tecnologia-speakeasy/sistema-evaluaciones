import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { getEstudianteActual, getStaffActual } from "@/lib/auth/guards";
import { Particulas } from "@/app/components/ui/Particulas";
import { Tarjeta } from "@/app/components/ui/Tarjeta";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

// Diseño de styles.loginPage / loginCard de ../evaluacion-a2.
export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center bg-marca p-6 text-white">
      <Particulas />
      <Tarjeta
        variante="vidrio"
        relleno="px-[46px] pt-12 pb-[38px] max-[420px]:px-7"
        className="relative z-10 flex w-full max-w-[440px] animate-fade-up flex-col"
      >
        <p className="mb-2.5 text-center text-[15px] text-white">¡Bienvenidos!</p>
        <h1 className="texto-degradado text-center text-[clamp(22px,6vw,30px)] leading-[1.1] font-extrabold whitespace-nowrap">
          Speak Easy Test
        </h1>
        <p className="mt-2 mb-7 text-center text-sm text-white/90">
          Ingresa tu correo para comenzar
        </p>

        {/* Leen cookies / ?next=, por eso van dentro de <Suspense> (Cache Components). */}
        <Suspense fallback={null}>
          <RedirigirSiHaySesion />
        </Suspense>
        <Suspense fallback={<div className="h-[170px]" />}>
          <LoginForm />
        </Suspense>

        {/* eslint-disable-next-line @next/next/no-img-element -- igual que a2 */}
        <img
          src="/logo_login.png"
          alt="Speak Easy"
          className="mx-auto mt-[26px] block h-[54px] w-auto opacity-95"
        />
      </Tarjeta>
    </main>
  );
}

// Si ya hay una sesión válida y el usuario sigue activo en la BD, no muestra el login.
async function RedirigirSiHaySesion() {
  let destino: string | null = null;
  try {
    if (await getStaffActual()) destino = "/admin";
    else if (await getEstudianteActual()) destino = "/";
  } catch (e) {
    unstable_rethrow(e);
    // Si la BD falla, se muestra el formulario igual.
    console.error("[login] no se pudo revisar la sesión", e);
  }
  if (destino) redirect(destino);
  return null;
}
