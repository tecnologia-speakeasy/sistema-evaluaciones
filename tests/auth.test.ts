import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  HASH_RELLENO,
  hashPassword,
  verifyPassword,
} from "../lib/auth/password";
import {
  DURACION_SESION,
  firmarSesion,
  verificarSesion,
} from "../lib/auth/token";
import { schemaFromUrl } from "../lib/db";
import { destinoSeguro } from "../lib/auth/destino";
import { otpActivo } from "../lib/auth/codigo";
import { nombreSchema } from "../lib/validacion";

beforeAll(() => {
  process.env.SESSION_SECRET = "secreto-de-prueba-con-mas-de-32-caracteres";
});

describe("password", () => {
  it("verifica la contraseña correcta y rechaza la incorrecta", async () => {
    const hash = await hashPassword("una-clave-larga-123");
    expect(hash).toMatch(/^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword("una-clave-larga-123", hash)).toBe(true);
    expect(await verifyPassword("una-clave-larga-124", hash)).toBe(false);
  });

  it("usa una sal distinta en cada hash", async () => {
    const a = await hashPassword("misma-clave");
    const b = await hashPassword("misma-clave");
    expect(a).not.toBe(b);
    expect(a.split("$")[1]).toHaveLength(24); // 16 bytes en base64
  });

  it("rechaza hashes con formato inválido sin lanzar error", async () => {
    for (const malo of ["", "bcrypt$a$b", "scrypt$$", "scrypt$abc", "texto"]) {
      expect(await verifyPassword("x", malo)).toBe(false);
    }
  });

  it("el hash de relleno no coincide con ninguna contraseña", async () => {
    expect(await verifyPassword("", HASH_RELLENO)).toBe(false);
    expect(await verifyPassword("cualquier-cosa", HASH_RELLENO)).toBe(false);
  });
});

describe("token de sesión", () => {
  const ahora = Date.UTC(2026, 9, 15, 12, 0, 0);

  it("ida y vuelta para estudiante y staff", () => {
    const est = firmarSesion({ tipo: "estudiante", id: 7, nombre: "Ana Pérez" }, ahora);
    expect(verificarSesion(est, ahora)).toEqual({ tipo: "estudiante", id: 7, nombre: "Ana Pérez" });

    const staff = firmarSesion({ tipo: "staff", id: 3, rol: "docente" }, ahora);
    expect(verificarSesion(staff, ahora)).toEqual({
      tipo: "staff",
      id: 3,
      rol: "docente",
    });
  });

  it("rechaza un payload alterado (p. ej. docente → admin)", () => {
    const token = firmarSesion({ tipo: "staff", id: 3, rol: "docente" }, ahora);
    const [, firma] = token.split(".");
    const exp = Math.floor(ahora / 1000) + DURACION_SESION.staff;
    const falso = Buffer.from(
      JSON.stringify({ tipo: "staff", id: 3, rol: "admin", exp }),
    ).toString("base64url");
    expect(verificarSesion(`${falso}.${firma}`, ahora)).toBeNull();
  });

  it("rechaza firmas hechas con otro secreto", () => {
    const token = firmarSesion({ tipo: "estudiante", id: 1, nombre: "Ana Pérez" }, ahora);
    process.env.SESSION_SECRET = "otro-secreto-distinto-de-mas-de-32-chars";
    try {
      expect(verificarSesion(token, ahora)).toBeNull();
    } finally {
      process.env.SESSION_SECRET = "secreto-de-prueba-con-mas-de-32-caracteres";
    }
  });

  it("expira a los 7 días (estudiante) y a las 12 h (staff)", () => {
    const est = firmarSesion({ tipo: "estudiante", id: 1, nombre: "Ana Pérez" }, ahora);
    const seisDias = ahora + 6 * 24 * 3600 * 1000;
    const sieteDias = ahora + 7 * 24 * 3600 * 1000;
    expect(verificarSesion(est, seisDias)).not.toBeNull();
    expect(verificarSesion(est, sieteDias)).toBeNull();

    const staff = firmarSesion({ tipo: "staff", id: 1, rol: "admin" }, ahora);
    const onceHoras = ahora + 11 * 3600 * 1000;
    const doceHoras = ahora + 12 * 3600 * 1000;
    expect(verificarSesion(staff, onceHoras)).not.toBeNull();
    expect(verificarSesion(staff, doceHoras)).toBeNull();
  });

  it("rechaza la sesión de estudiante sin nombre (cookies de antes de la 003)", () => {
    const exp = Math.floor(ahora / 1000) + DURACION_SESION.estudiante;
    const cuerpo = Buffer.from(JSON.stringify({ tipo: "estudiante", id: 7, exp })).toString("base64url");
    const firma = createHmac("sha256", "secreto-de-prueba-con-mas-de-32-caracteres")
      .update(cuerpo)
      .digest("base64url");
    expect(verificarSesion(`${cuerpo}.${firma}`, ahora)).toBeNull();
  });

  it("rechaza basura sin lanzar error", () => {
    for (const malo of ["", ".", "abc", "a.b.c", "%%%.###"]) {
      expect(verificarSesion(malo, ahora)).toBeNull();
    }
  });

  it("exige SESSION_SECRET de al menos 32 caracteres", () => {
    process.env.SESSION_SECRET = "corto";
    try {
      expect(() => firmarSesion({ tipo: "estudiante", id: 1, nombre: "Ana Pérez" }, ahora)).toThrow(
        /SESSION_SECRET/,
      );
    } finally {
      process.env.SESSION_SECRET = "secreto-de-prueba-con-mas-de-32-caracteres";
    }
  });
});

