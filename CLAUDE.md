# sistema-evaluaciones · Speak Easy

Plataforma centralizada de evaluaciones de inglés. Reemplaza el modelo "un proyecto + un esquema por evaluación" (ver `../evaluacion-a2`, que queda congelado: NO modificarlo, solo usarlo como referencia).

## Contexto de negocio
- Cada **generación** (cohorte) tiene 18 evaluaciones: 1 de bienvenida + 12 mensuales + 4 trimestrales + 1 final. La de bienvenida y la final funcionan igual que las demás (preguntas, puntaje, IA y correo); la de bienvenida va primero (código «B») y la final de última (código «F»); las otras son M1…M12 y T1…T4 (`codigoEvaluacion()` en `lib/tipos.ts`).
- **Estudiantes**: pertenecen a una sola generación. Estar en la tabla = estar autorizado. En la BD el estudiante es solo su **correo** (+ `activo`): el **nombre lo escribe al entrar**, como en a2, viaja en la sesión y se guarda en cada intento (`intentos.nombre`); ese es el que se usa en pantallas, feedback de IA y correos. El admin los agrega uno a uno o por CSV (no hay registro público).
- **Staff**: `admin` (todo) y `docente` (evaluaciones, preguntas, resultados). Login con contraseña.
- Las evaluaciones A1/A2 de la Generación 1 ya se migraron aquí (T1 y T2 de `gen-2026-03`; ver «Migración de las evaluaciones A1 y A2»). No hay agendamiento ni speaking (el speaking de la A1 quedó solo en `agendamiento.speaking_scores`).

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
`generaciones` · `estudiantes` · `staff` · `login_intentos` · `codigos_acceso` (002) · `evaluaciones` · `materiales` (009) · `preguntas` · `intentos` · `respuestas`
- `estudiantes`: `email`, `activo` (sin nombre desde la 003; sin `manychat_id` desde la 006).
- `evaluaciones` (003): `cierre_automatico` (al acabar el tiempo se envía sola; exige `duracion_min`) y `mostrar_correctas`.
- `intentos` (003): `nombre` (el que escribió al entrar), `respuestas_borrador` (autoguardado mientras responde), `limite_at` (hasta cuándo se aceptan respuestas, fijado al empezar). Índice único: un solo intento `en_progreso` por estudiante y evaluación.
- `respuestas`: solo respuestas **calificadas** (se crean al enviar). El borrador vive en el intento, así responder no bloquea editar la pregunta. En las abiertas, `feedback` guarda el comentario de la IA.
- `intentos` (004): `procesando_hasta` (candado con vencimiento de quien llama a la IA), `ia_intentos` / `ia_error` (fallos de la IA) y `envio_error` (último fallo del correo). La 004 también creó `whatsapp_enviado`; la 006 lo quita.
- Estados del intento: `en_progreso` → (enviar) `pendiente` → `calificando` (candado tomado) → `listo`. Si la IA falla vuelve a `pendiente`; al 3.er fallo, `error`. Ver "IA y correo".
- `staff` (005): `debe_cambiar_password` (entró con contraseña temporal) y `sesion_version` (viaja en la cookie; restablecer o cambiar la contraseña la incrementa y cierra las sesiones anteriores).
- `generaciones.activa`: desactivada = sus estudiantes entran y ven su historial, pero no ven evaluaciones ni empiezan o continúan intentos (ver "Administración").
- `preguntas` (009 y 010): `material_id` (lectura o audio, ver abajo) y `subseccion` (rótulo opcional dentro de la sección, solo con sección).
- `preguntas.categoria` (011): `grammar` | `writing` | `reading` | `listening`; `intentos` (011): `reading_score` / `listening_score`, como `grammar_score` / `writing_score` (NULL en los intentos de antes que no tenían esas preguntas).

Funciones: `generar_evaluaciones(generacion_id, staff_id)` (las 18 desde la 008; idempotente), `clonar_preguntas(origen, destino)`.
Vistas: `v_preguntas_publicas`, `v_evaluaciones_resumen`, `v_resultados`, `v_dificultad_preguntas`.
Triggers en BD (no duplicar en la app, solo traducir sus errores a mensajes amigables):
- `validar_pregunta`: forma de `opciones` / `respuestas_aceptadas` según el tipo.
- `validar_intento`: estudiante activo de la generación, generación activa (005), evaluación publicada y en fecha, número de intento y límite.
- `validar_material_pregunta` (009): la lectura o el audio de una pregunta es de su misma evaluación.

### Tipos de pregunta
| tipo | opciones | respuestas_aceptadas | calificación |
|---|---|---|---|
| multiple_choice | `["were","was","is","be"]` | `["was"]` (1+ correctas) | exacta normalizada |
| fill_blank | NULL | `[["is going to","'s going to"], ...]` una lista de variantes por cada `___` | todos los espacios deben coincidir |
| translation | NULL | `["I was at home yesterday.", ...]` | coincide con alguna variante |
| open | NULL | NULL (usa `rubrica`) | IA 0–10 (**apagada por defecto**, ver abajo) |

**Preguntas abiertas: desactivadas.** No existían en a2 y por ahora no se usan. `PREGUNTAS_ABIERTAS_ACTIVAS` (por defecto `false`; `lib/preguntas/abiertas.ts`) las enciende sin tocar código. Apagadas:
- El editor no ofrece el tipo "Abierta". El servidor (`lib/datos/preguntas.ts`) rechaza crear una, cambiar otra a abierta y duplicarla; clonar una evaluación no copia sus abiertas.
- Las que ya existan en la BD se quedan (en el editor dicen "No la ven los estudiantes"), pero el estudiante no las ve ni cuentan en el puntaje (filtro `sqlSinAbiertas()` al presentar, al calificar y en la vista previa).
- Nunca se llama a calificar abiertas: **una sola llamada a OpenAI por intento** (el feedback general), como a2. Si un intento trae una abierta sin nota de antes de apagarlas, no se califica ni cuenta.

`categoria` (grammar | writing | reading | listening, `CATEGORIAS` en `lib/preguntas/tipos.ts`) alimenta `grammar_score` / `writing_score` / `reading_score` / `listening_score` (aciertos). El editor propone Grammar para selección múltiple, Writing para lo que se escribe y, si la pregunta va con una lectura o un audio, Reading o Listening (`categoriaSugerida`); el staff la puede cambiar. `puntaje_total` va de 0 a 100 (`resumirIntento()` en `lib/grading/calificar.ts`, que usan tanto el envío como la IA).

