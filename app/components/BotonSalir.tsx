import { clasesBoton } from "./ui/Boton";
import { Icono } from "./ui/Icono";

// Formulario HTML simple: funciona sin JavaScript y usa POST (no se puede
// disparar con un simple enlace o prefetch).
//   estilo "barra": botón translúcido de la barra superior (xs.logout de a2)
//   estilo "item":  acción dentro del menú del avatar (celular)
export default function BotonSalir({ estilo = "barra" }: { estilo?: "barra" | "item" }) {
  return (
    <form action="/api/auth/logout" method="post">
      {estilo === "barra" ? (
        <button type="submit" className={clasesBoton({ variante: "barra", tamano: "barra" })}>
          Cerrar sesión
        </button>
      ) : (
        <button
          type="submit"
          role="menuitem"
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-tinta hover:bg-opcion focus:bg-opcion focus:outline-none"
        >
          <Icono nombre="salir" className="size-[18px] text-gris-oscuro" />
          Cerrar sesión
        </button>
      )}
    </form>
  );
}
