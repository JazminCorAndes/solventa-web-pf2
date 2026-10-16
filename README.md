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

Este modo conecta el frontend con el BFF Web y el servicio de cotización reales. Se necesitan
los repositorios `solventa-web-pf2` y `backend-solventa`, Python 3.12 y tres terminales.

No existe fallback automático a mocks: si el backend no está disponible, la aplicación informa
el error. Para volver a los mocks, se debe detener el servidor y ejecutar `pnpm start`.

### 1. Preparar el backend

Desde la raíz de `backend-solventa`, en PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt

Get-ChildItem services -Directory |
  Where-Object { Test-Path "$($_.FullName)\pyproject.toml" } |
  ForEach-Object { python -m pip install -e "$($_.FullName)[dev]" }
```

La instalación solo es necesaria la primera vez o cuando cambien las dependencias.

### 2. Preparar y ejecutar cotización

En la primera terminal, desde `backend-solventa`:

```powershell
.\.venv\Scripts\Activate.ps1
Set-Location services\cotizacion
$env:DATABASE_URL = "sqlite:///cotizacion.db"
python -m alembic upgrade head
python -m flask --app cotizacion.app run --port 5000 --no-reload
```

El servicio de cotización quedará disponible en `http://localhost:5000`.

### 3. Configurar y ejecutar el BFF

Primero se genera un hash para la contraseña local. El comando solicita la contraseña sin
mostrarla en la terminal:

```powershell
.\.venv\Scripts\Activate.ps1
Set-Location services\bff-web
python -c "from getpass import getpass; from bff_web.infrastructure.passwords import hash_password; print(hash_password(getpass('Contraseña local: ')))"
```

En la segunda terminal, desde `backend-solventa`, se reemplaza `<HASH_GENERADO>` por el valor
obtenido y se inicia el BFF:

```powershell
.\.venv\Scripts\Activate.ps1
Set-Location services\bff-web

$env:AUTH_DEVELOPMENT_USERS_JSON = @'
[
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "nombre": "Cliente Solventa",
    "correo": "cliente@solventa.co",
    "rol": "cliente",
    "passwordHash": "<HASH_GENERADO>"
  }
]
'@

$env:SESSION_COOKIE_SECURE = "false"
$env:QUOTE_SERVICE_URL = "http://localhost:5000"
python -m flask --app bff_web.app run --port 5001 --no-reload
```

`SESSION_COOKIE_SECURE=false` se usa únicamente para desarrollo local por HTTP. En ambientes
con HTTPS debe permanecer en `true`.

### 4. Ejecutar el frontend conectado

En la tercera terminal, desde `solventa-web-pf2`:

```powershell
pnpm install --frozen-lockfile
pnpm start:backend
```

La aplicación estará disponible en `http://localhost:4200`. El proxy de desarrollo envía las
solicitudes `/api` al BFF en `http://localhost:5001`, manteniendo las cookies de sesión en el
mismo origen del frontend.

Para iniciar sesión se usa el correo configurado en
`AUTH_DEVELOPMENT_USERS_JSON` y la contraseña utilizada para generar el hash.

## Perfilamiento HU11 (SOL-163)

El formulario requiere consultar y autorizar el consentimiento antes de cotizar. La identidad
se obtiene de la cookie de sesión del BFF: no se envía `clienteId` desde el formulario.
El formulario conectado no solicita documento ni contacto: el BFF los obtiene de la sesión.
La creación envía solamente `{ productoId, datosProducto: { vehiclePlate } }`, junto con una
clave de idempotencia. La placa de la respuesta se lee de `datosProducto.vehiclePlate`.
Las primas y selecciones conservan la moneda devuelta por el BFF (COP en el backend actual),
sin convertirla ni presentarla como UF; el modo demo conserva sus valores simulados en UF.

El panel permite autorizar y revocar; envía la versión vigente, o `0` para la primera
autorización. Ante un conflicto se exige recargar antes de volver a escribir. La autorización
persiste en el backend, dura 30 días y comprende Open Finance y Open Data para cotización.

