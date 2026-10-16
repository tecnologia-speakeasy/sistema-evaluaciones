# sistema-evaluaciones · Speak Easy

Plataforma centralizada de evaluaciones de inglés. Reemplaza el modelo "un proyecto + un esquema por evaluación" (ver `../evaluacion-a2`, que queda congelado: NO modificarlo, solo usarlo como referencia).

## Contexto de negocio
- Cada **generación** (cohorte) tiene 16 evaluaciones: 12 mensuales + 4 trimestrales.
- **Estudiantes**: pertenecen a una sola generación. Estar en la tabla = estar autorizado. En la BD el estudiante es solo su **correo** (+ `manychat_id` opcional y `activo`): el **nombre lo escribe al entrar**, como en a2, viaja en la sesión y se guarda en cada intento (`intentos.nombre`); ese es el que se usa en pantallas, feedback de IA y correos. Se cargan por SQL/CSV (no hay registro público).
- **Staff**: `admin` (todo) y `docente` (evaluaciones, preguntas, resultados). Login con contraseña.
- Las evaluaciones A1/A2 viven en otro sistema; se migrarán después. No hay agendamiento ni speaking.

## Stack
- Next.js (App Router) + TypeScript + Tailwind.
- PostgreSQL con `pg`, schema **`evaluacion`** (ya creado). DDL de referencia: `db/001_schema.sql` + migraciones `db/0NN_*.sql` (ver "Migraciones pendientes en producción").
- `DATABASE_URL=...?schema=evaluacion`; aplicar `search_path` por conexión.
- Conexiones **efímeras** (abrir → query → cerrar), igual que `../evaluacion-a2/lib/db.js`: el Postgres es un VPS con pocas conexiones y las llamadas a OpenAI tardan 10–30 s.
- Despliegue en Vercel.
- Next 16 con `cacheComponents: true` (leer `node_modules/next/dist/docs/` antes de usar APIs de Next):
  - **No** exportar `runtime` en rutas ni páginas: Node ya es el default y Cache Components lo prohíbe (incluso `'nodejs'`).
  - Lo que lea cookies/sesión, `searchParams` o la BD en una página va dentro de `<Suspense>`.
  - `middleware.ts` se llama ahora **`proxy.ts`** (export `proxy`, corre en Node).

## Diseño visual (obligatorio, igual a ../evaluacion-a2)
Fuente de verdad: `../evaluacion-a2/app/components/EnglishExam.jsx` (estilos inline en objetos `styles` / `xs`) y `../evaluacion-a2/public/`. Antes de construir cualquier pantalla, leer ese archivo y replicar su look. Staff (admin/docente) usa EXACTAMENTE el mismo lenguaje visual que el estudiante; no inventar otro estilo de dashboard.
- Pasar los colores a tokens de Tailwind 4 (`@theme` en `globals.css`), no dejarlos sueltos:
  - rosa principal `#FF327D` (CTA, acentos), rosa hover `#E9407E`, rosa claro `#ff8ab9` / `#ffb8d1`
  - morado `#6D2EBF`, morado oscuro `#41276B` / `#3a1d6e`, lila `#b86bc4`
  - texto `#2b2240`, texto secundario `#6b6480` / `#9a93ad`, títulos muy oscuros `#1a0a2e`
  - superficies `#ffffff`, `#faf9fc`, `#f1ecfb`; bordes `#d8cfe8` / `#d9d2ea`
  - éxito `#16a34a` / `#22c55e`, error `#dc2626` / `#ef4444`
- Tipografía: **DM Sans** (300–700) con `next/font/google`.
- Fondo: `/FONDO.png` cover fijo sobre blanco, como en a2.
- Copiar a `public/` los assets de a2: `FONDO.png`, `logo.webp`, `logo_blanco.png`, `logo_login.png`, `Spiky Calificando.gif`, `calificando.mp4`, `COHETE.png`, `TROFEO.png`, `INSIGNIA.png`, `Felipe_test.png`, `calificaciones/*.png`.
  - Ya copiados y optimizados: el GIF de Spiky ahora es `spiky-calificando.webm` (VP9 con transparencia) + póster `spiky-calificando.png`; usarlo con `<video autoplay muted loop playsinline poster="/spiky-calificando.png">`. Safari no respeta el alfa de VP9: ahí mostrar solo el póster.
