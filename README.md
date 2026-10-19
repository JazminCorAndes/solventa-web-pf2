# Solventa Web

Aplicación web de Solventa para Proyecto Final II de la Universidad de los Andes.

Este repositorio contiene la base técnica de la aplicación web. El alcance funcional se
gestiona en Jira y las decisiones visuales deben seguir la versión más reciente de Figma.

## Comprobaciones y cobertura

[📊 Cobertura de código](https://github.com/Migue765/backend-solventa/wiki/Cobertura-de-codigo)

En cada [pull request](https://github.com/JazminCorAndes/solventa-web-pf2/pulls), abre **Checks → Cobertura**
para ver líneas, ramas, pruebas y revisión compilada. El reporte corresponde a ese commit;
no es un porcentaje fijo de la portada. En web mide el código instrumentado por Angular/Vitest V8.

Actions se ejecuta automáticamente. Un colaborador solicita Jenkins con un comentario nuevo
`/test-jenkins`; después de subir cambios debe solicitarlo para la revisión nueva.
Los reportes HTML/XML se conservan en Jenkins privado. No se exige un porcentaje mínimo nuevo.
Consulta [la guía de CI](docs/ci.md) para ver alcance, nombres y lectura de resultados.

## Tecnologías

- Angular 22
- Angular Material 22
- TypeScript 6 en modo estricto
- pnpm 11
- SCSS
- Transloco
- Vitest
- ESLint
- Prettier
- GitHub Actions

## Requisitos previos

- Node.js 22.22.3 o superior
- pnpm 11.19.0
- Git

La versión esperada de Node.js está declarada en `.nvmrc` y la versión de pnpm en
`package.json`.

Comprueba las versiones instaladas:

```bash
node --version
pnpm --version
git --version
```

## Instalación

```bash
git clone git@github.com:JazminCorAndes/solventa-web-pf2.git
cd solventa-web-pf2
pnpm install --frozen-lockfile
```

## Desarrollo local con mocks

```bash
pnpm start
```

La aplicación estará disponible en `http://localhost:4200`. Este modo usa los adaptadores
simulados y no requiere ejecutar el backend.

El tablero de inicio es una excepción: no tiene adaptador simulado y requiere una sesión
del backend. En este modo informa el error de conexión en lugar de mostrar datos ficticios.
Para consultar el resumen real, usa el modo con backend.

Credenciales del adaptador simulado:

```text
Correo: cliente@solventa.co
Contraseña: Solventa123!
```

## Desarrollo local con backend

Este modo conecta el frontend con el BFF Web, identidad y cotización. Se necesitan
los repositorios `solventa-web-pf2` y `backend-solventa`, con versiones compatibles del
contrato multirramo descrito más adelante. Los cambios de API de esta funcionalidad
deben estar presentes en el backend antes de cotizar vuelos con pérdida de conexión o clima.

No existe fallback automático a mocks: si el backend no está disponible, la aplicación informa
el error. Para volver a los mocks, se debe detener el servidor y ejecutar `pnpm start`.

### 1. Preparar y ejecutar los servicios

Sigue la sección **Integración local** de `services\bff-web\README.md` en el checkout
compatible de [backend-solventa](https://github.com/Migue765/backend-solventa).
Allí se incluyen instalación, migraciones y configuración de los tres servicios.
Inicia identidad, cotización y BFF en terminales separadas. La base de datos y las claves
de firma pertenecen a los servicios backend; no se configuran ni se incluyen en Angular.

Los ejemplos del backend usan el puerto 15001 para el BFF. Para conservar
`proxy.conf.json` sin cambios, inicia ese servicio en el puerto 5001, manteniendo las
variables de entorno indicadas en su guía:

```powershell
.\.venv\Scripts\python -m flask --app bff_web.app run --host 127.0.0.1 --port 5001
```

Si prefieres conservar el puerto 15001 del backend, cambia `target` en `proxy.conf.json`
a `http://127.0.0.1:15001` y utiliza ese mismo origen al registrar la cuenta.
No se usa la antigua autenticación
por cookie ni `AUTH_DEVELOPMENT_USERS_JSON`: identidad emite tokens Bearer.

### 2. Crear una cuenta local

Si aún no existe un usuario de pruebas, regístralo mediante el BFF. En PowerShell:

```powershell
$credential = Get-Credential -Message "Correo y contraseña de la nueva cuenta local"
$body = @{
  nombre = Read-Host "Nombre del cliente"
  correo = $credential.UserName
  contrasena = $credential.GetNetworkCredential().Password
} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5001/v1/usuarios" `
  -Method Post -ContentType "application/json" -Body $body | Select-Object id
Remove-Variable body, credential
```

Usa un correo nuevo y una contraseña que cumpla las reglas de identidad. Las credenciales
del adaptador mock no crean automáticamente una cuenta en el backend.

### 3. Ejecutar el frontend conectado

Desde `solventa-web-pf2`:

```powershell
pnpm install --frozen-lockfile
pnpm start:backend
```

La aplicación estará disponible en `http://localhost:4200`. `pnpm start:backend` usa la
configuración `local` (`apiBaseUrl: '/api'`) y el proxy de desarrollo reenvía `/api` al BFF en
`http://localhost:5001`, quitando el prefijo `/api`. Las peticiones protegidas usan
el esquema `Bearer` en el encabezado `Authorization`.

Inicia sesión con el correo y la contraseña registrados. No copies tokens en archivos
del frontend, parámetros de URL ni registros.

### Backend desplegado en AWS

El build de producción (`pnpm build`) y `pnpm start:aws` usan el API Gateway directamente
(`src/environments/environment.ts`, `apiBaseUrl: https://65qgzhody9.execute-api.us-east-2.amazonaws.com`).
No hay proxy ni cookies: la autenticación usa tokens JWT.

### Tablero integrado

El inicio consume `GET /v1/clientes/me/dashboard` del BFF principal con el interceptor
Bearer de la sesión. Requiere la versión de backend que implementa ese contrato; un
404, 503 o una respuesta inválida se muestran como error con reintento, nunca como
una cuenta vacía. No se envía un identificador de cliente ni se usa un fallback a fixtures.

La respuesta contiene `cotizaciones`, `suscripciones`, `pagos`, `polizas` y la disponibilidad
de `notificaciones`. El inicio muestra cotizaciones, pólizas y pagos
persistidos del usuario autenticado; listas vacías válidas se presentan como ausencia
de registros. Se conservan los estados, fechas e importes decimales del contrato,
sin sumar monedas ni periodicidades distintas. La prima estimada no tiene periodicidad;
solo la selección y el pago muestran su periodicidad registrada.

Los pagos continúan siendo **simulados**, sin tarjeta ni cobro real. Las pólizas son
**académicas**, sin cobertura de seguro real, y requieren emisión persistida en el backend.
`polizas` debe ser una lista con `id`, `suscripcionId`, `tipo`, `fechaInicio`, `fechaFin`
y `estado`, además de `simulada: true`; las vigencias son fechas de calendario `YYYY-MM-DD`, no instantes UTC.
El inicio muestra esos campos sin reconstruir pólizas desde la suscripción ni la saga.
Una respuesta antigua con `polizas: { disponibilidad: 'no_implementado' }` se trata
como error de contrato y permite reintentar; nunca se interpreta como una lista vacía.
Se requiere desplegar primero el backend compatible. Se retira el panel de funciones
no implementadas; esto no habilita notificaciones.
El resumen no reconstruye ni reactiva solicitudes históricas: el enlace para cotizar
usa el flujo existente, con consentimiento y perfilamiento, sin cambiar la solicitud
activa al consultar el historial. Al salir o cambiar de usuario se descarta el resumen
y se cancela su petición pendiente.

Las pruebas HTTP y de componentes conservan además las capturas literales históricas
`src/app/data-access/dashboard/testing/dashboard-{populated,empty}-real.json`.
Provienen del contrato anterior, de respuestas 200 del BFF con SQLite y claves foráneas activas, después
del flujo crear solicitud → ofertas → selección → suscripción → pago simulado
para las cuatro periodicidades, y de una cuenta sin registros. No contienen
credenciales ni datos personales y solo se importan en pruebas. Se conservan
sin reformatear para preservar los bytes originales y comprobar que el contrato antiguo
se rechaza explícitamente; no son fixtures de producción.
Este cotejo local no acredita el despliegue de la nueva API ni del consumidor en AWS/Pages.

La captura `src/app/data-access/dashboard/testing/dashboard-policies-integration.json`
incluye respuestas vacía y poblada del contrato nuevo, obtenidas por el backend mediante
JWT y llamadas HTTP reales BFF → Cotización → Pólizas con dos bases SQLite temporales
migradas. Las pruebas del adaptador y del componente consumen esas respuestas y cotejan
vigencias, tipo, estado y suscripción de origen. Es evidencia de compatibilidad del contrato,
no una verificación del entorno principal desplegado, ni datos de producción.

### Historial de cotizaciones y continuación

`/app/cotizaciones` consulta el dashboard autenticado y recupera cada solicitud mediante
`GET /v1/solicitudes-cotizacion/{id}`. Muestra tarjetas independientes, ordenadas por
fecha, sin depender de la última solicitud de `sessionStorage`. El backend calcula y
guarda solicitud y cotización atómicamente; el dashboard incluye todas esas solicitudes.

Cada tarjeta continúa su propia solicitud (`?solicitud={id}`): ofertas cuando no hay
selección, aceptación cuando falta crear la suscripción, pago para suscripciones
aprobadas pendientes y detalle para las pagadas. La guarda recupera solicitud, selección
y suscripción del propietario antes de habilitar el destino; una recuperación fallida
se informa explícitamente. Consultar el listado no cambia la solicitud activa ni
confirma ofertas o pagos.

Los estados superiores son «Solicitud en proceso», «Activa» y «Vencida». El vencimiento
usa exclusivamente `vigenteHasta` de la suscripción (fin exclusivo), nunca `validaHasta`
de la cotización. El backend compatible entrega `vigenteDesde`/`vigenteHasta` como ISO UTC
o `null` tanto en suscripción individual como en dashboard. Si no informa fin contractual,
no se inventa un vencimiento. El detalle muestra la vigencia disponible y el comprobante
de pago simulado; no habilita un segundo pago ni supone emisión de una póliza real.

| Configuración | `apiBaseUrl`             | Uso                                        |
| ------------- | ------------------------ | ------------------------------------------ |
| `production`  | URL del API Gateway      | `pnpm build`                               |
| `backend`     | URL del API Gateway      | `pnpm start:aws`, `pnpm build:aws`         |
| `local`       | `/api` (proxy a `:5001`) | `pnpm start:backend`, `pnpm build:backend` |
| `development` | `/api` (sin uso, mocks)  | `pnpm start`, `pnpm build:dev`             |

El frontend se sigue publicando en GitHub Pages. El CORS lo resuelve el API Gateway, que permite
los orígenes `https://jazmincorandes.github.io` y `http://localhost:4200`, los encabezados
`Authorization`, `Content-Type`, `Idempotency-Key` y `X-Correlation-ID`, y no requiere
credenciales.

### Publicar esta versión en GitHub Pages

El workflow separado `.github/workflows/pages.yml` publica únicamente después del CI
exitoso de un `push` a `master`, tras integrar la release siguiendo sus protecciones.
No publica desde ramas feature, develop ni PRs. Reutiliza el sitio compilado por CI,
sin repetir lint, pruebas o compilación; solo el job de despliegue recibe `pages: write` e
`id-token: write`, y utiliza el environment `github-pages`. La concurrencia evita
despliegues simultáneos.

**Requisito administrativo:** Pages debe usar GitHub Actions y el environment
`github-pages` conserva `master` y `develop` permitidas: GitHub ejecuta `workflow_run`
desde la rama predeterminada (`develop`). CD comprueba por API que el artefacto procede
del CI exitoso de `master`; esa es la versión publicada, no la de la rama de ejecución.
No se modifican ni eluden las revisiones o protecciones del environment.

`pnpm build:pages` utiliza producción (backend AWS, no mocks) con base
`/solventa-web-pf2/` y genera el artefacto `dist/solventa-web-pf2/browser`.
`scripts/prepare-pages.cjs` copia el `index.html` compilado a `404.html`, rechazando
un build con base incorrecta. Pages sirve esa entrada al abrir o recargar una ruta
profunda, conservando la URL para el router Angular. Las traducciones se resuelven
respecto al `<base>` del documento, tanto en Pages como en `localhost:4200`.

El fallback de Pages sigue devolviendo HTTP `404` para rutas profundas aunque la
aplicación pueda arrancar: no equivale a un rewrite HTTP `200`, ni garantiza SEO o
que los clientes sin JavaScript vean el contenido. Los guards de autenticación se
mantienen. Tras el despliegue debe verificarse en navegador el inicio de sesión y
la apertura/recarga de una URL profunda; las pruebas de artefacto no sustituyen
esa validación ni prueban conectividad con AWS.

## Autenticación con tokens

1. `POST /v1/sesiones` devuelve un **access token** (JWT, de corta duración; el vencimiento lo
   informa el backend en `expiraEn`) y un **refresh token** (`refreshExpiraEn`).
2. El access token vive **solo en memoria** (`AuthService`). El refresh token se guarda en
   `sessionStorage` (`solventa.auth.refresh`) junto con los datos del usuario.
3. El interceptor `authInterceptor` agrega `Authorization: Bearer <token>` a las llamadas al API,
   excepto `POST /v1/sesiones`, `POST /v1/sesiones/renovar` y `POST /v1/usuarios`.
4. Ante un `401`, renueva con `POST /v1/sesiones/renovar` (el refresh token rota en cada uso) y
   reintenta la petición una sola vez. Varias peticiones concurrentes comparten una única
   renovación. Si el refresh es inválido, se limpia la sesión y se redirige a `/iniciar-sesion`.
5. Al recargar la página, `AuthService.synchronizeSession()` obtiene un access token nuevo con el
   refresh guardado; si falla con `401`, la app queda sin sesión.
6. El cierre de sesión llama a `DELETE /v1/sesiones/actual` con el refresh token y limpia el
   almacenamiento aunque la llamada falle.

`AuthService.register()` expone `POST /v1/usuarios`; todavía no hay pantalla de registro.

Si la respuesta del BFF no incluye documento o teléfono, la interfaz lo indica como
no disponible en vez de inventar datos personales.

## Perfilamiento HU11 (SOL-163)

El formulario requiere consultar y autorizar el consentimiento antes de cotizar. La identidad
se obtiene del token Bearer de la sesión: no se envía `clienteId` desde el formulario
ni se usan cookies en las peticiones.
El formulario conectado no solicita documento ni contacto: el BFF los obtiene de la sesión.
La creación envía solamente `{ productoId, datosProducto }`, junto con una clave de
idempotencia. Los datos de riesgo dependen del ramo; para automotriz incluyen `vehiclePlate`.
Las primas y selecciones conservan la moneda devuelta por el BFF (COP en el backend actual),
sin convertirla ni presentarla como UF. Se conservan prima y periodicidad propias del ramo;
los adaptadores mock usan COP y no fabrican mensualidades.

El panel permite autorizar y revocar; envía la versión vigente, o `0` para la primera
autorización. Ante un conflicto se exige recargar antes de volver a escribir. La autorización
persiste en el backend, dura 30 días y comprende Open Finance y Open Data para cotización.

El panel se conserva en «Solicitar cotización» para gestionar la autorización y en el
resumen para consultar el perfil de la solicitud. En el resumen muestra el identificador
de solicitud y perfil, score decimal, nivel,
versiones de perfil/modelo/consentimiento, fechas y fuentes. Las fuentes actuales son
**simuladas** y no representan una consulta financiera real. No se guardan perfiles en
`sessionStorage`; el panel los consulta al BFF.

«Elige tu plan» (`/app/cotizaciones/ofertas`) no muestra el panel ni consulta consentimiento
o perfilamiento. Al entrar carga directamente las ofertas de la solicitud vigente desde
`GET /v1/solicitudes-cotizacion/{id}/ofertas` y recupera la selección existente. Una consulta
de perfilamiento no disponible no bloquea esta pantalla. Se conservan JWT, autorización
por usuario y validaciones del backend, selección, primas y periodicidades. Los errores
reales de ofertas se muestran con opción de reintentar, sin fallback a mocks ni perfiles
inventados; si el backend devuelve un error de consentimiento o perfil, también se informa.

En las pantallas que conservan el panel, se retiran sus datos al vencer el perfil, sus
fuentes o el consentimiento; al recuperar el foco de la ventana se vuelve a consultar.
Revocar, renovar el consentimiento o dejar vencer el perfil puede exigir crear una nueva
solicitud: no se reemplaza silenciosamente el perfil original.

Para comparar vigencias, el adaptador HTTP usa `Date` del servidor y un reloj monótono.
Así, un pequeño desfase del computador no rechaza datos recién creados en AWS. Se usa un
límite superior conservador (precisión de un segundo más el viaje de la petición): el panel
puede retirar datos ligeramente antes, nunca extender su vigencia. Si falta un `Date`
válido, la consulta se bloquea con un error en lugar de confiar en un reloj local desconocido.

Contratos consumidos (todos con token Bearer):

| Método    | Ruta                                                    | Uso                                                                     |
| --------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| GET       | `/v1/consentimientos/perfilamiento`                     | Leer autorización; solo `404 consentimiento_ausente` significa ausencia |
| PUT       | `/v1/consentimientos/perfilamiento`                     | `{ autorizado: boolean, version: number }`                              |
| POST      | `/v1/solicitudes-cotizacion`                            | Crear solicitud y asociar su perfil                                     |
| GET       | `/v1/solicitudes-cotizacion/{id}/perfilamiento`         | Leer el perfil usado por la solicitud                                   |
| GET / PUT | `/v1/solicitudes-cotizacion/{id}/ofertas` / `seleccion` | Revalidación del perfil en el backend                                   |

En modo mock el consentimiento y los perfiles se conservan solamente en memoria, separados por
usuario. Al recargar la aplicación se debe autorizar y crear otra solicitud. No hay llamadas a
proveedores financieros reales. Los componentes usan los estilos y tokens existentes; no se ha
verificado fidelidad visual con Figma.

### Prueba local contra AWS

Se requieren un BFF con HU11 desplegado y un usuario de prueba habilitado. El modo AWS usa
el API Gateway directamente con tokens Bearer, sin proxy ni cookies:

```powershell
pnpm start:aws
```

Abrir `http://localhost:4200` y probar inicio de sesión, ausencia de autorización, autorización,
solicitud, perfil, ofertas y revocación. CORS debe permitir el origen local y exponer el
encabezado `Date` para comparar vigencias. No usar credenciales de producción ni desactivar
la validación TLS del destino AWS. Las pruebas unitarias no demuestran esta integración real.

## Aplicación en GitHub Pages

La rama `master` se publica automáticamente con el backend AWS, sin adaptadores simulados:

```text
https://jazmincorandes.github.io/solventa-web-pf2/
```

GitHub Pages solo sirve el frontend estático; el backend se ejecuta en AWS. Para iniciar
sesión se necesita una cuenta registrada en ese backend, no las credenciales del modo mock.

## Comandos disponibles

| Comando              | Descripción                                                  |
| -------------------- | ------------------------------------------------------------ |
| `pnpm start`         | Inicia el desarrollo con adaptadores simulados               |
| `pnpm start:backend` | Inicia el desarrollo conectado al BFF local                  |
| `pnpm start:aws`     | Inicia el desarrollo conectado al backend en AWS             |
| `pnpm build`         | Genera el build de producción conectado al backend           |
| `pnpm build:pages`   | Compila producción para la subruta Pages y genera `404.html` |
| `pnpm build:dev`     | Genera un build de desarrollo con mocks                      |
| `pnpm build:backend` | Genera un build de desarrollo conectado al BFF local         |
| `pnpm build:aws`     | Genera un build de desarrollo conectado al API en AWS        |
| `pnpm test`          | Ejecuta las pruebas en modo interactivo                      |
| `pnpm test:ci`       | Ejecuta las pruebas una sola vez                             |
| `pnpm test:pages`    | Verifica la generación del fallback SPA de Pages             |
| `pnpm lint`          | Ejecuta ESLint                                               |
| `pnpm format`        | Formatea el código con Prettier                              |
| `pnpm format:check`  | Comprueba el formato sin modificar archivos                  |

## Verificación de la instalación

1. Confirma que `pnpm install --frozen-lockfile` termina correctamente.
2. Ejecuta `pnpm start` y abre <http://localhost:4200>.
3. Ejecuta `pnpm test:ci`.
4. Ejecuta `pnpm lint`.
5. Ejecuta `pnpm build`.

Registra cualquier diferencia de versiones o error y actualiza esta guía si se identifica un
paso faltante.

## Estructura del repositorio

```text
public/
  assets/i18n/        Traducciones estáticas
src/
  app/
    core/             Contratos y lógica de autenticación, cotizaciones y ofertas
    data-access/      Adaptadores reemplazables para acceso a datos
    features/         Pantallas organizadas por funcionalidad
    layout/           Estructuras de navegación
    shared/           Componentes reutilizables
    app.config.ts     Proveedores globales
    app.routes.ts     Rutas de la aplicación
  styles/             Tokens, tema Material y estilos base
  styles.scss         Punto de entrada de estilos
```

## Internacionalización

Transloco está configurado con español como idioma predeterminado e inglés como idioma
adicional. Las traducciones se encuentran en:

- `public/assets/i18n/es.json`
- `public/assets/i18n/en.json`

## Mercado activo

La aplicación opera actualmente para Colombia, con precios en COP, formato regional `es-CO`
y prefijo telefónico `+57`. Estos valores se centralizan en
`src/app/core/market/market.config.ts` para facilitar la habilitación futura de México, Chile y
Perú sin mezclar reglas entre mercados.

Los importes usan un contrato neutral compuesto por monto y código de moneda ISO 4217. El
catálogo permite cotizar seguros automotrices, de viaje, protección de dispositivos,
microseguros de vida, seguros de vuelos y clima, protección de pagos y vida hipotecaria. Cada producto
solicita sus datos de riesgo específicos y genera ofertas comparables en COP.

### Variantes de cotización

El catálogo conserva el seguro automotriz y cubre los ramos del caso Solventa
(secciones 2.2, 2.4 y 5.1 del enunciado). Los datos del cliente provienen de la sesión;
el formulario solicita únicamente los datos propios del seguro.

| Producto (`productoId`) | Datos enviados en `datosProducto`                                   |
| ----------------------- | ------------------------------------------------------------------- |
| `automotive`            | `vehiclePlate`                                                      |
| `travel`                | `destinationCountryCode`, `departureDate`, `returnDate`             |
| `life`                  | `birthDate`                                                         |
| `device-protection`     | `deviceType`, `brandModel`, `purchaseValue`                         |
| `parametric`            | `airline`, `flightNumber`, `flightDate`, `coverageType`             |
| `parametric-weather`    | `location`, `weatherEvent`, `startDate`, `endDate`, `insuredAmount` |
| `payment-protection`    | `creditType`, `monthlyPayment`                                      |
| `mortgage-life`         | `birthDate`, `mortgageBalance`                                      |

El POST a `/api/v1/solicitudes-cotizacion` conserva el cuerpo
`{ productoId, datosProducto }`; todos los valores de `datosProducto` son cadenas.
Las fechas se ingresan como `DD/MM/AAAA` en español colombiano y se envían como
`YYYY-MM-DD`; los importes se expresan en pesos colombianos enteros.

Las ofertas y la selección requieren `prima: { monto, moneda }` con `periodicidad`:
`mensual`, `por_viaje`, `por_vuelo` o `por_periodo`. La interfaz muestra el importe y la moneda recibidos
con el periodo correspondiente, sin convertir primas por viaje o vuelo en mensualidades.
El alias `primaMensual` puede ser nulo para primas no mensuales; no se usa como respaldo
ante respuestas HTTP antiguas o incompletas. Solo las selecciones antiguas ya guardadas
en la pestaña conservan la migración local desde `monthlyPremium`.
Los valores de compra, cuota y saldo hipotecario admiten enteros positivos de hasta 16 cifras.

El catálogo muestra la disponibilidad real: los productos no disponibles se pueden consultar,
pero no cotizar. Solo el error `404` con código `seguro_no_encontrado` representa un producto
inexistente; un `404` de infraestructura se muestra como error recuperable.

En vuelos, `coverageType` admite `delay-cancellation`, `missed-connection` y
`comprehensive`. El backend mantiene las solicitudes antiguas sin ese campo como
retraso o cancelación. La pérdida de conexión está sujeta a las causas y exclusiones
del plan, no a cualquier vuelo perdido por el pasajero.

El seguro climático permite lluvia intensa (`heavy-rain`) o sequía (`drought`), con
municipio y departamento en texto de hasta 120 caracteres y valor asegurado de
1 a 1.000.000.000 COP. Las fechas de vuelo y clima deben ser posteriores a hoy.
La fecha final climática no puede preceder al inicio y el periodo admite hasta
366 días, contando ambas fechas. Estos campos son decisiones del contrato de
cotización; el enunciado no define un proveedor ni un umbral meteorológico concreto.

En modo mock, el catálogo y las ofertas son ejemplos locales, no una tarifa actuarial
personalizada. Las ofertas respetan el ramo y la cobertura elegidos; un producto
desconocido no recibe ofertas automotrices por defecto. En modo backend se consultan
las ofertas del servicio y se envía la selección con su versión. El cálculo y las
fuentes externas que ese servicio simule siguen siendo simulados: usar HTTP no los
convierte en integraciones reales. Cotizar no emite una póliza ni activa monitoreo,
aceptación formal o pagos de siniestros.

## Autenticación de desarrollo

En modo mock, los datos no salen del navegador y la sesión se conserva en `sessionStorage`.

En modo backend la sesión se maneja con tokens JWT (ver «Autenticación con tokens»): el access
token no se persiste y el refresh token se guarda en `sessionStorage`. Al iniciar la aplicación
se renueva la sesión con el backend.

## Sistema visual

Angular Material es la biblioteca base de componentes. Cada componente standalone importa
solamente los módulos Material que utiliza; no existe un módulo global que exporte toda la
biblioteca.

Los estilos se organizan así:

- `src/styles/_tokens.scss`: colores, espaciado, radios y valores de Solventa.
- `src/styles/_material-theme.scss`: tema y overrides oficiales de Angular Material.
- `src/styles/_base.scss`: estilos base y reglas generales de accesibilidad.
- Archivos SCSS de componentes: distribución y comportamiento responsive local.

Las personalizaciones deben usar primero el tema, los tokens y las APIs oficiales de overrides.
No se deben modificar clases internas de Material.

## Flujo de trabajo Git

El repositorio usa GitFlow:

- `master`: versiones estables.
- `develop`: integración del trabajo aprobado.
- `feature/*`: funcionalidades y tareas.
- `release/*`: preparación de versiones.
- `hotfix/*`: correcciones urgentes de producción.

Todo cambio compartido debe llegar mediante pull request. Las ramas `master` y `develop`
requieren al menos una aprobación, conversaciones resueltas y validaciones exitosas antes de
integrar cambios.

## Integración continua

GitHub Actions ejecuta en cada pull request dirigido a `master` o `develop`:

1. Instalación reproducible con el lockfile.
2. Lint.
3. Pruebas unitarias.
4. Build de producción.

## Alcance actual

La aplicación incluye inicio de sesión, sesión de cliente, rutas protegidas, cierre de sesión,
dashboard, solicitud de cotización y comparación de ofertas. Autenticación, solicitudes y
ofertas pueden ejecutarse con adaptadores simulados o contra el BFF real. El dashboard continúa
usando datos simulados.

En modo backend, las solicitudes y selecciones quedan persistidas por el servicio de
cotización. `sessionStorage` conserva la referencia necesaria para reanudar el flujo en la
misma pestaña. Las ofertas vencidas o retiradas permanecen visibles para comparación, pero no
se pueden seleccionar.

La selección mediante `PUT /v1/solicitudes-cotizacion/{id}/seleccion` es la aceptación definitiva
y envía `{ ofertaId, version }` con `Idempotency-Key` UUID. La suscripción se inicia con
`POST /v1/solicitudes-cotizacion/{id}/suscripcion`, cuerpo `{}` y otra clave UUID; se consulta
con `GET` sobre la misma ruta. La interfaz muestra las decisiones aprobada, en revisión o
rechazada y los estados reales de la saga, sin presentar datos cacheados como éxito tras un error.
La continuación «Proceder al pago» inicia o recupera la suscripción y muestra su estado real.
Si falla después de aceptar la oferta, el error permanece visible y se puede reintentar sin
repetir la aceptación. Durante la solicitud se bloquean los clics repetidos.

Para una suscripción aprobada, la pantalla consulta el importe y la periodicidad de la selección
aceptada en el backend y recupera el pago con
`GET /v1/solicitudes-cotizacion/{id}/pago-simulado`. Solo un `404` con código
`pago_no_encontrado` significa que aún no hay pago; una solicitud ajena o inexistente sigue
siendo un error. El usuario debe pulsar «Confirmar pago simulado» de forma explícita.
El `POST` sobre la misma ruta envía `{}`, Bearer JWT y `Idempotency-Key` UUID, sin importe
ni datos de tarjetas. La clave se conserva en `sessionStorage` por suscripción para reintentar
incluso tras una recarga; el resultado siempre se recupera del servidor, no de un éxito local.
La confirmación muestra la referencia `SIM-…`, el importe y el estado persistidos; después
se vuelve a consultar la suscripción para mostrar la saga `pago_confirmado`.
Las periodicidades `mensual`, `por_viaje`, `por_vuelo` y `por_periodo` se conservan sin convertirlas
en mensualidades. Los estados en revisión, rechazada, fallida o emitida no habilitan nuevos pagos.
Esta simulación requiere el modo backend: no cobra dinero, no abre un checkout real y no
emite pólizas. No se implementa un éxito ficticio en el modo mock.
Siniestros, detalle de pólizas, notificaciones y recuperación de contraseña permanecen
fuera del alcance actual.

## Referencias

- **Jira:** consultar el backlog y los criterios de aceptación aprobados.
- **Figma:** consultar el archivo de diseño vigente antes de implementar pantallas.
- **Backend:** consultar la sección de desarrollo local con backend para ejecutar la integración.

## Solución de problemas

### La instalación falla

- Comprueba `node --version` y `pnpm --version`.
- Confirma que estás en la carpeta que contiene `package.json`.
- Vuelve a ejecutar `pnpm install --frozen-lockfile` y revisa el mensaje completo.

### El puerto 4200 está ocupado

Cierra el proceso que utiliza el puerto o consulta con el equipo el puerto alternativo acordado.

### Las pruebas o el build fallan

Ejecuta `pnpm test:ci` y `pnpm build` y revisa el primer error reportado. No des por completada
la validación hasta resolverlo o documentar el bloqueo.
