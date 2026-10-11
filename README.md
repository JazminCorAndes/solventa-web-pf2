# Solventa Web

Aplicación web de Solventa para Proyecto Final II de la Universidad de los Andes.

Este repositorio contiene únicamente la base técnica del proyecto. El alcance funcional se
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

## Requisitos

- Node.js 22.22.3 o superior
- pnpm 11.19.0
- Git

La versión esperada de Node.js está declarada en `.nvmrc` y la versión de pnpm en
`package.json`.

## Instalación

```bash
pnpm install --frozen-lockfile
```

## Desarrollo local

```bash
pnpm start
```

La aplicación estará disponible en `http://localhost:4200`.

## Comandos

| Comando             | Descripción                                 |
| ------------------- | ------------------------------------------- |
| `pnpm start`        | Inicia el servidor de desarrollo            |
| `pnpm build`        | Genera el build de producción               |
| `pnpm build:dev`    | Genera un build de desarrollo               |
| `pnpm test`         | Ejecuta las pruebas en modo interactivo     |
| `pnpm test:ci`      | Ejecuta las pruebas una sola vez            |
| `pnpm lint`         | Ejecuta ESLint                              |
| `pnpm format`       | Formatea el código con Prettier             |
| `pnpm format:check` | Comprueba el formato sin modificar archivos |

## Estructura

```text
public/
  assets/i18n/        Traducciones estáticas
src/
  app/
    core/             Autenticación, dashboard e internacionalización
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

La aplicación usa temporalmente un adaptador simulado reemplazable. No se almacenan
contraseñas y la sesión se conserva únicamente en `sessionStorage`.

Credenciales de desarrollo:

```text
Correo: cliente@solventa.co
Contraseña: Solventa123!
```

El adaptador simulado está aislado detrás de un contrato para poder sustituirlo por la API sin
reescribir el formulario, los guards ni el dashboard.

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

La aplicación incluye inicio de sesión simulado, sesión de cliente, rutas protegidas, cierre de
sesión, un dashboard y comparación de ofertas calculadas con datos simulados. El cliente puede
consultar coberturas y condiciones, seleccionar una oferta vigente y continuar hacia una
pantalla mínima de aceptación.

La selección se conserva temporalmente en `sessionStorage`. Las ofertas vencidas o retiradas
permanecen visibles para comparación, pero no se pueden seleccionar. El adaptador de ofertas
está aislado para sustituirlo posteriormente por la API real.

La aceptación formal, nuevas cotizaciones, siniestros, detalle de pólizas, notificaciones y
recuperación de contraseña permanecen fuera del alcance actual.
