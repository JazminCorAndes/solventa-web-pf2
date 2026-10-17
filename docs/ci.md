# Comprobaciones de la web

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
