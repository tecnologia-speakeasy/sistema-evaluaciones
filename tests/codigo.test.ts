import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { codigoCoincide, generarCodigo, hashCodigo, limitesEnvio } from "../lib/auth/codigo";
import {
  DIGITOS_CODIGO,
  escribirEnCasilla,
  limpiarCodigo,
  repartirDigitos,
} from "../lib/auth/codigo-compartido";
import { correoCodigo } from "../lib/email/correo-codigo";
import { escaparHtml } from "../lib/email/plantilla";

const SECRETO = "secreto-de-prueba-con-mas-de-32-caracteres";

beforeAll(() => {
  process.env.SESSION_SECRET = SECRETO;
});

afterEach(() => {
  process.env.SESSION_SECRET = SECRETO;
  vi.restoreAllMocks();
});

describe("generarCodigo", () => {
  it("siempre 6 dígitos, con ceros a la izquierda", () => {
    const codigos = Array.from({ length: 2000 }, generarCodigo);
    for (const c of codigos) expect(c).toMatch(/^\d{6}$/);
    // Con 2000 muestras de un millón, casi todas distintas.
    expect(new Set(codigos).size).toBeGreaterThan(1990);
  });
});

describe("hashCodigo / codigoCoincide", () => {
  it("coincide solo con el mismo código del mismo estudiante", () => {
    const hash = hashCodigo(7, "048213");
    expect(codigoCoincide(7, "048213", hash)).toBe(true);
    expect(codigoCoincide(7, "048214", hash)).toBe(false);
    expect(codigoCoincide(8, "048213", hash)).toBe(false);
  });

  it("no guarda el código: el hash no lo contiene y depende del secreto", () => {
    const hash = hashCodigo(7, "048213");
    expect(hash).not.toContain("048213");
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/); // SHA-256 en base64url
    process.env.SESSION_SECRET = "otro-secreto-de-prueba-con-mas-de-32-car";
    expect(hashCodigo(7, "048213")).not.toBe(hash);
  });

  it("un hash con otra longitud no lanza (timingSafeEqual exige igual tamaño)", () => {
    expect(codigoCoincide(7, "048213", "corto")).toBe(false);
  });

  it("sin SESSION_SECRET falla en vez de firmar con algo débil", () => {
    process.env.SESSION_SECRET = "";
    expect(() => hashCodigo(7, "048213")).toThrow(/SESSION_SECRET/);
  });
});

describe("limitesEnvio (variables de entorno)", () => {
  it("valores por defecto: 3 por correo y 30 por IP cada 15 min", () => {
    expect(limitesEnvio({})).toEqual({ porCorreo: 3, porIp: 30, ventanaMin: 15 });
  });

  it("lee las variables", () => {
    expect(
      limitesEnvio({ OTP_MAX_ENVIOS_POR_CORREO: "5", OTP_MAX_ENVIOS_POR_IP: " 60 ", OTP_VENTANA_ENVIOS_MIN: "30" }),
    ).toEqual({ porCorreo: 5, porIp: 60, ventanaMin: 30 });
  });

  it("un valor inválido usa el de por defecto y avisa", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(limitesEnvio({ OTP_MAX_ENVIOS_POR_CORREO: "0", OTP_MAX_ENVIOS_POR_IP: "muchos" })).toEqual({
      porCorreo: 3,
      porIp: 30,
      ventanaMin: 15,
    });
    expect(aviso).toHaveBeenCalledTimes(2);
  });
});

describe("casillas del código", () => {
  const vacias = Array<string>(DIGITOS_CODIGO).fill("");

  it("limpia lo pegado", () => {
    expect(limpiarCodigo(" 123 456 ")).toBe("123456");
    expect(limpiarCodigo("123-456")).toBe("123456");
    expect(limpiarCodigo("Tu código: 048213.")).toBe("048213");
  });

  it("escribir un dígito lo pone en su casilla y pasa a la siguiente", () => {
    expect(repartirDigitos(vacias, 2, "7")).toEqual({ digitos: ["", "", "7", "", "", ""], foco: 3 });
  });

  it("en la última casilla el foco se queda ahí", () => {
    expect(repartirDigitos(vacias, 5, "7").foco).toBe(5);
  });

  it("pegar el código completo en cualquier casilla llena las 6", () => {
    const r = repartirDigitos(vacias, 3, "123 456");
    expect(r.digitos.join("")).toBe("123456");
    expect(r.foco).toBe(5);
  });

  it("pegar unos pocos dígitos los reparte desde la casilla actual", () => {
    expect(repartirDigitos(vacias, 1, "98")).toEqual({ digitos: ["", "9", "8", "", "", ""], foco: 3 });
    // Lo que no cabe se descarta.
    expect(repartirDigitos(vacias, 4, "987").digitos).toEqual(["", "", "", "", "9", "8"]);
  });

  it("borrar deja la casilla vacía y el foco en ella", () => {
    const llenas = ["1", "2", "3", "4", "5", "6"];
    expect(repartirDigitos(llenas, 2, "")).toEqual({ digitos: ["1", "2", "", "4", "5", "6"], foco: 2 });
  });

  it("ignora letras", () => {
    expect(repartirDigitos(vacias, 0, "a")).toEqual({ digitos: vacias, foco: 0 });
  });

  it("escribir sobre una casilla llena: gana el dígito nuevo", () => {
    const actual = ["3", "", "", "", "", ""];
    expect(escribirEnCasilla(actual, 0, "37").digitos[0]).toBe("7");
    expect(escribirEnCasilla(actual, 0, "73").digitos[0]).toBe("7");
    expect(escribirEnCasilla(actual, 0, "33").digitos[0]).toBe("3");
    // Autollenado del celular (one-time-code) en la primera casilla.
    expect(escribirEnCasilla(vacias, 0, "048213").digitos.join("")).toBe("048213");
  });
});

describe("correo del código", () => {
  it("asunto con el código, para verlo en la notificación", () => {
    expect(correoCodigo("048213").asunto).toBe("048213 es tu código de Speak Easy");
  });

  it("HTML con logo, código, vigencia y saludo sin nombre (no está en la BD)", () => {
    const { html } = correoCodigo("048213");
    expect(html).toContain('src="cid:logo-speak-easy"');
    expect(html).toContain(">048213<");
    expect(html).toContain("10 minutos");
    expect(html).toContain(">Hola,</p>");
  });

  it("versión de texto con el código", () => {
    expect(correoCodigo("048213").texto).toMatch(/^\s+048213$/m);
  });

  it("escaparHtml", () => {
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