**Pesos por pregunta: desactivados.** Por ahora todas las preguntas valen lo mismo: 100 ÷ número de preguntas (10 preguntas = 10 puntos cada una). `PESOS_POR_PREGUNTA` (por defecto `false`; `lib/preguntas/pesos.ts`) los vuelve a encender sin tocar código. Apagados:
- El editor (aquí y en el portal) no pide el puntaje ni lo muestra en cada pregunta; arriba dice cuánto vale cada una. El `puntaje` se sigue guardando (10 si es nueva, o el que ya tenía) para cuando se enciendan.
- Cada pregunta aporta la parte que obtuvo de su propio puntaje (1 o 0; una abierta, nota/10) y el total es el promedio × 100. Por eso da lo mismo con qué puntaje se guardó una respuesta, también las de antes (p. ej. al "Reintentar IA" un intento viejo).
- Encendidos: suma de puntajes obtenidos / suma de puntajes posibles × 100. Con todas las preguntas en 10 (la T1 y la T2 migradas, por ejemplo) los dos modos dan lo mismo.

### Lecturas y audios (reading / listening, 009)
Como las «Reading» y «Recording» del Placement Test: un texto o una grabación con varias preguntas. No es un tipo de pregunta nuevo: cualquier pregunta (en la práctica, selección múltiple) se liga opcionalmente a un **material** de su evaluación (`preguntas.material_id`).
- `materiales`: `tipo` (`lectura` | `audio`), `titulo` («Reading 1 – A Typical Day»), `texto` (la lectura; en el audio, una indicación opcional) y `audio_url` (URL pública del archivo). Esquema en `lib/preguntas/materiales.ts`; datos en `lib/datos/materiales.ts`; acciones en `app/admin/acciones/materiales.ts`.
- **Editor** (`/admin/evaluaciones/[id]`): sección «Lecturas y audios» encima de las preguntas (`Materiales.tsx`, `FormMaterial.tsx`) y en cada pregunta el campo «Lectura o audio» (la nueva pregunta propone el material de la última). La lista muestra a qué material va cada pregunta.
- **Audio**: se sube a Vercel Blob desde el navegador (`@vercel/blob/client`, ruta `app/api/admin/audios`, solo staff; mp3, m4a, wav, ogg, webm, aac hasta 50 MB) o se pega el enlace de un archivo ya publicado. Sin `BLOB_READ_WRITE_TOKEN` solo se puede pegar el enlace. Borrar el material no borra el archivo del Blob.
- **Examen, vista previa y revisión**: la lectura o el reproductor van encima del enunciado de cada pregunta ligada, con la instrucción «Read the text…» / «Listen to the recording…». El reproductor **no se reinicia** al pasar entre preguntas del mismo audio (`MaterialEstudiante` lleva `key` = id del material y `PreguntaEstudiante` ya no lleva `key`). Sin límite de reproducciones. En la revisión el material va plegado.
- **Reglas**: eliminar un material deja sus preguntas sin él, salvo que alguna ya tenga respuestas (entonces no se deja; sí se puede corregir el texto o el audio). Clonar una evaluación copia los materiales que usan sus preguntas activas y liga las copias. Al estudiante solo le llegan los materiales de sus preguntas (`materialesDe`).
- El portal (`inventario-speakeasy`) tiene lo mismo (`lib/evaluaciones-gestion/materiales.ts`, `components/evaluaciones-gestion/materiales.tsx`, ruta de subida `app/api/club-conversacional/gestion-evaluaciones/audios`).

### Subsecciones (Section A, B…, 010)
Dentro de una sección (la «Part»), una pregunta puede llevar una **subsección** opcional, como la Part 1 del Placement Test (Section A–D). Es solo un rótulo (`preguntas.subseccion`):
- El estudiante la ve como una etiqueta debajo del título de la sección (examen, vista previa y revisión). La numeración y los pasos siguen siendo los de la sección: en el Placement Test, del 1 al 60 seguidos.
- En el editor, el campo «Subsección» ofrece las ya usadas en esa sección o una nueva («+ Nueva subsección…», con `SelectorSeccion`); una pregunta nueva propone la de la última. Sin sección queda deshabilitado y, al cambiar de sección, se limpia. La BD exige sección (`preguntas_subseccion_check`).
- Duplicar y clonar la copian. El portal tiene lo mismo.

### Normalización de respuestas
Portar `normalize()` de `../evaluacion-a2/lib/exam.js` tal cual a `lib/grading/normalize.ts` (mayúsculas, tildes, apóstrofes, contracciones, puntuación, sinónimos mom/mother, etc.) y cubrirla con tests.

## Reglas de seguridad (obligatorias)
1. **Nunca** enviar `respuestas_aceptadas` ni `rubrica` al navegador del estudiante. El estudiante lee solo `v_preguntas_publicas`. Única excepción: con `mostrar_correctas`, en la revisión de un intento ya enviado (con su sesión, nunca en `/resultado/[token]`) se muestra la primera respuesta aceptada de las preguntas que falló, y solo cuando ya no le quedan intentos o la evaluación cerró. Antes de eso ve "Las respuestas correctas se mostrarán cuando termines tus intentos".
2. Calificar SIEMPRE en el servidor.
3. Contraseñas: `crypto.scrypt` con sal aleatoria de 16 bytes, formato `scrypt$<salt_b64>$<hash_b64>`, comparación con `timingSafeEqual`. Nunca registrar contraseñas en logs.
4. Login de staff: bloquear si hay ≥ 5 fallos del mismo email en 15 min (tabla `login_intentos`).
5. Sesión: cookie httpOnly, secure, sameSite=lax, firmada con HMAC (`SESSION_SECRET`), con `{ tipo: 'estudiante', id, nombre, exp }` | `{ tipo: 'staff', id, rol, v, exp }` (`v` = `staff.sesion_version`; las cookies sin `v` valen como 0). Duración: 7 días estudiante, 12 h staff. Código en `lib/auth/token.ts` + `lib/auth/session.ts`.
6. Autorización en cada route handler / server action (no solo en `proxy.ts`) con `requireStaff(roles?)` / `requireEstudiante()` de `lib/auth/guards.ts`, que re-leen la BD (activo, rol actual y, en el staff, que `sesion_version` siga siendo la de la cookie): docente no puede tocar generaciones, estudiantes ni staff. Con `debe_cambiar_password`, las páginas llevan a `/admin/cuenta/contrasena` y las acciones se rechazan (salvo cambiar la contraseña: `permitirPasswordTemporal`).
7. Al editar una pregunta que ya tiene `respuestas`: solo permitir agregar variantes aceptadas; borrar = desactivar (`activa=false`). Recalificar intentos solo con acción explícita del staff.
8. Código de acceso del estudiante (solo con `OTP_ACTIVO=true`; `lib/auth/codigo.ts`, `lib/auth/acceso-estudiante.ts`): en la BD solo su HMAC-SHA256 (clave derivada de `SESSION_SECRET`), 6 dígitos con `crypto.randomInt`, 10 min, máx. 5 intentos, un solo uso y solo vale el último. Envíos limitados por correo y por IP (`OTP_*`, ver `.env.example`) y 60 s entre envíos. El código nunca va a los logs (solo en desarrollo sin SMTP).
9. Staff (`lib/datos/staff.ts`): contraseña temporal generada (16 caracteres, `generarPasswordTemporal()`), se muestra una sola vez y obliga a cambiarla al entrar. Restablecerla incrementa `sesion_version` (cierra sus sesiones). Nadie se quita el rol, se desactiva ni se restablece la contraseña a sí mismo, y siempre queda al menos un admin activo: se revisa en una transacción que bloquea a los admins activos (dos admins a la vez no dejan cero). "Cambiar mi contraseña" pide la actual y sus fallos cuentan en `login_intentos`.

