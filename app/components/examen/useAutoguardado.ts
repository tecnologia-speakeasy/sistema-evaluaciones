"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Guardado automático del intento en el servidor (PUT /api/intentos/[id]/borrador):
//   · 1,2 s después del último cambio (y uno a la vez; si cambió mientras
//     guardaba, se vuelve a guardar)
//   · al salir de la pestaña o cerrarla, con keepalive (sobrevive al cierre)
//   · sin conexión: reintenta cada 5 s
//   · 409 (se acabó el plazo o ya se envió): deja de guardar y avisa
export type EstadoGuardado = "guardado" | "guardando" | "sin_conexion" | null;
export type Datos = { respuestas: Record<string, string | string[]>; cambiosPestana: number };

const ESPERA_MS = 1200;
const REINTENTO_MS = 5000;

export function useAutoguardado({
  intentoId,
  datos,
  alCerrarse,
}: {
  intentoId: number | null;
  datos: Datos;
  /** El servidor ya no acepta respuestas (fuera de plazo / enviado). */
  alCerrarse: (motivo: "fuera_de_plazo" | "enviado") => void;
}) {
  const [estado, setEstado] = useState<EstadoGuardado>(null);
  // Lo último que confirmó el servidor (estado: para la pantalla; ref: para los callbacks).
  const [jsonGuardado, setJsonGuardado] = useState(() => JSON.stringify(datos));
  const ultimo = useRef(datos);
  const guardadoJson = useRef(jsonGuardado);
  const enCurso = useRef(false);
  const cerrado = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alCerrarseRef = useRef(alCerrarse);
  useEffect(() => {
    alCerrarseRef.current = alCerrarse;
    ultimo.current = datos;
  });

  const url = intentoId ? `/api/intentos/${intentoId}/borrador` : null;
  // Para reintentar / volver a guardar desde dentro de guardar().
  const otraVez = useRef<() => void>(() => {});

  const guardar = useCallback(async (): Promise<void> => {
    if (!url || cerrado.current || enCurso.current) return;
    const json = JSON.stringify(ultimo.current);
    if (json === guardadoJson.current) {
      setEstado((e) => (e === "guardando" ? "guardado" : e));
      return;
    }
    enCurso.current = true;
    setEstado("guardando");
    try {
      const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: json });
      if (res.status === 409) {
        cerrado.current = true;
        const data = await res.json().catch(() => null);
        alCerrarseRef.current(data?.motivo === "enviado" ? "enviado" : "fuera_de_plazo");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      guardadoJson.current = json;
      setJsonGuardado(json);
      setEstado("guardado");
    } catch {
      setEstado("sin_conexion");
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => otraVez.current(), REINTENTO_MS);
      return;
    } finally {
      enCurso.current = false;
    }
    // Cambió mientras se guardaba.
    if (JSON.stringify(ultimo.current) !== guardadoJson.current) otraVez.current();
  }, [url]);
  useEffect(() => {
    otraVez.current = () => void guardar();
  }, [guardar]);

  // Cada cambio reinicia la espera.
  const json = JSON.stringify(datos);
  useEffect(() => {
    if (!url || json === guardadoJson.current) return;
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void guardar(), ESPERA_MS);
    return () => clearTimeout(temporizador.current);
  }, [json, url, guardar]);

  // Al salir de la pestaña o cerrarla: lo pendiente sale con keepalive.
  useEffect(() => {
    if (!url) return;
    const vaciar = () => {
      const pendiente = JSON.stringify(ultimo.current);
      if (cerrado.current || pendiente === guardadoJson.current) return;
      fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: pendiente, keepalive: true })
        .then((res) => {
          if (res.ok) guardadoJson.current = pendiente;
        })
        .catch(() => {});
    };
    const alOcultar = () => document.hidden && vaciar();
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("pagehide", vaciar);
    return () => {
      document.removeEventListener("visibilitychange", alOcultar);
      window.removeEventListener("pagehide", vaciar);
    };
  }, [url]);

  /** El borrador inicial (al retomar) ya está en el servidor. */
  const marcarGuardado = useCallback((d: Datos) => {
    guardadoJson.current = JSON.stringify(d);
    setJsonGuardado(guardadoJson.current);
  }, []);
  // Al enviar se detiene; si el envío falla, se reanuda.
  const detener = useCallback(() => {
    cerrado.current = true;
    clearTimeout(temporizador.current);
  }, []);
  const reanudar = useCallback(() => {
    cerrado.current = false;
    void guardar();
  }, [guardar]);

  // Con cambios sin confirmar, nunca dice "guardado".
  const visible: EstadoGuardado =
    estado === "sin_conexion" ? estado : json !== jsonGuardado && url ? "guardando" : estado;

  return { estado: visible, marcarGuardado, detener, reanudar };
}
