# Pruebas adicionales con Cypress

Se ejecuta **la aplicación Angular existente en modo `local` (gateways HTTP)**.
No hay otra aplicación demo, servidor de negocio simulado ni adaptación del producto
para hacer pasar pruebas. Las pruebas unitarias Vitest siguen cubriendo lógica,
adaptadores y casos de borde; Cypress añade interacción real del navegador.

## Dos suites con evidencia distinta

| Suite         | Qué demuestra                                                                                                              | Qué no demuestra                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ui/`         | Formularios, rutas, consentimiento, errores, reintentos y presentación bajo respuestas HTTP controladas con `cy.intercept` | Autenticación, persistencia o integridad de servicios reales                          |
| `integrated/` | Navegador → BFF web → identidad, perfilamiento, cotización y pólizas reales, con bases temporales migradas                 | Producción, Open Finance real, pasarela bancaria, firma legal, rendimiento bajo carga |

`integrated/` no importa fixtures de `ui/` ni reemplaza respuestas de negocio.
Los interceptores de esa suite observan peticiones para correlacionar sus resultados.
El setup registra cuentas sintéticas por API porque **no existe pantalla de registro**.
Cada caso usa correo único `cypress-<uuid>@example.com` y contraseña aleatoria;
no necesita cuentas preexistentes ni secretos productivos.

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

Revisión reproducible publicada por SSH:
[`fdeccf51380cb0bf32f53f673922c2254a314eb3`](https://github.com/Migue765/backend-solventa/commit/fdeccf51380cb0bf32f53f673922c2254a314eb3).
El workflow usa ese SHA inmutable, no `develop` ni una rama que pueda cambiar.

```sh
# En el checkout backend de pruebas, nunca en producción:
python -m tests.jmeter.local_stack --web-port 5000 --mobile-port 5001
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
Al cerrar el helper backend se eliminan sus bases temporales: no se borran cuentas
reales ni se presupone una API de limpieza inexistente.

## Cobertura funcional

| Área implementada        | UI controlada                                                                                                      | Integración real                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Identidad                | Campos requeridos/email, 401/429/503, recuperación, guardas, refresh fallido, logout                               | Registro API, duplicado, login UI válido/inválido, petición anónima, renovación al recargar, refresh revocado, nueva sesión |
| Ocho productos           | Obligatorios y payload exacto de cada formulario                                                                   | Ocho recorridos independientes completos                                                                                    |
| Productos                | Automotriz, viaje, vida, dispositivos, vuelo paramétrico, clima paramétrico, protección de pagos, vida hipotecaria | Los mismos ocho, con datos sintéticos y fechas relativas                                                                    |
| Validaciones específicas | Saldo hipotecario cero, destino fuera de catálogo, fechas invertidas, ofertas vencidas/retiradas                   | Contratos transmitidos y prima positiva del servicio                                                                        |
| Consentimiento           | Ausente, autorización, revocación, expiración                                                                      | Ausente denegado, autorización durable, revocación deniega nuevo perfil y nueva cotización con 403                          |
| Oferta/suscripción       | Condiciones obligatorias, oferta cambiada, revisión/rechazo no permiten pagar                                      | Selección persistida, decisión aprobada, hash y versión de regla, perfil con fuentes/modelo/versiones                       |
| Pago simulado            | Fallo y reintento con misma clave; importe discordante no muestra éxito                                            | Importe igual a oferta, misma referencia en replay de clave, un pago y una póliza                                           |
| Recuperación             | Error de dashboard y solicitud con reintento                                                                       | Recarga, logout, borrado de storage, login nuevo, dashboard y deep link a suscripción recuperados del backend               |
| Ownership                | No se presenta oferta tras fallo de recuperación                                                                   | Segundo usuario recibe 404 en solicitud/ofertas/selección/suscripción/perfil/pago y dashboard vacío                         |

No hay `cy.wait(ms)` ni reintentos automáticos de tests. La sincronización usa
observación HTTP y assertions reintentables de Cypress. La emisión se consulta
con polling de estado real, backoff 100–1000 ms y límite total de 60 segundos.
Ese límite detecta falta de convergencia funcional; **no mide p95/p99**.

## Fuentes de verdad y brechas

Prevalecen **Documento de arquitectura v7** y **enunciado**, no una estrategia anterior
que recomendara Playwright. Se revisaron enunciado pp. 8–9/11 y arquitectura
pp. 17/21/23/31/35.

| Requisito fuente            | Alcance alcanzable en este checkout                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seis journeys del enunciado | Cotización cliente web, aceptación/emisión académica y vida hipotecaria. Cotizar vuelo/clima **no equivale** a tramitar un siniestro paramétrico                                                                                              |
| Web gestión completa        | No hay siniestros, socios embebidos/back-office, renovación, modificación, cancelación, reportes regulatorios o reaseguro integrados en rutas actuales. No se inventan pruebas verdes para ellos                                              |
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

Vídeos y capturas están deshabilitados. Contraseñas, tokens, peticiones de setup y
observaciones autenticadas no se registran en el command log. No se suben logs
HTTP, bases, storage, fixtures con credenciales reales ni Cypress Cloud recordings.
Revisar siempre los informes antes de publicarlos: los errores pueden incluir
datos sintéticos/IDs, pero no deben incluir credenciales.

El CI integrado necesita checkout backend por **SSH** y un commit publicado que
incluya el helper. No se crean claves o secretos automáticamente. La falta de
credencial o backend es un fallo explícito, no una ejecución omitida.

`Cypress · Integración real` es manual (`workflow_dispatch`): descarga la revisión
fijada, instala los servicios, arranca el mismo helper y lo detiene al salir.
Un administrador debe provisionar `SOLVENTA_BACKEND_SSH_KEY` con acceso SSH autorizado
de Migue765 al repositorio backend; no se encontró una credencial Actions reutilizable
en la configuración del checkout. **La ejecución remota integrada queda pendiente
de esa configuración y de disparar el workflow**, aunque las pruebas locales hayan
pasado. No activar ejecuciones con secretos sobre cambios no confiables.

## Evidencia local de esta incorporación

Windows, Node 24.22.0, pnpm 11.19.0, Cypress 16.2.0 y Electron 146:
24/24 UI y 11/11 integradas aprobadas, sin pendientes ni skips. La integración usó
el helper real de la revisión indicada, BFF web en 5000 y bases SQLite migradas
temporales, con fuentes externas simuladas explícitamente. También pasaron 511
pruebas Vitest existentes, build Pages, lint, typecheck Cypress y la prueba del
runner. Estos resultados son una ejecución local, no evidencia de CI remoto ni
certificación de todos los requisitos de arquitectura.