## Flujo de login (un solo formulario)
`OTP_ACTIVO` (por defecto `false`, ver `.env.example`) decide cómo entra el estudiante. El código de la Fase 3 sigue en el proyecto; solo depende de la variable.
1. Usuario escribe su correo.
2. `POST /api/auth/identify` → `{ tipo: 'staff' }` | `{ tipo: 'estudiante', paso: 'nombre' }` | `{ tipo: 'no_autorizado' }`. Con OTP: `{ tipo: 'estudiante', paso: 'codigo_enviado', reenviarEn, nuevo }` | 429 `{ tipo: 'estudiante', paso: 'limite', reenviarEn, error }`.
3. Staff → aparece campo contraseña → `POST /api/auth/staff-login` → `/admin`.
4. Estudiante, `OTP_ACTIVO=false` (como a2): aparece **Nombre** → `POST /api/auth/estudiante-login { email, nombre }` crea la sesión → `/`. Sin código, sin correo, sin tocar `codigos_acceso`.
5. Estudiante, `OTP_ACTIVO=true`: identify le envía un código de 6 dígitos (`iniciarAccesoEstudiante()`, `lib/email/correo-codigo.ts`; en desarrollo sin SMTP, a la consola del servidor) → Nombre + 6 casillas en el mismo paso (pegar el código completo, autollenado del celular, "Reenviar código" tras 60 s, que vuelve a llamar a identify) → `POST /api/auth/verificar-codigo { email, nombre, codigo }` crea la sesión → `/`. Cada ruta rechaza si no corresponde al modo activo.
6. El nombre se recuerda en ese navegador (`localStorage`) para la próxima vez; se puede cambiar.

## Rutas previstas
- Estudiante: `/` (mis evaluaciones de su generación: estado, mejor puntaje, nº de intentos; y "Mi historial"), `/evaluacion/[slug]` (intro + presentar), `/evaluacion/[slug]/intentos/[n]` (resultado del intento + "Tus intentos"), `/evaluacion/[slug]/intentos/[n]/respuestas` (revisión pregunta por pregunta), `/resultado/[token]` (público, solo resumen).
- **Generaciones en mantenimiento** (`lib/mantenimiento.ts`; hoy `gen-2026-03`): su inicio solo muestra el saludo y a Spiky (`public/spiky-mantenimiento.png`) con «Estamos trabajando para brindarte una mejor experiencia», sin evaluaciones ni "Mi historial", aunque tengan evaluaciones publicadas. Para quitarlo, sacar el código de la lista.
- **"Mi historial"** es un pop-up del inicio (`app/components/historial/`), no una página (`/historial` redirige a `/`): la tarjeta «Evolución» de la antigua página, sin la lista de intentos (promedio y mejor de esos puntajes arriba), con una gráfica de las 18 evaluaciones en el orden del curso (B, M1–M3, A1, M4–M6, A2, M7–M9, B1, M10–M12, B2, F: cada trimestral lleva su nivel, T1 = A1 … T4 = B2) y su **mejor puntaje** en cada una (`mejoresPorEvaluacion` en `lib/datos/intentos.ts`).
- API del examen: `POST /api/intentos` (iniciar o retomar), `PUT /api/intentos/[id]/borrador` (autoguardado), `POST /api/intentos/[id]/enviar` (calificar), `GET /api/intentos/[id]/estado` (la pantalla espera a la IA).
- Reproceso: `GET /api/cron/procesar` (opcional y **sin programar**, ver "IA y correo").
- Staff: `/admin` (resumen), `/admin/generaciones/[id]` (las 18 evaluaciones: bienvenida, mensuales, trimestrales y final; el admin la edita, la activa/desactiva y la elimina), `/admin/evaluaciones/[id]` (editar + preguntas), `/admin/resultados` (+ `/admin/resultados/exportar`, CSV de lo filtrado), `/admin/estudiantes` y `/admin/staff` (solo admin), `/admin/cuenta/contrasena` (cambio obligatorio de la temporal y "Cambiar mi contraseña" del menú del avatar).

## Reglas del examen del estudiante (Fase 4)
- **Intento**: empieza al tocar "Comenzar" (no en la intro). Recargar o abrir otra pestaña retoma el mismo intento `en_progreso` (índice único): no crea otro ni gasta otro.
- **Guardado automático**: las respuestas y el conteo de cambios de pestaña se guardan en `intentos.respuestas_borrador` mientras responde (y al salir de la pestaña / cerrar). Al retomar, vuelve con sus respuestas.
- **Temporizador** (solo si hay `duracion_min`), contado desde `started_at` con la hora del servidor:
  - `cierre_automatico = false`: solo informativo, como a2 (llega a 0, dice "Tiempo cumplido" y no pasa nada).
  - `cierre_automatico = true`: al llegar a 0 se envía sola.
