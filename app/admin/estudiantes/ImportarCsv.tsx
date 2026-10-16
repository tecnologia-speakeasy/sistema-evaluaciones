"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";
import { importarCsvAction, previsualizarCsvAction, type VistaPreviaCsv } from "@/app/admin/acciones/estudiantes";
import { Aviso } from "@/app/components/ui/Aviso";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Selector } from "@/app/components/ui/Campo";
import { Dialogo } from "@/app/components/ui/Dialogo";
import { Icono } from "@/app/components/ui/Icono";
import { Insignia, type TonoInsignia } from "@/app/components/ui/InsigniaEstado";
import type { ResultadoImportacion } from "@/lib/datos/estudiantes";
import type { OpcionGeneracion } from "./BarraEstudiantes";

// Carga por CSV: elegir generación y archivo → vista previa (el servidor analiza
// el archivo y lo compara con la BD) → Confirmar (el servidor vuelve a analizar
// todo y guarda en una transacción). Nunca borra estudiantes.

const MAX_BYTES = 1024 * 1024;
const MAX_VISIBLES = 100;
const EJEMPLO = "\uFEFFcorreo;manychat_id\r\nana.perez@ejemplo.com;1234567890\r\nbeto.gomez@ejemplo.com;\r\n";

export default function ImportarCsv({
  generaciones,
  generacionId,
}: {
  generaciones: OpcionGeneracion[];
  generacionId: number;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>
        <span className="inline-flex items-center gap-2">
          <Icono nombre="subir" className="size-[18px]" />
          Cargar CSV
        </span>
      </Boton>
      <Dialogo
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Cargar estudiantes por CSV"
        ancho="max-w-3xl"
      >
        <Importador generaciones={generaciones} generacionInicial={generacionId} onCerrar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

type Vista = Extract<VistaPreviaCsv, { ok: true }>;
type Grupo = {
  titulo: string;
  tono: TonoInsignia;
  explicacion: string;
  filas: { clave: string; texto: string; detalle?: string | null }[];
};

function Importador({
  generaciones,
  generacionInicial,
  onCerrar,
}: {
  generaciones: OpcionGeneracion[];
  generacionInicial: number;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [generacion, setGeneracion] = useState(generacionInicial);
  const [archivo, setArchivo] = useState<{ nombre: string; texto: string } | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<ResultadoImportacion | null>(null);
  const [entrada, setEntrada] = useState(0);
  const [pendiente, iniciar] = useTransition();
  const nombre = generaciones.find((g) => g.id === generacion)?.nombre ?? "";

  function previsualizar(texto: string, gen: number) {
    setError(null);
    setVista(null);
    iniciar(async () => {
      const r = await previsualizarCsvAction(gen, texto);
      if (r.ok) setVista(r);
      else setError(r.error);
    });
  }

  async function alElegir(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    setHecho(null);
    setVista(null);
    setError(null);
    if (!f) return setArchivo(null);
    if (f.size > MAX_BYTES) {
      setArchivo(null);
      setError("El archivo pesa más de 1 MB. Divídelo en partes.");
      return;
    }
    const texto = await f.text();
    setArchivo({ nombre: f.name, texto });
    previsualizar(texto, generacion);
  }

  function cambiarGeneracion(id: number) {
    setGeneracion(id);
    setHecho(null);
    if (archivo) previsualizar(archivo.texto, id);
  }

  function importar() {
    if (!archivo) return;
    setError(null);
    iniciar(async () => {
      const r = await importarCsvAction(generacion, archivo.texto);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setHecho(r.resultado);
      setVista(null);
      setArchivo(null);
      setEntrada((n) => n + 1);
      router.push(`/admin/estudiantes?generacion=${generacion}`);
    });
  }

  const c = vista?.clasificacion;
  const aGuardar = c
    ? c.nuevos.length + c.cambianGeneracion.length + c.actualizanManychat.length + c.inactivos.length
    : 0;
  const grupos: Grupo[] =
    vista && c
      ? [
          {
            titulo: "Nuevos",
            tono: "verde",
            explicacion: `Se crean activos en ${nombre}.`,
            filas: c.nuevos.map((f) => ({
              clave: f.email,
              texto: f.email,
              detalle: f.manychat_id && `manychat_id ${f.manychat_id}`,
            })),
          },
          {
            titulo: "Cambian de generación",
            tono: "lavanda",
            explicacion: `Ya existen en otra generación: pasan a ${nombre}. Sus intentos anteriores se conservan.`,
            filas: c.cambianGeneracion.map((f) => ({ clave: f.email, texto: f.email, detalle: `estaba en ${f.generacion_actual}` })),
          },
          {
            titulo: "Actualizan el manychat_id",
            tono: "lavanda",
            explicacion: `Ya están en ${nombre}; cambia su manychat_id.`,
            filas: c.actualizanManychat.map((f) => ({
              clave: f.email,
              texto: f.email,
              detalle: `${f.manychat_actual ?? "sin manychat_id"} → ${f.manychat_id}`,
            })),
          },
          {
            titulo: "Inactivos",
            tono: "gris",
            explicacion: `Se pasan a ${nombre} (y se actualiza su manychat_id si viene), pero siguen inactivos: actívalos desde la lista si corresponde.`,
            filas: c.inactivos.map((f) => ({ clave: f.email, texto: f.email, detalle: `en ${f.generacion_actual}` })),
          },
          {
            titulo: "Sin cambios",
            tono: "gris",
            explicacion: `Ya están en ${nombre}.`,
            filas: c.sinCambios.map((f) => ({ clave: f.email, texto: f.email })),
          },
          {
            titulo: "No se importan",
            tono: "rojo",
            explicacion: "Correos inválidos, manychat_id con letras o correos del staff.",
            filas: [
              ...vista.invalidas.map((f) => ({
                clave: `i${f.fila}`,
                texto: `Fila ${f.fila}: ${f.valor || "(vacía)"}`,
                detalle: f.motivo,
              })),
              ...c.delStaff.map((f) => ({
                clave: `s${f.fila}`,
                texto: `Fila ${f.fila}: ${f.email}`,
                detalle: "Es un correo del staff",
              })),
            ],
          },
          {
            titulo: "Duplicados en el archivo",
            tono: "rojo",
            explicacion: "Se usa solo la primera vez que aparece cada correo.",
            filas: vista.duplicadas.map((d) => ({
              clave: `d${d.fila}`,
              texto: `Fila ${d.fila}: ${d.email}`,
              detalle: `repite la fila ${d.primera}`,
            })),
          },
        ]
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Campo etiqueta="Generación" htmlFor="csv-generacion">
          <Selector
            id="csv-generacion"
            value={generacion}
            disabled={pendiente}
            onChange={(e) => cambiarGeneracion(Number(e.target.value))}
          >
            {generaciones.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
                {g.activa ? "" : " (desactivada)"}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Archivo CSV" htmlFor="csv-archivo">
          <input
            key={entrada}
            id="csv-archivo"
            type="file"
            accept=".csv,text/csv"
            disabled={pendiente}
            onChange={(e) => void alElegir(e)}
            className="block w-full cursor-pointer rounded-[10px] border-[1.5px] border-borde bg-campo text-sm text-tinta file:mr-3 file:cursor-pointer file:border-0 file:bg-lavanda file:px-3.5 file:py-3 file:font-semibold file:text-violeta"
          />
        </Campo>
      </div>
      <p className="text-[13px] leading-snug text-gris-oscuro">
        Una columna <strong>correo</strong> y, opcional, <strong>manychat_id</strong>. Coma o punto y coma, con o sin
        encabezado (sin encabezado: 1.ª columna correo, 2.ª manychat_id). Máximo 5.000 filas o 1 MB.{" "}
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(EJEMPLO)}`}
          download="estudiantes-ejemplo.csv"
          className="font-semibold text-violeta underline-offset-2 hover:underline"
        >
          Descargar un ejemplo
        </a>
      </p>

      {pendiente && !vista && <Aviso>Revisando el archivo…</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}

      {hecho && (
        <Aviso tono="exito">
          Listo: {hecho.creados} {hecho.creados === 1 ? "nuevo" : "nuevos"}, {hecho.movidos} cambiaron de generación,{" "}
          {hecho.manychatActualizados} con manychat_id actualizado
          {hecho.inactivos > 0 && `, ${hecho.inactivos} inactivos actualizados`}. Los que no estaban en el archivo no se
          tocaron.
        </Aviso>
      )}

      {vista && (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {grupos
              .filter((g) => g.filas.length > 0)
              .map((g) => (
                <li key={g.titulo} className="rounded-xl bg-lavanda px-3 py-2.5">
                  <p className="text-[22px] leading-none font-extrabold text-titulo">{g.filas.length}</p>
                  <p className="mt-1 text-[13px] leading-snug font-semibold text-gris-oscuro">{g.titulo}</p>
                </li>
              ))}
          </ul>

          <div className="flex flex-col gap-2">
            {grupos
              .filter((g) => g.filas.length > 0)
              .map((g) => (
                <details key={g.titulo} className="rounded-xl border-[1.5px] border-borde-suave bg-white px-4 py-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[15px] font-bold text-tinta">
                    <Insignia tono={g.tono}>{g.filas.length}</Insignia>
                    {g.titulo}
                  </summary>
                  <p className="mt-2 text-[13px] text-gris-oscuro">{g.explicacion}</p>
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {g.filas.slice(0, MAX_VISIBLES).map((f) => (
                      <li key={f.clave} className="break-all">
                        <span className="text-tinta">{f.texto}</span>
                        {f.detalle && <span className="text-gris-oscuro"> — {f.detalle}</span>}
                      </li>
                    ))}
                    {g.filas.length > MAX_VISIBLES && (
                      <li className="text-gris-oscuro">y {g.filas.length - MAX_VISIBLES} más</li>
                    )}
                  </ul>
                </details>
              ))}
          </div>

          <p className="text-[13px] text-gris-oscuro">
            Se guarda todo junto: si algo falla, no se guarda nada. Los estudiantes que no están en el archivo no se
            tocan.
          </p>
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton onClick={importar} disabled={pendiente || aGuardar === 0}>
              {pendiente
                ? "Importando…"
                : aGuardar === 0
                  ? "No hay cambios para guardar"
                  : `Importar ${aGuardar} ${aGuardar === 1 ? "estudiante" : "estudiantes"}`}
            </Boton>
          </div>
        </>
      )}

      {hecho && (
        <div className="flex justify-end">
          <Boton onClick={onCerrar}>Cerrar</Boton>
        </div>
      )}
    </div>
  );
}