- Reutilizar la estructura de a2: pantalla de login con `logo_login.png`, hub/encabezado con `logo_blanco.png`, tarjetas, botones redondeados, pantalla de "calificando" con Spiky, resultado con trofeo/insignia por rango de puntaje (`calificaciones/<n>.png`).
- Componentes compartidos en `app/components/ui/` (Boton, Tarjeta, Campo, Insignia de estado, Encabezado) para que estudiante y staff se vean idénticos.
- Mobile first: los estudiantes entran sobre todo desde el celular.

## Modelo de datos (schema `evaluacion`)
`generaciones` · `estudiantes` · `staff` · `login_intentos` · `codigos_acceso` (002) · `evaluaciones` · `preguntas` · `intentos` · `respuestas`
- `estudiantes`: `email`, `manychat_id`, `activo` (sin nombre desde la 003).
- `evaluaciones` (003): `cierre_automatico` (al acabar el tiempo se envía sola; exige `duracion_min`) y `mostrar_correctas`.
- `intentos` (003): `nombre` (el que escribió al entrar), `respuestas_borrador` (autoguardado mientras responde), `limite_at` (hasta cuándo se aceptan respuestas, fijado al empezar). Índice único: un solo intento `en_progreso` por estudiante y evaluación.
- `respuestas`: solo respuestas **calificadas** (se crean al enviar). El borrador vive en el intento, así responder no bloquea editar la pregunta.

Funciones: `generar_evaluaciones(generacion_id, staff_id)`, `clonar_preguntas(origen, destino)`.
Vistas: `v_preguntas_publicas`, `v_evaluaciones_resumen`, `v_resultados`, `v_dificultad_preguntas`.
Triggers en BD (no duplicar en la app, solo traducir sus errores a mensajes amigables):
- `validar_pregunta`: forma de `opciones` / `respuestas_aceptadas` según el tipo.
- `validar_intento`: estudiante activo de la generación, evaluación publicada y en fecha, número de intento y límite.

### Tipos de pregunta
| tipo | opciones | respuestas_aceptadas | calificación |
|---|---|---|---|
| multiple_choice | `["were","was","is","be"]` | `["was"]` (1+ correctas) | exacta normalizada |
| fill_blank | NULL | `[["is going to","'s going to"], ...]` una lista de variantes por cada `___` | todos los espacios deben coincidir |
| translation | NULL | `["I was at home yesterday.", ...]` | coincide con alguna variante |
| open | NULL | NULL (usa `rubrica`) | IA 0–10 |

`categoria` (grammar | writing) alimenta `grammar_score` / `writing_score`. `puntaje_total` va de 0 a 100 = suma de puntajes obtenidos / suma de puntajes posibles × 100.

### Normalización de respuestas
Portar `normalize()` de `../evaluacion-a2/lib/exam.js` tal cual a `lib/grading/normalize.ts` (mayúsculas, tildes, apóstrofes, contracciones, puntuación, sinónimos mom/mother, etc.) y cubrirla con tests.

