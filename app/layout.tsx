import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// Mismos pesos que carga ../evaluacion-a2 (300–700): sus fontWeight 800 se
// ven como 700, igual que allá.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Evaluaciones · Speak Easy", template: "%s · Speak Easy" },
  description: "Plataforma de evaluaciones de inglés de Speak Easy",
  icons: { icon: { url: "/logo.webp", type: "image/webp" } },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
