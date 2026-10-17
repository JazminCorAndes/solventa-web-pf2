# Comprobaciones de la web

## Resultados visibles en GitHub

- **Cobertura** muestra líneas/ramas y conteos de `reports/unit-tests.xml`, sin incluir XML
  antiguos. Su enlace abre Checks en GitHub; los HTML detallados permanecen en Jenkins privado.
- **CI / Validación (Jenkins)** es el nombre nuevo. **Solventa Web Jenkins** se conserva
  temporalmente porque sigue vinculado a las protecciones existentes.
- Actions se presenta como **CI · Actions**; el contexto obligatorio `Calidad` no cambia.
- JUnit permanece en Jenkins pero deja de publicar `Tests / Declarative: Post Actions`.
- Cada build limpia su workspace antes del checkout. Un reporte ausente o inválido no se
  presenta como 0 % ni como cobertura completa; hace fallar un pipeline que iba bien.
  Un reporte parcial tras otra etapa fallida se publica como neutral, sin ocultar el fallo.

El resumen usa Python 3.10+ del agente compartido, sin paquetes nuevos. Prueba del publicador:
`python3 -m unittest discover -s scripts -p test_coverage_summary.py`.
La cobertura informa ejecución del código instrumentado, no suficiencia funcional ni despliegue.

### Migración pendiente con Jazmín

**Operación 2026-10-17:** `skipNotifications=true` ya está aplicado en los tres proyectos
del controlador, sin renombrar sus checks obligatorios y con copias privadas de respaldo.
El script de configuración web conserva ese valor para instalaciones futuras.
El scanner corregido se instaló, compiló y recargó mediante reinicio autorizado del servicio,
esperando a que terminaran los builds y la cola. Falta verificar una ejecución del SHA final;
los valores históricos no son esa evidencia. No se integró el PR ni se cambiaron protecciones.

El scanner difiere el comentario mientras su PR esté en cola o ejecutándose, sin marcarlo
procesado. Así Jenkins no agrupa solicitudes de revisiones distintas y pierde la más nueva.
Los estados ocupado/libre están probados en `infra/jenkins/test-comment-policy.groovy`.
Desplegar este ajuste requiere recarga administrativa controlada, sin builds activos;
no lanzar un segundo timer ni asumir que integrar el PR actualiza el controlador.

1. Comprobar el check nuevo en el mismo SHA, publicado por la App `5277435`.
2. Jazmín debe reemplazar el contexto obligatorio antiguo por `CI / Validación (Jenkins)`,
   conservando las demás protecciones y la vinculación a la App. No deshabilitar la regla.
3. Solo con esta preparación integrada y la nueva protección verificada, retirar el check
   automático antiguo del controlador; el Jenkinsfile mantiene el nuevo publicador explícito.
4. Un administrador puede ejecutar `infra/jenkins/configure-reporting.groovy` en el controlador
   para quitar el status legado `continuous-integration/jenkins/pr-merge`, tras comprobar
   que no sea obligatorio. No ejecutar desde el PR ni reiniciar Jenkins.
5. La propietaria puede cambiar el nombre visible de su App a **Solventa CI Web**, sin cambiar
   ID, instalación ni credenciales. `CI / Calidad (Actions)` requiere migrar `Calidad` después.

Integrar el PR no cambia automáticamente el controlador, la App ni las protecciones.

| Proceso                         | Cuándo                                             | Qué comprueba                             |
| ------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| Actions: `Calidad`              | Cada PR y push a develop/master                    | Lint, pruebas y compilación               |
| Jenkins: `Solventa Web Jenkins` | Comentario nuevo `/test-jenkins` de un colaborador | Lint, pruebas con cobertura y compilación |

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

El build de producción puede usar configuración backend, mientras GitHub Pages puede
publicar una demo mock según su workflow. Un check verde no prueba que haya un despliegue
ni que una demo esté consumiendo el backend real. No se cambian los checks obligatorios.