## Reglas de seguridad (obligatorias)
1. **Nunca** enviar `respuestas_aceptadas` ni `rubrica` al navegador del estudiante. El estudiante lee solo `v_preguntas_publicas`. Única excepción: con `mostrar_correctas`, en la revisión de un intento ya enviado (con su sesión, nunca en `/resultado/[token]`) se muestra la primera respuesta aceptada de las preguntas que falló, y solo cuando ya no le quedan intentos o la evaluación cerró. Antes de eso ve "Las respuestas correctas se mostrarán cuando termines tus intentos".
2. Calificar SIEMPRE en el servidor.
3. Contraseñas: `crypto.scrypt` con sal aleatoria de 16 bytes, formato `scrypt$<salt_b64>$<hash_b64>`, comparación con `timingSafeEqual`. Nunca registrar contraseñas en logs.
4. Login de staff: bloquear si hay ≥ 5 fallos del mismo email en 15 min (tabla `login_intentos`).
5. Sesión: cookie httpOnly, secure, sameSite=lax, firmada con HMAC (`SESSION_SECRET`), con `{ tipo: 'estudiante', id, nombre, exp }` | `{ tipo: 'staff', id, rol, exp }`. Duración: 7 días estudiante, 12 h staff. Código en `lib/auth/token.ts` + `lib/auth/session.ts`.
6. Autorización en cada route handler / server action (no solo en `proxy.ts`) con `requireStaff(roles?)` / `requireEstudiante()` de `lib/auth/guards.ts`, que re-leen la BD (activo, rol actual): docente no puede tocar generaciones, estudiantes ni staff.
7. Al editar una pregunta que ya tiene `respuestas`: solo permitir agregar variantes aceptadas; borrar = desactivar (`activa=false`). Recalificar intentos solo con acción explícita del staff.
8. Código de acceso del estudiante (solo con `OTP_ACTIVO=true`; `lib/auth/codigo.ts`, `lib/auth/acceso-estudiante.ts`): en la BD solo su HMAC-SHA256 (clave derivada de `SESSION_SECRET`), 6 dígitos con `crypto.randomInt`, 10 min, máx. 5 intentos, un solo uso y solo vale el último. Envíos limitados por correo y por IP (`OTP_*`, ver `.env.example`) y 60 s entre envíos. El código nunca va a los logs (solo en desarrollo sin SMTP).

## Flujo de login (un solo formulario)
`OTP_ACTIVO` (por defecto `false`, ver `.env.example`) decide cómo entra el estudiante. El código de la Fase 3 sigue en el proyecto; solo depende de la variable.
1. Usuario escribe su correo.
2. `POST /api/auth/identify` → `{ tipo: 'staff' }` | `{ tipo: 'estudiante', paso: 'nombre' }` | `{ tipo: 'no_autorizado' }`. Con OTP: `{ tipo: 'estudiante', paso: 'codigo_enviado', reenviarEn, nuevo }` | 429 `{ tipo: 'estudiante', paso: 'limite', reenviarEn, error }`.
3. Staff → aparece campo contraseña → `POST /api/auth/staff-login` → `/admin`.
4. Estudiante, `OTP_ACTIVO=false` (como a2): aparece **Nombre** → `POST /api/auth/estudiante-login { email, nombre }` crea la sesión → `/`. Sin código, sin correo, sin tocar `codigos_acceso`.
5. Estudiante, `OTP_ACTIVO=true`: identify le envía un código de 6 dígitos (`iniciarAccesoEstudiante()`, `lib/email/correo-codigo.ts`; en desarrollo sin SMTP, a la consola del servidor) → Nombre + 6 casillas en el mismo paso (pegar el código completo, autollenado del celular, "Reenviar código" tras 60 s, que vuelve a llamar a identify) → `POST /api/auth/verificar-codigo { email, nombre, codigo }` crea la sesión → `/`. Cada ruta rechaza si no corresponde al modo activo.
6. El nombre se recuerda en ese navegador (`localStorage`) para la próxima vez; se puede cambiar.