- **Plazo en el servidor**: `limite_at` = el primero entre `started_at + duracion_min` (si `cierre_automatico`) y `fecha_cierre`. Se aceptan respuestas hasta `limite_at` + **2 min de gracia**; después se rechazan y, al enviar o al volver, se califica lo que quedó guardado. La fecha de cierre corta también los intentos en curso.
- **"Siguiente" bloqueado** hasta responder la pregunta actual, igual que a2.
- **Calificación** en el servidor al enviar (`lib/grading/`): selección múltiple, completar y traducción con `normalize()`. El intento queda `pendiente` y la IA escribe el feedback (y califica las **abiertas**, solo si están encendidas; ver "IA y correo").
- **Resultado** (con sesión, `/evaluacion/[slug]/intentos/[n]`): insignia por rango como a2 (`lib/celebracion.ts`), puntaje, Grammar, Writing, Reading y Listening X/N (aciertos; solo las categorías que tiene la evaluación), "Revisa tu feedback" (como a2), selector "Ver intento N" y "Ver mis respuestas".
- **Revisión** (`/evaluacion/[slug]/intentos/[n]/respuestas`, como en a2): la MISMA pantalla del examen, de solo lectura y marcada (barra, una pregunta a la vez, pasos de la sección y Anterior / Siguiente; se puede ir a cualquiera). Lo del estudiante en verde si acertó o en rojo si no ("Tu respuesta"); en las abiertas, "Nota de la IA: X/10" y su comentario. Arriba, como en a2: "Ver calificación", "Repetir evaluación" (si puede) y "Cerrar"; en celular los dos primeros van debajo de la pregunta. Con `mostrar_correctas`, en las que falló se ve la correcta solo cuando ya no le quedan intentos o la evaluación cerró (ver regla de seguridad 1).
- **`/resultado/[token]`** (público: el enlace que copia el estudiante en su resultado y "Ver ↗" de Resultados): solo resumen, como a2. Nunca el detalle por pregunta.
- **Calificando**: Spiky (también en celular) al menos 2,5 s.
- **Código**: datos y reglas en `lib/datos/intentos.ts`; calificación pura en `lib/grading/` (`normalize.ts` idéntica a a2, `calificar.ts`); reloj en `lib/intentos/reloj.ts`; pantalla en `app/evaluacion/[slug]/Examen.tsx` y piezas en `app/components/examen/` (antitrampa, autoguardado, calificando, confeti, anillo, `BarraProgreso` y `PasosSeccion`, compartidas con la revisión). La pregunta: `PreguntaEstudiante` (examen y vista previa) y `PreguntaRevision` (revisión), con el mismo `EncabezadoPregunta`. Grammar/Writing/Reading/Listening = aciertos "X/N" (N cuenta solo preguntas ya calificadas, `SQL_TOTALES_POR_CATEGORIA`).
- Next conserva ocultas las páginas visitadas: `<Examen>` lleva una `key` que cambia con los intentos, para que "Repetir evaluación" no reaparezca el examen anterior.

## IA y correo (Fase 5)
Patrón de a2 (`app/api/submit` + `app/api/feedback`): guardar primero, luego IA, luego correo; nunca perder respuestas.
- **Flujo**: `POST /api/intentos/[id]/enviar` califica lo automático, guarda (`pendiente`) y responde. Después, con `after()` y fuera de cualquier transacción, `procesarIntento()` (`lib/ia/procesar.ts`):
  1. Toma el candado: `calificando`, `procesando_hasta` = ahora + 6 min. Dos procesos a la vez: el segundo ve "ocupado" y no llama a la IA.
  2. Solo con `PREGUNTAS_ABIERTAS_ACTIVAS=true`: califica las abiertas con su `rubrica`, todas en una llamada, y guarda notas y puntaje recalculado en una transacción corta. Las que ya tienen nota no se vuelven a pagar. Apagadas (por defecto) este paso no existe.
  3. Escribe el feedback general (prompt de a2 sin el párrafo de "gracias por intentarlo"; saluda con el primer nombre de `intentos.nombre`). Con las abiertas apagadas es la **única** llamada a OpenAI del intento. En la bienvenida con la forma del Placement Test, en su lugar, el feedback con el nivel (ver «English Placement Test»).
  4. Pasa a `listo` y llama a `notificarIntento()`: el correo.
- **Abiertas** (si se encienden): nota 0–10 de la IA → puntaje = nota/10 × `preguntas.puntaje`. Cuentan como acierto (Writing X/N) con nota ≥ 6. El comentario va en `respuestas.feedback`.
- **Prompts** en `lib/ia/prompts.ts` (puro, con tests): las respuestas del estudiante van entre `<respuesta>` (no son instrucciones) y la salida se valida con zod.
- **Cliente** `lib/ia/openai.ts`: `OPENAI_MODEL` (por defecto gpt-4.1-mini), JSON, 3 intentos de 40 s, respeta `Retry-After` en 429/5xx; otros 4xx no se reintentan.
- **Sin reproceso programado (como a2)**: no hay Cron de Vercel ni n8n. Lo que no termina lo reintentan:
  1. La pantalla de calificando. Spiky consulta `GET /api/intentos/[id]/estado` cada 4 s y, si el intento quedó suelto (sin candado, enviado hace más de 20 s), la consulta relanza la IA hasta tener el feedback. A los 45 s avisa "Está tardando un poco más…" con "Ver mi intento".
  2. La página del intento ("Tu retroalimentación está en camino"), que hace lo mismo cada 5 s y se actualiza sola al quedar listo.
  3. El staff, si el estudiante cerró la página: el intento aparece en `/admin` ("Hay N intentos por revisar") y en `/admin/resultados` → "Reintentar IA" o "Reintentar envío".
- **Fallos**: cada fallo suma `ia_intentos` y guarda `ia_error`. El intento vuelve a `pendiente`; al 3.er fallo pasa a `error` (la pantalla lo sigue relanzando). Relanzar solo se detiene a los 10 fallos; después, solo el staff.
- **Correo** (`lib/email/correo-resultado.ts`):
  - Plantilla de la Fase 3 con: la insignia del rango, su título, el puntaje, Grammar/Writing/Reading/Listening (las que tenga) y el feedback. Sin botón ni enlaces: no depende de ninguna URL.
  - La insignia va **embebida** (cid:), igual que el logo: solo la del puntaje, desde `lib/email/insignias.ts` (las de `public/calificaciones/` reducidas a 192 px, ~10 KB, en base64), así se ve siempre en Gmail sin depender de una URL pública ni de que `public/` llegue a la función de Vercel.
  - Solo con el intento `listo` y feedback, y una sola vez: `email_enviado` se marca antes de enviar y se desmarca si falla (queda `envio_error`).
- **Sin WhatsApp**: ManyChat ya no se usa. Se quitaron `lib/manychat.ts` y las variables `MANYCHAT_*`; la 006 borra `estudiantes.manychat_id` e `intentos.whatsapp_enviado`. El resultado solo sale por correo.
- **Staff**:
  - `/admin` avisa "Hay N intentos por revisar" (la IA o el correo no terminaron).
  - `/admin/resultados` los lista (`lib/datos/revision.ts`): `error`, pendientes de más de 10 min y correos sin enviar.
  - "Reintentar IA" ignora el tope de 10 fallos; "Reintentar envío" vuelve a mandar el correo (`app/admin/acciones/intentos.ts`).
- **Reproceso `GET /api/cron/procesar`: opcional y NO configurado.**
  - Decisión: no se programa (ni Cron de Vercel ni n8n). La ruta queda creada por si algún día hace falta.
  - `CRON_SECRET` es opcional: sin ella la app arranca y funciona igual, y esta ruta solo responde 401.
  - Si algún día se programa:
    - Llamarla con `Authorization: Bearer <CRON_SECRET>` (mínimo 16 caracteres, comparado en tiempo constante).
    - En cada llamada retoma hasta 5 intentos `pendiente` / `error` / `calificando` con el candado vencido, enviados hace más de 1 min, y reenvía hasta 20 correos pendientes de la última semana.
    - Responde `{ revisados, listos, fallos, ocupados, envios }` (`maxDuration` 300).
    - Para llamarla cada 10 min:
      - n8n: *Schedule Trigger* + *HTTP Request* GET `https://<dominio de la app>/api/cron/procesar` con ese header y timeout 300 s.
      - Vercel Pro: `vercel.json` con `{ "crons": [{ "path": "/api/cron/procesar", "schedule": "*/10 * * * *" }] }`. Vercel manda solo el header si `CRON_SECRET` existe. Hobby solo admite crons diarios.
