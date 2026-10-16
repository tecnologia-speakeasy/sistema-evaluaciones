"use client";

import { useSyncExternalStore } from "react";

// Spiky calificando: webm VP9 con transparencia (+ póster PNG). Safari no
// respeta el alfa de VP9 (se vería un fondo negro): ahí solo el póster.
const esSafari = () =>
  /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

export function Spiky({ className = "" }: { className?: string }) {
  // En el servidor no se sabe el navegador: póster hasta hidratar.
  const soloPoster = useSyncExternalStore(
    () => () => {},
    esSafari,
    () => true,
  );
  if (soloPoster) {
    // eslint-disable-next-line @next/next/no-img-element -- igual que a2
    return <img src="/spiky-calificando.png" alt="" className={className} />;
  }
  return (
    <video
      src="/spiky-calificando.webm"
      poster="/spiky-calificando.png"
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
      className={className}
    />
  );
}
