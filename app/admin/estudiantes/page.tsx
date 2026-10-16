import type { Metadata } from "next";
import { Proximamente } from "@/app/admin/components/Proximamente";

export const metadata: Metadata = { title: "Estudiantes" };

export default function Estudiantes() {
  return (
    <Proximamente
      titulo="Estudiantes"
      descripcion="Carga de estudiantes por CSV y activación por generación."
      soloAdmin
    />
  );
}
