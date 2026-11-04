# Pruebas adicionales con Cypress

Se ejecuta **la aplicación Angular existente en modo `local` (gateways HTTP)**.
No hay otra aplicación demo, servidor de negocio simulado ni adaptación del producto
para hacer pasar pruebas. Las pruebas unitarias Vitest siguen cubriendo lógica,
adaptadores y casos de borde; Cypress añade interacción real del navegador.

## Suites con evidencia distinta

| Suite         | Qué demuestra                                                                                                              | Qué no demuestra                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ui/`         | Formularios, rutas, consentimiento, errores, reintentos y presentación bajo respuestas HTTP controladas con `cy.intercept` | Autenticación, persistencia o integridad de servicios reales                          |
| `integrated/` | Navegador → BFF web → identidad, perfilamiento, cotización y pólizas reales, con bases temporales migradas                 | Producción, Open Finance real, pasarela bancaria, firma legal, rendimiento bajo carga |
| `controlled/` | Escenario explícito HU44 con servicios reales y un fallo HTTP de despacho controlado por el propietario del backend        | No acredita caída TCP, reinicio, worker automático, fuentes financieras reales ni AWS |

`integrated/` no importa fixtures de `ui/` ni reemplaza respuestas de negocio.
Los interceptores de esa suite observan peticiones para correlacionar sus resultados.
El setup de las suites existentes registra cuentas sintéticas por la API de
Identidad, con documento, fecha de nacimiento y teléfono. El caso
`integrated/registration.cy.ts` no usa ese setup: crea las cuentas desde el formulario
web y el BFF, con datos maestros y decisión explícita de consentimiento.
Cada caso usa correo único `cypress-<uuid>@example.com` y contraseña aleatoria;
no necesita cuentas preexistentes ni secretos productivos.

En esta rama, el login HTTP usa desafío y JWE (`RSA-OAEP-256` / `A256GCM`).
La suite UI genera una clave RSA efímera por caso, responde al desafío y descifra
el login con su clave privada de prueba. Comprueba el correo vinculado, la contraseña
recuperable y su ausencia del cuerpo HTTP. También cubre desafío inválido/vencido,
503 y falta de Web Crypto sin POST ni fallback; el reintento obtiene otro desafío.
La suite integrada observa el formato JWE de los logins válidos e inválidos, sin
reemplazar el backend. El registro web usa un desafío independiente
`GET /v1/usuarios/desafio`, `typ: solventa-register+jwe` y `credencialCifrada`,
sin `contrasena` en el POST. `ui/registration.cy.ts` descifra con una clave efímera
de prueba y cubre errores, falta de Web Crypto y reintentos sin degradación.
El setup directo de Identidad para otras suites conserva su contrato legacy;
la prueba de duplicados del BFF también usa el formulario web cifrado.

## Ejecución

Requisitos: Node según `.nvmrc`, pnpm según `package.json` y dependencias del
navegador Cypress. En Linux usar un runner con las dependencias oficiales de Cypress
y Xvfb (GitHub `ubuntu-latest`). Cypress está fijado a 16.2.0; usa su Electron incluido.
Esa versión avisa que Electron está deprecado: revisar navegador al actualizar Cypress.

```sh
pnpm install --frozen-lockfile
pnpm test:cypress:types
node --test tests/cypress/runner.test.cjs
pnpm test:cypress:ui
```

En PowerShell con scripts deshabilitados, usar `corepack.cmd pnpm` en lugar de
`pnpm`. Si Windows falla al extraer rutas largas del binario, fijar antes de
instalar **y ejecutar** una caché corta, por ejemplo
`$env:CYPRESS_CACHE_FOLDER='C:\cy-solventa'`; luego `corepack.cmd pnpm exec cypress install`.
No ejecutar dos instalaciones sobre la misma caché simultáneamente.

Para integración, arrancar primero el helper compartido del repositorio
`Migue765/backend-solventa`, `tests.jmeter.local_stack`, con sus dependencias
instaladas según `tests/jmeter/README.md`. Debe incluir emisión académica habilitada
y todas las bases migradas; no sirve un BFF aislado ni un `/ping` saludable.
Además, esta rama requiere el backend nuevo con `ENCRYPTED_LOGIN_ENABLED`
habilitado tanto en identidad como en BFF web del entorno desechable.
`tests/cypress/partner_backend.py` del repositorio web arranca ese `LocalStack`
con login cifrado y crea un socio sintético mediante el CLI oficial de Identidad.
El workflow fija `jobs.integrated.env.BACKEND_REVISION` en
`.github/workflows/cypress-integrated.yml` al commit
`d0a3145918c019b1cfb347faa1a8d0d5d05dac8d`, que incorpora la operación HU44 vinculada,
decisión y aplicación durables, conservando preselección y aceptación con revisión.
Requiere aplicar todas sus migraciones mediante `upgrade head` antes de iniciar la web.
Es una referencia del entorno de pruebas, no un destino de despliegue productivo.

Revisión reproducible del backend público:
[`d0a3145918c019b1cfb347faa1a8d0d5d05dac8d`](https://github.com/Migue765/backend-solventa/commit/d0a3145918c019b1cfb347faa1a8d0d5d05dac8d).
El workflow usa ese SHA inmutable, no `develop` ni una rama que pueda cambiar.
Esta revisión deja JMeter exclusivamente manual en el backend; el workflow web
solo utiliza su helper de servicios y no ejecuta JMeter.

El checkout del backend, la instalación de servicios y `partner_backend.py` usan
el mismo directorio `.angular/cypress-backend`. El runner conserva los XML de esta
suite en `reports/cypress/integrated/`, que publica el artefacto
`cypress-integrated-results`. Los XML no incorporan el SHA del backend: su
trazabilidad depende del SHA del workflow web y del checkout fijado en ese run.
Cambiar el pin no acredita una nueva ejecución Linux; los resultados históricos
de revisiones anteriores conservan su atribución original.

```powershell
# Desde el repositorio web, con el Python que tenga las dependencias del backend:
$env:CYPRESS_DISPOSABLE_BACKEND='1'
python tests\cypress\partner_backend.py --backend '..\backend-solventa' --web-port 5000 --mobile-port 5001
```

En otra terminal del repositorio web:

```powershell
$env:CYPRESS_DISPOSABLE_BACKEND='1'
$env:CYPRESS_BACKEND_URL='http://127.0.0.1:5000'
corepack.cmd pnpm test:cypress:integrated
```

Equivalente POSIX:

```sh
CYPRESS_DISPOSABLE_BACKEND=1 CYPRESS_BACKEND_URL=http://127.0.0.1:5000 pnpm test:cypress:integrated
```

El runner exige confirmación explícita de entorno desechable, rechaza destinos no
loopback, credenciales en URLs y rutas arbitrarias. Falla si falta backend, puerto
libre o navegador: **no omite casos para producir verde**. No usar un proxy/túnel
local que apunte a producción. El backend no debe enviar correos reales.

El runner inicia Angular y un proxy temporal propio en `.angular/cypress`, verifica
respuesta HTTP y los cierra al terminar. No modifica `proxy.conf.json` (el desarrollo
habitual conserva puerto 5001). `CYPRESS_WEB_PORT` permite otro puerto libre; por
defecto 4300. Cada suite debe tener un puerto diferente si se ejecutan en paralelo.
Al finalizar, incluso con un caso fallido o una salida anormal de Angular, espera
hasta cinco segundos el cierre de sus streams y conserva `angular-diagnostics.json`
junto a los XML, además de emitir el resumen en la salida del runner. Retiene solo
indicadores fijos y códigos de error de una ventana de 12 000 caracteres; no exporta
texto libre, URLs, cabeceras, credenciales, entorno ni cuerpos. `truncated` y
`droppedCharacters` identifican pérdida por el límite. `failures` informa fallos de
captura, escritura o limpieza; si no puede escribir el archivo, lo informa en la
salida. Esos diagnósticos no reemplazan el resultado/exit original de Cypress.
`captureComplete: false` impide atribuir una captura completa o ausencia de errores,
aunque Cypress haya pasado. No permite reconstruir el buffer perdido de un run previo.

Además, `reports/cypress/<suite>-run-diagnostics.json` registra la fase y una categoría
fija del fallo incluso antes del reportero JUnit. Se escribe desde el inicio y queda
fuera del directorio de XML que se limpia. No guarda mensajes, stack, rutas, datos de
peticiones ni entorno. Incluye un UUID nuevo (o el `CYPRESS_DIAGNOSTIC_RUN_ID` válido
de Jenkins), contadores acotados y errores explícitos de captura, sin reemplazar el
resultado original. Un proceso interrumpido puede dejar una fase sin resultado final;
eso no es éxito. Jenkins coteja el UUID y los XML actuales antes de publicar el
diagnóstico mediante su check **Cobertura** existente; ver `docs/ci.md`.

Para ejecutar solo el recorrido de catálogo, usar `node tests/cypress/run.cjs integrated catalog.cy.ts`
con `CYPRESS_WEB_PORT` en un puerto libre propio. El tercer argumento acepta un único nombre
`.cy.ts` de la suite, sin rutas ni comodines; no ejecuta los demás specs.
Sus XML y evidencia JSON saneada quedan en `reports/cypress/integrated/catalog/`, separados
de los informes de la suite completa. El caso usa login JWE, resumen/detalle reales y un único
POST de cotización desde la UI hasta ofertas; no acepta ofertas ni realiza pagos.
Exige el GET 404 contractual de consentimiento ausente y el GET 200 canónico de
`seleccion-provisional` con selección y aceptación nulas. No hace fallback a la ruta
histórica si falta la nueva. La evidencia anterior del catálogo web718/backend6a
conserva sus dos GET404 y no acredita esta nueva combinación.
Para el recorrido nuevo A → B → recarga → aceptación explícita → suscripción,
ejecutar únicamente `node tests/cypress/run.cjs integrated selection.cy.ts`.
Los XML y la captura parcial/final previa a las guardas compartidas quedan en
`reports/cypress/integrated/selection/`; el XML final determina éxito, no la captura.
Este caso no realiza pagos ni emisión. Las pruebas controladas de conflictos/replay
no se atribuyen al backend vivo ni sustituyen el cotejo SQL del entorno desechable.
Al cerrar el helper backend se eliminan sus bases temporales: no se borran cuentas
reales ni se presupone una API de limpieza inexistente.
El helper escribe solo las URLs locales en `.angular/cypress/partner-backend.json`.
La tarea Node de Cypress comprueba que Identidad y el navegador pertenezcan al
mismo entorno desechable antes de registrar clientes; no sigue redirecciones.
No arrancar dos helpers en el mismo checkout. Para cerrarlo, usar Ctrl+C o eliminar
ese manifiesto temporal y esperar su salida; no matar solo el proceso padre de Python.

### Registro web y consentimiento de 30 días

Con un backend desechable compatible con el registro completo del BFF y login
cifrado, ejecuta `node tests\cypress\run.cjs integrated registration.cy.ts` con
`CYPRESS_DISPOSABLE_BACKEND=1`, `CYPRESS_BACKEND_URL` apuntando a ese BFF local y
`CYPRESS_WEB_PORT` en un puerto libre. En Windows, usa la caché corta indicada arriba
si la caché por defecto no contiene un binario válido.

El caso autorizado recorre el enlace **Registrarse**, completa el formulario real,
obtiene un desafío y verifica el JWE del POST sin contraseña visible,
registra usuario/consentimiento, inicia sesión con JWE, consulta la decisión y
comprueba exactamente 30 días entre `efectivaEn` y `vigenteHasta`. Una recarga no
altera la decisión. Crea una cotización con esos datos maestros, recibe ofertas y
revoca desde el menú **Consentimiento**; comprueba el estado persistido tras recarga
y el 403 al intentar otra cotización. El segundo caso usa ancho móvil y rechazo
explícito: crea la cuenta, permite login, conserva el rechazo y no permite cotizar.
No llama al helper de altas directas de Identidad, ni sustituye respuestas del BFF.
Ambos desafíos (login y registro) requieren `ENCRYPTED_LOGIN_ENABLED=true`.

Los XML y las evidencias JSON sin credenciales quedan en
`reports/cypress/integrated/registration/`. No captura imágenes ni video.
La revisión backend fijada en el workflow histórico no acredita este contrato
nuevo: antes de ejecutar la suite completa en CI se debe fijar una revisión
publicada compatible. Las pruebas locales sobre ambos worktrees no equivalen a
una ejecución de ese workflow ni a un despliegue.

### Muestra HU44 con fallo de despacho controlado

`controlled/open-finance-review.cy.ts` exige una selección explícita; no pertenece
al glob habitual de `integrated/` ni al workflow manual anterior. No se omite si
faltan sus prerrequisitos: el runner falla antes de iniciar la web o enviar HTTP.
El propietario del backend prepara un único entorno d0 con socio/asesor legítimos
por CLI de Identidad, tres clientes sintéticos consentidos y ninguna excepción
insertada. Orden: completada por recuperación explícita, detenida por rechazo,
bloqueada por fuente. El formulario real genera las tres operaciones.

El primer despacho de aplicación responde una sola HTTP503, después de persistir
la decisión y antes del handler de aplicación. La muestra exige GET canónico
aprobado/pendiente/sin acuse, recarga, filtro pendiente y POST explícito `/aplicar`
con `{}`; no vuelve a decidir. Luego comprueba los tres filtros terminales,
sus recibos recargados, el mismo ACK leído por el socio y datos solo para completada.
La disponibilidad de `open_finance` y ese fallo de entrega son controles de la
muestra backend, no mocks de autenticación/BFF ni nuevas reglas de producto.

Antes del arranque se fija el SHA web publicado y el SHA256 de los bytes exactos
del spec. El runner exige árbol limpio, coincidencia de SHA/spec/run_id, estado
`ready`, readiness vigente, wiring permanente verificado, recuperación automática
deshabilitada y `delivery_fault.enabled=true, consumed=false`. El status contiene
las URLs y la ruta privada de credenciales; la fixture pública contiene los IDs
y documentos sintéticos. Los tres archivos deben pertenecer al mismo run.

Con los valores entregados por el propietario, no placeholders:

```powershell
$env:CYPRESS_DISPOSABLE_BACKEND='1'
$env:CYPRESS_BACKEND_URL=$bffUrl
$env:CYPRESS_WEB_PORT=$puertoWebPropio
$env:CYPRESS_HU44_STATUS_FILE=$rutaAbsolutaStatus
$env:CYPRESS_HU44_FIXTURE_FILE=$rutaAbsolutaFixture
$env:CYPRESS_HU44_RUN_ID=$runId
node tests\cypress\run.cjs controlled open-finance-review.cy.ts
```

El puerto web es obligatorio y distinto de 4200/4300. El preflight anónimo de
productos registra su status y hora de finalización fuera de la ventana UI.
Las credenciales solo se leen para login JWE de esos actores, sin copiarlas al
repositorio ni informes. No hay nuevas altas, capturas, grabaciones ni cambios
AWS. XML y evidencia saneada quedan en
`reports/cypress/controlled/open-finance-review/`; el XML posterior a las guardas
de consola determina el resultado. Después de no más solicitudes, el propietario
realiza el cotejo SQL y cierra su backend mediante el protocolo de ACK del run;
este runner solo cierra Angular y su proxy propios. Preparar o compilar el spec
no acredita haber ejecutado la muestra.

## Cobertura funcional

| Área implementada             | UI controlada                                                                                                                                                | Integración real                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Identidad                     | Campos requeridos/email, 401/429/503, recuperación, guardas, refresh fallido, logout                                                                         | Registro API, duplicado, login UI válido/inválido, petición anónima, renovación al recargar, refresh revocado, nueva sesión |
| Ocho productos                | Obligatorios y payload exacto de cada formulario                                                                                                             | Ocho recorridos independientes completos                                                                                    |
| Productos                     | Automotriz, viaje, vida, dispositivos, vuelo paramétrico, clima paramétrico, protección de pagos, vida hipotecaria                                           | Los mismos ocho, con datos sintéticos y fechas relativas                                                                    |
| Validaciones específicas      | Saldo hipotecario cero, destino fuera de catálogo, fechas invertidas, ofertas vencidas/retiradas                                                             | Contratos transmitidos y prima positiva del servicio                                                                        |
| Consentimiento                | Ausente, autorización, revocación, expiración                                                                                                                | Ausente denegado, autorización durable, revocación deniega nuevo perfil y nueva cotización con 403                          |
| Oferta/suscripción            | Condiciones obligatorias, oferta cambiada, revisión/rechazo no permiten pagar                                                                                | Selección persistida, decisión aprobada, hash y versión de regla, perfil con fuentes/modelo/versiones                       |
| Pago simulado                 | Fallo y reintento con misma clave; importe discordante no muestra éxito                                                                                      | Importe igual a oferta, misma referencia en replay de clave, un pago y una póliza                                           |
| Recuperación                  | Error de dashboard y solicitud con reintento                                                                                                                 | Recarga, logout, borrado de storage, login nuevo, dashboard y deep link a suscripción recuperados del backend               |
| Ownership                     | No se presenta oferta tras fallo de recuperación                                                                                                             | Segundo usuario recibe 404 en solicitud/ofertas/selección/suscripción/perfil/pago y dashboard vacío                         |
| Socio hipotecario SOL-198/205 | Navegador: portal → formulario → oferta y factores → GET; autorización insuficiente, fallos y mismo operationId. Regresiones HTTP del panel para vencimiento | Contexto socio/cliente/crédito, prima, explicación, GET idéntico persistido, aviso histórico y ausencia de POST duplicados  |

El caso del socio adelanta solo el reloj del navegador al recibir la oferta
recuperada, después de autenticar. No altera el GET, el snapshot persistido, el TTL
del backend ni el consentimiento. No acredita que el backend acepte una oferta
vencida. El panel conserva el contenido original para consulta y distingue su
vencimiento; preparar otra operación exige consultar de nuevo al cliente y
revalidar producto, perfil y consentimiento. No cancela selecciones o suscripciones
ya aceptadas.

No hay `cy.wait(ms)` ni reintentos automáticos de tests. La sincronización usa
observación HTTP y assertions reintentables de Cypress. La emisión se consulta
con polling de estado real, backoff 100–1000 ms y límite total de 60 segundos.
Ese límite detecta falta de convergencia funcional; **no mide p95/p99**.
Antes de navegar fuera del dashboard o de las ofertas, los helpers esperan el contenido
resuelto de la vista, no solo la URL. Esto evita que una navegación dura del runner
cancele una consulta aún en vuelo; no se filtran los errores de transporte `status: 0`.
Cada caso comprueba también cero errores de consola **inesperados**, errores JavaScript y
promesas sin manejar, incluso al recargar o navegar. Un caso negativo debe declarar el
mensaje literal, estado HTTP y, cuando corresponde, código del diagnóstico esperado;
debe observarlo exactamente una vez. No se desactiva el logging de la aplicación ni se
guardan argumentos de consola o credenciales. Los HTTP negativos no se ocultan como éxitos.

La suite UI incluye 47 casos. Cinco recorren el formulario/panel socio con HTTP
controlado y sin crear cuentas, consentimiento ni cotizaciones reales. No conectan
el circuito de asesor con el de socio ni acreditan percentiles o persistencia AWS.
Verifican operación y referencia de perfil confirmadas después de POST, recuperación
GET y reintento, sin mostrar esta última ante errores ni reconstruir datos ausentes.
El caso de acuse perdido reproduce 503 con pago confirmado y póliza existente:
la UI consulta la saga actual, reintenta explícitamente con la misma clave desde
el detalle y no anuncia emisión hasta recibir `emitida`. Es HTTP controlado,
no una prueba de persistencia o conciliación real ni una grabación nueva.
Otro caso observa `emitida/v3` al actualizar y recargar después del 503, sin un
segundo POST de pago: conserva la clave original y el snapshot `pago_confirmado/v2`,
y deja de ofrecer confirmación o reintentos. El 503 se acota a la ruta de pago,
su código y el mensaje visible; no se permiten diagnósticos inesperados de consola.
Este caso HTTP controlado no acredita un worker real de recuperación automática.
Otro caso recorre rechazo HTTP 200 sin fecha de confirmación, dashboard, detalle y
cancelación/confirmación explícita de un nuevo intento. Tras un 503 de esa nueva clave
y una recarga, el GET selecciona la clave nueva y recupera su resultado, no el rechazo
de otra clave. Verifica dos POST explícitos y exactamente dos claves; ni navegación,
recarga ni recuperación envían un pago. Si el servicio devuelve el rechazo anterior
para la clave nueva, las regresiones del servicio bloquean ese resultado inconsistente.

El consumidor de pago admite `pendiente` con `creadaEn` UTC y
`codigo=resultado_no_confirmado`, sin fechas finales ni motivo de rechazo. Antes del
POST `{}` guarda en el almacenamiento de sesión el solicitante autenticado, la solicitud,
la suscripción y el UUID. Pendiente o respuesta perdida se recuperan exclusivamente con
GET y `Idempotency-Key`; un 404 no permite otra confirmación. Solo un rechazo definitivo
permite preparar y confirmar explícitamente una clave nueva. Un pago confirmado conserva
el reintento explícito de emisión con la clave exacta ya conciliada.

El 409 `pago_en_proceso` no vincula la clave rival: se conserva como rival y se consulta
la URL canónica de la solicitud, sin selector, cotejando `pagoId`. No se sigue una
`Location` arbitraria ni se reenvía la clave rival. Recibos antiguos sin propietario o
solicitud verificables solo permiten lectura; no se adoptan ni se reemplazan por otra
clave. Cambiar de cuenta cancela consultas en vuelo y oculta el estado previo.
Un 409 tardío vuelve a validar el recibo y la clave antes de guardar el rival:
si fueron reemplazados, desaparecieron o son inconsistentes, no escribe ni borra
el almacenamiento y muestra el bloqueo sin otro POST. Ocho regresiones del servicio
cubren esas variantes; un caso UI comprueba el recibo nuevo intacto y el error visible.

Tres casos UI adicionales cubren pendiente tras recarga, 404 exacto y 409 rival,
manteniendo un único POST. Dashboard muestra el inicio del intento pendiente, nunca
fechas de confirmación/rechazo ni pólizas derivadas. Son respuestas HTTP controladas:
no habilitan el proveedor ambiguo ni acreditan la recuperación SQL del backend.
La aceptación integrada del contrato `ec102` queda pendiente de la revisión backend
publicada y de probar ambos consumidores; no sustituirla por estas pruebas UI.
El consentimiento informado comprueba el payload
completo de la decisión (incluida la vigencia mostrada), rechazo y posterior
autorización versionada, cancelación/confirmación de revocación y lectura tras
recargar. Los mocks conservan el estado solo durante cada caso; no acreditan
persistencia real. También se verifica que la evidencia anterior incompleta y una
respuesta de autorización sin actor no habiliten cotizaciones.

## Fuentes de verdad y brechas

Prevalecen **Documento de arquitectura v7** y **enunciado**, no una estrategia anterior
que recomendara Playwright. Se revisaron enunciado pp. 8–9/11 y arquitectura
pp. 17/21/23/31/35.

| Requisito fuente            | Alcance alcanzable en este checkout                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seis journeys del enunciado | Cotización cliente web, aceptación/emisión académica y vida hipotecaria. Cotizar vuelo/clima **no equivale** a tramitar un siniestro paramétrico                                                                                              |
| Web gestión completa        | El portal del socio incluye cotización hipotecaria y recuperación de oferta. No acredita siniestros, una integración embebida externa, renovación, modificación, cancelación, reportes regulatorios o reaseguro                               |
| ASR-FIN-01 / ASR-EMI-01     | Idempotencia del pago **simulado** y póliza académica única, recuperación/nueva sesión y convergencia hasta 60 s. No acredita ledger bancario, firma legal, pérdida de respuesta real, caos/reinicio de servicios ni compensación distribuida |
| ASR-PRV-01                  | Revocación autoritativa online comprobada. No acredita propagación a batch/analítica/cachés ni cero divulgación a proveedores reales                                                                                                          |
| ASR-EXT-01                  | UI rechaza consentimiento vencido; perfil real vigente con `fallbackUsed=false`. No acredita circuit breaker/fallback de proveedor real o perfiles alterados: conservan pruebas unitarias específicas y experimentos backend                  |
| ASR-AUD-01                  | Correlación solicitud/oferta/suscripción/pago, versiones de perfil/regla y hash de decisión. No acredita WORM ni reconstrucción histórica del 100 % de decisiones                                                                             |
| Latencia p95/p99            | Cotización 250/500 ms; perfil+precio hipotecario 400/800 ms; decisión+emisión 1,5/3 s; consulta póliza 150/300 ms. Deben medirse con JMeter/experimentos backend, nunca con tiempos de Cypress                                                |

No se corrigen capacidades de producto fuera de alcance. El pago no cobra dinero;
las pólizas son académicas y no proporcionan cobertura real. La persistencia se
verifica mediante lecturas autenticadas y una sesión nueva, no mediante
inspección directa de SQLite ni únicamente texto visual.

## CI, informes y privacidad

`Cypress · UI determinista` corre en PR/push, junto a los checks existentes sin
desactivarlos. Los resultados JUnit se guardan separados en
`reports/cypress/ui/` y `reports/cypress/integrated/` (ignorados por Git); el runner
limpia únicamente el directorio de informes de la suite que ejecuta para no mezclar
éxitos antiguos con fallos recientes.

Jenkins reutiliza `pnpm test:cypress:ui` como etapa obligatoria de integración del
Frontend, precedida por el typecheck. Conserva su JUnit y bloquea la entrega ante
fallos o informes ausentes; no la presenta como la suite `integrated/` ni como AWS.
Solo después de las validaciones conserva el compilado con SHA y fingerprint
según `docs/ci.md`. No cambia el disparador `/test-jenkins` ni prepara infraestructura.

Vídeos y capturas están deshabilitados. Contraseñas, tokens, peticiones de setup y
observaciones autenticadas no se registran en el command log. No se suben logs
HTTP, bases, storage, fixtures con credenciales reales ni Cypress Cloud recordings.
Revisar siempre los informes antes de publicarlos: los errores pueden incluir
datos sintéticos/IDs, pero no deben incluir credenciales.

El CI integrado descarga por HTTPS el repositorio público `Migue765/backend-solventa`
y fija un commit que incluya el helper. No necesita claves SSH ni permisos de escritura.
Si el repositorio deja de ser público, el checkout falla; no se omiten las pruebas.

`Cypress · Integración real` es manual (`workflow_dispatch`): descarga la revisión
fijada, instala los servicios, arranca el mismo helper y lo detiene al salir.
Para ejecutar la suite remota, selecciona la rama que quieres comprobar al
disparar el workflow. Las pruebas locales no acreditan esa ejecución remota.

## Evidencia local de esta incorporación

Windows, Node 24.22.0, pnpm 11.19.0, Cypress 16.2.0 y Electron 146:
24/24 UI y 11/11 integradas aprobadas, sin pendientes ni skips. La integración usó
el helper real de la revisión
[`fdeccf51380cb0bf32f53f673922c2254a314eb3`](https://github.com/Migue765/backend-solventa/commit/fdeccf51380cb0bf32f53f673922c2254a314eb3),
BFF web en 5000 y bases SQLite migradas
temporales, con fuentes externas simuladas explícitamente. También pasaron 511
pruebas Vitest existentes, build Pages, lint, typecheck Cypress y la prueba del
runner. Estos resultados son una ejecución local, no evidencia de CI remoto ni
certificación de todos los requisitos de arquitectura.
El pin actualiza únicamente el workflow, la documentación y su prueba de protección
manual del backend, sin cambios en APIs ni en el helper. No se repitió Cypress
integrado contra el nuevo SHA.

Tras incorporar el contrato de consentimiento informado de `develop`, se
reprodujeron 17 fallos UI debidos a mocks desactualizados. La corrección conserva
las validaciones del producto y actualiza los datos y la confirmación de revocación
de las pruebas: 27/27 UI aprobadas localmente, sin pendientes ni skips. El caso
integrado de revocación también espera la confirmación HTTP real antes de comprobar
los 403; no se volvió a ejecutar la suite integrada en esta corrección.

Para SOL-205 se ejecutaron localmente las 12 pruebas integradas contra
`4fbe81798962dea6780ddc3e56d00490d5a68796` y las 35 UI controladas, sin fallos ni
casos omitidos. El entorno fue Windows, Node 22.23.2, pnpm 11.19.0 y Cypress 16.2.0.
También pasaron las 52 regresiones HTTP del gateway/panel socio, las cinco pruebas
del runner, el typecheck Cypress, lint y build Pages. No se ejecutó CI remoto,
una auditoría manual de accesibilidad ni una medición de latencia productiva.