## Rutas previstas
- Estudiante: `/` (mis evaluaciones de su generación: estado, mejor puntaje, nº de intentos), `/evaluacion/[slug]` (intro + presentar), `/evaluacion/[slug]/intentos/[n]` (resultado del intento + "Tus intentos"), `/evaluacion/[slug]/intentos/[n]/respuestas` (revisión pregunta por pregunta), `/historial` (todos sus intentos de todas las evaluaciones: fecha, puntaje, grammar/writing, enlace al resultado, y evolución de puntajes en el tiempo), `/resultado/[token]` (público, solo resumen).
- API del examen: `POST /api/intentos` (iniciar o retomar), `PUT /api/intentos/[id]/borrador` (autoguardado), `POST /api/intentos/[id]/enviar` (calificar).
- Staff: `/admin` (resumen), `/admin/generaciones/[id]` (las 16 evaluaciones), `/admin/evaluaciones/[id]` (editar + preguntas), `/admin/resultados`, `/admin/estudiantes` y `/admin/staff` (solo admin).

## Reglas del examen del estudiante (Fase 4)
- **Intento**: empieza al tocar "Comenzar" (no en la intro). Recargar o abrir otra pestaña retoma el mismo intento `en_progreso` (índice único): no crea otro ni gasta otro.
- **Guardado automático**: las respuestas y el conteo de cambios de pestaña se guardan en `intentos.respuestas_borrador` mientras responde (y al salir de la pestaña / cerrar). Al retomar, vuelve con sus respuestas.
- **Temporizador** (solo si hay `duracion_min`), contado desde `started_at` con la hora del servidor:
  - `cierre_automatico = false`: solo informativo, como a2 (llega a 0, dice "Tiempo cumplido" y no pasa nada).
  - `cierre_automatico = true`: al llegar a 0 se envía sola.
- **Plazo en el servidor**: `limite_at` = el primero entre `started_at + duracion_min` (si `cierre_automatico`) y `fecha_cierre`. Se aceptan respuestas hasta `limite_at` + **2 min de gracia**; después se rechazan y, al enviar o al volver, se califica lo que quedó guardado. La fecha de cierre corta también los intentos en curso.
- **"Siguiente" bloqueado** hasta responder la pregunta actual, igual que a2.
- **Calificación** en el servidor al enviar (`lib/grading/`): selección múltiple, completar y traducción con `normalize()`. Las **abiertas** quedan pendientes (estado `pendiente`, sin puntaje final) hasta la IA de la Fase 5, con el aviso "Tu respuesta abierta la calificará la IA".
- **Resultado** (con sesión, `/evaluacion/[slug]/intentos/[n]`): insignia por rango como a2 (`lib/celebracion.ts`), puntaje, Grammar X/N y Writing X/N (aciertos), selector "Ver intento N" y revisión pregunta por pregunta (acertó/falló). Con `mostrar_correctas`, en las que falló se ve la correcta solo cuando ya no le quedan intentos o la evaluación cerró (ver regla de seguridad 1).
- **`/resultado/[token]`** (público, para el enlace de WhatsApp): solo resumen, como a2. Nunca el detalle por pregunta.
- **Calificando**: Spiky (también en celular) al menos 2,5 s.
- **Código**: datos y reglas en `lib/datos/intentos.ts`; calificación pura en `lib/grading/` (`normalize.ts` idéntica a a2, `calificar.ts`); reloj en `lib/intentos/reloj.ts`; pantalla en `app/evaluacion/[slug]/Examen.tsx` y piezas en `app/components/examen/` (antitrampa, autoguardado, calificando, confeti, anillo). Grammar/Writing = aciertos "X/N" (N cuenta solo preguntas ya calificadas).
- Next conserva ocultas las páginas visitadas: `<Examen>` lleva una `key` que cambia con los intentos, para que "Repetir evaluación" no reaparezca el examen anterior.

## Reutilizable de ../evaluacion-a2 (copiar y adaptar, no importar)
- `lib/exam.js` → normalize + lógica de calificación.
- `lib/openai.js` → feedback con IA (modelo `OPENAI_MODEL`, por defecto gpt-4.1-mini).
- `lib/email.ts` → ya portado a `lib/email/` (`enviar.ts` + `plantilla.ts` con el diseño de Speak Easy y el logo adjunto); falta el correo de resultado (Fase 5).
- `lib/manychat.ts` → WhatsApp con el resultado.
- `app/api/submit/route.js` → patrón: guardar primero (estado `pendiente`), luego IA, luego correo/WhatsApp; nunca perder respuestas.
- `app/components/EnglishExam.jsx` → UX del examen (antitrampa de cambio de pestaña, etc.). Hacerlo genérico: renderizar preguntas desde la BD según `tipo`.

