import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { getEstudianteActual, getStaffActual } from "@/lib/auth/guards";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-xl font-semibold text-zinc-900">
          Evaluaciones Speak Easy
        </h1>
        <p className="mt-1 mb-6 text-sm text-zinc-600">
          Ingresa con tu correo registrado.
        </p>

        {/* Leen cookies / ?next=, por eso van dentro de <Suspense> (Cache Components). */}
        <Suspense fallback={null}>
          <RedirigirSiHaySesion />
        </Suspense>
        <Suspense fallback={<div className="h-32" />}>
          <LoginForm />
        </Suspense>
      </div>
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
