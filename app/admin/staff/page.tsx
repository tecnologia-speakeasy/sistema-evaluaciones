import type { Metadata } from "next";
import { Proximamente } from "@/app/admin/components/Proximamente";

export const metadata: Metadata = { title: "Staff" };

export default function Staff() {
  return (
    <Proximamente
      titulo="Staff"
      descripcion="Administradores y docentes con acceso al panel."
      soloAdmin
    />
  );
}