- **Pruebas**: OpenAI y SMTP siempre simulados (`OPENAI_BASE_URL`, SMTP local), nunca los reales del `.env`. Ver "Pruebas".

## English Placement Test (bienvenida de la G2)
La evaluación de bienvenida de `gen-2026-11` es el Placement Test de Speak Easy, con las reglas de la «Guía IA - English Test» (Google Docs del equipo académico). Su feedback lleva el **nivel estimado**: Pre-A1 Inicial, A1 Básico, A2 Elemental, B1 Intermedio o B2 Intermedio alto.
- **El nivel lo calcula el código, no la IA** (`lib/placement/diagnostico.ts`, puro; tests en `tests/placement.test.ts`). La IA solo escribe el saludo, las fortalezas, lo que debe reforzar y por qué se le recomienda ese nivel de inicio (`lib/placement/feedback.ts`). El resultado (nivel, puntuación sobre 88, estado, observaciones y nivel de inicio) lo escribe el código tal cual en medio de esos textos; el detalle por nivel y por habilidad no va en el feedback (Grammar, Reading y Listening X/N salen en el resultado, como en las demás). La IA sí recibe ese detalle para elegir los temas, pero no escribe cifras. Sigue siendo una sola llamada a OpenAI por intento.
- **Cuándo aplica**: una evaluación `bienvenida` con la forma del test, en este orden: 1–60 Grammar & Vocabulary sin material (15 por nivel, de A1 a B2; si llevan subsección, una por nivel: Section A–D), 61–76 Reading con lectura (4 por nivel) y 77–88 Listening con audio (3 por nivel). Si no la tiene (p. ej. a medio cargar), no se da nivel: sale el feedback general y queda el aviso `[ia] intento N: sin nivel del Placement Test…` en el log. Una generación que clone esta bienvenida lo hereda.
- **Reglas** (constantes ajustables en `diagnostico.ts`):
  - Aprobar un bloque (`APROBAR`): ≥ 16/22, ≥ 10/15 en Grammar, ≥ 2/4 en Reading y ≥ 1/3 en Listening, todo a la vez. El nivel es el más alto aprobado de forma consecutiva desde A1, nunca por el total.
  - Dominio del bloque: 0–10 insuficiente, 11–15 en desarrollo, 16–18 funcional, 19–22 sólido.
  - Observaciones: cerca de la transición (le faltan 1 o 2 correctas para aprobar el siguiente), Listening 0/3 en algún nivel (dificultad potencial, no definitiva), bases débiles (≥ 16 en B1 o B2 sin aprobar A1 o A2) y saltos entre niveles (un bloque aprobado por encima del primero sin aprobar, o uno más alto con `SALTO_INCONSISTENTE` = 5 correctas más que uno más bajo). Los dos últimos dejan el estado en «revisión recomendada»; si no, «provisional».
  - Nivel de inicio recomendado (`INICIO_RECOMENDADO`): el siguiente al demostrado (Pre-A1 → A1 … B1 → B2; B2 → B2).
- El puntaje 0–100 y la insignia siguen igual (aciertos / 88 × 100). El nivel solo va en el texto del feedback (pantalla y correo): no se guarda en otra columna ni sale en Resultados.

## Administración (Fase 6)
Todo solo para admin, salvo Resultados (admin y docente). Acciones en `app/admin/acciones/` (`estudiantes.ts`, `staff.ts`, `generaciones.ts`); datos en `lib/datos/`.
- **Estudiantes** (`/admin/estudiantes`): lista por generación con buscador (correo o nombre de sus intentos) y activar/desactivar. Uno a uno (`app/admin/estudiantes/FormEstudiante.tsx`; `crearEstudiante` / `actualizarEstudiante` / `eliminarEstudiante` en `lib/datos/estudiantes.ts`):
  - **Agregar**: correo y generación. Se rechaza un correo del staff o uno ya inscrito (el aviso dice en qué generación está).
  - **Editar** (menú "⋯"): correo y generación (moverlo conserva sus intentos).
  - **Eliminar** (menú "⋯", irreversible): resumen con sus intentos y confirmación; se van sus intentos con sus resultados y sus códigos de acceso (FK en cascada). El diálogo ofrece "Desactivar" en su lugar: para que deje de entrar sin perder sus resultados, se desactiva.
  - Agregar y editar se ponen en fila con las importaciones CSV (mismo candado).
- **Carga por CSV** (`lib/csv.ts` + `lib/estudiantes/importar.ts` + `lib/datos/estudiantes.ts`):
  - Columna `correo` (las demás se ignoran, p. ej. el `manychat_id` de los archivos de antes); coma o punto y coma (se detecta); con o sin encabezado (sin encabezado, el correo va en la 1.ª columna). Máximo 5.000 filas o 1 MB (`serverActions.bodySizeLimit` = 2 MB en `next.config.ts`).
  - El navegador lee el archivo y manda el texto; el servidor lo analiza en la vista previa y **otra vez** al confirmar.
  - Vista previa: nuevos, cambian de generación, sin cambios, inactivos, no se importan (sin correo, correo inválido, correo del staff) y duplicados dentro del archivo.
  - Confirmar: una transacción (todo o nada; dos importaciones a la vez se ponen en fila). Existente de otra generación → se mueve (sus intentos se conservan). Inactivo → se mueve pero sigue inactivo (se reactiva desde la lista). Los que no vienen en el archivo no se tocan.
- **Staff** (`/admin/staff`): crear docente o admin (contraseña temporal que se ve una vez), cambiar rol, activar/desactivar y restablecer contraseña. Reglas en "Reglas de seguridad" (9).
- **Resultados** (`/admin/resultados`): arriba "Intentos por revisar" (Fase 5); debajo, los intentos de `v_resultados`.
  - Filtros en la URL (`lib/resultados.ts`, puro): generación → evaluación, estado (por defecto "Enviados": sin los en progreso) y búsqueda por correo o nombre. 50 por página, más recientes primero; tabla desde 1024 px y tarjetas en celular. "Ver ↗" abre `/resultado/[token]`.
  - "Exportar CSV" (`/admin/resultados/exportar`, mismos filtros): separador `;`, UTF-8 con BOM, CRLF y horas de Colombia, para que Excel en español lo abra en columnas y con tildes. Los textos que empiezan con `= + - @` llevan un apóstrofo (inyección de fórmulas). Tope de 50.000 filas.
