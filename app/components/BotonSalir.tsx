// Formulario HTML simple: funciona sin JavaScript y usa POST (no se puede
// disparar con un simple enlace o prefetch).
export default function BotonSalir() {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
      >
        Salir
      </button>
    </form>
  );
}
