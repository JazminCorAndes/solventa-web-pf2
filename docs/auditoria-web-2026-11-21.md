# Auditoría web frente a los documentos del proyecto

Fecha: 21 de noviembre de 2026. Base web: `develop@dd550bd`.
Contratos backend consultados en remoto, sin modificarlos:
`Migue765/backend-solventa@3b9b980599e620fda78e4539a357d1cdd2e3f22c`.

## Alcance y limitación de Jira

Se contrastan el enunciado (18 páginas), el documento de arquitectura (36 páginas),
las rutas y consumidores actuales de Angular y los contratos públicos/internos del
backend. Las páginas indicadas corresponden a la numeración del PDF.

No se pudo leer el inventario ni los criterios de aceptación de los tres sprints de
SOL. El tablero requiere login Atlassian; la consulta anónima de sprints devuelve
401 y la búsqueda pública devuelve `issues: []`, que **no demuestra ausencia de
tareas**. No se certifica cobertura completa de Jira ni se cambian estados de tareas.
Las referencias SOL/HU documentadas en el repositorio y sus PR son trazabilidad
secundaria, no evidencia de cierre en Jira.

`develop` ya contiene los PR [#97](https://github.com/JazminCorAndes/solventa-web-pf2/pull/97),
[#98](https://github.com/JazminCorAndes/solventa-web-pf2/pull/98),
[#99](https://github.com/JazminCorAndes/solventa-web-pf2/pull/99),
[#100](https://github.com/JazminCorAndes/solventa-web-pf2/pull/100) y
[#101](https://github.com/JazminCorAndes/solventa-web-pf2/pull/101).
Cancelación, listado de siniestros, documento académico/aceptación simulada,
reportes operativos y conexión al Gateway no se trataron como funciones ausentes.
No se usó el checkout principal atrasado como base de comparación.

## Matriz de experiencias y capacidades

**Presente** significa consumidor web existente, no journey productivo o SLA
acreditado. **Dependencia** significa que la función completa necesita un contrato,
autorización o integración adicional; no se sustituyó por un éxito simulado.

| Requisito / fuente                                                         | Evidencia actual en web                                                                                                              | Resultado y pendiente                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cotización embebida, enunciado pp. 8-9                                     | `features/partners`, `http-partner-quote.gateway.ts`, contexto y guardas de socios, consulta de información y oferta por operación   | Presente para contratos actuales de socios. No prueba cuotas, alta de socios o disponibilidad en producción.                                                                                            |
| Suscripción y emisión, enunciado p. 8; arquitectura pp. 21-22              | `features/offers`, `features/subscriptions`, `simulated-payment.service.ts`, documento en detalle de póliza                          | Presente en alcance académico. No equivale a pago real, firma legal ni emisión posterior a firma; no se inventa un ID de póliza desde la suscripción.                                                   |
| Reporte de siniestro asistido, enunciado p. 8; arquitectura pp. 19-20      | `features/claims`, POST idempotente, listado, estado/historial y evidencias con hash                                                 | Presente para reporte y consulta cliente (SOL-175/176/177/184 según README). Evaluación, peritaje, decisión y pago operativo no tienen consumidor ni contrato autorizado de BFF Web.                    |
| Siniestro paramétrico, enunciado p. 9                                      | Detalle cliente y caso académico en `mock-claims.store.ts`                                                                           | Presente la consulta del resultado (HU31 según README). Ingreso de eventos, evaluación y pago automático pertenecen al backend; no se ejecutan desde el navegador.                                      |
| Perfilamiento/oferta hipotecaria, enunciado p. 9; arquitectura p. 31       | `/asesor/perfilamientos/nuevo`, `AdvisorProfilingService`, comprobante de operación; oferta explicable de socio en su flujo          | Presente el inicio HU46 y el flujo del socio. No hay oferta personalizada recuperable por token asesor en el contrato actual; la oferta del socio no se usa con credenciales de asesor.                 |
| Ciclo de vida, enunciado p. 9                                              | `/app/polizas`, detalle, renovación (HU33/SOL-185), modificación (HU34/SOL-186), cancelación (SOL-187), `/asesor/reportes` (SOL-188) | Presente en alcance académico. Se corrige aislamiento de navegación entre pólizas. Reportes operativos no sustituyen reportes regulatorios/reaseguradora.                                               |
| Identidad y consentimiento, enunciado pp. 12-13; arquitectura pp. 23-24    | Registro/login cifrados, roles cliente/asesor/socio, `/app/consentimiento`, perfil ligado a versión y vencimiento                    | Presente la UI y las validaciones actuales. No se acredita propagación de revocación a cachés/batch ni SLA de cinco minutos mediante pruebas unitarias.                                                 |
| Fallback gobernado, arquitectura p. 31                                     | `profileIsCurrent`, fuentes/fechas/versiones/consentimiento y `estadoFuentes`                                                        | Se añade causa legible por fuente en ES/EN; antes solo se mostraba el estado. No se introduce fallback local ni se admite perfil vencido/revocado.                                                      |
| Gestión de cliente y catálogo, arquitectura p. 11                          | Registro y datos de sesión, consulta mínima de cliente del socio; catálogo/detalle consumidos por cotización                         | Presente la lectura requerida por los flujos. No hay contrato público Web para actualizar contactos ni administrar productos/coberturas/condiciones. El diagrama no implica CRUD web para cada entidad. |
| Operación, perito, fraude, socios/acuerdos B2B, arquitectura pp. 6, 11, 13 | Portal asesor y excepciones Open Finance; contexto de socios autenticado                                                             | Cobertura parcial, no back-office completo. No se inventan roles, credenciales, permisos, comisiones, cuotas ni decisiones de fraude.                                                                   |
| Auditoría reconstruible, arquitectura p. 35                                | Detalle de perfil/consentimiento, versiones de modificación, historial cliente y excepciones con aplicación                          | Trazas específicas presentes. No hay consumidor/contrato de auditoría histórica completa para operación/cumplimiento; el perfil actual no sustituye las entradas y versiones históricas.                |
| Notificaciones, arquitectura p. 9                                          | Dashboard Web mantiene `notificaciones.disponibilidad=no_implementado`                                                               | Dependencia confirmada: API de notificaciones y preferencias pertenece al BFF móvil, no está montada en BFF Web. No se agregan avisos ficticios.                                                        |

Las capacidades particulares de móvil del enunciado p. 9 (biometría, push,
geolocalización/asistencia, offline y escaneo) no se convierten automáticamente en
tareas web pendientes.

## Brechas corregidas en esta entrega

1. El detalle leía `snapshot.paramMap` solo al construir la instancia. Al navegar
   entre dos `:policyId` con reutilización real de Angular podía conservar la póliza,
   documento y enlaces anteriores. Ahora el detalle deriva la póliza del parámetro
   observable. El panel de documento existente recibe el nuevo ID y cancela su
   contexto anterior; un ID no disponible retira documento y acciones.
2. Renovación y modificación observaban el parámetro, pero sus peticiones anteriores
   seguían activas. Ahora cambiar de póliza cancela suscripciones de lectura,
   simulación y confirmación, limpia aceptación/propuesta/impacto/resultado y evita
   que una respuesta anterior reaparezca en el nuevo contexto. Cancelar una
   suscripción HTTP **no cancela una operación recibida por backend**: se conservan
   las claves de recuperación de renovación, y las de modificación se separan por
   póliza dentro de la instancia. No se altera la persistencia de estos contratos.
   La cancelación ya tenía aislamiento por cliente/póliza y se conserva.
3. Las causas de degradación enviadas en `estadoFuentes.motivo` no se mostraban.
   Se traducen únicamente los códigos conocidos que emite `fuentes.py` /
   `resilience.py` en el backend consultado. Texto arbitrario, datos personales,
   códigos desconocidos o causa ausente producen un aviso explícito sin publicar
   ese texto. Se conserva la distinción entre caché y valor predeterminado y el
   carácter simulado de las fuentes.

## Dependencias verificadas en el backend

La revisión corresponde a `contracts/openapi/bff-web-v1.yaml` y los blueprints
montados en `services/bff-web/src/bff_web/app.py`, no a un despliegue confirmado.

| Capacidad pendiente                                        | Evidencia del contrato remoto                                                                                                                                      | Qué falta para una implementación web                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Evaluar/decidir/asignar perito/pagar siniestros            | `evaluacion-siniestros-internal-v1.yaml`, `siniestros-decisiones-internal-v1.yaml`, `indemnizaciones-internal-v1.yaml` usan `internalToken`, no JWT de usuario Web | Proyección pública BFF Web, roles/alcances y operación humana autorizada. Nunca exponer token interno en Angular.    |
| Reportes regulatorios y reaseguradora                      | BFF Web ofrece solo `/v1/reportes/operativos`, `/descarga`, `/opciones`; contrato interno agrega pólizas, primas y siniestros al corte                             | Contrato de contenido/formato, autorización y destino; los CSV operativos no acreditan reportes ACORD/regulatorios.  |
| Oferta hipotecaria de asesor                               | `/v1/perfilamientos-hipotecarios` devuelve referencias; oferta `/v1/socios/solicitudes-cotizacion/{operationId}/oferta` requiere contexto de socio                 | Recuperación/oferta para asesor, con explicación autoritativa y permiso de su operación.                             |
| Notificaciones web                                         | `bff-movil-v1.yaml` referencia `/v1/notificaciones` y preferencias; BFF Web no monta esas rutas y dashboard mantiene `no_implementado`                             | Contrato y autorización para el canal web; no cambiar el destino al BFF móvil de forma implícita.                    |
| Gestión de contactos, socios/acuerdos y auditoría completa | Catálogo de rutas BFF Web tiene registro, sesión, consultas y flujos descritos; no expone administración ni auditoría histórica completa                           | Endpoints públicos, esquemas, permisos y criterios de alcance. No implica que esos dominios no existan internamente. |

Para confirmar el pendiente exacto de los tres sprints aún se necesita exportación
Jira autenticada (clave, sprint, estado, descripción y criterios de aceptación) y
contraste con las entregas integradas. No se asignan claves Jira nuevas a estas
correcciones por inferencia.

## Evidencia de validación

Se ejecutan pruebas dirigidas de pólizas y perfilamiento, lint de los archivos
afectados y compilación de producción: 164 pruebas en 9 archivos pasan. Las regresiones incluyen reutilización real
de ruta con `RouterTestingHarness`, cancelación de HTTP pendiente y conservación
de claves al volver a la póliza, causas ausentes/texto sensible y traducción EN.

```powershell
pnpm.cmd exec ng test --watch=false "--include=src/app/features/policies/*.spec.ts" "--include=src/app/shared/profiling/profiling-panel*.spec.ts"
pnpm.cmd build
```

Esto no acredita los objetivos de latencia/carga, RTO/RPO, durabilidad backend,
propagación de consentimiento, firma/pagos reales ni recorridos en AWS/Pages del
enunciado pp. 11-14 y los ASR. No se fusiona ni despliega esta entrega.
