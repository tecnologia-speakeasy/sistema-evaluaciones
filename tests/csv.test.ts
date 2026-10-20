import { describe, expect, it } from "vitest";
import { celdaCsv, detectarSeparador, escribirCsv, leerCsv } from "../lib/csv";
import { analizarCsvEstudiantes, MAX_FILAS_CSV } from "../lib/estudiantes/importar";
import { generarPasswordTemporal } from "../lib/auth/password";

const celdas = (texto: string) => leerCsv(texto).filas.map((f) => f.celdas);

describe("leerCsv", () => {
  it("detecta coma o punto y coma (fuera de comillas)", () => {
    expect(detectarSeparador("correo,nombre\na@x.co,Ana")).toBe(",");
    expect(detectarSeparador("correo;nombre\na@x.co;Ana")).toBe(";");
    expect(detectarSeparador('"a,b,c";x;y\n')).toBe(";");
    expect(detectarSeparador("solo@correo.co")).toBe(",");
  });

  it("comillas, comillas dobles, separadores y saltos dentro de un campo", () => {
    expect(celdas('a;"b;c";"dijo ""hola""";"línea 1\nlínea 2"')).toEqual([
      ["a", "b;c", 'dijo "hola"', "línea 1\nlínea 2"],
    ]);
  });

  it("BOM, CRLF, filas en blanco y número de línea de cada fila", () => {
    const { filas } = leerCsv("\uFEFFcorreo\r\n\r\nana@x.co\r\n,\r\nbeto@x.co\r\n");
    expect(filas).toEqual([
      { linea: 1, celdas: ["correo"] },
      { linea: 3, celdas: ["ana@x.co"] },
      { linea: 5, celdas: ["beto@x.co"] },
    ]);
  });

  it("última fila sin salto de línea", () => {
    expect(celdas("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("escribirCsv (Excel en español)", () => {
  it("BOM, separador ; y CRLF; tildes tal cual", () => {
    const csv = escribirCsv([
      ["Nombre", "Puntaje"],
      ["María José", 90],
    ]);
    expect(csv).toBe("\uFEFFNombre;Puntaje\r\nMaría José;90\r\n");
  });

  it("entrecomilla lo que tiene ; comillas o saltos", () => {
    expect(celdaCsv("a;b")).toBe('"a;b"');
    expect(celdaCsv('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(celdaCsv("l1\nl2")).toBe('"l1\nl2"');
    expect(celdaCsv(null)).toBe("");
  });

  it("neutraliza fórmulas en textos (inyección CSV); los números no", () => {
    expect(celdaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celdaCsv("+57 300")).toBe("'+57 300");
    expect(celdaCsv("@foo")).toBe("'@foo");
    expect(celdaCsv("-1")).toBe("'-1");
    expect(celdaCsv(-1)).toBe("-1");
  });
});

describe("analizarCsvEstudiantes", () => {
  it("con encabezado (coma): el correo en cualquier columna; las demás se ignoran", () => {
    const r = analizarCsvEstudiantes("nombre,Correo,manychat_id\nAna,Ana@Ejemplo.com,123\nBeto,beto@ejemplo.com,\n");
    expect(r).toMatchObject({
      ok: true,
      conEncabezado: true,
      separador: ",",
      validas: [
        { fila: 2, email: "ana@ejemplo.com" },
        { fila: 3, email: "beto@ejemplo.com" },
      ],
      invalidas: [],
      duplicadas: [],
    });
  });

  it("sin encabezado y con punto y coma: el correo en la 1.ª columna (la 2.ª de los archivos de antes se ignora)", () => {
    const r = analizarCsvEstudiantes("ana@ejemplo.com;555\r\nbeto@ejemplo.com\r\n");
    expect(r).toMatchObject({
      ok: true,
      conEncabezado: false,
      separador: ";",
      validas: [
        { fila: 1, email: "ana@ejemplo.com" },
        { fila: 2, email: "beto@ejemplo.com" },
      ],
    });
  });

  it("encabezado en español (correo electrónico)", () => {
    const r = analizarCsvEstudiantes("Correo electrónico;Manychat ID\nana@ejemplo.com;9\n");
    expect(r.ok && r.validas).toEqual([{ fila: 2, email: "ana@ejemplo.com" }]);
  });

  it("inválidos y duplicados dentro del archivo", () => {
    const r = analizarCsvEstudiantes(
      ["correo,manychat_id", "ana@ejemplo.com,1", "no-es-correo,2", ",3", "carla@ejemplo.com,abc", "ANA@ejemplo.com,4"].join(
        "\n",
      ),
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.validas.map((v) => v.email)).toEqual(["ana@ejemplo.com", "carla@ejemplo.com"]);
    expect(r.invalidas).toEqual([
      { fila: 3, valor: "no-es-correo", motivo: "Correo inválido" },
      { fila: 4, valor: ",3", motivo: "Sin correo" },
    ]);
    expect(r.duplicadas).toEqual([{ fila: 6, email: "ana@ejemplo.com", primera: 2 }]);
  });

  it("encabezado sin «correo»: la 1.ª fila cuenta como datos y no se importa", () => {
    const r = analizarCsvEstudiantes("nombre,apellido\nAna,Pérez");
    expect(r).toMatchObject({ ok: true, conEncabezado: false, validas: [] });
    expect(r.ok && r.invalidas.map((f) => f.motivo)).toEqual(["Correo inválido", "Correo inválido"]);
  });

  it("errores de archivo: vacío, solo encabezado, demasiadas filas", () => {
    expect(analizarCsvEstudiantes("\n\n")).toEqual({ ok: false, error: "El archivo está vacío." });
    expect(analizarCsvEstudiantes("correo\n")).toEqual({ ok: false, error: "El archivo no tiene filas con correos." });
    const muchas = Array.from({ length: MAX_FILAS_CSV + 1 }, (_, i) => `e${i}@x.co`).join("\n");
    const r = analizarCsvEstudiantes(muchas);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/máximo es 5\.000/);
  });

  it("más de 1 MB: se rechaza", () => {
    const r = analizarCsvEstudiantes(`correo\n${"a".repeat(1024 * 1024)}@x.co`);
    expect(r).toEqual({ ok: false, error: "El archivo pesa más de 1 MB. Divídelo en partes." });
  });
});

describe("contraseña temporal", () => {
  it("16 caracteres sin los que se confunden (0 O 1 l I) y distinta cada vez", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generarPasswordTemporal();
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
      vistas.add(p);
    }
    expect(vistas.size).toBe(200);
  });
});