describe("destinoSeguro (?next= del login)", () => {
  it("respeta rutas internas del área correcta", () => {
    expect(destinoSeguro("/admin/evaluaciones/3?tab=p", "staff")).toBe(
      "/admin/evaluaciones/3?tab=p",
    );
    expect(destinoSeguro("/evaluacion/gen-2026-10-m01", "estudiante")).toBe(
      "/evaluacion/gen-2026-10-m01",
    );
  });

  it("manda a la ruta base si falta o es del otro tipo de usuario", () => {
    expect(destinoSeguro(null, "staff")).toBe("/admin");
    expect(destinoSeguro(null, "estudiante")).toBe("/");
    expect(destinoSeguro("/evaluacion/x", "staff")).toBe("/admin");
    expect(destinoSeguro("/admin", "estudiante")).toBe("/");
    expect(destinoSeguro("/administrador", "staff")).toBe("/admin");
  });

  it("nunca redirige a otro sitio", () => {
    for (const malo of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "evil.com/admin",
    ]) {
      expect(destinoSeguro(malo, "staff")).toBe("/admin");
      expect(destinoSeguro(malo, "estudiante")).toBe("/");
    }
  });
});

describe("schemaFromUrl", () => {
  it("lee ?schema= y usa public por defecto", () => {
    expect(schemaFromUrl("postgres://u:p@h/db?schema=evaluacion")).toBe(
      "evaluacion",
    );
    expect(schemaFromUrl("postgres://u:p@h/db?sslmode=require&schema=evaluacion")).toBe(
      "evaluacion",
    );
    expect(schemaFromUrl("postgres://u:p@h/db")).toBe("public");
  });

  it("rechaza nombres que podrían inyectar opciones en la conexión", () => {
    expect(() =>
      schemaFromUrl("postgres://u:p@h/db?schema=x%20-c%20role%3Dadmin"),
    ).toThrow(/schema inválido/);
  });
});

describe("nombre del estudiante (como en a2)", () => {
  it("se guarda tal cual lo escribe, sin espacios de sobra", () => {
    expect(nombreSchema.parse("  maría   GARCÍA lópez ")).toBe("maría GARCÍA lópez");
  });

  it("mínimo 2 caracteres y máximo 120", () => {
    expect(nombreSchema.safeParse(" a ").success).toBe(false);
    expect(nombreSchema.safeParse("Al").success).toBe(true);
    expect(nombreSchema.safeParse("x".repeat(121)).success).toBe(false);
    expect(nombreSchema.safeParse(undefined).error?.issues[0].message).toBe("Escribe tu nombre");
  });
});

describe("OTP_ACTIVO", () => {
  it("apagado por defecto: el estudiante entra con correo + nombre", () => {
    expect(otpActivo({})).toBe(false);
    expect(otpActivo({ OTP_ACTIVO: "false" })).toBe(false);
    expect(otpActivo({ OTP_ACTIVO: "" })).toBe(false);
    expect(otpActivo({ OTP_ACTIVO: "no" })).toBe(false);
  });

  it("se enciende con true / 1 / sí", () => {
    for (const v of ["true", "TRUE", " 1 ", "si", "sí"]) expect(otpActivo({ OTP_ACTIVO: v })).toBe(true);
  });
});
