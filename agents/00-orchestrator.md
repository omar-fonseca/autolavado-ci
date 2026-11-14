# Agente Orquestador

## Proposito

Coordinar las contribuciones de Frontend, Backend, Testing/QA y Docker/Jenkins alrededor de un contrato comun. `BUSINESS_RULES.md` es la fuente de verdad: leerlo antes de implementar y proponer alli cualquier cambio de contrato antes de propagarlo.

## Arquitectura objetivo

- Dos contenedores en una red interna de Docker: `app` (API Node.js y, opcionalmente, estaticos de `frontend/`) y `db` (imagen oficial `mysql:8.0`).
- La API conecta a MySQL usando el hostname de servicio `db`, puerto interno `3306`, base `autolavado_db` y las credenciales de `.env.example`.
- Publicar la API en el puerto `3000`. No exponer MySQL al host salvo necesidad explicita de desarrollo.
- No incorporar login ni autenticacion al MVP. Las rutas, campos, enums, tarifas y respuesta de verificacion permanecen como define `BUSINESS_RULES.md`.

## Flujo de trabajo de cuatro integrantes

1. Acordar tareas y leer el contrato; el orquestador asigna una rama por entrega o integrante, sin editar simultaneamente el mismo archivo cuando se pueda evitar.
2. Frontend trabaja en `frontend/` y consume la API documentada, sin redefinir el modelo ni crear backend paralelo.
3. Backend implementa la API y el esquema en `backend/`; comunica pronto cambios o bloqueos de contrato.
4. Testing/QA y Docker/Jenkins agregan pruebas, imagen, Compose y pipeline contra el endpoint de verificacion.
5. Cada integrante abre PR hacia la rama de integracion, describe archivos/contrato tocados y adjunta pruebas. Revisar CI y resolver conflictos por el propietario del archivo.
6. Integrar primero cambios de contrato/backend, despues pruebas y despliegue, y finalmente frontend; validar el conjunto con `POST /api/verify`, health y el CRUD antes de cerrar la entrega.

## Invocacion de subagentes

- Frontend: asignar `agents/02-frontend-agent.md`; pedir implementacion solo en `frontend/` y consumo literal del contrato.
- Backend: asignar `agents/01-backend-agent.md`; pedir implementacion solo en `backend/` salvo coordinacion explicita.
- Testing, Docker y Jenkins: asignar `agents/03-testing-devops-agent.md`; pedir pruebas y automatizacion sin cambiar la semantica de la API.
- Para todos: incluir `agents/BUSINESS_RULES.md`, alcance, rama/archivos autorizados y comandos de validacion en el prompt. Ante una discrepancia, detener la propagacion y elevarla al orquestador; no inventar campos o endpoints.

## Criterios de integracion

- Los servicios se resuelven por `db` dentro de Compose y el backend espera la disponibilidad de MySQL.
- Los enums y nombres de campo coinciden de extremo a extremo.
- `GET /api/health` confirma tambien conectividad a la BD.
- La verificacion de CI termina con `OPERACION_EXITOSA` y no deja datos de prueba.
- Los secretos reales permanecen fuera del repositorio.