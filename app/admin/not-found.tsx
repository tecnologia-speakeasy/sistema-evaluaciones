import { BotonEnlace } from "@/app/components/ui/Boton";
import { Tarjeta } from "@/app/components/ui/Tarjeta";

export default function NoEncontrado() {
  return (
    <Tarjeta className="mx-auto mt-6 max-w-lg text-center">
      <p className="text-lg font-extrabold text-titulo">No encontramos lo que buscas</p>
      <p className="mt-1 mb-5 text-sm text-gris-oscuro">
        Puede que se haya borrado o que el enlace esté incompleto.
      </p>
      <BotonEnlace href="/admin">Ir a generaciones</BotonEnlace>
    </Tarjeta>
  );
}
