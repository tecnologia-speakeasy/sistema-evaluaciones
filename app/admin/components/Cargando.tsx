// Relleno mientras llega el contenido de una página del dashboard.
export function Cargando() {
  return (
    <div aria-busy className="animate-pulse">
      <div className="mb-3 h-7 w-56 rounded-lg bg-lavanda" />
      <div className="mb-8 h-4 w-80 max-w-full rounded bg-lavanda" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-36 rounded-[14px] bg-lavanda/70" />
        <div className="h-36 rounded-[14px] bg-lavanda/70" />
      </div>
    </div>
  );
}