- **Generaciones**: al crearla, el admin escribe nombre y fechas; el **código se asigna solo** (`crearGeneracion` en `lib/datos/generaciones.ts`): `gen-AAAA-MM` según la fecha de inicio y, si ya hay otra ese mes, `-2`, `-3`… (un candado evita que dos creaciones a la vez elijan el mismo). El admin edita nombre y fechas (el código no: va en los slugs) y la activa/desactiva con confirmación y resumen (estudiantes activos, intentos en curso). Desactivada: el estudiante entra y ve su historial y resultados, pero no ve evaluaciones ni empieza o continúa intentos (`lib/datos/intentos.ts` y `validar_intento`); el intento en curso se conserva con lo guardado y se retoma al reactivarla.
- **Eliminar una generación** (solo admin, irreversible; `eliminarGeneracion()` en `lib/datos/generaciones.ts`): borra la generación, sus evaluaciones con sus preguntas, sus estudiantes y todos los intentos con sus resultados (los de sus evaluaciones y los que sus estudiantes tengan en otras generaciones; un estudiante que ya se pasó a otra generación se queda). La confirmación muestra el resumen (pedido al abrirla) con el enlace para exportar sus resultados antes, y exige escribir el código de la generación. Todo en una transacción y en este orden, porque `respuestas → preguntas` es `RESTRICT`: intentos de sus evaluaciones → estudiantes → generación (evaluaciones y preguntas en cascada). Para que sus estudiantes solo dejen de verla, se desactiva.

## Reutilizable de ../evaluacion-a2 (copiar y adaptar, no importar)
- `lib/exam.js` → normalize + lógica de calificación.
- `lib/openai.js` → ya portado a `lib/ia/` (`openai.ts` + `prompts.ts` + `procesar.ts`).
- `lib/email.ts` → ya portado a `lib/email/` (`enviar.ts` + `plantilla.ts` con el diseño de Speak Easy y el logo adjunto, `correo-codigo.ts`, `correo-resultado.ts`).
- `app/api/submit/route.js` → patrón: guardar primero (estado `pendiente`), luego IA, luego correo; nunca perder respuestas. (El WhatsApp por ManyChat de a2 no se usa.)
- `app/components/EnglishExam.jsx` → UX del examen (antitrampa de cambio de pestaña, etc.). Hacerlo genérico: renderizar preguntas desde la BD según `tipo`.

## Fases
1. ✅ Hecha. Base: scaffold Next.js + TS + Tailwind, `lib/db.ts`, `lib/auth/*`, login unificado, `proxy.ts`, `scripts/crear-admin.ts`.
2. ✅ Hecha. Dashboard staff: generaciones, evaluaciones (generar 16, publicar/despublicar, fechas), CRUD de preguntas con formulario por tipo, reordenar, clonar.
3. ✅ Hecha. OTP por correo para estudiantes (código de 6 dígitos, 10 min de validez, máx. 5 intentos, límites de envío por correo e IP), `lib/email/`, migración `db/002_otp.sql`.
4. ✅ Hecha. Vista estudiante: lista de evaluaciones, presentar (autoguardado, retomar, cierre automático opcional), envío y calificación en el servidor, resultado con insignia, revisión, **historial de puntajes** (selector "Ver intento N" como en a2; "Mi historial" pasó después a ser un pop-up con su mejor puntaje por evaluación) y `/resultado/[token]`. Las abiertas quedan pendientes hasta la Fase 5.
5. ✅ Hecha. IA (feedback general como a2: una llamada por intento; abiertas con rúbrica solo con `PREGUNTAS_ABIERTAS_ACTIVAS`), correo del resultado (el WhatsApp por ManyChat se quitó después: `db/006_sin_manychat.sql`), la pantalla que reintenta hasta tener el feedback y "Reintentar IA" para el staff. `/api/cron/procesar` queda creado pero sin programar. Migración `db/004_ia.sql`.
6. ✅ Hecha. Administración: estudiantes (lista, agregar / editar / eliminar uno a uno, CSV con vista previa, activar), staff (contraseña temporal con cambio obligatorio, roles, restablecer que cierra sesiones, "Cambiar mi contraseña"), resultados con filtros y CSV para Excel, y generaciones (editar y desactivar). Migración `db/005_admin.sql`.

## Migraciones pendientes en producción
Se ejecutan a mano en el VPS, en orden, **antes** de desplegar el código que las usa; al ejecutarlas, marcarlas aquí. Cada archivo fija su propio `search_path`.
- [x] `db/002_otp.sql` (Fase 3): tabla `codigos_acceso`. Sin ella el login de estudiantes falla. Ejecutar: `psql "<DATABASE_URL sin ?schema=evaluacion>" -f db/002_otp.sql` (psql no acepta el parámetro `schema`). Comprobar: `SELECT to_regclass('evaluacion.codigos_acceso');` (no debe dar NULL).
  - Con `OTP_ACTIVO=false` (por defecto) el login no la usa, pero se ejecuta igual para que la base quede completa.
  - Si se activa el OTP, en Vercel además: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (contraseña de aplicación) y `MAIL_FROM`. En producción sin SMTP el estudiante ve "No pudimos enviarte el código". `OTP_*` son opcionales (valores por defecto en `.env.example`).
