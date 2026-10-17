# Comprobaciones de la web

## Resultados visibles en GitHub

- **Cobertura** muestra líneas/ramas y conteos de `reports/unit-tests.xml`, sin incluir XML
  antiguos. Su enlace abre Checks en GitHub; los HTML detallados permanecen en Jenkins privado.
- **CI / Validación (Jenkins)** es el check principal obligatorio, publicado automáticamente
  por el controlador. No depende de que cada rama incluya un publicador dentro del Jenkinsfile.
- El workflow del PR define **CI · Actions**; GitHub puede mostrar todavía el nombre de
  la rama predeterminada hasta integrarlo. El contexto obligatorio `Calidad` no cambia.
- JUnit permanece en Jenkins pero deja de publicar `Tests / Declarative: Post Actions`.
- Cada build limpia su workspace antes del checkout. Un reporte ausente o inválido no se
  presenta como 0 % ni como cobertura completa; hace fallar un pipeline que iba bien.
  Un reporte parcial tras otra etapa fallida se publica como neutral, sin ocultar el fallo.

El resumen usa Python 3.10+ del agente compartido, sin paquetes nuevos. Prueba del publicador:
`python3 -m unittest discover -s scripts -p test_coverage_summary.py`.
La cobertura informa ejecución del código instrumentado, no suficiencia funcional ni despliegue.

### Configuración administrativa verificada

**Operación 2026-10-17:** la App se renombró a **Solventa CI Web** (slug `solventa-ci-web`),
conservando ID `5277435`, instalación `170369065` y credencial `solventa-web-github-app`.
En `develop` (regla `84505707`) y `master` (regla `84505704`) se sustituyó el contexto
`Solventa Web Jenkins` por `CI / Validación (Jenkins)`, vinculado a esa misma App.
Primero se añadió el nuevo requisito, después se cambió el publicador del controlador
y por último se retiró el anterior. Actions `Calidad` sigue vinculado a la App `15368`.

Se conservaron una aprobación, descarte de aprobaciones obsoletas, actualización estricta,
conversaciones resueltas y aplicación a administradores, sin permitir force-push ni borrado.
El cambio de nombre del publicador se aplica también a ramas con Jenkinsfiles anteriores;
no es necesario integrar este PR para que Jenkins publique el nuevo contexto principal.

`Cobertura` permanece informativa: no se exige un porcentaje mínimo ni se hace obligatorio
un reporte que las ramas antiguas todavía no generan. Su incorporación al código sigue
en este PR, pendiente de revisión e integración normal, sin aprobar ni integrar automáticamente.

El scanner difiere el comentario mientras su PR esté en cola o ejecutándose, sin marcarlo
procesado. Así Jenkins no agrupa solicitudes de revisiones distintas y pierde la más nueva.
Los estados ocupado/libre están probados en `infra/jenkins/test-comment-policy.groovy`.
La corrección ya está instalada y fue recargada de forma controlada, sin interrumpir builds.
No lanzar un segundo timer ni asumir que integrar el PR actualiza el controlador.

`skipNotifications=true` elimina el status legado `continuous-integration/jenkins/pr-merge`.
JUnit queda en Jenkins sin publicar un check duplicado. El Jenkinsfile publica solo
**Cobertura**; el controlador publica el resultado global, sin dos emisores para el mismo check.
Los scripts de configuración conservan estos nombres y flags; no ejecutar el bootstrap
`configure-web.groovy` sobre la instalación activa, pues prepara el proyecto desactivado.

El contexto de Actions `Calidad` no se renombra todavía: exige migrar su job y las reglas
en conjunto. No recrear Apps, cambiar credenciales ni desactivar protecciones para renombrarlo.

Integrar el PR no cambia automáticamente el controlador, la App ni las protecciones.

| Proceso                              | Cuándo                                             | Qué comprueba                             |
| ------------------------------------ | -------------------------------------------------- | ----------------------------------------- |
| Actions: `Calidad`                   | Cada PR y push a develop/master                    | Lint, pruebas y compilación               |
| Jenkins: `CI / Validación (Jenkins)` | Comentario nuevo `/test-jenkins` de un colaborador | Lint, pruebas con cobertura y compilación |

Después de nuevos commits, solicitar Jenkins otra vez. La aprobación del equipo es
independiente. No repetir comentarios si ya hay un build en cola para el mismo commit.
El agente tiene un ejecutor compartido con Android y backend: esperar en cola no es un fallo.

## Leer Jenkins

Etapas: Código → Herramientas → Dependencias → Lint → Pruebas y cobertura → Compilación.
La etapa roja identifica el fallo. Los reportes disponibles se conservan incluso si falla
una prueba o compilación.

- **Tests**: resultados JUnit de Vitest.
- **Artifacts → coverage/solventa-web-pf2/**: HTML y `cobertura-coverage.xml`.
  Descargar el directorio completo para abrir `index.html` si Jenkins restringe scripts.
- La consola muestra porcentajes de líneas, sentencias, funciones y ramas. No se añade
  un porcentaje mínimo obligatorio: primero se establece una línea base revisable.
- Comando local: `pnpm test:coverage`. Usa los mismos tests de `pnpm test:ci`, con V8
  y reportes adicionales. No introduce un segundo conjunto de pruebas.
- La cobertura corresponde al código instrumentado por Angular/Vitest y no demuestra
  integración AWS, navegación E2E o cumplimiento completo de las historias.

Actions valida también `pnpm test:pages` y `pnpm build:pages` en los PRs, sin publicar.
El workflow separado `pages.yml` publica únicamente tras un push a `develop`, usando
producción con backend AWS y la subruta `/solventa-web-pf2/`. El environment `github-pages`
debe permitir esa rama: su política consultada el 17 de octubre de 2026 solo admitía
`master`, por lo que requiere autorización administrativa antes del despliegue.
No se cambia esa protección desde el workflow. El detalle del fallback `404.html` y sus
limitaciones está en el README.

Un check verde no prueba que haya un despliegue ni conectividad con el backend real.
La cobertura se consulta dentro del PR, no como un porcentaje fijo o un servicio
adicional en la portada del repositorio.