Después de crear la solicitud se consulta su perfil. El mismo panel aparece en el resumen y
en las ofertas y muestra el identificador de solicitud y perfil, score decimal, nivel,
versiones de perfil/modelo/consentimiento, fechas y fuentes. Las fuentes actuales son
**simuladas** y no representan una consulta financiera real. No se guardan perfiles en
`sessionStorage`; cada pantalla los consulta al BFF.

Las ofertas se habilitan solo tras consultar un perfil completo y vigente de esa solicitud.
Se retiran los datos al vencer el perfil, sus fuentes o el consentimiento; al recuperar el
foco de la ventana se vuelve a consultar. El backend revalida el perfil al obtener ofertas y
confirmar la selección. Revocar, renovar el consentimiento o dejar vencer el perfil puede
exigir crear una nueva solicitud: no se reemplaza silenciosamente el perfil original.
Los errores de sesión, consentimiento, concurrencia, vencimiento e indisponibilidad se
muestran sin resultados parciales ni fallback a datos antiguos.

Para comparar vigencias, el adaptador HTTP usa `Date` del servidor y un reloj monótono.
Así, un pequeño desfase del computador no rechaza datos recién creados en AWS. Se usa un
límite superior conservador (precisión de un segundo más el viaje de la petición): el panel
puede retirar datos ligeramente antes, nunca extender su vigencia. Si falta un `Date`
válido, la consulta se bloquea con un error en lugar de confiar en un reloj local desconocido.

Contratos consumidos (todos con cookie de sesión):

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

Se requieren un BFF con HU11 desplegado y un usuario de prueba habilitado. Conservar las cookies
`Secure` del servidor: iniciar Angular con HTTPS y usar un proxy local hacia AWS. Para evitar
alterar el proxy habitual, crear un archivo fuera del repositorio, por ejemplo
`C:\Temp\solventa-proxy-aws.json`:

```json
{
  "/api": {
    "target": "https://<HOST_BFF_AWS>",
    "secure": true,
    "changeOrigin": true,
    "cookieDomainRewrite": "",
    "pathRewrite": { "^/api": "" }
  }
}
```

```powershell
corepack pnpm start:backend --ssl --port 4300 --proxy-config C:\Temp\solventa-proxy-aws.json
```

Abrir `https://localhost:4300`, aceptar el certificado local de desarrollo y probar inicio de
sesión, ausencia de autorización, autorización, solicitud, perfil, ofertas y revocación.
No usar credenciales de producción ni desactivar la validación TLS del destino AWS. La URL,
credenciales de prueba y evidencia de esa integración deben confirmarse antes de publicar el PR.

## Demo en GitHub Pages

La rama `master` se publica automáticamente como una demo con adaptadores simulados:

```text
https://jazmincorandes.github.io/solventa-web-pf2/
```

GitHub Pages no ejecuta el backend Python. La demo permite recorrer la interfaz con los datos
simulados y las credenciales de desarrollo documentadas más adelante.

## Comandos disponibles

| Comando              | Descripción                                        |
| -------------------- | -------------------------------------------------- |
| `pnpm start`         | Inicia el desarrollo con adaptadores simulados     |
| `pnpm start:backend` | Inicia el desarrollo conectado al BFF              |
| `pnpm build`         | Genera el build de producción conectado al backend |
| `pnpm build:dev`     | Genera un build de desarrollo con mocks            |
| `pnpm build:backend` | Genera un build de desarrollo conectado al backend |
| `pnpm test`          | Ejecuta las pruebas en modo interactivo            |
| `pnpm test:ci`       | Ejecuta las pruebas una sola vez                   |
| `pnpm lint`          | Ejecuta ESLint                                     |
| `pnpm format`        | Formatea el código con Prettier                    |
| `pnpm format:check`  | Comprueba el formato sin modificar archivos        |

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

## Autenticación de desarrollo

En modo mock, los datos no salen del navegador y la sesión se conserva en `sessionStorage`.

En modo backend, el BFF controla la sesión con una cookie `HttpOnly`. El frontend conserva
únicamente los datos no sensibles necesarios para presentar la sesión y siempre consulta al
BFF al iniciar la aplicación.

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