- [x] `db/003_ajustes.sql` (antes de la Fase 4): quita `estudiantes.nombre` (lo pasa a `intentos.nombre` en los intentos que existan), recrea `v_resultados`, agrega `evaluaciones.cierre_automatico` / `mostrar_correctas` e `intentos.respuestas_borrador` / `limite_at` y el índice de un intento en curso. Va en una transacción. Después de ejecutarla, las sesiones de estudiante anteriores dejan de valer (no traen nombre) y deben volver a entrar. Comprobar: `SELECT column_name FROM information_schema.columns WHERE table_schema = 'evaluacion' AND table_name = 'intentos' AND column_name IN ('nombre', 'respuestas_borrador', 'limite_at');` (3 filas).
- [x] `db/004_ia.sql` (Fase 5): agrega a `intentos` `procesando_hasta`, `ia_intentos`, `ia_error`, `whatsapp_enviado` y `envio_error`. Va en una transacción. Sin ella, los intentos se envían pero la IA no corre y se quedan esperando.
  - Comprobar: `SELECT count(*) FROM information_schema.columns WHERE table_schema = 'evaluacion' AND table_name = 'intentos' AND column_name IN ('procesando_hasta', 'ia_intentos', 'ia_error', 'whatsapp_enviado', 'envio_error');` (5).
  - Intentos que ya existían:
    - Los `listo` de la Fase 4 (sin abiertas, sin feedback) se marcan como avisados: no reciben correo ni WhatsApp tardíos ni feedback retroactivo.
    - Los `pendiente` (con abiertas) se terminan cuando el estudiante abre su intento (la página relanza la IA) o con "Reintentar IA" desde `/admin/resultados`, donde aparecen como "por revisar". Con las abiertas apagadas, la abierta no cuenta: solo se escribe el feedback y sale el correo.
    - Antes de ejecutarla, ver cuántos son: `SELECT estado, count(*) FROM evaluacion.intentos GROUP BY estado;`.
  - Variables en Vercel (Production):
    - `OPENAI_API_KEY` y `OPENAI_MODEL` (opcional).
    - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`: ahora obligatorias; sin ellas el correo del resultado queda con "SMTP no configurado".
    - `PREGUNTAS_ABIERTAS_ACTIVAS`: no definirla (o `false`).
    - `PESOS_POR_PREGUNTA`: no definirla (o `false`): todas las preguntas valen lo mismo. Si algún día se enciende, ponerla igual en el portal.
    - `CRON_SECRET`: no hace falta (reproceso sin programar).
    - Nunca `OPENAI_BASE_URL` (solo pruebas).
  - Las rutas de la IA usan `maxDuration = 300`, que exige Fluid compute (activado por defecto en Vercel; comprobar en Settings → Functions).
- [x] `db/005_admin.sql` (Fase 6): agrega `staff.debe_cambiar_password` y `staff.sesion_version`, y `validar_intento` rechaza intentos nuevos de una generación desactivada. Va en una transacción. **Antes** de desplegar la Fase 6: sin ella, el panel no puede leer el staff y nadie del staff puede entrar.
  - Comprobar: `SELECT count(*) FROM information_schema.columns WHERE table_schema = 'evaluacion' AND table_name = 'staff' AND column_name IN ('debe_cambiar_password', 'sesion_version');` (2).
  - El staff que ya existe queda con `debe_cambiar_password = false` y versión 0: sus sesiones abiertas siguen valiendo y no se le pide cambiar la contraseña.
  - Sin variables nuevas en Vercel.
- [x] `db/006_sin_manychat.sql` (ManyChat quitado): borra `estudiantes.manychat_id` (con los ids que tenga) e `intentos.whatsapp_enviado`. Va en una transacción. Orden en producción: 005 → desplegar el código sin ManyChat → 006. Va **después** de desplegar: el código nuevo ya no usa esas columnas, pero el anterior sí (si se corre antes, su lista de estudiantes y su envío fallan).
  - Irreversible. Si se quieren guardar los ids, antes: `\copy (SELECT email, manychat_id FROM evaluacion.estudiantes WHERE manychat_id IS NOT NULL) TO 'manychat.csv' CSV HEADER`.
  - Comprobar: `SELECT count(*) FROM information_schema.columns WHERE table_schema = 'evaluacion' AND ((table_name = 'estudiantes' AND column_name = 'manychat_id') OR (table_name = 'intentos' AND column_name = 'whatsapp_enviado'));` (0).
  - En Vercel: borrar `MANYCHAT_API_TOKEN` y `MANYCHAT_FLOW_RESULTADO` (ya no se leen).
- [x] `db/007_bienvenida.sql` (evaluación de bienvenida): agrega `'bienvenida'` a `tipo_evaluacion` (antes de `'mensual'`, así `ORDER BY tipo` la pone primero), cambia `evaluaciones_check` (bienvenida solo con `numero = 1`), `generar_evaluaciones` crea las 17 y le crea su bienvenida (sin publicar y sin preguntas) a cada generación que ya existe; las demás evaluaciones no se tocan.
  - Orden en producción: 007 → desplegar el código. Va **antes**: el código anterior no se rompe con la bienvenida (solo no la muestra en el panel), pero el nuevo espera 17 por generación.
  - Dos pasos en el mismo archivo: el `ALTER TYPE` se confirma solo (Postgres no deja usar un valor nuevo de un enum en la misma transacción) y lo demás va en una transacción. Con psql, el `COMMIT` del paso 1 avisa "there is no transaction in progress": es normal. Se puede correr otra vez sin cambiar nada.
  - Comprobar: `SELECT g.codigo, count(e.id) FROM evaluacion.generaciones g LEFT JOIN evaluacion.evaluaciones e ON e.generacion_id = g.id GROUP BY g.codigo;` (17 en cada una) y `SELECT count(*) FROM evaluacion.evaluaciones WHERE tipo = 'bienvenida';` (= número de generaciones).
  - Sin variables nuevas en Vercel. El portal (`inventario-speakeasy`, Academia → Evaluaciones) lee el mismo schema: desplegarlo también.
- [x] `db/008_final.sql` (evaluación final): agrega `'final'` a `tipo_evaluacion` (después de `'trimestral'`, así `ORDER BY tipo` la pone de última), cambia `evaluaciones_check` (bienvenida y final solo con `numero = 1`), `generar_evaluaciones` crea las 18 y le crea su final (`<codigo>-final`, sin publicar y sin preguntas) a cada generación que ya existe; las demás evaluaciones no se tocan.
  - Orden en producción: 008 → desplegar el código (aquí y en el portal). Va **antes**: el código anterior no se rompe con la final (solo no la muestra en el panel), pero el nuevo espera 18 por generación.
  - Dos pasos en el mismo archivo, como la 007 (con psql, el aviso "there is no transaction in progress" del paso 1 es normal). Se puede correr otra vez sin cambiar nada. Correr la 007 otra vez después de esta deja `generar_evaluaciones` sin la final: si pasa, correr la 008 de nuevo.
  - Comprobar: `SELECT g.codigo, count(e.id) FROM evaluacion.generaciones g LEFT JOIN evaluacion.evaluaciones e ON e.generacion_id = g.id GROUP BY g.codigo;` (18 en cada una) y `SELECT count(*) FROM evaluacion.evaluaciones WHERE tipo = 'final';` (= número de generaciones).
  - Sin variables nuevas en Vercel.
- [x] `db/009_materiales.sql` (lecturas y audios): tabla `materiales`, `preguntas.material_id` (ON DELETE SET NULL), trigger `validar_material_pregunta`, `material_id` al final de `v_preguntas_publicas` y `clonar_preguntas` que copia los materiales. Va en una transacción (todo o nada); no se puede correr dos veces (la segunda falla con "already exists" sin tocar nada).
  - Orden en producción: 008 → 009 → 010 → desplegar el código (aquí y en el portal). Va **antes**: el código anterior no lee lo nuevo, pero el nuevo sí (sin la 009 fallan el editor, el examen y la vista previa).
  - Comprobar: `SELECT to_regclass('evaluacion.materiales');` (no NULL) y `SELECT count(*) FROM information_schema.columns WHERE table_schema = 'evaluacion' AND table_name IN ('preguntas', 'v_preguntas_publicas') AND column_name = 'material_id';` (2).
  - Vercel (aquí y en el portal): para subir audios, crear un Blob store (Storage → Blob, acceso público) y conectarlo al proyecto, que agrega `BLOB_READ_WRITE_TOKEN`. Sin ella todo funciona, pero el audio solo se agrega pegando su enlace.
- [x] `db/010_subsecciones.sql` (subsecciones, Section A, B…): agrega `preguntas.subseccion` (opcional, solo con sección), la pone al final de `v_preguntas_publicas` y `clonar_preguntas` la copia. Va en una transacción y se puede correr otra vez sin cambiar nada.
  - Orden en producción: después de la 009 y **antes** de desplegar el código (aquí y en el portal): sin ella fallan el editor, el examen y la vista previa (leen `subseccion`).
  - Comprobar: `SELECT count(*) FROM information_schema.columns WHERE table_schema = 'evaluacion' AND table_name IN ('preguntas', 'v_preguntas_publicas') AND column_name = 'subseccion';` (2).
  - Sin variables nuevas en Vercel.
- [ ] `db/011_reading_listening.sql` (categorías Reading y Listening): agrega `'reading'` y `'listening'` a `categoria_pregunta`, `intentos.reading_score` / `listening_score` y las pone al final de `v_resultados`. Las preguntas de Grammar ligadas a una lectura pasan a Reading y las ligadas a un audio, a Listening (en producción: las 16 + 12 de la bienvenida de `gen-2026-11` y las 3 + 2 de su M1), y en sus intentos se recuentan Grammar, Reading y Listening con las respuestas guardadas (puntaje, respuestas y feedback no cambian).
  - Orden en producción: 011 → desplegar el código (aquí y en el portal), uno detrás del otro. Va **antes**: sin ella el código nuevo falla al enviar y en Resultados (escribe y lee las columnas nuevas). Un intento que se envíe entre la migración y el despliegue queda sin Reading ni Listening: correr la 011 otra vez después de desplegar lo recuenta.
  - Dos pasos en el mismo archivo, como la 007 (con psql, el aviso "there is no transaction in progress" del paso 1 es normal). Se puede correr otra vez sin cambiar nada.
  - Comprobar: `SELECT enum_range(NULL::evaluacion.categoria_pregunta);` (`{grammar,writing,reading,listening}`), `SELECT count(*) FROM information_schema.columns WHERE table_schema = 'evaluacion' AND table_name IN ('intentos', 'v_resultados') AND column_name IN ('reading_score', 'listening_score');` (4) y `SELECT count(*) FROM evaluacion.preguntas WHERE material_id IS NOT NULL AND categoria = 'grammar';` (0).
  - Sin variables nuevas en Vercel.

## Migración de las evaluaciones A1 y A2 (hecha el 21 oct 2026)
Las evaluaciones viejas de la Generación 1 vivían en otros schemas de la misma BD, con las preguntas en el código de cada proyecto: A1 en `agendamiento` (proyecto `Evaluaciondos-main`) y A2 en `evaluacionados` (`../evaluacion-a2`). Se pasaron a `gen-2026-03` con `scripts/migracion-a1-a2/` (ver el encabezado de `migrar.mts`):
- A1 → `gen-2026-03-t1` («Evaluación A1», cerrada, 1 intento) y A2 → `gen-2026-03-t2` («Evaluación A2», abierta, intentos ilimitados); 115 y 120 preguntas de 10 puntos, con las "Part" como secciones. Las preguntas salen de `a1.json` / `a2.json` (`extraer-preguntas.mts`: lo que vio el estudiante + la clave de `lib/exam.js`).
- 697 estudiantes (los autorizados de los dos schemas; se omitieron un correo del staff y una entrada con dos correos en un campo). Intentos: A1 488 y A2 247 (se omitió uno de prueba del staff), con nombre, token, feedback, cambios de pestaña y fechas; todos `listo` y `email_enviado` (no se mandó ningún correo).
- Puntaje, Grammar y Writing son los **originales**. Cada respuesta se marcó con la clave: en la A2, los intentos del 28 sep al 1 oct con la de antes del commit 6b37ae9 (cuadran exacto); en la A1 no hay historial de la clave de los primeros días, así que en 22 intentos (1–5 jul) las respuestas marcadas no suman exactamente el puntaje guardado.
- No se migró: el speaking de la A1 (`agendamiento.speaking_scores`, no hay dónde) ni las instrucciones propias de cada "Part" (el examen muestra la instrucción por tipo de pregunta). Los schemas viejos quedan intactos (solo se leyeron).
- Volver a correrlo no duplica nada (reconoce los intentos por token) y respeta la configuración actual de la T1/T2: sirve para traer intentos tardíos de los sistemas viejos. `npx tsx scripts/migracion-a1-a2/migrar.mts` simula; con `--aplicar` guarda.

## Pruebas
- `npm test`: pruebas unitarias (vitest, `tests/*.test.ts`).
- `npm run test:integracion` (una sola suite: `npm run test:integracion -- ia`):
  - **Entorno**: sin variables y sin servicios externos. `tests/integracion/ejecutar.mjs` levanta un Postgres 17 temporal (`embedded-postgres`) con todas las `db/0NN_*.sql` en orden, y simula OpenAI y el SMTP (`simuladores.mjs`).
  - **Dependencias aparte**: `embedded-postgres` (~100 MB), `smtp-server` y `mailparser` van en `tests/integracion/package.json` (con su propio lockfile), **no** en el de la app, así Vercel nunca las instala. El runner las instala la primera vez o si cambia ese lockfile (`tests/integracion/node_modules` está en `.gitignore`). No usar `optionalDependencies`: `npm ci` también las instala, y `--omit=optional` rompería el build (los binarios de Next, Tailwind y lightningcss son opcionales).
  - **Aislamiento**: cada suite corre en su propio proceso con un entorno armado desde cero, nunca el `.env`. Si una suite se corre por fuera del runner, se niega a arrancar (`comun.mts`). Al terminar se borra todo.
  - **Suites**: `intentos.mts` (Fase 4), `ia.mts` (Fase 5 y el Placement Test), `admin.mts` (Fase 6: CSV, reglas del staff con concurrencia, resultados y exportación, generación desactivada), `materiales.mts` (lecturas y audios: crear, ligar, examen, clonar, eliminar; y subsecciones) y `migraciones.mts` (004 a 011 sobre datos de la Fase 4).
  - **Configuración por defecto**: abiertas apagadas. La prueba que necesita abiertas las enciende ella misma, solo mientras corre (`conAbiertas()`).
  - **Suites nuevas**: van en `tests/integracion/*.mts` y se agregan a `SUITES` en `ejecutar.mjs`. Una migración nueva en `db/` se aplica sola.

## Convenciones
- Zona horaria del negocio: **America/Bogota** (fechas de apertura/cierre se escriben y muestran en esa zona; Vercel corre en UTC).
- Código y comentarios en español donde sea texto de negocio; nombres de BD en español como están.
- Validación de entrada con `zod`.
- Antes de acciones masivas (importar CSV, recalificar, borrar), mostrar resumen y pedir confirmación.
- Nunca leer ni imprimir `.env`.
