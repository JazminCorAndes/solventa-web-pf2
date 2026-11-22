# Jenkins web: integración privada

## Preparación para el controlador Ally (2026-11-21)

La incorporación está en preparación, **no activada ni verificada en Ally**.
El estado descrito debajo corresponde a la instalación histórica; no acredita
credenciales, jobs, plugins, protecciones o acceso de la propietaria en este controlador.
No ejecutar los scripts administrativos históricos como procedimiento de migración.

La base revisada es `ed81fe15cd06da89706cf218af0f05f19494bad1` de `develop`.
El Jenkinsfile conserva `web-ci`, Node 22.22.3, pnpm 11.19.0, instalación con
lockfile fijo, lint, Vitest/V8 con JUnit, Cypress UI completo y compilación.
Incluye ahora las pruebas de `.github/scripts/*.test.cjs` que ya ejecuta Actions;
no ejecuta publicaciones Pages ni backports. Cypress UI usa HTTP controlado y
no acredita el BFF real. No se han ejecutado estos gates durante la preparación.

La incorporación al mecanismo nativo de Android/backend requiere revisar y fijar
el pipeline confiable **fuera del control del PR**, no cargar el Jenkinsfile del
PR como código administrativo. El checkout debe ligar comentario, Run, head,
base y revisión probada; el resumen y el artefacto deben identificar el merge
probado sin atribuirlo al SHA solicitado. La publicación de
`CI / Validación (Jenkins)` y `Cobertura` necesita un único emisor administrativo,
sin statuses de respaldo ni credenciales de firma en agentes. El publicador
`publishChecks` actual no es un adaptador del mecanismo nativo nuevo.

### Contrato pendiente de `/test-jenkins` y `pr-checks`

| Elemento | Fuente existente | Requisito de incorporación nativa pendiente |
| --- | --- | --- |
| Repositorio y job | `JazminCorAndes/solventa-web-pf2`, `solventa-web/pr-checks`, hijos `PR-N`, source histórico `solventa-web-github` | Registro web desactivado y aislado; reconciliar cualquier item previo antes de escribir. No importar los IDs de backend. |
| Solicitud | `comment-policy.groovy`: cuerpo recortado exactamente `/test-jenkins`, humano con WRITE/MAINTAIN/ADMIN, comentario nuevo no editado, PR abierto del mismo repositorio hacia `develop` o `master` | Conservar destinos web y filtros; corte UTC explícitamente aprobado antes de activar. No publicar comentarios durante esta preparación. |
| Cola y revisión | El scanner histórico difiere PR ocupado y verifica `PullRequestSCMRevision.pullHash`; guarda el ID después de `scheduleBuild2` | Ligar comentario/ticket/nonce al Run y a head/base/merge; intents durables y bloqueo ante programación o publicación incierta. No declarar exactly-once desde el ledger histórico. |
| Código confiable | `WorkflowBranchProjectFactory` histórico selecciona `Jenkinsfile` del checkout | Pipeline y generador de resumen fijados por revisión administrativa, con prueba archivada del checkout y revocación del READ temporal en `finally`. No evaluar esos recursos administrativos desde el PR. |
| Informes y checks | Jenkinsfile publica `Cobertura` y archiva XML, diagnóstico Cypress y compilado por SHA; no produce `coverage-status.json` | Adaptar recursos al listener nativo: resumen conservado y marcador `schemaVersion:1`, `complete`, `failedBeforeSummary`; canonical desde resultado nativo, no SUCCESS si falta evidencia completa. Conservar UUID/conteos de Cypress y el 80 % informativo, sin umbral nuevo. |
| Autoridad | Bootstrap histórico conecta una App de carpeta y el scanner usa `Connector` | Identidad y scope web autorizados, guard privado y grants READ/CHECKS separados. El bootstrap histórico no satisface este contrato ni es un procedimiento de instalación en Ally. |

Antes de registrar o activar:

- Confirmar con la propietaria la App y la instalación web autorizadas; los IDs
  históricos de abajo no autorizan reutilizar sus claves ni credenciales.
- Preparar identidad web separada, grants READ/CHECKS acotados al repositorio,
  estado privado y guard de `credentials.xml` 0600. Si un save nativo recrea
  permisos 0644, detenerse; no corregirlo automáticamente con chmod o umask.
- Revisar el adaptador web del mecanismo nativo y sus recursos fijados. No
  copiar ni ejecutar el runtime backend, su importer o su signer para web.
  La configuración inicial debe permanecer desactivada, sin corte UTC,
  scanners, comentarios de prueba ni builds.
- Confirmar herramientas y dependencias Linux de Cypress/Xvfb en las plazas
  elegibles `web-ci`. La capacidad comunicada por coordinación es un pool
  compartido de diez plazas con un ejecutor por agente y cero en el controlador;
  no se añaden diez plazas web ni se ha comprobado aquí el runtime de ese pool.
- Coordinar por separado toda escritura, instalación, reinicio o registro en
  el controlador compartido. La ventana backend no autoriza una operación web.
  La activación y el primer Run real requieren aprobación específica.

No hay plugin web nativo compilado o instalado ni credencial reconciliada en
esta preparación. La incorporación requiere una identidad web autorizada.
Preparar fuentes no demuestra que Jenkins web esté operativo.

## Estado histórico de la instalación anterior

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