## Fases
1. ✅ Hecha. Base: scaffold Next.js + TS + Tailwind, `lib/db.ts`, `lib/auth/*`, login unificado, `proxy.ts`, `scripts/crear-admin.ts`.
2. ✅ Hecha. Dashboard staff: generaciones, evaluaciones (generar 16, publicar/despublicar, fechas), CRUD de preguntas con formulario por tipo, reordenar, clonar.
3. ✅ Hecha. OTP por correo para estudiantes (código de 6 dígitos, 10 min de validez, máx. 5 intentos, límites de envío por correo e IP), `lib/email/`, migración `db/002_otp.sql`.
4. ✅ Hecha. Vista estudiante: lista de evaluaciones, presentar (autoguardado, retomar, cierre automático opcional), envío y calificación en el servidor, resultado con insignia, revisión, **historial de puntajes de todos sus intentos** (`/historial` + selector "Ver intento N" como en a2) y `/resultado/[token]`. Las abiertas quedan pendientes hasta la Fase 5.
5. IA + correo + WhatsApp, reintentos de feedback pendiente. La IA califica las abiertas de los intentos en estado `pendiente` (`respuestas.es_correcta` NULL) y entonces se calcula `puntaje_total` y el intento pasa a `listo`.
6. Admin: estudiantes (import CSV: solo correo y `manychat_id` opcional; sin nombre), staff, resultados y exportar CSV.

## Migraciones pendientes en producción
Se ejecutan a mano en el VPS, en orden, **antes** de desplegar el código que las usa; al ejecutarlas, marcarlas aquí. Cada archivo fija su propio `search_path`.
- [ ] `db/002_otp.sql` (Fase 3): tabla `codigos_acceso`. Sin ella el login de estudiantes falla. Ejecutar: `psql "<DATABASE_URL sin ?schema=evaluacion>" -f db/002_otp.sql` (psql no acepta el parámetro `schema`). Comprobar: `SELECT to_regclass('evaluacion.codigos_acceso');` (no debe dar NULL).
  - Con `OTP_ACTIVO=false` (por defecto) el login no la usa, pero se ejecuta igual para que la base quede completa.
  - Si se activa el OTP, en Vercel además: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (contraseña de aplicación) y `MAIL_FROM`. En producción sin SMTP el estudiante ve "No pudimos enviarte el código". `OTP_*` son opcionales (valores por defecto en `.env.example`).
- [ ] `db/003_ajustes.sql` (antes de la Fase 4): quita `estudiantes.nombre` (lo pasa a `intentos.nombre` en los intentos que existan), recrea `v_resultados`, agrega `evaluaciones.cierre_automatico` / `mostrar_correctas` e `intentos.respuestas_borrador` / `limite_at` y el índice de un intento en curso. Va en una transacción. Después de ejecutarla, las sesiones de estudiante anteriores dejan de valer (no traen nombre) y deben volver a entrar. Comprobar: `SELECT column_name FROM information_schema.columns WHERE table_schema = 'evaluacion' AND table_name = 'intentos' AND column_name IN ('nombre', 'respuestas_borrador', 'limite_at');` (3 filas).

## Convenciones
- Zona horaria del negocio: **America/Bogota** (fechas de apertura/cierre se escriben y muestran en esa zona; Vercel corre en UTC).
- Código y comentarios en español donde sea texto de negocio; nombres de BD en español como están.
- Validación de entrada con `zod`.
- Antes de acciones masivas (importar CSV, recalificar, borrar), mostrar resumen y pedir confirmación.
- Nunca leer ni imprimir `.env`.
