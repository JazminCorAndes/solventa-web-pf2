# Jenkins web: propuesta de integración privada

## Estado

Este PR prepara el pipeline web; **no instala Jenkins, crea credenciales ni activa un job**. GitHub Actions y su check `Calidad` se conservan sin cambios. La ejecución real en Jenkins y la publicación de `Solventa Web Jenkins` siguen pendientes. No se configura despliegue/CD ni se declara autenticación backend real.

El pipeline usa los comandos existentes: instalación con lockfile, lint, pruebas Angular/Vitest en jsdom y build de producción. El reporte JUnit utiliza opciones verificadas de `ng test`. No requiere navegador ni emulador; estas pruebas no sustituyen pruebas E2E con backend. No añade cobertura o formato como nuevas condiciones obligatorias.

## Acciones de Jazmín (administradora)

Juan dispone de escritura, no de administración. Jazmín debe confirmar las reglas existentes, autorizar instalación de Apps y gestionar secretos/protecciones.

1. Instalar una GitHub App de Jenkins con acceso seleccionado solo a este repositorio: Contents/Metadata/Pull requests read y Checks/Commit statuses write. No usar una clave de backport ni ampliar por defecto la App Android.
2. Introducir su credential de App en Jenkins privadamente, preferiblemente con ámbito de carpeta. Nunca subir PEM/tokens a Git, logs o PRs.
3. Confirmar que `Calidad` de Actions es obligatorio en develop/master, con una aprobación y conversaciones resueltas. No deducir el detalle de reglas solo por el indicador de rama protegida.
4. Añadir `Solventa Web Jenkins` como obligatorio **después** de verificar un build real y su App publicadora. Hacerlo antes bloquearía los PRs sin un servicio disponible.

## Configuración del controlador, pendiente de autorización y prueba

- Multibranch separado `solventa-web` para `JazminCorAndes/solventa-web-pf2`, Jenkinsfile en la raíz, PRs abiertos de origen hacia develop/master, sin forks.
- Check principal `Solventa Web Jenkins`, asociado a la App web; no reutilizar el nombre Android.
- Cero ejecutores del controlador y un agente Linux provisionado con label `web-ci`, Node compatible con `.nvmrc` y pnpm exacto de package.json.
- Separar workspace, almacenamiento pnpm y credenciales; no montar claves del controlador en el workspace. El pipeline emplea un store local que se limpia al terminar.
- No asignar el label a un nodo existente sin inspeccionarlo y aprobarlo. No instalar herramientas mediante scripts remotos sin verificar checksums.
- Desactivar builds por indexing/eventos usando la configuración ya probada en Android; indexado solo descubre jobs.
- Adaptar el scanner confiable de comentarios para este owner/repository, App/credential y ledger separado. No copiar el initializer Android tal cual: sus nombres y repositorio están restringidos explícitamente.
- Solicitud: comentario humano nuevo, sin editar, texto completo recortado `/test-jenkins`, permiso actual WRITE/MAINTAIN/ADMIN. Verificar SHA de PR al programar, registrar IDs procesados y no aceptar bots, visitantes o forks.
- Ledger persistente por repositorio; no prometer exactly-once transaccional ante un crash entre programar y guardar.
- Sin webhooks públicos ni nuevas credenciales AWS en GitHub.

## Infraestructura y apagado por inactividad

La infraestructura Android existente no queda modificada por este PR. Si se propone compartirla, requiere aprobación previa y verificación de aislamiento/concurrencia. Mantener cuenta AWS FREE y capacidad actual salvo autorización separada.

El lifecycle Android está filtrado a `solventa-android`: no reutilizarlo para web sin adaptar y probar la detección de toda la cola y ejecutores relevantes. De lo contrario podría no arrancar el agente web o detenerlo durante trabajo de otro proyecto. Conservar timeout de build y apagado tras inactividad, nunca tratar errores de lectura como inactividad.

## Activación y evidencia

1. Revisar/integrar este PR con el CI actual y aprobación; preparar agente/App/controlador con permisos del dueño.
2. Verificar plugins, autenticación y configuración del job; indexado sin build automático.
3. Publicar un `/test-jenkins` autorizado: comprobar ledger, SHA, start del agente, lint/tests/build, JUnit y check web en GitHub.
4. Confirmar apagado por inactividad sin detener otros builds.
5. Registrar resultado real; solo entonces hacer obligatorio el check. No aprobar ni integrar PRs automáticamente.

Backport automático es una configuración separada: no copiar IDs/checks Android ni omitir CI por nombre `backport/*`. La App de backport actual permite instalación solo en JUANES545; para instalarla en JazminCorAndes deberá cambiar su política de instalación con autorización del dueño, o crear una App separada. Los checks/reglas/evidencia web deben validarse antes de activar excepciones.
