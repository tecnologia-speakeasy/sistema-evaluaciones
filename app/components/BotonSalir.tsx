import { clasesBoton, type VarianteBoton } from "./ui/Boton";

// Formulario HTML simple: funciona sin JavaScript y usa POST (no se puede
// disparar con un simple enlace o prefetch). Por defecto con el estilo
// xs.logout de a2, para la barra superior.
export default function BotonSalir({
  variante = "barra",
}: {
  variante?: VarianteBoton;
}) {
  return (
    <form action="/api/auth/logout" method="post">
      <button type="submit" className={clasesBoton({ variante, tamano: "barra" })}>
        Cerrar sesión
      </button>
    </form>
  );
}
