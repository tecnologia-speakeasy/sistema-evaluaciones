import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Carga de estudiantes por CSV: hasta 1 MB de texto más el resto de la petición.
    serverActions: { bodySizeLimit: "2mb" },
  },
  async redirects() {
    return [
      // "Mi historial" ya no es una página: es un pop-up del inicio.
      { source: "/historial", destination: "/", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
