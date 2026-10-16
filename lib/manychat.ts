import "server-only";

// WhatsApp por ManyChat (plantillas Utility aprobadas por Meta), portado de
// ../evaluacion-a2/lib/manychat.ts. Patrón: fijar custom fields del contacto →
// disparar el flow que los usa. El subscriber_id es estudiantes.manychat_id.
// MANYCHAT_API_URL (opcional): otra URL, p. ej. el simulador de las pruebas.

const urlBase = () => (process.env.MANYCHAT_API_URL?.trim() || "https://api.manychat.com").replace(/\/+$/, "");

export function manychatConfigurado(): boolean {
  return Boolean(process.env.MANYCHAT_API_TOKEN?.trim() && process.env.MANYCHAT_FLOW_RESULTADO?.trim());
}

async function mc(ruta: string, cuerpo: unknown): Promise<void> {
  const res = await fetch(`${urlBase()}${ruta}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MANYCHAT_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ManyChat ${ruta}: ${res.status} ${(await res.text()).slice(0, 250)}`);
}

// Fija los custom fields indicados y dispara el flow (envía la plantilla).
export async function enviarWhatsApp(
  manychatId: string,
  flowNs: string,
  campos: Record<string, string | number>,
): Promise<void> {
  if (!process.env.MANYCHAT_API_TOKEN?.trim()) throw new Error("ManyChat no configurado");
  const subscriberId = Number(manychatId);
  if (!Number.isFinite(subscriberId)) throw new Error(`manychat_id inválido: ${manychatId}`);

  for (const [nombre, valor] of Object.entries(campos)) {
    await mc("/fb/subscriber/setCustomFieldByName", {
      subscriber_id: subscriberId,
      field_name: nombre,
      field_value: valor,
    });
  }
  await mc("/fb/sending/sendFlow", { subscriber_id: subscriberId, flow_ns: flowNs });
}
