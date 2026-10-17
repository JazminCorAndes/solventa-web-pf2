# Solventa Web

Aplicación web de Solventa para Proyecto Final II de la Universidad de los Andes.

Este repositorio contiene la base técnica de la aplicación web. El alcance funcional se
gestiona en Jira y las decisiones visuales deben seguir la versión más reciente de Figma.

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

## Comandos disponibles

| Comando              | Descripción                                           |
| -------------------- | ----------------------------------------------------- |
| `pnpm start`         | Inicia el desarrollo con adaptadores simulados        |
| `pnpm start:backend` | Inicia el desarrollo conectado al BFF local           |
| `pnpm start:aws`     | Inicia el desarrollo conectado al backend en AWS      |
| `pnpm build`         | Genera el build de producción conectado al backend    |
| `pnpm build:dev`     | Genera un build de desarrollo con mocks               |
| `pnpm build:backend` | Genera un build de desarrollo conectado al BFF local  |
| `pnpm build:aws`     | Genera un build de desarrollo conectado al API en AWS |
| `pnpm test`          | Ejecuta las pruebas en modo interactivo               |
| `pnpm test:ci`       | Ejecuta las pruebas una sola vez                      |
| `pnpm lint`          | Ejecuta ESLint                                        |
| `pnpm format`        | Formatea el código con Prettier                       |
| `pnpm format:check`  | Comprueba el formato sin modificar archivos           |

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

Las ofertas y la selección admiten `prima: { monto, moneda }` con `periodicidad`:
`mensual`, `por_viaje` o `por_vuelo`. La interfaz muestra el importe y la moneda recibidos
con el periodo correspondiente, sin convertir primas por viaje o vuelo en mensualidades.
El alias `primaMensual` puede ser nulo para primas no mensuales. Para respuestas anteriores
que no incluyan ninguno de los dos campos nuevos, se conserva la lectura de
`primaMensual` como mensual; una respuesta nueva incompleta no usa ese valor como respaldo.
Las selecciones antiguas guardadas en la pestaña se leen con ese mismo criterio.

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

La aceptación formal, siniestros, detalle de pólizas, notificaciones y recuperación de
contraseña permanecen fuera del alcance actual.

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
