# CI, publicación web y backport verificado

## Estado

El código está preparado para revisión. El backport está desactivado mientras
`BACKPORT_AUTOMATION_ENABLED` no sea `true`. No se han creado Apps, claves ni excepciones
administrativas mediante este PR. Pasar pruebas locales no demuestra una publicación real.

## CI y CD

- `ci.yml` conserva el check obligatorio **Calidad**: lint, pruebas, fallback y compilación
  de Pages. Las pruebas pequeñas de automatización se ejecutan dentro del mismo job.
- Los PRs normales no tienen checks adicionales de backport ni publicación.
- En un push a `master`, CI conserva el sitio con `upload-pages-artifact`.
- `pages.yml` (**CD · Solventa Web**) escucha solo CI · Validación terminado en master.
  Verifica por API workflow, evento push, repositorio, SHA y Calidad exitosa. Si la revisión
  ya fue superada por master, omite la publicación antes de crear un deployment.
- CD descarga el `artifact.tar` del ID de ejecución validado y lo transfiere al publicador
  oficial de Pages, sin extraerlo, instalar dependencias ni recompilar. Se conserva el
  environment `github-pages`, la URL del sitio y la configuración de producción existente.
- El nombre nuevo de CI evita que una ejecución antigua dispare el CD nuevo en la transición.
  Para recuperar un fallo de CD, reejecutar ese workflow; no seleccionar otra compilación.
  Los artefactos de Pages conservan su retención temporal: si expiraron, ejecutar CI nuevo.

## Qué puede integrarse automáticamente

Solo un PR `release/*` del mismo repositorio ya integrado en `master`, con aprobación
humana vigente y checks exitosos de su head: Calidad y validate-branch (App 15368), y
CI / Validación (Jenkins) (App 5277435).

La App crea `backport/release-pr-<número>` en el SHA integrado exacto. Se comprueban autor,
identidad numérica real del bot mediante Users API, repositorio, base, head, rama y ancestry antes de integrar.
Develop debe ser ancestro de la entrega. Conflictos, divergencia, autores distintos,
evidencia obsoleta o cambios adicionales detienen el flujo; nunca se fuerza una rama.
PRs antiguos de otros bots no se adoptan. No se duplican ni reabren PRs cerrados.

Se añade a JUANES545 como asignado sin quitar a otros. La API recibe el head SHA esperado;
una consulta corta reintenta la mergeabilidad transitoria. La API no fija el base SHA:
se relee develop y se compara el árbol resultante, pero una carrera con otro merge puede
requerir revisión posterior. No hay rollback destructivo automático.

El backport válido no solicita Jenkins ni otra aprobación. Su PR reutiliza evidencia de
la entrega. **No se usa `[skip ci]` al integrar en web**: el push a develop conserva CI y
no publica Pages. CD solo publica master. La posible omisión de CI redundante después de
un backport ya integrado queda para otro ajuste; no se relaja aquí la validación del PR.
Los hotfixes no se incluyen en esta excepción.

## Pendiente de Jazmín: configuración administrativa

1. Revisar e integrar este PR y llevar la automatización a master mediante una release
   aprobada. No activar mientras falte código confiable en develop o master.
2. Crear una App dedicada, sin webhook, instalada solo en `solventa-web-pf2`:
   Contents write, Pull requests write, Checks read y Metadata read. No reutilizar la App
   de Jenkins ni conceder Administration. Workflows write solo si una operación real lo
   requiere y tras autorización expresa.
3. Guardar privadamente la clave como `BACKPORT_APP_PRIVATE_KEY` y configurar
   `BACKPORT_APP_ID`, `BACKPORT_APP_SLUG`; mantener `BACKPORT_AUTOMATION_ENABLED=false`.
4. Guardar las protecciones actuales completas desde la cuenta propietaria. Crear dos
   rulesets activos solo para develop ANTES de retirar su protección clásica:
   - Integridad sin bypass: PR obligatorio, conversaciones resueltas, sin force-push/borrado.
   - Aprobación y CI: una aprobación, descartar obsoletas, actualización estricta y los
     checks actuales vinculados a sus Apps. Solo la App de backport tiene bypass
     Integration en modo pull_request en este segundo ruleset.
5. Comparar protecciones efectivas y conservar master sin cambios. No dejar un intervalo
   desprotegido ni añadir bypass a usuarios, administradores o roles.
6. El environment github-pages debe permitir solo master para mantener la publicación
   estable. Conservar sus otras reglas; no crear credenciales de publicación nuevas.
   Develop se habilitó durante la transición inicial de CI/CD, pero la reconciliación
   conserva la decisión del equipo de publicar solo las releases integradas en master.
7. Sincronizar los historiales divergentes con revisión humana o una release que incluya
   correctamente develop. Activar `BACKPORT_AUTOMATION_ENABLED=true` y observar una entrega
   real: identidad, omisión en el PR, integración exacta, CI posterior y Pages correctos.

GitHub concede la excepción a la App, no al nombre de una rama. La restricción a backports
exactos está en el workflow confiable de master; proteger su clave y revisar sus cambios.
El token se crea para el App ID y su clave; el slug autenticado por esa acción debe coincidir
con el configurado. Users API confirma login, tipo Bot e ID del autor. No se depende de
`performed_via_github_app`: no viene en el payload de PR y puede ser nulo en Issues API.

## GitFlow y reconciliación

`validate-branch` exige release/hotfix hacia master y feature/backport hacia develop.
La revisión de origen de un backport también exige ese check desde Actions 15368.
Si GitHub devuelve varias suites del mismo nombre/App/SHA, se valida la más reciente:
un éxito anterior no oculta una ejecución posterior pendiente o fallida.

La reconciliación incorpora el historial y el perfilamiento/consentimiento de master en
una rama feature basada en develop, conservando CI/CD separado y publicando solo master.
Se revisa por PR normal; no usa la excepción de la App, force-push ni descarte de contenido.

## Recuperación

Reejecutar **Sincronizar release con develop** desde master con `source_pr` de la release
integrada. Ante divergencia, preparar sincronización manual revisada. Desactivar el flag
detiene futuras integraciones automáticas; no cambia PRs, ramas ni publicaciones existentes.
