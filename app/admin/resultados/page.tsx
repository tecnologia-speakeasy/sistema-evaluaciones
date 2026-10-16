import type { Metadata } from "next";
import { Proximamente } from "@/app/admin/components/Proximamente";

export const metadata: Metadata = { title: "Resultados" };

export default function Resultados() {
  return (
    <Proximamente
      titulo="Resultados"
      descripcion="Resultados por estudiante y evaluación, con exportación a CSV."
    />
  );
}
