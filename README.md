# Solventa Web

Aplicación web de Solventa para Proyecto Final II de la Universidad de los Andes.

Este repositorio contiene la base técnica de la aplicación web. El alcance funcional se gestiona en Jira y las decisiones visuales deben seguir la versión más reciente de Figma.

## Tecnologías

- Angular 22
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

La versión esperada de Node.js está declarada en `.nvmrc` y la versión de pnpm en `package.json`.

Comprueba las versiones instaladas:

```bash
node --version
pnpm --version
git --version
```

## Instalación

```bash
git clone  https://github.com/JazminCorAndes/solventa-web-pf2.git
pnpm install --frozen-lockfile
```



## Desarrollo local

```bash
pnpm start
```

La aplicación estará disponible en <http://localhost:4200>.

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `pnpm start` | Inicia el servidor de desarrollo |
| `pnpm build` | Genera el build de producción |
| `pnpm build:dev` | Genera un build de desarrollo |
| `pnpm test` | Ejecuta las pruebas en modo interactivo |
| `pnpm test:ci` | Ejecuta las pruebas una sola vez |
| `pnpm lint` | Ejecuta ESLint |
| `pnpm format` | Formatea el código con Prettier |
| `pnpm format:check` | Comprueba el formato sin modificar archivos |

## Verificación de la instalación

1. Confirma que `pnpm install --frozen-lockfile` termina correctamente.
2. Ejecuta `pnpm start` y abre <http://localhost:4200>.
3. Ejecuta `pnpm test:ci`.
4. Ejecuta `pnpm lint`.
5. Ejecuta `pnpm build`.

Registra cualquier diferencia de versiones o error y actualiza esta guía si se identifica un paso faltante.

## Estructura del repositorio

```text
public/
  assets/i18n/        Traducciones estáticas
src/
  app/
    core/i18n/        Configuración de internacionalización
    app.config.ts     Proveedores globales
    app.routes.ts     Rutas de la aplicación
  styles.scss         Estilos globales
```

## Internacionalización

Transloco está configurado con español como idioma predeterminado e inglés como idioma adicional. Las traducciones se encuentran en:

- `public/assets/i18n/es.json`
- `public/assets/i18n/en.json`

## Flujo de trabajo Git

El repositorio usa GitFlow:

- `master`: versiones estables.
- `develop`: integración del trabajo aprobado.
- `feature/*`: funcionalidades y tareas.
- `release/*`: preparación de versiones.
- `hotfix/*`: correcciones urgentes de producción.

Todo cambio compartido debe llegar mediante pull request. Las ramas `master` y `develop` requieren al menos una aprobación, conversaciones resueltas y validaciones exitosas antes de integrar cambios.

## Integración continua

GitHub Actions ejecuta en cada pull request dirigido a `master` o `develop`:

1. Instalación reproducible con el lockfile.
2. Lint.
3. Pruebas unitarias.
4. Build de producción.

## Referencias

- **Jira:** consultar el backlog y los criterios de aceptación aprobados.
- **Figma:** consultar el archivo de diseño vigente antes de implementar pantallas.
- **Backend:** la integración se documentará cuando esté implementada y validada.

## Solución de problemas

### La instalación falla
- Comprueba `node --version` y `pnpm --version`.
- Confirma que estás en la carpeta que contiene `package.json`.
- Vuelve a ejecutar `pnpm install --frozen-lockfile` y revisa el mensaje completo.

### El puerto 4200 está ocupado
Cierra el proceso que utiliza el puerto o consulta con el equipo el puerto alternativo acordado.

### Las pruebas o el build fallan
Ejecuta `pnpm test:ci` y `pnpm build` y revisa el primer error reportado. No des por completada la validación hasta resolverlo o documentar el bloqueo.