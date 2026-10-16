import Link from "next/link";

// Paginación con enlaces (funciona sin JavaScript y conserva los filtros de la
// URL): "← Anterior · Página 2 de 7 · Siguiente →". `href(p)` arma la URL de p.
export function Paginacion({
  pagina,
  paginas,
  href,
}: {
  pagina: number;
  paginas: number;
  href: (pagina: number) => string;
}) {
  if (paginas <= 1) return null;
  const caja =
    "inline-flex items-center rounded-[10px] border-[1.5px] px-3.5 py-2 text-sm font-semibold transition-colors";
  const activo = `${caja} border-rosa bg-white text-rosa hover:bg-rosa/5`;
  const inactivo = `${caja} border-borde bg-white text-gris-claro`;
  return (
    <nav aria-label="Páginas" className="mt-5 flex items-center justify-between gap-3">
      {pagina > 1 ? (
        <Link href={href(pagina - 1)} className={activo} rel="prev">
          ← Anterior
        </Link>
      ) : (
        <span className={inactivo} aria-disabled>
          ← Anterior
        </span>
      )}
      <span className="text-sm text-gris-oscuro">
        Página <strong className="text-tinta">{pagina}</strong> de {paginas}
      </span>
      {pagina < paginas ? (
        <Link href={href(pagina + 1)} className={activo} rel="next">
          Siguiente →
        </Link>
      ) : (
        <span className={inactivo} aria-disabled>
          Siguiente →
        </span>
      )}
    </nav>
  );
}
