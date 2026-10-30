import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { unstable_rethrow } from "next/navigation";
import { ErrorAutorizacion, requireStaff } from "@/lib/auth/guards";
import { MAX_AUDIO_MB, TIPOS_AUDIO } from "@/lib/preguntas/materiales";

// Audios de las preguntas de listening (db/009): el navegador del staff los sube
// directo a Vercel Blob (no pasan por aquí, así no hay límite de tamaño del body).
// Esta ruta solo firma la subida. Necesita BLOB_READ_WRITE_TOKEN; sin ella el
// editor avisa y se puede pegar el enlace de un audio alojado en otra parte.
//
// Autoriza dentro de onBeforeGenerateToken: es la llamada que hace el navegador
// del staff. La de "subida completada" la hace Vercel (sin sesión) y no guarda nada.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const respuesta = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        await requireStaff();
        if (!pathname.startsWith("evaluaciones/audios/")) throw new Error("Ruta no permitida para audios");
        return {
          allowedContentTypes: TIPOS_AUDIO,
          maximumSizeInBytes: MAX_AUDIO_MB * 1024 * 1024,
          // Dos audios con el mismo nombre no se pisan.
          addRandomSuffix: true,
        };
      },
      // La URL se guarda al guardar la lectura/audio, no aquí.
      onUploadCompleted: async () => {},
    });
    return Response.json(respuesta);
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ErrorAutorizacion) return e.respuesta();
    const sinToken = !process.env.BLOB_READ_WRITE_TOKEN;
    console.error("[audios]", e);
    return Response.json(
      {
        error: sinToken
          ? "La subida de audios no está configurada (falta BLOB_READ_WRITE_TOKEN). Pega el enlace del audio."
          : "No pudimos subir el audio. Inténtalo de nuevo.",
      },
      { status: sinToken ? 503 : 400 },
    );
  }
}
