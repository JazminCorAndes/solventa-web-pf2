# Jenkins web: integración privada

## Estado

La App es **Solventa CI Web** (`solventa-ci-web`), con ID `5277435` e instalación `170369065`.
Se renombró desde `solventa-web-jenkins-jazmin` sin recrearla ni cambiar su clave.
La credencial `solventa-web-github-app` permanece en el store de carpeta `solventa-web`;
usa PEM PKCS#8. No reutilizar credenciales Android ni backend.

El multibranch **`solventa-web/pr-checks` está activo** y publica
**`CI / Validación (Jenkins)`** mediante el controlador. El scanner de comentarios y el
lifecycle del agente compartido están desplegados. Conserva los ledgers separados de
Android/backend y la supresión de builds automáticos por indexing.

Las comprobaciones y reglas actuales se describen en [la guía de CI](ci.md).
Los cambios administrativos se realizaron desde la sesión autorizada de la propietaria;
eso no cambia los permisos del token de colaboración de Juan ni requiere compartir secretos.

## Protecciones

- `develop` y `master` requieren `Calidad` de Actions (`15368`) y
  `CI / Validación (Jenkins)` de la App `5277435`.
- Una aprobación, descarte de aprobaciones obsoletas, conversaciones resueltas y rama
  actualizada. Sin bypass administrativo, force-push ni borrado de ramas protegidas.
- La migración añadió el nuevo nombre antes de quitar el anterior. No desactivar reglas
  ni aceptar resultados de otra App para resolver un bloqueo.
- Cobertura se publica dentro de los PRs que contienen esta preparación. Sigue informativa,
  sin un mínimo nuevo ni un requisito imposible para ramas que aún no generan el reporte.

## Operación y seguridad

- Un comentario humano nuevo `/test-jenkins`, sin editar y de un colaborador autorizado,
  solicita la revisión actual. No acepta bots, forks ni comandos parciales.
- Si ese PR está en cola o ejecutándose, su comentario queda pendiente. Se verifica el SHA
  antes de programar; no prometer exactly-once ante un crash entre programar y guardar el ledger.
- Cero ejecutores en el controlador y uno en el agente Linux compartido (`web-ci`).
  Se mantienen herramientas aprobadas, workspaces y credenciales aislados, y apagado por inactividad.
- Errores de lectura de cola o ejecutores no deben tratarse como inactividad.
- No webhooks públicos ni credenciales AWS en GitHub. Nunca guardar PEM/tokens en Git,
  reportes, screenshots o logs. Mantener la cuenta AWS FREE y la capacidad aprobada.

## Scripts administrativos

`infra/jenkins/configure-web.groovy` es un bootstrap: prepara el proyecto DESACTIVADO,
sin programar scans, con supresión de builds automáticos y validación de credencial/repo.
**No volver a ejecutarlo sobre la instalación activa** para cambiar un nombre.

`configure-reporting.groovy` aplica solo la supresión del status legado tras comprobar
proyecto/repo/nombre esperado. Ejecutarlo como administrador del controlador, no desde el PR.

`configure-comment-trigger.groovy` instala un timer confiable. Su configuración inicial
usa `enabled: false` y los IDs exactos; el despliegue real ya está activado. Una actualización
requiere recarga controlada, sin arrancar un segundo timer sobre el existente.

Backport automático y despliegue son procesos separados. No copiar Apps Android ni omitir
CI por un nombre `backport/*`. No aprobar o integrar PRs automáticamente ni presentar un
build correcto como evidencia de integración AWS o cumplimiento completo de una historia.
