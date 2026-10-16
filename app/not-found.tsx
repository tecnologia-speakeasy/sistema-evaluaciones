import Link from "next/link";

// 404 del área del estudiante (evaluación que no es de su generación, intento
// que no existe…), con las pantallas oscuras de a2.
export default function NoEncontrado() {
  return (
    <main className="fondo-intro flex min-h-screen flex-1 items-center justify-center p-6 text-white">
      <div className="flex w-[min(480px,94vw)] flex-col items-center rounded-3xl border border-white/14 bg-white/10 px-8 py-10 text-center">
        <h1 className="mb-2 text-2xl font-extrabold">No encontramos lo que buscas</h1>
        <p className="mb-7 text-[15px] text-white/80">Puede que el enlace esté incompleto o que ya no esté disponible.</p>
        <Link
          href="/"
          className="degradado-boton w-full max-w-[320px] rounded-xl border-2 border-rosa px-6 py-3.5 text-base font-bold text-white shadow-[0_10px_34px_rgba(255,50,125,0.4)]"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
